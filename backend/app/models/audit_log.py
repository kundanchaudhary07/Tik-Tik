from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    admin_email = Column(String(255), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True)  # e.g., ADMIN_VIEWED_USER, ADMIN_RETRIED_JOB
    target_type = Column(String(50), nullable=True, index=True)  # USER, ACTIVITY, REMINDER, JOB, SYSTEM
    target_id = Column(String(100), nullable=True)
    details = Column(JSON, nullable=True)  # Safe metadata only, no secrets
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    admin_user = relationship("User", foreign_keys=[admin_id])

    def __repr__(self):
        return f"<AuditLog id={self.id} admin={self.admin_email} action={self.action} target={self.target_type}:{self.target_id}>"
