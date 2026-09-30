import os
from typing import Optional
from app.core.config import settings
from app.services.email.base import EmailProvider, EmailMessage, EmailResult
from app.services.email.real_provider import RealEmailProvider
from app.services.email.test_provider import TestEmailProvider

_current_provider: Optional[EmailProvider] = None


def get_email_provider() -> EmailProvider:
    """
    Returns the appropriate EmailProvider according to runtime environment.
    Production uses RealEmailProvider.
    Pytest/Test suites use TestEmailProvider.
    """
    global _current_provider
    if _current_provider is not None:
        return _current_provider

    # Strict isolation: if running within pytest or configured as test
    is_testing = (
        bool(os.environ.get("PYTEST_CURRENT_TEST"))
        or settings.ENVIRONMENT == "test"
        or settings.EMAIL_PROVIDER.lower() == "test"
    )

    if is_testing:
        _current_provider = TestEmailProvider()
    else:
        _current_provider = RealEmailProvider()

    return _current_provider


def set_email_provider(provider: EmailProvider) -> None:
    """Explicitly override email provider (e.g. during test fixtures)."""
    global _current_provider
    _current_provider = provider


__all__ = [
    "EmailProvider",
    "EmailMessage",
    "EmailResult",
    "RealEmailProvider",
    "TestEmailProvider",
    "get_email_provider",
    "set_email_provider",
]
