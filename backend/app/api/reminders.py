from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.models.activity import Activity
from app.models.reminder import Reminder, ReminderStatus
from app.schemas.reminder import (
    ReminderCreate,
    ReminderUpdate,
    ReminderSnooze,
    ReminderResponse,
)

router = APIRouter(tags=["Reminders"])


@router.get("/reminders", response_model=List[ReminderResponse])
def list_reminders(
    status_filter: Optional[ReminderStatus] = Query(None, alias="status"),
    due_only: bool = Query(False, description="Filter only to reminders currently due"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all reminders for the authenticated user.
    Authoritative state evaluation runs on demand: determines if SCHEDULED reminders are now DUE.
    """
    query = (
        db.query(Reminder)
        .options(joinedload(Reminder.activity))
        .filter(Reminder.user_id == current_user.id)
    )

    if status_filter:
        query = query.filter(Reminder.status == status_filter)

    reminders = query.order_by(Reminder.remind_at.asc()).all()
    now = datetime.now(timezone.utc)

    results: List[ReminderResponse] = []
    for r in reminders:
        eff_status = r.evaluate_status(now)
        if due_only and eff_status != ReminderStatus.DUE:
            continue

        results.append(
            ReminderResponse(
                id=r.id,
                activity_id=r.activity_id,
                user_id=r.user_id,
                remind_at=r.remind_at,
                message=r.message,
                status=r.status,
                effective_status=eff_status,
                snooze_until=r.snooze_until,
                dismissed_at=r.dismissed_at,
                created_at=r.created_at,
                updated_at=r.updated_at,
                activity_title=r.activity.title if r.activity else None,
            )
        )

    return results


@router.get("/activities/{activity_id}/reminders", response_model=List[ReminderResponse])
def list_activity_reminders(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List reminders for a specific activity owned by current user.
    """
    activity = (
        db.query(Activity)
        .filter(Activity.id == activity_id, Activity.user_id == current_user.id)
        .first()
    )
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ACTIVITY_NOT_FOUND", "message": "Activity not found or access denied."}},
        )

    reminders = (
        db.query(Reminder)
        .filter(Reminder.activity_id == activity_id, Reminder.user_id == current_user.id)
        .order_by(Reminder.remind_at.asc())
        .all()
    )
    now = datetime.now(timezone.utc)

    return [
        ReminderResponse(
            id=r.id,
            activity_id=r.activity_id,
            user_id=r.user_id,
            remind_at=r.remind_at,
            message=r.message,
            status=r.status,
            effective_status=r.evaluate_status(now),
            snooze_until=r.snooze_until,
            dismissed_at=r.dismissed_at,
            created_at=r.created_at,
            updated_at=r.updated_at,
            activity_title=activity.title,
        )
        for r in reminders
    ]


@router.post("/activities/{activity_id}/reminders", response_model=ReminderResponse, status_code=status.HTTP_201_CREATED)
def create_reminder(
    activity_id: int,
    payload: ReminderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new reminder for an activity.
    Forces user_id = current_user.id.
    """
    activity = (
        db.query(Activity)
        .filter(Activity.id == activity_id, Activity.user_id == current_user.id)
        .first()
    )
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ACTIVITY_NOT_FOUND", "message": "Activity not found or access denied."}},
        )

    remind_at = payload.remind_at
    if remind_at.tzinfo is None:
        remind_at = remind_at.replace(tzinfo=timezone.utc)

    reminder = Reminder(
        activity_id=activity_id,
        user_id=current_user.id,
        remind_at=remind_at,
        message=payload.message.strip() if payload.message else None,
        status=ReminderStatus.SCHEDULED,
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)

    now = datetime.now(timezone.utc)
    return ReminderResponse(
        id=reminder.id,
        activity_id=reminder.activity_id,
        user_id=reminder.user_id,
        remind_at=reminder.remind_at,
        message=reminder.message,
        status=reminder.status,
        effective_status=reminder.evaluate_status(now),
        snooze_until=reminder.snooze_until,
        dismissed_at=reminder.dismissed_at,
        created_at=reminder.created_at,
        updated_at=reminder.updated_at,
        activity_title=activity.title,
    )


@router.post("/reminders/{reminder_id}/snooze", response_model=ReminderResponse)
def snooze_reminder(
    reminder_id: int,
    payload: ReminderSnooze,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Snooze a reminder by the requested number of minutes.
    Updates authoritative snooze_until timestamp.
    """
    reminder = (
        db.query(Reminder)
        .options(joinedload(Reminder.activity))
        .filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
        .first()
    )
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "REMINDER_NOT_FOUND", "message": "Reminder not found or access denied."}},
        )

    now = datetime.now(timezone.utc)
    snooze_until = now + timedelta(minutes=payload.minutes)

    reminder.status = ReminderStatus.SNOOZED
    reminder.snooze_until = snooze_until

    db.commit()
    db.refresh(reminder)

    return ReminderResponse(
        id=reminder.id,
        activity_id=reminder.activity_id,
        user_id=reminder.user_id,
        remind_at=reminder.remind_at,
        message=reminder.message,
        status=reminder.status,
        effective_status=reminder.evaluate_status(now),
        snooze_until=reminder.snooze_until,
        dismissed_at=reminder.dismissed_at,
        created_at=reminder.created_at,
        updated_at=reminder.updated_at,
        activity_title=reminder.activity.title if reminder.activity else None,
    )


@router.post("/reminders/{reminder_id}/dismiss", response_model=ReminderResponse)
def dismiss_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dismiss a reminder. Sets status to DISMISSED.
    """
    reminder = (
        db.query(Reminder)
        .options(joinedload(Reminder.activity))
        .filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
        .first()
    )
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "REMINDER_NOT_FOUND", "message": "Reminder not found or access denied."}},
        )

    now = datetime.now(timezone.utc)
    reminder.status = ReminderStatus.DISMISSED
    reminder.dismissed_at = now

    db.commit()
    db.refresh(reminder)

    return ReminderResponse(
        id=reminder.id,
        activity_id=reminder.activity_id,
        user_id=reminder.user_id,
        remind_at=reminder.remind_at,
        message=reminder.message,
        status=reminder.status,
        effective_status=ReminderStatus.DISMISSED,
        snooze_until=reminder.snooze_until,
        dismissed_at=reminder.dismissed_at,
        created_at=reminder.created_at,
        updated_at=reminder.updated_at,
        activity_title=reminder.activity.title if reminder.activity else None,
    )


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deletes a reminder.
    Enforces user_id ownership check.
    """
    reminder = (
        db.query(Reminder)
        .filter(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
        .first()
    )
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "REMINDER_NOT_FOUND", "message": "Reminder not found or access denied."}},
        )

    db.delete(reminder)
    db.commit()
    return None
