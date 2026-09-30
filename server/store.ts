import dotenv from "dotenv";
dotenv.config({ override: true });
import { postgresDb, hashPassword, verifyPassword } from "./postgres";
import {
  UserRecord,
  NotificationJobRecord,
  DeliveryRecord,
  SystemMetrics,
} from "./types";

export { hashPassword, verifyPassword };

export class DatabaseStore {
  // Delegate connection info to Central PostgreSQL
  get isDbConnected(): boolean {
    return postgresDb.isConnected;
  }
  set isDbConnected(val: boolean) {
    postgresDb.isConnected = val;
  }

  get queryLatencyMs(): number {
    return postgresDb.queryLatencyMs;
  }

  get connectionPool() {
    return postgresDb.connectionPool;
  }

  // Temporary runtime queue and delivery state (Queue/Redis processing layer)
  notificationJobs = new Map<string, NotificationJobRecord>();
  deliveryRecords = new Map<string, DeliveryRecord>();

  metrics: SystemMetrics = {
    jobs_created: 0,
    jobs_processed: 0,
    jobs_failed: 0,
    jobs_retried: 0,
    jobs_dead_lettered: 0,
    notifications_sent: 0,
    notifications_skipped: 0,
    worker_processing_time_total_ms: 0,
    worker_processing_time_avg_ms: 0,
  };

  async init(): Promise<void> {
    await postgresDb.init();
  }

  // Row Locking Simulation: PostgreSQL SELECT ... FOR UPDATE SKIP LOCKED
  lockReminderForScheduler(reminderId: number): boolean {
    return postgresDb.lockReminderForScheduler(reminderId);
  }

  unlockReminder(reminderId: number) {
    postgresDb.unlockReminder(reminderId);
  }

  // Record an idempotency key upon successful delivery in PostgreSQL
  async recordDelivery(idempotencyKey: string, jobId: string, recipient: string, channel: "EMAIL" | "IN_APP"): Promise<void> {
    this.deliveryRecords.set(idempotencyKey, {
      idempotency_key: idempotencyKey,
      job_id: jobId,
      recipient,
      sent_at: new Date().toISOString(),
      channel,
    });
    await postgresDb.recordDelivery(idempotencyKey, jobId, recipient, channel);
  }

  async isAlreadyDelivered(idempotencyKey: string): Promise<boolean> {
    if (this.deliveryRecords.has(idempotencyKey)) return true;
    return await postgresDb.isAlreadyDelivered(idempotencyKey);
  }

  recordWorkerProcessingTime(ms: number) {
    this.metrics.worker_processing_time_total_ms += ms;
    if (this.metrics.jobs_processed > 0) {
      this.metrics.worker_processing_time_avg_ms = Math.round(
        this.metrics.worker_processing_time_total_ms / this.metrics.jobs_processed
      );
    } else {
      this.metrics.worker_processing_time_avg_ms = ms;
    }
  }
}

export const db = new DatabaseStore();
