from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from passlib.context import CryptContext
import database
from . import models, schemas
from .database import engine, get_db

# Create database tables automatically
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Lost and Found API", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Update your password hashing function in backend/main.py to look like this:
def get_password_hash(password: str):
    # Bcrypt has a strict 72-byte limit
    return pwd_context.hash(password[:72])
# --- Root Endpoint ---
@app.get("/")
def read_root():
    return {"message": "Welcome to the Lost and Found API"}

# --- User Endpoints ---
from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
# ... (keep your existing imports, database, models, and schemas)

@app.post("/users/", status_code=status.HTTP_201_CREATED)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    try:
        # Safely hash password (truncating to 72 bytes for bcrypt safety)
        hashed_password = get_password_hash(user.password[:72])
        
        db_user = models.User(
            name=user.name,
            email=user.email,
            phone=user.phone,
            hashed_password=hashed_password
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="An account with this email address already exists."
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
# --- Item Endpoints ---
@app.post("/items/", response_model=schemas.ItemResponse, status_code=status.HTTP_201_CREATED)
def report_item(item: schemas.ItemCreate, user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_item = models.Item(**item.dict(), user_id=user_id)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@app.get("/items/", response_model=List[schemas.ItemResponse])
def get_items(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    items = db.query(models.Item).offset(skip).limit(limit).all()
    return items

@app.get("/items/{item_id}", response_model=schemas.ItemResponse)
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

# --- Claim Endpoints ---
@app.post("/items/{item_id}/claims/", response_model=schemas.ClaimResponse, status_code=status.HTTP_201_CREATED)
def create_claim(item_id: int, claim: schemas.ClaimCreate, user_id: int, db: Session = Depends(get_db)):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_claim = models.Claim(
        item_id=item_id,
        user_id=user_id,
        proof_description=claim.proof_description
    )
    db.add(new_claim)
    db.commit()
    db.refresh(new_claim)
    return new_claim
