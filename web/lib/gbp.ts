// Google Business Profile — the listing's reviews, pulled into the brain. Read-only.
// NOTE: Google gates the Business Profile APIs behind a per-project access request
// (business profile API quota approval) — the OAuth connect works immediately, but
// syncs 403 until Google approves the cloud project. The sync surfaces that clearly.
import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/oauth";

const GBP_ACCOUNT = "default";

async function ensureReviews() {
  await db.execute(`CREATE TABLE IF NOT EXISTS gbp_reviews (
    review_id TEXT PRIMARY KEY,
    location TEXT,
    reviewer TEXT,
    rating INTEGER,
    comment TEXT,
    created_at TEXT,
    reply TEXT,
    synced_at TEXT
  )`);
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export interface GbpSyncResult {
  locations: number;
  reviews: number;
  average: number | null;
}

export async function syncGbp(): Promise<GbpSyncResult> {
  const token = await getValidAccessToken("gbp", GBP_ACCOUNT);
  await ensureReviews();
  const headers = { Authorization: `Bearer ${token}` };

  const acctRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers });
  if (acctRes.status === 403) {
    throw new Error("Google hasn't approved Business Profile API access for this project yet — request it in the Cloud Console (APIs & Services → GBP API quota).");
  }
  if (!acctRes.ok) throw new Error(`GBP accounts failed: ${acctRes.status}`);
  const accounts = ((await acctRes.json()).accounts ?? []) as { name: string }[];

  let locations = 0, reviews = 0, ratingSum = 0;
  const now = new Date().toISOString();
  for (const acct of accounts) {
    const locRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title&pageSize=100`,
      { headers },
    );
    if (!locRes.ok) continue;
    const locs = ((await locRes.json()).locations ?? []) as { name: string; title: string }[];
    for (const loc of locs) {
      locations++;
      // reviews live on the legacy v4 surface
      const revRes = await fetch(`https://mybusiness.googleapis.com/v4/${acct.name}/${loc.name}/reviews?pageSize=200`, { headers });
      if (!revRes.ok) continue;
      const revs = ((await revRes.json()).reviews ?? []) as {
        reviewId: string; reviewer?: { displayName?: string }; starRating?: string;
        comment?: string; createTime?: string; reviewReply?: { comment?: string };
      }[];
      for (const r of revs) {
        reviews++;
        const stars = STARS[r.starRating ?? ""] ?? 0;
        ratingSum += stars;
        await db.execute({
          sql: `INSERT INTO gbp_reviews (review_id, location, reviewer, rating, comment, created_at, reply, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(review_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment,
                  reply = excluded.reply, synced_at = excluded.synced_at`,
          args: [r.reviewId, loc.title ?? "", r.reviewer?.displayName ?? "", stars, (r.comment ?? "").slice(0, 1000), r.createTime ?? "", r.reviewReply?.comment ?? "", now],
        });
      }
    }
  }
  return { locations, reviews, average: reviews ? Math.round((ratingSum / reviews) * 10) / 10 : null };
}

export interface ReviewRow {
  reviewer: string;
  rating: number;
  comment: string;
  createdAt: string;
  replied: boolean;
}

export async function recentReviews(limit = 10): Promise<ReviewRow[]> {
  await ensureReviews();
  const rows = (
    await db.execute({ sql: "SELECT reviewer, rating, comment, created_at, reply FROM gbp_reviews ORDER BY created_at DESC LIMIT ?", args: [limit] })
  ).rows;
  return rows.map((r) => ({
    reviewer: String(r.reviewer ?? ""),
    rating: Number(r.rating ?? 0),
    comment: String(r.comment ?? ""),
    createdAt: String(r.created_at ?? "").slice(0, 10),
    replied: Boolean(String(r.reply ?? "")),
  }));
}
