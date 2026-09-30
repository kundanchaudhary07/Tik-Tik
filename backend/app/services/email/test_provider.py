import time
from typing import List, Optional
from app.services.email.base import EmailProvider, EmailMessage, EmailResult
from app.core.logging import logger


class TestEmailProvider(EmailProvider):
    """
    Isolated Test Email Provider.
    Used strictly in automated tests (pytest) to assert outgoing message structure,
    tokens, and recipient routing without performing actual network I/O.
    """

    def __init__(self):
        self.sent_messages: List[EmailMessage] = []

    def send_email(self, message: EmailMessage) -> EmailResult:
        self.sent_messages.append(message)
        logger.info(
            f"[TEST EMAIL PROVIDER] Captured email for {message.recipient} subject='{message.subject}' type={message.email_type}",
            extra={
                "email_job_id": message.job_id,
                "recipient": message.recipient,
                "email_type": message.email_type,
                "status": "CAPTURED",
            },
        )
        return EmailResult(
            success=True,
            message_id=f"test-msg-{len(self.sent_messages)}-{int(time.time())}",
        )

    def get_last_email(self) -> Optional[EmailMessage]:
        return self.sent_messages[-1] if self.sent_messages else None

    def get_emails_for_recipient(self, recipient: str) -> List[EmailMessage]:
        return [m for m in self.sent_messages if m.recipient.lower() == recipient.lower()]

    def clear(self):
        self.sent_messages.clear()
