"use client";

import { useEffect, useState } from "react";

type Review = { author: string; photo: string | null; rating: number; text: string; when: string };
type Data = { ok: boolean; name?: string; rating?: number; total?: number; url?: string | null; reviews?: Review[] };

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="gbp-stars" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= full ? "on" : "off"}>★</span>
      ))}
    </span>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.7-.2-2.5H12v4.7h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4.1-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8L20 3.2A12 12 0 0 0 1.3 6.6l4.1 3.1c.9-2.8 3.5-4.9 6.6-4.9z" />
    </svg>
  );
}

// Google Business Profile panel — the real profile (name, rating, count, reviews) via the
// Places API (/api/reviews). Shows a quiet setup note until the Places creds are in the env.
export default function GbpReviews() {
  const [d, setD] = useState<Data | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await (await fetch("/api/reviews")).json();
        if (live) setD(r);
      } catch {
        /* silent — the widget just doesn't render */
      }
    })();
    return () => { live = false; };
  }, []);

  if (!d) return null;

  if (!d.ok || !d.rating) {
    return (
      <div className="gmb-panel gmb-empty">
        <div className="gmb-icon"><GoogleG /></div>
        <div>
          <div className="gmb-name">Google Business Profile</div>
          <div className="gmb-sub">Add the Places API key + place ID in the server env to show the live profile here.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="gmb-panel">
      <div className="gmb-main">
        <div className="gmb-icon"><GoogleG /></div>
        <div>
          <div className="gmb-name">{d.name || "Google Business Profile"}</div>
          <div className="gmb-rating-row">
            <span className="gmb-num">{d.rating!.toFixed(1)}</span>
            <Stars rating={d.rating!} />
            <span className="gmb-count">{d.total} review{d.total === 1 ? "" : "s"}</span>
          </div>
        </div>
        {d.url && (
          <a className="btn ghost sm" style={{ marginLeft: "auto", flexShrink: 0 }} href={d.url} target="_blank" rel="noreferrer">
            View on Google
          </a>
        )}
      </div>

      {d.reviews && d.reviews.length > 0 && (
        <div className="gbp-reviews">
          {d.reviews.map((r, i) => (
            <div key={i} className="gbp-review">
              <div className="gbp-review-top">
                <span className="gbp-author">{r.author}</span>
                <Stars rating={r.rating} />
                {r.when && <span className="gbp-when">{r.when}</span>}
              </div>
              {r.text && <div className="gbp-text">{r.text}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
