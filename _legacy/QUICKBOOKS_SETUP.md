# QuickBooks Online — Setup

The actuals path is built (`quickbooks.py`) but **off** until these credentials exist. Once set,
the admin QB card flips to "Ready" and `sync_actuals()` pulls real job costs into the `actuals`
table — which is what turns every margin number from *bid* to *realized*.

## What to provide (5 things → 4 env vars)

1. **Create an Intuit app** at <https://developer.intuit.com> → My Apps → Create app → QuickBooks
   Online and Payments. This gives you a **Client ID** and **Client Secret**.
2. **Connect MHP's company** to the app and authorize it once (OAuth2 Playground at
   developer.intuit.com is the easiest). The authorization returns:
   - a **Realm ID** (the company id), and
   - a **Refresh token** (long-lived, ~100 days; the app auto-mints access tokens from it).

## Set the env vars

```bash
export QB_CLIENT_ID="…"
export QB_CLIENT_SECRET="…"
export QB_REALM_ID="…"
export QB_REFRESH_TOKEN="…"
export QB_ENV="production"      # or "sandbox" while testing
```

Verify:

```bash
python3 quickbooks.py          # prints status — should say configured: true
```

## How sync works

```python
import quickbooks
quickbooks.sync_actuals(commit=False)   # PREVIEW: matched job costs, writes nothing
quickbooks.sync_actuals(commit=True)    # writes matched rows into actuals
```

- Costs come from QBO **Bills + Purchases**, summed per **Customer** (= job).
- Each customer is matched to a project by name (exact, then loose last-name match). The preview
  shows **matched** and **unmatched** so you fix the mapping before committing — QB customer names
  rarely match the project slugs exactly.

## Honest status

The OAuth refresh and query code follows the Intuit v3 API spec but has **not been run against a
live company** (no creds here yet). Treat the first real `sync_actuals()` as a test: run the
preview, eyeball the matches, then commit. The mapping heuristic (`_match_project`) is the part
most likely to need tuning to how MHP names customers in QuickBooks.
```
