// Shared display helpers — mirror the original PAGE's money() + BADGE map.

export const money = (n: number | null | undefined): string =>
  "$" + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const BADGE: Record<string, string> = {
  Active: "active",
  Aging: "aging",
  Bid: "bid",
  Paused: "paused",
  Complete: "complete",
  "Likely Done": "done",
  Dead: "dead",
  Unknown: "unknown",
};

export const initials = (name: string): string =>
  name
    .split(" ")
    .filter((w) => /[A-Z]/.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
