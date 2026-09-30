import dotenv from "dotenv";
dotenv.config({ override: true });
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { postgresDb, hashPassword, verifyPassword } from "./server/postgres";
import { db } from "./server/store";
import { redis } from "./server/redis";
import { scheduler } from "./server/scheduler";
import { worker } from "./server/worker";
import { getActiveEmailProvider } from "./server/email";
import { failureLabRouter } from "./server/routes/failureLab";
import { adminRouter } from "./server/routes/admin";
import {
  UserRecord,
  ActivityRecord,
  SubtaskRecord,
  ReminderRecord,
  FollowUpRecord,
  ActivityStatus,
  ActivityUrgency,
  ActivityPriority,
  ReminderStatus,
} from "./server/types";

const JWT_SECRET = process.env.SECRET_KEY || "productivity_platform_dev_secret_key_super_secure_32_bytes";
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const verificationResendAttempts = new Map<string, number>();

function normalizeGmailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/;
  return emailPattern.test(email) ? email : null;
}

function hashVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createVerificationToken(): { rawToken: string; tokenHash: string; expiresAt: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return {
    rawToken,
    tokenHash: hashVerificationToken(rawToken),
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS).toISOString(),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] || character);
}

function getFrontendUrl(req: Request): string {
  return (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}

async function sendVerificationEmail(req: Request, user: UserRecord, rawToken: string) {
  const verificationLink = `${getFrontendUrl(req)}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const displayName = escapeHtml(user.name || "there");
  return getActiveEmailProvider().sendEmail({
    to: user.email,
    subject: "Verify your Tik Tik email",
    text: `Hello ${user.name || "there"},\n\nPlease verify your Gmail address for Tik Tik by opening this link:\n${verificationLink}\n\nThis link expires in 24 hours and can only be used once.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c1917"><h1>Tik Tik</h1><h2>Verify your email address</h2><p>Hello ${displayName},</p><p>Please verify your Gmail address to activate your Tik Tik account.</p><p><a href="${verificationLink}" style="display:inline-block;padding:12px 20px;background:#1c1917;color:#fff;text-decoration:none;border-radius:6px">Verify your email</a></p><p>This link expires in 24 hours and can only be used once.</p></div>`,
  });
}

// JWT Helper
function generateJwt(user: UserRecord): { token: string; jti: string } {
  const jti = crypto.randomUUID();
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
      jti,
      iat: nowSec,
      exp: nowSec + 86400, // 24 hours
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return { token: `${header}.${payload}.${signature}`, jti };
}

async function decodeAndVerifyJwt(token: string): Promise<{ sub: string; email: string; role: "USER" | "ADMIN"; jti: string } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;

    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (signature !== expectedSig) return null;

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < nowSec) return null;

    // Check revoked tokens table in PostgreSQL
    if (decoded.jti && (await postgresDb.isTokenRevoked(decoded.jti))) return null;

    return decoded;
  } catch {
    return null;
  }
}

// Authentication Middleware
async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Bearer token required in Authorization header." },
      });
    }

    const token = authHeader.substring(7).trim();
    const decoded = await decodeAndVerifyJwt(token);

    if (!decoded) {
      return res.status(401).json({
        error: { code: "INVALID_TOKEN", message: "Token is invalid, expired, or revoked." },
      });
    }

    // Query user directly from PostgreSQL
    const userRow = await postgresDb.queryOne<any>("SELECT * FROM users WHERE id = $1;", [Number(decoded.sub)]);
    if (!userRow || !userRow.is_active) {
      return res.status(401).json({
        error: { code: "USER_INACTIVE", message: "User account not found or deactivated." },
      });
    }

    (req as any).user = postgresDb.mapUserRow(userRow);
    (req as any).tokenJti = decoded.jti;
    next();
  } catch (err) {
    next(err);
  }
}

// Urgency and Priority Calculations
function computeUrgency(deadlineIso: string | null, status: ActivityStatus): ActivityUrgency {
  if (status === "COMPLETED" || status === "CANCELLED" || !deadlineIso) {
    return "NONE";
  }

  const now = new Date().getTime();
  const deadline = new Date(deadlineIso).getTime();
  const diffSec = (deadline - now) / 1000;

  if (diffSec < 0) return "OVERDUE";
  if (diffSec <= 86400) return "DUE_TODAY";
  if (diffSec <= 259200) return "DUE_SOON"; // 3 days
  if (diffSec <= 604800) return "MODERATE"; // 7 days
  return "LOW";
}

function computePriority(
  importance: number,
  urgency: ActivityUrgency,
  status: ActivityStatus
): [ActivityPriority, number] {
  if (status === "COMPLETED" || status === "CANCELLED") {
    return ["P4_LOW", 0];
  }

  const urgencyWeights: Record<ActivityUrgency, number> = {
    OVERDUE: 10,
    DUE_TODAY: 9,
    DUE_SOON: 7,
    MODERATE: 4,
    LOW: 2,
    NONE: 0,
  };

  const rawScore = importance * 2 + urgencyWeights[urgency];

  if (importance >= 4 && (urgency === "OVERDUE" || urgency === "DUE_TODAY" || urgency === "DUE_SOON")) {
    return ["P1_CRITICAL", rawScore];
  }
  if (importance >= 4 || urgency === "OVERDUE" || urgency === "DUE_TODAY") {
    return ["P2_HIGH", rawScore];
  }
  if (importance >= 2 || urgency === "DUE_SOON" || urgency === "MODERATE") {
    return ["P3_MEDIUM", rawScore];
  }
  return ["P4_LOW", rawScore];
}

function computeProgress(subtasks: SubtaskRecord[], status: ActivityStatus): number {
  if (status === "COMPLETED") return 100;
  if (subtasks.length === 0) return 0;
  const completed = subtasks.filter((s) => s.is_completed).length;
  return Math.round((completed / subtasks.length) * 100);
}

function evaluateReminderStatus(rem: ReminderRecord): ReminderStatus {
  if (rem.status === "DISMISSED") return "DISMISSED";
  const now = new Date().getTime();
  const targetTime = rem.snooze_until
    ? new Date(rem.snooze_until).getTime()
    : new Date(rem.remind_at).getTime();

  if (now >= targetTime) return "DUE";
  if (rem.status === "SNOOZED") return "SNOOZED";
  return "SCHEDULED";
}

async function buildActivityResponse(act: ActivityRecord) {
  const urgency = computeUrgency(act.deadline, act.status);
  const [quadrant, priorityScore] = computePriority(act.importance, urgency, act.status);

  const subtaskRows = await postgresDb.query<any>(
    "SELECT * FROM subtasks WHERE activity_id = $1 ORDER BY order_num ASC, id ASC;",
    [act.id]
  );
  const subtasks = subtaskRows.map((s) => postgresDb.mapSubtaskRow(s));
  const progress = computeProgress(subtasks, act.status);

  const reminderRows = await postgresDb.query<any>(
    "SELECT * FROM reminders WHERE activity_id = $1 ORDER BY remind_at ASC;",
    [act.id]
  );
  const reminders = reminderRows.map((r) => {
    const mapped = postgresDb.mapReminderRow(r);
    return {
      ...mapped,
      effective_status: evaluateReminderStatus(mapped),
      activity_title: act.title,
    };
  });

  const followupRows = await postgresDb.query<any>(
    "SELECT * FROM followups WHERE activity_id = $1 ORDER BY scheduled_at ASC;",
    [act.id]
  );
  const followups = followupRows.map((f) => {
    const mapped = postgresDb.mapFollowUpRow(f);
    return {
      ...mapped,
      activity_title: act.title,
    };
  });

  return {
    id: act.id,
    user_id: act.user_id,
    owner_id: act.user_id,
    title: act.title,
    description: act.description,
    importance: act.importance,
    deadline: act.deadline,
    status: act.status,
    activity_type: act.activity_type || "Task",
    estimated_time: act.estimated_time || null,
    is_adaptive_reminder: Boolean(act.is_adaptive_reminder),
    recurrence_id: act.recurrence_id || null,
    parent_habit_id: act.parent_habit_id || null,
    completed_at: act.completed_at,
    created_at: act.created_at,
    updated_at: act.updated_at,
    urgency,
    priority_quadrant: quadrant,
    priority_score: priorityScore,
    progress_percentage: progress,
    subtasks,
    reminders,
    followups,
  };
}

export function computeNextHabitOccurrence(
  currentDeadlineIso: string | null,
  frequency: "DAILY" | "WEEKLY" | "WEEKDAYS" | "CUSTOM_DAYS",
  daysOfWeek?: number[]
): string {
  const base = currentDeadlineIso ? new Date(currentDeadlineIso) : new Date();
  const next = new Date(base.getTime());

  if (frequency === "DAILY") {
    next.setDate(next.getDate() + 1);
  } else if (frequency === "WEEKDAYS") {
    const day = next.getDay();
    if (day === 5) {
      next.setDate(next.getDate() + 3); // Fri -> Mon
    } else if (day === 6) {
      next.setDate(next.getDate() + 2); // Sat -> Mon
    } else {
      next.setDate(next.getDate() + 1);
    }
  } else if (frequency === "WEEKLY") {
    next.setDate(next.getDate() + 7);
  } else if (frequency === "CUSTOM_DAYS" && daysOfWeek && daysOfWeek.length > 0) {
    let daysToAdd = 1;
    while (daysToAdd <= 7) {
      const candidateDay = (next.getDay() + daysToAdd) % 7;
      if (daysOfWeek.includes(candidateDay)) {
        next.setDate(next.getDate() + daysToAdd);
        break;
      }
      daysToAdd++;
    }
  } else {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

async function startServer() {
  // 1. Initialize Central PostgreSQL Database
  await postgresDb.init();
  await redis.waitUntilReady();

  const app = express();
  // Use Render-provided PORT in production; keep 3000 as the local fallback.
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // CORS Middleware
  const parseCorsOrigins = (): string[] => {
    const raw = process.env.CORS_ORIGINS || '["http://localhost:3000","http://127.0.0.1:3000"]';
    try {
      if (raw.startsWith("[")) {
        return JSON.parse(raw);
      }
      return raw.split(",").map((s) => s.trim());
    } catch {
      return ["http://localhost:3000", "http://127.0.0.1:3000"];
    }
  };
  const allowedOrigins = parseCorsOrigins();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        );
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization, X-Request-ID, X-Idempotency-Key"
        );
        res.setHeader(
          "Access-Control-Expose-Headers",
          "X-Request-ID, Retry-After, X-Idempotency-Replayed"
        );
      }
    }
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });

  // Security Headers & Cache-Control Middleware
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    }
    next();
  });

  // DB Connection Guard Middleware
  app.use((req, res, next) => {
    if (!postgresDb.isConnected && (req.path.startsWith("/api/") || req.path.startsWith("/auth/"))) {
      if (req.path === "/health/live" || req.path.startsWith("/api/admin/failure-lab")) {
        return next();
      }
      return res.status(503).json({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database connection failed. PostgreSQL connection pool exhausted or network partitioned.",
        },
      });
    }
    next();
  });

  // ==========================================
  // HEALTH & PROBES ENDPOINTS
  // ==========================================
  app.get("/health/live", (req, res) => {
    res.json({
      status: "live",
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/health/ready", async (req, res) => {
    const isDbUp = postgresDb.isConnected;
    const isRedisUp = redis.getIsConnected();

    if (isDbUp && isRedisUp) {
      return res.status(200).json({
        status: "ready",
        database: "connected",
        redis: "connected",
        redis_real: redis.getIsRealRedis(),
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(503).json({
      status: "degraded",
      database: isDbUp ? "connected" : "disconnected",
      redis: isRedisUp ? "connected" : "disconnected",
      redis_real: redis.getIsRealRedis(),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/health", (req, res) => {
    res.json({
      status: postgresDb.isConnected && redis.getIsConnected() ? "healthy" : "degraded",
      version: "3.0.0",
      architecture: "PostgreSQL 15 Central Persistent DB + Redis Async Queue",
      timestamp: new Date().toISOString(),
    });
  });

  // ==========================================
  // AUTHENTICATION ENDPOINTS
  // ==========================================
  app.post("/auth/register", async (req, res) => {
    try {
      const { email, password, name, timezone } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Email and password are required." },
        });
      }

      const normalizedEmail = normalizeGmailAddress(email);
      if (!normalizedEmail) {
        return res.status(400).json({
          error: { code: "GMAIL_REQUIRED", message: "Please use a valid Gmail address ending in @gmail.com." },
        });
      }

      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
          error: { code: "WEAK_PASSWORD", message: "Password must be at least 8 characters long." },
        });
      }

      const existingUser = await postgresDb.queryOne<any>(
        "SELECT id FROM users WHERE LOWER(TRIM(email)) = $1;",
        [normalizedEmail]
      );
      if (existingUser) {
        return res.status(409).json({
          error: { code: "EMAIL_ALREADY_EXISTS", message: "An account with this email already exists." },
        });
      }

      const verification = createVerificationToken();
      const prefs = JSON.stringify({
        timezone: timezone || "UTC",
        quiet_hours_enabled: false,
        quiet_hours_start: "22:00",
        quiet_hours_end: "08:00",
        email_notifications_enabled: true,
      });

      // Insert directly into PostgreSQL
      const inserted = await postgresDb.queryOne<any>(
        `INSERT INTO users (email, name, password_hash, role, is_active, email_verified, verification_token, verification_token_hash, verification_token_expires_at, verification_last_sent_at, preferences, created_at, updated_at)
         VALUES ($1, $2, $3, 'USER', true, false, NULL, $4, $5, NOW(), $6::jsonb, NOW(), NOW())
         RETURNING *;`,
        [normalizedEmail, name ? name.trim() : null, hashPassword(password), verification.tokenHash, verification.expiresAt, prefs]
      );

      const newUser = postgresDb.mapUserRow(inserted);

      // Initial welcome notification in-app in PostgreSQL
      await postgresDb.query(
        `INSERT INTO notifications (user_id, title, message, type, channel, status, read, created_at)
         VALUES ($1, $2, $3, 'SYSTEM', 'IN_APP', 'UNREAD', false, NOW());`,
        [newUser.id, "Welcome to Tik Tik", "Your account has been created. Create your first activity to start organizing!"]
      );

      const emailResult = await sendVerificationEmail(req, newUser, verification.rawToken);
      if (!emailResult.success) {
        console.error("[AUTH] Verification email dispatch failed", {
          provider: getActiveEmailProvider().getProviderName(),
          transient: emailResult.isTransient !== false,
        });
        return res.status(503).json({
          error: { code: "EMAIL_DELIVERY_UNAVAILABLE", message: "Your account was created, but the verification email could not be sent. Please try again shortly." },
        });
      }

      res.status(201).json({
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          is_active: newUser.is_active,
          email_verified: newUser.email_verified,
          preferences: newUser.preferences,
        },
        verification_required: true,
      });
    } catch (err: any) {
      console.error("[AUTH REGISTER ERROR]", err);
      res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
    }
  });

  app.all("/auth/verify-email", async (req, res) => {
    try {
      const token = (req.query.token || req.body?.token) as string;
      if (!token) {
        return res.status(400).json({ error: { code: "MISSING_TOKEN", message: "Verification token is required." } });
      }

      if (req.method === "GET") {
        return res.redirect(`${getFrontendUrl(req)}/verify-email?token=${encodeURIComponent(token)}`);
      }

      const updated = await postgresDb.queryOne<any>(
        `UPDATE users SET email_verified = true, email_verified_at = NOW(), verification_token = NULL, verification_token_hash = NULL, verification_token_expires_at = NULL, verification_last_sent_at = NULL, updated_at = NOW()
         WHERE (verification_token_hash = $1 AND verification_token_expires_at > NOW()) OR verification_token = $2 RETURNING *;`,
        [hashVerificationToken(token), token]
      );

      if (!updated) {
        return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired verification token." } });
      }

      res.json({ status: "ok", message: "Email verified successfully." });
    } catch (err: any) {
      res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
    }
  });

  app.post("/auth/resend-verification", async (req, res) => {
    const genericResponse = {
      status: "ok",
      message: "If an unverified Gmail account exists, a new verification email will be sent shortly.",
    };

    try {
      const normalizedEmail = normalizeGmailAddress(req.body?.email);
      if (!normalizedEmail) return res.status(202).json(genericResponse);

      const lastAttempt = verificationResendAttempts.get(normalizedEmail) || 0;
      if (Date.now() - lastAttempt < VERIFICATION_RESEND_COOLDOWN_MS) {
        return res.status(202).json(genericResponse);
      }
      verificationResendAttempts.set(normalizedEmail, Date.now());

      const userRow = await postgresDb.queryOne<any>(
        "SELECT * FROM users WHERE LOWER(TRIM(email)) = $1 AND is_active = true;",
        [normalizedEmail]
      );
      if (!userRow || userRow.email_verified) return res.status(202).json(genericResponse);

      const lastSentAt = userRow.verification_last_sent_at
        ? new Date(userRow.verification_last_sent_at).getTime()
        : 0;
      if (Date.now() - lastSentAt < VERIFICATION_RESEND_COOLDOWN_MS) {
        return res.status(202).json(genericResponse);
      }

      const verification = createVerificationToken();
      await postgresDb.query(
        `UPDATE users SET verification_token = NULL, verification_token_hash = $1, verification_token_expires_at = $2, verification_last_sent_at = NOW(), updated_at = NOW()
         WHERE id = $3;`,
        [verification.tokenHash, verification.expiresAt, userRow.id]
      );

      const result = await sendVerificationEmail(req, postgresDb.mapUserRow(userRow), verification.rawToken);
      if (!result.success) {
        console.error("[AUTH] Resend verification email failed", {
          provider: getActiveEmailProvider().getProviderName(),
          transient: result.isTransient !== false,
        });
      }
      return res.status(202).json(genericResponse);
    } catch (err: any) {
      console.error("[AUTH] Resend verification request failed", { message: err?.message });
      return res.status(202).json(genericResponse);
    }
  });

  app.post("/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Email is required." } });
      }
      const normalizedEmail = email.toLowerCase().trim();
      const userRow = await postgresDb.queryOne<any>(
        "SELECT * FROM users WHERE LOWER(TRIM(email)) = $1;",
        [normalizedEmail]
      );

      if (userRow) {
        const resetToken = crypto.randomUUID();
        await postgresDb.query(
          "UPDATE users SET reset_token = $1, updated_at = NOW() WHERE id = $2;",
          [resetToken, userRow.id]
        );

        await getActiveEmailProvider()
          .sendEmail({
            to: userRow.email,
            subject: "Password Reset Request - Tik Tik",
            text: `Hello ${userRow.name || "there"},\n\nWe received a request to reset your password.\n\nPlease use the following reset token or link to choose a new password:\nToken: ${resetToken}\n\nLink: ${req.protocol}://${req.get("host")}/reset-password?token=${resetToken}\n\nIf you did not request this, you can safely ignore this email.`,
            html: `<p>Hello ${userRow.name || "there"},</p><p>We received a request to reset your password.</p><p><a href="${req.protocol}://${req.get("host")}/reset-password?token=${resetToken}">Click here to reset your password</a></p><p>Or enter this reset token in the app: <code>${resetToken}</code></p><p>If you did not request this, you can safely ignore this email.</p>`,
          })
          .catch((err) => {
            console.error("[AUTH] Password reset email dispatch error:", err?.message);
          });
      }

      res.json({
        status: "ok",
        message: "If an account with that email exists, password reset instructions have been sent.",
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
    }
  });

  app.post("/auth/reset-password", async (req, res) => {
    try {
      const { token, new_password } = req.body || {};
      if (!token || !new_password) {
        return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Reset token and new password are required." } });
      }
      if (new_password.length < 8) {
        return res.status(400).json({ error: { code: "WEAK_PASSWORD", message: "Password must be at least 8 characters long." } });
      }

      const updated = await postgresDb.queryOne<any>(
        `UPDATE users SET password_hash = $1, reset_token = NULL, updated_at = NOW()
         WHERE reset_token = $2 RETURNING id;`,
        [hashPassword(new_password), token]
      );

      if (!updated) {
        return res.status(400).json({ error: { code: "INVALID_TOKEN", message: "Invalid or expired password reset token." } });
      }

      res.json({ status: "ok", message: "Password has been successfully reset. You may now log in." });
    } catch (err: any) {
      res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
    }
  });

  app.post("/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Email and password are required." },
        });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const userRow = await postgresDb.queryOne<any>(
        "SELECT * FROM users WHERE LOWER(TRIM(email)) = $1;",
        [normalizedEmail]
      );

      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        return res.status(401).json({
          error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." },
        });
      }

      if (!userRow.is_active) {
        return res.status(403).json({
          error: { code: "ACCOUNT_SUSPENDED", message: "Account has been suspended." },
        });
      }

      if (!userRow.email_verified) {
        return res.status(403).json({
          error: { code: "EMAIL_NOT_VERIFIED", message: "Please verify your Gmail address before signing in." },
        });
      }

      const user = postgresDb.mapUserRow(userRow);
      await postgresDb.query("UPDATE users SET last_login_at = NOW() WHERE id = $1;", [user.id]);

      const { token } = generateJwt(user);

      // Audit log without sensitive credentials
      await postgresDb.query(
        `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
         VALUES ($1, $2, 'USER_AUTHENTICATED', 'USER', $3, $4::jsonb, $5, NOW());`,
        [user.role === "ADMIN" ? user.id : null, user.email, user.id.toString(), JSON.stringify({ role: user.role }), req.ip || "127.0.0.1"]
      );

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          is_active: user.is_active,
          email_verified: user.email_verified,
          preferences: user.preferences,
        },
        token,
      });
    } catch (err: any) {
      console.error("[AUTH LOGIN ERROR]", err);
      res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
    }
  });

  app.get("/auth/me", authenticateUser, (req, res) => {
    const user = (req as any).user as UserRecord;
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      email_verified: user.email_verified,
      preferences: user.preferences,
      created_at: user.created_at,
    };
    res.json({
      ...userData,
      user: userData,
    });
  });

  app.post("/auth/logout", authenticateUser, async (req, res) => {
    try {
      const jti = (req as any).tokenJti as string;
      if (jti) {
        await postgresDb.revokeToken(jti);
      }
      res.json({ status: "ok", message: "Logged out and JWT revoked." });
    } catch (err: any) {
      res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
    }
  });

  // User preferences
  app.patch("/api/users/preferences", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const { timezone, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, email_notifications_enabled, occupation } =
        req.body || {};

      const currentPrefs = user.preferences || {};
      const newPrefs = {
        ...currentPrefs,
        ...(timezone !== undefined && { timezone }),
        ...(quiet_hours_enabled !== undefined && { quiet_hours_enabled: Boolean(quiet_hours_enabled) }),
        ...(quiet_hours_start !== undefined && { quiet_hours_start }),
        ...(quiet_hours_end !== undefined && { quiet_hours_end }),
        ...(email_notifications_enabled !== undefined && { email_notifications_enabled: Boolean(email_notifications_enabled) }),
        ...(occupation !== undefined && { occupation }),
      };

      const updated = await postgresDb.queryOne<any>(
        "UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2 RETURNING preferences;",
        [JSON.stringify(newPrefs), user.id]
      );

      res.json(typeof updated?.preferences === "string" ? JSON.parse(updated.preferences) : updated?.preferences);
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.get("/api/users/me", authenticateUser, (req, res) => {
    const user = (req as any).user as UserRecord;
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active,
      email_verified: user.email_verified,
      preferences: user.preferences,
      created_at: user.created_at,
    };
    res.json(userData);
  });

  app.patch("/api/users/me", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const { name } = req.body || {};

      const updated = await postgresDb.queryOne<any>(
        "UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING *;",
        [name !== undefined ? (name ? name.trim() : null) : user.name, user.id]
      );

      res.json(postgresDb.mapUserRow(updated));
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post("/api/users/password", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const { current_password, new_password } = req.body || {};

      if (!current_password || !new_password) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Current password and new password are required." },
        });
      }

      if (typeof new_password !== "string" || new_password.length < 8) {
        return res.status(400).json({
          error: { code: "WEAK_PASSWORD", message: "New password must be at least 8 characters long." },
        });
      }

      const userRow = await postgresDb.queryOne<any>("SELECT * FROM users WHERE id = $1;", [user.id]);
      if (!userRow || !verifyPassword(current_password, userRow.password_hash)) {
        return res.status(400).json({
          error: { code: "INVALID_CREDENTIALS", message: "Current password is incorrect." },
        });
      }

      const newHash = hashPassword(new_password);
      await postgresDb.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;", [newHash, user.id]);

      await postgresDb.query(
        `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
         VALUES ($1, $2, 'PASSWORD_UPDATED', 'USER', $3, $4::jsonb, $5, NOW());`,
        [user.role === "ADMIN" ? user.id : null, user.email, String(user.id), JSON.stringify({ role: user.role }), req.ip || "127.0.0.1"]
      );

      res.json({ status: "ok", message: "Password updated successfully." });
    } catch (err: any) {
      res.status(500).json({ error: { code: "SERVER_ERROR", message: err.message } });
    }
  });

  // ==========================================
  // IN-APP NOTIFICATIONS (NOTIFICATION CENTER)
  // ==========================================
  app.get("/api/notifications", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const rows = await postgresDb.query<any>(
        "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC;",
        [user.id]
      );
      res.json(rows.map((r) => postgresDb.mapNotificationRow(r)));
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const notifId = Number(req.params.id);

      const updated = await postgresDb.queryOne<any>(
        `UPDATE notifications SET read = true, read_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *;`,
        [notifId, user.id]
      );

      if (!updated) {
        return res.status(404).json({
          error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification not found." },
        });
      }

      res.json(postgresDb.mapNotificationRow(updated));
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.patch("/api/notifications/read-all", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      await postgresDb.query(
        "UPDATE notifications SET read = true, read_at = NOW() WHERE user_id = $1 AND read = false;",
        [user.id]
      );
      res.json({ status: "ok", message: "All notifications marked as read." });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  // ==========================================
  // ACTIVITIES ENDPOINTS
  // ==========================================
  app.get("/api/activities", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const { status, search, importance, urgency, priority, sort_by = "priority", sort_order = "desc" } = req.query as any;

      let sql = "SELECT * FROM activities WHERE user_id = $1";
      const params: any[] = [user.id];

      if (status && status !== "ALL") {
        params.push(status);
        sql += ` AND status = $${params.length}`;
      }

      if (importance && importance !== "ALL") {
        params.push(Number(importance));
        sql += ` AND importance = $${params.length}`;
      }

      if (search && typeof search === "string" && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        sql += ` AND (LOWER(title) LIKE $${params.length} OR LOWER(COALESCE(description, '')) LIKE $${params.length})`;
      }

      sql += " ORDER BY id DESC;";
      const rows = await postgresDb.query<any>(sql, params);

      let userActivities = await Promise.all(
        rows.map((r) => buildActivityResponse(postgresDb.mapActivityRow(r)))
      );

      if (urgency && urgency !== "ALL") {
        userActivities = userActivities.filter((a) => a.urgency === urgency);
      }

      if (priority && priority !== "ALL") {
        userActivities = userActivities.filter((a) => a.priority_quadrant === priority);
      }

      // Authoritative sorting
      const isAsc = sort_order === "asc";
      if (sort_by === "priority") {
        userActivities.sort((a, b) => (isAsc ? a.priority_score - b.priority_score : b.priority_score - a.priority_score));
      } else if (sort_by === "deadline") {
        userActivities.sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          const diff = new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
          return isAsc ? diff : -diff;
        });
      } else if (sort_by === "importance") {
        userActivities.sort((a, b) => (isAsc ? a.importance - b.importance : b.importance - a.importance));
      } else if (sort_by === "created_at") {
        userActivities.sort((a, b) => {
          const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          return isAsc ? diff : -diff;
        });
      } else if (sort_by === "title") {
        userActivities.sort((a, b) => (isAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)));
      }

      res.json(userActivities);
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post("/api/activities", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const {
        title,
        description,
        importance = 3,
        deadline,
        status = "PENDING",
        activity_type = "Task",
        estimated_time,
        is_adaptive_reminder = false,
        recurrence,
      } = req.body || {};

      if (!title || !title.trim()) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Activity title is required." },
        });
      }

      const clampedImportance = Math.max(1, Math.min(5, Number(importance)));
      const deadlineIso = deadline ? new Date(deadline).toISOString() : null;

      const inserted = await postgresDb.queryOne<any>(
        `INSERT INTO activities (
          user_id, title, description, importance, deadline, status, activity_type,
          estimated_time, is_adaptive_reminder, adaptive_stage, recurrence_id, parent_habit_id,
          completed_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 0, NULL, NULL,
          $10, NOW(), NOW()
        ) RETURNING *;`,
        [
          user.id,
          title.trim(),
          description ? description.trim() : null,
          clampedImportance,
          deadlineIso,
          status,
          activity_type || "Task",
          estimated_time || null,
          Boolean(is_adaptive_reminder),
          status === "COMPLETED" ? new Date().toISOString() : null,
        ]
      );

      let activity = postgresDb.mapActivityRow(inserted);

      if (activity_type === "Habit" && recurrence) {
        const frequency = recurrence.frequency || "DAILY";
        const daysOfWeek = recurrence.days_of_week || (frequency === "WEEKDAYS" ? [1, 2, 3, 4, 5] : []);

        const habitRow = await postgresDb.queryOne<any>(
          `INSERT INTO habit_rules (
            activity_id, user_id, frequency, days_of_week, is_active, last_generated_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4::jsonb, true, NOW(), NOW(), NOW()) RETURNING *;`,
          [activity.id, user.id, frequency, JSON.stringify(daysOfWeek)]
        );

        if (habitRow) {
          await postgresDb.query("UPDATE activities SET recurrence_id = $1 WHERE id = $2;", [habitRow.id, activity.id]);
          activity.recurrence_id = habitRow.id;
        }
      }

      const response = await buildActivityResponse(activity);
      res.status(201).json(response);
    } catch (err: any) {
      console.error("[POST ACTIVITY ERROR]", err);
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.get("/api/activities/summary", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const rows = await postgresDb.query<any>(
        "SELECT * FROM activities WHERE user_id = $1;",
        [user.id]
      );

      const stats = {
        total_activities: rows.length,
        pending: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        overdue: 0,
        due_today: 0,
        due_soon: 0,
        high_priority_p1: 0,
      };

      for (const r of rows) {
        const act = postgresDb.mapActivityRow(r);
        if (act.status === "PENDING") stats.pending++;
        else if (act.status === "IN_PROGRESS") stats.in_progress++;
        else if (act.status === "COMPLETED") stats.completed++;
        else if (act.status === "CANCELLED") stats.cancelled++;

        const urgency = computeUrgency(act.deadline, act.status);
        if (urgency === "OVERDUE") stats.overdue++;
        else if (urgency === "DUE_TODAY") stats.due_today++;
        else if (urgency === "DUE_SOON") stats.due_soon++;

        const [quadrant] = computePriority(act.importance, urgency, act.status);
        if (quadrant === "P1_CRITICAL") stats.high_priority_p1++;
      }

      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.get("/api/activities/:id", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const actRow = await postgresDb.queryOne<any>(
        "SELECT * FROM activities WHERE id = $1 AND user_id = $2;",
        [id, user.id]
      );

      if (!actRow) {
        return res.status(404).json({
          error: { code: "ACTIVITY_NOT_FOUND", message: `Activity ${id} not found or access denied.` },
        });
      }

      const response = await buildActivityResponse(postgresDb.mapActivityRow(actRow));
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  const updateActivityHandler = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const actRow = await postgresDb.queryOne<any>(
        "SELECT * FROM activities WHERE id = $1 AND user_id = $2;",
        [id, user.id]
      );

      if (!actRow) {
        return res.status(404).json({
          error: { code: "ACTIVITY_NOT_FOUND", message: `Activity ${id} not found or access denied.` },
        });
      }

      let act = postgresDb.mapActivityRow(actRow);

      const {
        title,
        description,
        importance,
        deadline,
        status,
        activity_type,
        estimated_time,
        force_complete,
      } = req.body || {};
      const nowIso = new Date().toISOString();

      const isForceComplete = Boolean(
        force_complete ||
        (req.body && req.body.force) ||
        req.query.force === "true" ||
        req.query.force_complete === "true"
      );

      let newTitle = title !== undefined ? title.trim() : act.title;
      let newDescription = description !== undefined ? (description ? description.trim() : null) : act.description;
      let newImportance = importance !== undefined ? Math.max(1, Math.min(5, Number(importance))) : act.importance;
      let newDeadline = deadline !== undefined ? (deadline ? new Date(deadline).toISOString() : null) : act.deadline;
      let newType = activity_type !== undefined ? activity_type : act.activity_type;
      let newEstTime = estimated_time !== undefined ? estimated_time : act.estimated_time;
      let newStatus = status !== undefined ? status : act.status;
      let completedAt = act.completed_at;

      if (status !== undefined) {
        if (status === "COMPLETED") {
          const incompleteRows = await postgresDb.query<any>(
            "SELECT * FROM subtasks WHERE activity_id = $1 AND is_completed = false;",
            [act.id]
          );

          if (incompleteRows.length > 0 && !isForceComplete) {
            return res.status(400).json({
              error: {
                code: "INCOMPLETE_SUBTASKS",
                message: `Cannot complete activity: ${incompleteRows.length} subtask(s) are still pending. Complete all subtasks or pass force_complete=True.`,
                pending_count: incompleteRows.length,
              },
            });
          }

          if (incompleteRows.length > 0 && isForceComplete) {
            await postgresDb.query(
              "UPDATE subtasks SET is_completed = true, completed_at = NOW(), updated_at = NOW() WHERE activity_id = $1 AND is_completed = false;",
              [act.id]
            );
          }

          completedAt = nowIso;
          newStatus = "COMPLETED";

          // Dismiss active scheduled reminders for this activity
          await postgresDb.query(
            "UPDATE reminders SET status = 'DISMISSED', updated_at = NOW() WHERE activity_id = $1 AND status IN ('SCHEDULED', 'SNOOZED');",
            [act.id]
          );

          // RECURRING HABIT ENGINE: Generate next occurrence if recurrence rule is active
          if (act.activity_type === "Habit" && act.recurrence_id) {
            const ruleRow = await postgresDb.queryOne<any>(
              "SELECT * FROM habit_rules WHERE id = $1 AND is_active = true;",
              [act.recurrence_id]
            );

            if (ruleRow) {
              const rule = postgresDb.mapHabitRuleRow(ruleRow);
              const nextDeadlineIso = computeNextHabitOccurrence(
                act.deadline,
                rule.frequency,
                rule.days_of_week
              );
              const nextDateOnly = nextDeadlineIso.split("T")[0];

              // Check if duplicate already exists
              const alreadyExists = await postgresDb.queryOne<any>(
                `SELECT id FROM activities 
                 WHERE user_id = $1 AND recurrence_id = $2 AND status = 'PENDING' AND deadline::text LIKE $3;`,
                [user.id, rule.id, `${nextDateOnly}%`]
              );

              if (!alreadyExists) {
                const nextOcc = await postgresDb.queryOne<any>(
                  `INSERT INTO activities (
                    user_id, title, description, importance, deadline, status, activity_type,
                    estimated_time, is_adaptive_reminder, adaptive_stage, recurrence_id, parent_habit_id,
                    completed_at, created_at, updated_at
                  ) VALUES (
                    $1, $2, $3, $4, $5, 'PENDING', 'Habit',
                    $6, $7, 0, $8, $9, NULL, NOW(), NOW()
                  ) RETURNING *;`,
                  [
                    user.id,
                    act.title,
                    act.description,
                    act.importance,
                    nextDeadlineIso,
                    act.estimated_time,
                    act.is_adaptive_reminder,
                    rule.id,
                    act.parent_habit_id || act.id,
                  ]
                );

                if (nextOcc) {
                  // Clone subtasks
                  const oldSubtasks = await postgresDb.query<any>(
                    "SELECT * FROM subtasks WHERE activity_id = $1;",
                    [act.id]
                  );
                  for (const ost of oldSubtasks) {
                    await postgresDb.query(
                      `INSERT INTO subtasks (activity_id, user_id, title, is_completed, order_num, created_at, updated_at)
                       VALUES ($1, $2, $3, false, $4, NOW(), NOW());`,
                      [nextOcc.id, user.id, ost.title, ost.order_num ?? 1]
                    );
                  }

                  await postgresDb.query(
                    "UPDATE habit_rules SET last_generated_at = NOW(), updated_at = NOW() WHERE id = $1;",
                    [rule.id]
                  );

                  await postgresDb.query(
                    `INSERT INTO audit_logs (admin_id, admin_email, action, target_type, target_id, details, ip_address, created_at)
                     VALUES ($1, $2, 'HABIT_NEXT_OCCURRENCE_GENERATED', 'ACTIVITY', $3, $4::jsonb, $5, NOW());`,
                    [
                      user.role === "ADMIN" ? user.id : null,
                      user.email,
                      String(nextOcc.id),
                      JSON.stringify({ rule_id: rule.id, frequency: rule.frequency, next_deadline: nextDeadlineIso }),
                      req.ip || "127.0.0.1",
                    ]
                  );
                }
              }
            }
          }
        } else {
          newStatus = status;
          completedAt = null;
          if (status === "CANCELLED") {
            await postgresDb.query(
              "UPDATE reminders SET status = 'DISMISSED', updated_at = NOW() WHERE activity_id = $1 AND status IN ('SCHEDULED', 'SNOOZED');",
              [act.id]
            );
          }
        }
      }

      const updatedRow = await postgresDb.queryOne<any>(
        `UPDATE activities SET
          title = $1, description = $2, importance = $3, deadline = $4,
          activity_type = $5, estimated_time = $6, status = $7, completed_at = $8, updated_at = NOW()
         WHERE id = $9 AND user_id = $10 RETURNING *;`,
        [newTitle, newDescription, newImportance, newDeadline, newType, newEstTime, newStatus, completedAt, act.id, user.id]
      );

      const response = await buildActivityResponse(postgresDb.mapActivityRow(updatedRow));
      res.json(response);
    } catch (err: any) {
      console.error("[UPDATE ACTIVITY ERROR]", err);
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  };

  app.patch("/api/activities/:id", authenticateUser, updateActivityHandler);
  app.put("/api/activities/:id", authenticateUser, updateActivityHandler);

  app.delete("/api/activities/:id", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const deleted = await postgresDb.queryOne<any>(
        "DELETE FROM activities WHERE id = $1 AND user_id = $2 RETURNING id;",
        [id, user.id]
      );

      if (!deleted) {
        return res.status(404).json({
          error: { code: "ACTIVITY_NOT_FOUND", message: `Activity ${id} not found or access denied.` },
        });
      }

      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  // ==========================================
  // SUBTASKS ENDPOINTS
  // ==========================================
  app.get("/api/activities/:activity_id/subtasks", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const actId = Number(req.params.activity_id);

      const act = await postgresDb.queryOne<any>(
        "SELECT id FROM activities WHERE id = $1 AND user_id = $2;",
        [actId, user.id]
      );

      if (!act) {
        return res.status(404).json({
          error: { code: "ACTIVITY_NOT_FOUND", message: "Activity not found or access denied." },
        });
      }

      const rows = await postgresDb.query<any>(
        "SELECT * FROM subtasks WHERE activity_id = $1 ORDER BY order_num ASC, id ASC;",
        [actId]
      );

      res.json(rows.map((s) => postgresDb.mapSubtaskRow(s)));
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post("/api/activities/:activity_id/subtasks", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const actId = Number(req.params.activity_id);

      const act = await postgresDb.queryOne<any>(
        "SELECT * FROM activities WHERE id = $1 AND user_id = $2;",
        [actId, user.id]
      );

      if (!act) {
        return res.status(404).json({
          error: { code: "ACTIVITY_NOT_FOUND", message: "Activity not found or access denied." },
        });
      }

      const { title } = req.body || {};
      if (!title || !title.trim()) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Subtask title is required." },
        });
      }

      const maxOrderRow = await postgresDb.queryOne<any>(
        "SELECT COALESCE(MAX(order_num), 0)::int as max_order FROM subtasks WHERE activity_id = $1;",
        [actId]
      );
      const nextOrder = (maxOrderRow?.max_order || 0) + 1;

      const inserted = await postgresDb.queryOne<any>(
        `INSERT INTO subtasks (activity_id, user_id, title, is_completed, order_num, created_at, updated_at)
         VALUES ($1, $2, $3, false, $4, NOW(), NOW()) RETURNING *;`,
        [actId, user.id, title.trim(), nextOrder]
      );

      // Reopen activity if it was COMPLETED
      if (act.status === "COMPLETED") {
        await postgresDb.query(
          "UPDATE activities SET status = 'IN_PROGRESS', completed_at = NULL, updated_at = NOW() WHERE id = $1;",
          [actId]
        );
      }

      res.status(201).json(postgresDb.mapSubtaskRow(inserted));
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  const updateSubtaskHandler = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const subtaskRow = await postgresDb.queryOne<any>(
        "SELECT * FROM subtasks WHERE id = $1 AND user_id = $2;",
        [id, user.id]
      );

      if (!subtaskRow) {
        return res.status(404).json({
          error: { code: "SUBTASK_NOT_FOUND", message: "Subtask not found or access denied." },
        });
      }

      let subtask = postgresDb.mapSubtaskRow(subtaskRow);
      const { title, is_completed, order } = req.body || {};
      const nowIso = new Date().toISOString();

      let newTitle = title !== undefined ? title.trim() : subtask.title;
      let newOrder = order !== undefined ? Number(order) : subtask.order;
      let newCompleted = is_completed !== undefined ? Boolean(is_completed) : subtask.is_completed;
      let completedAt = subtask.completed_at;

      if (is_completed !== undefined) {
        if (newCompleted && !subtask.is_completed) {
          completedAt = nowIso;
        } else if (!newCompleted && subtask.is_completed) {
          completedAt = null;
          // Reopen parent activity if completed
          await postgresDb.query(
            "UPDATE activities SET status = 'IN_PROGRESS', completed_at = NULL, updated_at = NOW() WHERE id = $1 AND status = 'COMPLETED';",
            [subtask.activity_id]
          );
        }
      }

      const updated = await postgresDb.queryOne<any>(
        `UPDATE subtasks SET title = $1, order_num = $2, is_completed = $3, completed_at = $4, updated_at = NOW()
         WHERE id = $5 AND user_id = $6 RETURNING *;`,
        [newTitle, newOrder, newCompleted, completedAt, id, user.id]
      );

      res.json(postgresDb.mapSubtaskRow(updated));
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  };

  app.patch("/api/subtasks/:id", authenticateUser, updateSubtaskHandler);
  app.put("/api/subtasks/:id", authenticateUser, updateSubtaskHandler);

  app.delete("/api/subtasks/:id", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const deleted = await postgresDb.queryOne<any>(
        "DELETE FROM subtasks WHERE id = $1 AND user_id = $2 RETURNING id;",
        [id, user.id]
      );

      if (!deleted) {
        return res.status(404).json({
          error: { code: "SUBTASK_NOT_FOUND", message: "Subtask not found or access denied." },
        });
      }

      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  // ==========================================
  // REMINDERS ENDPOINTS
  // ==========================================
  app.get("/api/reminders", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const rows = await postgresDb.query<any>(`
        SELECT r.*, a.title as activity_title
        FROM reminders r
        LEFT JOIN activities a ON r.activity_id = a.id
        WHERE r.user_id = $1
        ORDER BY r.remind_at ASC;
      `, [user.id]);

      const reminders = rows.map((r) => {
        const mapped = postgresDb.mapReminderRow(r);
        return {
          ...mapped,
          effective_status: evaluateReminderStatus(mapped),
          activity_title: r.activity_title || null,
        };
      });

      res.json(reminders);
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post("/api/activities/:activity_id/reminders", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const actId = Number(req.params.activity_id);

      const act = await postgresDb.queryOne<any>(
        "SELECT id, title FROM activities WHERE id = $1 AND user_id = $2;",
        [actId, user.id]
      );

      if (!act) {
        return res.status(404).json({
          error: { code: "ACTIVITY_NOT_FOUND", message: "Activity not found or access denied." },
        });
      }

      const { remind_at, message } = req.body || {};
      if (!remind_at) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "remind_at timestamp is required." },
        });
      }

      const inserted = await postgresDb.queryOne<any>(
        `INSERT INTO reminders (activity_id, user_id, remind_at, message, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'SCHEDULED', NOW(), NOW()) RETURNING *;`,
        [actId, user.id, new Date(remind_at).toISOString(), message ? message.trim() : null]
      );

      const mapped = postgresDb.mapReminderRow(inserted);
      res.status(201).json({
        ...mapped,
        effective_status: evaluateReminderStatus(mapped),
        activity_title: act.title,
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post("/api/reminders/:id/snooze", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);
      const { minutes = 15 } = req.body || {};
      const snoozeTime = new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();

      const updated = await postgresDb.queryOne<any>(
        `UPDATE reminders SET status = 'SNOOZED', snooze_until = $1, updated_at = NOW()
         WHERE id = $2 AND user_id = $3 RETURNING *;`,
        [snoozeTime, id, user.id]
      );

      if (!updated) {
        return res.status(404).json({
          error: { code: "REMINDER_NOT_FOUND", message: "Reminder not found or access denied." },
        });
      }

      const mapped = postgresDb.mapReminderRow(updated);
      res.json({
        ...mapped,
        effective_status: evaluateReminderStatus(mapped),
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post("/api/reminders/:id/dismiss", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const updated = await postgresDb.queryOne<any>(
        `UPDATE reminders SET status = 'DISMISSED', dismissed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *;`,
        [id, user.id]
      );

      if (!updated) {
        return res.status(404).json({
          error: { code: "REMINDER_NOT_FOUND", message: "Reminder not found or access denied." },
        });
      }

      const mapped = postgresDb.mapReminderRow(updated);
      res.json({
        ...mapped,
        effective_status: "DISMISSED",
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.delete("/api/reminders/:id", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const deleted = await postgresDb.queryOne<any>(
        "DELETE FROM reminders WHERE id = $1 AND user_id = $2 RETURNING id;",
        [id, user.id]
      );

      if (!deleted) {
        return res.status(404).json({
          error: { code: "REMINDER_NOT_FOUND", message: "Reminder not found or access denied." },
        });
      }

      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  // ==========================================
  // FOLLOW-UPS ENDPOINTS (Supports both /followups and /follow-ups)
  // ==========================================
  app.get(["/api/followups", "/api/follow-ups"], authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const rows = await postgresDb.query<any>(`
        SELECT f.*, a.title as activity_title
        FROM followups f
        LEFT JOIN activities a ON f.activity_id = a.id
        WHERE f.user_id = $1
        ORDER BY f.scheduled_at ASC;
      `, [user.id]);

      const followups = rows.map((f) => ({
        ...postgresDb.mapFollowUpRow(f),
        activity_title: f.activity_title || null,
      }));

      res.json(followups);
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post(["/api/activities/:activity_id/followups", "/api/activities/:activity_id/follow-ups"], authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const actId = Number(req.params.activity_id);

      const act = await postgresDb.queryOne<any>(
        "SELECT id, title FROM activities WHERE id = $1 AND user_id = $2;",
        [actId, user.id]
      );

      if (!act) {
        return res.status(404).json({
          error: { code: "ACTIVITY_NOT_FOUND", message: "Activity not found or access denied." },
        });
      }

      const { note, scheduled_at } = req.body || {};
      if (!note || !scheduled_at) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "note and scheduled_at are required." },
        });
      }

      const inserted = await postgresDb.queryOne<any>(
        `INSERT INTO followups (activity_id, user_id, note, scheduled_at, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'PENDING', NOW(), NOW()) RETURNING *;`,
        [actId, user.id, note.trim(), new Date(scheduled_at).toISOString()]
      );

      res.status(201).json({
        ...postgresDb.mapFollowUpRow(inserted),
        activity_title: act.title,
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post(["/api/followups/:id/complete", "/api/follow-ups/:id/complete"], authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);
      const { outcome } = req.body || {};

      const updated = await postgresDb.queryOne<any>(
        `UPDATE followups SET status = 'COMPLETED', outcome = $1, completed_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND user_id = $3 RETURNING *;`,
        [outcome || "Completed", id, user.id]
      );

      if (!updated) {
        return res.status(404).json({
          error: { code: "FOLLOWUP_NOT_FOUND", message: "Follow-up not found or access denied." },
        });
      }

      const act = await postgresDb.queryOne<any>("SELECT title FROM activities WHERE id = $1;", [updated.activity_id]);
      res.json({
        ...postgresDb.mapFollowUpRow(updated),
        activity_title: act?.title || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.post(["/api/followups/:id/cancel", "/api/follow-ups/:id/cancel"], authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const updated = await postgresDb.queryOne<any>(
        `UPDATE followups SET status = 'CANCELLED', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *;`,
        [id, user.id]
      );

      if (!updated) {
        return res.status(404).json({
          error: { code: "FOLLOWUP_NOT_FOUND", message: "Follow-up not found or access denied." },
        });
      }

      const act = await postgresDb.queryOne<any>("SELECT title FROM activities WHERE id = $1;", [updated.activity_id]);
      res.json({
        ...postgresDb.mapFollowUpRow(updated),
        activity_title: act?.title || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.patch(["/api/followups/:id", "/api/follow-ups/:id"], authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const current = await postgresDb.queryOne<any>(
        "SELECT * FROM followups WHERE id = $1 AND user_id = $2;",
        [id, user.id]
      );

      if (!current) {
        return res.status(404).json({
          error: { code: "FOLLOWUP_NOT_FOUND", message: "Follow-up not found or access denied." },
        });
      }

      const { note, scheduled_at, status, outcome } = req.body || {};
      const newNote = note !== undefined ? note.trim() : current.note;
      const newSched = scheduled_at !== undefined ? new Date(scheduled_at).toISOString() : current.scheduled_at;
      const newStatus = status !== undefined ? status : current.status;
      const newOutcome = outcome !== undefined ? outcome : current.outcome;
      const completedAt = newStatus === "COMPLETED" ? new Date().toISOString() : current.completed_at;

      const updated = await postgresDb.queryOne<any>(
        `UPDATE followups SET note = $1, scheduled_at = $2, status = $3, outcome = $4, completed_at = $5, updated_at = NOW()
         WHERE id = $6 AND user_id = $7 RETURNING *;`,
        [newNote, newSched, newStatus, newOutcome, completedAt, id, user.id]
      );

      const act = await postgresDb.queryOne<any>("SELECT title FROM activities WHERE id = $1;", [updated.activity_id]);
      res.json({
        ...postgresDb.mapFollowUpRow(updated),
        activity_title: act?.title || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.delete(["/api/followups/:id", "/api/follow-ups/:id"], authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const deleted = await postgresDb.queryOne<any>(
        "DELETE FROM followups WHERE id = $1 AND user_id = $2 RETURNING id;",
        [id, user.id]
      );

      if (!deleted) {
        return res.status(404).json({
          error: { code: "FOLLOWUP_NOT_FOUND", message: "Follow-up not found or access denied." },
        });
      }

      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  // ==========================================
  // HABITS & RECURRENCE ENDPOINTS
  // ==========================================
  app.get("/api/habits", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const rows = await postgresDb.query<any>(`
        SELECT 
          h.*,
          a.title as activity_title,
          (SELECT COUNT(*)::int FROM activities WHERE recurrence_id = h.id) as total_occurrences,
          (SELECT COUNT(*)::int FROM activities WHERE recurrence_id = h.id AND status = 'COMPLETED') as completed_occurrences
        FROM habit_rules h
        LEFT JOIN activities a ON h.activity_id = a.id
        WHERE h.user_id = $1
        ORDER BY h.id DESC;
      `, [user.id]);

      const rules = rows.map((r) => ({
        ...postgresDb.mapHabitRuleRow(r),
        activity_title: r.activity_title || "Habit",
        total_occurrences: r.total_occurrences || 0,
        completed_occurrences: r.completed_occurrences || 0,
      }));

      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.patch("/api/habits/:id/toggle", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const updated = await postgresDb.queryOne<any>(
        `UPDATE habit_rules SET is_active = NOT is_active, updated_at = NOW()
         WHERE id = $1 AND user_id = $2 RETURNING *;`,
        [id, user.id]
      );

      if (!updated) {
        return res.status(404).json({
          error: { code: "HABIT_NOT_FOUND", message: "Habit rule not found or access denied." },
        });
      }

      res.json(postgresDb.mapHabitRuleRow(updated));
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  app.delete("/api/habits/:id", authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user as UserRecord;
      const id = Number(req.params.id);

      const deleted = await postgresDb.queryOne<any>(
        "DELETE FROM habit_rules WHERE id = $1 AND user_id = $2 RETURNING id;",
        [id, user.id]
      );

      if (!deleted) {
        return res.status(404).json({
          error: { code: "HABIT_NOT_FOUND", message: "Habit rule not found or access denied." },
        });
      }

      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: { code: "DATABASE_ERROR", message: err.message } });
    }
  });

  // ==========================================
  // ADMIN & FAILURE LAB ROUTERS
  // ==========================================
  app.use("/api/admin/failure-lab", authenticateUser, failureLabRouter);
  app.use("/api/admin", authenticateUser, adminRouter);

  // OpenAPI schema
  app.get("/openapi.json", (req, res) => {
    res.json({
      openapi: "3.0.0",
      info: {
        title: "Productivity Platform Central Persistent DB API",
        version: "3.0.0",
        description: "PostgreSQL 15 Central Persistent Multi-Tenant Architecture with Redis Queue and RBAC.",
      },
      paths: {
        "/health/live": { get: { summary: "Liveness probe" } },
        "/health/ready": { get: { summary: "Readiness probe" } },
        "/auth/login": { post: { summary: "Authenticate with PBKDF2 + JWT" } },
        "/api/activities": { get: { summary: "List activities" }, post: { summary: "Create activity" } },
        "/api/admin/jobs": { get: { summary: "List notification jobs (Admin only)" } },
        "/api/admin/jobs/dead-letter": { get: { summary: "List dead-letter jobs (Admin only)" } },
      },
    });
  });

  // Start Background Daemons
  scheduler.start();
  worker.start();

  // Vite Middleware integration for Full-Stack App
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Productivity Platform Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });

  // Graceful Shutdown
  const shutdown = async () => {
    console.log("\n[SERVER] Graceful shutdown initiated...");
    scheduler.stop();
    worker.stop();
    await postgresDb.close();
    server.close(() => {
      console.log("[SERVER] HTTP server closed. Process exiting.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((err) => {
  console.error("Fatal server startup failure:", err);
});
