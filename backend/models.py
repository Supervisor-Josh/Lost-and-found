from sqlalchemy import Column, Integer, String, Text, Boolean, Date, Enum, ForeignKey, TIMESTAMP
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base
import enum

class ItemStatus(str, enum.Enum):
    lost = "lost"
    found = "found"

class ClaimStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    phone = Column(String(20), nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    items = relationship("Item", back_populates="owner")
    claims = relationship("Claim", back_populates="claimant")

class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(Enum(ItemStatus), nullable=False)
    category = Column(String(50), nullable=False)
    location = Column(String(150), nullable=False)
    date_reported = Column(Date, nullable=False)
    image_url = Column(String(255), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    owner = relationship("User", back_populates="items")
    claims = relationship("Claim", back_populates="item")

class Claim(Base):
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    proof_description = Column(Text, nullable=False)
    status = Column(Enum(ClaimStatus), default=ClaimStatus.pending)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    item = relationship("Item", back_populates="claims")
    claimant = relationship("User", back_populates="claims")
