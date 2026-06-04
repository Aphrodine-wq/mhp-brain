"""MHP Estimator — web app.

Estimators describe a job (+ upload docs), the engine seeds an estimate from the catalog,
they edit every line live, then export a native MHP .xlsx. Zero-install: Python stdlib only.

Run:  python3 app.py   ->  open http://localhost:8770
"""
import csv
import json
import sqlite3
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from estimate import load_catalog, write_xlsx, DEFAULT_MARKUP
from normalize import canon
from parse_job import parse_job_text, qty_for

import admin
import attention
import board
import quickbooks

DB = Path(__file__).parent / "mhp.db"
PORT = 8770


def catalog():
    con = sqlite3.connect(DB)
    unit, lump = load_catalog(con)
    con.close()
    return unit, lump


def build_lines(descriptions, detected):
    """Attach catalog rate/unit/band; seed qty from each line's real unit (None = estimator fills)."""
    unit, lump = catalog()
    out = []
    for desc in descriptions:
        cd = canon(desc)
        h, kind = unit.get(cd), "unit"
        if not h:
            h, kind = lump.get(cd), "lump"
        if not h:
            out.append({"description": desc, "qty": None, "rate": None, "unit": "?",
                        "division": "", "item_no": "", "jobs": 0, "p25": None, "p75": None,
                        "kind": "missing"})
            continue
        u = h.get("unit", "lump") if kind == "unit" else "lump"
        out.append({"description": desc, "qty": qty_for(u, desc, detected), "rate": h["median"],
                    "unit": u, "division": h["division"] or "", "item_no": h["item_no"] or "",
                    "jobs": h["jobs"], "p25": h["p25"], "p75": h["p75"], "kind": kind})
    return out


def catalog_list():
    unit, lump = catalog()
    rows = []
    for cd, h in {**lump, **unit}.items():
        rows.append({"description": h.get("desc") or cd, "rate": h["median"],
                     "unit": h.get("unit", "lump"), "division": h["division"] or "",
                     "item_no": h["item_no"] or "", "jobs": h["jobs"]})
    # use display description from catalog table
    con = sqlite3.connect(DB)
    disp = {}
    for d, in con.execute("SELECT DISTINCT description FROM unit_costs"):
        disp[canon(d)] = d
    for d, in con.execute("SELECT DISTINCT description FROM lump_costs"):
        disp.setdefault(canon(d), d)
    con.close()
    for r in rows:
        r["description"] = disp.get(canon(r["description"]), r["description"])
    return sorted(rows, key=lambda x: (-x["jobs"]))


STATUS_ORDER = "CASE status WHEN 'Active' THEN 0 WHEN 'Aging' THEN 1 WHEN 'Bid' THEN 2 " \
               "WHEN 'Paused' THEN 3 WHEN 'Likely Done' THEN 4 WHEN 'Unknown' THEN 5 ELSE 6 END"


def project_value(ests):
    """Current bid = the LATEST-dated estimate with a non-zero total (not the biggest revision).
    ests: list of (sum_sov_total, est_date). Falls back to max if no dates."""
    priced = [(sov, d or "") for sov, d in ests if sov and sov > 0]
    if not priced:
        return 0
    dated = [x for x in priced if x[1]]
    if dated:
        return max(dated, key=lambda x: x[1])[0]
    return max(p[0] for p in priced)


def projects_list():
    """Each project with refined status, last activity, and its CURRENT estimate.
    Admin overrides (status/market/type) are overlaid on the parsed base values."""
    con = sqlite3.connect(DB)
    admin.ensure_tables(con)
    pov = admin.overlay(con, "project")
    prows = con.execute("SELECT id,name,type,status,market,last_activity FROM projects").fetchall()
    out = []
    for pid, name, typ, status, market, la in prows:
        status = pov.get((pid, "status"), status)
        market = pov.get((pid, "market"), market)
        typ = pov.get((pid, "type"), typ)
        ests = con.execute("""SELECT sum_sov_total,est_date FROM estimates
            WHERE project_id=? AND parse_confidence!='FAILED'""", (pid,)).fetchall()
        out.append({"id": pid, "name": name, "type": typ or "", "status": status,
                    "market": market or "", "last": la or "",
                    "value": round(project_value(ests)), "estimates": len(ests)})
    con.close()
    rank = {"Active": 0, "Aging": 1, "Bid": 2, "Paused": 3, "Likely Done": 4, "Unknown": 5, "Dead": 6}
    out.sort(key=lambda p: (rank.get(p["status"], 9), -p["value"]))
    return out


def subs_list():
    con = sqlite3.connect(DB)
    try:
        rows = con.execute("SELECT name,trade,phone,jobs,projects,source FROM subs "
                           "ORDER BY jobs DESC, name").fetchall()
    except sqlite3.OperationalError:
        con.close()
        return []
    con.close()
    return [{"name": n, "trade": t or "", "phone": p or "", "jobs": j,
             "projects": pr or "", "source": s or ""} for n, t, p, j, pr, s in rows]


def crew_list():
    con = sqlite3.connect(DB)
    try:
        rows = con.execute("SELECT name,role,rate,phone,email FROM crew").fetchall()
    except sqlite3.OperationalError:
        rows = []
    con.close()
    return [{"name": n, "role": r, "rate": ra, "phone": p, "email": e} for n, r, ra, p, e in rows]


def _has(con, t):
    return con.execute("SELECT COUNT(*) FROM sqlite_master WHERE name=?", (t,)).fetchone()[0]


def live_data():
    """Pulse — the Living Job view: forward look on active jobs from the data we have today.
    Pricing position vs MHP's own norm, risk flags, and a derived priority feed.
    (Live margin forecast activates when actual-cost/invoice data connects.)"""
    from estimate import load_catalog
    con = sqlite3.connect(DB)
    unit, _ = load_catalog(con)
    STALE = "2026-02"  # last activity older than this on an 'active' job is a flag

    def latest_priced(pid):
        ests = con.execute("""SELECT id,sum_sov_total,est_date FROM estimates
            WHERE project_id=? AND parse_confidence!='FAILED'""", (pid,)).fetchall()
        priced = [(e, s, d) for e, s, d in ests if s and s > 0]
        if not priced:
            return None, 0, "", 0
        dated = [x for x in priced if x[2] and "-00-00" not in x[2]]
        pick = max(dated, key=lambda x: x[2]) if dated else max(priced, key=lambda x: x[1])
        return pick[0], pick[1], pick[2], len(priced)

    def pricing_delta(eid):
        # only compare a line when its unit matches the catalog's dominant unit (apples-to-apples),
        # and clamp per-line deviation so one fat-fingered cell can't dominate the blend.
        rows = con.execute("""SELECT canon_desc,qty,unit_price,norm_unit FROM line_items
            WHERE estimate_id=? AND price_kind='UNIT_RATE' AND qty>0 AND unit_price>0""", (eid,)).fetchall()
        num = den = 0
        for cd, qty, up, nu in rows:
            h = unit.get(cd)
            if h and h["median"] and (h.get("unit") or "") == (nu or ""):
                dev = max(-0.5, min(0.5, (up - h["median"]) / h["median"]))
                w = qty * h["median"]
                num += w * dev; den += w
        return (num / den) if den else None

    jobs, priorities = [], []
    rows = con.execute("SELECT id,name,status,market,last_activity FROM projects "
                       "WHERE status IN ('Active','Aging','Bid')").fetchall()
    for pid, name, status, market, la in rows:
        eid, value, edate, revs = latest_priced(pid)
        delta = pricing_delta(eid) if eid else None
        flags = []
        if status in ("Active", "Aging") and value == 0:
            flags.append(["red", "No priced estimate on file"])
            if status == "Active":   # only nag to price truly-active jobs
                priorities.append(["red", f"{name}: no estimate on file — price it"])
        # aging jobs aren't worked — they're verified. that's their only priority.
        if status == "Aging":
            priorities.append(["amber", f"{name}: quiet since {la or '?'} — still active, or close it out?"])
        if delta is not None and delta < -0.04:
            lvl = "red" if delta < -0.10 else "amber"
            flags.append([lvl, f"Priced {abs(delta)*100:.0f}% below your norm — margin risk"])
            if lvl == "red" and status == "Active":
                priorities.append(["red", f"{name}: bid {abs(delta)*100:.0f}% under your historical pricing — check margin"])
        if delta is not None and delta > 0.08:
            flags.append(["green", f"Priced {delta*100:.0f}% above norm — healthy cushion"])
        if revs >= 5:
            flags.append(["amber", f"{revs} estimate revisions — scope still moving"])
        if status == "Bid":
            priorities.append(["blue", f"{name}: bid out, not signed — follow up"])
        levels = [f[0] for f in flags]
        health = "red" if "red" in levels else ("amber" if "amber" in levels else "green")
        if status == "Active":   # health cards are truly-active only; aging shows up as a 'confirm' priority
            jobs.append({"name": name, "status": status, "market": market or "", "last": la or "",
                         "value": round(value), "delta": round(delta * 100) if delta is not None else None,
                         "revisions": revs, "flags": flags, "health": health})
    con.close()
    order = {"red": 0, "amber": 1, "green": 2}
    jobs.sort(key=lambda j: (order[j["health"]], -j["value"]))
    priorities.sort(key=lambda p: order.get(p[0], 3))
    return {"jobs": jobs, "priorities": priorities}


def stats():
    con = sqlite3.connect(DB)
    g = lambda q: con.execute(q).fetchone()[0]
    # active book value = sum of each active project's CURRENT (latest) estimate
    active_val = sum(p["value"] for p in projects_list() if p["status"] == "Active")
    s = {"active": g("SELECT COUNT(*) FROM projects WHERE status='Active'"),
         "active_value": round(active_val or 0),
         "aging": g("SELECT COUNT(*) FROM projects WHERE status='Aging'"),
         "bid": g("SELECT COUNT(*) FROM projects WHERE status='Bid'"),
         "paused": g("SELECT COUNT(*) FROM projects WHERE status='Paused'"),
         "projects": g("SELECT COUNT(*) FROM projects"),
         "line_items": g("SELECT COUNT(*) FROM line_items"),
         "subs": g("SELECT COUNT(*) FROM subs") if _has(con, "subs") else 0,
         "crew": g("SELECT COUNT(*) FROM crew") if _has(con, "crew") else 0}
    con.close()
    return s


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json"):
        b = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/":
            self._send(200, PAGE, "text/html; charset=utf-8")
        elif self.path == "/api/catalog":
            self._send(200, json.dumps(catalog_list()))
        elif self.path == "/api/projects":
            self._send(200, json.dumps(projects_list()))
        elif self.path == "/api/subs":
            self._send(200, json.dumps(subs_list()))
        elif self.path == "/api/crew":
            self._send(200, json.dumps(crew_list()))
        elif self.path == "/api/live":
            self._send(200, json.dumps(live_data()))
        elif self.path == "/api/stats":
            self._send(200, json.dumps(stats()))
        elif self.path == "/api/admin/board":
            self._send(200, json.dumps(board.board_data()))
        elif self.path == "/api/admin/attention":
            self._send(200, json.dumps(attention.attention_items()))
        elif self.path == "/api/admin/audit":
            self._send(200, json.dumps(admin.recent_audit()))
        elif self.path == "/api/admin/qb-status":
            self._send(200, json.dumps(quickbooks.status()))
        elif self.path.lstrip("/") in {"logo.svg", "logo-light.png", "logo.png"}:
            name = self.path.lstrip("/")
            ctype = "image/svg+xml" if name.endswith(".svg") else "image/png"
            self._send(200, (Path(__file__).parent / "assets" / name).read_bytes(), ctype)
        else:
            self._send(404, "{}")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        data = json.loads(self.rfile.read(n) or "{}")
        if self.path == "/api/estimate":
            text = data.get("description", "")
            for doc in data.get("docs", []):
                if doc.get("text"):
                    text += "\n" + doc["text"]
            descriptions, detected, notes = parse_job_text(text)
            lines = build_lines(descriptions, detected)
            self._send(200, json.dumps({"lines": lines, "notes": notes,
                                        "markup": round((DEFAULT_MARKUP - 1) * 100)}))
        elif self.path == "/api/export":
            lines = [{"description": l["description"], "qty": float(l["qty"] or 0),
                      "rate": float(l["rate"] or 0)} for l in data.get("lines", [])
                     if l.get("qty") and l.get("rate")]
            tmp = Path(tempfile.gettempdir()) / "mhp_estimate.xlsx"
            write_xlsx(lines, tmp)
            self._send(200, tmp.read_bytes(),
                       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        elif self.path == "/api/admin/override":
            r = admin.set_override(data.get("entity_type"), data.get("entity_id"),
                                   data.get("field"), data.get("value"))
            self._send(200 if r.get("ok") else 400, json.dumps(r))
        elif self.path == "/api/admin/dismiss":
            r = admin.set_override("flag", data.get("flag_id"), "dismissed",
                                   "false" if data.get("undo") else "true")
            self._send(200 if r.get("ok") else 400, json.dumps(r))
        elif self.path == "/api/admin/qb-sync":
            self._send(200, json.dumps(quickbooks.sync_actuals(commit=bool(data.get("commit")))))
        else:
            self._send(404, "{}")


PAGE = r"""<!doctype html><html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>MHP Estimator</title>
<link rel=preconnect href=https://fonts.googleapis.com>
<link rel=preconnect href=https://fonts.gstatic.com crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel=stylesheet>
<style>
:root{--paper:#fbfaf6;--ink:#111418;--muted:#5b6470;--line:#d8dde3;--navy:#0b3d91;
  --navy-d:#082a66;--blue:#0051b8;--card:#fff;--warn:#b4541f;
  --sans:'Inter',-apple-system,Segoe UI,Roboto,sans-serif;--disp:'Inter',-apple-system,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
  -webkit-font-smoothing:antialiased;font-size:15px;line-height:1.5}
header{background:#fff;border-bottom:1px solid var(--line);padding:18px 32px;display:flex;
  align-items:center;gap:16px;box-shadow:0 1px 0 rgba(17,20,24,.02)}
header img{height:44px;width:auto;display:block}
header .wm{font-family:var(--disp);font-weight:600;font-size:22px;letter-spacing:.2px;
  border-left:1px solid var(--line);padding-left:16px;color:var(--ink)}
header .tag{margin-left:auto;color:var(--muted);font-size:13px;font-weight:500}
.wrap{max-width:1080px;margin:0 auto;padding:36px 24px}
h2{font-family:var(--disp);font-weight:600;font-size:30px;letter-spacing:-.3px;margin:0 0 6px}
.sub{color:var(--muted);font-size:15px;margin-bottom:22px;max-width:680px}
textarea{display:block;width:100%;min-height:170px;padding:16px;border:1px solid var(--line);
  border-radius:10px;background:var(--card);font-family:var(--sans);font-size:15px;resize:vertical;
  color:var(--ink);box-shadow:0 1px 2px rgba(17,20,24,.04)}
textarea:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px rgba(11,61,145,.12)}
.upload{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:16px;padding:16px 20px;
  border:1.5px dashed var(--line);border-radius:10px;background:var(--card)}
.upload-h{font-size:14px;color:var(--muted);font-weight:500}
.upload-h span{opacity:.65}
.upload input[type=file]{font-family:var(--sans);font-size:13px;color:var(--muted)}
.upload input[type=file]::file-selector-button{font-family:var(--sans);font-weight:600;font-size:13px;
  padding:9px 16px;margin-right:12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);
  color:var(--navy);cursor:pointer;transition:border-color .15s,background .15s}
.upload input[type=file]::file-selector-button:hover{border-color:var(--navy);background:#fff}
.btn{background:var(--navy);color:#fff;border:0;padding:14px 28px;font-size:15px;font-weight:600;
  font-family:var(--sans);cursor:pointer;border-radius:9px;box-shadow:0 1px 2px rgba(8,42,102,.25);
  transition:background .15s}
.btn:hover{background:var(--navy-d)}
.btn.ghost{background:#fff;color:var(--navy);border:1px solid var(--line);box-shadow:none}
.btn.ghost:hover{border-color:var(--navy);background:var(--paper)}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:18px}
#load{display:none;text-align:center;padding:80px}
.spin{width:48px;height:48px;border:4px solid var(--line);border-top-color:var(--navy);
  border-radius:50%;animation:s .9s linear infinite;margin:0 auto 20px}
#load div:last-child{font-family:var(--disp);font-size:18px;color:var(--muted)}
@keyframes s{to{transform:rotate(360deg)}}
#result{display:none}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;
  box-shadow:0 1px 3px rgba(17,20,24,.06),0 1px 2px rgba(17,20,24,.04)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left}
th{background:var(--paper);font-size:11px;text-transform:uppercase;letter-spacing:.6px;
  color:var(--muted);font-weight:700}
tbody tr:hover{background:#fcfbf8}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
input.cell{width:92px;padding:7px 8px;border:1px solid var(--line);border-radius:7px;text-align:right;
  font-family:var(--sans);font-variant-numeric:tabular-nums;font-size:14px}
input.cell:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 2px rgba(11,61,145,.12)}
.div td{background:#eef3fb;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.6px;
  color:var(--navy);border-bottom:1px solid #dde6f4}
.tot{display:flex;justify-content:flex-end;gap:44px;padding:20px 4px 4px;font-size:15px;color:var(--muted)}
.tot b{display:block;font-family:var(--disp);font-size:24px;color:var(--ink);font-weight:600;margin-top:2px}
.x{color:var(--warn);cursor:pointer;font-weight:700;border:0;background:0;font-size:16px}
.notes{background:#fff8ef;border:1px solid #efe0c9;padding:12px 16px;border-radius:10px;
  font-size:13px;margin:0 0 18px;color:#6b5a3a}
.add{display:flex;gap:10px;margin:18px 0;align-items:center}
select,input.mk{padding:9px 10px;border:1px solid var(--line);border-radius:8px;font-family:var(--sans);
  font-size:14px;background:#fff}
.miss td{color:var(--warn)}
small.j{color:var(--muted);font-size:11px}
/* app shell */
.app{display:flex;min-height:100vh}
.sidebar{width:200px;flex-shrink:0;background:#16263c;color:#fff;display:flex;flex-direction:column;
  position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:9px;padding:18px 16px 15px;border-bottom:1px solid rgba(255,255,255,.1)}
.brand img{height:28px;width:auto}
.brand span{font-family:var(--disp);font-weight:600;font-size:17px;color:#fff}
.sidebar nav{padding:12px 10px;display:flex;flex-direction:column;gap:2px;flex:1}
.nav{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;color:rgba(255,255,255,.72);
  font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;transition:background .12s,color .12s}
.nav:hover{background:rgba(255,255,255,.06);color:#fff}
.nav.active{background:rgba(255,255,255,.12);color:#fff}
.nav svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;flex-shrink:0}
.nav-sep{height:1px;background:rgba(255,255,255,.1);margin:8px 6px}
.side-foot{padding:18px 20px;font-size:11px;color:rgba(255,255,255,.4);border-top:1px solid rgba(255,255,255,.1);
  line-height:1.5}
.profile{display:flex;align-items:center;gap:11px;padding:16px 18px;border-top:1px solid rgba(255,255,255,.1);
  cursor:pointer;transition:background .12s}
.profile:hover{background:rgba(255,255,255,.06)}
.avatar{width:38px;height:38px;border-radius:50%;background:#33557e;color:#fff;display:flex;
  align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}
.pname{font-size:14px;font-weight:600;color:#fff}
.prole{font-size:11px;color:rgba(255,255,255,.55);margin-top:1px}
/* dashboard */
.cols{display:grid;grid-template-columns:1.4fr 1fr;gap:22px;margin-top:8px}
@media(max-width:900px){.cols{grid-template-columns:1fr}}
.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;
  box-shadow:0 1px 2px rgba(17,20,24,.04)}
.panel h3{font-family:var(--disp);font-size:17px;font-weight:600;margin:0;padding:16px 20px;
  border-bottom:1px solid var(--line)}
.prow{display:flex;align-items:center;gap:12px;padding:13px 20px;border-bottom:1px solid var(--line);font-size:14px}
.prow:last-child{border-bottom:0}
.prow .pn{flex:1;font-weight:500}.prow .pv{font-variant-numeric:tabular-nums;color:var(--muted)}
.prow:hover{background:#fcfbf8}
.attn{display:flex;gap:10px;align-items:flex-start;padding:13px 20px;border-bottom:1px solid var(--line);font-size:13px}
.attn:last-child{border-bottom:0}
.dot{width:8px;height:8px;border-radius:50%;margin-top:5px;flex-shrink:0}
.dot.amber{background:#d99a2b}.dot.blue{background:var(--blue)}.dot.grey{background:#9aa0a8}
/* simpler project-forward home */
.stat-strip{display:flex;gap:44px;margin:26px 0 4px;padding:20px 2px;border-top:1px solid var(--line);
  border-bottom:1px solid var(--line)}
.stat-strip .sv{font-family:var(--disp);font-size:27px;font-weight:600;line-height:1}
.stat-strip .sk{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px;margin-top:7px}
.sec-h{font-family:var(--disp);font-size:18px;font-weight:600;margin:30px 0 0}
.proj-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(288px,1fr));gap:16px;margin-top:16px}
.pcard{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;cursor:pointer;
  box-shadow:0 1px 2px rgba(17,20,24,.04);transition:border-color .15s,box-shadow .15s,transform .15s}
.pcard:hover{border-color:var(--navy);box-shadow:0 6px 18px rgba(17,20,24,.09);transform:translateY(-1px)}
.pcard .pc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:16px}
.pcard .pc-name{font-weight:600;font-size:15px;line-height:1.3}
.pcard .pc-val{font-family:var(--disp);font-size:29px;font-weight:600;color:var(--ink);line-height:1}
.pcard .pc-meta{color:var(--muted);font-size:12.5px;margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pcard .pc-meta .pdot{width:3px;height:3px;border-radius:50%;background:var(--muted);opacity:.5}
.morelink{margin-top:26px;color:var(--muted);font-size:14px}
.morelink a{color:var(--navy);font-weight:600;cursor:pointer;text-decoration:none}
.morelink a:hover{text-decoration:underline}
/* pulse / living jobs */
.banner{background:#eef3fb;border:1px solid #d6e2f4;border-radius:12px;padding:14px 18px;margin:18px 0 6px;
  font-size:13.5px;color:var(--navy);display:flex;gap:10px;align-items:center}
.banner b{color:var(--navy)}
.prio-panel{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;
  box-shadow:0 1px 2px rgba(17,20,24,.04);margin-bottom:26px}
.prio-panel h3{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);
  margin:0;padding:14px 18px;border-bottom:1px solid var(--line)}
.prio{display:flex;gap:11px;align-items:center;padding:11px 18px;border-bottom:1px solid var(--line);font-size:14px}
.prio:last-child{border-bottom:0}.prio:hover{background:#fcfbf8}
.living-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(335px,1fr));gap:16px;margin-top:8px}
.living{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:12px;
  padding:18px 20px;box-shadow:0 1px 2px rgba(17,20,24,.04)}
.living.red{border-left-color:#c0392b}.living.amber{border-left-color:#d99a2b}.living.green{border-left-color:#2f9e44}
.living-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.living .lname{font-weight:600;font-size:15px;line-height:1.3}
.living .lval{font-weight:700;font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.living .lmeta{color:var(--muted);font-size:12.5px;margin:6px 0 14px}
.gauge{margin:12px 0}
.gauge-lab{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:5px}
.gauge-bar{height:7px;background:#edeef1;border-radius:4px;position:relative}
.gauge-mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:#c4c8cd}
.gauge-fill{position:absolute;top:0;bottom:0;border-radius:4px}
.flag{display:flex;gap:9px;align-items:flex-start;font-size:13px;padding:5px 0;color:var(--ink)}
.flag .fdot{width:7px;height:7px;border-radius:50%;margin-top:5px;flex-shrink:0}
.fdot.red{background:#c0392b}.fdot.amber{background:#d99a2b}.fdot.green{background:#2f9e44}.fdot.blue{background:var(--blue)}
.forecast{margin-top:14px;padding-top:13px;border-top:1px dashed var(--line);font-size:12.5px;color:var(--muted)}
.forecast b{color:var(--ink)}
/* crew cards */
.crew-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:22px}
.crew-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;
  box-shadow:0 1px 2px rgba(17,20,24,.04)}
.crew-top{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.crew-av{width:46px;height:46px;border-radius:50%;background:var(--navy);color:#fff;display:flex;
  align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0}
.crew-card .cn{font-weight:700;font-size:15px}
.crew-card .cr{color:var(--muted);font-size:12px;margin-top:2px}
.crew-meta{font-size:13px;color:var(--ink)}
.crew-meta div{padding:4px 0;border-top:1px solid var(--line);color:var(--muted)}
.crew-meta a{color:var(--navy);text-decoration:none}
.crew-rate{display:inline-block;margin-top:10px;padding:4px 12px;background:var(--paper);border:1px solid var(--line);
  border-radius:20px;font-weight:700;font-size:13px;color:var(--ink)}
/* live preview */
.est-layout{display:grid;grid-template-columns:1fr 300px;gap:24px;align-items:start}
@media(max-width:1100px){.est-layout{grid-template-columns:1fr}}
.preview{position:sticky;top:24px;background:var(--card);border:1px solid var(--line);border-radius:12px;
  box-shadow:0 1px 3px rgba(17,20,24,.06);overflow:hidden}
.preview h3{font-family:var(--disp);font-size:16px;margin:0;padding:14px 18px;border-bottom:1px solid var(--line);
  display:flex;align-items:center;gap:8px}
.preview .live{width:7px;height:7px;border-radius:50%;background:#2f9e44;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.pv-body{padding:8px 18px 16px}
.pv-div{display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid var(--line);color:var(--muted)}
.pv-div b{color:var(--ink);font-variant-numeric:tabular-nums;font-weight:600}
.pv-tot{padding:14px 18px;background:var(--paper);border-top:1px solid var(--line)}
.pv-line{display:flex;justify-content:space-between;font-size:13px;color:var(--muted);padding:3px 0}
.pv-bid{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;padding-top:10px;
  border-top:1px solid var(--line)}
.pv-bid b{font-family:var(--disp);font-size:26px;color:var(--navy);font-weight:600}
/* settings */
.setrow{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--line)}
.setrow:last-child{border-bottom:0}
.setrow .sl{font-weight:500}.setrow .sd{color:var(--muted);font-size:13px;margin-top:2px}
.setrow input,.setrow select{padding:8px 12px;border:1px solid var(--line);border-radius:8px;font-family:var(--sans)}
.toggle{width:44px;height:24px;border-radius:20px;background:var(--line);position:relative;cursor:pointer;transition:background .15s}
.toggle.on{background:var(--navy)}
.toggle::after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;top:3px;left:3px;transition:left .15s}
.toggle.on::after{left:23px}
main.wrap{flex:1;max-width:none;margin:0;padding:40px 48px}
.view-inner{max-width:1080px;margin:0 auto}
/* home stats */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:24px 0 32px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px;
  box-shadow:0 1px 2px rgba(17,20,24,.04)}
.stat .v{font-family:var(--disp);font-size:34px;font-weight:600;color:var(--ink);line-height:1.1}
.stat .k{color:var(--muted);font-size:13px;margin-top:6px;text-transform:uppercase;letter-spacing:.5px}
/* data tables */
.dtable{width:100%;border-collapse:collapse;font-size:14px}
.dtable th,.dtable td{border-bottom:1px solid var(--line);padding:11px 14px;text-align:left}
.dtable th{background:var(--paper);font-size:11px;text-transform:uppercase;letter-spacing:.6px;
  color:var(--muted);font-weight:700}
.dtable td.n,.dtable th.n{text-align:right;font-variant-numeric:tabular-nums}
.dtable tbody tr:hover{background:#fcfbf8}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;
  text-transform:uppercase;letter-spacing:.4px}
.badge.active{background:#e3f1e4;color:#2f6b34}
.badge.aging{background:#fbf0d9;color:#946a18}
.badge.bid{background:#e3ecfa;color:var(--navy)}
.badge.paused{background:#ece9e4;color:#6b6457}
.badge.done{background:#eef0f2;color:#5b6470}
.badge.dead{background:#efe9e6;color:#8a6a5a}
.badge.unknown{background:#eef0f2;color:#8a8f96}
.empty{text-align:center;padding:70px 20px;color:var(--muted)}
.empty .big{font-family:var(--disp);font-size:22px;color:var(--ink);margin-bottom:8px}
.filterbar{display:flex;gap:8px;margin:18px 0;align-items:center}
.filterbar input{flex:1;max-width:320px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;font-family:var(--sans)}
/* admin */
.navbadge{margin-left:auto;background:#c0392b;color:#fff;font-size:10px;font-weight:700;min-width:18px;
  height:18px;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 5px}
.navbadge.show{display:inline-flex}
.health-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0 28px}
.hcard{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;box-shadow:0 1px 2px rgba(17,20,24,.04)}
.hcard .hv{font-family:var(--disp);font-size:26px;font-weight:600;line-height:1.1}
.hcard .hk{color:var(--muted);font-size:11.5px;margin-top:5px;text-transform:uppercase;letter-spacing:.4px}
.hcard.warn{border-color:#e7c9b6;background:#fdf6f1}.hcard.warn .hv{color:#b4541f}
.qrow{display:flex;gap:12px;align-items:flex-start;padding:13px 18px;border-bottom:1px solid var(--line)}
.qrow:last-child{border-bottom:0}.qrow:hover{background:#fcfbf8}
.qrow .qmsg{flex:1}.qrow .qlabel{font-weight:600;font-size:14px}.qrow .qtext{color:var(--muted);font-size:13px;margin-top:2px}
.qrow .qact{color:var(--navy);font-size:12px;margin-top:4px}
.qbtns{display:flex;gap:6px;flex-shrink:0;align-items:center}
.qbtn{font-size:12px;font-weight:600;padding:6px 11px;border-radius:7px;border:1px solid var(--line);background:#fff;color:var(--navy);cursor:pointer}
.qbtn:hover{border-color:var(--navy);background:var(--paper)}.qbtn.fix{background:var(--navy);color:#fff;border-color:var(--navy)}
.sevdot{width:8px;height:8px;border-radius:50%;margin-top:6px;flex-shrink:0}
.sevdot.red{background:#c0392b}.sevdot.amber{background:#d99a2b}.sevdot.blue{background:var(--blue)}
.pipebar{display:flex;height:10px;border-radius:5px;overflow:hidden;margin:6px 0 16px;border:1px solid var(--line)}
.editsel{padding:5px 8px;border:1px solid var(--line);border-radius:7px;font-family:var(--sans);font-size:13px;background:#fff;cursor:pointer}
.editsel:focus{outline:none;border-color:var(--navy)}
.editmk{width:96px;padding:5px 8px;border:1px solid transparent;border-radius:7px;font-family:var(--sans);font-size:13px;background:transparent}
.editmk:hover{border-color:var(--line)}.editmk:focus{outline:none;border-color:var(--navy);background:#fff}
.auditrow{display:flex;gap:10px;padding:9px 18px;border-bottom:1px solid var(--line);font-size:12.5px;align-items:baseline}
.auditrow:last-child{border-bottom:0}.auditrow .at{color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.auditrow .ae{flex:1}.auditrow .ao{color:var(--warn)}.auditrow .an{color:#2f6b34;font-weight:600}
.qbcard{display:flex;gap:14px;align-items:center;padding:18px 20px}
.qbstate{width:11px;height:11px;border-radius:50%;flex-shrink:0}.qbstate.on{background:#2f9e44}.qbstate.off{background:#d99a2b}
</style></head><body>
<div class=app>
<aside class=sidebar>
  <div class=brand><img src="/logo-light.png" alt="MHP"><span>Estimator</span></div>
  <nav>
    <a class=nav data-v=home onclick="nav('home')"><svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>Home</a>
    <a class=nav data-v=estimates onclick="nav('estimates')"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>Estimates</a>
    <a class=nav data-v=projects onclick="nav('projects')"><svg viewBox="0 0 24 24"><path d="M3 7h6l2 2h10v11H3z"/></svg>Projects</a>
    <a class=nav data-v=live onclick="nav('live')"><svg viewBox="0 0 24 24"><path d="M3 12h4l2-6 4 14 3-9 2 3h3"/></svg>Live</a>
    <a class=nav data-v=subs onclick="nav('subs')"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M16 6a3 3 0 010 6M21 20c0-2.5-2-4-4-4.5"/></svg>Subs</a>
    <a class=nav data-v=crew onclick="nav('crew')"><svg viewBox="0 0 24 24"><path d="M4 20a8 8 0 0116 0"/><circle cx="12" cy="7" r="4"/></svg>Crew</a>
    <a class=nav data-v=admin onclick="nav('admin')"><svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>Admin <span id=admin-badge class=navbadge></span></a>
    <div class=nav-sep></div>
    <a class=nav data-v=settings onclick="nav('settings')"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.4 2 1.6a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.5a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6a7 7 0 00.1-1z"/></svg>Settings</a>
  </nav>
  <div class=profile onclick="nav('settings')">
    <div class=avatar>WB</div>
    <div class=pmeta><div class=pname>Walt Burge</div><div class=prole>Senior Project Coordinator</div></div>
  </div>
</aside>
<main class=wrap>

<section id=view-home class=view><div class=view-inner>
  <div class=row style="justify-content:space-between;margin-top:0;align-items:flex-start">
    <div><h2 style=margin:0>Projects</h2>
      <div class=sub style=margin:6px:0>North Mississippi Home Pros</div></div>
    <button class=btn onclick="nav('estimates')">+ New Estimate</button>
  </div>
  <div class=stat-strip id=strip></div>
  <div class=sec-h>Active now</div>
  <div class=proj-cards id=homecards></div>
  <div class=morelink id=morelink></div>
</div></section>

<section id=view-estimates class=view style=display:none><div class=view-inner>
<div id=input>
  <h2>Describe the job</h2>
  <div class=sub>Type everything you know — scope, rooms, square footage, finishes. The more detail, the better the seed. You'll edit every line next.</div>
  <textarea id=desc placeholder="e.g. Gut and remodel a 300 sqft kitchen in Oxford. Demo existing, new framing, drywall, 70 linear feet of custom cabinets, quartz countertops, LVT flooring, repaint, new electrical and plumbing fixtures, tile backsplash."></textarea>
  <div class=upload>
    <span class=upload-h>Upload plans, scope docs, or photos <span>(optional)</span></span>
    <input id=files type=file multiple>
  </div>
  <div class=row><button class=btn onclick=build()>Build Estimate &rarr;</button></div>
</div>

<div id=load><div class=spin></div><div>Building your estimate from MHP history…</div></div>

<div id=result>
  <div class=row style=justify-content:space-between>
    <h2 style=margin:0>Estimate — editable</h2>
    <div><button class="btn ghost" onclick=back()>&larr; New</button>
      <button class=btn onclick=exportx()>Export to Excel</button></div>
  </div>
  <div id=notes class=notes></div>
  <div class=est-layout>
    <div>
      <div class=card><table id=sheet><thead><tr>
        <th>CSI</th><th>Item</th><th class=n>Qty</th><th>Unit</th><th class=n>Rate ($)</th>
        <th class=n>Item Total</th><th>Backed by</th><th></th></tr></thead><tbody id=body></tbody></table></div>
      <div class=add>
        <select id=pick></select>
        <button class="btn ghost" onclick=addPick()>+ Add line</button>
      </div>
    </div>
    <div class=preview>
      <h3><span class=live></span> Live Preview</h3>
      <div class=pv-body id=pv-divs></div>
      <div class=pv-tot>
        <div class=pv-line><span>Subtotal cost</span><b id=sub>$0</b></div>
        <div class=pv-line><span>Contingency</span><b id=cont>$0</b></div>
        <div class=pv-line><span>Markup
          <input class=mk id=markup type=number value=18 style=width:56px onchange=recompute()> %</span></div>
        <div class=pv-bid><span>Bid</span><b id=bid>$0</b></div>
      </div>
    </div>
  </div>
</div>
</div></section>

<section id=view-projects class=view style=display:none><div class=view-inner>
  <h2>Projects</h2>
  <div class=sub>Status is inferred from each job's latest document — <b>Active</b> = 2026 activity,
    <b>Aging</b> = 2025, <b>Likely Done</b> = 2024 or older. Verify against what's actually on the board.</div>
  <div class=filterbar><input id=projfilter placeholder="Filter projects…" oninput=renderProjects()>
    <span id=projcount class=sub style=margin:0></span></div>
  <div class=card><table class=dtable><thead><tr><th>Project</th><th>Market</th><th>Type</th>
    <th>Status</th><th>Last activity</th><th class=n>Est. Value</th><th class=n>Bids</th></tr></thead>
    <tbody id=projbody></tbody></table></div>
</div></section>

<section id=view-subs class=view style=display:none><div class=view-inner>
  <h2>Subs &amp; Suppliers</h2>
  <div class=sub>Pulled from the Corinth roster, estimate sheets, and job history.
    <span id=subcount></span></div>
  <div class=filterbar><input id=subfilter placeholder="Filter subs…" oninput=renderSubs()></div>
  <div class=card><table class=dtable><thead><tr><th>Name</th><th>Trade / Type</th><th>Phone</th>
    <th class=n>Jobs</th><th>Source</th></tr></thead><tbody id=subbody></tbody></table></div>
</div></section>

<section id=view-live class=view style=display:none><div class=view-inner>
  <h2>Live</h2>
  <div class=sub>A forward look on active jobs — where each one's priced against your own history and what needs attention. The thing no off-the-shelf tool has: your estimate brain watching your live jobs.</div>
  <div class=banner><svg viewBox="0 0 24 24" width=18 height=18 fill=none stroke="#0b3d91" stroke-width=2><path d="M12 8v4l3 2"/><circle cx=12 cy=12 r=9/></svg>
    <span><b>Live margin forecast</b> — predicting each job's final margin before it's done — activates when actual-cost / invoice data connects. Today Live runs on bid pricing + activity.</span></div>
  <div class=prio-panel><h3>Today — derived priorities</h3><div id=prios></div></div>
  <div class=sec-h style=margin-top:0>Active jobs — health</div>
  <div class=living-grid id=living></div>
</div></section>

<section id=view-crew class=view style=display:none><div class=view-inner>
  <h2>Crew</h2>
  <div class=sub>The MHP team — roles and contacts from the personnel directory.</div>
  <div class=crew-grid id=crewgrid></div>
</div></section>

<section id=view-admin class=view style=display:none><div class=view-inner>
  <h2>Admin</h2>
  <div class=sub>The control panel — pipeline at a glance, what needs attention, and the books behind it. Edits here are logged and overlay the parsed data without changing it.</div>

  <div class=sec-h style=margin-top:8px>Data health</div>
  <div class=health-grid id=healthgrid></div>

  <div class=cols>
    <div class=panel>
      <h3>Attention queue <span id=attncount class=sub style="margin:0;font-weight:400"></span></h3>
      <div id=attnlist></div>
    </div>
    <div>
      <div class=panel style=margin-bottom:22px>
        <h3>Pipeline</h3>
        <div style=padding:16px20px id=pipeline></div>
      </div>
      <div class=panel style=margin-bottom:22px>
        <h3>QuickBooks — actuals</h3>
        <div id=qbcard></div>
      </div>
    </div>
  </div>

  <div class=panel style=margin-top:22px>
    <h3>Recent changes</h3>
    <div id=auditlog></div>
  </div>
</div></section>

<section id=view-settings class=view style=display:none><div class=view-inner>
  <h2>Settings</h2>
  <div class=sub>Defaults for the estimator and company info. Saved to this browser.</div>
  <div class=panel style=margin-top:18px>
    <h3>Estimating defaults</h3>
    <div class=setrow><div><div class=sl>Default markup</div>
      <div class=sd>Applied to new estimates (MHP median is 18%).</div></div>
      <div><input id=set-markup type=number value=18 style=width:80px onchange=saveSettings()> %</div></div>
    <div class=setrow><div><div class=sl>Default market</div>
      <div class=sd>Pre-selects the market on new jobs.</div></div>
      <select id=set-market onchange=saveSettings()><option>Oxford</option><option>Pickwick</option><option>Corinth</option><option>Tupelo</option></select></div>
    <div class=setrow><div><div class=sl>Show confidence bands</div>
      <div class=sd>Display the historical price band on each line.</div></div>
      <div class="toggle on" id=set-bands onclick="toggleSet('set-bands')"></div></div>
    <div class=setrow><div><div class=sl>Auto-suggest contingency</div>
      <div class=sd>Pad uncertain lines based on price spread.</div></div>
      <div class="toggle on" id=set-cont onclick="toggleSet('set-cont')"></div></div>
  </div>
  <div class=panel style=margin-top:18px>
    <h3>Company</h3>
    <div class=setrow><div class=sl>North Mississippi Home Professionals, LLC</div>
      <div class=sd>License R21909 · Oxford, MS</div></div>
    <div class=setrow><div class=sl>Signed in as</div><div class=sd>Walt Burge · Senior Project Coordinator</div></div>
    <div class=setrow><div class=sl>Data</div><div class=sd>162 jobs · 4,298 line items · 101 subs · 7 crew</div></div>
  </div>
</div></section>

</main>
</div>
<script>
let CAT=[];
fetch('/api/catalog').then(r=>r.json()).then(c=>{CAT=c;
  document.getElementById('pick').innerHTML=c.map((x,i)=>`<option value=${i}>${x.description} — $${x.rate}/${x.unit} (${x.jobs}j)</option>`).join('')});

const loaded={};
function nav(v){
  document.querySelectorAll('.view').forEach(x=>x.style.display='none');
  document.getElementById('view-'+v).style.display='block';
  document.querySelectorAll('.nav').forEach(a=>a.classList.toggle('active',a.dataset.v===v));
  const L={home:loadDash,projects:loadProjects,subs:loadSubs,crew:loadCrew,live:loadLive,admin:loadAdmin};
  const fresh=v==='admin'||v==='projects';   // these reflect live edits — never serve stale
  if(L[v]&&(!loaded[v]||fresh)){loaded[v]=true;L[v]();}
}
const STATUSES=['Active','Aging','Bid','Paused','Likely Done','Dead','Unknown'];
const money=n=>'$'+Number(n).toLocaleString(undefined,{maximumFractionDigits:0});
const BADGE={'Active':'active','Aging':'aging','Bid':'bid','Paused':'paused',
  'Likely Done':'done','Dead':'dead','Unknown':'unknown'};

function loadDash(){
  fetch('/api/stats').then(r=>r.json()).then(s=>{
    document.getElementById('strip').innerHTML=[
      [s.active,'Active jobs'],[money(s.active_value),'Active book value'],[s.bid,'Bids out']
    ].map(([v,k])=>`<div><div class=sv>${v}</div><div class=sk>${k}</div></div>`).join('');
    document.getElementById('morelink').innerHTML=
      `${s.aging} aging · ${s.paused} paused · ${s.projects} jobs all-time. `+
      `<a onclick="nav('projects')">View all projects →</a>`;
  });
  fetch('/api/projects').then(r=>r.json()).then(p=>{
    const act=p.filter(x=>x.status==='Active');
    document.getElementById('homecards').innerHTML=act.map(x=>
      `<div class=pcard onclick="nav('projects')">
        <div class=pc-top><div class=pc-name>${x.name}</div>
          <span class="badge active">Active</span></div>
        <div class=pc-val>${x.value?money(x.value):'—'}</div>
        <div class=pc-meta><span>${x.market||'—'}</span><span class=pdot></span>
          <span>${x.last||'—'}</span><span class=pdot></span>
          <span>${x.estimates} bid${x.estimates===1?'':'s'}</span></div>
      </div>`).join('')||'<div class=sub>No active jobs right now.</div>';
  });
}

function loadLive(){fetch('/api/live').then(r=>r.json()).then(d=>{
  document.getElementById('prios').innerHTML=d.priorities.length?d.priorities.slice(0,8).map(([lvl,t])=>
    `<div class=prio><span class="fdot ${lvl}"></span><span>${t}</span></div>`).join('')
    :'<div class=prio>Nothing flagged. All active jobs look clean.</div>';
  document.getElementById('living').innerHTML=d.jobs.map(j=>{
    let gauge='';
    if(j.delta!==null){
      const d2=Math.max(-30,Math.min(30,j.delta)), w=Math.abs(d2)/30*50;
      const col=j.delta<-4?'#c0392b':j.delta>8?'#2f9e44':'#d99a2b';
      const style=j.delta<0?`right:50%;width:${w}%;background:${col}`:`left:50%;width:${w}%;background:${col}`;
      gauge=`<div class=gauge><div class=gauge-lab><span>Priced vs your norm</span>
        <b style="color:${col}">${j.delta>0?'+':''}${j.delta}%</b></div>
        <div class=gauge-bar><div class=gauge-mid></div><div class=gauge-fill style="${style}"></div></div></div>`;
    }
    const flags=j.flags.map(([lvl,t])=>`<div class=flag><span class="fdot ${lvl}"></span><span>${t}</span></div>`).join('')
      ||'<div class=flag><span class="fdot green"></span><span>On track — no flags.</span></div>';
    return `<div class="living ${j.health}">
      <div class=living-top><div class=lname>${j.name}</div>
        <div class=lval>${j.value?money(j.value):'—'}</div></div>
      <div class=lmeta>${j.market||'—'} · ${j.last||'—'} · ${j.revisions} bid${j.revisions===1?'':'s'}</div>
      ${gauge}${flags}
      <div class=forecast>Margin forecast: <b>locked</b> until invoices connect</div></div>`;
  }).join('');
});}

let CREW=[];
function loadCrew(){fetch('/api/crew').then(r=>r.json()).then(c=>{CREW=c;
  const ini=n=>n.split(' ').filter(w=>/[A-Z]/.test(w[0])).slice(0,2).map(w=>w[0]).join('');
  document.getElementById('crewgrid').innerHTML=c.map(m=>`<div class=crew-card>
    <div class=crew-top><div class=crew-av>${ini(m.name)}</div>
      <div><div class=cn>${m.name}</div><div class=cr>${m.role}</div></div></div>
    <div class=crew-meta>
      ${m.phone?`<div>${m.phone}</div>`:''}
      ${m.email?`<div><a href="mailto:${m.email}">${m.email}</a></div>`:''}</div></div>`).join('');
});}

// settings (localStorage)
function loadSettings(){
  const s=JSON.parse(localStorage.getItem('mhp_settings')||'{}');
  if(s.markup){document.getElementById('set-markup').value=s.markup;
    const mk=document.getElementById('markup');if(mk)mk.value=s.markup;}
  if(s.market)document.getElementById('set-market').value=s.market;
  if(s.bands===false)document.getElementById('set-bands').classList.remove('on');
  if(s.cont===false)document.getElementById('set-cont').classList.remove('on');
}
function saveSettings(){
  localStorage.setItem('mhp_settings',JSON.stringify({
    markup:document.getElementById('set-markup').value,
    market:document.getElementById('set-market').value,
    bands:document.getElementById('set-bands').classList.contains('on'),
    cont:document.getElementById('set-cont').classList.contains('on')}));
  const mk=document.getElementById('markup');
  if(mk){mk.value=document.getElementById('set-markup').value;recompute();}
}
function toggleSet(id){document.getElementById(id).classList.toggle('on');saveSettings();}

let PROJ=[];
function loadProjects(){fetch('/api/projects').then(r=>r.json()).then(p=>{PROJ=p;renderProjects();});}
function renderProjects(){
  const f=(document.getElementById('projfilter').value||'').toLowerCase();
  const list=PROJ.filter(p=>p.name.toLowerCase().includes(f));
  document.getElementById('projcount').textContent=
    `${list.length} shown · ${PROJ.filter(p=>p.status==='Active').length} active now`;
  document.getElementById('projbody').innerHTML=list.map(p=>{
    const opts=STATUSES.map(s=>`<option ${s===p.status?'selected':''}>${s}</option>`).join('');
    return `<tr><td>${p.name}</td>
     <td><input class=editmk value="${p.market||''}" placeholder="—"
        onchange="saveProj('${p.id}','market',this.value)"></td>
     <td>${p.type||'—'}</td>
     <td><select class=editsel onchange="saveProj('${p.id}','status',this.value)">${opts}</select></td>
     <td>${p.last||'—'}</td>
     <td class=n>${p.value?money(p.value):'—'}</td><td class=n>${p.estimates}</td></tr>`;}).join('');
}

function loadAdmin(){
  fetch('/api/admin/board').then(r=>r.json()).then(b=>{
    const h=b.health;
    const cards=[
      [h.with_bids+'/'+h.projects,'Projects with bids',h.hollow>20],
      [money(b.live_value),'Live pipeline',false],
      [money(b.active_value),'Active book',false],
      [h.canon_lines.toLocaleString(),'Real line items',false],
      [h.inflation+'×','Revision inflation',h.inflation>1.5],
      [h.contaminated_rates,'Contaminated rates',h.contaminated_rates>0],
      [h.future_dates,'Future-dated',h.future_dates>0],
      [h.blank_markets,'Blank markets',h.blank_markets>0]];
    document.getElementById('healthgrid').innerHTML=cards.map(([v,k,w])=>
      `<div class="hcard ${w?'warn':''}"><div class=hv>${v}</div><div class=hk>${k}</div></div>`).join('');
    const col={Active:'#2f9e44',Aging:'#d99a2b',Bid:'#0051b8',Paused:'#8a8f96',
      'Likely Done':'#5b6470',Unknown:'#b0b5bb',Dead:'#cdbfb8'};
    const tot=b.pipeline.reduce((s,p)=>s+p.count,0)||1;
    const bar=b.pipeline.map(p=>`<div style="width:${p.count/tot*100}%;background:${col[p.status]||'#ccc'}"></div>`).join('');
    document.getElementById('pipeline').innerHTML=`<div class=pipebar>${bar}</div>`+
      b.pipeline.map(p=>`<div class=prow style="padding:8px 0"><span class=pn>${p.status}</span>
        <span class=pv>${p.count} · ${p.value?money(p.value):'—'}</span></div>`).join('');
  });
  fetch('/api/admin/attention').then(r=>r.json()).then(a=>{
    document.getElementById('attncount').textContent=a.total?
      `${a.counts.red||0} urgent · ${a.total} open`:'all clear';
    document.getElementById('attnlist').innerHTML=a.items.length?a.items.map(it=>{
      const fix=it.field&&it.suggest?
        `<button class="qbtn fix" onclick="applyFix('${it.entity_id}','${it.field}','${it.suggest}')">${it.field==='status'?'→ '+it.suggest:'Set '+it.suggest}</button>`:'';
      return `<div class=qrow><span class="sevdot ${it.severity}"></span>
        <div class=qmsg><div class=qlabel>${it.label}</div><div class=qtext>${it.message}</div>
          <div class=qact>${it.action}</div></div>
        <div class=qbtns>${fix}<button class=qbtn onclick="dismissFlag('${it.id}')">Dismiss</button></div></div>`;
    }).join(''):'<div class=qrow><div class=qmsg>Nothing flagged. The book is clean.</div></div>';
  });
  fetch('/api/admin/qb-status').then(r=>r.json()).then(q=>{
    document.getElementById('qbcard').innerHTML=`<div class=qbcard>
      <span class="qbstate ${q.configured?'on':'off'}"></span>
      <div><div style=font-weight:600>${q.configured?'Connected':'Not configured'}</div>
        <div class=sub style="margin:2px 0 0;font-size:13px">${q.configured?('Ready · '+q.actuals_rows+' actuals on file'):('Missing: '+q.missing.join(', '))}</div>
        <div class=sub style="margin:4px 0 0;font-size:12px">${q.note}</div></div></div>`;
  });
  fetch('/api/admin/audit').then(r=>r.json()).then(log=>{
    document.getElementById('auditlog').innerHTML=log.length?log.map(e=>
      `<div class=auditrow><span class=at>${e.ts.replace('T',' ')}</span>
        <span class=ae><b>${e.label}</b> · ${e.field}: <span class=ao>${e.old||'∅'}</span> → <span class=an>${e.new||'∅'}</span></span>
        <span class=at>${e.actor}</span></div>`).join('')
      :'<div class=auditrow><span class=ae>No changes yet.</span></div>';
  });
}
function refreshAdminBadge(){fetch('/api/admin/attention').then(r=>r.json()).then(a=>{
  const b=document.getElementById('admin-badge'),n=a.counts.red||0;
  b.textContent=n;b.classList.toggle('show',n>0);});}
function saveProj(id,field,value){
  fetch('/api/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({entity_type:'project',entity_id:id,field,value})})
    .then(r=>r.json()).then(()=>{const p=PROJ.find(x=>x.id===id);if(p)p[field]=value;refreshAdminBadge();});
}
function dismissFlag(fid){
  fetch('/api/admin/dismiss',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({flag_id:fid})}).then(()=>{loadAdmin();refreshAdminBadge();});
}
function applyFix(id,field,value){
  fetch('/api/admin/override',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({entity_type:'project',entity_id:id,field,value})})
    .then(()=>{loaded['projects']=false;loadAdmin();refreshAdminBadge();});
}
let SUBS=[];
function loadSubs(){fetch('/api/subs').then(r=>r.json()).then(s=>{SUBS=s;
  document.getElementById('subcount').textContent=`${s.length} on the bench.`;renderSubs();});}
function renderSubs(){
  const f=(document.getElementById('subfilter').value||'').toLowerCase();
  document.getElementById('subbody').innerHTML=SUBS.filter(x=>
    (x.name+' '+x.trade).toLowerCase().includes(f)).map(x=>
    `<tr><td><b>${x.name}</b></td><td>${x.trade||'—'}</td><td>${x.phone||'—'}</td>
     <td class=n>${x.jobs||'—'}</td><td><small class=j>${x.source}</small></td></tr>`).join('');
}
loadSettings();
refreshAdminBadge();
nav('home');

function show(id){for(const x of ['input','load','result'])document.getElementById(x).style.display=x==id?'block':'none'}

async function readFiles(){
  const fs=document.getElementById('files').files, docs=[];
  for(const f of fs){
    if(/\.(txt|csv|md)$/i.test(f.name)) docs.push({name:f.name,text:await f.text()});
    else docs.push({name:f.name});
  }
  return docs;
}

async function build(){
  show('load');
  const docs=await readFiles();
  const r=await fetch('/api/estimate',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({description:document.getElementById('desc').value,docs})});
  const d=await r.json();
  document.getElementById('markup').value=d.markup;
  document.getElementById('notes').innerHTML=d.notes.map(n=>'• '+n).join('<br>');
  render(d.lines);
  show('result');
}
function back(){show('input')}

function render(lines){
  // sort by division, group headers
  lines.sort((a,b)=>(a.division||'').localeCompare(b.division||''));
  const body=document.getElementById('body'); body.innerHTML=''; let div=null;
  lines.forEach((l,i)=>{
    if(l.division!==div){div=l.division;
      body.insertAdjacentHTML('beforeend',`<tr class=div><td colspan=8>${div||'Other'}</td></tr>`)}
    const band=l.p25!=null?`<small class=j>$${l.p25}–$${l.p75} · ${l.jobs}j</small>`:'';
    const miss=l.kind==='missing'?' class=miss':'';
    body.insertAdjacentHTML('beforeend',`<tr data-i=${i}${miss} data-div="${(l.division||'Other').replace(/"/g,'')}">
      <td>${l.item_no||''}</td><td>${l.description}</td>
      <td class=n><input class=cell type=number value="${l.qty??''}" oninput=recompute()></td>
      <td>${l.unit||''}</td>
      <td class=n><input class=cell type=number step=any value="${l.rate??''}" oninput=recompute()></td>
      <td class="n it">$0</td><td>${band}</td>
      <td><button class=x onclick="this.closest('tr').remove();recompute()">×</button></td></tr>`);
  });
  recompute();
}

function rows(){return [...document.querySelectorAll('#body tr[data-i]')]}
function recompute(){
  let sub=0; const byDiv={};
  rows().forEach(tr=>{
    const q=parseFloat(tr.children[2].firstChild.value)||0;
    const rt=parseFloat(tr.children[4].firstChild.value)||0;
    const it=q*rt; tr.querySelector('.it').textContent='$'+it.toLocaleString(undefined,{maximumFractionDigits:0});
    sub+=it;
    const d=(tr.dataset.div||'Other').replace(/^Division\s*/,'Div ').replace(/:.*$/,m=>m.split(':')[0]);
    byDiv[d]=(byDiv[d]||0)+it;
  });
  const mk=1+(parseFloat(document.getElementById('markup').value)||0)/100;
  // live preview: division rollup (non-zero divisions only)
  document.getElementById('pv-divs').innerHTML=Object.entries(byDiv).filter(([,v])=>v>0)
    .sort((a,b)=>b[1]-a[1]).map(([k,v])=>
    `<div class=pv-div><span>${k}</span><b>$${v.toLocaleString(undefined,{maximumFractionDigits:0})}</b></div>`).join('')
    ||'<div class=pv-div><span>Fill quantities to price</span></div>';
  document.getElementById('sub').textContent='$'+sub.toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('cont').textContent='$'+(sub*0.1).toLocaleString(undefined,{maximumFractionDigits:0});
  document.getElementById('bid').textContent='$'+(sub*mk).toLocaleString(undefined,{maximumFractionDigits:0});
}

function addPick(){
  const c=CAT[document.getElementById('pick').value]; if(!c)return;
  const body=document.getElementById('body');
  body.insertAdjacentHTML('beforeend',`<tr data-i=add data-div="${(c.division||'Other').replace(/"/g,'')}">
    <td>${c.item_no||''}</td><td>${c.description}</td>
    <td class=n><input class=cell type=number value="" oninput=recompute()></td>
    <td>${c.unit||''}</td>
    <td class=n><input class=cell type=number step=any value="${c.rate}" oninput=recompute()></td>
    <td class="n it">$0</td><td><small class=j>${c.jobs}j</small></td>
    <td><button class=x onclick="this.closest('tr').remove();recompute()">×</button></td></tr>`);
  recompute();
}

async function exportx(){
  const lines=rows().map(tr=>({description:tr.children[1].textContent,
    qty:tr.children[2].firstChild.value, rate:tr.children[4].firstChild.value}));
  const r=await fetch('/api/export',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({lines,markup:document.getElementById('markup').value})});
  const blob=await r.blob(); const u=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=u; a.download='MHP_Estimate.xlsx'; a.click();
}
</script></body></html>"""


if __name__ == "__main__":
    ThreadingHTTPServer.allow_reuse_address = True
    print(f"MHP Estimator running -> http://localhost:{PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
