export type ActivityStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ActivityUrgency = "OVERDUE" | "DUE_TODAY" | "DUE_SOON" | "MODERATE" | "LOW" | "NONE";
export type ActivityPriority = "P1_CRITICAL" | "P2_HIGH" | "P3_MEDIUM" | "P4_LOW";

export type ReminderStatus = "SCHEDULED" | "DUE" | "SNOOZED" | "DISMISSED";
export type FollowUpStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface Subtask {
  id: number;
  activity_id: number;
  user_id: number;
  title: string;
  is_completed: boolean;
  order: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: number;
  activity_id: number;
  user_id: number;
  remind_at: string;
  message: string | null;
  status: ReminderStatus;
  effective_status: ReminderStatus;
  snooze_until: string | null;
  dismissed_at: string | null;
  channel?: string | null;
  created_at: string;
  updated_at: string;
  activity_title?: string | null;
}

export interface FollowUp {
  id: number;
  activity_id: number;
  user_id: number;
  note: string;
  scheduled_at: string;
  status: FollowUpStatus;
  outcome: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  activity_title?: string | null;
}

export interface Activity {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  importance: number;
  deadline: string | null;
  status: ActivityStatus;
  activity_type?: string | null;
  estimated_time?: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  urgency: ActivityUrgency;
  priority_quadrant: ActivityPriority;
  priority_score: number;
  total_subtasks: number;
  completed_subtasks: number;
  progress_percentage: number;
  subtasks: Subtask[];
  reminders: Reminder[];
  followups: FollowUp[];
}

export interface ActivitySummaryStats {
  total_activities: number;
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  overdue: number;
  due_today: number;
  due_soon: number;
  high_priority_p1: number;
}
