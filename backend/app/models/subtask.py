from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class Subtask(Base):
    """
    Subtask model representing discrete steps belonging to an Activity.
    The backend governs completion rules and recalculates parent activity progress.
    """
    __tablename__ = "subtasks"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    is_completed = Column(Boolean, default=False, nullable=False, index=True)
    order = Column(Integer, default=0, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    activity = relationship("Activity", back_populates="subtasks")
    user = relationship("User")

    def __repr__(self) -> str:
        return f"<Subtask id={self.id} title={self.title} activity_id={self.activity_id} is_completed={self.is_completed}>"
