import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.core.config import settings
from app.core.logging import logger
from app.models.email_job import EmailJob, EmailJobStatus, EmailJobType
from app.models.reminder import Reminder, ReminderStatus
from app.services.email import get_email_provider, EmailMessage
from app.services.queue_service import queue_service, EMAIL_QUEUE_NAME
from app.services.notification_service import notification_service

_worker_thread: Optional[threading.Thread] = None
_stop_event = threading.Event()


def process_email_job(job_id: int, db: Session) -> bool:
    """
    Pulls job from database, transitions state, and executes delivery via EmailProvider.
    Ensures safe logging and moves unrecoverable jobs to DEAD_LETTER after max_attempts.
    """
    job = db.query(EmailJob).filter(EmailJob.id == job_id).first()
    if not job:
        logger.warning(f"Worker could not find EmailJob id={job_id}")
        return False

    if job.status == EmailJobStatus.SENT:
        logger.info(f"EmailJob id={job_id} already marked SENT. Skipping.")
        return True

    job.status = EmailJobStatus.PROCESSING
    job.attempt_count += 1
    db.commit()

    recipient_domain = job.recipient.split("@")[-1] if "@" in job.recipient else "unknown"
    logger.info(
        f"Processing EmailJob id={job.id} type={job.email_type} recipient_domain={recipient_domain} attempt={job.attempt_count}/{job.max_attempts}"
    )

    provider = get_email_provider()
    msg = EmailMessage(
        recipient=job.recipient,
        subject=job.subject,
        html_body=job.body_html or "",
        text_body=job.body_text or "",
        email_type=job.email_type.value,
        job_id=job.id,
    )

    result = provider.send_email(msg)

    if result.success:
        job.status = EmailJobStatus.SENT
        job.sent_at = datetime.now(timezone.utc)
        job.error_message = None
        db.commit()
        logger.info(f"EmailJob id={job.id} delivered successfully.")
        return True
    else:
        job.error_message = result.error_message or "Unknown delivery error"
        if job.attempt_count >= job.max_attempts:
            job.status = EmailJobStatus.DEAD_LETTER
            job.failed_at = datetime.now(timezone.utc)
            db.commit()
            queue_service.push_dead_letter(job.id)
            logger.error(
                f"EmailJob id={job.id} exhausted max retries ({job.max_attempts}). Moved to DEAD_LETTER: {job.error_message}"
            )
        else:
            job.status = EmailJobStatus.FAILED
            # Exponential backoff (e.g. 5s, 10s, 20s)
            backoff_secs = (2 ** job.attempt_count) * 5
            job.next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=backoff_secs)
            db.commit()
            logger.warning(
                f"EmailJob id={job.id} delivery attempt {job.attempt_count} failed: {job.error_message}. Retry scheduled for {job.next_retry_at.isoformat()}"
            )
        return False


def check_scheduled_reminders(db: Session) -> int:
    """
    Checks for due reminders in database, marks them TRIGGERED,
    and enqueues real notification email jobs to Redis queue.
    """
    now = datetime.now(timezone.utc)
    due_reminders = (
        db.query(Reminder)
        .filter(Reminder.status == ReminderStatus.SCHEDULED, Reminder.remind_at <= now)
        .all()
    )

    triggered_count = 0
    for reminder in due_reminders:
        reminder.status = ReminderStatus.TRIGGERED
        db.commit()
        notification_service.queue_reminder_email(db, reminder)
        triggered_count += 1

    if triggered_count > 0:
        logger.info(f"Reminder Scheduler: Triggered {triggered_count} due reminders into notification queue.")
    return triggered_count


def retry_due_failed_jobs(db: Session) -> int:
    """
    Finds FAILED jobs whose next_retry_at timestamp has passed,
    and re-queues them into the active Redis queue.
    """
    now = datetime.now(timezone.utc)
    due_jobs = (
        db.query(EmailJob)
        .filter(
            EmailJob.status == EmailJobStatus.FAILED,
            EmailJob.next_retry_at <= now,
            EmailJob.attempt_count < EmailJob.max_attempts,
        )
        .limit(20)
        .all()
    )

    requeued = 0
    for job in due_jobs:
        job.status = EmailJobStatus.PENDING
        db.commit()
        queue_service.enqueue_job(job.id)
        requeued += 1

    return requeued


def worker_cycle(db: Session):
    """Executes a single processing cycle of the background worker."""
    # 1. Pop active job from Redis queue
    job_id = queue_service.dequeue_job(EMAIL_QUEUE_NAME, timeout=1)
    if job_id:
        process_email_job(job_id, db)

    # 2. Check scheduled reminders and due retries
    check_scheduled_reminders(db)
    retry_due_failed_jobs(db)


def worker_loop():
    """Continuous background loop for processing jobs and reminders."""
    logger.info("Background Email & Reminder Worker started.")
    last_periodic_check = 0.0

    while not _stop_event.is_set():
        try:
            db = SessionLocal()
            try:
                # 1. Process email job if available in Redis queue
                job_id = queue_service.dequeue_job(EMAIL_QUEUE_NAME, timeout=1)
                if job_id:
                    process_email_job(job_id, db)

                # 2. Periodic checks every 5 seconds
                now_sec = time.time()
                if now_sec - last_periodic_check >= 5.0:
                    check_scheduled_reminders(db)
                    retry_due_failed_jobs(db)
                    last_periodic_check = now_sec

            finally:
                db.close()
        except Exception as exc:
            logger.error(f"Error in background worker loop: {exc}", exc_info=True)
            time.sleep(2.0)

    logger.info("Background Email & Reminder Worker stopped gracefully.")


def start_background_worker():
    """Spawns the background worker in a daemon thread."""
    global _worker_thread
    if _worker_thread is not None and _worker_thread.is_alive():
        return

    _stop_event.clear()
    _worker_thread = threading.Thread(target=worker_loop, name="EmailWorkerThread", daemon=True)
    _worker_thread.start()
    logger.info("Background Worker daemon thread launched.")


def stop_background_worker():
    """Signals background worker to stop."""
    global _worker_thread
    _stop_event.set()
    if _worker_thread and _worker_thread.is_alive():
        _worker_thread.join(timeout=3.0)
    logger.info("Background Worker signaled to stop.")


if __name__ == "__main__":
    # Allow running directly: python backend/app/worker.py
    logger.info("Running standalone worker process...")
    worker_loop()
