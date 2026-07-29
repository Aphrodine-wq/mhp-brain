"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocMeta } from "@/lib/documents-store";

export interface DocSlot {
  category: string;
  required: boolean;
  hint?: string;
}

// Per-entity document panel (projects, subs, crew). Required slots show on-file / missing
// badges; uploads link the file to the entity so it appears here on the entity's page.
export default function EntityDocs({
  entityType,
  entityId,
  entityLabel,
  slots,
  docs,
}: {
  entityType: string;
  entityId: string;
  entityLabel: string;
  slots: DocSlot[];
  docs: DocMeta[];
}) {
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
    form.append("entityType", entityType);
    form.append("entityId", entityId);
    form.append("entityLabel", entityLabel);
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
      {slots.map(({ category, required, hint }) => {
        const have = docs.filter((d) => d.category === category);
        return (
          <div className="setrow" key={category}>
            <div>
              <div className="sl">{category}</div>
              <div className="sd">
                {have.length ? (
                  have.map((d) => (
                    <span key={d.id} style={{ display: "block" }}>
                      <a href={`/api/documents/${d.id}`}>{d.filename} ↓</a>
                      <small className="j"> · {d.uploadedAt}{d.uploadedBy ? ` · ${d.uploadedBy}` : ""}</small>
                    </span>
                  ))
                ) : (
                  hint ?? (required ? "Not on file." : "Anything else worth keeping.")
                )}
              </div>
            </div>
            <div className="actions">
              {required && (have.length ? (
                <span className="badge active">On file</span>
              ) : (
                <span className="badge aging">Missing</span>
              ))}
              <button className="btn ghost sm" disabled={busy === category} onClick={() => fileRefs.current[category]?.click()}>
                {busy === category ? "Uploading…" : "Upload"}
              </button>
              <input
                ref={(el) => { fileRefs.current[category] = el; }}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
                style={{ display: "none" }}
                onChange={(e) => { upload(category, e.target.files?.[0]); e.target.value = ""; }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
