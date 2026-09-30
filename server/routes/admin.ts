import { Router, Request, Response, NextFunction } from "express";
import { db } from "../store";
import { postgresDb } from "../postgres";
import { redis } from "../redis";
import { worker } from "../worker";
import { getActiveEmailProvider } from "../email";
import { UserRecord, NotificationJobRecord } from "../types";

export const adminRouter = Router();

// Helper to recursively redact sensitive fields such as passwords, tokens, hashes, and secrets
export function redactSensitive(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const copy: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("hash") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("jwt") ||
      lower.includes("key") ||
      lower.includes("credential")
    ) {
      copy[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      copy[k] = redactSensitive(v);
    } else {
      copy[k] = v;
    }
  }
  return copy;
}

// Middleware: Require Admin role
export function requireAdminMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as UserRecord | undefined;
  if (!user) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required." },
    });
  }

  if (user.role !== "ADMIN") {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Administrator role required for system operations.",
      },
    });
  }

  next();
}

adminRouter.use(requireAdminMiddleware);

// 1. GET /api/admin/users
adminRouter.get("/users", async (req: Request, res: Response) => {
  try {
    // Strip sensitive passwords, hashes, and tokens
    const rows = await postgresDb.query<any>(`
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.role, 
        u.is_active, 
        u.email_verified, 
        u.email_verified_at, 
        u.preferences, 
        u.created_at, 
        u.updated_at,
        u.last_login_at,
        (SELECT COUNT(*)::int FROM activities WHERE user_id = u.id) as activities_count,
        (SELECT COUNT(*)::int FROM reminders WHERE user_id = u.id) as reminders_count,
        (SELECT COUNT(*)::int FROM followups WHERE user_id = u.id) as followups_count,
        (SELECT COUNT(*)::int FROM habit_rules WHERE user_id = u.id) as habits_count
      FROM users u
      ORDER BY u.id DESC;
    `);

    const safeUsers = rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      is_active: u.is_active,
      email_verified: u.email_verified,
      email_verified_at: u.email_verified_at ? new Date(u.email_verified_at).toISOString() : null,
      preferences: typeof u.preferences === "string" ? JSON.parse(u.preferences) : u.preferences,
      activities_count: u.activities_count || 0,
      reminders_count: u.reminders_count || 0,
      followups_count: u.followups_count || 0,
      habits_count: u.habits_count || 0,
      created_at: new Date(u.created_at).toISOString(),
      updated_at: new Date(u.updated_at).toISOString(),
      last_login_at: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
    }));

    res.json(safeUsers);
  } catch (err: any) {
    console.error("[ADMIN GET USERS ERROR]", err);
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// 2. GET /api/admin/users/:id
adminRouter.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const u = await postgresDb.queryOne<any>(
      `SELECT id, email, name, role, is_active, email_verified, email_verified_at, preferences, created_at, updated_at, last_login_at
       FROM users WHERE id = $1;`,
      [id]
    );

    if (!u) {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: `User ${id} not found.` },
      });
    }

    res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      is_active: u.is_active,
      email_verified: u.email_verified,
      email_verified_at: u.email_verified_at ? new Date(u.email_verified_at).toISOString() : null,
      preferences: typeof u.preferences === "string" ? JSON.parse(u.preferences) : u.preferences,
      created_at: new Date(u.created_at).toISOString(),
      updated_at: new Date(u.updated_at).toISOString(),
      last_login_at: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// 2b. GET /api/admin/users/:id/details - REAL PostgreSQL User Activity & Records
adminRouter.get("/users/:id/details", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const user = await postgresDb.queryOne<any>(
      `SELECT id, email, name, role, is_active, email_verified, email_verified_at, preferences, created_at, updated_at, last_login_at
       FROM users WHERE id = $1;`,
      [id]
    );

    if (!user) {
      return res.status(404).json({
        error: { code: "USER_NOT_FOUND", message: `User ${id} not found.` },
      });
    }

    const [activities, subtasks, reminders, followups, habits, notifications, auditLogs] = await Promise.all([
      postgresDb.query<any>(`SELECT * FROM activities WHERE user_id = $1 ORDER BY id DESC;`, [id]),
      postgresDb.query<any>(
        `SELECT s.*, a.title as activity_title 
         FROM subtasks s 
         JOIN activities a ON s.activity_id = a.id 
         WHERE s.user_id = $1 
         ORDER BY s.id DESC;`,
        [id]
      ),
      postgresDb.query<any>(
        `SELECT r.*, a.title as activity_title 
         FROM reminders r 
         JOIN activities a ON r.activity_id = a.id 
         WHERE r.user_id = $1 
         ORDER BY r.id DESC;`,
        [id]
      ),
      postgresDb.query<any>(
        `SELECT f.*, a.title as activity_title 
         FROM followups f 
         JOIN activities a ON f.activity_id = a.id 
         WHERE f.user_id = $1 
         ORDER BY f.id DESC;`,
        [id]
      ),
      postgresDb.query<any>(
        `SELECT h.*, a.title as activity_title 
         FROM habit_rules h 
         LEFT JOIN activities a ON h.activity_id = a.id 
         WHERE h.user_id = $1 
         ORDER BY h.id DESC;`,
        [id]
      ),
      postgresDb.query<any>(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC;`, [id]),
      postgresDb.query<any>(
        `SELECT * FROM audit_logs 
         WHERE (target_type = 'USER' AND target_id = $1) OR admin_id = $2 
         ORDER BY created_at DESC;`,
        [String(id), id]
      ),
    ]);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
        email_verified: user.email_verified,
        email_verified_at: user.email_verified_at ? new Date(user.email_verified_at).toISOString() : null,
        created_at: new Date(user.created_at).toISOString(),
        updated_at: new Date(user.updated_at).toISOString(),
        last_login_at: user.last_login_at ? new Date(user.last_login_at).toISOString() : null,
      },
      activities: activities.map((a) => ({
        id: a.id,
        user_id: a.user_id,
        title: a.title,
        description: a.description,
        importance: a.importance,
        deadline: a.deadline ? new Date(a.deadline).toISOString() : null,
        status: a.status,
        activity_type: a.activity_type || "Task",
        estimated_time: a.estimated_time || null,
        completed_at: a.completed_at ? new Date(a.completed_at).toISOString() : null,
        created_at: new Date(a.created_at).toISOString(),
        updated_at: new Date(a.updated_at).toISOString(),
      })),
      subtasks: subtasks.map((s) => ({
        id: s.id,
        activity_id: s.activity_id,
        activity_title: s.activity_title,
        title: s.title,
        is_completed: s.is_completed,
        order_num: s.order_num,
        completed_at: s.completed_at ? new Date(s.completed_at).toISOString() : null,
        created_at: new Date(s.created_at).toISOString(),
      })),
      reminders: reminders.map((r) => ({
        id: r.id,
        activity_id: r.activity_id,
        activity_title: r.activity_title,
        remind_at: new Date(r.remind_at).toISOString(),
        message: r.message,
        status: r.status,
        snooze_until: r.snooze_until ? new Date(r.snooze_until).toISOString() : null,
        dismissed_at: r.dismissed_at ? new Date(r.dismissed_at).toISOString() : null,
        created_at: new Date(r.created_at).toISOString(),
      })),
      followups: followups.map((f) => ({
        id: f.id,
        activity_id: f.activity_id,
        activity_title: f.activity_title,
        note: f.note,
        scheduled_at: new Date(f.scheduled_at).toISOString(),
        status: f.status,
        outcome: f.outcome,
        completed_at: f.completed_at ? new Date(f.completed_at).toISOString() : null,
        created_at: new Date(f.created_at).toISOString(),
      })),
      habits: habits.map((h) => ({
        id: h.id,
        activity_id: h.activity_id,
        activity_title: h.activity_title || "Habit",
        frequency: h.frequency,
        days_of_week: typeof h.days_of_week === "string" ? JSON.parse(h.days_of_week) : h.days_of_week,
        is_active: h.is_active,
        last_generated_at: h.last_generated_at ? new Date(h.last_generated_at).toISOString() : null,
        next_occurrence_at: h.next_occurrence_at ? new Date(h.next_occurrence_at).toISOString() : null,
        created_at: new Date(h.created_at).toISOString(),
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        user_id: n.user_id,
        title: n.title,
        message: n.message,
        channel: n.channel,
        status: n.status,
        read: n.read,
        read_at: n.read_at ? new Date(n.read_at).toISOString() : null,
        created_at: new Date(n.created_at).toISOString(),
      })),
      auditLogs: auditLogs.map((a) => postgresDb.mapAuditLogRow(a)),
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// Suspend user
adminRouter.patch("/users/:id/suspend", async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user as UserRecord;
    const id = Number(req.params.id);

    const targetUser = await postgresDb.queryOne<any>(
      "SELECT id, email, role, is_active FROM users WHERE id = $1;",
      [id]
    );

    if (!targetUser) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: `User ${id} not found.` } });
    }

    if (targetUser.id === adminUser.id) {
      return res.status(400).json({ error: { code: "CANNOT_SUSPEND_SELF", message: "Administrators cannot suspend their own account." } });
    }

    const updated = await postgresDb.queryOne<any>(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING *;`,
      [id]
    );

    await postgresDb.query(
      `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
       VALUES ($1, $2, 'USER_SUSPENDED', 'USER', $3, $4::jsonb, $5, NOW());`,
      [adminUser.id, adminUser.email, String(id), JSON.stringify({ email: targetUser.email, role: targetUser.role }), req.ip || "127.0.0.1"]
    );

    const safeUser = postgresDb.mapUserRow(updated);
    res.json({ status: "ok", message: `User ${targetUser.email} has been suspended.`, user: safeUser });
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// Restore user
adminRouter.patch("/users/:id/restore", async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user as UserRecord;
    const id = Number(req.params.id);

    const targetUser = await postgresDb.queryOne<any>(
      "SELECT id, email, role, is_active FROM users WHERE id = $1;",
      [id]
    );

    if (!targetUser) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: `User ${id} not found.` } });
    }

    const updated = await postgresDb.queryOne<any>(
      `UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING *;`,
      [id]
    );

    await postgresDb.query(
      `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
       VALUES ($1, $2, 'USER_RESTORED', 'USER', $3, $4::jsonb, $5, NOW());`,
      [adminUser.id, adminUser.email, String(id), JSON.stringify({ email: targetUser.email, role: targetUser.role }), req.ip || "127.0.0.1"]
    );

    const safeUser = postgresDb.mapUserRow(updated);
    res.json({ status: "ok", message: `User ${targetUser.email} has been restored.`, user: safeUser });
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// Transactional delete user
adminRouter.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user as UserRecord;
    const id = Number(req.params.id);

    const targetUser = await postgresDb.queryOne<any>(
      "SELECT id, email, role FROM users WHERE id = $1;",
      [id]
    );

    if (!targetUser) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: `User ${id} not found.` } });
    }

    if (targetUser.id === adminUser.id) {
      return res.status(400).json({ error: { code: "CANNOT_DELETE_SELF", message: "Administrators cannot delete their own account." } });
    }

    if (targetUser.role === "ADMIN") {
      const adminCountRow = await postgresDb.queryOne<any>(
        "SELECT COUNT(*)::int as count FROM users WHERE role = 'ADMIN' AND is_active = true;"
      );
      if ((adminCountRow?.count || 0) <= 1) {
        return res.status(400).json({ error: { code: "CANNOT_DELETE_LAST_ADMIN", message: "Cannot delete the last remaining active administrator." } });
      }
    }

    // PostgreSQL CASCADE deletes all activities, subtasks, reminders, followups, habit rules, notifications
    await postgresDb.query("DELETE FROM users WHERE id = $1;", [id]);

    // Clean up any pending notification jobs for this user in runtime queue
    for (const [jobId, job] of db.notificationJobs.entries()) {
      if (job.user_id === id) {
        db.notificationJobs.delete(jobId);
      }
    }

    await postgresDb.query(
      `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
       VALUES ($1, $2, 'USER_REMOVED', 'USER', $3, $4::jsonb, $5, NOW());`,
      [adminUser.id, adminUser.email, String(id), JSON.stringify({ email: targetUser.email, role: targetUser.role }), req.ip || "127.0.0.1"]
    );

    res.json({ status: "ok", message: `User ${targetUser.email} and all associated records have been removed.` });
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// 3. GET /api/admin/activities
adminRouter.get("/activities", async (req: Request, res: Response) => {
  try {
    const rows = await postgresDb.query<any>(`
      SELECT 
        a.*,
        u.email as owner_email,
        u.name as owner_name,
        (SELECT COUNT(*)::int FROM subtasks WHERE activity_id = a.id) as subtasks_count,
        (SELECT COUNT(*)::int FROM subtasks WHERE activity_id = a.id AND is_completed = true) as completed_subtasks,
        (SELECT COUNT(*)::int FROM reminders WHERE activity_id = a.id) as reminders_count
      FROM activities a
      JOIN users u ON a.user_id = u.id
      ORDER BY a.id DESC;
    `);

    const list = rows.map((act) => ({
      id: act.id,
      owner_id: act.user_id,
      owner_email: act.owner_email || "unknown",
      owner_name: act.owner_name || null,
      title: act.title,
      description: act.description,
      importance: act.importance,
      activity_type: act.activity_type || "Task",
      estimated_time: act.estimated_time || null,
      deadline: act.deadline ? new Date(act.deadline).toISOString() : null,
      status: act.status,
      completed_at: act.completed_at ? new Date(act.completed_at).toISOString() : null,
      subtasks_count: act.subtasks_count || 0,
      completed_subtasks: act.completed_subtasks || 0,
      reminders_count: act.reminders_count || 0,
      created_at: new Date(act.created_at).toISOString(),
      updated_at: new Date(act.updated_at).toISOString(),
    }));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// 3b. GET /api/admin/subtasks
adminRouter.get("/subtasks", async (req: Request, res: Response) => {
  try {
    const rows = await postgresDb.query<any>(`
      SELECT 
        s.*,
        u.email as owner_email,
        a.title as activity_title
      FROM subtasks s
      JOIN users u ON s.user_id = u.id
      JOIN activities a ON s.activity_id = a.id
      ORDER BY s.id DESC;
    `);

    const list = rows.map((st) => ({
      id: st.id,
      activity_id: st.activity_id,
      activity_title: st.activity_title || "unknown",
      user_id: st.user_id,
      owner_email: st.owner_email || "unknown",
      title: st.title,
      is_completed: st.is_completed,
      order_num: st.order_num,
      completed_at: st.completed_at ? new Date(st.completed_at).toISOString() : null,
      created_at: new Date(st.created_at).toISOString(),
      updated_at: new Date(st.updated_at).toISOString(),
    }));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// 3c. GET /api/admin/habits & /api/admin/habit-rules
const adminHabitsHandler = async (req: Request, res: Response) => {
  try {
    const rows = await postgresDb.query<any>(`
      SELECT 
        h.*,
        u.email as owner_email,
        a.title as activity_title
      FROM habit_rules h
      JOIN users u ON h.user_id = u.id
      LEFT JOIN activities a ON h.activity_id = a.id
      ORDER BY h.id DESC;
    `);

    const list = rows.map((h) => ({
      id: h.id,
      user_id: h.user_id,
      owner_email: h.owner_email || "unknown",
      activity_id: h.activity_id,
      activity_title: h.activity_title || "Recurring Habit",
      frequency: h.frequency,
      days_of_week: typeof h.days_of_week === "string" ? JSON.parse(h.days_of_week) : h.days_of_week,
      is_active: h.is_active,
      last_generated_at: h.last_generated_at ? new Date(h.last_generated_at).toISOString() : null,
      next_occurrence_at: h.next_occurrence_at ? new Date(h.next_occurrence_at).toISOString() : null,
      created_at: new Date(h.created_at).toISOString(),
      updated_at: new Date(h.updated_at).toISOString(),
    }));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
};
adminRouter.get("/habits", adminHabitsHandler);
adminRouter.get("/habit-rules", adminHabitsHandler);

// 4. GET /api/admin/reminders
adminRouter.get("/reminders", async (req: Request, res: Response) => {
  try {
    const rows = await postgresDb.query<any>(`
      SELECT 
        r.*,
        u.email as user_email,
        a.title as activity_title
      FROM reminders r
      JOIN users u ON r.user_id = u.id
      JOIN activities a ON r.activity_id = a.id
      ORDER BY r.id DESC;
    `);

    const list = rows.map((rem) => ({
      id: rem.id,
      user_id: rem.user_id,
      user_email: rem.user_email || "unknown",
      activity_id: rem.activity_id,
      activity_title: rem.activity_title || "unknown",
      remind_at: new Date(rem.remind_at).toISOString(),
      message: rem.message,
      status: rem.status,
      snooze_until: rem.snooze_until ? new Date(rem.snooze_until).toISOString() : null,
      dismissed_at: rem.dismissed_at ? new Date(rem.dismissed_at).toISOString() : null,
      created_at: new Date(rem.created_at).toISOString(),
    }));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// 5. GET /api/admin/follow-ups & /api/admin/followups
const followupsHandler = async (req: Request, res: Response) => {
  try {
    const rows = await postgresDb.query<any>(`
      SELECT 
        f.*,
        u.email as user_email,
        a.title as activity_title
      FROM followups f
      JOIN users u ON f.user_id = u.id
      JOIN activities a ON f.activity_id = a.id
      ORDER BY f.id DESC;
    `);

    const list = rows.map((fu) => ({
      id: fu.id,
      user_id: fu.user_id,
      user_email: fu.user_email || "unknown",
      activity_id: fu.activity_id,
      activity_title: fu.activity_title || "unknown",
      note: fu.note,
      scheduled_at: new Date(fu.scheduled_at).toISOString(),
      status: fu.status,
      outcome: fu.outcome,
      completed_at: fu.completed_at ? new Date(fu.completed_at).toISOString() : null,
      created_at: new Date(fu.created_at).toISOString(),
    }));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
};
adminRouter.get("/follow-ups", followupsHandler);
adminRouter.get("/followups", followupsHandler);

// 6. GET /api/admin/notifications
adminRouter.get("/notifications", async (req: Request, res: Response) => {
  try {
    const rows = await postgresDb.query<any>(`
      SELECT 
        n.*,
        u.email as user_email
      FROM notifications n
      JOIN users u ON n.user_id = u.id
      ORDER BY n.created_at DESC;
    `);

    const list = rows.map((n) => ({
      id: n.id,
      user_id: n.user_id,
      user_email: n.user_email || "unknown",
      title: n.title,
      message: n.message,
      type: n.type,
      channel: n.channel,
      status: n.status,
      read: n.read,
      read_at: n.read_at ? new Date(n.read_at).toISOString() : null,
      created_at: new Date(n.created_at).toISOString(),
    }));

    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});

// 7. GET /api/admin/jobs
adminRouter.get("/jobs", (req: Request, res: Response) => {
  const jobs = Array.from(db.notificationJobs.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json(jobs);
});

// 8. GET /api/admin/jobs/dead-letter
adminRouter.get("/jobs/dead-letter", (req: Request, res: Response) => {
  const dlqJobs = Array.from(db.notificationJobs.values()).filter(
    (j) => j.status === "DEAD_LETTER"
  );
  res.json(dlqJobs);
});

// 9. POST /api/admin/jobs/:id/retry & POST /api/admin/jobs/dead-letter/:id/retry
const retryJobHandler = async (req: Request, res: Response) => {
  const jobId = req.params.id;
  const adminUser = (req as any).user as UserRecord;

  let job = db.notificationJobs.get(jobId);
  if (!job) {
    for (const j of db.notificationJobs.values()) {
      if (j.job_id === jobId || j.job_id.endsWith(jobId)) {
        job = j;
        break;
      }
    }
  }

  if (!job) {
    return res.status(404).json({
      error: { code: "JOB_NOT_FOUND", message: `Job ${jobId} not found.` },
    });
  }

  const nowIso = new Date().toISOString();
  job.status = "PENDING";
  job.attempt = 0;
  job.last_error = null;
  job.available_at = nowIso;
  job.processing_started_at = null;
  job.updated_at = nowIso;

  await redis.enqueueNotificationJob(job);

  await postgresDb.query(
    `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
     VALUES ($1, $2, 'DLQ_JOB_RETRY_INITIATED', 'JOB', $3, $4::jsonb, $5, NOW());`,
    [adminUser.id, adminUser.email, job.job_id, JSON.stringify({ idempotency_key: job.idempotency_key }), req.ip || "127.0.0.1"]
  );

  console.log(`[ADMIN] Admin ${adminUser.email} manually replayed DLQ job ${job.job_id}`);
  res.json(job);
};

adminRouter.post("/jobs/:id/retry", retryJobHandler);
adminRouter.post("/jobs/dead-letter/:id/retry", retryJobHandler);

// 10. GET /api/admin/system/health, /api/admin/metrics, /api/admin/stats, & /api/admin/overview
const getSystemHealthHandler = async (req: Request, res: Response) => {
  try {
    const queueStats = await redis.getQueueStats();
    const provider = getActiveEmailProvider();

    const [counts, activitiesByStatus, activitiesByType, remindersByStatus, recentLogs] = await Promise.all([
      postgresDb.queryOne<any>(`
        SELECT 
          (SELECT COUNT(*)::int FROM users) as total_users,
          (SELECT COUNT(*)::int FROM users WHERE is_active = true) as active_users,
          (SELECT COUNT(*)::int FROM users WHERE is_active = false) as suspended_users,
          (SELECT COUNT(*)::int FROM activities) as total_activities,
          (SELECT COUNT(*)::int FROM activities WHERE status = 'COMPLETED') as completed_activities,
          (SELECT COUNT(*)::int FROM activities WHERE status = 'PENDING') as pending_activities,
          (SELECT COUNT(*)::int FROM activities WHERE deadline IS NOT NULL AND deadline < NOW() AND status != 'COMPLETED' AND status != 'CANCELLED') as overdue_activities,
          (SELECT COUNT(*)::int FROM reminders WHERE status = 'SCHEDULED') as scheduled_reminders,
          (SELECT COUNT(*)::int FROM reminders WHERE status = 'SCHEDULED' OR status = 'DUE') as pending_reminders,
          (SELECT COUNT(*)::int FROM followups WHERE status = 'PENDING') as pending_followups,
          (SELECT COUNT(*)::int FROM followups) as total_followups,
          (SELECT COUNT(*)::int FROM notifications WHERE read = false) as unread_notifications,
          (SELECT COUNT(*)::int FROM notifications) as total_notifications,
          (SELECT COUNT(*)::int FROM habit_rules WHERE is_active = true) as active_habits;
      `),
      postgresDb.query<any>(`
        SELECT status, COUNT(*)::int as count 
        FROM activities 
        GROUP BY status 
        ORDER BY count DESC;
      `),
      postgresDb.query<any>(`
        SELECT COALESCE(activity_type, 'Task') as activity_type, COUNT(*)::int as count 
        FROM activities 
        GROUP BY COALESCE(activity_type, 'Task') 
        ORDER BY count DESC;
      `),
      postgresDb.query<any>(`
        SELECT status, COUNT(*)::int as count 
        FROM reminders 
        GROUP BY status 
        ORDER BY count DESC;
      `),
      postgresDb.query<any>(`
        SELECT * FROM audit_logs 
        ORDER BY created_at DESC 
        LIMIT 15;
      `),
    ]);

    const totalUsers = counts?.total_users || 0;
    const activeUsers = counts?.active_users || 0;
    const suspendedUsers = counts?.suspended_users || 0;
    const totalActivities = counts?.total_activities || 0;
    const completedActivities = counts?.completed_activities || 0;
    const pendingActivities = counts?.pending_activities || 0;
    const overdueActivities = counts?.overdue_activities || 0;
    const scheduledReminders = counts?.scheduled_reminders || 0;
    const pendingReminders = counts?.pending_reminders || 0;
    const pendingFollowups = counts?.pending_followups || 0;
    const totalFollowups = counts?.total_followups || 0;
    const unreadNotifications = counts?.unread_notifications || 0;
    const totalNotifications = counts?.total_notifications || 0;
    const activeHabits = counts?.active_habits || 0;
    const activeJobs = queueStats.pending + queueStats.processing;
    const failedJobs = queueStats.deadLetter;

    res.json({
      status: postgresDb.isConnected && redis.getIsConnected() ? "HEALTHY" : "DEGRADED",
      timestamp: new Date().toISOString(),
      // Top-level direct real stats for Admin Overview and Dashboard
      total_users: totalUsers,
      active_users: activeUsers,
      suspended_users: suspendedUsers,
      total_activities: totalActivities,
      completed_activities: completedActivities,
      pending_activities: pendingActivities,
      overdue_activities: overdueActivities,
      scheduled_reminders: scheduledReminders,
      pending_reminders: pendingReminders,
      pending_followups: pendingFollowups,
      total_followups: totalFollowups,
      unread_notifications: unreadNotifications,
      total_notifications: totalNotifications,
      active_habits: activeHabits,
      active_jobs: activeJobs,
      failed_jobs: failedJobs,
      // Level 2: Real Data Distributions
      distributions: {
        activities_by_status: activitiesByStatus,
        activities_by_type: activitiesByType,
        reminders_by_status: remindersByStatus,
        users_by_status: [
          { status: "Active", count: activeUsers },
          { status: "Suspended", count: suspendedUsers },
        ],
      },
      // Level 3: Recent Real System Activity
      recent_activity: recentLogs.map((r) => {
        const item = postgresDb.mapAuditLogRow(r);
        return {
          id: item.id,
          actor: item.admin_email || "System",
          action: item.action,
          target_type: item.target_type,
          target_id: item.target_id,
          details: redactSensitive(item.details),
          created_at: item.created_at,
        };
      }),
      database: {
        connected: postgresDb.isConnected,
        engine: "PostgreSQL 15 (PGlite Persistent)",
        latency_ms: postgresDb.queryLatencyMs,
        pool: postgresDb.connectionPool,
        total_users: totalUsers,
        active_users: activeUsers,
        total_activities: totalActivities,
        total_reminders: scheduledReminders,
      },
      redis: {
        connected: redis.getIsConnected(),
        is_real: redis.getIsRealRedis(),
        ping_latency_ms: redis.getPingLatencyMs(),
        queues: {
          pending_notifications: queueStats.pending,
          processing_in_flight: queueStats.processing,
          dead_letter_queue: queueStats.deadLetter,
        },
      },
      worker: {
        running: worker.getIsRunning(),
        active_workers: worker.getActiveWorkers(),
        max_concurrency: 3,
        lease_timeout_ms: 15000,
      },
      metrics: db.metrics,
      email_provider: {
        provider: provider.getProviderName(),
        sent_count: provider.getSentCount(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
};

adminRouter.get("/system/health", getSystemHealthHandler);
adminRouter.get("/metrics", getSystemHealthHandler);
adminRouter.get("/stats", getSystemHealthHandler);
adminRouter.get("/overview", getSystemHealthHandler);

// 11. GET /api/admin/audit-logs
adminRouter.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const rows = await postgresDb.query<any>("SELECT * FROM audit_logs ORDER BY created_at DESC;");
    const logs = rows.map((r) => {
      const item = postgresDb.mapAuditLogRow(r);
      return {
        ...item,
        details: redactSensitive(item.details),
      };
    });
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
  }
});
