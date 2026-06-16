"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";
import type { RecentEntry } from "@/lib/time";

const today = () => new Date().toISOString().slice(0, 10);

export default function TimeForm({
  canWrite,
  workers,
  projects,
  entries,
}: {
  canWrite: boolean;
  workers: string[];
  projects: { id: string; name: string }[];
  entries: RecentEntry[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [worker, setWorker] = useState(workers[0] ?? "");
  const [project, setProject] = useState("");
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  async function add() {
    if (!worker || !project || !(Number(hours) > 0)) return;
    setBusy(true);
    try {
      await post("/api/time", {
        worker_name: worker,
        project_id: project,
        work_date: date,
        hours: Number(hours),
        note: note.trim() || undefined,
      });
      setHours("");
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <h3>Log hours</h3>
      {canWrite ? (
        <div className="setrow" style={{ flexWrap: "wrap" }}>
          <div className="actions" style={{ justifyContent: "flex-start", flex: 1, gap: 8 }}>
            <select value={worker} onChange={(e) => setWorker(e.target.value)}>
              {workers.length === 0 && <option value="">no crew on file</option>}
              {workers.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <select value={project} onChange={(e) => setProject(e.target.value)} style={{ maxWidth: 260 }}>
              <option value="">— job —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input className="mk" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input
              className="mk"
              style={{ width: 90 }}
              type="number"
              step="0.25"
              placeholder="Hours"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <input
              className="mk"
              style={{ flex: 1, minWidth: 180 }}
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn sm" disabled={busy || !worker || !project || !(Number(hours) > 0)} onClick={add}>
              {busy ? "Logging…" : "Log it"}
            </button>
          </div>
        </div>
      ) : (
        <div className="sd">Editors can log hours. Ask an admin for access.</div>
      )}

      {entries.length === 0 ? (
        <div className="empty" style={{ padding: "28px 20px" }}>
          <div className="big">No hours logged yet</div>
          Log a crew member&apos;s hours against a job above.
        </div>
      ) : (
        entries.map((e) => (
          <div className="setrow" key={e.id}>
            <div>
              <div className="sl">
                {e.worker_name} · {e.hours}h
              </div>
              <div className="sd">
                {e.project_name} · {e.work_date}
                {e.note ? ` · ${e.note}` : ""}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
