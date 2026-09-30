from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field


class AdminUserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str] = None
    role: str
    is_active: bool
    email_verified: bool
    email_verified_at: Optional[datetime] = None
    created_at: datetime
    activities_count: int = 0
    reminders_count: int = 0

    class Config:
        from_attributes = True


class AdminUserRoleUpdate(BaseModel):
    role: str = Field(..., description="Role to assign: 'USER' or 'ADMIN'")


class AdminActivityResponse(BaseModel):
    id: int
    owner_id: int
    owner_email: str
    title: str
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    importance: str
    urgency: str
    priority: str
    status: str
    subtasks_count: int = 0
    reminders_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class AdminReminderResponse(BaseModel):
    id: int
    owner_id: int
    owner_email: str
    activity_id: int
    activity_title: str
    remind_at: datetime
    notes: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class AdminFollowUpResponse(BaseModel):
    id: int
    owner_id: int
    owner_email: str
    activity_id: int
    activity_title: str
    notes: Optional[str] = None
    scheduled_date: Optional[datetime] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class AdminEmailJobResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    recipient: str
    subject: str
    email_type: str
    status: str
    attempt_count: int
    max_attempts: int
    error_message: Optional[str] = None
    safe_metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    sent_at: Optional[datetime] = None
    failed_at: Optional[datetime] = None
    next_retry_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminHealthResponse(BaseModel):
    status: str
    timestamp: datetime
    database: Dict[str, Any]
    redis: Dict[str, Any]
    worker: Dict[str, Any]
    metrics: Dict[str, int]


class AdminAuditLogResponse(BaseModel):
    id: int
    admin_id: Optional[int] = None
    admin_email: str
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
