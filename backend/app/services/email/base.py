from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass
class EmailMessage:
    recipient: str
    subject: str
    html_body: str
    text_body: str
    email_type: str = "NOTIFICATION"
    job_id: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EmailResult:
    success: bool
    error_message: Optional[str] = None
    message_id: Optional[str] = None


class EmailProvider(ABC):
    """
    Abstract Email Provider Interface.
    Enforces clean separation between production real email delivery and test environments.
    """

    @abstractmethod
    def send_email(self, message: EmailMessage) -> EmailResult:
        """
        Deliver an email message synchronously or handle dispatch.
        Returns EmailResult with success boolean and optional error message.
        """
        pass
