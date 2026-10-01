export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface VerificationEmailInput {
  userName: string | null;
  verificationUrl: string;
}

export interface ReminderEmailInput {
  userName: string | null;
  activityTitle: string;
  dueAt: string | null;
  timezone?: string | null;
  importance?: number | null;
  notes?: string | null;
  appUrl: string;
}

export interface FollowUpEmailInput {
  userName: string | null;
  activityTitle: string;
  followUpAt: string | null;
  timezone?: string | null;
  notes?: string | null;
  appUrl: string;
}

interface CallToAction {
  label: string;
  url: string;
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

function safeText(value: string | null | undefined): string {
  return value?.trim() || "";
}

function formatDateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatEmailDateTime(value: string | null, timezone = "UTC"): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  try {
    const today = new Date();
    const todayKey = formatDateKey(today, timezone);
    const dateKey = formatDateKey(date, timezone);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowKey = formatDateKey(tomorrow, timezone);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);

    if (dateKey === todayKey) return `Today at ${time}`;
    if (dateKey === tomorrowKey) return `Tomorrow at ${time}`;

    return `${new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date)} at ${time}`;
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
}

function renderLayout(
  title: string,
  greeting: string,
  content: string,
  textContent: string,
  callToAction?: CallToAction,
): string {
  const button = callToAction
    ? `<a href="${escapeHtml(callToAction.url)}" style="display:inline-block;background:#07383D;color:#ffffff;padding:13px 22px;border-radius:6px;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(callToAction.label)}</a>`
    : "";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#F5FAFA;color:#18383A;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(textContent.split("\n")[0] || title)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F5FAFA;">
      <tr><td align="center" style="padding:28px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #D9EAEA;border-radius:10px;">
          <tr><td style="padding:28px 30px 18px;border-bottom:1px solid #E7F0F0;">
            <div style="font-size:20px;font-weight:700;letter-spacing:0;color:#07383D;">Tik Tik</div>
          </td></tr>
          <tr><td style="padding:30px;">
            <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;color:#07383D;">${escapeHtml(title)}</h1>
            <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#294B4D;">${escapeHtml(greeting)}</p>
            ${content}
            ${button ? `<div style="margin:28px 0 8px;">${button}</div><p style="margin:12px 0 0;font-size:13px;line-height:1.5;color:#668083;">If the button does not work, open this link:<br><a href="${escapeHtml(callToAction!.url)}" style="color:#0F777A;word-break:break-all;">${escapeHtml(callToAction!.url)}</a></p>` : ""}
          </td></tr>
          <tr><td style="padding:18px 30px 26px;border-top:1px solid #E7F0F0;">
            <p style="margin:0;font-size:13px;line-height:1.5;color:#668083;">Tik Tik - Plan it. Remember it. Get it done.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function renderVerificationEmail(input: VerificationEmailInput): RenderedEmail {
  const greeting = `Hi ${safeText(input.userName) || "there"},`;
  const text = `${greeting}\n\nWelcome to Tik Tik.\n\nYour account is almost ready. Please verify your email address to activate your account.\n\nVerify Email: ${input.verificationUrl}\n\nIf you did not create this account, you can safely ignore this email.\n\nTik Tik - Plan it. Remember it. Get it done.`;
  const html = renderLayout(
    "Verify your email address",
    greeting,
    `<p style="margin:0;font-size:16px;line-height:1.6;color:#294B4D;">Welcome to Tik Tik.</p><p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:#294B4D;">Your account is almost ready. Please verify your email address to activate your account.</p><p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:#668083;">If you did not create this account, you can safely ignore this email.</p>`,
    text,
    { label: "Verify Email", url: input.verificationUrl },
  );
  return { subject: "Verify your Tik Tik email", text, html };
}

export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const greeting = `Hi ${safeText(input.userName) || "there"},`;
  const timezone = safeText(input.timezone) || "UTC";
  const due = formatEmailDateTime(input.dueAt, timezone);
  const notes = safeText(input.notes);
  const importance = input.importance == null ? "" : `Importance: ${input.importance}/5`;
  const details = [
    `Activity: ${input.activityTitle}`,
    due ? `Due: ${due}` : "",
    importance,
    notes ? `Notes: ${notes}` : "",
  ].filter(Boolean).join("\n");
  const text = `${greeting}\n\nJust a quick reminder about something you planned.\n\n${details}\n\nOpen Tik Tik: ${input.appUrl}\n\nStay focused and get it done.\n\nTik Tik - Plan it. Remember it. Get it done.`;
  const detailsHtml = [
    `<p style="margin:0;font-size:19px;line-height:1.4;font-weight:700;color:#07383D;">${escapeHtml(input.activityTitle)}</p>`,
    due ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#294B4D;"><strong>Due:</strong> ${escapeHtml(due)}</p>` : "",
    importance ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#294B4D;"><strong>Importance:</strong> ${escapeHtml(importance.replace("Importance: ", ""))}</p>` : "",
    notes ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#294B4D;"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : "",
  ].filter(Boolean).join("");
  const html = renderLayout(
    "A quick reminder",
    greeting,
    `<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#294B4D;">Just a quick reminder about something you planned.</p><div style="padding:20px;background:#F5FAFA;border:1px solid #D9EAEA;border-radius:8px;">${detailsHtml}</div><p style="margin:22px 0 0;font-size:16px;line-height:1.6;color:#294B4D;">Stay focused and get it done.</p>`,
    text,
    { label: "Open Tik Tik", url: input.appUrl },
  );
  return { subject: `Reminder: ${input.activityTitle}`, text, html };
}

export function renderFollowUpEmail(input: FollowUpEmailInput): RenderedEmail {
  const greeting = `Hi ${safeText(input.userName) || "there"},`;
  const timezone = safeText(input.timezone) || "UTC";
  const scheduled = formatEmailDateTime(input.followUpAt, timezone);
  const notes = safeText(input.notes);
  const details = [
    `Activity: ${input.activityTitle}`,
    scheduled ? `Follow-up: ${scheduled}` : "",
    notes ? `Notes: ${notes}` : "",
  ].filter(Boolean).join("\n");
  const text = `${greeting}\n\nThis is a reminder to follow up on something you planned.\n\n${details}\n\nOpen Tik Tik: ${input.appUrl}\n\nKeep things moving.\n\nTik Tik - Plan it. Remember it. Get it done.`;
  const html = renderLayout(
    "Follow-up reminder",
    greeting,
    `<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#294B4D;">This is a reminder to follow up on something you planned.</p><div style="padding:20px;background:#F5FAFA;border:1px solid #D9EAEA;border-radius:8px;"><p style="margin:0;font-size:19px;line-height:1.4;font-weight:700;color:#07383D;">${escapeHtml(input.activityTitle)}</p>${scheduled ? `<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#294B4D;"><strong>Follow-up:</strong> ${escapeHtml(scheduled)}</p>` : ""}${notes ? `<p style="margin:8px 0 0;font-size:15px;line-height:1.5;color:#294B4D;"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ""}</div><p style="margin:22px 0 0;font-size:16px;line-height:1.6;color:#294B4D;">Keep things moving.</p>`,
    text,
    { label: "Open Tik Tik", url: input.appUrl },
  );
  return { subject: `Follow-up reminder: ${input.activityTitle}`, text, html };
}
