// Teams alerts — the brain's voice. Posts to a Teams channel through an incoming
// webhook (TEAMS_WEBHOOK_URL — a Workflows webhook on the channel; no OAuth, no
// scopes on anyone's data). Alerts are fire-and-forget: a dead webhook must never
// break the work that triggered it.

export function alertsConfigured(): boolean {
  return Boolean(process.env.TEAMS_WEBHOOK_URL);
}

export interface Alert {
  title: string;
  lines?: string[]; // body lines, rendered as separate text blocks
  facts?: { name: string; value: string }[];
  urgent?: boolean; // red accent for money-at-risk alerts
}

// Adaptive Card via the modern Workflows webhook format. (The legacy O365 connector
// {text} shape is retired; Workflows wants a card attachment.)
function card(a: Alert) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: a.title,
              weight: "Bolder",
              size: "Medium",
              color: a.urgent ? "Attention" : "Default",
              wrap: true,
            },
            ...(a.lines ?? []).map((t) => ({ type: "TextBlock", text: t, wrap: true })),
            ...(a.facts?.length ? [{ type: "FactSet", facts: a.facts.map((f) => ({ title: f.name, value: f.value })) }] : []),
          ],
        },
      },
    ],
  };
}

/** Send an alert to the Teams channel. Never throws; returns whether it was delivered. */
export async function sendAlert(a: Alert): Promise<boolean> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card(a)),
    });
    return res.ok;
  } catch {
    return false;
  }
}
