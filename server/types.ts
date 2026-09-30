export type UserRole = "USER" | "ADMIN";
export type ActivityStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ActivityUrgency = "OVERDUE" | "DUE_TODAY" | "DUE_SOON" | "MODERATE" | "LOW" | "NONE";
export type ActivityPriority = "P1_CRITICAL" | "P2_HIGH" | "P3_MEDIUM" | "P4_LOW";
export type ReminderStatus = "SCHEDULED" | "DUE" | "SNOOZED" | "DISMISSED";
export type FollowUpStatus = "PENDING" | "COMPLETED" | "CANCELLED";
export type JobStatus = "PENDING" | "PROCESSING" | "SENT" | "SKIPPED" | "RETRYING" | "FAILED" | "DEAD_LETTER";
export type NotificationChannel = "EMAIL" | "IN_APP";

export interface UserPreferences {
  timezone: string; // e.g. "UTC", "America/New_York", "Asia/Tokyo"
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // e.g. "22:00"
  quiet_hours_end: string;   // e.g. "08:00"
  email_notifications_enabled: boolean;
  occupation?: "Student" | "Employee" | "Business owner" | "Professional" | "Other";
}

export interface UserRecord {
  id: number;
  email: string;
  name: string | null;
  passwordHash: string;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  email_verified_at: string | null;
  preferences: UserPreferences;
  verification_token?: string | null;
  verification_token_hash?: string | null;
  verification_token_expires_at?: string | null;
  verification_last_sent_at?: string | null;
  reset_token?: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitRecurrenceRecord {
  id: number;
  activity_id: number;
  user_id: number;
  frequency: "DAILY" | "WEEKLY" | "WEEKDAYS" | "CUSTOM_DAYS";
  days_of_week?: number[]; // [0..6] (0 = Sunday, 1 = Monday, etc.)
  is_active: boolean;
  last_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityRecord {
  id: number;
  user_id: number;
  title: string;
  description: string | null;
  importance: number; // 1 to 5
  deadline: string | null;
  status: ActivityStatus;
  activity_type?: string | null;
  estimated_time?: string | null;
  is_adaptive_reminder?: boolean;
  adaptive_stage?: number;
  recurrence_id?: number | null;
  parent_habit_id?: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubtaskRecord {
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

export interface ReminderRecord {
  id: number;
  activity_id: number;
  user_id: number;
  remind_at: string;
  message: string | null;
  status: ReminderStatus;
  snooze_until: string | null;
  dismissed_at: string | null;
  locked_by_scheduler_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpRecord {
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
}

export interface InAppNotificationRecord {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  read_at: string | null;
}

export interface NotificationJobRecord {
  job_id: string;
  reminder_id: number | null;
  user_id: number;
  channel: NotificationChannel;
  status: JobStatus;
  attempt: number;
  max_attempts: number;
  available_at: string;
  processing_started_at: string | null;
  last_error: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface DeliveryRecord {
  idempotency_key: string;
  job_id: string;
  recipient: string;
  sent_at: string;
  channel: NotificationChannel;
}

export interface AuditLogRecord {
  id: number;
  admin_id: number | null;
  admin_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

export interface SystemMetrics {
  jobs_created: number;
  jobs_processed: number;
  jobs_failed: number;
  jobs_retried: number;
  jobs_dead_lettered: number;
  notifications_sent: number;
  notifications_skipped: number;
  worker_processing_time_total_ms: number;
  worker_processing_time_avg_ms: number;
}
