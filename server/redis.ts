import dotenv from "dotenv";
dotenv.config({ override: true });
import { NotificationJobRecord, JobStatus } from "./types";
import { createClient } from "redis";

export class RedisQueueEngine {
  private isConnected = false;
  private isRealRedis = false;
  private pingLatencyMs = 2;
  private client: ReturnType<typeof createClient> | null = null;
  private readyPromise: Promise<void>;
  private initializationError: Error | null = null;

  // In-memory Redis keys representing Redis lists
  // Key: "queue:notifications" (PENDING)
  // Key: "queue:processing" (In-flight jobs claimed by worker)
  // Key: "queue:dead_letter" (DLQ)
  private storage = new Map<string, string[]>();

  constructor() {
    this.storage.set("queue:notifications", []);
    this.storage.set("queue:processing", []);
    this.storage.set("queue:dead_letter", []);
    this.readyPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379/0";
    const client = createClient({
      url: redisUrl,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
    });
    client.on("error", () => {
      // Connection details are intentionally not logged.
    });

    try {
      await client.connect();
      await client.ping();
      this.client = client;
      this.isRealRedis = true;
      this.isConnected = true;
      this.pingLatencyMs = 1;
    } catch {
      const isProduction =
        process.env.NODE_ENV === "production" || process.env.ENVIRONMENT === "production";
      this.isConnected = !isProduction;
      this.isRealRedis = false;
      this.pingLatencyMs = -1;
      try {
        if (client.isOpen) await client.disconnect();
      } catch {
      }
      if (isProduction) {
        this.initializationError = new Error("Redis is required in production but is unavailable.");
      }
    }
  }

  async waitUntilReady(): Promise<void> {
    await this.readyPromise;
    if (this.initializationError) {
      throw this.initializationError;
    }
  }

  private async useRealRedis(): Promise<boolean> {
    await this.readyPromise;
    return this.isRealRedis && this.isConnected && this.client !== null;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  setIsConnected(val: boolean) {
    this.isConnected = val;
  }

  getIsRealRedis(): boolean {
    return this.isRealRedis;
  }

  getPingLatencyMs(): number {
    return this.pingLatencyMs;
  }

  async ping(): Promise<boolean> {
    if (await this.useRealRedis()) {
      await this.client!.ping();
      return true;
    }
    if (!this.isConnected) {
      throw new Error("ECONNREFUSED: Connection to Redis refused on port 6379");
    }
    return true;
  }

  // Redis LPUSH
  async lpush(key: string, value: string): Promise<number> {
    if (await this.useRealRedis()) return this.client!.lPush(key, value);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot LPUSH");
    }
    const list = this.storage.get(key) || [];
    list.unshift(value);
    this.storage.set(key, list);
    return list.length;
  }

  // Redis RPUSH
  async rpush(key: string, value: string): Promise<number> {
    if (await this.useRealRedis()) return this.client!.rPush(key, value);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot RPUSH");
    }
    const list = this.storage.get(key) || [];
    list.push(value);
    this.storage.set(key, list);
    return list.length;
  }

  // Redis RPOP
  async rpop(key: string): Promise<string | null> {
    if (await this.useRealRedis()) return this.client!.rPop(key);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot RPOP");
    }
    const list = this.storage.get(key) || [];
    const item = list.pop() || null;
    return item;
  }

  // Redis LMOVE / RPOPLPUSH (Atomic lease transfer from source to destination)
  async rpoplpush(source: string, destination: string): Promise<string | null> {
    if (await this.useRealRedis()) return this.client!.rPopLPush(source, destination);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot RPOPLPUSH");
    }
    const srcList = this.storage.get(source) || [];
    if (srcList.length === 0) return null;

    const item = srcList.pop()!;
    const dstList = this.storage.get(destination) || [];
    dstList.unshift(item);
    this.storage.set(destination, dstList);
    return item;
  }

  // Redis LLEN
  async llen(key: string): Promise<number> {
    if (await this.useRealRedis()) return this.client!.lLen(key);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot LLEN");
    }
    return (this.storage.get(key) || []).length;
  }

  // Redis LRANGE
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (await this.useRealRedis()) return this.client!.lRange(key, start, stop);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot LRANGE");
    }
    const list = this.storage.get(key) || [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  // Redis LREM
  async lrem(key: string, value: string): Promise<number> {
    if (await this.useRealRedis()) return this.client!.lRem(key, 0, value);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot LREM");
    }
    const list = this.storage.get(key) || [];
    const index = list.indexOf(value);
    if (index !== -1) {
      list.splice(index, 1);
      return 1;
    }
    return 0;
  }

  // Redis DEL
  async del(key: string): Promise<number> {
    if (await this.useRealRedis()) return this.client!.del(key);
    if (!this.isConnected) {
      throw new Error("Redis connection offline: cannot DEL");
    }
    const existed = this.storage.delete(key);
    return existed ? 1 : 0;
  }

  // Helper: Enqueue Notification Job
  async enqueueNotificationJob(job: NotificationJobRecord): Promise<void> {
    const payload = JSON.stringify(job);
    await this.lpush("queue:notifications", payload);
  }

  // Helper: Move job to Dead Letter Queue
  async moveToDeadLetter(job: NotificationJobRecord): Promise<void> {
    job.status = "DEAD_LETTER";
    job.updated_at = new Date().toISOString();
    const payload = JSON.stringify(job);
    await this.lpush("queue:dead_letter", payload);
  }

  // Queue Lengths summary
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    deadLetter: number;
  }> {
    if (!this.isConnected) {
      return { pending: 0, processing: 0, deadLetter: 0 };
    }
    if (await this.useRealRedis()) {
      const [pending, processing, deadLetter] = await Promise.all([
        this.client!.lLen("queue:notifications"),
        this.client!.lLen("queue:processing"),
        this.client!.lLen("queue:dead_letter"),
      ]);
      return { pending, processing, deadLetter };
    }

    return {
      pending: (this.storage.get("queue:notifications") || []).length,
      processing: (this.storage.get("queue:processing") || []).length,
      deadLetter: (this.storage.get("queue:dead_letter") || []).length,
    };
  }
}

export const redis = new RedisQueueEngine();
