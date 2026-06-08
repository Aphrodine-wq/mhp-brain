"use client";

import { useEffect, useState, useCallback } from "react";
import VoiceButton from "../VoiceButton";

interface Job {
  id: string;
  name: string;
  type: string | null;
  phase: string | null;
  bid_value: number | null;
  collected: number;
  logged_today: { type: string; summary: string }[];
  pending_cos: { description: string; amount: number }[];
}

interface Alerts {
  upcoming_inspections: { project: string; type: string; date: string }[];
  open_callbacks: { project: string; issue: string; reported: string }[];
}

interface Entry {
  project_id: string;
  skipped: boolean;
  summary: string;
  crew_present: string;
  hours_worked: number | null;
  weather: string;
  action_items: string;
  scope_change: string;
  scope_change_amount: number | null;
  payment_amount: number | null;
  payment_method: string;
  issue: string;
  new_phase: string;
}

const PHASES = ["lead", "quoted", "scheduled", "in_progress", "complete", "paid", "warranty"];
const WEATHER = ["", "clear", "rain", "cold", "hot", "wind", "delay"];

function emptyEntry(projectId: string): Entry {
  return {
    project_id: projectId,
    skipped: false,
    summary: "",
    crew_present: "",
    hours_worked: null,
    weather: "",
    action_items: "",
    scope_change: "",
    scope_change_amount: null,
    payment_amount: null,
    payment_method: "",
    issue: "",
    new_phase: "",
  };
}

function fmt(n: number | null) {
  if (n == null) return "--";
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export default function DailyFlow({ userName }: { userName: string }) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [alerts, setAlerts] = useState<Alerts>({ upcoming_inspections: [], open_callbacks: [] });
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [step, setStep] = useState<"alerts" | "jobs" | "review" | "done">("alerts");
  const [jobIndex, setJobIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [date, setDate] = useState("");

  // Load briefing
  useEffect(() => {
    fetch("/api/field/daily")
      .then((r) => r.json())
      .then((data) => {
        setJobs(data.jobs);
        setAlerts(data.alerts);
        setDate(data.date);
        const map = new Map<string, Entry>();
        for (const j of data.jobs) map.set(j.id, emptyEntry(j.id));
        setEntries(map);
        setLoading(false);
      });
  }, []);

  const currentJob = jobs[jobIndex] ?? null;
  const currentEntry = currentJob ? entries.get(currentJob.id) : null;

  const updateEntry = useCallback(
    (field: keyof Entry, value: Entry[keyof Entry]) => {
      if (!currentJob) return;
      setEntries((prev) => {
        const next = new Map(prev);
        const e = { ...next.get(currentJob.id)! };
        (e as Record<string, unknown>)[field] = value;
        next.set(currentJob.id, e);
        return next;
      });
    },
    [currentJob],
  );

  const handleVoiceSummary = useCallback(
    (text: string) => {
      if (!currentJob) return;
      setEntries((prev) => {
        const next = new Map(prev);
        const e = { ...next.get(currentJob.id)! };
        e.summary = e.summary ? e.summary + " " + text : text;
        next.set(currentJob.id, e);
        return next;
      });
    },
    [currentJob],
  );

  const handleVoiceIssue = useCallback(
    (text: string) => {
      if (!currentJob) return;
      setEntries((prev) => {
        const next = new Map(prev);
        const e = { ...next.get(currentJob.id)! };
        e.issue = e.issue ? e.issue + " " + text : text;
        next.set(currentJob.id, e);
        return next;
      });
    },
    [currentJob],
  );

  function nextJob() {
    if (jobIndex < jobs.length - 1) {
      setJobIndex(jobIndex + 1);
    } else {
      setStep("review");
    }
  }

  function skipJob() {
    updateEntry("skipped", true);
    nextJob();
  }

  async function submitAll() {
    setSubmitting(true);
    const allEntries = Array.from(entries.values()).filter((e) => !e.skipped && e.summary.trim());
    await fetch("/api/field/daily", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: allEntries }),
    });
    setStep("done");
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div style={S.shell}>
        <div style={S.center}>
          <div style={{ ...S.logo, fontSize: 28 }}>MHP</div>
          <div style={{ marginTop: 16, color: "#5b6470" }}>Loading today's briefing...</div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STEP: Alerts
  // =========================================================================
  if (step === "alerts") {
    const hasAlerts = alerts.upcoming_inspections.length > 0 || alerts.open_callbacks.length > 0;
    return (
      <div style={S.shell}>
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.logo}>MHP</div>
            <span style={S.title}>End-of-Day Log</span>
          </div>
          <div style={S.meta}>{date}</div>
        </div>

        <div style={S.greeting}>Hey {userName.split(" ")[0]}. {jobs.length} active jobs to cover.</div>

        {hasAlerts && (
          <div style={S.alertBox}>
            <div style={S.alertTitle}>Heads up</div>
            {alerts.upcoming_inspections.map((a, i) => (
              <div key={`insp-${i}`} style={S.alertRow}>
                <span style={S.alertIcon}>🔍</span>
                <span><b>{a.project}</b> — {a.type} inspection {a.date}</span>
              </div>
            ))}
            {alerts.open_callbacks.map((a, i) => (
              <div key={`cb-${i}`} style={S.alertRow}>
                <span style={S.alertIcon}>⚠️</span>
                <span><b>{a.project}</b> — unresolved: {a.issue}</span>
              </div>
            ))}
          </div>
        )}

        {!hasAlerts && (
          <div style={{ ...S.alertBox, background: "#e8f5e9", borderColor: "#c8e6c9" }}>
            <div style={S.alertRow}>
              <span style={S.alertIcon}>✅</span>
              <span>No alerts. Clean slate.</span>
            </div>
          </div>
        )}

        <button style={S.primaryBtn} onClick={() => setStep("jobs")}>
          Start logging ({jobs.length} jobs)
        </button>
      </div>
    );
  }

  // =========================================================================
  // STEP: Job-by-job
  // =========================================================================
  if (step === "jobs" && currentJob && currentEntry) {
    const alreadyLogged = currentJob.logged_today.length > 0;
    const progress = `${jobIndex + 1} / ${jobs.length}`;
    const balance = (currentJob.bid_value ?? 0) - currentJob.collected;

    return (
      <div style={S.shell}>
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.logo}>MHP</div>
            <span style={S.title}>{progress}</span>
          </div>
          <button style={S.skipBtn} onClick={skipJob}>Nothing happened →</button>
        </div>

        {/* Job card */}
        <div style={S.jobCard}>
          <div style={S.jobName}>{currentJob.name}</div>
          <div style={S.jobMeta}>
            {currentJob.type && <span>{currentJob.type}</span>}
            {currentJob.phase && <span style={S.pill}>{currentJob.phase}</span>}
          </div>
          <div style={S.jobNumbers}>
            <div><span style={S.numLabel}>Bid</span> <span style={S.numVal}>{fmt(currentJob.bid_value)}</span></div>
            <div><span style={S.numLabel}>Collected</span> <span style={S.numVal}>{fmt(currentJob.collected)}</span></div>
            <div><span style={S.numLabel}>Balance</span> <span style={{ ...S.numVal, color: balance > 0 ? "#2e7d32" : "#c62828" }}>{fmt(balance)}</span></div>
          </div>
          {currentJob.pending_cos.length > 0 && (
            <div style={S.coWarning}>
              {currentJob.pending_cos.length} pending CO{currentJob.pending_cos.length > 1 ? "s" : ""}: {currentJob.pending_cos.map((c) => `${c.description} (${fmt(c.amount)})`).join(", ")}
            </div>
          )}
          {alreadyLogged && (
            <div style={S.alreadyLogged}>
              Already logged today: {currentJob.logged_today.map((e) => e.summary).join(" | ")}
            </div>
          )}
        </div>

        {/* Q1: What got done? */}
        <div style={S.question}>
          <div style={S.qLabel}>What got done today?</div>
          <VoiceButton onTranscript={handleVoiceSummary} />
          <textarea
            style={S.textarea}
            placeholder="Framed the second floor, hung drywall in the master..."
            value={currentEntry.summary}
            onChange={(e) => updateEntry("summary", e.target.value)}
            rows={3}
          />
        </div>

        {/* Q2: Crew + hours */}
        <div style={S.row2}>
          <div style={{ flex: 1 }}>
            <div style={S.qLabel}>Who was there?</div>
            <input
              style={S.input}
              placeholder="Josh, Jason, Rick"
              value={currentEntry.crew_present}
              onChange={(e) => updateEntry("crew_present", e.target.value)}
            />
          </div>
          <div style={{ width: 90 }}>
            <div style={S.qLabel}>Hours</div>
            <input
              type="number"
              inputMode="decimal"
              style={S.input}
              placeholder="8"
              value={currentEntry.hours_worked ?? ""}
              onChange={(e) => updateEntry("hours_worked", e.target.value ? parseFloat(e.target.value) : null)}
            />
          </div>
          <div style={{ width: 100 }}>
            <div style={S.qLabel}>Weather</div>
            <select
              style={S.input}
              value={currentEntry.weather}
              onChange={(e) => updateEntry("weather", e.target.value)}
            >
              {WEATHER.map((w) => (
                <option key={w} value={w}>{w || "—"}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Q3: Any issues? */}
        <div style={S.question}>
          <div style={S.qLabel}>Any issues or problems?</div>
          <VoiceButton onTranscript={handleVoiceIssue} />
          <textarea
            style={S.textarea}
            placeholder="Nothing — or describe what went wrong"
            value={currentEntry.issue}
            onChange={(e) => updateEntry("issue", e.target.value)}
            rows={2}
          />
        </div>

        {/* Q4: Scope change? */}
        <div style={S.question}>
          <div style={S.qLabel}>Any scope changes?</div>
          <div style={S.row2}>
            <input
              style={{ ...S.input, flex: 1 }}
              placeholder="Added a closet in the master..."
              value={currentEntry.scope_change}
              onChange={(e) => updateEntry("scope_change", e.target.value)}
            />
            <div style={{ width: 100 }}>
              <div style={S.amountRow}>
                <span style={S.dollar}>$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  style={S.amountInput}
                  placeholder="0"
                  value={currentEntry.scope_change_amount ?? ""}
                  onChange={(e) => updateEntry("scope_change_amount", e.target.value ? parseFloat(e.target.value) : null)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Q5: Payment received? */}
        <div style={S.question}>
          <div style={S.qLabel}>Payment received today?</div>
          <div style={S.row2}>
            <div style={{ ...S.amountRow, flex: 1 }}>
              <span style={S.dollar}>$</span>
              <input
                type="number"
                inputMode="decimal"
                style={S.amountInput}
                placeholder="0"
                value={currentEntry.payment_amount ?? ""}
                onChange={(e) => updateEntry("payment_amount", e.target.value ? parseFloat(e.target.value) : null)}
              />
            </div>
            <select
              style={{ ...S.input, width: 110 }}
              value={currentEntry.payment_method}
              onChange={(e) => updateEntry("payment_method", e.target.value)}
            >
              <option value="">Method</option>
              <option value="check">Check</option>
              <option value="card">Card</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
              <option value="draw">Draw</option>
            </select>
          </div>
        </div>

        {/* Q6: What's next? */}
        <div style={S.question}>
          <div style={S.qLabel}>What needs to happen tomorrow?</div>
          <input
            style={S.input}
            placeholder="Finish drywall, sub coming for electrical..."
            value={currentEntry.action_items}
            onChange={(e) => updateEntry("action_items", e.target.value)}
          />
        </div>

        {/* Q7: Phase change? */}
        <div style={S.question}>
          <div style={S.qLabel}>Update job phase?</div>
          <div style={S.phaseRow}>
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => updateEntry("new_phase", currentEntry.new_phase === p ? "" : p)}
                style={{
                  ...S.phaseBtn,
                  ...(currentEntry.new_phase === p ? S.phaseBtnActive : {}),
                  ...(currentJob.phase === p ? { borderStyle: "dashed" as const } : {}),
                }}
              >
                {p.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        {/* Next job */}
        <button style={S.primaryBtn} onClick={nextJob}>
          {jobIndex < jobs.length - 1 ? `Next job →` : "Review & submit"}
        </button>

        <div style={{ height: 60 }} />
      </div>
    );
  }

  // =========================================================================
  // STEP: Review
  // =========================================================================
  if (step === "review") {
    const loggedEntries = Array.from(entries.values()).filter((e) => !e.skipped && e.summary.trim());
    const skippedEntries = Array.from(entries.values()).filter((e) => e.skipped);

    return (
      <div style={S.shell}>
        <div style={S.header}>
          <div style={S.headerLeft}>
            <div style={S.logo}>MHP</div>
            <span style={S.title}>Review</span>
          </div>
        </div>

        <div style={S.greeting}>
          {loggedEntries.length} jobs logged, {skippedEntries.length} skipped.
        </div>

        {loggedEntries.map((e) => {
          const job = jobs.find((j) => j.id === e.project_id);
          return (
            <div key={e.project_id} style={S.reviewCard}>
              <div style={S.reviewName}>{job?.name ?? e.project_id}</div>
              <div style={S.reviewSummary}>{e.summary}</div>
              {e.crew_present && <div style={S.reviewMeta}>Crew: {e.crew_present} | {e.hours_worked ?? "?"}h | {e.weather || "—"}</div>}
              {e.issue && <div style={{ ...S.reviewMeta, color: "#c62828" }}>Issue: {e.issue}</div>}
              {e.scope_change && <div style={S.reviewMeta}>CO: {e.scope_change} ({fmt(e.scope_change_amount)})</div>}
              {e.payment_amount && <div style={S.reviewMeta}>Payment: {fmt(e.payment_amount)} ({e.payment_method})</div>}
              {e.action_items && <div style={S.reviewMeta}>Tomorrow: {e.action_items}</div>}
              {e.new_phase && <div style={S.reviewMeta}>Phase → {e.new_phase}</div>}
            </div>
          );
        })}

        <div style={S.row2}>
          <button style={{ ...S.secondaryBtn, flex: 1 }} onClick={() => { setStep("jobs"); setJobIndex(0); }}>
            Go back
          </button>
          <button style={{ ...S.primaryBtn, flex: 2 }} onClick={submitAll} disabled={submitting}>
            {submitting ? "Saving..." : `Submit ${loggedEntries.length} logs`}
          </button>
        </div>

        <div style={{ height: 60 }} />
      </div>
    );
  }

  // =========================================================================
  // STEP: Done
  // =========================================================================
  return (
    <div style={S.shell}>
      <div style={S.center}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#111418" }}>Done for today.</div>
        <div style={{ fontSize: 15, color: "#5b6470", marginTop: 8 }}>
          All logs saved. See you tomorrow.
        </div>
        <button style={{ ...S.secondaryBtn, marginTop: 24 }} onClick={() => window.location.href = "/field"}>
          Back to Field Log
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const S: Record<string, React.CSSProperties> = {
  shell: { maxWidth: 520, margin: "0 auto", padding: "0 16px", fontFamily: "var(--sans, -apple-system, sans-serif)", minHeight: "100vh", background: "#fbfaf6" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #d8dde3", marginBottom: 16 },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  logo: { background: "#0b3d91", color: "#fff", fontWeight: 800, fontSize: 13, padding: "5px 8px", borderRadius: 6 },
  title: { fontSize: 18, fontWeight: 600, color: "#111418" },
  meta: { fontSize: 13, color: "#5b6470" },
  greeting: { fontSize: 16, color: "#111418", fontWeight: 500, marginBottom: 16, lineHeight: 1.5 },
  alertBox: { background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 10, padding: "14px 16px", marginBottom: 20 },
  alertTitle: { fontSize: 13, fontWeight: 700, color: "#f57f17", textTransform: "uppercase" as const, letterSpacing: 0.5, marginBottom: 8 },
  alertRow: { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, color: "#333", marginBottom: 6, lineHeight: 1.4 },
  alertIcon: { fontSize: 16, flexShrink: 0, marginTop: 1 },
  jobCard: { background: "#fff", border: "1px solid #d8dde3", borderRadius: 12, padding: "18px 20px", marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,.06)" },
  jobName: { fontSize: 20, fontWeight: 700, color: "#111418", marginBottom: 6 },
  jobMeta: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#5b6470", marginBottom: 12, flexWrap: "wrap" as const },
  pill: { background: "#eef3fb", color: "#0b3d91", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  jobNumbers: { display: "flex", gap: 20, marginBottom: 8 },
  numLabel: { fontSize: 11, color: "#5b6470", textTransform: "uppercase" as const, letterSpacing: 0.4, display: "block" },
  numVal: { fontSize: 18, fontWeight: 700, color: "#111418" },
  coWarning: { fontSize: 13, color: "#e65100", background: "#fff3e0", padding: "8px 12px", borderRadius: 8, marginTop: 8 },
  alreadyLogged: { fontSize: 12, color: "#5b6470", fontStyle: "italic" as const, marginTop: 8 },
  question: { marginBottom: 18 },
  qLabel: { fontSize: 14, fontWeight: 600, color: "#111418", marginBottom: 8 },
  textarea: { width: "100%", padding: 14, fontSize: 15, lineHeight: 1.5, border: "1px solid #d8dde3", borderRadius: 10, background: "#fff", color: "#111418", resize: "vertical" as const, fontFamily: "inherit", minHeight: 80 },
  input: { width: "100%", padding: "12px 14px", fontSize: 15, border: "1px solid #d8dde3", borderRadius: 10, background: "#fff", color: "#111418", fontFamily: "inherit" },
  row2: { display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 18, flexWrap: "wrap" as const },
  amountRow: { display: "flex", alignItems: "center", gap: 4, background: "#fff", border: "1px solid #d8dde3", borderRadius: 10, padding: "0 12px" },
  dollar: { fontSize: 18, fontWeight: 600, color: "#5b6470" },
  amountInput: { flex: 1, padding: "12px 6px", fontSize: 18, fontWeight: 600, border: "none", outline: "none", background: "transparent", color: "#111418", fontFamily: "inherit", width: 60 },
  phaseRow: { display: "flex", gap: 6, flexWrap: "wrap" as const },
  phaseBtn: { padding: "8px 14px", fontSize: 12, fontWeight: 600, border: "1.5px solid #d8dde3", borderRadius: 20, background: "#fff", color: "#5b6470", cursor: "pointer", fontFamily: "inherit" },
  phaseBtnActive: { borderColor: "#0b3d91", background: "#eef3fb", color: "#0b3d91" },
  primaryBtn: { width: "100%", padding: 16, fontSize: 17, fontWeight: 700, color: "#fff", background: "#0b3d91", border: "none", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", marginTop: 8 },
  secondaryBtn: { padding: "14px 20px", fontSize: 15, fontWeight: 600, color: "#0b3d91", background: "#fff", border: "1.5px solid #d8dde3", borderRadius: 12, cursor: "pointer", fontFamily: "inherit" },
  skipBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#5b6470", background: "#f5f5f5", border: "1px solid #d8dde3", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  reviewCard: { background: "#fff", border: "1px solid #d8dde3", borderRadius: 10, padding: "14px 16px", marginBottom: 10, boxShadow: "0 1px 2px rgba(0,0,0,.04)" },
  reviewName: { fontSize: 15, fontWeight: 700, color: "#111418", marginBottom: 4 },
  reviewSummary: { fontSize: 14, color: "#333", lineHeight: 1.4, marginBottom: 4 },
  reviewMeta: { fontSize: 12, color: "#5b6470", marginTop: 2 },
};
