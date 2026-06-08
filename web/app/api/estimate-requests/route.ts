import { db } from "@/lib/db";

// PUBLIC, unauthenticated endpoint — the marketing site posts homeowner estimate
// requests here. Because it's open to the internet it is locked down: strict input
// validation + length caps, a honeypot, a per-IP hourly rate limit, and a CORS
// allowlist. It only ever INSERTs a request row; it can read nothing and touches
// no other table.

const ALLOWED_ORIGINS = (process.env.ALLOWED_REQUEST_ORIGINS ??
  "https://mshomepros.com,https://www.mshomepros.com,https://northmshomepros.com,https://www.northmshomepros.com,http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);

const MAX_PER_IP_PER_HOUR = 5;
const LIMITS = { name: 120, email: 160, phone: 40, address: 200, market: 80, project_type: 80, scope: 4000 };

function corsHeaders(origin: string | null): HeadersInit {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "").trim() || "unknown";
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

function slugify(s: string): string {
  return (s || "request").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "request";
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  let d: Record<string, unknown>;
  try {
    d = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400, headers });
  }

  // Honeypot: a hidden "company" field no human fills. Pretend success so bots
  // don't learn they were caught, but store nothing.
  if (typeof d.company === "string" && d.company.trim()) {
    return Response.json({ ok: true }, { headers });
  }

  const name = clean(d.name, LIMITS.name);
  const email = clean(d.email, LIMITS.email);
  const phone = clean(d.phone, LIMITS.phone);
  if (!name) return Response.json({ error: "name is required" }, { status: 422, headers });
  if (!email && !phone) return Response.json({ error: "email or phone is required" }, { status: 422, headers });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return Response.json({ error: "invalid email" }, { status: 422, headers });

  const ip = clientIp(req);
  const now = new Date().toISOString();

  try {
    // per-IP hourly rate limit
    const since = new Date(Date.now() - 3600_000).toISOString();
    const recent = await db.execute({
      sql: "SELECT COUNT(*)::int AS n FROM estimate_requests WHERE ip = ? AND created_at > ?",
      args: [ip, since],
    });
    if (Number(recent.rows[0]?.n ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return Response.json({ error: "too many requests — please try again later" }, { status: 429, headers });
    }

    const sqftRaw = Number(d.sqft);
    const sqft = Number.isFinite(sqftRaw) && sqftRaw > 0 && sqftRaw < 100000 ? Math.round(sqftRaw) : null;
    const id = `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`;
    await db.execute({
      sql: `INSERT INTO estimate_requests
              (id, name, email, phone, address, market, project_type, sqft, scope, status, source, ip, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', 'website', ?, ?, ?)`,
      args: [
        id, name, email, phone,
        clean(d.address, LIMITS.address),
        clean(d.market, LIMITS.market),
        clean(d.project_type, LIMITS.project_type),
        sqft,
        clean(d.scope, LIMITS.scope),
        ip, now, now,
      ],
    });
    return Response.json({ ok: true, id }, { headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: "could not submit request", detail: msg }, { status: 500, headers });
  }
}
