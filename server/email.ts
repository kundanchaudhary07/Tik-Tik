import dns from "dns";
import dotenv from "dotenv";

// Render was previously trying Gmail over IPv6.
// Prefer IPv4 for SMTP connections.
dns.setDefaultResultOrder("ipv4first");

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
    this.host = (process.env.SMTP_HOST || "").trim();

    this.port = Number(process.env.SMTP_PORT || "587");

    this.user = (process.env.SMTP_USER || "").trim();

    this.pass = process.env.SMTP_PASSWORD || "";

    this.fromEmail = (process.env.SMTP_FROM_EMAIL || "").trim();

    this.secure =
      String(process.env.SMTP_SECURE || "")
        .trim()
        .toLowerCase() === "true" || this.port === 465;

    const looksLikeEmailAddress = this.host.includes("@");

    if (looksLikeEmailAddress) {
      console.error(
        "[SMTP CONFIG ERROR] SMTP_HOST must be a mail server hostname, not an email address."
      );

      console.error(
        "[SMTP CONFIG ERROR] Expected something like smtp.gmail.com."
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

    console.log("[SMTP CONFIG]", {
      host: this.host || "(missing)",
      port: this.port,
      user: this.user || "(missing)",
      from: this.fromEmail || "(missing)",
      secure: this.secure,
      configured: this.smtpConfigured,
      dnsOrder: "ipv4first",
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

        // Connection timeout.
        connectionTimeout: 15000,

        // SMTP greeting timeout.
        greetingTimeout: 15000,

        // Socket inactivity timeout.
        socketTimeout: 20000,

        // DNS lookup timeout.
        dnsTimeout: 10000,

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

  /**
   * Test SMTP connectivity and authentication.
   *
   * This does not send an email.
   */
  async verifyConnection(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.smtpConfigured) {
      return {
        success: false,
        error:
          "SMTP_NOT_CONFIGURED: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL correctly.",
      };
    }

    if (!this.transporter) {
      return {
        success: false,
        error: "SMTP_TRANSPORTER_NOT_AVAILABLE",
      };
    }

    console.log(
      `[SMTP VERIFY] Testing connection to ${this.host}:${this.port} using IPv4 preference...`
    );

    try {
      await this.transporter.verify();

      console.log(
        `[SMTP VERIFY] SUCCESS: ${this.host}:${this.port} connection and authentication successful`
      );

      return {
        success: true,
      };
    } catch (err: any) {
      const errorMessage =
        err?.message || "SMTP connection verification failed";

      const errorCode = err?.code || "UNKNOWN";

      console.error(
        `[SMTP VERIFY ERROR] ${this.host}:${this.port}`
      );

      console.error(
        `[SMTP VERIFY ERROR] code=${errorCode}`
      );

      console.error(
        `[SMTP VERIFY ERROR] message=${errorMessage}`
      );

      return {
        success: false,
        error: `${errorCode}: ${errorMessage}`,
      };
    }
  }

  async sendEmail(
    message: EmailMessage
  ): Promise<EmailSendResult> {
    if (!this.smtpConfigured) {
      return {
        success: false,
        error:
          "SMTP_NOT_CONFIGURED: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL correctly.",
        isTransient: false,
      };
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(message.to)) {
      return {
        success: false,
        error:
          `INVALID_EMAIL: Recipient address syntax rejected: ${message.to}`,
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
      console.log(
        `[EMAIL DISPATCH] Connecting to ${this.host}:${this.port} for recipient=${message.to}`
      );

      const info = await this.transporter.sendMail({
        from: message.from || this.fromEmail,

        to: message.to,

        subject: message.subject,

        text: message.text,

        html:
          message.html ||
          message.text.replace(/\n/g, "<br/>"),
      });

      this.sentCount++;

      const safeMessageId =
        info.messageId || `smtp-${Date.now()}`;

      console.log(
        `[EMAIL DISPATCH] Real SMTP sent to=${message.to} subject="${message.subject}"`
      );

      console.log(
        `[EMAIL DISPATCH] Provider=${this.getProviderName()}`
      );

      return {
        success: true,
        messageId: safeMessageId,
      };
    } catch (err: any) {
      const errorMessage =
        err?.message || "SMTP connection failure";

      const errorCode =
        err?.code || "UNKNOWN";

      const isTransient =
        !errorMessage.includes("550") &&
        !errorMessage.includes("551") &&
        !errorMessage.includes("552") &&
        !errorMessage.includes("553") &&
        !errorMessage.includes("554") &&
        !errorMessage.includes("INVALID") &&
        !errorMessage.includes("No recipients");

      console.error(
        `[EMAIL DISPATCH ERROR] Failed to send email to=${message.to}`
      );

      console.error(
        `[EMAIL DISPATCH ERROR] code=${errorCode}`
      );

      console.error(
        `[EMAIL DISPATCH ERROR] message=${errorMessage}`
      );

      console.error(
        `[EMAIL DISPATCH ERROR] provider=${this.getProviderName()}`
      );

      return {
        success: false,
        error:
          `SMTP_DELIVERY_FAILURE: ${errorCode}: ${errorMessage}`,
        isTransient,
      };
    }
  }
}

export class TestEmailProvider
  implements EmailProvider
{
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

  async sendEmail(
    message: EmailMessage
  ): Promise<EmailSendResult> {
    if (
      this.failureMode ===
      "TRANSIENT_TIMEOUT"
    ) {
      return {
        success: false,
        error:
          "SMTP 421 4.4.2 Connection timed out to destination mail exchanger",
        isTransient: true,
      };
    }

    if (
      this.failureMode ===
      "PERMANENT_REJECT"
    ) {
      return {
        success: false,
        error:
          "SMTP 550 5.1.1 User mailbox not found / permanent rejection",
        isTransient: false,
      };
    }

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(message.to)) {
      return {
        success: false,
        error:
          `INVALID_EMAIL: Bad address format ${message.to}`,
        isTransient: false,
      };
    }

    const messageId =
      `test-msg-${Date.now()}-${Math.random()
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

export const realEmailProvider =
  new RealEmailProvider();

export const testEmailProvider =
  new TestEmailProvider();

let activeProvider: EmailProvider =
  realEmailProvider;

export function getActiveEmailProvider(): EmailProvider {
  return activeProvider;
}

export function setActiveEmailProvider(
  provider: EmailProvider
) {
  activeProvider = provider;
}