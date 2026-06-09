import { NextResponse, type NextRequest } from "next/server";

// HTTPS landing for the CLI connect flow (qb_connect.py). Intuit rejects localhost redirect URIs in
// PRODUCTION, so the Python tool points its prod redirect here. This page does NOT exchange the code
// — it just shows the operator the values to paste into `qb_connect.py --callback`. The auth code is
// single-use and short-lived, and useless without the client secret, so this is safe to serve
// un-gated (it only ever echoes back the requester's own query string). Register this exact URL under
// the app's PRODUCTION redirect URIs in the Intuit portal.
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const realmId = sp.get("realmId");
  const error = sp.get("error");
  const fullUrl = req.nextUrl.toString();

  const body = error
    ? `<h1>Authorization failed</h1><p>Intuit returned: <code>${escapeHtml(error)}</code>. Re-run <code>qb_connect.py --auth-url</code>.</p>`
    : code && realmId
      ? `<h1>QuickBooks authorization received</h1>
         <p>Copy the full URL below and finish the connection from your terminal:</p>
         <pre style="white-space:pre-wrap;word-break:break-all;background:#f4f4f4;padding:12px;border:1px solid #ddd">${escapeHtml(fullUrl)}</pre>
         <p>Run: <code>./qb.sh qb_connect.py --callback "&lt;paste the URL above&gt;"</code></p>
         <p>realmId: <code>${escapeHtml(realmId)}</code></p>`
      : `<h1>Nothing to do</h1><p>This page expects an Intuit OAuth redirect with <code>?code</code> and <code>?realmId</code>.</p>`;

  return new NextResponse(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>QuickBooks connect</title></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;line-height:1.5">${body}</body></html>`,
    { status: error ? 400 : 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
