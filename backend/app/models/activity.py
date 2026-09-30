import enum
from datetime import datetime, timezone
from typing import Optional, Tuple
from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship
from app.db.database import Base


class ActivityStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class ActivityUrgency(str, enum.Enum):
    OVERDUE = "OVERDUE"
    DUE_TODAY = "DUE_TODAY"
    DUE_SOON = "DUE_SOON"  # <= 72 hours
    MODERATE = "MODERATE"  # <= 7 days
    LOW = "LOW"            # > 7 days
    NONE = "NONE"          # No deadline


class ActivityPriority(str, enum.Enum):
    P1_CRITICAL = "P1_CRITICAL"  # High Importance + High Urgency
    P2_HIGH = "P2_HIGH"          # High Importance + Low Urgency
    P3_MEDIUM = "P3_MEDIUM"      # Low Importance + High Urgency
    P4_LOW = "P4_LOW"            # Low Importance + Low Urgency


class Activity(Base):
    """
    Authoritative Activity model representing the core unit of work.
    The backend computes Urgency, Priority, and Progress deterministically.
    """
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(ActivityStatus), default=ActivityStatus.PENDING, nullable=False, index=True)
    importance = Column(Integer, default=3, nullable=False)  # 1 (lowest) to 5 (critical)
    deadline = Column(DateTime(timezone=True), nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="activities")
    subtasks = relationship("Subtask", back_populates="activity", cascade="all, delete-orphan", order_by="Subtask.order")
    reminders = relationship("Reminder", back_populates="activity", cascade="all, delete-orphan", order_by="Reminder.remind_at")
    followups = relationship("FollowUp", back_populates="activity", cascade="all, delete-orphan", order_by="FollowUp.scheduled_at")

    @property
    def owner_id(self) -> int:
        return self.user_id

    def compute_urgency(self, now: Optional[datetime] = None) -> ActivityUrgency:
        """
        Calculates urgency relative to the activity's deadline.
        The backend is the sole source of truth.
        """
        if self.status in (ActivityStatus.COMPLETED, ActivityStatus.CANCELLED):
            return ActivityUrgency.NONE

        if not self.deadline:
            return ActivityUrgency.NONE

        if now is None:
            now = datetime.now(timezone.utc)

        # Normalize deadline to have timezone info
        dl = self.deadline
        if dl.tzinfo is None:
            dl = dl.replace(tzinfo=timezone.utc)

        diff = (dl - now).total_seconds()
        if diff < 0:
            return ActivityUrgency.OVERDUE
        elif diff <= 86400:  # <= 24 hours
            return ActivityUrgency.DUE_TODAY
        elif diff <= 259200:  # <= 72 hours (3 days)
            return ActivityUrgency.DUE_SOON
        elif diff <= 604800:  # <= 7 days
            return ActivityUrgency.MODERATE
        else:
            return ActivityUrgency.LOW

    def compute_priority(self, now: Optional[datetime] = None) -> Tuple[ActivityPriority, int]:
        """
        Calculates priority quadrant (Eisenhower matrix) and deterministic score (0-100+).
        """
        if self.status == ActivityStatus.COMPLETED:
            return ActivityPriority.P4_LOW, 0
        if self.status == ActivityStatus.CANCELLED:
            return ActivityPriority.P4_LOW, -10

        urgency = self.compute_urgency(now)
        is_high_importance = self.importance >= 4
        is_high_urgency = urgency in (ActivityUrgency.OVERDUE, ActivityUrgency.DUE_TODAY, ActivityUrgency.DUE_SOON)

        if is_high_importance and is_high_urgency:
            quadrant = ActivityPriority.P1_CRITICAL
        elif is_high_importance and not is_high_urgency:
            quadrant = ActivityPriority.P2_HIGH
        elif not is_high_importance and is_high_urgency:
            quadrant = ActivityPriority.P3_MEDIUM
        else:
            quadrant = ActivityPriority.P4_LOW

        # Mathematical score for sorting
        urgency_points = {
            ActivityUrgency.OVERDUE: 60,
            ActivityUrgency.DUE_TODAY: 45,
            ActivityUrgency.DUE_SOON: 30,
            ActivityUrgency.MODERATE: 15,
            ActivityUrgency.LOW: 5,
            ActivityUrgency.NONE: 0,
        }.get(urgency, 0)

        importance_points = self.importance * 10  # 10 to 50
        score = urgency_points + importance_points

        return quadrant, score

    def compute_progress(self) -> float:
        """
        Computes completion percentage strictly from authoritative subtask state.
        """
        if not self.subtasks:
            if self.status == ActivityStatus.COMPLETED:
                return 100.0
            elif self.status == ActivityStatus.IN_PROGRESS:
                return 50.0
            return 0.0

        total = len(self.subtasks)
        completed = sum(1 for st in self.subtasks if st.is_completed)
        return round((completed / total) * 100.0, 1)

    def __repr__(self) -> str:
        return f"<Activity id={self.id} title={self.title} status={self.status} user_id={self.user_id}>"
