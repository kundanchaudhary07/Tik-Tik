import enum
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class ReminderStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    DUE = "DUE"
    SNOOZED = "SNOOZED"
    DISMISSED = "DISMISSED"


class Reminder(Base):
    """
    Reminder model.
    Since external queues / background workers are prohibited by architectural constraints,
    the backend provides deterministic reminder evaluations on access or polling,
    allowing clients to inspect due, snoozed, and scheduled reminders.
    """
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    activity_id = Column(Integer, ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    remind_at = Column(DateTime(timezone=True), nullable=False, index=True)
    message = Column(String(255), nullable=True)
    status = Column(Enum(ReminderStatus), default=ReminderStatus.SCHEDULED, nullable=False, index=True)
    snooze_until = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    activity = relationship("Activity", back_populates="reminders")
    user = relationship("User")

    def evaluate_status(self, now: Optional[datetime] = None) -> ReminderStatus:
        """
        Calculates whether the reminder is currently DUE based on UTC time.
        """
        if self.status == ReminderStatus.DISMISSED:
            return ReminderStatus.DISMISSED

        if now is None:
            now = datetime.now(timezone.utc)

        target_time = self.snooze_until if (self.status == ReminderStatus.SNOOZED and self.snooze_until) else self.remind_at
        if target_time.tzinfo is None:
            target_time = target_time.replace(tzinfo=timezone.utc)

        if now >= target_time:
            return ReminderStatus.DUE
        elif self.status == ReminderStatus.SNOOZED:
            return ReminderStatus.SNOOZED
        return ReminderStatus.SCHEDULED

    def __repr__(self) -> str:
        return f"<Reminder id={self.id} activity_id={self.activity_id} status={self.status} remind_at={self.remind_at}>"
