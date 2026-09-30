from app.core.config import settings
from app.core.logging import logger


class EmailService:
    """
    Email service abstraction.
    In Phase 1 development, this provides a simulated delivery channel:
    - Generates and logs verification & reset URLs securely without leaking raw tokens to untrusted logs.
    - Captures outgoing development tokens for testing and frontend lab inspection.
    In Phase 3, AWS SES / SMTP integration will be plugged into this interface.
    """

    @staticmethod
    def send_verification_email(email: str, raw_token: str) -> str:
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={raw_token}"
        logger.info(
            f"[DEV EMAIL SERVICE] Email verification link generated for recipient",
            extra={"endpoint": "/auth/register"}
        )
        return verify_url

    @staticmethod
    def send_password_reset_email(email: str, raw_token: str) -> str:
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        logger.info(
            f"[DEV EMAIL SERVICE] Password reset link generated for recipient",
            extra={"endpoint": "/auth/forgot-password"}
        )
        return reset_url


email_service = EmailService()
