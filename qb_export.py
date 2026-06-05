"""
QuickBooks Online → local JSON exporter.

Usage:
  1. Set QB_CLIENT_ID and QB_CLIENT_SECRET (env vars or prompted).
  2. Run:  python qb_export.py auth        — opens browser, gets tokens
  3. Run:  python qb_export.py pull        — downloads everything to qb_data/
  4. Run:  python qb_export.py pull --full  — forces full re-pull (ignores cache)
  5. Run:  python qb_export.py report      — quick P&L summary from downloaded data

Tokens are saved to .qb_tokens.json (gitignored, never committed).
All downloaded data lands in qb_data/ as JSON files.

Read-only: this script calls NO create/update/delete endpoints.
"""

import json
import os
import sys
import time
import webbrowser
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

REDIRECT_PORT = 8771
REDIRECT_URI = f"http://localhost:{REDIRECT_PORT}/callback"
TOKEN_FILE = Path(__file__).parent / ".qb_tokens.json"
DATA_DIR = Path(__file__).parent / "qb_data"
SCOPES = "com.intuit.quickbooks.accounting"

# Intuit endpoints
AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
API_BASE = "https://quickbooks.api.intuit.com/v3/company"
MINOR_VERSION = 73  # latest stable

# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------

def get_creds():
    cid = os.environ.get("QB_CLIENT_ID", "").strip()
    secret = os.environ.get("QB_CLIENT_SECRET", "").strip()
    if not cid:
        cid = input("QB_CLIENT_ID: ").strip()
    if not secret:
        secret = input("QB_CLIENT_SECRET: ").strip()
    if not cid or not secret:
        print("ERROR: Client ID and Secret are required.")
        sys.exit(1)
    return cid, secret


# ---------------------------------------------------------------------------
# Token management
# ---------------------------------------------------------------------------

def save_tokens(data):
    TOKEN_FILE.write_text(json.dumps(data, indent=2))
    print(f"  Tokens saved to {TOKEN_FILE.name}")


def load_tokens():
    if not TOKEN_FILE.exists():
        print(f"ERROR: No tokens found ({TOKEN_FILE.name}). Run: python qb_export.py auth")
        sys.exit(1)
    return json.loads(TOKEN_FILE.read_text())


def refresh_if_needed(tokens, cid, secret):
    """Refresh the access token if it's expired or close to expiring."""
    expires_at = tokens.get("expires_at", 0)
    if time.time() < expires_at - 120:
        return tokens  # still valid

    print("  Access token expired, refreshing...")
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "refresh_token",
        "refresh_token": tokens["refresh_token"],
    }, auth=(cid, secret), headers={"Accept": "application/json"})

    if resp.status_code != 200:
        print(f"ERROR: Token refresh failed ({resp.status_code}): {resp.text}")
        print("Re-run: python qb_export.py auth")
        sys.exit(1)

    body = resp.json()
    tokens["access_token"] = body["access_token"]
    tokens["refresh_token"] = body.get("refresh_token", tokens["refresh_token"])
    tokens["expires_at"] = time.time() + body.get("expires_in", 3600)
    save_tokens(tokens)
    print("  Refreshed OK.")
    return tokens


# ---------------------------------------------------------------------------
# OAuth2 flow — local callback server
# ---------------------------------------------------------------------------

class CallbackHandler(BaseHTTPRequestHandler):
    """Captures the OAuth callback, extracts code + realmId."""
    auth_code = None
    realm_id = None

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "error" in params:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(f"Authorization denied: {params['error'][0]}".encode())
            return

        CallbackHandler.auth_code = params.get("code", [None])[0]
        CallbackHandler.realm_id = params.get("realmId", [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(b"""
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h1>Connected!</h1>
        <p>QuickBooks authorized. You can close this tab and go back to the terminal.</p>
        </body></html>
        """)

    def log_message(self, format, *args):
        pass  # silence request logging


def do_auth():
    cid, secret = get_creds()

    # Build authorize URL
    params = urllib.parse.urlencode({
        "client_id": cid,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "state": "mhp-brain-export",
    })
    url = f"{AUTH_URL}?{params}"

    print(f"\n  Opening browser for QuickBooks authorization...")
    print(f"  If it doesn't open, go to:\n  {url}\n")
    webbrowser.open(url)

    # Start local server to capture the callback
    server = HTTPServer(("127.0.0.1", REDIRECT_PORT), CallbackHandler)
    print(f"  Waiting for callback on port {REDIRECT_PORT}...")
    server.handle_request()  # handles exactly one request

    code = CallbackHandler.auth_code
    realm = CallbackHandler.realm_id
    if not code or not realm:
        print("ERROR: Did not receive authorization code or realmId.")
        sys.exit(1)

    print(f"  Got auth code. RealmId (company): {realm}")
    print("  Exchanging code for tokens...")

    # Exchange code for tokens
    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }, auth=(cid, secret), headers={"Accept": "application/json"})

    if resp.status_code != 200:
        print(f"ERROR: Token exchange failed ({resp.status_code}): {resp.text}")
        sys.exit(1)

    body = resp.json()
    tokens = {
        "access_token": body["access_token"],
        "refresh_token": body["refresh_token"],
        "realm_id": realm,
        "expires_at": time.time() + body.get("expires_in", 3600),
        "connected_at": datetime.now(timezone.utc).isoformat(),
    }
    save_tokens(tokens)
    print(f"\n  SUCCESS! Connected to QuickBooks company {realm}.")
    print(f"  Now run: python qb_export.py pull")


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def qb_get(tokens, endpoint, params=None):
    """GET from the QuickBooks API. Returns parsed JSON."""
    realm = tokens["realm_id"]
    url = f"{API_BASE}/{realm}/{endpoint}"
    if params is None:
        params = {}
    params["minorversion"] = MINOR_VERSION

    resp = requests.get(url, params=params, headers={
        "Authorization": f"Bearer {tokens['access_token']}",
        "Accept": "application/json",
    })

    if resp.status_code == 401:
        print(f"  401 on {endpoint} — token may have expired mid-pull. Re-run with: python qb_export.py pull")
        sys.exit(1)
    if resp.status_code != 200:
        print(f"  WARNING: {endpoint} returned {resp.status_code}: {resp.text[:200]}")
        return None

    return resp.json()


def qb_query(tokens, query, max_results=1000):
    """Run a QB query (SELECT ... FROM ...) and page through all results."""
    all_rows = []
    start = 1

    while True:
        paged = f"{query} STARTPOSITION {start} MAXRESULTS {max_results}"
        data = qb_get(tokens, "query", {"query": paged})
        if not data or "QueryResponse" not in data:
            break

        qr = data["QueryResponse"]
        # The key in QueryResponse is the entity name (e.g. "Bill", "Invoice")
        entity_key = [k for k in qr if k not in ("startPosition", "maxResults", "totalCount")]
        if not entity_key:
            break

        rows = qr[entity_key[0]]
        all_rows.extend(rows)

        total = qr.get("totalCount", len(rows))
        if start + max_results > total:
            break
        start += max_results

    return all_rows


def qb_report(tokens, report_name, params=None):
    """Fetch a QB report (e.g. ProfitAndLoss, ProfitAndLossDetail)."""
    return qb_get(tokens, f"reports/{report_name}", params)


# ---------------------------------------------------------------------------
# Data pull
# ---------------------------------------------------------------------------

ENTITIES = [
    # (display name, query, output filename)
    ("Customers (clients + jobs)", "SELECT * FROM Customer", "qb_customers.json"),
    ("Vendors (suppliers + subs)", "SELECT * FROM Vendor", "qb_vendors.json"),
    ("Employees", "SELECT * FROM Employee", "qb_employees.json"),
    ("Accounts (chart of accounts)", "SELECT * FROM Account", "qb_accounts.json"),
    ("Bills (costs paid)", "SELECT * FROM Bill", "qb_bills.json"),
    ("Invoices (billed to clients)", "SELECT * FROM Invoice", "qb_invoices.json"),
    ("Payments (received from clients)", "SELECT * FROM Payment", "qb_payments.json"),
    ("Purchase Orders", "SELECT * FROM PurchaseOrder", "qb_purchase_orders.json"),
    ("Vendor Credits", "SELECT * FROM VendorCredit", "qb_vendor_credits.json"),
    ("Sales Receipts", "SELECT * FROM SalesReceipt", "qb_sales_receipts.json"),
    ("Time Activities (labor hours)", "SELECT * FROM TimeActivity", "qb_time_activities.json"),
    ("Deposits", "SELECT * FROM Deposit", "qb_deposits.json"),
    ("Items (products/services)", "SELECT * FROM Item", "qb_items.json"),
    ("Classes (if used)", "SELECT * FROM Class", "qb_classes.json"),
    ("Departments (if used)", "SELECT * FROM Department", "qb_departments.json"),
]

REPORTS = [
    # (display name, report endpoint, params, output filename)
    ("P&L by Customer", "ProfitAndLoss", {
        "summarize_column_by": "Customers",
        "date_macro": "This Fiscal Year-to-date",
    }, "qb_pnl_by_customer.json"),
    ("P&L Detail by Customer", "ProfitAndLossDetail", {
        "columns": "tx_date,txn_type,doc_num,name,memo,net_amount",
        "date_macro": "This Fiscal Year-to-date",
    }, "qb_pnl_detail.json"),
    ("Balance Sheet", "BalanceSheet", {
        "date_macro": "This Fiscal Year-to-date",
    }, "qb_balance_sheet.json"),
    ("A/R Aging", "AgedReceivableDetail", {}, "qb_ar_aging.json"),
    ("A/P Aging", "AgedPayableDetail", {}, "qb_ap_aging.json"),
]


def do_pull(full=False):
    cid, secret = get_creds()
    tokens = load_tokens()
    tokens = refresh_if_needed(tokens, cid, secret)

    DATA_DIR.mkdir(exist_ok=True)

    print(f"\n  Pulling QuickBooks data for company {tokens['realm_id']}...")
    print(f"  Output directory: {DATA_DIR}/\n")

    # Pull entities
    for name, query, filename in ENTITIES:
        outpath = DATA_DIR / filename
        if not full and outpath.exists():
            age_hrs = (time.time() - outpath.stat().st_mtime) / 3600
            if age_hrs < 1:
                print(f"  SKIP  {name} (cached {age_hrs:.0f}h ago, use --full to re-pull)")
                continue

        print(f"  PULL  {name}...", end="", flush=True)
        try:
            rows = qb_query(tokens, query)
            outpath.write_text(json.dumps(rows, indent=2, default=str))
            print(f" {len(rows)} records")
        except Exception as e:
            print(f" ERROR: {e}")

    # Pull reports
    for name, endpoint, params, filename in REPORTS:
        outpath = DATA_DIR / filename
        if not full and outpath.exists():
            age_hrs = (time.time() - outpath.stat().st_mtime) / 3600
            if age_hrs < 1:
                print(f"  SKIP  {name} (cached)")
                continue

        print(f"  PULL  {name}...", end="", flush=True)
        try:
            data = qb_report(tokens, endpoint, params)
            if data:
                outpath.write_text(json.dumps(data, indent=2, default=str))
                print(" OK")
            else:
                print(" (empty or unavailable)")
        except Exception as e:
            print(f" ERROR: {e}")

    # Pull company info
    print(f"  PULL  Company Info...", end="", flush=True)
    try:
        info = qb_get(tokens, "companyinfo/" + tokens["realm_id"])
        if info:
            (DATA_DIR / "qb_company_info.json").write_text(json.dumps(info, indent=2, default=str))
            company_name = info.get("CompanyInfo", {}).get("CompanyName", "Unknown")
            print(f" {company_name}")
    except Exception as e:
        print(f" ERROR: {e}")

    print(f"\n  Done. All data in {DATA_DIR}/")
    print(f"  Files: {len(list(DATA_DIR.glob('*.json')))}")
    total_mb = sum(f.stat().st_size for f in DATA_DIR.glob("*.json")) / (1024 * 1024)
    print(f"  Total size: {total_mb:.1f} MB")


# ---------------------------------------------------------------------------
# Quick report from local data
# ---------------------------------------------------------------------------

def do_report():
    if not DATA_DIR.exists():
        print("ERROR: No qb_data/ directory. Run: python qb_export.py pull")
        sys.exit(1)

    print("\n  === QuickBooks Data Summary ===\n")

    for fname in sorted(DATA_DIR.glob("*.json")):
        try:
            data = json.loads(fname.read_text())
            if isinstance(data, list):
                print(f"  {fname.name:<35} {len(data):>6} records")
            elif isinstance(data, dict):
                # Reports have nested structure
                print(f"  {fname.name:<35}  report")
        except Exception:
            print(f"  {fname.name:<35}  (parse error)")

    # Customers breakdown
    cust_file = DATA_DIR / "qb_customers.json"
    if cust_file.exists():
        customers = json.loads(cust_file.read_text())
        jobs = [c for c in customers if c.get("Job")]
        parents = [c for c in customers if not c.get("Job")]
        active = [c for c in customers if c.get("Active")]
        print(f"\n  Customers: {len(parents)} clients, {len(jobs)} jobs ({len(active)} active)")

    # Bills + Invoices totals
    for label, fname in [("Bills (cost out)", "qb_bills.json"), ("Invoices (revenue in)", "qb_invoices.json")]:
        fpath = DATA_DIR / fname
        if fpath.exists():
            items = json.loads(fpath.read_text())
            total = sum(float(i.get("TotalAmt", 0)) for i in items)
            print(f"  {label}: {len(items)} records, ${total:,.0f}")

    # Payments received
    pay_file = DATA_DIR / "qb_payments.json"
    if pay_file.exists():
        payments = json.loads(pay_file.read_text())
        total = sum(float(p.get("TotalAmt", 0)) for p in payments)
        print(f"  Payments received: {len(payments)} records, ${total:,.0f}")

    # Employees
    emp_file = DATA_DIR / "qb_employees.json"
    if emp_file.exists():
        employees = json.loads(emp_file.read_text())
        active_emp = [e for e in employees if e.get("Active")]
        print(f"  Employees: {len(active_emp)} active of {len(employees)}")

    # Time activities
    time_file = DATA_DIR / "qb_time_activities.json"
    if time_file.exists():
        activities = json.loads(time_file.read_text())
        total_hrs = sum(
            (a.get("Hours", 0) + a.get("Minutes", 0) / 60)
            for a in activities
        )
        print(f"  Time activities: {len(activities)} entries, {total_hrs:,.0f} hours")

    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1].lower()

    if cmd == "auth":
        do_auth()
    elif cmd == "pull":
        full = "--full" in sys.argv
        do_pull(full=full)
    elif cmd == "report":
        do_report()
    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python qb_export.py [auth|pull|report]")
        sys.exit(1)


if __name__ == "__main__":
    main()
