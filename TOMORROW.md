# Next Session — Connect Everything (QuickBooks + the rest)

The build is done. Every connection below has working code behind it — what's left is portal
clicks and one Authorize from the right human. QuickBooks is the main event; the others are
gravy that can happen the same day or later.

**Already handled, don't redo:** Intuit app registered, Production keys + static-IP proxy in
`.env`, the full pull→match→P&L→dashboard pipeline (`./qb_refresh.sh`), the HTTPS OAuth landing
page (live at `mhp-brain.vercel.app/api/oauth/manual-callback`), and `cryptography` for token
storage. The localhost-redirect instructions from the old version of this file are dead —
production uses the HTTPS landing page now.

---

## PART 1 — QuickBooks (the main event, ~15 min with the admin)

This is the one that unlocks per-job P&L, the loss list, and Margin Radar.

### Before the call

- [ ] **Verify the Production redirect URI is registered.** developer.intuit.com → the MHP app →
      Keys & OAuth → **Production** section → Redirect URIs must include exactly:
      `https://mhp-brain.vercel.app/api/oauth/manual-callback`
      (If it's missing, add it. This is the one thing I can't check from here.)
- [ ] **Line up the QB admin** — whoever has admin (or accountant-user) access to MHP's company.
      Ten minutes of their time, one Authorize click, read-only scope.

### The connect (together, on a machine where they can log in to QB)

- [ ] Run: `./qb.sh qb_connect.py --auth-url` — open the URL it prints.
- [ ] QB admin signs in and clicks **Authorize** (read-only accounting scope).
- [ ] Intuit lands on the mhp-brain page showing the full redirect URL. Copy it.
- [ ] Run: `./qb.sh qb_connect.py --callback "<that full URL>"` — tokens stored encrypted,
      gitignored.
- [ ] Confirm: `./qb.sh qb_connect.py --status` then `--test`. The realm ID must be
      **9341457244559426** (MHP's company — wrong number means wrong book, disconnect and redo).

### Then it's my build (no action from you)

`./qb_refresh.sh --full` — pulls the live book through the allowlisted IP, matches transactions
to the 149 projects, computes per-job P&L, syncs to the dashboards. Output: the job→project map
for your review, then the loss list, worst-first, every number traceable to a QB transaction.

- [ ] **One-time after the first pull: verify the labor-account list.** The labor-variance
      panel (Phase 2) counts QB expense lines posted to a labor account. The match list lives in
      `LABOR_ACCOUNT_PATTERNS` in `qb_pnl.py` (currently labor/wages/payroll/crew). Dump the
      real account names with the one-liner in that file's comment and add/remove patterns to
      match MHP's actual chart of accounts — wrong accounts would fabricate a labor number.
      Re-run `./qb_refresh.sh` after editing. (Code is done; this is just confirming the names.)

### Two answers to collect while you have them (admin/accountant/brother)

- [ ] **Does the bookkeeper tag bills to Customer:Job?** Tagged = near-automatic matching;
      untagged = the matcher works harder. Either way works — I just need to know.
- [ ] **For the litigation:** which signed contract values / bank records should the P&L
      reconcile against? Get those from the accountant so numbers cross-check to authoritative
      records, not just QB.

---

## PART 2 — The web app's connections (Integrations page)

A `vercel env pull` wiped the OAuth scaffold out of `web/.env.local`, so these need their keys
re-added. Each one is "register in a portal, paste two-to-four values." Full detail per provider
lives in `web/OAUTH_SETUP.md` — this is the order and the owner.

### 2a. Re-seed the wiped env (done locally — Vercel half remains)

- [x] `OAUTH_ENC_KEY` regenerated + all `*_REDIRECT_URI` lines re-added to `web/.env.local`;
      QB creds copied in from the root `.env`. (Done 2026-06-10.)
- [ ] Same values into **Vercel project env** (durable copy — so the next env pull can't wipe us
      back to zero; redirect URIs there use the `https://mhp-brain.vercel.app` versions). Needs
      your Vercel login: `vercel env add` or the dashboard.

### 2b. Google sign-in + Gmail intake (you, ~20 min, one Google Cloud project)

- [ ] console.cloud.google.com → OAuth client (Web) → redirect URIs from `OAUTH_SETUP.md` →
      paste **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`** (currently empty in `.env.local`).
- [ ] Enable the **Gmail API**, add the intake mailbox as a test user → paste
      **`GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`** (can reuse the same OAuth client).

### 2c. Microsoft Teams (you + MHP's M365 admin, ~20 min)

- [ ] portal.azure.com → App registration (`MHP Brain`, single tenant) → client secret →
      Graph delegated permissions per `OAUTH_SETUP.md` → **admin consent** (this is the step
      that needs whoever owns MHP's Microsoft 365).
- [ ] Paste `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / `MS_TENANT_ID` / `MS_REDIRECT_URI`.
- [ ] I run the Teams migration: `pnpm -C web exec node scripts/migrate.mjs`.

### 2d. Flip them on (together, 5 min)

- [ ] Restart dev, sign in → **Integrations** → Connect QuickBooks, Gmail, Teams → approve each.
- [ ] **Sync now** — status flips to Connected, tokens stored AES-256-GCM encrypted,
      auto-refreshing from there.

---

## Realistic expectation

Part 1 alone is the day's win: connected + job→project map same session, full per-job P&L right
behind it. Parts 2b/2c can ride along if the admins are reachable, or slot into any later day —
nothing in Part 1 waits on them. The blocker was never the build. It's the Authorize click.

*Rewritten 2026-06-10 against the production flow (HTTPS landing, static-IP egress, unified
connector). Supersedes the 2026-06-03 localhost-flow version.*
