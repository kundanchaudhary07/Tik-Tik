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
 *
 * Sends email through a real SMTP server using Nodemailer.
 *
 * Environment variables:
 * SMTP_HOST
 * SMTP_PORT
 * SMTP_USER
 * SMTP_PASSWORD
 * SMTP_FROM_EMAIL
 * SMTP_SECURE
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
    // Read each SMTP variable independently.
    this.host = (process.env.SMTP_HOST || "").trim();
    this.port = Number(process.env.SMTP_PORT || "587");
    this.user = (process.env.SMTP_USER || "").trim();
    this.pass = process.env.SMTP_PASSWORD || "";
    this.fromEmail = (process.env.SMTP_FROM_EMAIL || "").trim();

    this.secure =
      String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true" ||
      this.port === 465;

    /*
     * Basic configuration validation.
     *
     * SMTP_HOST must be a hostname such as:
     * smtp.gmail.com
     *
     * It must NOT be:
     * someone@gmail.com
     */
    const looksLikeEmailAddress = this.host.includes("@");

    if (looksLikeEmailAddress) {
      console.error(
        `[SMTP CONFIG ERROR] SMTP_HOST must be a mail server hostname, not an email address.`
      );
      console.error(
        `[SMTP CONFIG ERROR] Expected something like smtp.gmail.com.`
      );

      this.smtpConfigured = false;
      return;
    }

    this.smtpConfigured = Boolean(
      this.host &&
        this.port > 0 &&
        this.user &&
        this.pass &&
        this.fromEmail
    );

    /*
     * Never log SMTP password.
     *
     * This diagnostic tells us exactly which non-secret values
     * the application is using at runtime.
     */
    console.log("[SMTP CONFIG]", {
      host: this.host || "(missing)",
      port: this.port,
      user: this.user || "(missing)",
      from: this.fromEmail || "(missing)",
      secure: this.secure,
      configured: this.smtpConfigured,
    });

    if (
      this.smtpConfigured &&
      this.host !== "localhost" &&
      this.host !== "127.0.0.1"
    ) {
      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,

        auth: {
          user: this.user,
          pass: this.pass,
        },

        tls: {
          rejectUnauthorized: true,
        },
      });
    }
  }

  getProviderName(): string {
    if (!this.host) {
      return "RealSMTP (Not Configured)";
    }

    return `RealSMTP (${this.host}:${this.port})`;
  }

  getSentCount(): number {
    return this.sentCount;
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.smtpConfigured) {
      return {
        success: false,
        error:
          "SMTP_NOT_CONFIGURED: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL correctly.",
        isTransient: false,
      };
    }

    // Basic recipient validation.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(message.to)) {
      return {
        success: false,
        error: `INVALID_EMAIL: Recipient address syntax rejected: ${message.to}`,
        isTransient: false,
      };
    }

    if (!this.transporter) {
      return {
        success: false,
        error:
          "SMTP_NOT_CONFIGURED: A non-loopback SMTP provider is required.",
        isTransient: false,
      };
    }

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

      console.log(
        `[EMAIL DISPATCH] Real SMTP sent to=${message.to} subject="${message.subject}"`
      );

      return {
        success: true,
        messageId: safeMsgId,
      };
    } catch (err: any) {
      const errMsg = err?.message || "SMTP connection failure";

      const isTransient =
        !errMsg.includes("550") &&
        !errMsg.includes("INVALID") &&
        !errMsg.includes("No recipients");

      console.error(
        `[EMAIL DISPATCH ERROR] Failed to send email to=${message.to}: ${errMsg}`
      );

      return {
        success: false,
        error: `SMTP_DELIVERY_FAILURE: ${errMsg}`,
        isTransient,
      };
    }
  }
}

/**
 * TestEmailProvider
 *
 * In-memory provider used for unit tests and Failure Lab simulations.
 */
export class TestEmailProvider implements EmailProvider {
  public mailbox: (EmailMessage & {
    sentAt: string;
    messageId: string;
  })[] = [];

  public failureMode:
    | "NONE"
    | "TRANSIENT_TIMEOUT"
    | "PERMANENT_REJECT" = "NONE";

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
        error:
          "SMTP 421 4.4.2 Connection timed out to destination mail exchanger",
        isTransient: true,
      };
    }

    if (this.failureMode === "PERMANENT_REJECT") {
      return {
        success: false,
        error:
          "SMTP 550 5.1.1 User mailbox not found / permanent rejection",
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

    const messageId = `test-msg-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 7)}`;

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