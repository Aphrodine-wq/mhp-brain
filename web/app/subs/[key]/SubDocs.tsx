"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocMeta } from "@/lib/documents-store";

// Compliance documents per sub. W-9 and the insurance certificate get dedicated slots
// (the two we need on file before a sub works a job); anything else lands under Other.
const SLOTS = ["W-9", "Insurance (COI)", "Other"] as const;

export default function SubDocs({ subKey, subName, docs }: { subKey: string; subName: string; docs: DocMeta[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(category: string, file: File | undefined) {
    if (!file) return;
    setBusy(category);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    form.append("entityType", "sub");
    form.append("entityId", subKey);
    form.append("entityLabel", subName);
    try {
      const r = await fetch("/api/documents", { method: "POST", body: form });
      if (!r.ok) throw new Error((await r.json()).error ?? "upload failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Documents</h3>
      {error && <div className="conn-err" style={{ margin: "14px 20px 0" }}>{error}</div>}
      {SLOTS.map((cat) => {
        const have = docs.filter((d) => d.category === cat);
        const required = cat !== "Other";
        return (
          <div className="setrow" key={cat}>
            <div>
              <div className="sl">{cat}</div>
              <div className="sd">
                {have.length ? (
                  have.map((d) => (
                    <span key={d.id} style={{ display: "block" }}>
                      <a href={`/api/documents/${d.id}`}>{d.filename} ↓</a>
                      <small className="j"> · {d.uploadedAt}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</small>
                    </span>
                  ))
                ) : required ? (
                  "Not on file."
                ) : (
                  "Anything else worth keeping on this sub."
                )}
              </div>
            </div>
            <div className="actions">
              {required && (have.length ? (
                <span className="badge active">On file</span>
              ) : (
                <span className="badge aging">Missing</span>
              ))}
              <button className="btn ghost sm" disabled={busy === cat} onClick={() => fileRefs.current[cat]?.click()}>
                {busy === cat ? "Uploading…" : "Upload"}
              </button>
              <input
                ref={(el) => { fileRefs.current[cat] = el; }}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
                style={{ display: "none" }}
                onChange={(e) => { upload(cat, e.target.files?.[0]); e.target.value = ""; }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
