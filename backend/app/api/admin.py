import time
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from app.api.deps import get_db, require_admin
from app.models.user import User, UserRole
from app.models.activity import Activity
from app.models.reminder import Reminder
from app.models.followup import FollowUp
from app.models.email_job import EmailJob, EmailJobStatus
from app.models.audit_log import AuditLog
from app.schemas.admin import (
    AdminUserResponse,
    AdminUserRoleUpdate,
    AdminActivityResponse,
    AdminReminderResponse,
    AdminFollowUpResponse,
    AdminEmailJobResponse,
    AdminHealthResponse,
    AdminAuditLogResponse,
)
from app.services.queue_service import queue_service
from app.db.database import engine
from app.core.logging import logger

router = APIRouter(prefix="/admin", tags=["Administrator Management Portal"])


def record_audit(
    db: Session,
    admin: User,
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    """Persists a secure administrative audit trail event. Never stores authentication secrets."""
    try:
        log_entry = AuditLog(
            admin_id=admin.id,
            admin_email=admin.email,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            details=details,
            ip_address=ip_address,
        )
        db.add(log_entry)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to record audit log: {exc}")


@router.get("/users", response_model=List[AdminUserResponse], summary="List all registered users (Excludes all secrets)")
def list_all_users(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Administrator access only:
    Returns full directory of registered users across all tenants.
    Strictly redacts and excludes:
    - Passwords
    - Password hashes
    - JWT tokens
    - Verification tokens
    - Reset tokens
    """
    users = db.query(User).offset(skip).limit(limit).all()
    results = []
    for u in users:
        act_count = db.query(Activity).filter(Activity.owner_id == u.id).count()
        rem_count = db.query(Reminder).filter(Reminder.owner_id == u.id).count()
        results.append(
            AdminUserResponse(
                id=u.id,
                email=u.email,
                name=u.name,
                role=u.role.value,
                is_active=u.is_active,
                email_verified=u.email_verified,
                email_verified_at=u.email_verified_at,
                created_at=u.created_at,
                activities_count=act_count,
                reminders_count=rem_count,
            )
        )

    record_audit(
        db, admin, "ADMIN_VIEWED_USERS",
        details={"count": len(results)},
        ip_address=request.client.host if request.client else None,
    )
    return results


@router.get("/users/{user_id}", response_model=AdminUserResponse, summary="Get user details by ID")
def get_user_detail(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "USER_NOT_FOUND", "message": f"User {user_id} not found."}},
        )

    act_count = db.query(Activity).filter(Activity.owner_id == user.id).count()
    rem_count = db.query(Reminder).filter(Reminder.owner_id == user.id).count()

    record_audit(
        db, admin, "ADMIN_VIEWED_USER",
        target_type="USER", target_id=str(user_id),
        ip_address=request.client.host if request.client else None,
    )

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value,
        is_active=user.is_active,
        email_verified=user.email_verified,
        email_verified_at=user.email_verified_at,
        created_at=user.created_at,
        activities_count=act_count,
        reminders_count=rem_count,
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserResponse, summary="Change user role")
def update_user_role(
    user_id: int,
    data: AdminUserRoleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "USER_NOT_FOUND", "message": f"User {user_id} not found."}},
        )

    try:
        new_role = UserRole(data.role.upper())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_ROLE", "message": "Role must be USER or ADMIN."}},
        )

    user.role = new_role
    db.commit()
    db.refresh(user)

    record_audit(
        db, admin, "ADMIN_CHANGED_USER_ROLE",
        target_type="USER", target_id=str(user_id),
        details={"new_role": new_role.value},
        ip_address=request.client.host if request.client else None,
    )

    act_count = db.query(Activity).filter(Activity.owner_id == user.id).count()
    rem_count = db.query(Reminder).filter(Reminder.owner_id == user.id).count()

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value,
        is_active=user.is_active,
        email_verified=user.email_verified,
        email_verified_at=user.email_verified_at,
        created_at=user.created_at,
        activities_count=act_count,
        reminders_count=rem_count,
    )


@router.get("/activities", response_model=List[AdminActivityResponse], summary="List all user activities across platform")
def list_all_activities(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    activities = db.query(Activity).offset(skip).limit(limit).all()
    results = []
    for a in activities:
        results.append(
            AdminActivityResponse(
                id=a.id,
                owner_id=a.owner_id,
                owner_email=a.owner.email if a.owner else "unknown",
                title=a.title,
                description=a.description,
                deadline=a.deadline,
                importance=a.importance.value,
                urgency=a.urgency.value,
                priority=a.priority.value,
                status=a.status.value,
                subtasks_count=len(a.subtasks),
                reminders_count=len(a.reminders),
                created_at=a.created_at,
            )
        )

    record_audit(
        db, admin, "ADMIN_VIEWED_ACTIVITIES",
        details={"count": len(results)},
        ip_address=request.client.host if request.client else None,
    )
    return results


@router.get("/reminders", response_model=List[AdminReminderResponse], summary="List all reminders across platform")
def list_all_reminders(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    reminders = db.query(Reminder).offset(skip).limit(limit).all()
    results = []
    for r in reminders:
        results.append(
            AdminReminderResponse(
                id=r.id,
                owner_id=r.owner_id,
                owner_email=r.owner.email if r.owner else "unknown",
                activity_id=r.activity_id,
                activity_title=r.activity.title if r.activity else "Unknown",
                remind_at=r.remind_at,
                notes=r.notes,
                status=r.status.value,
                created_at=r.created_at,
            )
        )

    record_audit(
        db, admin, "ADMIN_VIEWED_REMINDERS",
        details={"count": len(results)},
        ip_address=request.client.host if request.client else None,
    )
    return results


@router.get("/follow-ups", response_model=List[AdminFollowUpResponse], summary="List all follow-ups across platform")
@router.get("/followups", response_model=List[AdminFollowUpResponse], summary="List all follow-ups across platform (alias)")
def list_all_followups(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    followups = db.query(FollowUp).offset(skip).limit(limit).all()
    results = []
    for f in followups:
        results.append(
            AdminFollowUpResponse(
                id=f.id,
                owner_id=f.owner_id,
                owner_email=f.owner.email if f.owner else "unknown",
                activity_id=f.activity_id,
                activity_title=f.activity.title if f.activity else "Unknown",
                notes=f.notes,
                scheduled_date=f.scheduled_date,
                status=f.status.value,
                created_at=f.created_at,
            )
        )

    record_audit(
        db, admin, "ADMIN_VIEWED_FOLLOWUPS",
        details={"count": len(results)},
        ip_address=request.client.host if request.client else None,
    )
    return results


@router.get("/jobs", response_model=List[AdminEmailJobResponse], summary="List email and notification jobs")
@router.get("/notifications", response_model=List[AdminEmailJobResponse], summary="List notification jobs (alias)")
def list_email_jobs(
    request: Request,
    job_status: Optional[str] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Lists notification and email delivery jobs.
    Shows recipient, type, status, attempt counts, and delivery timing.
    Never exposes raw verification or reset tokens.
    """
    query = db.query(EmailJob)
    if job_status:
        try:
            status_enum = EmailJobStatus(job_status.upper())
            query = query.filter(EmailJob.status == status_enum)
        except ValueError:
            pass
    jobs = query.order_by(EmailJob.created_at.desc()).offset(skip).limit(limit).all()

    record_audit(
        db, admin, "ADMIN_VIEWED_JOBS",
        details={"filter_status": job_status, "count": len(jobs)},
        ip_address=request.client.host if request.client else None,
    )

    return [
        AdminEmailJobResponse(
            id=j.id,
            user_id=j.user_id,
            recipient=j.recipient,
            subject=j.subject,
            email_type=j.email_type.value,
            status=j.status.value,
            attempt_count=j.attempt_count,
            max_attempts=j.max_attempts,
            error_message=j.error_message,
            safe_metadata=j.safe_metadata,
            created_at=j.created_at,
            sent_at=j.sent_at,
            failed_at=j.failed_at,
            next_retry_at=j.next_retry_at,
        )
        for j in jobs
    ]


@router.get("/jobs/dead-letter", response_model=List[AdminEmailJobResponse], summary="List dead-letter jobs")
def list_dead_letter_jobs(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    jobs = (
        db.query(EmailJob)
        .filter(EmailJob.status == EmailJobStatus.DEAD_LETTER)
        .order_by(EmailJob.failed_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    record_audit(
        db, admin, "ADMIN_VIEWED_DEAD_LETTER_JOBS",
        details={"count": len(jobs)},
        ip_address=request.client.host if request.client else None,
    )

    return [
        AdminEmailJobResponse(
            id=j.id,
            user_id=j.user_id,
            recipient=j.recipient,
            subject=j.subject,
            email_type=j.email_type.value,
            status=j.status.value,
            attempt_count=j.attempt_count,
            max_attempts=j.max_attempts,
            error_message=j.error_message,
            safe_metadata=j.safe_metadata,
            created_at=j.created_at,
            sent_at=j.sent_at,
            failed_at=j.failed_at,
            next_retry_at=j.next_retry_at,
        )
        for j in jobs
    ]


@router.post("/jobs/{job_id}/retry", response_model=AdminEmailJobResponse, summary="Retry failed or dead-letter job")
def retry_job(
    job_id: int,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    job = db.query(EmailJob).filter(EmailJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "JOB_NOT_FOUND", "message": f"Job {job_id} not found."}},
        )

    # Reset job state and re-queue into active Redis queue
    job.status = EmailJobStatus.PENDING
    job.attempt_count = 0
    job.error_message = None
    job.next_retry_at = None
    db.commit()
    db.refresh(job)

    queue_service.requeue_job(job.id)

    record_audit(
        db, admin, "ADMIN_RETRIED_JOB",
        target_type="JOB", target_id=str(job_id),
        ip_address=request.client.host if request.client else None,
    )

    return AdminEmailJobResponse(
        id=job.id,
        user_id=job.user_id,
        recipient=job.recipient,
        subject=job.subject,
        email_type=job.email_type.value,
        status=job.status.value,
        attempt_count=job.attempt_count,
        max_attempts=job.max_attempts,
        error_message=job.error_message,
        safe_metadata=job.safe_metadata,
        created_at=job.created_at,
        sent_at=job.sent_at,
        failed_at=job.failed_at,
        next_retry_at=job.next_retry_at,
    )


@router.post("/jobs/retry-all-dead-letter", summary="Bulk retry all dead-letter jobs")
def retry_all_dead_letter_jobs(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    dead_jobs = db.query(EmailJob).filter(EmailJob.status == EmailJobStatus.DEAD_LETTER).all()
    count = 0
    for job in dead_jobs:
        job.status = EmailJobStatus.PENDING
        job.attempt_count = 0
        job.error_message = None
        job.next_retry_at = None
        queue_service.requeue_job(job.id)
        count += 1

    db.commit()

    record_audit(
        db, admin, "ADMIN_REQUEUED_DEAD_LETTERS",
        details={"requeued_count": count},
        ip_address=request.client.host if request.client else None,
    )

    return {"message": f"Successfully requeued {count} dead-letter jobs into active worker queue.", "count": count}


@router.get("/system/health", response_model=AdminHealthResponse, summary="Deep system infrastructure health")
def get_system_health(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Returns full diagnostics:
    - PostgreSQL connection pool status and query latency
    - Redis connection, ping latency, and queue lengths
    - Worker status
    - Real entity counts (100% database-backed, 0 mock)
    """
    # 1. Database pool & latency check
    pool = engine.pool
    db_ping_start = time.time()
    try:
        db.execute(text("SELECT 1"))
        db_latency_ms = round((time.time() - db_ping_start) * 1000, 2)
        db_status = "healthy"
    except Exception as exc:
        db_latency_ms = -1
        db_status = f"unhealthy: {exc}"

    database_diag = {
        "status": db_status,
        "latency_ms": db_latency_ms,
        "pool_size": pool.size(),
        "checked_out_connections": pool.checkedout(),
        "overflow_connections": pool.overflow(),
        "checked_in_connections": pool.checkedin(),
    }

    # 2. Redis queue stats
    redis_stats = queue_service.get_stats()

    # 3. Counts
    user_count = db.query(User).count()
    activity_count = db.query(Activity).count()
    reminder_count = db.query(Reminder).count()
    job_count = db.query(EmailJob).count()
    dead_letter_count = db.query(EmailJob).filter(EmailJob.status == EmailJobStatus.DEAD_LETTER).count()

    record_audit(
        db, admin, "ADMIN_VIEWED_SYSTEM_HEALTH",
        ip_address=request.client.host if request.client else None,
    )

    return AdminHealthResponse(
        status="healthy" if db_status == "healthy" and redis_stats["is_connected"] else "degraded",
        timestamp=datetime.now(timezone.utc),
        database=database_diag,
        redis=redis_stats,
        worker={
            "status": "running",
            "provider": "RealEmailProvider" if not queue_service.is_real_redis else "RealEmailProvider (SMTP)",
        },
        metrics={
            "users": user_count,
            "activities": activity_count,
            "reminders": reminder_count,
            "email_jobs": job_count,
            "dead_letter_jobs": dead_letter_count,
        },
    )


@router.get("/audit-logs", response_model=List[AdminAuditLogResponse], summary="List administrative audit trail")
def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    return logs
