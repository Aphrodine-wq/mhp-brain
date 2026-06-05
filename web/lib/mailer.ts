import nodemailer, { type Transporter } from "nodemailer";

// Transactional email over SMTP. Configured entirely from env so a not-yet-wired install degrades
// gracefully: when SMTP isn't configured we DON'T throw — the caller logs the link server-side
// instead (see app/api/auth/forgot). That keeps the forgot-password flow working pre-launch and
// becomes real email the moment the SMTP_* vars are set.
//
//   SMTP_HOST        smtp.gmail.com / smtp.sendgrid.net / ...
//   SMTP_PORT        587 (STARTTLS, default) or 465 (implicit TLS)
//   SMTP_USER        login (often the full email / API-key username)
//   SMTP_PASS        password / app-password / API key
//   SMTP_FROM        "MHP Construction <no-reply@mshomepros.com>"  (falls back to SMTP_USER)
//   SMTP_SECURE      "1" to force implicit TLS regardless of port

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost";
}

// One transport per process, built lazily. Verified connections are pooled by nodemailer.
let transport: Transporter | null = null;
function getTransport(): Transporter {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Implicit TLS on 465; STARTTLS (upgraded after connect) on 587/25.
    secure: process.env.SMTP_SECURE === "1" || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Returns true if the message was handed to the SMTP server, false if email isn't configured.
// Never throws on the not-configured path; a real SMTP failure still propagates so the route can 500.
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailConfigured()) return false;
  await getTransport().sendMail({
    from: fromAddress(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return true;
}

// --- specific templates ------------------------------------------------------------------------

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const text =
    `Someone (hopefully you) asked to reset the password for your MHP Construction account.\n\n` +
    `Reset it here — the link is good for 1 hour and can only be used once:\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email. Your password won't change.`;
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111418;line-height:1.5">` +
    `<h2 style="margin:0 0 12px">Reset your password</h2>` +
    `<p>Someone (hopefully you) asked to reset the password for your <strong>MHP Construction</strong> account.</p>` +
    `<p><a href="${resetUrl}" style="display:inline-block;background:#0b3d91;color:#fff;` +
    `padding:12px 22px;border-radius:10px;font-weight:600;text-decoration:none">Reset password</a></p>` +
    `<p style="color:#5b6470;font-size:13px">This link is good for 1 hour and can only be used once. ` +
    `If you didn't request this, ignore this email — your password won't change.</p>` +
    `<p style="color:#5b6470;font-size:13px">Or paste this link: <br>${resetUrl}</p></div>`;
  return sendMail({ to, subject: "Reset your MHP Construction password", text, html });
}
