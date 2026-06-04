// Shared client-side writer. The X-MHP-Write header is a cheap CSRF guard: a cross-site form
// or <img> can't set a custom header without a CORS preflight, which this server fails.
export async function post<T = unknown>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-MHP-Write": "1" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.text()) || `${r.status}`);
  return r.json();
}
