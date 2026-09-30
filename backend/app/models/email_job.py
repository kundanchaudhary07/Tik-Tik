import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class EmailJobType(str, enum.Enum):
    VERIFICATION = "VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"
    REMINDER = "REMINDER"
    NOTIFICATION = "NOTIFICATION"
    SYSTEM = "SYSTEM"


class EmailJobStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    SENT = "SENT"
    FAILED = "FAILED"
    DEAD_LETTER = "DEAD_LETTER"


class EmailJob(Base):
    __tablename__ = "email_jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    recipient = Column(String(255), nullable=False, index=True)
    subject = Column(String(255), nullable=False)
    email_type = Column(Enum(EmailJobType), nullable=False, index=True)
    status = Column(Enum(EmailJobStatus), default=EmailJobStatus.PENDING, index=True, nullable=False)
    
    attempt_count = Column(Integer, default=0, nullable=False)
    max_attempts = Column(Integer, default=3, nullable=False)
    error_message = Column(Text, nullable=True)
    
    # Safe metadata: only sanitized non-secret operational details (e.g. reminder ID, activity title)
    safe_metadata = Column(JSON, nullable=True)
    
    # Message contents for delivery by the background worker
    body_html = Column(Text, nullable=True)
    body_text = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    failed_at = Column(DateTime(timezone=True), nullable=True)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", backref="email_jobs")

    def __repr__(self):
        return f"<EmailJob id={self.id} recipient={self.recipient} type={self.email_type} status={self.status}>"
