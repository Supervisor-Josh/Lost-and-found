from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import ClaimStatus, ItemStatus


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str = Field(min_length=8, max_length=256)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    phone: str
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ItemCreate(BaseModel):
    title: str
    description: str
    status: ItemStatus
    category: str
    location: str
    date_reported: date
    image_url: Optional[str] = None


class ItemResponse(ItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    is_resolved: bool
    verification_status: str
    created_at: datetime
    owner: UserResponse


class ClaimCreate(BaseModel):
    proof_description: str


class ClaimReview(BaseModel):
    status: ClaimStatus


class VerificationReview(BaseModel):
    status: Literal["approved", "rejected"]


class ClaimResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    user_id: int
    proof_description: str
    status: ClaimStatus
    created_at: datetime
    claimant: UserResponse


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recipient_id: int
    item_id: int
    matched_item_id: Optional[int]
    kind: str
    message: str
    is_read: bool
    created_at: datetime
