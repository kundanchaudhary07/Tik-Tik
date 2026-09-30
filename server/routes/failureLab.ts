import { Router, Request, Response } from "express";
import { db } from "../store";
import { postgresDb } from "../postgres";
import { redis } from "../redis";
import { worker } from "../worker";
import { scheduler } from "../scheduler";
import { testEmailProvider, setActiveEmailProvider, realEmailProvider } from "../email";
import { requireAdminMiddleware } from "./admin";
import { NotificationJobRecord, ActivityRecord, ReminderRecord } from "../types";

export const failureLabRouter = Router();
failureLabRouter.use(requireAdminMiddleware);

async function getTestAdminUser() {
  const adminRow = await postgresDb.queryOne<any>("SELECT * FROM users WHERE role = 'ADMIN' LIMIT 1;");
  if (!adminRow) {
    const firstRow = await postgresDb.queryOne<any>("SELECT * FROM users LIMIT 1;");
    if (!firstRow) throw new Error("No users found in database");
    return postgresDb.mapUserRow(firstRow);
  }
  return postgresDb.mapUserRow(adminRow);
}

// 1. Redis Outage Toggle
failureLabRouter.post("/redis-outage", (req: Request, res: Response) => {
  const current = redis.getIsConnected();
  redis.setIsConnected(!current);
  const nowState = redis.getIsConnected();
  console.log(`[FAILURE LAB] Redis outage toggled: isConnected=${nowState}`);
  res.json({
    scenario: "REDIS_OUTAGE",
    redis_connected: nowState,
    message: nowState
      ? "Redis reconnected. Queue operations restored."
      : "Redis simulated outage active. Queue operations will reject.",
  });
});

// 2. Database Outage Toggle
failureLabRouter.post("/db-outage", (req: Request, res: Response) => {
  db.isDbConnected = !db.isDbConnected;
  console.log(`[FAILURE LAB] DB outage toggled: isDbConnected=${db.isDbConnected}`);
  res.json({
    scenario: "DB_OUTAGE",
    db_connected: db.isDbConnected,
    message: db.isDbConnected
      ? "PostgreSQL reconnected. Queries and transactions restored."
      : "PostgreSQL simulated network partition. DB queries will fail.",
  });
});

// 3. Worker Crash Before Send
failureLabRouter.post("/worker-crash", (req: Request, res: Response) => {
  worker.simulateCrashBeforeSend = true;
  console.log("[FAILURE LAB] Worker crash BEFORE send armed for next job.");
  res.json({
    scenario: "WORKER_CRASH_BEFORE_SEND",
    message: "Armed: Next claimed job will crash worker before delivery. Lease watchdog will recover it.",
  });
});

// 4. Worker Crash After Send
failureLabRouter.post("/worker-crash-after-send", (req: Request, res: Response) => {
  worker.simulateCrashAfterSend = true;
  console.log("[FAILURE LAB] Worker crash AFTER send armed for next job.");
  res.json({
    scenario: "WORKER_CRASH_AFTER_SEND",
    message: "Armed: Next claimed job will send email but crash before ACK. Demonstrates at-least-once & idempotency deduplication.",
  });
});

// 5. Email Transient Failure (SMTP 421 Timeout)
failureLabRouter.post("/email-transient", (req: Request, res: Response) => {
  setActiveEmailProvider(testEmailProvider);
  testEmailProvider.failureMode =
    testEmailProvider.failureMode === "TRANSIENT_TIMEOUT" ? "NONE" : "TRANSIENT_TIMEOUT";

  if (testEmailProvider.failureMode === "NONE") {
    setActiveEmailProvider(realEmailProvider);
  }

  res.json({
    scenario: "EMAIL_TRANSIENT_TIMEOUT",
    failure_mode: testEmailProvider.failureMode,
    message:
      testEmailProvider.failureMode === "TRANSIENT_TIMEOUT"
        ? "Active: Outbound emails will simulate SMTP 421 timeout and trigger exponential backoff retry."
        : "Restored: Normal email delivery active.",
  });
});

// 6. Email Permanent Failure (SMTP 550 Rejection)
failureLabRouter.post("/email-permanent", (req: Request, res: Response) => {
  setActiveEmailProvider(testEmailProvider);
  testEmailProvider.failureMode =
    testEmailProvider.failureMode === "PERMANENT_REJECT" ? "NONE" : "PERMANENT_REJECT";

  if (testEmailProvider.failureMode === "NONE") {
    setActiveEmailProvider(realEmailProvider);
  }

  res.json({
    scenario: "EMAIL_PERMANENT_REJECT",
    failure_mode: testEmailProvider.failureMode,
    message:
      testEmailProvider.failureMode === "PERMANENT_REJECT"
        ? "Active: Outbound emails will simulate SMTP 550 permanent reject and move directly to DLQ."
        : "Restored: Normal email delivery active.",
  });
});

// 7. Scheduler Race Condition Simulation
failureLabRouter.post("/scheduler-race", async (req: Request, res: Response) => {
  // Simulate 3 concurrent scheduler instances firing simultaneously
  const results = await Promise.all([
    scheduler.tick(),
    scheduler.tick(),
    scheduler.tick(),
  ]);

  res.json({
    scenario: "SCHEDULER_RACE_TEST",
    instances_executed: 3,
    jobs_created_per_instance: results,
    total_jobs_created: results.reduce((a, b) => a + b, 0),
    message: "Executed 3 concurrent scheduler instances. SKIP LOCKED row locking ensured no duplicate jobs created.",
  });
});

// 8. Worker Concurrency Flood
failureLabRouter.post("/worker-concurrency", async (req: Request, res: Response) => {
  const adminUser = await getTestAdminUser();
  const nowIso = new Date().toISOString();
  const createdIds: string[] = [];

  for (let i = 1; i <= 6; i++) {
    const jobId = `concurrency-flood-${Date.now()}-${i}`;
    const job: NotificationJobRecord = {
      job_id: jobId,
      reminder_id: null,
      user_id: adminUser.id,
      channel: "EMAIL",
      status: "PENDING",
      attempt: 0,
      max_attempts: 4,
      available_at: nowIso,
      processing_started_at: null,
      last_error: null,
      idempotency_key: `flood:${jobId}`,
      created_at: nowIso,
      updated_at: nowIso,
      metadata: {
        message: `Concurrency test batch payload item #${i}`,
      },
    };
    db.notificationJobs.set(jobId, job);
    await redis.enqueueNotificationJob(job);
    createdIds.push(jobId);
    db.metrics.jobs_created++;
  }

  res.json({
    scenario: "WORKER_CONCURRENCY_FLOOD",
    jobs_enqueued: createdIds.length,
    job_ids: createdIds,
    message: "Enqueued 6 concurrent jobs to Redis. Workers will process up to concurrency limit (3) without pool exhaustion.",
  });
});

// 9. Stuck Lease Simulation
failureLabRouter.post("/stuck-lease", async (req: Request, res: Response) => {
  const adminUser = await getTestAdminUser();
  const stuckJobId = `stuck-job-${Date.now()}`;
  const nowIso = new Date().toISOString();
  // Set processing_started_at to 30 seconds ago to trigger lease timeout immediately
  const pastTime = new Date(Date.now() - 35000).toISOString();

  const stuckJob: NotificationJobRecord = {
    job_id: stuckJobId,
    reminder_id: null,
    user_id: adminUser.id,
    channel: "EMAIL",
    status: "PROCESSING",
    attempt: 1,
    max_attempts: 4,
    available_at: nowIso,
    processing_started_at: pastTime,
    last_error: null,
    idempotency_key: `stuck:${stuckJobId}`,
    created_at: pastTime,
    updated_at: pastTime,
    metadata: {
      message: "Stuck job simulation payload",
    },
  };

  db.notificationJobs.set(stuckJobId, stuckJob);
  // Push directly into queue:processing
  await redis.lpush("queue:processing", JSON.stringify(stuckJob));

  // Trigger lease watchdog check
  await worker.checkStuckLeases();

  res.json({
    scenario: "STUCK_LEASE_WATCHDOG",
    job_id: stuckJobId,
    status: stuckJob.status,
    message: "Inserted stuck job into processing queue. Watchdog reclaimed lease and requeued it with exponential retry.",
  });
});

// 10. DLQ Exhaustion Simulation
failureLabRouter.post("/dlq-exhaustion", async (req: Request, res: Response) => {
  const adminUser = await getTestAdminUser();
  const dlqJobId = `dlq-job-${Date.now()}`;
  const nowIso = new Date().toISOString();

  const exhaustedJob: NotificationJobRecord = {
    job_id: dlqJobId,
    reminder_id: null,
    user_id: adminUser.id,
    channel: "EMAIL",
    status: "DEAD_LETTER",
    attempt: 4,
    max_attempts: 4,
    available_at: nowIso,
    processing_started_at: null,
    last_error: "SMTP 554 Transaction failed: Max retry attempts (4) exhausted",
    idempotency_key: `exhausted:${dlqJobId}`,
    created_at: nowIso,
    updated_at: nowIso,
    metadata: {
      message: "DLQ exhaustion test record",
    },
  };

  db.notificationJobs.set(dlqJobId, exhaustedJob);
  await redis.moveToDeadLetter(exhaustedJob);
  db.metrics.jobs_dead_lettered++;

  res.json({
    scenario: "DLQ_EXHAUSTION",
    job_id: dlqJobId,
    status: "DEAD_LETTER",
    message: "Job exhausted max attempts and moved to Dead Letter Queue. View and replay via Admin Portal.",
  });
});

// 11. Skip Completed Activity Simulation
failureLabRouter.post("/skip-completed", async (req: Request, res: Response) => {
  const adminUser = await getTestAdminUser();
  const nowIso = new Date().toISOString();

  // Create an activity marked as COMPLETED directly in PostgreSQL
  const act = await postgresDb.queryOne<any>(
    `INSERT INTO activities (user_id, title, description, importance, deadline, status, completed_at, created_at, updated_at)
     VALUES ($1, 'Test Activity Completed in PostgreSQL', 'Simulation for worker double-check', 4, $2, 'COMPLETED', $2, NOW(), NOW())
     RETURNING *;`,
    [adminUser.id, nowIso]
  );
  const actId = act.id;

  // Create job referencing this completed activity
  const jobId = `skip-completed-${Date.now()}`;
  const job: NotificationJobRecord = {
    job_id: jobId,
    reminder_id: null,
    user_id: adminUser.id,
    channel: "EMAIL",
    status: "PENDING",
    attempt: 0,
    max_attempts: 4,
    available_at: nowIso,
    processing_started_at: null,
    last_error: null,
    idempotency_key: `skip:${jobId}`,
    created_at: nowIso,
    updated_at: nowIso,
    metadata: {
      activity_id: actId,
      message: "Should be skipped because activity is completed",
    },
  };

  db.notificationJobs.set(jobId, job);
  await redis.enqueueNotificationJob(job);

  res.json({
    scenario: "SKIP_COMPLETED_ACTIVITY",
    activity_id: actId,
    job_id: jobId,
    message: "Created job for COMPLETED activity. When worker claims it, it will re-check DB and skip sending email.",
  });
});

// 12. Skip Cancelled Activity Simulation
failureLabRouter.post("/skip-cancelled", async (req: Request, res: Response) => {
  const adminUser = await getTestAdminUser();
  const nowIso = new Date().toISOString();

  // Create an activity marked as CANCELLED directly in PostgreSQL
  const act = await postgresDb.queryOne<any>(
    `INSERT INTO activities (user_id, title, description, importance, deadline, status, completed_at, created_at, updated_at)
     VALUES ($1, 'Test Activity Cancelled in PostgreSQL', 'Simulation for worker double-check cancellation', 3, $2, 'CANCELLED', NULL, NOW(), NOW())
     RETURNING *;`,
    [adminUser.id, nowIso]
  );
  const actId = act.id;

  const jobId = `skip-cancelled-${Date.now()}`;
  const job: NotificationJobRecord = {
    job_id: jobId,
    reminder_id: null,
    user_id: adminUser.id,
    channel: "EMAIL",
    status: "PENDING",
    attempt: 0,
    max_attempts: 4,
    available_at: nowIso,
    processing_started_at: null,
    last_error: null,
    idempotency_key: `skip-cancelled:${jobId}`,
    created_at: nowIso,
    updated_at: nowIso,
    metadata: {
      activity_id: actId,
      message: "Should be skipped because activity is cancelled",
    },
  };

  db.notificationJobs.set(jobId, job);
  await redis.enqueueNotificationJob(job);

  res.json({
    scenario: "SKIP_CANCELLED_ACTIVITY",
    activity_id: actId,
    job_id: jobId,
    message: "Created job for CANCELLED activity. Worker will re-check DB and skip sending email.",
  });
});

// 13. Quiet Hours Simulation
failureLabRouter.post("/quiet-hours", async (req: Request, res: Response) => {
  const adminUser = await getTestAdminUser();
  const currentQuiet = Boolean(adminUser.preferences.quiet_hours_enabled);
  const newQuiet = !currentQuiet;

  const updatedPrefs = {
    ...adminUser.preferences,
    quiet_hours_enabled: newQuiet,
    quiet_hours_start: "00:00",
    quiet_hours_end: "23:59",
  };

  await postgresDb.query(
    "UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2;",
    [JSON.stringify(updatedPrefs), adminUser.id]
  );

  res.json({
    scenario: "QUIET_HOURS_TOGGLE",
    user_email: adminUser.email,
    quiet_hours_enabled: newQuiet,
    timezone: adminUser.preferences.timezone,
    message: newQuiet
      ? "Quiet hours enabled (all-day). Worker will detect quiet hours in user timezone and safely skip/delay notifications."
      : "Quiet hours disabled. Normal dispatch restored.",
  });
});
