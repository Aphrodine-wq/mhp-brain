# OAuth setup — Sign-in (Google login) + QuickBooks/Gmail (read-only data)

Two unrelated things share this file:
- **Sign in with Google** (below) — how people *log in*. Public, identity only, mints a session.
- **QuickBooks + Gmail** — read-only *data connections*, admin-gated, store tokens. Separate creds.

The flow code for all of it is built; this is just registering apps and pasting values into
`web/.env.local`.

> ⚠️ `vercel env pull` overwrote `web/.env.local` with only the Neon keys, so the earlier
> `OAUTH_ENC_KEY` / `QB_REDIRECT_URI` / `GMAIL_REDIRECT_URI` scaffold is **gone** — re-add those
> (and the Google keys below) and keep the durable copy in **Vercel project env**, not just locally.

## Sign in with Google (login)

Adds a **Continue with Google** button to `/login`. A Google account signs in **only if its
verified email already matches an active user** — there's no new-account creation, so this can't
let in anyone you haven't seeded with `scripts/seed-users.mjs`.

Fill in `web/.env.local`:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback   # prod: https://mhp-brain.vercel.app/api/auth/google/callback
```

1. https://console.cloud.google.com → same project as Gmail is fine.
2. **OAuth consent screen** → add `openid`, `email`, `profile` (non-sensitive — no Google review needed).
   While the app is in "testing", every person who signs in must be a listed **test user**.
3. **Credentials → OAuth client ID → Web application.** You can **reuse the Gmail client** (just add
   the `…/api/auth/google/callback` redirect URIs to it) or create a dedicated one.
4. Add both redirect URIs (local + prod). Copy **Client ID → `GOOGLE_CLIENT_ID`**, **Secret → `GOOGLE_CLIENT_SECRET`**.
5. The button only appears once all three `GOOGLE_*` are set; restart dev to load them.

---

## QuickBooks + Gmail (read-only data connections)

Both connections are **read-only**. Register the two apps and paste four values into
`web/.env.local`. (`OAUTH_ENC_KEY` + the `*_REDIRECT_URI`s were wiped by the env pull above — re-add them.)

## What you fill in (`web/.env.local`)

```
QB_CLIENT_ID=          GMAIL_CLIENT_ID=
QB_CLIENT_SECRET=      GMAIL_CLIENT_SECRET=
```

Already set for you: `OAUTH_ENC_KEY`, `QB_REDIRECT_URI`, `GMAIL_REDIRECT_URI`.

**Redirect URIs** — register these EXACT URLs in each console:

| Env   | QuickBooks                                                   | Gmail                                                   |
|-------|--------------------------------------------------------------|--------------------------------------------------------|
| Local | `http://localhost:3000/api/oauth/quickbooks/callback`        | `http://localhost:3000/api/oauth/gmail/callback`       |
| Prod  | `https://mhp-brain.vercel.app/api/oauth/quickbooks/callback` | `https://mhp-brain.vercel.app/api/oauth/gmail/callback`|

For prod, also set the `*_REDIRECT_URI` env vars on Vercel to the `https://` versions.

## QuickBooks
1. https://developer.intuit.com → sign in → **My Apps → Create an app → QuickBooks Online and Payments**.
2. Scope: **`com.intuit.quickbooks.accounting`** (Accounting) — that's all we use, read-only.
3. **Keys & OAuth** tab: Development keys for local, Production keys for prod.
4. Add both QB redirect URIs (local + prod).
5. Copy **Client ID → `QB_CLIENT_ID`**, **Client Secret → `QB_CLIENT_SECRET`**.
6. Dev keys hit Intuit's **sandbox company** automatically. Real books need Production keys + Intuit app review.

## Google (Gmail intake)
1. https://console.cloud.google.com → create/select a project.
2. **APIs & Services → Enable APIs** → enable **Gmail API**.
3. **OAuth consent screen** → External (or Internal for Workspace) → add the intake address as a **test user**
   (a "testing" app only allows listed test users — fine for one dedicated box).
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. Add both Gmail redirect URIs (local + prod).
6. Scope requested at connect time: **`gmail.readonly`**.
7. Copy **Client ID → `GMAIL_CLIENT_ID`**, **Client Secret → `GMAIL_CLIENT_SECRET`**.
   `gmail.readonly` is a restricted scope — a single test-user box works without Google's full verification;
   a public/at-scale box would need it.

## Connect
1. Restart dev so it loads the new env: `pnpm -C web exec next dev`.
2. Sign in (the **Dev sign-in** button works locally), then **Settings → Connections**.
3. **QuickBooks → Connect** → approve. **Gmail →** type the intake box address **→ Connect →** approve.
4. Status flips to **Connected**. Tokens are stored AES-256-GCM encrypted; access tokens refresh
   automatically from the stored refresh token.
