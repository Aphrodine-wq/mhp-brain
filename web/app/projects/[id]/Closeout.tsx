"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";
import { money } from "@/lib/format";

export interface CloseoutState {
  closing_total: number | null;
  source: string | null;
  recorded_by: string | null;
  recorded_at: string | null;
  note: string | null;
  source_file: string | null;
}

// What a job actually cost when it closed, against what it was bid at.
//
// This is the flywheel's training data: flywheel.py pairs the two and learns how much of a bid
// the work realizes, then scales every future estimate by it. The set has been stuck at four
// jobs because nothing but the spreadsheet parser could write here — this is the way in.
export default function Closeout({
  projectId,
  bid,
  actual,
  canWrite,
}: {
  projectId: string;
  bid: number | null;
  actual: CloseoutState | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(actual?.closing_total != null ? String(actual.closing_total) : "");
  const [note, setNote] = useState(actual?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorded = actual?.closing_total ?? null;
  // Realization: how much of the bid the job actually consumed. Under 1.0 came in under bid.
  const realization = recorded != null && bid ? recorded / bid : null;

  async function save(clear = false) {
    setBusy(true);
    setError(null);
    try {
      await post("/api/jobs/closeout", {
        project_id: projectId,
        closing_total: clear ? null : value,
        note: clear ? null : note,
      });
      setOpen(false);
      if (clear) { setValue(""); setNote(""); }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the closeout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="closeout">
      <div className="closeout-head">
        <div>
          <div className="closeout-k">Actual cost at closeout</div>
          <div className="closeout-v">{recorded != null ? money(recorded) : "—"}</div>
        </div>

        {realization != null && (
          <div className={`closeout-real ${realization > 1 ? "over" : "under"}`}>
            <b>{Math.round(realization * 100)}%</b>
            <span>of the {money(bid!)} bid</span>
          </div>
        )}

        {canWrite && (
          <button className="btn ghost sm" onClick={() => setOpen(!open)} style={{ marginLeft: "auto" }}>
            {open ? "Close" : recorded != null ? "Edit closeout" : "Record closeout"}
          </button>
        )}
      </div>

      {recorded == null ? (
        <div className="closeout-note">
          No closing cost on file. Recording one is what teaches the estimator — it is currently
          calibrated on {" "}
          <b>4 closed jobs</b>, so every job you close out here measurably sharpens the next bid.
        </div>
      ) : (
        <div className="closeout-note">
          {actual?.source === "manual"
            ? `Recorded by ${actual.recorded_by ?? "someone"}${actual.recorded_at ? ` on ${actual.recorded_at.slice(0, 10)}` : ""}.`
            : "Parsed from a closeout document."}
          {actual?.note && ` — ${actual.note}`}
        </div>
      )}

      {open && canWrite && (
        <div className="closeout-form">
          <label>
            Closing cost
            <input
              type="number"
              min={0}
              step="0.01"
              autoFocus
              placeholder="What the job actually cost to build"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && value && !busy) save(); }}
            />
          </label>
          <label>
            Note <span className="sd">optional — where the figure came from</span>
            <input
              placeholder="e.g. QuickBooks job P&L, final subs + materials"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && <div className="conn-err">{error}</div>}

          <div className="closeout-actions">
            {recorded != null && (
              <button className="btn ghost sm" disabled={busy} onClick={() => save(true)}>Clear</button>
            )}
            <button className="btn sm" disabled={busy || !value} onClick={() => save()}>
              {busy ? "Saving…" : "Save closeout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
