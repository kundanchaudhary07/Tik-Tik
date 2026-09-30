from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.activity import Activity, ActivityStatus, ActivityUrgency, ActivityPriority
from app.models.reminder import Reminder, ReminderStatus
from app.models.followup import FollowUp
from app.schemas.activity import ActivityResponse
from app.schemas.subtask import SubtaskResponse
from app.schemas.reminder import ReminderResponse
from app.schemas.followup import FollowUpResponse


def build_activity_response(activity: Activity, now: Optional[datetime] = None) -> ActivityResponse:
    """
    Transforms an Activity ORM object into an authoritative ActivityResponse.
    Computes Urgency, Priority Quadrant, Deterministic Priority Score, and Progress.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    urgency = activity.compute_urgency(now)
    priority_quadrant, priority_score = activity.compute_priority(now)
    progress = activity.compute_progress()

    total_subtasks = len(activity.subtasks) if activity.subtasks else 0
    completed_subtasks = sum(1 for st in activity.subtasks if st.is_completed) if activity.subtasks else 0

    subtasks_dto: List[SubtaskResponse] = [
        SubtaskResponse.model_validate(st) for st in (activity.subtasks or [])
    ]

    reminders_dto: List[ReminderResponse] = []
    for r in (activity.reminders or []):
        eff_status = r.evaluate_status(now)
        dto = ReminderResponse(
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
            activity_title=activity.title,
        )
        reminders_dto.append(dto)

    followups_dto: List[FollowUpResponse] = [
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
        for f in (activity.followups or [])
    ]

    return ActivityResponse(
        id=activity.id,
        user_id=activity.user_id,
        owner_id=activity.user_id,
        title=activity.title,
        description=activity.description,
        status=activity.status,
        importance=activity.importance,
        deadline=activity.deadline,
        completed_at=activity.completed_at,
        created_at=activity.created_at,
        updated_at=activity.updated_at,
        urgency=urgency,
        priority_quadrant=priority_quadrant,
        priority_score=priority_score,
        progress_percentage=progress,
        total_subtasks=total_subtasks,
        completed_subtasks=completed_subtasks,
        subtasks=subtasks_dto,
        reminders=reminders_dto,
        followups=followups_dto,
    )
