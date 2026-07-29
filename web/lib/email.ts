import { db } from "./db";

// Estimate-created email to the whole team, via Resend. Env-gated on purpose: silently off
// until RESEND_API_KEY and RESEND_FROM are set. RESEND_FROM needs its domain verified in the
// Resend dashboard (e.g. estimates@mhpestimate.cloud) or mail never leaves the queue.
export async function sendEstimateAlert(opts: {
  project: string;
  total: string;
  createdBy: string;
  url: string;
}): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) return;

  // everyone on the crew with an email on file — deduped
  const rows = (await db.execute("SELECT email FROM crew WHERE email IS NOT NULL AND email != ''")).rows;
  const to = [...new Set(rows.map((r) => String(r.email).trim()).filter(Boolean))];
  if (!to.length) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: `New estimate: ${opts.project} — ${opts.total}`,
      text: `${opts.createdBy} saved a new estimate.\n\nProject: ${opts.project}\nBid: ${opts.total}\n\nOpen it: ${opts.url}`,
    }),
  }).catch(() => {
    /* alerts never block the save */
  });
}
