"use client";

import { useState, useRef, useCallback } from "react";

// Browser speech recognition — works on Chrome, Edge, Safari (mobile and desktop).
// Falls back gracefully: if unsupported, the button just doesn't render.

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
  resultIndex: number;
}

export default function VoiceButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);

  const supported = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  if (!supported) return null;

  function createRecognition() {
    const SR = (window as unknown as Record<string, new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: SpeechRecognitionEvent) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error: string }) => void) | null;
      start: () => void;
      stop: () => void;
    }>).SpeechRecognition ?? (window as unknown as Record<string, new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: SpeechRecognitionEvent) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error: string }) => void) | null;
      start: () => void;
      stop: () => void;
    }>).webkitSpeechRecognition;
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";
    return r;
  }

  const toggle = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const r = createRecognition();
    recognitionRef.current = r;

    r.onresult = (e: SpeechRecognitionEvent) => {
      const last = e.results[e.resultIndex];
      const transcript = last[0].transcript;
      onTranscript(transcript);
    };

    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);

    r.start();
    setListening(true);
  }, [listening, onTranscript]);

  return (
    <button
      type="button"
      onClick={toggle}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: "100%",
        padding: "14px 16px",
        fontSize: 15,
        fontWeight: 600,
        fontFamily: "inherit",
        color: listening ? "#fff" : "#0b3d91",
        background: listening ? "#c62828" : "#eef3fb",
        border: listening ? "1.5px solid #c62828" : "1.5px solid #c2cede",
        borderRadius: 10,
        cursor: "pointer",
        transition: "all 0.15s ease",
        WebkitTapHighlightColor: "transparent",
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 20 }}>{listening ? "🔴" : "🎙️"}</span>
      {listening ? "Tap to stop recording" : "Voice memo — just talk"}
    </button>
  );
}
