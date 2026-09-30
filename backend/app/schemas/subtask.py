from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SubtaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Subtask title")
    order: Optional[int] = Field(0, description="Display order")


class SubtaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    is_completed: Optional[bool] = None
    order: Optional[int] = None


class SubtaskResponse(BaseModel):
    id: int
    activity_id: int
    user_id: int
    title: str
    is_completed: bool
    order: int
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
