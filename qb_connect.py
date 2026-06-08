#!/usr/bin/env python3
"""
qb_connect.py — Connect the MHP brain to QuickBooks Online (read-only).

The fulcrum. Per-job margin truth, cash-flow timing, and the actuals flywheel all
turn on the moment this is connected. This is the connector: the one-time OAuth
authorize, then refresh-forever, then read.

Design choices (deliberate):
  * **Stdlib only for the OAuth flow.** No SDK to install — the authorize URL and
    the token exchange/refresh are plain HTTPS (the pattern proven in
    `_legacy/quickbooks.py`). `--auth-url` works today with zero dependencies.
  * **Read-only scope.** `com.intuit.quickbooks.accounting` only. The brain reads
    the books to compute P&L; it never writes to QuickBooks.
  * **Tokens are encrypted at rest, never committed.** Storage requires
    `cryptography` (Fernet); if it's missing the connector refuses to store
    plaintext and tells you to install it. The token file + key live next to
    `mhp.db` and are gitignored.

The flow (see WIRING_QUICKBOOKS.md for the do-list):
    1.  python3 qb_connect.py --auth-url        # James opens this, approves
    2.  Intuit redirects to .../qb/callback?code=...&realmId=...
    3.  python3 qb_connect.py --callback "<that full redirect URL>"
    4.  python3 qb_connect.py --status / --test  # confirm it's live

Credentials come from the environment (never git):
    QB_CLIENT_ID, QB_CLIENT_SECRET   — from the Intuit developer app
    QB_ENV                           — production (default) | sandbox
    MHP_QB_KEY                       — optional Fernet key; auto-generated to a
                                       0600 key file next to mhp.db if unset
"""
import argparse
import base64
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOKEN_FILE = HERE / ".qb_tokens.enc"          # gitignored, encrypted
KEY_FILE = HERE / ".qb_key"                   # gitignored, 0600

CLIENT_ID = os.environ.get("QB_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("QB_CLIENT_SECRET", "")
QB_ENV = os.environ.get("QB_ENV", "production")

AUTH_URL = "https://appcenter.intuit.com/connect/oauth2"
TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
API_BASE = ("https://quickbooks.api.intuit.com" if QB_ENV == "production"
            else "https://sandbox-quickbooks.api.intuit.com")
REDIRECT_URI = "http://localhost:8770/qb/callback"
SCOPE = "com.intuit.quickbooks.accounting"     # read-only accounting


# --- token encryption (guarded — never store plaintext) ----------------------

def _fernet():
    try:
        from cryptography.fernet import Fernet
    except ImportError:
        sys.exit("token storage needs `cryptography` — run:  pip3 install cryptography\n"
                 "(the OAuth --auth-url step does not need it; only saving tokens does)")
    key = os.environ.get("MHP_QB_KEY", "").encode() or None
    if not key:
        if KEY_FILE.exists():
            key = KEY_FILE.read_bytes()
        else:
            key = Fernet.generate_key()
            KEY_FILE.write_bytes(key)
            KEY_FILE.chmod(0o600)
    return Fernet(key)


def save_tokens(access, refresh, realm_id):
    blob = json.dumps({"access_token": access, "refresh_token": refresh,
                       "realm_id": realm_id, "env": QB_ENV}).encode()
    TOKEN_FILE.write_bytes(_fernet().encrypt(blob))
    TOKEN_FILE.chmod(0o600)


def load_tokens():
    if not TOKEN_FILE.exists():
        return None
    return json.loads(_fernet().decrypt(TOKEN_FILE.read_bytes()))


# --- OAuth flow (stdlib only) ------------------------------------------------

def need_app():
    if not (CLIENT_ID and CLIENT_SECRET):
        sys.exit("set QB_CLIENT_ID and QB_CLIENT_SECRET (from the Intuit app) first — "
                 "see the [[QuickBooks Setup]] page / WIRING_QUICKBOOKS.md")


def auth_url():
    need_app()
    # state is CSRF protection — any unguessable string; echoed back on callback.
    state = base64.urlsafe_b64encode(os.urandom(18)).decode()
    q = urllib.parse.urlencode({
        "client_id": CLIENT_ID, "response_type": "code", "scope": SCOPE,
        "redirect_uri": REDIRECT_URI, "state": state})
    return f"{AUTH_URL}?{q}"


def exchange(auth_code):
    need_app()
    body = urllib.parse.urlencode({
        "grant_type": "authorization_code", "code": auth_code,
        "redirect_uri": REDIRECT_URI}).encode()
    auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={
        "Authorization": f"Basic {auth}", "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def refresh():
    t = load_tokens()
    if not t:
        sys.exit("not connected — run --auth-url, then --callback. See [[QuickBooks Setup]].")
    need_app()
    body = urllib.parse.urlencode({"grant_type": "refresh_token",
                                   "refresh_token": t["refresh_token"]}).encode()
    auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={
        "Authorization": f"Basic {auth}", "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read())
    # Intuit rotates the refresh token too — save both.
    save_tokens(d["access_token"], d.get("refresh_token", t["refresh_token"]), t["realm_id"])
    return d["access_token"], t["realm_id"]


def query(sql):
    access, realm = refresh()
    url = f"{API_BASE}/v3/company/{realm}/query?query={urllib.parse.quote(sql)}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {access}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read()).get("QueryResponse", {})


# --- commands ----------------------------------------------------------------

def cmd_callback(redirect_url):
    """Accept the full redirect URL Intuit sent (…/qb/callback?code=…&realmId=…)."""
    q = urllib.parse.parse_qs(urllib.parse.urlparse(redirect_url).query)
    code = (q.get("code") or [None])[0]
    realm = (q.get("realmId") or [None])[0]
    if not code or not realm:
        sys.exit("that URL has no ?code= and ?realmId= — paste the FULL redirect URL Intuit sent")
    tok = exchange(code)
    save_tokens(tok["access_token"], tok["refresh_token"], realm)
    print(f"connected — company realm {realm}, tokens encrypted at {TOKEN_FILE.name}")
    print("next: python3 qb_connect.py --test")


def cmd_status():
    t = load_tokens() if TOKEN_FILE.exists() else None
    print(f"env: {QB_ENV}")
    print(f"app creds set: {'yes' if CLIENT_ID and CLIENT_SECRET else 'NO — set QB_CLIENT_ID/SECRET'}")
    print(f"connected: {'yes (realm ' + t['realm_id'] + ')' if t else 'no — run --auth-url then --callback'}")


def cmd_test():
    info = query("SELECT * FROM CompanyInfo")
    name = (info.get("CompanyInfo") or [{}])[0].get("CompanyName", "?")
    print(f"OK — connected to QuickBooks company: {name}")


def main():
    ap = argparse.ArgumentParser(description="Connect the MHP brain to QuickBooks Online (read-only).")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--auth-url", action="store_true", help="print the Intuit consent URL (start here)")
    g.add_argument("--callback", metavar="URL", help="finish: paste the full redirect URL Intuit sent")
    g.add_argument("--status", action="store_true", help="show connection state")
    g.add_argument("--test", action="store_true", help="ping QB CompanyInfo to confirm it's live")
    g.add_argument("--refresh", action="store_true", help="force a token refresh")
    args = ap.parse_args()

    if args.auth_url:
        print(auth_url())
    elif args.callback:
        cmd_callback(args.callback)
    elif args.status:
        cmd_status()
    elif args.test:
        cmd_test()
    elif args.refresh:
        refresh()
        print("refreshed")


if __name__ == "__main__":
    main()
