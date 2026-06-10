"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrewRow } from "@/lib/queries";
import { post } from "@/lib/client";

// Editable employee profile. Base contact info comes from the personnel directory;
// the extras (hire date, address, emergency contact, certifications, notes) are
// app-owned and save through the audited overrides layer.
const ROWS: { field: string; label: string; get: (m: CrewRow) => string; hint?: string }[] = [
  { field: "role", label: "Role", get: (m) => m.role },
  { field: "rate", label: "Rate", get: (m) => m.rate ?? "" },
  { field: "phone", label: "Phone", get: (m) => m.phone ?? "" },
  { field: "email", label: "Email", get: (m) => m.email ?? "" },
  { field: "hire_date", label: "Hire date", get: (m) => m.hireDate, hint: "e.g. 2023-04-17" },
  { field: "address", label: "Address", get: (m) => m.address },
  { field: "emergency_contact", label: "Emergency contact", get: (m) => m.emergencyContact, hint: "Name + phone" },
  { field: "certifications", label: "Certifications", get: (m) => m.certifications, hint: "Licenses, OSHA, CDL…" },
  { field: "notes", label: "Notes", get: (m) => m.notes },
];

export default function CrewProfile({ member }: { member: CrewRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(ROWS.map((r) => [r.field, r.get(member)])),
  );

  async function save() {
    setBusy(true);
    try {
      await post("/api/crew", { name: member.name, ...vals });
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        General
        {editing ? (
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost sm" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          </span>
        ) : (
          <button className="btn ghost sm" onClick={() => setEditing(true)}>Edit</button>
        )}
      </h3>
      {ROWS.map((r) => (
        <div className="setrow" key={r.field}>
          <div><div className="sl">{r.label}</div></div>
          {editing ? (
            <input
              value={vals[r.field]}
              placeholder={r.hint}
              style={{ width: 280 }}
              onChange={(e) => setVals((v) => ({ ...v, [r.field]: e.target.value }))}
            />
          ) : (
            <div className="sd" style={{ textAlign: "right", maxWidth: 420 }}>{r.get(member) || "—"}</div>
          )}
        </div>
      ))}
    </div>
  );
}
