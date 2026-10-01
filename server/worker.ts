import { db } from "./store";
import { postgresDb } from "./postgres";
import { redis } from "./redis";
import { getActiveEmailProvider } from "./email";
import { renderReminderEmail } from "./emailTemplates";
import { NotificationJobRecord, ActivityRecord, UserRecord } from "./types";

export class AsyncNotificationWorker {
  private timer: NodeJS.Timeout | null = null;
  private leaseWatchdogTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private maxConcurrency = 3;
  private activeWorkers = 0;
  private leaseTimeoutMs = 15000; // 15 seconds lease duration

  // Simulation flags for Failure Lab
  public simulateCrashBeforeSend = false;
  public simulateCrashAfterSend = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => this.processNextJob(), 1000);
    this.leaseWatchdogTimer = setInterval(() => this.checkStuckLeases(), 5000);
    console.log("[WORKER] Async Notification Worker started with lease watchdog");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.leaseWatchdogTimer) {
      clearInterval(this.leaseWatchdogTimer);
      this.leaseWatchdogTimer = null;
    }
    this.isRunning = false;
    console.log("[WORKER] Async Notification Worker stopped");
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  getActiveWorkers(): number {
    return this.activeWorkers;
  }

  /**
   * Worker Loop: Claims job atomically from Redis using RPOPLPUSH
   * queue:notifications -> queue:processing
   */
  async processNextJob() {
    if (!this.isRunning || this.activeWorkers >= this.maxConcurrency) {
      return;
    }

    if (!redis.getIsConnected() || !db.isDbConnected) {
      return;
    }

    try {
      // 1. Atomic lease claim via Redis
      const rawJob = await redis.rpoplpush("queue:notifications", "queue:processing");
      if (!rawJob) return;

      const job: NotificationJobRecord = JSON.parse(rawJob);
      const now = new Date();

      // Check available_at for backoff retry delays
      if (job.available_at && new Date(job.available_at) > now) {
        // Return to notifications queue if backoff delay hasn't expired yet
        await redis.lrem("queue:processing", rawJob);
        await redis.rpush("queue:notifications", rawJob);
        return;
      }

      this.activeWorkers++;
      this.executeJob(job, rawJob).finally(() => {
        this.activeWorkers--;
      });
    } catch (err) {
      console.error("[WORKER] Error in worker claim cycle:", err);
    }
  }

  /**
   * Executes a claimed job with all Phase 3 validations:
   * 1. Schema check
   * 2. Double-check PostgreSQL state (skip if completed or cancelled)
   * 3. Quiet hours & timezone check
   * 4. Deterministic idempotency delivery verification
   * 5. Dispatch email & in-app notifications
   * 6. Exponential backoff or DLQ on failure
   */
  private async executeJob(job: NotificationJobRecord, rawOriginalPayload: string) {
    const startTime = Date.now();
    const nowIso = new Date().toISOString();

    job.status = "PROCESSING";
    job.processing_started_at = nowIso;
    job.attempt++;
    job.updated_at = nowIso;

    // Update in store
    db.notificationJobs.set(job.job_id, job);

    const skipJob = async (reason: string) => {
      job.status = "SKIPPED";
      job.processing_started_at = null;
      job.last_error = reason;
      job.updated_at = new Date().toISOString();
      await redis.lrem("queue:processing", rawOriginalPayload);
      db.notificationJobs.set(job.job_id, job);
      db.metrics.notifications_skipped++;
      db.metrics.jobs_processed++;
      db.recordWorkerProcessingTime(Date.now() - startTime);
    };

    console.log(
      `[WORKER] Claimed job ${job.job_id} (attempt ${job.attempt}/${job.max_attempts}) for user ${job.user_id}`
    );

    // Chaos Simulation: Worker Crash Before Send
    if (this.simulateCrashBeforeSend) {
      this.simulateCrashBeforeSend = false;
      console.warn(
        `[WORKER SIMULATION] CRASH BEFORE SEND simulated for job ${job.job_id}! Leaving in processing queue.`
      );
      // Exit without completing or acking; watchdog will recover it
      return;
    }

    try {
      // 2. RE-CHECK POSTGRESQL: Double-check activity & reminder state
      let activity: ActivityRecord | undefined;
      let reminder: any | undefined;
      let reminderTitle = "Scheduled Activity";

      if (job.reminder_id) {
        reminder = await postgresDb.queryOne<any>("SELECT * FROM reminders WHERE id = $1;", [job.reminder_id]);
        if (!reminder) {
          await skipJob("Skipped: Reminder no longer exists");
          return;
        }
        if (reminder.status !== "DUE") {
          await skipJob(`Skipped: Reminder is ${reminder.status}`);
          return;
        }

        const actRow = await postgresDb.queryOne<any>("SELECT * FROM activities WHERE id = $1;", [reminder.activity_id]);
        if (!actRow) {
          await skipJob("Skipped: Activity no longer exists");
          return;
        }
        activity = postgresDb.mapActivityRow(actRow);
        reminderTitle = activity.title;
      } else if (job.metadata?.activity_id) {
        const actRow = await postgresDb.queryOne<any>("SELECT * FROM activities WHERE id = $1;", [job.metadata.activity_id]);
        if (!actRow) {
          await skipJob("Skipped: Activity no longer exists");
          return;
        }
        activity = postgresDb.mapActivityRow(actRow);
        reminderTitle = activity.title;
      }

      // Business Rule: If activity is COMPLETED or CANCELLED, DO NOT SEND!
      if (activity && (activity.status === "COMPLETED" || activity.status === "CANCELLED")) {
        console.log(
          `[WORKER] Activity ${activity.id} is ${activity.status}. Skipping notification for job ${job.job_id}.`
        );
        await skipJob(`Skipped: Activity is ${activity.status}`);
        return;
      }

      // 3. User quiet hours & timezone verification
      const userRow = await postgresDb.queryOne<any>("SELECT * FROM users WHERE id = $1;", [job.user_id]);
      if (!userRow) {
        throw new Error(`User with ID ${job.user_id} not found.`);
      }
      const user = postgresDb.mapUserRow(userRow);

      if (!user.email_verified) {
        await skipJob("Skipped: User email is not verified");
        return;
      }

      if (user.preferences?.email_notifications_enabled === false) {
        await skipJob("Skipped: User email notifications are disabled");
        return;
      }

      if (this.isUserInQuietHours(user)) {
        console.log(
          `[WORKER] User ${user.email} is currently in Quiet Hours (${user.preferences.timezone}). Skipping notification.`
        );
        await skipJob("Skipped: Quiet Hours active in user timezone");
        return;
      }

      // 4. Deterministic Idempotency Verification
      if (await db.isAlreadyDelivered(job.idempotency_key)) {
        console.log(
          `[WORKER] Idempotency key ${job.idempotency_key} already delivered. Marking job ${job.job_id} SENT without duplicate dispatch.`
        );
        job.status = "SENT";
        job.processing_started_at = null;
        job.updated_at = new Date().toISOString();

        await redis.lrem("queue:processing", rawOriginalPayload);
        db.notificationJobs.set(job.job_id, job);
        db.metrics.jobs_processed++;
        db.recordWorkerProcessingTime(Date.now() - startTime);
        return;
      }

      // 5. Deliver Notification
      const emailProvider = getActiveEmailProvider();
      const dueTime = reminder?.remind_at || activity?.deadline || job.metadata?.remind_at;
      const message = reminder?.message || job.metadata?.message || `Your activity "${reminderTitle}" is due.`;
      const email = renderReminderEmail({
        userName: user.name,
        activityTitle: reminderTitle,
        dueAt: dueTime,
        timezone: user.preferences?.timezone,
        importance: activity?.importance,
        notes: message,
        appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, ""),
      });
      const emailResult = await emailProvider.sendEmail({
        to: user.email,
        ...email,
      });

      if (!emailResult.success) {
        const errorMsg = emailResult.error || "Email provider dispatch failure";
        const isTransient = emailResult.isTransient !== false;
        throw new WorkerDeliveryError(errorMsg, isTransient);
      }

      // Chaos Simulation: Worker Crash After Send
      if (this.simulateCrashAfterSend) {
        this.simulateCrashAfterSend = false;
        console.warn(
          `[WORKER SIMULATION] CRASH AFTER SEND simulated for job ${job.job_id}! Delivery sent but ACK aborted.`
        );
        // Do not ack or record delivery yet to simulate post-send network crash
        return;
      }

      // Record successful delivery for idempotency in PostgreSQL
      await db.recordDelivery(job.idempotency_key, job.job_id, user.email, "EMAIL");

      // In-App Notification Dispatch directly into PostgreSQL
      await postgresDb.query(
        `INSERT INTO notifications (user_id, title, message, type, channel, status, read, created_at)
         VALUES ($1, $2, $3, 'REMINDER', 'IN_APP', 'UNREAD', false, NOW());`,
        [user.id, `Reminder: ${reminderTitle}`, job.metadata?.message || `Your activity "${reminderTitle}" is due.`]
      );

      // Finalize Job Success
      job.status = "SENT";
      job.processing_started_at = null;
      job.last_error = null;
      job.updated_at = new Date().toISOString();

      // Remove from processing queue
      await redis.lrem("queue:processing", rawOriginalPayload);
      db.notificationJobs.set(job.job_id, job);

      db.metrics.jobs_processed++;
      db.metrics.notifications_sent++;
      db.recordWorkerProcessingTime(Date.now() - startTime);

      console.log(`[WORKER] Successfully delivered job ${job.job_id} to ${user.email}`);
    } catch (err: any) {
      console.error(`[WORKER] Job ${job.job_id} failed:`, err?.message);
      db.metrics.jobs_failed++;

      const isTransient = err instanceof WorkerDeliveryError ? err.isTransient : true;
      const errorMsg = err?.message || "Unknown worker processing failure";
      job.last_error = errorMsg;
      job.processing_started_at = null;
      job.updated_at = new Date().toISOString();

      // Remove from processing queue
      await redis.lrem("queue:processing", rawOriginalPayload);

      // Retry vs Dead Letter decision
      if (isTransient && job.attempt < job.max_attempts) {
        // Exponential Backoff: 1s, 2s, 4s, 8s
        const backoffSec = Math.pow(2, job.attempt - 1);
        job.status = "RETRYING";
        job.available_at = new Date(Date.now() + backoffSec * 1000).toISOString();

        console.log(
          `[WORKER] Transient failure on job ${job.job_id}. Retrying in ${backoffSec}s (attempt ${job.attempt}/${job.max_attempts})`
        );

        db.metrics.jobs_retried++;
        db.notificationJobs.set(job.job_id, job);
        await redis.enqueueNotificationJob(job);
      } else {
        // Permanent error or attempts exhausted -> Move to DLQ
        console.warn(
          `[WORKER] Job ${job.job_id} permanently failed or exhausted retries. Moving to DEAD LETTER QUEUE (DLQ).`
        );
        job.status = "DEAD_LETTER";
        db.metrics.jobs_dead_lettered++;
        db.notificationJobs.set(job.job_id, job);
        await redis.moveToDeadLetter(job);
      }

      db.recordWorkerProcessingTime(Date.now() - startTime);
    }
  }

  /**
   * Checks if user is currently inside their configured Quiet Hours
   */
  private isUserInQuietHours(user: UserRecord): boolean {
    if (!user.preferences || !user.preferences.quiet_hours_enabled) {
      return false;
    }

    try {
      const timezone = user.preferences.timezone || "UTC";
      const now = new Date();
      // Format current time in user's timezone as HH:MM
      const userTimeStr = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);

      const [currentHour, currentMin] = userTimeStr.split(":").map(Number);
      const currentMinutes = currentHour * 60 + currentMin;

      const [startHour, startMin] = (user.preferences.quiet_hours_start || "22:00").split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;

      const [endHour, endMin] = (user.preferences.quiet_hours_end || "08:00").split(":").map(Number);
      const endMinutes = endHour * 60 + endMin;

      if (startMinutes > endMinutes) {
        // Spans midnight (e.g. 22:00 to 08:00)
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      } else {
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      }
    } catch {
      return false;
    }
  }

  /**
   * Lease Timeout Watchdog:
   * Inspects queue:processing for stuck jobs whose processing_started_at exceeded lease duration.
   * Reclaims and requeues them or moves to DLQ if exhausted.
   */
  async checkStuckLeases() {
    if (!redis.getIsConnected()) return;

    try {
      const processingItems = await redis.lrange("queue:processing", 0, -1);
      const now = Date.now();

      for (const rawItem of processingItems) {
        try {
          const job: NotificationJobRecord = JSON.parse(rawItem);
          if (!job.processing_started_at) continue;

          const startedTime = new Date(job.processing_started_at).getTime();
          if (now - startedTime > this.leaseTimeoutMs) {
            console.warn(
              `[LEASE WATCHDOG] Detected stuck job ${job.job_id} (lease expired after ${Math.round(
                (now - startedTime) / 1000
              )}s). Reclaiming lease.`
            );

            await redis.lrem("queue:processing", rawItem);

            if (job.attempt < job.max_attempts) {
              job.status = "RETRYING";
              job.processing_started_at = null;
              job.last_error = "Worker lease expired (unresponsive worker recovered)";
              job.updated_at = new Date().toISOString();
              db.notificationJobs.set(job.job_id, job);
              await redis.enqueueNotificationJob(job);
              db.metrics.jobs_retried++;
            } else {
              job.status = "DEAD_LETTER";
              job.processing_started_at = null;
              job.last_error = "Worker lease expired repeatedly; attempts exhausted";
              job.updated_at = new Date().toISOString();
              db.notificationJobs.set(job.job_id, job);
              await redis.moveToDeadLetter(job);
              db.metrics.jobs_dead_lettered++;
            }
          }
        } catch {
          // Bad payload format
        }
      }
    } catch (err) {
      console.error("[LEASE WATCHDOG] Error checking leases:", err);
    }
  }
}

class WorkerDeliveryError extends Error {
  public isTransient: boolean;
  constructor(message: string, isTransient: boolean) {
    super(message);
    this.name = "WorkerDeliveryError";
    this.isTransient = isTransient;
  }
}

export const worker = new AsyncNotificationWorker();
