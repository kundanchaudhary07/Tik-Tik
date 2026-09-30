from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.models.activity import Activity, ActivityStatus
from app.models.subtask import Subtask
from app.schemas.subtask import SubtaskCreate, SubtaskUpdate, SubtaskResponse

router = APIRouter(tags=["Subtasks"])


@router.get("/activities/{activity_id}/subtasks", response_model=List[SubtaskResponse])
def list_subtasks(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all subtasks for an activity.
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

    subtasks = (
        db.query(Subtask)
        .filter(Subtask.activity_id == activity_id, Subtask.user_id == current_user.id)
        .order_by(Subtask.order.asc(), Subtask.id.asc())
        .all()
    )
    return subtasks


@router.post("/activities/{activity_id}/subtasks", response_model=SubtaskResponse, status_code=status.HTTP_201_CREATED)
def create_subtask(
    activity_id: int,
    payload: SubtaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a new subtask attached to an activity.
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

    # Determine order if not specified
    order_val = payload.order
    if order_val == 0 or order_val is None:
        last_subtask = (
            db.query(Subtask)
            .filter(Subtask.activity_id == activity_id)
            .order_by(Subtask.order.desc())
            .first()
        )
        order_val = (last_subtask.order + 1) if last_subtask else 1

    subtask = Subtask(
        activity_id=activity_id,
        user_id=current_user.id,
        title=payload.title.strip(),
        is_completed=False,
        order=order_val,
    )
    db.add(subtask)

    # If activity was completed, adding a new incomplete subtask resets status to IN_PROGRESS
    if activity.status == ActivityStatus.COMPLETED:
        activity.status = ActivityStatus.IN_PROGRESS
        activity.completed_at = None

    db.commit()
    db.refresh(subtask)
    return subtask


@router.patch("/subtasks/{subtask_id}", response_model=SubtaskResponse)
@router.put("/subtasks/{subtask_id}", response_model=SubtaskResponse)
def update_subtask(
    subtask_id: int,
    payload: SubtaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update subtask state (title, completion, order).
    Enforces user_id ownership check.
    Recalculates completion timestamps.
    """
    subtask = (
        db.query(Subtask)
        .filter(Subtask.id == subtask_id, Subtask.user_id == current_user.id)
        .first()
    )
    if not subtask:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "SUBTASK_NOT_FOUND", "message": "Subtask not found or access denied."}},
        )

    now = datetime.now(timezone.utc)

    if payload.title is not None:
        subtask.title = payload.title.strip()
    if payload.order is not None:
        subtask.order = payload.order

    if payload.is_completed is not None:
        if payload.is_completed and not subtask.is_completed:
            subtask.is_completed = True
            subtask.completed_at = now
        elif not payload.is_completed and subtask.is_completed:
            subtask.is_completed = False
            subtask.completed_at = None

            # If parent activity was marked COMPLETED, reopen it as IN_PROGRESS
            activity = db.query(Activity).filter(Activity.id == subtask.activity_id).first()
            if activity and activity.status == ActivityStatus.COMPLETED:
                activity.status = ActivityStatus.IN_PROGRESS
                activity.completed_at = None

    db.commit()
    db.refresh(subtask)
    return subtask


@router.delete("/subtasks/{subtask_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subtask(
    subtask_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a subtask.
    Enforces user_id ownership.
    """
    subtask = (
        db.query(Subtask)
        .filter(Subtask.id == subtask_id, Subtask.user_id == current_user.id)
        .first()
    )
    if not subtask:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "SUBTASK_NOT_FOUND", "message": "Subtask not found or access denied."}},
        )

    db.delete(subtask)
    db.commit()
    return None
