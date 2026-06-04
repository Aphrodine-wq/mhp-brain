"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SubRow } from "@/lib/queries";
import { post } from "@/lib/client";

const smallBtn: React.CSSProperties = { padding: "4px 10px", fontSize: 12 };

export default function SubsTable({ subs }: { subs: SubRow[] }) {
  const router = useRouter();
  const [f, setF] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [trade, setTrade] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const list = subs.filter((x) => (x.name + " " + x.trade).toLowerCase().includes(f.toLowerCase()));

  function startEdit(s: SubRow) {
    setEditing(s.key);
    setTrade(s.trade);
    setPhone(s.phone);
  }
  async function save(s: SubRow) {
    setBusy(s.key);
    try {
      await post("/api/sub", { name: s.name, trade, phone });
      setEditing(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function toggleVerified(s: SubRow) {
    setBusy(s.key);
    try {
      await post("/api/sub", { name: s.name, verified: (!s.verified).toString() });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="filterbar">
        <input placeholder="Filter subs…" value={f} onChange={(e) => setF(e.target.value)} />
      </div>
      <div className="card">
        <table className="dtable">
          <thead>
            <tr><th>Name</th><th>Trade / Type</th><th>Phone</th><th className="n">Jobs</th><th>Source</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const ed = editing === x.key;
              return (
                <tr key={x.key}>
                  <td>
                    <b>{x.name}</b> {x.verified && <span className="badge active" title="Confirmed">✓</span>}
                  </td>
                  <td>{ed ? <input value={trade} onChange={(e) => setTrade(e.target.value)} style={{ width: 150 }} /> : x.trade || "—"}</td>
                  <td>{ed ? <input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: 130 }} /> : x.phone || "—"}</td>
                  <td className="n">{x.jobs || "—"}</td>
                  <td><small className="j">{x.source}</small></td>
                  <td className="n" style={{ whiteSpace: "nowrap" }}>
                    {ed ? (
                      <>
                        <button className="btn ghost" style={smallBtn} disabled={busy === x.key} onClick={() => save(x)}>Save</button>{" "}
                        <button className="x" onClick={() => setEditing(null)}>×</button>
                      </>
                    ) : (
                      <>
                        <button className="btn ghost" style={smallBtn} onClick={() => startEdit(x)}>Edit</button>{" "}
                        <button className="btn ghost" style={smallBtn} disabled={busy === x.key} onClick={() => toggleVerified(x)}>
                          {x.verified ? "Unconfirm" : "Confirm"}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
