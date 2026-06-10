import type { ReviewRow } from "@/lib/gbp";

// Recent Google reviews, surfaced after a GBP sync. Unreplied ones get flagged —
// answering reviews is free marketing.
export default function ReviewsPanel({ reviews }: { reviews: ReviewRow[] }) {
  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Recent Google reviews</h3>
      {reviews.map((r, i) => (
        <div className="setrow" key={i}>
          <div>
            <div className="sl">
              {"★".repeat(r.rating)}{"☆".repeat(Math.max(0, 5 - r.rating))} {r.reviewer || "Anonymous"}
            </div>
            {r.comment && <div className="sd">{r.comment.slice(0, 200)}{r.comment.length > 200 ? "…" : ""}</div>}
          </div>
          <div className="actions">
            <span className="sd" style={{ whiteSpace: "nowrap" }}>{r.createdAt}</span>
            {!r.replied && <span className="badge aging">No reply</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
