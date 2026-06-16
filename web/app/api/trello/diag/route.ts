import { NextResponse } from "next/server";

// TEMPORARY diagnostic — verifies whether TRELLO_API_KEY is valid by asking Trello.
// Hits members/me with the env key and a deliberately-bogus token:
//   - invalid key   -> 400 "invalid key"
//   - valid key     -> 401 "invalid token"   (key accepted, token rejected)
// Returns no secret material (only length + the four-char prefix for sanity). Remove after use.
export async function GET() {
  const key = (process.env.TRELLO_API_KEY ?? "").trim();
  const rawHadWhitespace = (process.env.TRELLO_API_KEY ?? "") !== key;
  if (!key) {
    return NextResponse.json({ keyPresent: false, note: "TRELLO_API_KEY is empty/unset in this env." });
  }
  const bogus = "0".repeat(64);
  let status = 0;
  let body = "";
  try {
    const res = await fetch(
      `https://api.trello.com/1/members/me?key=${encodeURIComponent(key)}&token=${bogus}`,
    );
    status = res.status;
    body = (await res.text()).slice(0, 120);
  } catch (e) {
    body = e instanceof Error ? e.message : String(e);
  }
  const keyVerdict =
    status === 401 ? "VALID KEY (token rejected, as expected)" :
    status === 400 && /invalid key/i.test(body) ? "INVALID KEY" :
    `inconclusive (status ${status}: ${body})`;
  return NextResponse.json({
    keyPresent: true,
    keyLength: key.length,
    keyPrefix: key.slice(0, 4),
    rawHadWhitespace,
    trelloStatus: status,
    trelloBody: body,
    keyVerdict,
  });
}
