"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { patch } from "@/lib/client";

// The phase track, but you can set it from here.
//
// Phase drives the client portal, the "Aging" heuristic and the sub-line under Work complete —
// and not one of the 100 projects had one set, because the only way in was a text select buried
// under "Edit details". Clicking the stage you are at is the whole interaction.
const MILESTONES = ["lead", "quoted", "scheduled", "in_progress", "complete"] as const;
type Milestone = (typeof MILESTONES)[number];

export default function PhaseTrack({
  projectId,
  phase,
  canWrite,
}: {
  projectId: string;
  phase: string | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reached = phase ? MILESTONES.indexOf(phase as Milestone) : -1;

  async function setPhase(next: Milestone) {
    if (busy) return;
    setBusy(next);
    setError(null);
    try {
      // Clicking the stage you are already on clears it — otherwise a mis-click is unrecoverable
      // from this control and you would have to go back into Edit details to undo it.
      await patch("/api/jobs/details", { project_id: projectId, current_phase: next === phase ? null : next });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the phase.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className={`mtrack${canWrite ? " editable" : ""}`}>
        {MILESTONES.map((m, i) => {
          const cls = `mstep${i < reached ? " done" : ""}${i === reached ? " now" : ""}${busy === m ? " saving" : ""}`;
          const label = m.replace("_", " ");
          if (!canWrite) {
            return (
              <div key={m} className={cls}>
                <span className="mstep-bar" />
                <span className="mstep-label">{label}</span>
              </div>
            );
          }
          return (
            <button
              key={m}
              type="button"
              className={cls}
              disabled={busy !== null}
              onClick={() => setPhase(m)}
              title={m === phase ? `Clear the phase (currently ${label})` : `Set phase to ${label}`}
            >
              <span className="mstep-bar" />
              <span className="mstep-label">{label}</span>
            </button>
          );
        })}
      </div>
      {canWrite && phase == null && !error && (
        <div className="mtrack-hint">No phase set — click the stage this job is at.</div>
      )}
      {error && <div className="conn-err" style={{ marginTop: 6 }}>{error}</div>}
    </>
  );
}
