import crypto from "crypto";
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config({ override: true });

import {
  UserRecord,
  ActivityRecord,
  SubtaskRecord,
  ReminderRecord,
  FollowUpRecord,
  HabitRecurrenceRecord,
  InAppNotificationRecord,
  AuditLogRecord,
  UserPreferences,
  ActivityStatus,
  ActivityUrgency,
  ActivityPriority,
  ReminderStatus,
  FollowUpStatus,
} from "./types";

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  if (hash.startsWith("scrypt$")) {
    const [, saltHex, expectedHex] = hash.split("$");
    try {
      if (!saltHex || !expectedHex) return false;
      const expected = Buffer.from(expectedHex, "hex");
      if (expected.length !== 32) return false;
      const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
      return crypto.timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  // Legacy hashes remain verifiable so existing accounts can migrate on login.
  const legacyExpected = crypto.pbkdf2Sync(password, "productivity_salt_2026", 1000, 32, "sha256");
  const legacyActual = Buffer.from(hash, "hex");
  return legacyActual.length === legacyExpected.length && crypto.timingSafeEqual(legacyExpected, legacyActual);
}

export class PostgresDatabase {

  private pool: Pool | null = null;
  private isInitialized = false;

  public isConnected = false;
  public queryLatencyMs = 1;
  public connectionPool = {
    size: 10,
    checkedOut: 0,
    overflow: 0,
    available: 10,
  };

  // Temporary runtime locks (SKIP LOCKED simulation / memory locks)
  private lockedReminderIds = new Set<number>();

  async init(): Promise<void> {
    if (this.isInitialized && this.pool) return;

    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
      throw new Error(
        "[POSTGRES] DATABASE_URL is required. Configure it in the environment before starting Tik Tik."
      );
    }

    const poolSize = Number(process.env.DB_POOL_SIZE || 10);
    const maxOverflow = Number(process.env.DB_MAX_OVERFLOW || 20);
    const maxConnections = Math.max(1, poolSize + maxOverflow);

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: maxConnections,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      keepAlive: true,
      allowExitOnIdle: false,
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });

    try {
      await this.pool.query("SELECT 1;");
      await this.applySchema();
      await this.seedInitialAdmin();

      this.isInitialized = true;
      this.isConnected = true;
      this.connectionPool = {
        size: maxConnections,
        checkedOut: 0,
        overflow: 0,
        available: maxConnections,
      };

      console.log("[POSTGRES] Connected to configured PostgreSQL database.");

      const shutdownHandler = async () => {
        try {
          await this.close();
        } catch {}
      };

      process.once("SIGTERM", shutdownHandler);
      process.once("SIGINT", shutdownHandler);
    } catch (err) {
      this.isConnected = false;
      this.isInitialized = false;

      if (this.pool) {
        try {
          await this.pool.end();
        } catch {}
      }

      this.pool = null;

      throw new Error(
        "[POSTGRES] Could not connect to the configured PostgreSQL database.",
        { cause: err }
      );
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    this.isConnected = false;
    this.isInitialized = false;
  }

  get client(): Pool {
    if (!this.pool) {
      throw new Error("PostgreSQL database is not initialized. Call init() first.");
    }
    return this.pool;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const start = Date.now();

    try {
      const res = await this.client.query(sql, params);
      this.queryLatencyMs = Math.max(1, Date.now() - start);
      return res.rows as T[];
    } catch (err) {
      console.error("[POSTGRES QUERY ERROR]", {
        sql,
        parameterCount: params.length,
        err,
      });
      throw err;
    }
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  private async applySchema(): Promise<void> {
    const schemaSql = `
      -- 1. USERS TABLE
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        email_verified_at TIMESTAMPTZ,
        preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
        verification_token TEXT,
        verification_token_hash TEXT,
        verification_token_expires_at TIMESTAMPTZ,
        verification_last_sent_at TIMESTAMPTZ,
        reset_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      );

      -- 2. ACTIVITIES TABLE
      CREATE TABLE IF NOT EXISTS activities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        importance INTEGER NOT NULL DEFAULT 3,
        deadline TIMESTAMPTZ,
        status TEXT NOT NULL DEFAULT 'PENDING',
        activity_type TEXT NOT NULL DEFAULT 'Task',
        estimated_time TEXT,
        is_adaptive_reminder BOOLEAN NOT NULL DEFAULT FALSE,
        adaptive_stage INTEGER NOT NULL DEFAULT 0,
        recurrence_id INTEGER,
        parent_habit_id INTEGER,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 3. SUBTASKS TABLE
      CREATE TABLE IF NOT EXISTS subtasks (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        is_completed BOOLEAN NOT NULL DEFAULT FALSE,
        order_num INTEGER NOT NULL DEFAULT 1,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 4. REMINDERS TABLE
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        remind_at TIMESTAMPTZ NOT NULL,
        message TEXT,
        status TEXT NOT NULL DEFAULT 'SCHEDULED',
        snooze_until TIMESTAMPTZ,
        dismissed_at TIMESTAMPTZ,
        locked_by_scheduler_at TIMESTAMPTZ,
        is_adaptive BOOLEAN NOT NULL DEFAULT FALSE,
        adaptive_stage INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 5. FOLLOWUPS TABLE
      CREATE TABLE IF NOT EXISTS followups (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        scheduled_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        outcome TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 6. HABIT RULES TABLE
      CREATE TABLE IF NOT EXISTS habit_rules (
        id SERIAL PRIMARY KEY,
        activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        frequency TEXT NOT NULL DEFAULT 'DAILY',
        days_of_week JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_generated_at TIMESTAMPTZ,
        next_occurrence_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 7. NOTIFICATIONS TABLE
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT 'REMINDER',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'IN_APP',
        status TEXT NOT NULL DEFAULT 'UNREAD',
        read BOOLEAN NOT NULL DEFAULT FALSE,
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 8. AUDIT LOGS TABLE
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- 9. REVOKED TOKENS (Blocklist)
      CREATE TABLE IF NOT EXISTS revoked_tokens (
        jti TEXT PRIMARY KEY,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );

      -- 10. IDEMPOTENT DELIVERIES TABLE
      CREATE TABLE IF NOT EXISTS idempotent_deliveries (
        idempotency_key TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        recipient TEXT NOT NULL,
        channel TEXT NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- INDEXES FOR MAXIMUM QUERY PERFORMANCE & USER ISOLATION
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_activities_user_id ON activities(user_id);
      CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
      CREATE INDEX IF NOT EXISTS idx_activities_deadline ON activities(deadline);
      CREATE INDEX IF NOT EXISTS idx_subtasks_activity_id ON subtasks(activity_id);
      CREATE INDEX IF NOT EXISTS idx_subtasks_user_id ON subtasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_activity_id ON reminders(activity_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
      CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
      CREATE INDEX IF NOT EXISTS idx_followups_user_id ON followups(user_id);
      CREATE INDEX IF NOT EXISTS idx_followups_activity_id ON followups(activity_id);
      CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
      CREATE INDEX IF NOT EXISTS idx_habit_rules_user_id ON habit_rules(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    `;

    await this.exec(schemaSql);
    await this.exec(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_last_sent_at TIMESTAMPTZ;
    `);
  }

  async seedInitialAdmin(): Promise<void> {
    const envAdminPass = process.env.INITIAL_ADMIN_PASSWORD;
    if (!envAdminPass) {
      console.warn("[POSTGRES] INITIAL_ADMIN_PASSWORD is not configured; skipping admin bootstrap.");
      return;
    }

    const passHash = hashPassword(envAdminPass);

    const configuredAdminEmail = (process.env.INITIAL_ADMIN_EMAIL || "voidkd05@gmail.com").toLowerCase().trim();
    const adminEmails = [configuredAdminEmail];

    for (const email of adminEmails) {
      const normalized = email.toLowerCase().trim();
      const existing = await this.queryOne<any>(
        "SELECT id, email, role FROM users WHERE LOWER(TRIM(email)) = $1;",
        [normalized]
      );

      if (existing) {
        console.log("[POSTGRES] Initial admin already exists; leaving its credentials unchanged.");
      } else {
        const name = "Platform Administrator";
        const prefs = JSON.stringify({
          timezone: "UTC",
          quiet_hours_enabled: false,
          quiet_hours_start: "22:00",
          quiet_hours_end: "08:00",
          email_notifications_enabled: true,
        });

        const inserted = await this.queryOne<any>(
          `INSERT INTO users (email, name, password_hash, role, is_active, email_verified, email_verified_at, preferences, created_at, updated_at)
           VALUES ($1, $2, $3, 'ADMIN', true, true, NOW(), $4::jsonb, NOW(), NOW())
           RETURNING id, email;`,
          [normalized, name, passHash, prefs]
        );

        if (inserted) {
          await this.query(
            `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
             VALUES ($1, $2, 'INITIAL_ADMIN_PROVISIONED', 'SYSTEM', 'core', $3::jsonb, '127.0.0.1', NOW());`,
            [inserted.id, inserted.email, JSON.stringify({ role: "ADMIN", email: inserted.email })]
          );
        }
      }
    }
  }

  // Row Locking Simulation: PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED
  lockReminderForScheduler(reminderId: number): boolean {
    if (this.lockedReminderIds.has(reminderId)) {
      return false;
    }
    this.lockedReminderIds.add(reminderId);
    return true;
  }

  unlockReminder(reminderId: number) {
    this.lockedReminderIds.delete(reminderId);
  }

  // Record an idempotency key upon successful delivery in PostgreSQL
  async recordDelivery(idempotencyKey: string, jobId: string, recipient: string, channel: "EMAIL" | "IN_APP"): Promise<void> {
    await this.query(
      `INSERT INTO idempotent_deliveries (idempotency_key, job_id, recipient, channel, sent_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (idempotency_key) DO NOTHING;`,
      [idempotencyKey, jobId, recipient, channel]
    );
  }

  async isAlreadyDelivered(idempotencyKey: string): Promise<boolean> {
    const row = await this.queryOne(
      "SELECT 1 FROM idempotent_deliveries WHERE idempotency_key = $1;",
      [idempotencyKey]
    );
    return Boolean(row);
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    const row = await this.queryOne("SELECT 1 FROM revoked_tokens WHERE jti = $1;", [jti]);
    return Boolean(row);
  }

  async revokeToken(jti: string, expiresAt?: string): Promise<void> {
    await this.query(
      `INSERT INTO revoked_tokens (jti, revoked_at, expires_at)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (jti) DO NOTHING;`,
      [jti, expiresAt || null]
    );
  }

  // ==========================================
  // TYPE MAPPING HELPERS
  // ==========================================
  mapUserRow(row: any): UserRecord {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.password_hash,
      role: row.role,
      is_active: row.is_active,
      email_verified: row.email_verified,
      email_verified_at: row.email_verified_at ? new Date(row.email_verified_at).toISOString() : null,
      preferences: (typeof row.preferences === "string" ? JSON.parse(row.preferences) : row.preferences) || {
        timezone: "UTC",
        quiet_hours_enabled: false,
        quiet_hours_start: "22:00",
        quiet_hours_end: "08:00",
        email_notifications_enabled: true,
      },
      verification_token: row.verification_token,
      verification_token_hash: row.verification_token_hash,
      verification_token_expires_at: row.verification_token_expires_at
        ? new Date(row.verification_token_expires_at).toISOString()
        : null,
      verification_last_sent_at: row.verification_last_sent_at
        ? new Date(row.verification_last_sent_at).toISOString()
        : null,
      reset_token: row.reset_token,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  mapActivityRow(row: any): ActivityRecord {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description,
      importance: row.importance,
      deadline: row.deadline ? new Date(row.deadline).toISOString() : null,
      status: row.status,
      activity_type: row.activity_type,
      estimated_time: row.estimated_time,
      is_adaptive_reminder: row.is_adaptive_reminder,
      adaptive_stage: row.adaptive_stage,
      recurrence_id: row.recurrence_id,
      parent_habit_id: row.parent_habit_id,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  mapSubtaskRow(row: any): SubtaskRecord {
    return {
      id: row.id,
      activity_id: row.activity_id,
      user_id: row.user_id,
      title: row.title,
      is_completed: row.is_completed,
      order: row.order_num ?? row.order ?? 1,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  mapReminderRow(row: any): ReminderRecord {
    return {
      id: row.id,
      activity_id: row.activity_id,
      user_id: row.user_id,
      remind_at: new Date(row.remind_at).toISOString(),
      message: row.message,
      status: row.status,
      snooze_until: row.snooze_until ? new Date(row.snooze_until).toISOString() : null,
      dismissed_at: row.dismissed_at ? new Date(row.dismissed_at).toISOString() : null,
      locked_by_scheduler_at: row.locked_by_scheduler_at ? new Date(row.locked_by_scheduler_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  mapFollowUpRow(row: any): FollowUpRecord {
    return {
      id: row.id,
      activity_id: row.activity_id,
      user_id: row.user_id,
      note: row.note,
      scheduled_at: new Date(row.scheduled_at).toISOString(),
      status: row.status,
      outcome: row.outcome,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  mapHabitRuleRow(row: any): HabitRecurrenceRecord {
    return {
      id: row.id,
      activity_id: row.activity_id,
      user_id: row.user_id,
      frequency: row.frequency,
      days_of_week: typeof row.days_of_week === "string" ? JSON.parse(row.days_of_week) : row.days_of_week,
      is_active: row.is_active,
      last_generated_at: row.last_generated_at ? new Date(row.last_generated_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  mapNotificationRow(row: any): InAppNotificationRecord {
    return {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      message: row.message,
      type: row.type,
      read: row.read,
      read_at: row.read_at ? new Date(row.read_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  mapAuditLogRow(row: any): AuditLogRecord {
    return {
      id: row.id,
      admin_id: row.admin_id,
      admin_email: row.admin_email,
      action: row.action,
      target_type: row.target_type,
      target_id: row.target_id,
      details: typeof row.details === "string" ? JSON.parse(row.details) : row.details,
      ip_address: row.ip_address,
      created_at: new Date(row.created_at).toISOString(),
    };
  }
}

export const postgresDb = new PostgresDatabase();
