from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.models.activity import Activity
from app.models.followup import FollowUp, FollowUpStatus
from app.schemas.followup import (
    FollowUpCreate,
    FollowUpUpdate,
    FollowUpResponse,
)

router = APIRouter(tags=["Follow-ups"])


@router.get("/followups", response_model=List[FollowUpResponse])
def list_followups(
    status_filter: Optional[FollowUpStatus] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all follow-ups for the authenticated user.
    Enforces user_id ownership check.
    """
    query = (
        db.query(FollowUp)
        .options(joinedload(FollowUp.activity))
        .filter(FollowUp.user_id == current_user.id)
    )

    if status_filter:
        query = query.filter(FollowUp.status == status_filter)

    followups = query.order_by(FollowUp.scheduled_at.asc()).all()

    return [
        FollowUpResponse(
            id=f.id,
            activity_id=f.activity_id,
            user_id=f.user_id,
            note=f.note,
            scheduled_at=f.scheduled_at,
            status=f.status,
            outcome=f.outcome,
            completed_at=f.completed_at,
            created_at=f.created_at,
            updated_at=f.updated_at,
            activity_title=f.activity.title if f.activity else None,
        )
        for f in followups
    ]


@router.get("/activities/{activity_id}/followups", response_model=List[FollowUpResponse])
def list_activity_followups(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List follow-ups for a specific activity.
    Verifies activity ownership by current user.
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

    followups = (
        db.query(FollowUp)
        .filter(FollowUp.activity_id == activity_id, FollowUp.user_id == current_user.id)
        .order_by(FollowUp.scheduled_at.asc())
        .all()
    )

    return [
        FollowUpResponse(
            id=f.id,
            activity_id=f.activity_id,
            user_id=f.user_id,
            note=f.note,
            scheduled_at=f.scheduled_at,
            status=f.status,
            outcome=f.outcome,
            completed_at=f.completed_at,
            created_at=f.created_at,
            updated_at=f.updated_at,
            activity_title=activity.title,
        )
        for f in followups
    ]


@router.post("/activities/{activity_id}/followups", response_model=FollowUpResponse, status_code=status.HTTP_201_CREATED)
def create_followup(
    activity_id: int,
    payload: FollowUpCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new scheduled follow-up for an activity.
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

    scheduled_at = payload.scheduled_at
    if scheduled_at.tzinfo is None:
        scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)

    followup = FollowUp(
        activity_id=activity_id,
        user_id=current_user.id,
        note=payload.note.strip(),
        scheduled_at=scheduled_at,
        status=FollowUpStatus.PENDING,
    )
    db.add(followup)
    db.commit()
    db.refresh(followup)

    return FollowUpResponse(
        id=followup.id,
        activity_id=followup.activity_id,
        user_id=followup.user_id,
        note=followup.note,
        scheduled_at=followup.scheduled_at,
        status=followup.status,
        outcome=followup.outcome,
        completed_at=followup.completed_at,
        created_at=followup.created_at,
        updated_at=followup.updated_at,
        activity_title=activity.title,
    )


@router.patch("/followups/{followup_id}", response_model=FollowUpResponse)
@router.put("/followups/{followup_id}", response_model=FollowUpResponse)
def update_followup(
    followup_id: int,
    payload: FollowUpUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update follow-up note, scheduled time, outcome, or status.
    Enforces user_id ownership.
    """
    followup = (
        db.query(FollowUp)
        .options(joinedload(FollowUp.activity))
        .filter(FollowUp.id == followup_id, FollowUp.user_id == current_user.id)
        .first()
    )
    if not followup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found or access denied."}},
        )

    now = datetime.now(timezone.utc)

    if payload.note is not None:
        followup.note = payload.note.strip()
    if payload.outcome is not None:
        followup.outcome = payload.outcome.strip() if payload.outcome else None
    if payload.scheduled_at is not None:
        st = payload.scheduled_at
        if st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
        followup.scheduled_at = st

    if payload.status is not None:
        followup.status = payload.status
        if payload.status == FollowUpStatus.COMPLETED:
            followup.completed_at = now
        else:
            followup.completed_at = None

    db.commit()
    db.refresh(followup)

    return FollowUpResponse(
        id=followup.id,
        activity_id=followup.activity_id,
        user_id=followup.user_id,
        note=followup.note,
        scheduled_at=followup.scheduled_at,
        status=followup.status,
        outcome=followup.outcome,
        completed_at=followup.completed_at,
        created_at=followup.created_at,
        updated_at=followup.updated_at,
        activity_title=followup.activity.title if followup.activity else None,
    )


@router.delete("/followups/{followup_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_followup(
    followup_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a follow-up.
    Enforces user_id ownership.
    """
    followup = (
        db.query(FollowUp)
        .filter(FollowUp.id == followup_id, FollowUp.user_id == current_user.id)
        .first()
    )
    if not followup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "FOLLOWUP_NOT_FOUND", "message": "Follow-up not found or access denied."}},
        )

    db.delete(followup)
    db.commit()
    return None
