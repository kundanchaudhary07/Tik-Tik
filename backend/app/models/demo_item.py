from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class DemoItem(Base):
    """
    Educational resource model demonstrating:
    - Primary Key & Foreign Key referential integrity (Users -> DemoItems)
    - Cascade deletion
    - Optimistic concurrency control (version field)
    - Row locking counter (concurrency lab)
    - IDOR protection & ownership checks
    """
    __tablename__ = "demo_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="active", nullable=False)
    counter = Column(Integer, default=0, nullable=False)
    version = Column(Integer, default=1, nullable=False)

    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    owner = relationship("User", back_populates="demo_items")

    def __repr__(self) -> str:
        return f"<DemoItem id={self.id} title={self.title} owner_id={self.owner_id}>"


class IdempotencyRecord(Base):
    """
    Demonstrates Step 18 idempotency:
    Persists response for duplicate request replay without re-executing state mutation.
    """
    __tablename__ = "idempotency_records"

    id = Column(Integer, primary_key=True, index=True)
    idempotency_key = Column(String(128), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    status_code = Column(Integer, nullable=False)
    response_body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
