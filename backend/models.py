import enum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    Enum,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    TIMESTAMP,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


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
    notifications = relationship("Notification", back_populates="recipient")


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(Enum(ItemStatus), nullable=False)
    category = Column(String(50), nullable=False, index=True)
    location = Column(String(150), nullable=False, index=True)
    date_reported = Column(Date, nullable=False, index=True)
    image_url = Column(String(255), nullable=True)
    photo_data = Column(LargeBinary, nullable=True)
    photo_content_type = Column(String(100), nullable=True)
    verification_status = Column(String(16), nullable=False, default="pending")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_resolved = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    owner = relationship("User", back_populates="items")
    claims = relationship("Claim", back_populates="item")
    notifications = relationship(
        "Notification",
        back_populates="item",
        foreign_keys="Notification.item_id",
    )


class Claim(Base):
    __tablename__ = "claims"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    proof_description = Column(Text, nullable=False)
    status = Column(Enum(ClaimStatus), default=ClaimStatus.pending, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    item = relationship("Item", back_populates="claims")
    claimant = relationship("User", back_populates="claims")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        UniqueConstraint(
            "recipient_id",
            "item_id",
            "matched_item_id",
            "kind",
            name="uq_notification_match",
        ),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    matched_item_id = Column(Integer, ForeignKey("items.id"), nullable=True)
    kind = Column(String(32), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.current_timestamp())

    recipient = relationship("User", back_populates="notifications")
    item = relationship(
        "Item",
        back_populates="notifications",
        foreign_keys=[item_id],
    )
