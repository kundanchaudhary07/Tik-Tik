import dotenv from "dotenv";
dotenv.config({ override: true });
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isTransient?: boolean;
}

export interface EmailProvider {
  sendEmail(message: EmailMessage): Promise<EmailSendResult>;
  getProviderName(): string;
  getSentCount(): number;
}

/**
 * RealEmailProvider
 * Connects to a standard SMTP server via nodemailer.
 * Sanitizes all output to ensure secrets, tokens, and passwords are never logged.
 */
export class RealEmailProvider implements EmailProvider {
  private transporter: Transporter | null = null;
  private host: string;
  private port: number;
  private user: string;
  private pass: string;
  private fromEmail: string;
  private secure: boolean;
  private smtpConfigured: boolean;
  private sentCount = 0;

  constructor() {
    this.host = process.env.SMTP_HOST || "";
    this.port = Number(process.env.SMTP_PORT) || 587;
    this.user = process.env.SMTP_USER || "";
    this.pass = process.env.SMTP_PASSWORD || "";
    this.fromEmail = process.env.SMTP_FROM_EMAIL || "";
    this.secure = process.env.SMTP_SECURE === "true" || this.port === 465;
    this.smtpConfigured = Boolean(this.host && this.user && this.pass && this.fromEmail);

    if (this.smtpConfigured && this.host !== "localhost" && this.host !== "127.0.0.1") {
      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,
        auth: this.user
          ? {
              user: this.user,
              pass: this.pass,
            }
          : undefined,
        tls: {
          rejectUnauthorized: true,
        },
      });
    }
  }

  getProviderName(): string {
    return this.host ? `RealSMTP (${this.host}:${this.port})` : "RealSMTP (Local Loopback / Diagnostic)";
  }

  getSentCount(): number {
    return this.sentCount;
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.smtpConfigured) {
      return {
        success: false,
        error: "SMTP_NOT_CONFIGURED: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL.",
        isTransient: false,
      };
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(message.to)) {
      return {
        success: false,
        error: `INVALID_EMAIL: Recipient address syntax rejected: ${message.to}`,
        isTransient: false,
      };
    }

    // If real transporter is configured, dispatch via nodemailer
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: message.from || this.fromEmail,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html || message.text.replace(/\n/g, "<br/>"),
        });

        this.sentCount++;
        const safeMsgId = info.messageId || `smtp-${Date.now()}`;
        console.log(`[EMAIL DISPATCH] Real SMTP sent to=${message.to} subject="${message.subject}"`);
        return {
          success: true,
          messageId: safeMsgId,
        };
      } catch (err: any) {
        const errMsg = err?.message || "SMTP connection failure";
        const isTransient = !errMsg.includes("550") && !errMsg.includes("INVALID") && !errMsg.includes("No recipients");
        console.error(`[EMAIL DISPATCH ERROR] Failed to send email to=${message.to}: ${errMsg}`);
        return {
          success: false,
          error: `SMTP_DELIVERY_FAILURE: ${errMsg}`,
          isTransient,
        };
      }
    }

    return {
      success: false,
      error: "SMTP_NOT_CONFIGURED: A non-loopback SMTP provider is required.",
      isTransient: false,
    };
  }
}

/**
 * TestEmailProvider
 * In-memory test provider for unit tests and Failure Lab simulations.
 * Records messages in an inspectable test mailbox.
 */
export class TestEmailProvider implements EmailProvider {
  public mailbox: (EmailMessage & { sentAt: string; messageId: string })[] = [];
  public failureMode: "NONE" | "TRANSIENT_TIMEOUT" | "PERMANENT_REJECT" = "NONE";
  private sentCount = 0;

  getProviderName(): string {
    return "TestEmailProvider (Inspectable In-Memory)";
  }

  getSentCount(): number {
    return this.sentCount;
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (this.failureMode === "TRANSIENT_TIMEOUT") {
      return {
        success: false,
        error: "SMTP 421 4.4.2 Connection timed out to destination mail exchanger",
        isTransient: true,
      };
    }

    if (this.failureMode === "PERMANENT_REJECT") {
      return {
        success: false,
        error: "SMTP 550 5.1.1 User mailbox not found / permanent rejection",
        isTransient: false,
      };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(message.to)) {
      return {
        success: false,
        error: `INVALID_EMAIL: Bad address format ${message.to}`,
        isTransient: false,
      };
    }

    const messageId = `test-msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.mailbox.push({
      ...message,
      sentAt: new Date().toISOString(),
      messageId,
    });
    this.sentCount++;

    return {
      success: true,
      messageId,
    };
  }

  clearMailbox() {
    this.mailbox = [];
  }
}

// Singleton instances
export const realEmailProvider = new RealEmailProvider();
export const testEmailProvider = new TestEmailProvider();

let activeProvider: EmailProvider = realEmailProvider;

export function getActiveEmailProvider(): EmailProvider {
  return activeProvider;
}

export function setActiveEmailProvider(provider: EmailProvider) {
  activeProvider = provider;
}
