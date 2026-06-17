import { NextResponse } from "next/server";

// Google Business Profile rating + recent reviews for the home screen. Pulls from the
// Places API (New), server-side, and stays SILENT (ok:false) until the creds are set —
// the dashboard never breaks waiting on Google. Set in the env / Vercel project:
//   GOOGLE_PLACES_API_KEY   — a Google Cloud key with "Places API (New)" enabled
//   GOOGLE_PLACES_PLACE_ID  — the business's Place ID (looks like "ChIJ...")
// Reviews change slowly and each Places call is billable, so the response is cached 6h.
export const revalidate = 21600;

export async function GET() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACES_PLACE_ID;
  if (!key || !placeId) return NextResponse.json({ ok: false, reason: "unconfigured" });

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "displayName,rating,userRatingCount,googleMapsUri,reviews",
      },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return NextResponse.json({ ok: false, reason: `google ${res.status}` });
    const d = await res.json();

    // Parse defensively — render whatever Google returns, never throw on a missing field.
    const reviews = Array.isArray(d.reviews)
      ? d.reviews.slice(0, 3).map((r: Record<string, unknown>) => {
          const author = r.authorAttribution as Record<string, unknown> | undefined;
          const text = (r.text ?? r.originalText) as Record<string, unknown> | undefined;
          return {
            author: (author?.displayName as string) ?? "Google user",
            photo: (author?.photoUri as string) ?? null,
            rating: Number(r.rating) || 0,
            text: (text?.text as string) ?? "",
            when: (r.relativePublishTimeDescription as string) ?? "",
          };
        })
      : [];

    return NextResponse.json({
      ok: true,
      name: (d.displayName?.text as string) ?? "",
      rating: Number(d.rating) || 0,
      total: Number(d.userRatingCount) || 0,
      url: (d.googleMapsUri as string) ?? null,
      reviews,
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "error" });
  }
}
