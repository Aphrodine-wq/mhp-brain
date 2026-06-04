"""QuickBooks Online integration — the actuals path.

The flywheel MHP Brain is missing: bid → ACTUAL cost → catalog correction. Today `actuals` has
8 dirty rows. QuickBooks holds the real job costs (vendor bills, purchases, invoices). This
module pulls them per job and lands them in `actuals` so margin graduates from *bid* to *realized*.

STATUS: structure complete, live calls UNVERIFIED. No QB credentials are wired yet, so the OAuth
refresh + query code below has not been run against a real company. It is written to the Intuit
v3 API spec and is safe — every entry point degrades to a clear "not configured" status instead
of throwing. See QUICKBOOKS_SETUP.md for the 5 things to provide to turn it on.

Stdlib only (urllib) — no SDK dependency.
"""
import base64
import json
import os
import sqlite3
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

DB = Path(__file__).parent / "mhp.db"

CLIENT_ID = os.environ.get("QB_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("QB_CLIENT_SECRET", "")
REALM_ID = os.environ.get("QB_REALM_ID", "")
REFRESH_TOKEN = os.environ.get("QB_REFRESH_TOKEN", "")
QB_ENV = os.environ.get("QB_ENV", "production")

TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
API_BASE = ("https://quickbooks.api.intuit.com" if QB_ENV == "production"
            else "https://sandbox-quickbooks.api.intuit.com")


def status():
    """What's wired and what's missing — drives the admin QB card."""
    missing = [k for k, v in [("QB_CLIENT_ID", CLIENT_ID), ("QB_CLIENT_SECRET", CLIENT_SECRET),
                              ("QB_REALM_ID", REALM_ID), ("QB_REFRESH_TOKEN", REFRESH_TOKEN)] if not v]
    con = sqlite3.connect(DB)
    n_actuals = con.execute("SELECT COUNT(*) FROM actuals").fetchone()[0]
    con.close()
    return {"configured": not missing, "missing": missing, "env": QB_ENV,
            "actuals_rows": n_actuals,
            "note": "Set the missing env vars (see QUICKBOOKS_SETUP.md) to enable sync."
                    if missing else "Ready — run sync_actuals() to pull job costs."}


def _refresh_access_token():
    """Exchange the long-lived refresh token for a short-lived access token (Intuit OAuth2)."""
    if not (CLIENT_ID and CLIENT_SECRET and REFRESH_TOKEN):
        raise RuntimeError("QuickBooks not configured")
    body = urllib.parse.urlencode({"grant_type": "refresh_token",
                                   "refresh_token": REFRESH_TOKEN}).encode()
    auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={
        "Authorization": f"Basic {auth}", "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())["access_token"]


def _query(access_token, sql):
    """Run a QBO SQL query against the company realm."""
    url = f"{API_BASE}/v3/company/{REALM_ID}/query?query={urllib.parse.quote(sql)}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access_token}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read()).get("QueryResponse", {})


def fetch_job_costs(access_token):
    """Sum vendor bills + purchases by customer (= job). Returns {customer_name: total_cost}.

    QBO ties a cost line to a job via the Customer reference on the line's billable detail. This
    aggregates Bill + Purchase line amounts per CustomerRef name. (Invoices give revenue; costs
    come from Bills/Purchases — that's the realized-cost side.)"""
    costs = {}
    for entity in ("Bill", "Purchase"):
        resp = _query(access_token, f"SELECT * FROM {entity} MAXRESULTS 1000")
        for doc in resp.get(entity, []):
            for line in doc.get("Line", []):
                detail = (line.get("AccountBasedExpenseLineDetail")
                          or line.get("ItemBasedExpenseLineDetail") or {})
                cust = (detail.get("CustomerRef") or {}).get("name")
                amt = line.get("Amount") or 0
                if cust:
                    costs[cust] = costs.get(cust, 0) + amt
    return costs


def _match_project(con, customer_name):
    """Best-effort map a QB customer name to a project slug. Exact name first, then loose."""
    norm = customer_name.strip().lower()
    rows = con.execute("SELECT id, name FROM projects").fetchall()
    for pid, name in rows:
        if (name or "").strip().lower() == norm:
            return pid, name
    # loose: customer name is a token-subset of the project name (e.g. "Eaton" -> "Jim ... Eaton")
    key = norm.split()[-1] if norm else ""
    for pid, name in rows:
        if key and key in (name or "").lower():
            return pid, name
    return None, None


def sync_actuals(commit=False, actor="quickbooks"):
    """Pull realized job costs from QB into `actuals`. With commit=False (default) it returns a
    PREVIEW of matched rows and writes nothing — review before trusting the QB→project mapping."""
    st = status()
    if not st["configured"]:
        return {"ok": False, "error": "not configured", "missing": st["missing"]}
    try:
        token = _refresh_access_token()
        costs = fetch_job_costs(token)
    except Exception as e:                          # network/auth/parse — never crash the admin UI
        return {"ok": False, "error": f"QB call failed: {e}"}

    con = sqlite3.connect(DB)
    matched, unmatched = [], []
    for cust, total in sorted(costs.items(), key=lambda x: -x[1]):
        pid, name = _match_project(con, cust)
        (matched if pid else unmatched).append(
            {"customer": cust, "project_id": pid, "project": name, "actual": round(total, 2)})

    written = 0
    if commit:
        ts = datetime.now().isoformat(timespec="seconds")
        for m in matched:
            con.execute("INSERT INTO actuals(project_id, source_file, closing_total) VALUES(?,?,?)",
                        (m["project_id"], f"quickbooks:{QB_ENV}:{ts}", m["actual"]))
            written += 1
        con.commit()
    con.close()
    return {"ok": True, "committed": commit, "written": written,
            "matched": matched, "unmatched": unmatched,
            "summary": f"{len(matched)} matched, {len(unmatched)} unmatched"
                       + (f", {written} written" if commit else " (preview only)")}


if __name__ == "__main__":
    print(json.dumps(status(), indent=2))
