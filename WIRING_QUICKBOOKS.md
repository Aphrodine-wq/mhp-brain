# Wiring the MHP Brain to QuickBooks

*The build guide. The spec (`QB_JOBCOST_SPEC.md`) says what we're building and why; this says how to
build it, step by step. Follow it top to bottom and you go from "no QB connection" to "per-job
profit/loss across the whole book, every figure traceable to a QB transaction ID."*

---

## What this wiring does

The brain already knows what MHP **bid** — 4,298 line items across 104 estimates, normalized into a
CSI-keyed cost catalog. It does not yet know what those jobs **actually cost**. That number lives in
QuickBooks: the bills, the invoices, the payroll. Wiring QB in closes the loop — it turns the brain
from a bid analyzer into a profit-and-loss engine, and switches on Margin Radar and the learning
flywheel (`ROADMAP.md` Part 6) at the same time.

The connection is **read-only**. We never write to MHP's books. The whole value of this system is
that its numbers trace back to clean source records — corrupting those records would defeat it.

---

## Decision to settle first: the language spine

The brain is Python (`mhp-brain`). The QB job-matcher already exists in TypeScript (`qb-job-matching.ts`,
in the archived `mshomepros` repo). You have to pick where the QB connection lives. Two real options:

- **Python-native (recommended).** Use `intuit-oauth` + `python-quickbooks`. The connection lives
  inside `mhp-brain`, reads straight into `mhp.db`, no service boundary, no second runtime to deploy.
  Port the matcher's logic (PO -> client/address -> vendor -> date-window, confidence tiers) into a
  `qb_match.py`. It's ~200 lines of deterministic rules — a clean port, not a rewrite of intent.
- **TS matcher as a microservice.** Stand `qb-job-matching.ts` up as a tiny HTTP service the Python
  brain calls. Avoids the port but adds a second process to run, deploy, and keep alive.

**Go Python-native.** One runtime, one deploy, the connection sits next to the data it feeds. The
matcher port is the only real cost and it's small. This also forces the `COMPANY.md` spine decision
in the right direction — the brain stays one thing.

> Reuse note: the same QB OAuth flow is being built for FairTradeWorker right now. Build the OAuth
> connection module once, cleanly factored, so both products share it. Don't write it twice.

---

## Prerequisites (what James provides)

1. **QuickBooks Online access.** An admin authorizes the app, or an accountant-user with read-only
   access does. Either works for the read-only accounting scope.
2. **Labor: confirmed in QB.** Payroll runs through QuickBooks (confirmed 2026-06-03), so direct
   labor is captured in job cost. The cost side is complete on day one — no labor-allocation pre-work.
   The completeness guard stays in the code anyway (the next contractor may not run payroll in QB).
3. **Tagging discipline answer.** Does the bookkeeper assign bills to **Customer:Job**? Tagged costs
   are near-automatic. Untagged costs go through the matcher. This decides Phase B effort — ask before
   estimating it.
4. **For litigation use only:** signed contract values + any bank records the accountant wants
   cross-checked, so the system reconciles to them, not just to QB.

---

## Step 1 — Register the app in the Intuit Developer portal

1. Sign in at `developer.intuit.com` with the MHP Intuit account.
2. Create an app, choose the **Accounting** scope. Request **`com.intuit.quickbooks.accounting`**
   with **read-only** intent (we never call any create/update/delete endpoint).
3. Grab the **Client ID** and **Client Secret** from the app's Keys tab. Use the **Development** keys
   to test against a sandbox company first, then **Production** keys against MHP's real book.
4. Set the **Redirect URI** to `http://localhost:8770/qb/callback` for local dev (the brain's web app
   already runs on `:8770`). Add the production URI when hosting is settled.

Output of this step: `client_id`, `client_secret`, `redirect_uri`. None of these go in git.

---

## Step 2 — The OAuth2 connection module

OAuth2 with Intuit is a one-time authorize, then refresh forever. The flow: redirect James to
Intuit's consent screen -> he approves -> Intuit calls back with an auth `code` + the `realmId` (the
company ID) -> exchange the code for an access token (1hr) + refresh token (100 days) -> store
encrypted -> auto-refresh before each sync.

```python
# qb_connect.py  — OAuth2, read-only. Shared shape with the FTW connection.
from intuitlib.client import AuthClient
from intuitlib.enums import Scopes

auth_client = AuthClient(
    client_id=os.environ["QB_CLIENT_ID"],
    client_secret=os.environ["QB_CLIENT_SECRET"],
    redirect_uri="http://localhost:8770/qb/callback",
    environment="production",          # "sandbox" while testing
)

# 1. send James here to consent (read-only scope):
url = auth_client.get_authorization_url([Scopes.ACCOUNTING])

# 2. callback handler exchanges the code, captures the realm (company) id:
def qb_callback(auth_code, realm_id):
    auth_client.get_bearer_token(auth_code, realm_id=realm_id)
    save_tokens_encrypted(                      # NEVER plain-text, NEVER committed
        access=auth_client.access_token,
        refresh=auth_client.refresh_token,
        realm_id=realm_id,
    )

# 3. before every sync, refresh if expiring:
def get_live_token():
    t = load_tokens()
    if t.expires_soon():
        auth_client.refresh(refresh_token=t.refresh)
        save_tokens_encrypted(auth_client.access_token, auth_client.refresh_token, t.realm_id)
    return load_tokens()
```

**Token storage.** Encrypt at rest (Fernet key from env, or the OS keychain). Add the token file to
`.gitignore` right next to `mhp.db` — same rule, same reason. A refresh token is a 100-day key to the
company's financials; treat it like one.

---

## Step 3 — Phase A: pull the Customer:Job list and map it to projects

Pull every **Customer** and its **sub-customers (jobs)** from QB. Then bridge each QB job to one of
the brain's 149 `projects.id`:

```python
from quickbooks import QuickBooks
from quickbooks.objects.customer import Customer

qb = QuickBooks(auth_client=auth_client, company_id=realm_id, minorversion=73)
jobs = Customer.filter(Job=True, qb=qb)        # sub-customers = jobs

for j in jobs:
    candidate = slug(j.DisplayName)            # reuse the existing slug() the brain already uses
    match = fuzzy_match(candidate, projects)   # name, then confirm on address/client
    if match.confidence >= HIGH:
        link(j.Id, match.project_id)           # auto-link
    else:
        review_queue.add(j, match.candidates)  # human confirms — NOT optional
```

The data is known to be mis-filed (e.g. Molly Moore filed under Ken Williams), so the **review queue
is built in, not a fallback.** Deliverable of Phase A: every QB job is either linked to a project or
sitting in the queue with candidates. Nothing is silently dropped.

---

## Step 4 — Phase B: pull costs + revenue, tag them to jobs

Pull the cost and revenue transactions, each carrying its QB transaction ID (this is the provenance
the legal framing rests on):

| Pull | QB entity | Goes to |
|---|---|---|
| Direct cost | `Bill`, `Purchase`, `VendorCredit` | `actuals` (cost lines) |
| Revenue | `Invoice`, `Payment`, `SalesReceipt` | `actuals` (revenue lines) |
| Labor | `TimeActivity` / payroll | `actuals` (labor, flagged present) |
| Committed | `PurchaseOrder` | open-job in-progress view |

For each transaction:
- **Tagged to a Customer:Job?** -> assign directly to that project. Near-automatic.
- **Untagged?** -> route through `qb_match.py` (the ported matcher: PO -> client/address -> vendor ->
  date window, confidence tiers). exact/high auto-assign; everything else to the review queue.
- **Untagged and unmatchable?** -> surface in the **untagged pool**. Never silently drop it, never
  silently call it overhead.

**Sync incrementally.** Use ChangeDataCapture or `Metadata.LastUpdatedTime` to pull deltas, not the
whole company every run. **Log every pull** — what, when, how many records — that audit log is part
of the provenance promise.

### Schema extension this needs

The current `actuals` table (`project_id, source_file, closing_total`) is too thin to hold
transaction-level provenance. Extend it before Phase B:

```sql
CREATE TABLE IF NOT EXISTS actuals_txn (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT REFERENCES projects(id),
    qb_txn_id     TEXT NOT NULL,        -- the provenance anchor
    qb_type       TEXT,                 -- Bill / Invoice / Payment / TimeActivity / ...
    kind          TEXT,                 -- cost | revenue | labor
    division      TEXT,                 -- mapped to CSI for line-level variance
    amount        REAL,
    txn_date      TEXT,
    tagged        INTEGER,              -- 1 = QB-tagged, 0 = matcher-assigned
    match_conf    TEXT,                 -- exact / high / review / untagged
    pulled_at     TEXT
);
```

Keep the old `actuals` (closeout totals) — `actuals_txn` is the line-level feed beneath it.

---

## Step 5 — Phase C: compute per-job P&L + the completeness score

For each linked Customer:Job, run the spec's computation:

```
revenue      = Σ revenue txns (tagged to job)
direct_cost  = Σ cost txns  +  Σ labor          # labor flagged if absent
gross_margin = revenue − direct_cost
gross_pct    = gross_margin / revenue
bid_vs_actual = actual_cost vs estimates.sum_sov_total   # from the existing bid data
```

Then the **completeness score (0–100)** — this is the defensibility gate, not a nicety:

- cost lines tagged-to-job vs floating
- labor present (yes/no)
- job closed (yes/no)
- revenue reconciles to contract value (±tolerance)
- revenue reconciles to bank deposits

**The loss-call rule.** A job is reported **CONFIRMED LOSS** only at high completeness *with labor
included*. Otherwise: **LIKELY LOSS (labor unconfirmed)**, **INCOMPLETE — UNDER REVIEW**, or **IN
PROGRESS**. No job is ever flatly called a loss off partial data — especially not for legal use. Only
**closed** jobs get a final P&L; open jobs are "in progress — partial" (revenue lags cost mid-draw,
so an open job looks underwater when it isn't).

Default profit definition is **gross job margin**. Overhead allocation is a separate, clearly-labeled
second layer — never let unallocated overhead masquerade as job cost or vice versa.

---

## Step 6 — Phase D: the report

The deliverable. Per-job P&L, **sorted losses-first**, each row carrying:

- gross margin $ and %, bid vs actual
- its confidence tier (CONFIRMED / LIKELY / INCOMPLETE / IN PROGRESS)
- drill-down to the source QB transaction IDs behind every number

Then the **portfolio roll-up**, and the cross-check that makes it defensible: run QB's own
**ProfitAndLossDetail-by-Customer** report via the Reports API and reconcile our roll-up against it.
Two independent paths agreeing is the difference between "a number" and "a number an accountant will
sign off on."

---

## Step 6.5 — The second intake pipe: invoices via email

QuickBooks tells you what got **booked**. The accounting inbox tells you what **arrived**. They are
the two halves of the actuals pipe (`ROADMAP.md` Part 6: "one pipe feeds two payoffs"), and they
cross-check each other. Invoices land in the family's accounting email first, then get keyed into QB —
so the inbox is the front door for money-in, and reading it live gives a free audit: *this bill hit
the email but isn't in QB yet.*

**Access model: auto-forward to a dedicated intake box (decided 2026-06-04).** We do **not** read a
personal inbox. Instead:

1. **Stand up a dedicated intake box** — a new Gmail the brain owns (e.g. `mhp.invoices@gmail.com`).
   It contains nothing but forwarded invoices. The brain holds *its own* read-only token; the family
   member whose email is the front door never shares their credentials.
2. **One-time forwarding filter** on the source account — Gmail Settings -> Filters -> "forward to"
   the dedicated box, matched on vendor senders + `has:attachment` (or simplest: a label applied to
   invoices). Gmail requires the intake box to confirm the forward once; read that confirmation out of
   the box and approve. After that it is automatic. (Note: Gmail only forwards mail arriving *after*
   the filter is set, and forwarding re-wraps the message — anchor provenance on the forwarded
   message-ID + attachment hash + the parsed original sender, not the raw envelope.)
3. **Gmail API OAuth on the intake box, read-only** — scope `gmail.readonly`. Reuse the same OAuth
   module shape as the QB connection (Step 2): encrypted token, refresh handled, gitignored.

The ingestion pipeline:

```
intake box → messages.list (has:attachment, incremental via historyId since last sync)
→ pull + base64-decode attachments
→ parse: PDF text layer (pdfplumber); scanned image → OCR, with a confidence gate
   → vendor, invoice date, total, PO#, line items
→ qb_match.py  (the SAME matcher as the QB pipe — PO → client/address → vendor → date window)
   exact/high → assign to project; else → review queue
→ land in actuals_txn  (source='email', kind='cost', provenance = message-ID + attachment hash)
```

**The de-dup trap — read this twice.** Once both pipes run, the same invoice appears twice: as a
forwarded PDF (email) and as a booked `Bill` (QB). These are **two views of one cost, not two costs.**
Link them on (vendor + amount + date + PO); count the cost **once**. The email is the source document,
the QB `Bill` is the booking, and the *gap* between them is the audit signal:

- in email, not in QB → **arrived, not booked yet**
- in QB, no source email → **booked, no source invoice on file**

**The OCR guard (don't learn from noise).** A scanned invoice that won't parse cleanly **holds** —
it goes to the review queue, never silently into `actuals_txn` or the catalog. Same guard as the
flywheel below: bad data corrupts the moat, so the pipe only commits confirmed, parsed, matched
invoices.

Security additions for this pipe: read-only Gmail scope; the brain reads **only** the dedicated box,
never personal mail; token encrypted + gitignored; every pull written to the same audit log as QB.

---

## Step 7 — Turn on the flywheel (the payoff beyond the report)

Once `actuals_txn` is flowing, two things switch on for free (`ROADMAP.md` Part 6):

- **Margin Radar** — per active job, budget vs actual by CSI division. The alarm: any division
  crosses its estimate before the job is marked done. "Framing bid $40k, you're at $52k and not done."
  Progress proxied by dollars (actual ÷ estimated total), so it needs zero extra data entry.
- **The learning flywheel** — when a job closes, the bid-vs-actual delta feeds back into the cost
  catalog, **recency-weighted (EWMA)**. The next estimate is priced off what the last jobs actually
  cost, not off what someone typed. This is the moat Procore/Buildertrend structurally can't build.

**The guard:** the loop only learns from confirmed, matched actuals (exact/high). Missing or
unreadable actuals (scanned PDFs, open jobs) **hold** — flagged awaiting actuals, never silently
fed in. Bad data corrupts the moat; the loop refuses to learn from noise.

---

## Security checklist (do not skip)

- [ ] Scope is **read-only** (`com.intuit.quickbooks.accounting`, read intent). No write endpoint
      ever called.
- [ ] Tokens **encrypted at rest**, refresh handled, token file **gitignored** like `mhp.db`.
- [ ] Every pull written to an **audit log** (what / when / count) — provenance for legal use.
- [ ] Incremental sync (ChangeDataCapture / LastUpdatedTime), not full-company every run.
- [ ] Untagged pool **surfaced**, never silently dropped or reclassified.
- [ ] Every reported figure carries its **QB transaction ID** and **completeness tier**.
- [ ] Email intake reads a **dedicated forward-only box**, never a personal inbox; `gmail.readonly`.
- [ ] Email and QB views of the same invoice **linked, counted once** (vendor + amount + date + PO).
- [ ] Unparseable invoices **held in the review queue**, never silently committed.

---

## The honest promise

Once QB is connected, this produces a per-job profit/loss across the whole book — every figure
traceable to a transaction, every loss gated on completeness. Accurate enough to run the company on;
auditable enough that an accountant or attorney can verify each number against QuickBooks, signed
contracts, and bank records. The system is the lens; the determination stays theirs.

*Companion to `QB_JOBCOST_SPEC.md` and `ROADMAP.md` Part 6. Build guide last written 2026-06-04.*
