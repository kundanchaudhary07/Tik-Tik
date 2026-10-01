import dotenv from "dotenv";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

dotenv.config({ override: true });

export interface EmailMessage {
  to: string;
  toName?: string;
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
      console.error("[SMTP CONFIG ERROR] SMTP_HOST must be a mail server hostname, not an email address.");
      this.smtpConfigured = false;
      return;
    }

    this.smtpConfigured = Boolean(this.host && this.port > 0 && this.user && this.pass && this.fromEmail);

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

        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        dnsTimeout: 10000,

        tls: {
          rejectUnauthorized: true,
          servername: this.host,
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

    console.log(`[SMTP VERIFY] Testing ${this.host}:${this.port}`);

    try {
      await this.transporter.verify();

      console.log(
        `[SMTP VERIFY] SUCCESS: ${this.host}:${this.port}`
      );

      return {
        success: true,
      };
    } catch (err: any) {
      const errorCode = err?.code || "UNKNOWN";

      const errorMessage =
        err?.message ||
        "SMTP connection verification failed";

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
      console.log(`[EMAIL DISPATCH] Connecting to ${this.host}:${this.port}`);

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

      return {
        success: true,
        messageId: safeMessageId,
      };
    } catch (err: any) {
      const errorCode = err?.code || "UNKNOWN";

      const errorMessage =
        err?.message || "SMTP connection failure";

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

export class BrevoEmailProvider implements EmailProvider {
  private readonly apiUrl = "https://api.brevo.com/v3/smtp/email";
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private sentCount = 0;

  constructor() {
    this.apiKey = (process.env.BREVO_API_KEY || "").trim();
    this.fromEmail = (process.env.BREVO_FROM_EMAIL || "").trim();
    this.fromName = (process.env.BREVO_FROM_NAME || "Tik Tik").trim() || "Tik Tik";
  }

  getProviderName(): string {
    return "Brevo HTTPS API";
  }

  getSentCount(): number {
    return this.sentCount;
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.apiKey || !this.fromEmail) {
      return {
        success: false,
        error: "BREVO_NOT_CONFIGURED: BREVO_API_KEY and BREVO_FROM_EMAIL are required.",
        isTransient: false,
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) {
      return {
        success: false,
        error: `INVALID_EMAIL: Recipient address syntax rejected: ${message.to}`,
        isTransient: false,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": this.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: this.fromName,
            email: message.from || this.fromEmail,
          },
          to: [
            {
              email: message.to,
              ...(message.toName ? { name: message.toName } : {}),
            },
          ],
          subject: message.subject,
          htmlContent: message.html || message.text.replace(/\n/g, "<br/>") ,
          textContent: message.text,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const isTransient = response.status === 408 || response.status === 429 || response.status >= 500;
        console.error("[EMAIL DISPATCH ERROR]", {
          provider: "Brevo",
          status: response.status,
        });
        return {
          success: false,
          error: `BREVO_HTTP_ERROR: ${response.status}`,
          isTransient,
        };
      }

      const result = await response.json() as { messageId?: string };
      this.sentCount++;
      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError";
      console.error("[EMAIL DISPATCH ERROR]", {
        provider: "Brevo",
        error: isTimeout ? "REQUEST_TIMEOUT" : "REQUEST_FAILED",
      });
      return {
        success: false,
        error: isTimeout ? "BREVO_REQUEST_TIMEOUT" : "BREVO_REQUEST_FAILED",
        isTransient: true,
      };
    } finally {
      clearTimeout(timeout);
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

export const brevoEmailProvider =
  new BrevoEmailProvider();

export const testEmailProvider =
  new TestEmailProvider();

function configuredEmailProvider(): EmailProvider {
  const configuredName = (process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const brevoConfigured = Boolean(
    process.env.BREVO_API_KEY?.trim() && process.env.BREVO_FROM_EMAIL?.trim()
  );
  const useBrevo = configuredName === "brevo" || (!configuredName && brevoConfigured);
  return useBrevo ? brevoEmailProvider : realEmailProvider;
}

let activeProvider: EmailProvider = configuredEmailProvider();

export function getActiveEmailProvider(): EmailProvider {
  return activeProvider;
}

export function setActiveEmailProvider(
  provider: EmailProvider
) {
  activeProvider = provider;
}

export function resetActiveEmailProvider() {
  activeProvider = configuredEmailProvider();
}