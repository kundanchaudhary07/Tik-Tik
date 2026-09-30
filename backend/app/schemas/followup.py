from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.followup import FollowUpStatus


class FollowUpCreate(BaseModel):
    note: str = Field(..., min_length=1, description="Follow-up instructions or note")
    scheduled_at: datetime = Field(..., description="Timestamp in UTC when follow-up should occur")


class FollowUpUpdate(BaseModel):
    note: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    status: Optional[FollowUpStatus] = None
    outcome: Optional[str] = None


class FollowUpResponse(BaseModel):
    id: int
    activity_id: int
    user_id: int
    note: str
    scheduled_at: datetime
    status: FollowUpStatus
    outcome: Optional[str] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    activity_title: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
