from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.activity import ActivityPriority, ActivityStatus, ActivityUrgency
from app.schemas.subtask import SubtaskResponse
from app.schemas.reminder import ReminderResponse
from app.schemas.followup import FollowUpResponse


class ActivityCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Activity title")
    description: Optional[str] = Field(None, description="Detailed description")
    importance: int = Field(3, ge=1, le=5, description="Importance scale from 1 (lowest) to 5 (critical)")
    deadline: Optional[datetime] = Field(None, description="Deadline in UTC")
    status: Optional[ActivityStatus] = Field(ActivityStatus.PENDING, description="Initial status")


class ActivityUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    importance: Optional[int] = Field(None, ge=1, le=5)
    deadline: Optional[datetime] = None
    status: Optional[ActivityStatus] = None
    force_complete: Optional[bool] = Field(False, description="Override completion rule when subtasks are incomplete")


class ActivityStatusUpdate(BaseModel):
    status: ActivityStatus
    force_complete: bool = Field(False, description="If True, completes remaining subtasks or bypasses subtask check")


class ActivityResponse(BaseModel):
    id: int
    user_id: int
    owner_id: int
    title: str
    description: Optional[str] = None
    status: ActivityStatus
    importance: int
    deadline: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    # Authoritative computed properties
    urgency: ActivityUrgency
    priority_quadrant: ActivityPriority
    priority_score: int
    progress_percentage: float
    total_subtasks: int
    completed_subtasks: int

    subtasks: List[SubtaskResponse] = []
    reminders: List[ReminderResponse] = []
    followups: List[FollowUpResponse] = []

    model_config = ConfigDict(from_attributes=True)


class ActivitySummaryStats(BaseModel):
    total_activities: int
    pending: int
    in_progress: int
    completed: int
    cancelled: int
    overdue: int
    due_today: int
    due_soon: int
    high_priority_p1: int
