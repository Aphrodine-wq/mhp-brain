# OAuth setup — QuickBooks + Google (Gmail intake)

Both connections are **read-only**. The flow code is already built — this is just registering the
two apps and pasting four values into `web/.env.local`. `OAUTH_ENC_KEY` and the redirect URIs are
already filled in.

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
