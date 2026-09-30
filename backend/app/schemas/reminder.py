from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from app.models.reminder import ReminderStatus


class ReminderCreate(BaseModel):
    remind_at: datetime = Field(..., description="Timestamp in UTC when reminder should trigger")
    message: Optional[str] = Field(None, max_length=255, description="Custom reminder note")


class ReminderUpdate(BaseModel):
    remind_at: Optional[datetime] = None
    message: Optional[str] = None
    status: Optional[ReminderStatus] = None


class ReminderSnooze(BaseModel):
    minutes: int = Field(15, ge=1, le=10080, description="Minutes to snooze (default 15)")


class ReminderResponse(BaseModel):
    id: int
    activity_id: int
    user_id: int
    remind_at: datetime
    message: Optional[str] = None
    status: ReminderStatus
    effective_status: ReminderStatus
    snooze_until: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    activity_title: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
