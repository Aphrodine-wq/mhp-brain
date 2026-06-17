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

// Google Business Profile widget — live rating + recent review snippets. Loads from
// /api/reviews on mount and renders nothing until the Places creds are configured.
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

  if (!d || !d.ok || !d.rating) return null;

  return (
    <>
      <div className="sec-h">Google reviews</div>
      <div className="gbp-card">
        <div className="gbp-head">
          <div>
            <div className="gbp-rating">
              <span className="gbp-num">{d.rating!.toFixed(1)}</span>
              <Stars rating={d.rating!} />
            </div>
            <div className="gbp-count">{d.total} Google review{d.total === 1 ? "" : "s"}</div>
          </div>
          {d.url && (
            <a className="btn ghost" href={d.url} target="_blank" rel="noreferrer">View on Google</a>
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
    </>
  );
}
