"use client";

import { useState, useRef, useCallback } from "react";
import VoiceButton from "./VoiceButton";

type Project = { id: string; name: string };

const EVENT_TYPES = [
  { value: "daily_log", label: "Daily Log", icon: "📋", placeholder: "What got done today? Who was there?" },
  { value: "phone_call", label: "Phone Call", icon: "📞", placeholder: "Who called, what was said, what was decided?" },
  { value: "decision", label: "Decision", icon: "✅", placeholder: "What was decided? By who?" },
  { value: "change_order", label: "Change Order", icon: "📝", placeholder: "What changed? What's the cost impact?" },
  { value: "site_visit", label: "Site Visit", icon: "🏗️", placeholder: "What did you see? Any issues?" },
  { value: "issue", label: "Issue / Problem", icon: "⚠️", placeholder: "What's wrong? What needs to happen?" },
  { value: "photo", label: "Photo Note", icon: "📸", placeholder: "What are the photos of? Before/during/after?" },
  { value: "payment", label: "Payment Received", icon: "💰", placeholder: "Amount, method, from who?" },
] as const;

export default function FieldForm({
  user,
  projects,
}: {
  user: { name: string; role: string };
  projects: Project[];
}) {
  const [projectId, setProjectId] = useState("");
  const [eventType, setEventType] = useState("daily_log");
  const [summary, setSummary] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [recentLogs, setRecentLogs] = useState<{ project: string; type: string; summary: string; time: string }[]>([]);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  const handleVoice = useCallback((text: string) => {
    setSummary((prev) => (prev ? prev + " " + text : text));
  }, []);

  const selectedType = EVENT_TYPES.find((t) => t.value === eventType)!;
  const isChangeOrder = eventType === "change_order";
  const isPayment = eventType === "payment";
  const needsAmount = isChangeOrder || isPayment;

  async function submit() {
    if (!projectId || !summary.trim()) return;
    setSending(true);
    setFlash(null);

    try {
      // Log the event
      const eventRes = await fetch("/api/jobs/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          event_type: eventType,
          event_date: new Date().toISOString().slice(0, 10),
          summary: summary.trim(),
        }),
      });

      if (!eventRes.ok) throw new Error("Failed to save event");

      // If it's a change order with an amount, also create the CO record
      if (isChangeOrder && amount) {
        await fetch("/api/jobs/change-orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            description: summary.trim(),
            amount: parseFloat(amount),
          }),
        });
      }

      // If it's a payment with an amount, also create the payment record
      if (isPayment && amount) {
        await fetch("/api/jobs/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            amount: parseFloat(amount),
            payment_date: new Date().toISOString().slice(0, 10),
            notes: summary.trim(),
          }),
        });
      }

      const projName = projects.find((p) => p.id === projectId)?.name ?? projectId;
      setRecentLogs((prev) => [
        { project: projName, type: selectedType.label, summary: summary.trim(), time: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);

      setFlash({ ok: true, text: "Logged." });
      setSummary("");
      setAmount("");
      // Keep project and type selected for rapid multi-entry
      summaryRef.current?.focus();
    } catch {
      setFlash({ ok: false, text: "Failed to save. Check your connection." });
    }
    setSending(false);
  }

  return (
    <div style={styles.shell}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>MHP</div>
          <span style={styles.headerTitle}>Field Log</span>
        </div>
        <div style={styles.userName}>{user.name}</div>
      </div>

      {/* Flash message */}
      {flash && (
        <div style={{ ...styles.flash, background: flash.ok ? "#e8f5e9" : "#fbe9e7", color: flash.ok ? "#2e7d32" : "#c62828" }}>
          {flash.text}
        </div>
      )}

      {/* Project picker */}
      <div style={styles.section}>
        <label style={styles.label}>Job</label>
        <select
          style={styles.select}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">Pick a job...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Event type — big touch targets */}
      <div style={styles.section}>
        <label style={styles.label}>What happened?</label>
        <div style={styles.typeGrid}>
          {EVENT_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setEventType(t.value)}
              style={{
                ...styles.typeBtn,
                ...(eventType === t.value ? styles.typeBtnActive : {}),
              }}
            >
              <span style={styles.typeIcon}>{t.icon}</span>
              <span style={styles.typeLabel}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Voice or type */}
      <div style={styles.section}>
        <label style={styles.label}>Details</label>
        <VoiceButton onTranscript={handleVoice} />
        <textarea
          ref={summaryRef}
          style={styles.textarea}
          placeholder={selectedType.placeholder}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
        />
      </div>

      {/* Amount (for change orders and payments) */}
      {needsAmount && (
        <div style={styles.section}>
          <label style={styles.label}>{isPayment ? "Amount received" : "Cost impact"}</label>
          <div style={styles.amountRow}>
            <span style={styles.dollar}>$</span>
            <input
              type="number"
              inputMode="decimal"
              style={styles.amountInput}
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Submit */}
      <div style={styles.section}>
        <button
          onClick={submit}
          disabled={!projectId || !summary.trim() || sending}
          style={{
            ...styles.submitBtn,
            opacity: !projectId || !summary.trim() || sending ? 0.5 : 1,
          }}
        >
          {sending ? "Saving..." : "Log it"}
        </button>
      </div>

      {/* Recent entries this session */}
      {recentLogs.length > 0 && (
        <div style={styles.recentSection}>
          <div style={styles.recentHeader}>Logged this session</div>
          {recentLogs.map((log, i) => (
            <div key={i} style={styles.recentRow}>
              <div style={styles.recentMeta}>
                <span style={styles.recentTime}>{log.time}</span>
                <span style={styles.recentType}>{log.type}</span>
              </div>
              <div style={styles.recentProject}>{log.project}</div>
              <div style={styles.recentSummary}>{log.summary}</div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom spacer for mobile */}
      <div style={{ height: 80 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline styles — no CSS file needed, works in any Next.js deploy
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  shell: {
    maxWidth: 480,
    margin: "0 auto",
    padding: "0 16px",
    fontFamily: "var(--sans, -apple-system, 'Segoe UI', Roboto, sans-serif)",
    WebkitFontSmoothing: "antialiased",
    minHeight: "100vh",
    background: "#fbfaf6",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 0",
    borderBottom: "1px solid #d8dde3",
    marginBottom: 20,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logo: {
    background: "#0b3d91",
    color: "#fff",
    fontWeight: 800,
    fontSize: 13,
    padding: "5px 8px",
    borderRadius: 6,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#111418",
    letterSpacing: -0.3,
  },
  userName: {
    fontSize: 13,
    color: "#5b6470",
    fontWeight: 500,
  },
  flash: {
    padding: "12px 16px",
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 16,
    textAlign: "center" as const,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#5b6470",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  select: {
    width: "100%",
    padding: "14px 16px",
    fontSize: 16,
    border: "1px solid #d8dde3",
    borderRadius: 10,
    background: "#fff",
    color: "#111418",
    WebkitAppearance: "none" as React.CSSProperties["WebkitAppearance"],
    appearance: "auto" as React.CSSProperties["appearance"],
  },
  typeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
  },
  typeBtn: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 14px",
    border: "1.5px solid #d8dde3",
    borderRadius: 10,
    background: "#fff",
    cursor: "pointer",
    transition: "all 0.15s ease",
    WebkitTapHighlightColor: "transparent",
  },
  typeBtnActive: {
    borderColor: "#0b3d91",
    background: "#eef3fb",
    boxShadow: "0 0 0 3px rgba(11,61,145,.14)",
  },
  typeIcon: {
    fontSize: 20,
    lineHeight: 1,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "#111418",
  },
  textarea: {
    width: "100%",
    padding: 16,
    fontSize: 16,
    lineHeight: 1.5,
    border: "1px solid #d8dde3",
    borderRadius: 10,
    background: "#fff",
    color: "#111418",
    resize: "vertical" as const,
    minHeight: 120,
    fontFamily: "inherit",
  },
  amountRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "#fff",
    border: "1px solid #d8dde3",
    borderRadius: 10,
    padding: "0 16px",
  },
  dollar: {
    fontSize: 20,
    fontWeight: 600,
    color: "#5b6470",
  },
  amountInput: {
    flex: 1,
    padding: "14px 8px",
    fontSize: 20,
    fontWeight: 600,
    border: "none",
    outline: "none",
    background: "transparent",
    color: "#111418",
    fontFamily: "inherit",
  },
  submitBtn: {
    width: "100%",
    padding: "16px",
    fontSize: 17,
    fontWeight: 700,
    color: "#fff",
    background: "#0b3d91",
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    letterSpacing: -0.2,
    WebkitTapHighlightColor: "transparent",
  },
  recentSection: {
    marginTop: 12,
    borderTop: "1px solid #d8dde3",
    paddingTop: 16,
  },
  recentHeader: {
    fontSize: 13,
    fontWeight: 600,
    color: "#5b6470",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  recentRow: {
    padding: "12px 0",
    borderBottom: "1px solid #e7eaef",
  },
  recentMeta: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginBottom: 4,
  },
  recentTime: {
    fontSize: 12,
    color: "#5b6470",
  },
  recentType: {
    fontSize: 11,
    fontWeight: 600,
    color: "#0b3d91",
    background: "#eef3fb",
    padding: "2px 8px",
    borderRadius: 4,
  },
  recentProject: {
    fontSize: 14,
    fontWeight: 600,
    color: "#111418",
  },
  recentSummary: {
    fontSize: 13,
    color: "#5b6470",
    marginTop: 2,
  },
};
