from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional, List
from .models import ItemStatus, ClaimStatus

# --- User Schemas ---
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    phone: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Item Schemas ---
class ItemCreate(BaseModel):
    title: str
    description: str
    status: ItemStatus
    category: str
    location: str
    date_reported: date
    image_url: Optional[str] = None

class ItemResponse(ItemCreate):
    id: int
    user_id: int
    is_resolved: bool
    created_at: datetime
    owner: UserResponse

    class Config:
        from_attributes = True

# --- Claim Schemas ---
class ClaimCreate(BaseModel):
    proof_description: str

class ClaimResponse(BaseModel):
    id: int
    item_id: int
    user_id: int
    proof_description: str
    status: ClaimStatus
    created_at: datetime
    claimant: UserResponse

    class Config:
        from_attributes = True
