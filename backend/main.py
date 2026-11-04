import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import date
from typing import List, Optional

from fastapi import (
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

# Optional dotenv support for local development
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from . import models, schemas
from .database import Base, engine, get_db


def initialize_database():
    try:
        with engine.begin() as connection:
            inspector = inspect(connection)
            if "items" in inspector.get_table_names():
                columns = {
                    column["name"] for column in inspector.get_columns("items")
                }
                if engine.dialect.name == "sqlite":
                    migrations = {
                        "verification_status": (
                            "ALTER TABLE items ADD COLUMN verification_status "
                            "VARCHAR(16) NOT NULL DEFAULT 'pending'"
                        ),
                        "photo_data": "ALTER TABLE items ADD COLUMN photo_data BLOB",
                        "photo_content_type": (
                            "ALTER TABLE items ADD COLUMN photo_content_type VARCHAR(100)"
                        ),
                    }
                    for name, statement in migrations.items():
                        if name not in columns:
                            connection.exec_driver_sql(statement)
    except Exception:
        pass
    Base.metadata.create_all(bind=engine)


initialize_database()

is_production = os.getenv("ENVIRONMENT", "").lower() == "production"
enable_docs = os.getenv("ENABLE_DOCS", "true" if not is_production else "false").lower() in ("true", "1", "yes")

app = FastAPI(
    title="Campus Finds API",
    version="2.0.0",
    description="Campus Finds — University Lost & Found reporting and moderation API",
    docs_url="/docs" if enable_docs else None,
    redoc_url="/redoc" if enable_docs else None,
)

# Configure CORS origins
allowed_origins_raw = os.getenv(
    "LOST_FOUND_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
)
allowed_origins = [
    origin.strip().rstrip("/")
    for origin in allowed_origins_raw.split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


bearer_scheme = HTTPBearer(auto_error=False)
AUTH_TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7
MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}
STOP_WORDS = {
    "a", "an", "and", "at", "by", "for", "from", "in", "is", "it",
    "of", "on", "or", "the", "to", "with",
}


def get_password_hash(password: str) -> str:
    hashed_password = bcrypt.hashpw(
        password.encode("utf-8")[:72],
        bcrypt.gensalt(),
    )
    return hashed_password.decode("ascii")


def _auth_secret() -> bytes:
    secret = os.getenv("LOST_FOUND_AUTH_SECRET")
    if not secret or len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Authentication is not configured. Set "
                "LOST_FOUND_AUTH_SECRET to a secret of at least 32 characters."
            ),
        )
    return secret.encode("utf-8")


def _encode_token(user_id: int) -> str:
    payload = {
        "sub": user_id,
        "exp": int(time.time()) + AUTH_TOKEN_LIFETIME_SECONDS,
        "jti": secrets.token_urlsafe(16),
    }
    encoded_payload = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).rstrip(b"=")
    signature = hmac.new(
        _auth_secret(),
        encoded_payload,
        hashlib.sha256,
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=")
    return f"{encoded_payload.decode('ascii')}.{encoded_signature.decode('ascii')}"


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload_part, signature_part = credentials.credentials.split(".", maxsplit=1)
        expected_signature = hmac.new(
            _auth_secret(),
            payload_part.encode("ascii"),
            hashlib.sha256,
        ).digest()
        provided_signature = base64.urlsafe_b64decode(
            signature_part + "=" * (-len(signature_part) % 4)
        )
        if not hmac.compare_digest(expected_signature, provided_signature):
            raise ValueError("Invalid token signature")
        payload = json.loads(
            base64.urlsafe_b64decode(
                payload_part + "=" * (-len(payload_part) % 4)
            )
        )
        user_id = int(payload["sub"])
        if int(payload["exp"]) <= int(time.time()):
            raise ValueError("Expired token")
    except HTTPException:
        raise
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session is invalid or expired. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account not found. Sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_admin(x_admin_key: Optional[str] = Header(default=None)) -> None:
    expected_key = os.getenv("LOST_FOUND_ADMIN_KEY")
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin access is not configured on the backend.",
        )
    if not x_admin_key or not hmac.compare_digest(x_admin_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A valid admin key is required.",
        )


def _tokens(item: models.Item) -> set[str]:
    words = re.findall(r"[a-z0-9]+", f"{item.title} {item.description}".lower())
    return {word for word in words if len(word) > 2 and word not in STOP_WORDS}


def _is_likely_match(first: models.Item, second: models.Item) -> bool:
    if first.status == second.status:
        return False
    if first.category.strip().casefold() != second.category.strip().casefold():
        return False
    shared_words = _tokens(first) & _tokens(second)
    return len(shared_words) >= 2 or (
        len(shared_words) == 1
        and bool(
            shared_words.intersection(
                set(re.findall(r"[a-z0-9]+", first.title.lower()))
            )
        )
    )


def _notify_match(db: Session, item: models.Item) -> None:
    candidates = (
        db.query(models.Item)
        .options(joinedload(models.Item.owner))
        .filter(
            models.Item.id != item.id,
            models.Item.status != item.status,
            models.Item.verification_status == "approved",
            models.Item.is_resolved.is_(False),
        )
        .all()
    )
    for candidate in candidates:
        if not _is_likely_match(item, candidate):
            continue
        for recipient_item, matched_item in (
            (item, candidate),
            (candidate, item),
        ):
            if recipient_item.user_id == matched_item.user_id:
                continue
            exists = (
                db.query(models.Notification.id)
                .filter_by(
                    recipient_id=recipient_item.user_id,
                    item_id=recipient_item.id,
                    matched_item_id=matched_item.id,
                    kind="match",
                )
                .first()
            )
            if not exists:
                db.add(
                    models.Notification(
                        recipient_id=recipient_item.user_id,
                        item_id=recipient_item.id,
                        matched_item_id=matched_item.id,
                        kind="match",
                        message=(
                            f"Possible match: “{matched_item.title}” "
                            f"({matched_item.status.value}) reported near "
                            f"{matched_item.location}."
                        ),
                    )
                )


def _photo_response(item: models.Item) -> Response:
    if not item.photo_data or not item.photo_content_type:
        raise HTTPException(status_code=404, detail="No photo is available.")
    return Response(
        content=item.photo_data,
        media_type=item.photo_content_type,
        headers={"Cache-Control": "private, max-age=300"},
    )


# --- System & Health Endpoints ---
@app.get("/", tags=["System"])
def read_root():
    return {
        "name": "Campus Finds API",
        "version": "2.0.0",
        "status": "online",
        "docs": "/docs" if enable_docs else "disabled",
    }


@app.get("/health", tags=["System"])
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "environment": os.getenv("ENVIRONMENT", "development"),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database readiness check failed: {str(exc)}",
        )


# --- User & Auth Endpoints ---
@app.post(
    "/users/",
    response_model=schemas.AuthResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Auth"],
)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    _auth_secret()
    db_user = models.User(
        name=user.name,
        email=user.email.lower(),
        phone=user.phone,
        password_hash=get_password_hash(user.password),
    )
    db.add(db_user)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        ) from error
    db.refresh(db_user)
    return schemas.AuthResponse(
        access_token=_encode_token(db_user.id),
        user=db_user,
    )


@app.post("/auth/login", response_model=schemas.AuthResponse, tags=["Auth"])
def login(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    _auth_secret()
    user = (
        db.query(models.User)
        .filter(models.User.email == credentials.email.lower())
        .first()
    )
    password = credentials.password.encode("utf-8")[:72]
    try:
        password_matches = user is not None and bcrypt.checkpw(
            password,
            user.password_hash.encode("ascii"),
        )
    except ValueError:
        password_matches = False
    if not password_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return schemas.AuthResponse(access_token=_encode_token(user.id), user=user)


# --- Item Endpoints ---
@app.post(
    "/items/",
    response_model=schemas.ItemResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Items"],
)
def report_item(
    item: schemas.ItemCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    new_item = models.Item(**item.model_dump(), user_id=user.id)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item


@app.post(
    "/items/{item_id}/photo",
    response_model=schemas.ItemResponse,
    status_code=status.HTTP_200_OK,
    tags=["Items"],
)
async def upload_item_photo(
    item_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the reporter can add a photo.")
    if photo.content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(
            status_code=415,
            detail="Upload a JPEG, PNG, or WebP image.",
        )

    photo_data = await photo.read(MAX_PHOTO_BYTES + 1)
    if len(photo_data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="The photo must be 5 MB or smaller.")
    signature = ALLOWED_PHOTO_TYPES[photo.content_type][0]
    if not photo_data.startswith(signature):
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid image.")
    if photo.content_type == "image/webp" and photo_data[8:12] != b"WEBP":
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid WebP image.")

    item.photo_data = photo_data
    item.photo_content_type = photo.content_type
    item.image_url = f"/items/{item.id}/photo"
    db.commit()
    db.refresh(item)
    return item


@app.get("/items/", response_model=List[schemas.ItemResponse], tags=["Items"])
def get_items(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    status: Optional[models.ItemStatus] = Query(default=None),
    category: Optional[str] = None,
    q: Optional[str] = None,
    location: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    offset_val = skip if isinstance(skip, int) else getattr(skip, "default", 0)
    limit_val = limit if isinstance(limit, int) else getattr(limit, "default", 50)
    status_val = status if isinstance(status, (models.ItemStatus, str)) else None

    query = (
        db.query(models.Item)
        .options(joinedload(models.Item.owner))
        .filter(models.Item.verification_status == "approved")
    )
    if status_val:
        query = query.filter(models.Item.status == status_val)
    if category and isinstance(category, str):
        query = query.filter(models.Item.category.ilike(category.strip()))
    if q and isinstance(q, str):
        search = f"%{q.strip()}%"
        query = query.filter(
            models.Item.title.ilike(search)
            | models.Item.description.ilike(search)
        )
    if location and isinstance(location, str):
        query = query.filter(models.Item.location.ilike(f"%{location.strip()}%"))
    if date_from and isinstance(date_from, date):
        query = query.filter(models.Item.date_reported >= date_from)
    if date_to and isinstance(date_to, date):
        query = query.filter(models.Item.date_reported <= date_to)
    return (
        query.order_by(
            models.Item.date_reported.desc(),
            models.Item.id.desc(),
        )
        .offset(offset_val)
        .limit(limit_val)
        .all()
    )


@app.get("/items/{item_id}", response_model=schemas.ItemResponse, tags=["Items"])
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = (
        db.query(models.Item)
        .options(joinedload(models.Item.owner))
        .filter(
            models.Item.id == item_id,
            models.Item.verification_status == "approved",
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@app.get("/items/{item_id}/photo", tags=["Items"])
def get_item_photo(item_id: int, db: Session = Depends(get_db)):
    item = (
        db.query(models.Item)
        .filter(
            models.Item.id == item_id,
            models.Item.verification_status == "approved",
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _photo_response(item)


# --- Claim Endpoints ---
@app.post(
    "/items/{item_id}/claims/",
    response_model=schemas.ClaimResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Claims"],
)
def create_claim(
    item_id: int,
    claim: schemas.ClaimCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item or item.verification_status != "approved":
        raise HTTPException(status_code=404, detail="Verified item not found")
    if item.status != models.ItemStatus.found or item.is_resolved:
        raise HTTPException(status_code=409, detail="This item is not available to claim.")
    if item.user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot claim your own report.")

    existing_claim = (
        db.query(models.Claim)
        .filter(
            models.Claim.item_id == item_id,
            models.Claim.user_id == user.id,
            models.Claim.status != models.ClaimStatus.rejected,
        )
        .first()
    )
    if existing_claim:
        raise HTTPException(status_code=409, detail="You already have an active claim.")

    new_claim = models.Claim(
        item_id=item_id,
        user_id=user.id,
        proof_description=claim.proof_description,
    )
    db.add(new_claim)
    db.add(
        models.Notification(
            recipient_id=item.user_id,
            item_id=item.id,
            kind="claim",
            message=f"{user.name} submitted a claim for “{item.title}”.",
        )
    )
    db.commit()
    db.refresh(new_claim)
    return new_claim


# --- Notification Endpoints ---
@app.get(
    "/users/{user_id}/notifications/",
    response_model=List[schemas.NotificationResponse],
    tags=["Notifications"],
)
def get_notifications(
    user_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only view your own notifications.")
    return (
        db.query(models.Notification)
        .filter(models.Notification.recipient_id == user_id)
        .order_by(models.Notification.created_at.desc(), models.Notification.id.desc())
        .limit(100)
        .all()
    )


@app.patch(
    "/users/{user_id}/notifications/{notification_id}/read",
    tags=["Notifications"],
)
def mark_notification_read(
    user_id: int,
    notification_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    if user_id != user.id:
        raise HTTPException(status_code=403, detail="You can only update your own notifications.")
    notification = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.recipient_id == user_id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}


# --- Admin Endpoints ---
@app.get(
    "/admin/items/",
    response_model=List[schemas.ItemResponse],
    dependencies=[Depends(require_admin)],
    tags=["Admin"],
)
def get_items_for_review(
    verification_status: str = "pending",
    db: Session = Depends(get_db),
):
    if verification_status not in {"pending", "approved", "rejected"}:
        raise HTTPException(status_code=400, detail="Invalid verification status.")
    return (
        db.query(models.Item)
        .options(joinedload(models.Item.owner))
        .filter(models.Item.verification_status == verification_status)
        .order_by(models.Item.created_at.asc())
        .limit(100)
        .all()
    )


@app.get(
    "/admin/items/{item_id}/photo",
    dependencies=[Depends(require_admin)],
    tags=["Admin"],
)
def get_item_photo_for_review(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return _photo_response(item)


@app.patch(
    "/admin/items/{item_id}/verification",
    response_model=schemas.ItemResponse,
    dependencies=[Depends(require_admin)],
    tags=["Admin"],
)
def review_item(
    item_id: int,
    review: schemas.VerificationReview,
    db: Session = Depends(get_db),
):
    item = (
        db.query(models.Item)
        .options(joinedload(models.Item.owner))
        .filter(models.Item.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.verification_status = review.status
    if review.status == "approved":
        db.flush()
        _notify_match(db, item)
    db.commit()
    db.refresh(item)
    return item


@app.get(
    "/admin/claims/",
    response_model=List[schemas.ClaimResponse],
    dependencies=[Depends(require_admin)],
    tags=["Admin"],
)
def get_claims_for_review(db: Session = Depends(get_db)):
    return (
        db.query(models.Claim)
        .options(joinedload(models.Claim.claimant))
        .filter(models.Claim.status == models.ClaimStatus.pending)
        .order_by(models.Claim.created_at.asc())
        .limit(100)
        .all()
    )


@app.patch(
    "/admin/claims/{claim_id}",
    response_model=schemas.ClaimResponse,
    dependencies=[Depends(require_admin)],
    tags=["Admin"],
)
def review_claim(
    claim_id: int,
    review: schemas.ClaimReview,
    db: Session = Depends(get_db),
):
    claim = (
        db.query(models.Claim)
        .options(joinedload(models.Claim.claimant), joinedload(models.Claim.item))
        .filter(models.Claim.id == claim_id)
        .first()
    )
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if claim.status != models.ClaimStatus.pending:
        raise HTTPException(status_code=409, detail="This claim has already been reviewed.")

    claim.status = review.status
    if review.status == models.ClaimStatus.approved:
        claim.item.is_resolved = True
    db.add(
        models.Notification(
            recipient_id=claim.user_id,
            item_id=claim.item_id,
            kind="claim_review",
            message=(
                f"Your claim for “{claim.item.title}” was "
                f"{review.status.value}."
            ),
        )
    )
    db.commit()
    db.refresh(claim)
    return claim
