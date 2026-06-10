"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DOC_CATEGORIES } from "@/lib/doc-categories";

// General upload — not tied to a sub or project. Sub paperwork should go through the
// sub's own page so it links to them; this catches everything else.
export default function DocsUpload() {
  const router = useRouter();
  const [category, setCategory] = useState<string>("Other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    try {
      const r = await fetch("/api/documents", { method: "POST", body: form });
      if (!r.ok) throw new Error((await r.json()).error ?? "upload failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <select value={category} onChange={(e) => setCategory(e.target.value)}>
        {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? "Uploading…" : "+ Upload"}
      </button>
      <input
        ref={fileRef}
        type="file"
        style={{ display: "none" }}
        onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }}
      />
      {error && <span className="conn-err" style={{ margin: 0 }}>{error}</span>}
    </>
  );
}
