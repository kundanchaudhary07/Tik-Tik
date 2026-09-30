from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_current_user
from app.db.database import get_db
from app.models.user import User
from app.models.activity import (
    Activity,
    ActivityStatus,
    ActivityUrgency,
    ActivityPriority,
)
from app.schemas.activity import (
    ActivityCreate,
    ActivityUpdate,
    ActivityStatusUpdate,
    ActivityResponse,
    ActivitySummaryStats,
)
from app.services.activity_service import build_activity_response

router = APIRouter(prefix="/activities", tags=["Activities"])


@router.get("", response_model=List[ActivityResponse])
def list_activities(
    status_filter: Optional[ActivityStatus] = Query(None, alias="status"),
    importance_filter: Optional[int] = Query(None, ge=1, le=5, alias="importance"),
    urgency_filter: Optional[ActivityUrgency] = Query(None, alias="urgency"),
    priority_filter: Optional[ActivityPriority] = Query(None, alias="priority"),
    search: Optional[str] = Query(None),
    sort_by: str = Query("priority", pattern="^(priority|deadline|importance|created_at|title)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all activities belonging to the authenticated user.
    Enforces strict IDOR protection (user_id = current_user.id).
    Calculates backend Urgency, Priority, and Progress dynamically.
    """
    query = (
        db.query(Activity)
        .options(
            joinedload(Activity.subtasks),
            joinedload(Activity.reminders),
            joinedload(Activity.followups),
        )
        .filter(Activity.user_id == current_user.id)
    )

    if status_filter:
        query = query.filter(Activity.status == status_filter)

    if importance_filter:
        query = query.filter(Activity.importance == importance_filter)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.filter(
            (Activity.title.ilike(search_term)) | (Activity.description.ilike(search_term))
        )

    activities = query.all()
    now = datetime.now(timezone.utc)

    # Build authoritative responses with computed urgency, priority & progress
    response_items: List[ActivityResponse] = []
    for act in activities:
        resp = build_activity_response(act, now)

        # Filter by computed urgency if requested
        if urgency_filter and resp.urgency != urgency_filter:
            continue

        # Filter by computed priority if requested
        if priority_filter and resp.priority_quadrant != priority_filter:
            continue

        response_items.append(resp)

    # Sort responses deterministically
    reverse = sort_order == "desc"
    if sort_by == "priority":
        response_items.sort(key=lambda x: (x.priority_score, x.importance), reverse=reverse)
    elif sort_by == "deadline":
        # Put items without deadline at the end when sorting ascending
        response_items.sort(
            key=lambda x: (x.deadline is None, x.deadline or datetime.max.replace(tzinfo=timezone.utc)),
            reverse=reverse,
        )
    elif sort_by == "importance":
        response_items.sort(key=lambda x: x.importance, reverse=reverse)
    elif sort_by == "created_at":
        response_items.sort(key=lambda x: x.created_at, reverse=reverse)
    elif sort_by == "title":
        response_items.sort(key=lambda x: x.title.lower(), reverse=reverse)

    return response_items


@router.get("/summary", response_model=ActivitySummaryStats)
def get_activity_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Authoritative summary counts and status breakdown for current user's activities.
    """
    activities = (
        db.query(Activity)
        .options(joinedload(Activity.subtasks))
        .filter(Activity.user_id == current_user.id)
        .all()
    )

    now = datetime.now(timezone.utc)
    stats = {
        "total_activities": len(activities),
        "pending": 0,
        "in_progress": 0,
        "completed": 0,
        "cancelled": 0,
        "overdue": 0,
        "due_today": 0,
        "due_soon": 0,
        "high_priority_p1": 0,
    }

    for act in activities:
        if act.status == ActivityStatus.PENDING:
            stats["pending"] += 1
        elif act.status == ActivityStatus.IN_PROGRESS:
            stats["in_progress"] += 1
        elif act.status == ActivityStatus.COMPLETED:
            stats["completed"] += 1
        elif act.status == ActivityStatus.CANCELLED:
            stats["cancelled"] += 1

        urgency = act.compute_urgency(now)
        if urgency == ActivityUrgency.OVERDUE:
            stats["overdue"] += 1
        elif urgency == ActivityUrgency.DUE_TODAY:
            stats["due_today"] += 1
        elif urgency == ActivityUrgency.DUE_SOON:
            stats["due_soon"] += 1

        quadrant, _ = act.compute_priority(now)
        if quadrant == ActivityPriority.P1_CRITICAL:
            stats["high_priority_p1"] += 1

    return ActivitySummaryStats(**stats)


@router.post("", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: ActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new activity.
    Forces user_id = current_user.id on the server side.
    """
    # Normalize deadline to UTC
    deadline = payload.deadline
    if deadline and deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    activity = Activity(
        user_id=current_user.id,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        importance=payload.importance,
        deadline=deadline,
        status=payload.status or ActivityStatus.PENDING,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)

    return build_activity_response(activity)


@router.get("/{activity_id}", response_model=ActivityResponse)
def get_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch an activity by ID.
    Enforces IDOR protection: returns 404 if activity does not belong to user.
    """
    activity = (
        db.query(Activity)
        .options(
            joinedload(Activity.subtasks),
            joinedload(Activity.reminders),
            joinedload(Activity.followups),
        )
        .filter(Activity.id == activity_id, Activity.user_id == current_user.id)
        .first()
    )

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "ACTIVITY_NOT_FOUND",
                    "message": f"Activity with ID {activity_id} was not found or access is denied.",
                }
            },
        )

    return build_activity_response(activity)


@router.patch("/{activity_id}", response_model=ActivityResponse)
@router.put("/{activity_id}", response_model=ActivityResponse)
def update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update activity fields.
    Enforces strict completion rules:
    - Attempting to mark activity as COMPLETED when open subtasks exist will fail
      with HTTP 400 INCOMPLETE_SUBTASKS unless force_complete=True.
    - If force_complete=True, completes all open subtasks atomically.
    """
    activity = (
        db.query(Activity)
        .options(
            joinedload(Activity.subtasks),
            joinedload(Activity.reminders),
            joinedload(Activity.followups),
        )
        .filter(Activity.id == activity_id, Activity.user_id == current_user.id)
        .first()
    )

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "ACTIVITY_NOT_FOUND",
                    "message": f"Activity with ID {activity_id} was not found or access is denied.",
                }
            },
        )

    now = datetime.now(timezone.utc)

    if payload.title is not None:
        activity.title = payload.title.strip()
    if payload.description is not None:
        activity.description = payload.description.strip() if payload.description else None
    if payload.importance is not None:
        activity.importance = payload.importance
    if payload.deadline is not None:
        dl = payload.deadline
        if dl.tzinfo is None:
            dl = dl.replace(tzinfo=timezone.utc)
        activity.deadline = dl

    # Completion Rule Validation
    if payload.status is not None:
        if payload.status == ActivityStatus.COMPLETED:
            incomplete_subtasks = [st for st in (activity.subtasks or []) if not st.is_completed]
            if incomplete_subtasks and not payload.force_complete:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "error": {
                            "code": "INCOMPLETE_SUBTASKS",
                            "message": f"Cannot complete activity: {len(incomplete_subtasks)} subtask(s) are still pending. Complete all subtasks or pass force_complete=True.",
                            "pending_count": len(incomplete_subtasks),
                        }
                    },
                )
            if incomplete_subtasks and payload.force_complete:
                for st in incomplete_subtasks:
                    st.is_completed = True
                    st.completed_at = now

            activity.status = ActivityStatus.COMPLETED
            activity.completed_at = now
        else:
            # Reopening or changing status away from completed
            activity.status = payload.status
            activity.completed_at = None

    db.commit()
    db.refresh(activity)

    return build_activity_response(activity)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Deletes an activity and all its subtasks, reminders, and follow-ups via database cascade.
    Enforces IDOR ownership protection.
    """
    activity = (
        db.query(Activity)
        .filter(Activity.id == activity_id, Activity.user_id == current_user.id)
        .first()
    )

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "ACTIVITY_NOT_FOUND",
                    "message": f"Activity with ID {activity_id} was not found or access is denied.",
                }
            },
        )

    db.delete(activity)
    db.commit()
    return None
