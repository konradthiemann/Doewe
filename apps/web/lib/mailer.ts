import nodemailer from "nodemailer";

import { env } from "../env";

/**
 * Transactional-email sender with three transports, chosen in order:
 *  1. SMTP (nodemailer) when SMTP_HOST/USER/PASS are set — e.g. Gmail
 *     (smtp.gmail.com:465 with an App Password). Sends genuinely FROM the
 *     configured Gmail address. Note: Railway blocks outbound SMTP on
 *     Free/Trial/Hobby plans (Pro+ only).
 *  2. Resend REST API when RESEND_API_KEY is set (HTTPS, works on any plan).
 *  3. Dev/test fallback: log the message to the console (no network) so flows
 *     stay testable without any provider configured.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Doewe <onboarding@resend.dev>";

type Locale = "de" | "en";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function smtpConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

async function sendViaSmtp({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const port = env.SMTP_PORT ?? 465;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  // Gmail requires the From address to match the authenticated account (or a
  // configured "Send mail as" alias); fall back to SMTP_USER otherwise.
  await transport.sendMail({
    from: env.EMAIL_FROM || env.SMTP_USER,
    to,
    subject,
    html,
    text,
  });
}

async function sendViaResend({ to, subject, html, text }: SendEmailInput): Promise<void> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || DEFAULT_FROM,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${detail}`);
  }
}

async function sendEmail(input: SendEmailInput): Promise<void> {
  if (smtpConfigured()) {
    await sendViaSmtp(input);
    return;
  }
  if (env.RESEND_API_KEY) {
    await sendViaResend(input);
    return;
  }
  // Dev / test fallback: never hit the network, just surface the content.
  // eslint-disable-next-line no-console -- intentional dev-only fallback output
  console.info(`[mailer] No SMTP/Resend configured — email not sent.\n  to: ${input.to}\n  subject: ${input.subject}\n  ${input.text}`);
}

const COPY: Record<Locale, { subject: string; heading: string; intro: string; cta: string; expiry: string; ignore: string; fallback: string }> = {
  de: {
    subject: "Passwort zurücksetzen – Doewe",
    heading: "Passwort zurücksetzen",
    intro: "Du hast angefragt, dein Doewe-Passwort zurückzusetzen. Klicke auf den Button, um ein neues Passwort zu vergeben.",
    cta: "Neues Passwort setzen",
    expiry: "Der Link ist 1 Stunde gültig.",
    ignore: "Falls du das nicht warst, kannst du diese E-Mail ignorieren – dein Passwort bleibt unverändert.",
    fallback: "Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:",
  },
  en: {
    subject: "Reset your password – Doewe",
    heading: "Reset your password",
    intro: "You asked to reset your Doewe password. Click the button below to choose a new one.",
    cta: "Set a new password",
    expiry: "This link is valid for 1 hour.",
    ignore: "If this wasn't you, you can safely ignore this email — your password stays unchanged.",
    fallback: "If the button doesn't work, copy this link into your browser:",
  },
};

/** Sends the password-reset email containing the one-time reset link. */
export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
  locale?: Locale;
}): Promise<void> {
  const copy = COPY[input.locale ?? "de"];
  const safeUrl = escapeHtml(input.resetUrl);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;">
      <h1 style="font-size:20px;margin:0 0 16px;">${copy.heading}</h1>
      <p style="font-size:14px;line-height:1.5;margin:0 0 24px;">${copy.intro}</p>
      <p style="margin:0 0 24px;">
        <a href="${safeUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">${copy.cta}</a>
      </p>
      <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0 0 8px;">${copy.expiry}</p>
      <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0 0 16px;">${copy.ignore}</p>
      <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0;">${copy.fallback}<br /><a href="${safeUrl}" style="color:#4f46e5;word-break:break-all;">${safeUrl}</a></p>
    </div>
  </body>
</html>`;

  const text = `${copy.heading}\n\n${copy.intro}\n\n${input.resetUrl}\n\n${copy.expiry}\n${copy.ignore}`;

  await sendEmail({ to: input.to, subject: copy.subject, html, text });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
