"use client";

export default function PrintButton() {
  return (
    <button className="btn" onClick={() => window.print()}>Print / Save PDF</button>
  );
}
