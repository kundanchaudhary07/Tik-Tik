import smtplib
import ssl
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formatdate, make_msgid

from app.core.config import settings
from app.core.logging import logger
from app.services.email.base import EmailProvider, EmailMessage, EmailResult


class RealEmailProvider(EmailProvider):
    """
    Production Real Email Provider.
    Delivers actual emails using RFC-compliant SMTP / STARTTLS.
    Configured strictly through environment variables / backend configuration.
    Credentials and secrets are never exposed to clients or logged in plaintext.
    """

    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.username = settings.SMTP_USERNAME
        self.password = settings.SMTP_PASSWORD
        self.use_tls = settings.SMTP_USE_TLS
        self.use_ssl = settings.SMTP_USE_SSL
        self.timeout = settings.SMTP_TIMEOUT
        self.from_email = settings.EMAIL_FROM
        self.from_name = settings.EMAIL_FROM_NAME

    def send_email(self, message: EmailMessage) -> EmailResult:
        start_time = time.time()
        msg_id = make_msgid(domain=self.from_email.split("@")[-1] if "@" in self.from_email else "productivityplatform.local")

        # Prepare MIME Multipart message
        mime_msg = MIMEMultipart("alternative")
        mime_msg["Message-ID"] = msg_id
        mime_msg["Date"] = formatdate(localtime=True)
        mime_msg["Subject"] = message.subject
        mime_msg["From"] = f"{self.from_name} <{self.from_email}>"
        mime_msg["To"] = message.recipient

        # Attach text & html parts
        part_text = MIMEText(message.text_body, "plain", "utf-8")
        part_html = MIMEText(message.html_body, "html", "utf-8")
        mime_msg.attach(part_text)
        mime_msg.attach(part_html)

        # Domain extraction for safe auditing
        recipient_domain = message.recipient.split("@")[-1] if "@" in message.recipient else "unknown"

        try:
            if self.use_ssl:
                context = ssl.create_default_context()
                server = smtplib.SMTP_SSL(self.host, self.port, context=context, timeout=self.timeout)
            else:
                server = smtplib.SMTP(self.host, self.port, timeout=self.timeout)
                if self.use_tls:
                    context = ssl.create_default_context()
                    server.starttls(context=context)

            if self.username and self.password:
                server.login(self.username, self.password)

            server.sendmail(self.from_email, [message.recipient], mime_msg.as_string())
            server.quit()

            latency_ms = round((time.time() - start_time) * 1000, 2)
            logger.info(
                f"RealEmailProvider successfully delivered message: type={message.email_type} recipient_domain={recipient_domain} latency={latency_ms}ms",
                extra={
                    "email_job_id": message.job_id,
                    "recipient_domain": recipient_domain,
                    "email_type": message.email_type,
                    "status": "DELIVERED",
                    "latency_ms": latency_ms,
                },
            )
            return EmailResult(success=True, message_id=msg_id)

        except Exception as exc:
            latency_ms = round((time.time() - start_time) * 1000, 2)
            error_str = f"{type(exc).__name__}: {str(exc)}"
            logger.error(
                f"RealEmailProvider delivery failure: type={message.email_type} recipient_domain={recipient_domain} error={error_str}",
                extra={
                    "email_job_id": message.job_id,
                    "recipient_domain": recipient_domain,
                    "email_type": message.email_type,
                    "status": "FAILED",
                    "error": error_str,
                    "latency_ms": latency_ms,
                },
            )
            return EmailResult(success=False, error_message=error_str, message_id=msg_id)
