import { db } from "./store";
import { postgresDb } from "./postgres";
import { redis } from "./redis";
import { NotificationJobRecord } from "./types";

export class NotificationScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private intervalMs = 3000; // 3 seconds periodic check

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    console.log(`[SCHEDULER] Started periodic reminder scheduler (interval: ${this.intervalMs}ms)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log("[SCHEDULER] Stopped reminder scheduler");
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Main scheduler tick:
   * 1. Checks PostgreSQL connectivity.
   * 2. Scans for due reminders in PostgreSQL.
   * 3. Uses atomic SKIP LOCKED row locking simulation.
   * 4. Enforces deterministic idempotency key (reminder:{id}:{remind_at}) to guarantee no duplicate jobs.
   * 5. Enqueues to Redis queue:notifications.
   */
  async tick(): Promise<number> {
    if (!postgresDb.isConnected) {
      console.warn("[SCHEDULER] PostgreSQL connection unavailable; skipping tick.");
      return 0;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let jobsCreatedCount = 0;

    try {
      // Find due reminders directly from PostgreSQL
      const dueReminders = await postgresDb.query<any>(`
        SELECT 
          r.*,
          a.status as activity_status,
          a.title as activity_title
        FROM reminders r
        LEFT JOIN activities a ON r.activity_id = a.id
        WHERE r.status = 'SCHEDULED' AND r.remind_at <= NOW();
      `);

      for (const rem of dueReminders) {
        // Check if parent activity is completed or cancelled
        if (rem.activity_status === "COMPLETED" || rem.activity_status === "CANCELLED") {
          await postgresDb.query(
            "UPDATE reminders SET status = 'DISMISSED', updated_at = NOW() WHERE id = $1;",
            [rem.id]
          );
          continue;
        }

        // 1. Row Locking Simulation: PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED
        const lockAcquired = db.lockReminderForScheduler(rem.id);
        if (!lockAcquired) {
          continue;
        }

        try {
          // 2. Deterministic Idempotency Key
          const remindAtIso = new Date(rem.remind_at).toISOString();
          const idempotencyKey = `reminder:${rem.id}:${remindAtIso}`;

          // Check if job already created or delivered
          let existingJob: NotificationJobRecord | undefined;
          for (const j of db.notificationJobs.values()) {
            if (j.idempotency_key === idempotencyKey) {
              existingJob = j;
              break;
            }
          }

          const isDelivered = await db.isAlreadyDelivered(idempotencyKey);
          if (existingJob || isDelivered) {
            await postgresDb.query(
              "UPDATE reminders SET status = 'DUE', updated_at = NOW() WHERE id = $1;",
              [rem.id]
            );
            continue;
          }

          // 3. Create Notification Job Record
          const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const job: NotificationJobRecord = {
            job_id: jobId,
            reminder_id: rem.id,
            user_id: rem.user_id,
            channel: "EMAIL",
            status: "PENDING",
            attempt: 0,
            max_attempts: 4,
            available_at: nowIso,
            processing_started_at: null,
            last_error: null,
            idempotency_key: idempotencyKey,
            created_at: nowIso,
            updated_at: nowIso,
            metadata: {
              activity_id: rem.activity_id,
              remind_at: remindAtIso,
              message: rem.message,
            },
          };

          // Persist to runtime queue and enqueue to Redis
          db.notificationJobs.set(jobId, job);
          await redis.enqueueNotificationJob(job);

          // Update reminder state in PostgreSQL
          await postgresDb.query(
            "UPDATE reminders SET status = 'DUE', updated_at = NOW() WHERE id = $1;",
            [rem.id]
          );

          db.metrics.jobs_created++;
          jobsCreatedCount++;

          console.log(
            `[SCHEDULER] Queued reminder job ${jobId} for user ${rem.user_id} (key: ${idempotencyKey})`
          );
        } finally {
          db.unlockReminder(rem.id);
        }
      }

      // 2. Scan for Adaptive Reminders from PostgreSQL on active activities
      const adaptiveActivities = await postgresDb.query<any>(`
        SELECT * FROM activities
        WHERE is_adaptive_reminder = true
          AND deadline IS NOT NULL
          AND status NOT IN ('COMPLETED', 'CANCELLED');
      `);

      for (const act of adaptiveActivities) {
        const deadlineTime = new Date(act.deadline).getTime();
        const diffMs = deadlineTime - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours < 0) continue;

        let stage = 0;
        let stageLabel = "";

        if (diffHours <= 0.25) {
          stage = 5;
          stageLabel = "15 minutes remaining";
        } else if (diffHours <= 1) {
          stage = 4;
          stageLabel = "1 hour remaining";
        } else if (diffHours <= 6) {
          stage = 3;
          stageLabel = "6 hours remaining";
        } else if (diffHours <= 24) {
          stage = 2;
          stageLabel = "1 day remaining";
        } else if (diffHours <= 72) {
          stage = 1;
          stageLabel = "3 days remaining";
        }

        if (stage === 0) continue;

        const currentStage = act.adaptive_stage || 0;
        if (stage > currentStage) {
          const idempotencyKey = `adaptive:${act.id}:stage_${stage}`;

          let alreadyQueued = false;
          for (const j of db.notificationJobs.values()) {
            if (j.idempotency_key === idempotencyKey) {
              alreadyQueued = true;
              break;
            }
          }

          const isDelivered = await db.isAlreadyDelivered(idempotencyKey);
          if (alreadyQueued || isDelivered) {
            await postgresDb.query(
              "UPDATE activities SET adaptive_stage = $1, updated_at = NOW() WHERE id = $2;",
              [stage, act.id]
            );
            continue;
          }

          const jobId = `adaptive-${act.id}-${stage}-${Date.now()}`;
          const job: NotificationJobRecord = {
            job_id: jobId,
            reminder_id: null,
            user_id: act.user_id,
            channel: "EMAIL",
            status: "PENDING",
            attempt: 0,
            max_attempts: 4,
            available_at: nowIso,
            processing_started_at: null,
            last_error: null,
            idempotency_key: idempotencyKey,
            created_at: nowIso,
            updated_at: nowIso,
            metadata: {
              activity_id: act.id,
              remind_at: nowIso,
              message: `Adaptive reminder (${stageLabel}): "${act.title}" is due soon.`,
            },
          };

          db.notificationJobs.set(jobId, job);
          await redis.enqueueNotificationJob(job);

          await postgresDb.query(
            "UPDATE activities SET adaptive_stage = $1, updated_at = NOW() WHERE id = $2;",
            [stage, act.id]
          );

          db.metrics.jobs_created++;
          jobsCreatedCount++;

          console.log(
            `[SCHEDULER] Queued adaptive reminder job ${jobId} for user ${act.user_id} (${stageLabel})`
          );
        }
      }
    } catch (err) {
      console.error("[SCHEDULER TICK ERROR]", err);
    }

    return jobsCreatedCount;
  }
}

export const scheduler = new NotificationScheduler();
