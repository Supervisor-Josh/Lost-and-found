from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
import bcrypt


# Import local backend modules relative to this file
from . import database, models, schemas

# Create database tables automatically
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Lost and Found API", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import bcrypt

def get_password_hash(password: str):
    # Truncate to 72 bytes max for bcrypt safety, encode to bytes, and hash
    pwd_bytes = password[:72].encode('utf-8')
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str):
    return bcrypt.checkpw(plain_password[:72].encode('utf-8'), hashed_password.encode('utf-8'))
# --- Root Endpoint ---
@app.get("/")
def read_root():
    return {"message": "Welcome to the Lost and Found API"}

# --- User Endpoints ---
@app.post("/users", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    try:
        # Safely hash password (truncating to 72 bytes for bcrypt safety)
        hashed_password = get_password_hash(user.password[:72])
        
        db_user = models.User(
            name=user.name,
            email=user.email,
            phone=user.phone,
            password_hash=hashed_password
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

# Add this missing route so the frontend can fetch user profiles successfully
@app.get("/users/{user_id}", response_model=schemas.UserResponse)
def get_user(user_id: int, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
# --- Item Endpoints ---
@app.post("/items", response_model=schemas.ItemResponse, status_code=status.HTTP_201_CREATED)
def report_item(item: schemas.ItemCreate, user_id: int, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # .model_dump() is the correct Pydantic v2 method
    new_item = models.Item(**item.model_dump(), user_id=user_id)
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@app.get("/items", response_model=List[schemas.ItemResponse])
def get_items(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    items = db.query(models.Item).offset(skip).limit(limit).all()
    return items

@app.get("/items/{item_id}", response_model=schemas.ItemResponse)
def get_item(item_id: int, db: Session = Depends(database.get_db)):
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

# --- Claim Endpoints ---
@app.post("/items/{item_id}/claims/", response_model=schemas.ClaimResponse, status_code=status.HTTP_201_CREATED)
def create_claim(item_id: int, claim: schemas.ClaimCreate, user_id: int, db: Session = Depends(database.get_db)):
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