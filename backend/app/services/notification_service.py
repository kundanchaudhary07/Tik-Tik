from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.models.email_job import EmailJob, EmailJobType, EmailJobStatus
from app.models.user import User
from app.models.reminder import Reminder
from app.services.queue_service import queue_service


class NotificationService:
    """
    Orchestrates email job creation, templating, and asynchronous Redis queue dispatch.
    Ensures safe metadata storage: passwords, raw tokens, and hashes are NEVER persisted
    in the admin-inspectable safe_metadata JSON field.
    """

    @staticmethod
    def queue_verification_email(db: Session, user: User, raw_token: str) -> EmailJob:
        verification_link = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
        
        subject = "Verify Your Account — Productivity Platform"
        body_text = (
            f"Hello {user.name or 'User'},\n\n"
            f"Thank you for registering on the Productivity Platform.\n"
            f"Please verify your email address by visiting the link below:\n\n"
            f"{verification_link}\n\n"
            f"This link will expire in {settings.TOKEN_EXPIRE_HOURS} hours.\n\n"
            f"If you did not create this account, please ignore this message."
        )
        body_html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; color: #1c1917; background-color: #fafaf9; border-radius: 12px; border: 1px solid #e7e5e4;">
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 20px; font-weight: 600; color: #1c1917; margin: 0 0 8px 0;">Verify your email address</h1>
                <p style="font-size: 14px; color: #57534e; margin: 0;">Welcome to the Productivity Platform.</p>
            </div>
            <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e7e5e4; margin-bottom: 24px;">
                <p style="font-size: 14px; line-height: 1.6; color: #292524; margin-top: 0;">
                    Hello <strong>{user.name or user.email}</strong>,
                </p>
                <p style="font-size: 14px; line-height: 1.6; color: #292524;">
                    To complete your registration and activate your account, please click the verification button below:
                </p>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="{verification_link}" style="background-color: #1c1917; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; display: inline-block;">
                        Verify My Account
                    </a>
                </div>
                <p style="font-size: 12px; color: #78716c; line-height: 1.5; margin-bottom: 0;">
                    Or paste this URL into your browser:<br>
                    <a href="{verification_link}" style="color: #2563eb; word-break: break-all;">{verification_link}</a>
                </p>
            </div>
            <p style="font-size: 12px; color: #a8a29e; text-align: center; margin: 0;">
                This link will expire in {settings.TOKEN_EXPIRE_HOURS} hours. If you did not create an account, you can safely ignore this email.
            </p>
        </div>
        """

        job = EmailJob(
            user_id=user.id,
            recipient=user.email,
            subject=subject,
            email_type=EmailJobType.VERIFICATION,
            status=EmailJobStatus.PENDING,
            safe_metadata={
                "user_id": user.id,
                "email_type": "VERIFICATION",
                "recipient_domain": user.email.split("@")[-1] if "@" in user.email else "",
            },
            body_html=body_html,
            body_text=body_text,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        queue_service.enqueue_job(job.id)
        logger.info(
            f"Enqueued VERIFICATION email job {job.id} for user {user.id}",
            extra={"email_job_id": job.id, "user_id": user.id, "email_type": "VERIFICATION"},
        )
        return job

    @staticmethod
    def queue_password_reset_email(db: Session, user: User, raw_token: str) -> EmailJob:
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        
        subject = "Reset Your Password — Productivity Platform"
        body_text = (
            f"Hello {user.name or 'User'},\n\n"
            f"We received a request to reset your password on the Productivity Platform.\n"
            f"To choose a new password, click the link below:\n\n"
            f"{reset_link}\n\n"
            f"This link will expire in {settings.TOKEN_EXPIRE_HOURS} hours.\n\n"
            f"If you did not request a password reset, please ignore this email; your account remains secure."
        )
        body_html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; color: #1c1917; background-color: #fafaf9; border-radius: 12px; border: 1px solid #e7e5e4;">
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 20px; font-weight: 600; color: #1c1917; margin: 0 0 8px 0;">Reset Your Password</h1>
                <p style="font-size: 14px; color: #57534e; margin: 0;">Password recovery request received.</p>
            </div>
            <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e7e5e4; margin-bottom: 24px;">
                <p style="font-size: 14px; line-height: 1.6; color: #292524; margin-top: 0;">
                    Hello <strong>{user.name or user.email}</strong>,
                </p>
                <p style="font-size: 14px; line-height: 1.6; color: #292524;">
                    We received a request to reset your password. Click the button below to set a new password:
                </p>
                <div style="text-align: center; margin: 28px 0;">
                    <a href="{reset_link}" style="background-color: #1c1917; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500; display: inline-block;">
                        Reset Password
                    </a>
                </div>
                <p style="font-size: 12px; color: #78716c; line-height: 1.5; margin-bottom: 0;">
                    Or paste this URL into your browser:<br>
                    <a href="{reset_link}" style="color: #2563eb; word-break: break-all;">{reset_link}</a>
                </p>
            </div>
            <p style="font-size: 12px; color: #a8a29e; text-align: center; margin: 0;">
                If you did not request this reset, your account is still secure and no changes were made.
            </p>
        </div>
        """

        job = EmailJob(
            user_id=user.id,
            recipient=user.email,
            subject=subject,
            email_type=EmailJobType.PASSWORD_RESET,
            status=EmailJobStatus.PENDING,
            safe_metadata={
                "user_id": user.id,
                "email_type": "PASSWORD_RESET",
                "recipient_domain": user.email.split("@")[-1] if "@" in user.email else "",
            },
            body_html=body_html,
            body_text=body_text,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        queue_service.enqueue_job(job.id)
        logger.info(
            f"Enqueued PASSWORD_RESET email job {job.id} for user {user.id}",
            extra={"email_job_id": job.id, "user_id": user.id, "email_type": "PASSWORD_RESET"},
        )
        return job

    @staticmethod
    def queue_reminder_email(db: Session, reminder: Reminder) -> EmailJob:
        user = reminder.owner
        activity = reminder.activity
        activity_title = activity.title if activity else "Scheduled Activity"

        subject = f"Reminder: {activity_title}"
        body_text = (
            f"Hello {user.name or 'User'},\n\n"
            f"This is a scheduled reminder for your activity:\n\n"
            f"Activity: {activity_title}\n"
            f"Reminder Note: {reminder.notes or 'None'}\n"
            f"Scheduled For: {reminder.remind_at.isoformat()}\n\n"
            f"View your activity at: {settings.FRONTEND_URL}\n"
        )
        body_html = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; color: #1c1917; background-color: #fafaf9; border-radius: 12px; border: 1px solid #e7e5e4;">
            <div style="margin-bottom: 24px;">
                <h1 style="font-size: 20px; font-weight: 600; color: #1c1917; margin: 0 0 8px 0;">Activity Reminder</h1>
                <p style="font-size: 14px; color: #57534e; margin: 0;">You have a scheduled reminder due.</p>
            </div>
            <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; border: 1px solid #e7e5e4; margin-bottom: 24px;">
                <h2 style="font-size: 16px; font-weight: 600; color: #1c1917; margin-top: 0;">{activity_title}</h2>
                {f'<p style="font-size: 14px; color: #44403c; margin: 8px 0;"><strong>Note:</strong> {reminder.notes}</p>' if reminder.notes else ''}
                <p style="font-size: 13px; color: #78716c; margin: 8px 0;">
                    Scheduled time: {reminder.remind_at.strftime('%Y-%m-%d %H:%M UTC')}
                </p>
                <div style="margin-top: 20px;">
                    <a href="{settings.FRONTEND_URL}" style="background-color: #1c1917; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 500; display: inline-block;">
                        Open Activity Dashboard
                    </a>
                </div>
            </div>
        </div>
        """

        job = EmailJob(
            user_id=user.id,
            recipient=user.email,
            subject=subject,
            email_type=EmailJobType.REMINDER,
            status=EmailJobStatus.PENDING,
            safe_metadata={
                "user_id": user.id,
                "reminder_id": reminder.id,
                "activity_id": reminder.activity_id,
                "activity_title": activity_title,
                "email_type": "REMINDER",
            },
            body_html=body_html,
            body_text=body_text,
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        queue_service.enqueue_job(job.id)
        logger.info(
            f"Enqueued REMINDER email job {job.id} for reminder {reminder.id}",
            extra={"email_job_id": job.id, "user_id": user.id, "reminder_id": reminder.id, "email_type": "REMINDER"},
        )
        return job


notification_service = NotificationService()
