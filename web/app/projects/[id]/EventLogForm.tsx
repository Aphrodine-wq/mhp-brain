"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/client";

const EVENT_TYPES = ["daily_log", "phone_call", "site_visit", "decision", "note", "meeting"];
const WEATHER = ["clear", "rain", "delay"];

export interface JobEvent {
  id: number;
  event_type: string;
  event_date: string;
  summary: string;
  detail: string | null;
  crew_present: string | null;
  hours_worked: number | null;
  weather: string | null;
  logged_by: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function EventLogForm({
  projectId,
  events,
  canWrite,
}: {
  projectId: string;
  events: JobEvent[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("daily_log");
  const [date, setDate] = useState(today());
  const [summary, setSummary] = useState("");
  const [crew, setCrew] = useState("");
  const [hours, setHours] = useState("");
  const [weather, setWeather] = useState("");

  async function add() {
    if (!summary.trim()) return;
    setBusy(true);
    try {
      await post("/api/jobs/events", {
        project_id: projectId,
        event_type: type,
        event_date: date,
        summary: summary.trim(),
        crew_present: type === "daily_log" && crew ? crew : undefined,
        hours_worked: type === "daily_log" && hours ? Number(hours) : undefined,
        weather: type === "daily_log" && weather ? weather : undefined,
      });
      setSummary(""); setCrew(""); setHours(""); setWeather("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {canWrite && (
        <div className="setrow" style={{ flexWrap: "wrap" }}>
          <div className="actions" style={{ justifyContent: "flex-start", flex: 1 }}>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            <input className="mk" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="mk" style={{ flex: 1, minWidth: 220 }} placeholder="What happened?"
                   value={summary} onChange={(e) => setSummary(e.target.value)} />
            {type === "daily_log" && (
              <>
                <input className="mk" style={{ width: 160 }} placeholder="Crew present" value={crew} onChange={(e) => setCrew(e.target.value)} />
                <input className="mk" style={{ width: 90 }} type="number" step="0.5" placeholder="Hours" value={hours} onChange={(e) => setHours(e.target.value)} />
                <select value={weather} onChange={(e) => setWeather(e.target.value)}>
                  <option value="">weather</option>
                  {WEATHER.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </>
            )}
            <button className="btn sm" disabled={busy || !summary.trim()} onClick={add}>
              {busy ? "Logging…" : "Log it"}
            </button>
          </div>
        </div>
      )}
      {events.length === 0 ? (
        <div className="empty" style={{ padding: "28px 20px" }}>
          <div className="big">No events logged</div>
          Daily logs, calls, and site visits land here.
        </div>
      ) : (
        events.map((ev) => (
          <div className="setrow" key={ev.id}>
            <div>
              <div className="sl">{ev.summary}</div>
              <div className="sd">
                {ev.event_type.replace("_", " ")} · {ev.event_date}
                {ev.crew_present ? ` · crew: ${ev.crew_present}` : ""}
                {ev.hours_worked != null ? ` · ${ev.hours_worked}h` : ""}
                {ev.weather ? ` · ${ev.weather}` : ""}
                {ev.logged_by ? ` · ${ev.logged_by}` : ""}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
