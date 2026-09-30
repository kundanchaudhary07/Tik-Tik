export type UserRole = "USER" | "ADMIN";

export interface UserPreferences {
  timezone?: string;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  email_notifications_enabled?: boolean;
  occupation?: "Student" | "Employee" | "Business owner" | "Professional" | "Other";
}

export interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  email_verified_at: string | null;
  preferences?: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface AuthTokens {
  token?: string;
  access_token?: string;
  token_type?: string;
  expires_in_minutes?: number;
  user: User;
}

export interface ApiError {
  error?: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message?: string }>;
  };
  request_id?: string;
}

export interface HealthStatus {
  status: string;
  service?: string;
  uptime_seconds?: number;
  database?: string;
  timestamp?: number;
  connection_pool?: {
    size: number;
    checked_in: number;
    checked_out: number;
    overflow: number;
  };
}

export interface TransactionResult {
  status: "committed" | "rolled_back";
  message: string;
  item_a_id?: number;
  item_b_id?: number;
  error_encountered?: string;
  operation_a_rolled_back?: boolean;
  acid_guarantee?: string;
}

export interface ConcurrencyResult {
  strategy: string;
  counter: number;
  version: number;
  explanation?: string;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  email_verified_at: string | null;
  created_at: string;
  activities_count: number;
  reminders_count: number;
}

export interface AdminActivity {
  id: number;
  owner_id: number;
  owner_email: string;
  title: string;
  description: string | null;
  deadline: string | null;
  importance: string;
  urgency: string;
  priority: string;
  status: string;
  subtasks_count: number;
  reminders_count: number;
  created_at: string;
}

export interface AdminReminder {
  id: number;
  owner_id: number;
  owner_email: string;
  activity_id: number;
  activity_title: string;
  remind_at: string;
  notes: string | null;
  status: string;
  created_at: string;
}

export interface AdminFollowUp {
  id: number;
  owner_id: number;
  owner_email: string;
  activity_id: number;
  activity_title: string;
  notes: string | null;
  scheduled_date: string | null;
  status: string;
  created_at: string;
}

export interface InAppNotification {
  id: number;
  user_id: number;
  user_email?: string;
  channel?: string;
  title: string;
  message: string;
  body?: string;
  type: string;
  read: boolean;
  is_read?: boolean;
  created_at: string;
  read_at: string | null;
}

export type JobStatus = "PENDING" | "PROCESSING" | "SENT" | "RETRYING" | "FAILED" | "DEAD_LETTER";

export interface NotificationJob {
  job_id: string;
  reminder_id: number | null;
  user_id: number;
  recipient?: string;
  channel: "EMAIL" | "IN_APP";
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

export interface AdminEmailJob {
  id: number;
  user_id: number | null;
  recipient: string;
  subject: string;
  email_type: string;
  status: JobStatus;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  safe_metadata: Record<string, any> | null;
  created_at: string;
  sent_at: string | null;
  failed_at: string | null;
  next_retry_at: string | null;
}

export interface AdminHealth {
  status: string;
  timestamp: string;
  database: {
    status: string;
    latency_ms: number;
    pool_size: number;
    checked_out_connections: number;
    overflow_connections: number;
    checked_in_connections: number;
  };
  redis: {
    is_connected: boolean;
    is_real_redis: boolean;
    ping_latency_ms: number;
    pending_queue_length: number;
    processing_queue_length: number;
    dead_letter_length: number;
  };
  worker: {
    status: string;
    is_running: boolean;
    active_workers: number;
    provider: string;
    lease_timeout_seconds: number;
  };
  metrics: {
    users: number;
    activities: number;
    reminders: number;
    jobs_created: number;
    jobs_processed: number;
    jobs_failed: number;
    jobs_retried: number;
    jobs_dead_lettered: number;
    notifications_sent: number;
    notifications_skipped: number;
    worker_processing_time_avg_ms: number;
  };
  email_provider?: {
    provider: string;
    sent_count: number;
  };
}

export interface AdminAuditLog {
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

