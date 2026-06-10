// OAuth2 provider configs. Both providers are READ-ONLY by scope — the brain never writes to
// QuickBooks and never writes to (or reads beyond the dedicated box of) anyone's mailbox.
// Client id/secret/redirect come from env, never the repo.

export type ProviderId = "quickbooks" | "gmail" | "microsoft" | "trello" | "docusign" | "gbp" | "companycam";

export interface ProviderConfig {
  id: ProviderId;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  // Authorize params the provider requires to return a *durable* refresh token, not a one-shot grant.
  extraAuthParams: Record<string, string>;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} — required to build the OAuth flow.`);
  return v;
}

// Cheap, throw-free check of whether a provider's creds are present. Drives the Settings UI so we
// never render an enabled "Connect" that would 500 inside providerConfig()'s need().
const ENV_KEYS: Record<ProviderId, string[]> = {
  quickbooks: ["QB_CLIENT_ID", "QB_CLIENT_SECRET", "QB_REDIRECT_URI"],
  gmail: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REDIRECT_URI"],
  microsoft: ["MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_REDIRECT_URI"],
  // Trello is not OAuth2 — a public API key plus a user-granted member token (see lib/trello.ts).
  trello: ["TRELLO_API_KEY"],
  docusign: ["DS_CLIENT_ID", "DS_CLIENT_SECRET", "DS_REDIRECT_URI"],
  companycam: ["CC_CLIENT_ID", "CC_CLIENT_SECRET", "CC_REDIRECT_URI"],
  // GBP can share the Google app with Gmail — same client, different scopes.
  gbp: ["GBP_CLIENT_ID", "GBP_CLIENT_SECRET", "GBP_REDIRECT_URI"],
};

export function isConfigured(id: ProviderId): boolean {
  return ENV_KEYS[id].every((k) => Boolean(process.env[k]));
}

export function providerConfig(id: ProviderId): ProviderConfig {
  switch (id) {
    case "quickbooks":
      return {
        id,
        authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
        tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        scopes: ["com.intuit.quickbooks.accounting"], // read intent; we call no write endpoint
        clientId: need("QB_CLIENT_ID"),
        clientSecret: need("QB_CLIENT_SECRET"),
        redirectUri: need("QB_REDIRECT_URI"),
        extraAuthParams: {},
      };
    case "gmail":
      return {
        id,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        clientId: need("GMAIL_CLIENT_ID"),
        clientSecret: need("GMAIL_CLIENT_SECRET"),
        redirectUri: need("GMAIL_REDIRECT_URI"),
        // Without access_type=offline + prompt=consent, Google returns a one-shot access token and
        // no refresh token — the connection would die in an hour. These make it durable.
        extraAuthParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
      };
    case "docusign": {
      // account.docusign.com in prod; account-d.docusign.com for the developer sandbox.
      const dsBase = process.env.DS_AUTH_BASE ?? "https://account.docusign.com";
      return {
        id,
        authorizeUrl: `${dsBase}/oauth/auth`,
        tokenUrl: `${dsBase}/oauth/token`,
        scopes: ["signature"], // read envelopes + download completed docs; we never send
        clientId: need("DS_CLIENT_ID"),
        clientSecret: need("DS_CLIENT_SECRET"),
        redirectUri: need("DS_REDIRECT_URI"),
        extraAuthParams: {},
      };
    }
    case "companycam":
      return {
        id,
        authorizeUrl: "https://app.companycam.com/oauth/authorize",
        tokenUrl: "https://app.companycam.com/oauth/token",
        scopes: ["read"],
        clientId: need("CC_CLIENT_ID"),
        clientSecret: need("CC_CLIENT_SECRET"),
        redirectUri: need("CC_REDIRECT_URI"),
        extraAuthParams: {},
      };
    case "gbp":
      return {
        id,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: ["https://www.googleapis.com/auth/business.manage"],
        clientId: need("GBP_CLIENT_ID"),
        clientSecret: need("GBP_CLIENT_SECRET"),
        redirectUri: need("GBP_REDIRECT_URI"),
        extraAuthParams: { access_type: "offline", prompt: "consent" },
      };
    case "trello":
      // Trello uses its own authorize-fragment token flow, not OAuth2 — handled by lib/trello.ts
      // and /api/trello/connect. Nothing should ever ask for an OAuth2 config for it.
      throw new Error("trello does not use the OAuth2 flow");
    case "microsoft": {
      // Microsoft Graph — read-only Teams + OneDrive. Tenant can be "common" for multi-tenant or
      // a specific tenant ID for single-tenant (MHP's own M365). Read MS_TENANT_ID from env,
      // default to "common" so the consent screen handles it.
      const tenant = process.env.MS_TENANT_ID ?? "common";
      return {
        id,
        authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        scopes: [
          "offline_access",           // durable refresh token
          "User.Read",                // basic profile (match to brain users)
          "Chat.Read",                // 1:1 and group chats
          "ChannelMessage.Read.All",  // team channel messages
          "Team.ReadBasic.All",       // list teams
          "Channel.ReadBasic.All",    // list channels
          "Files.Read.All",           // files shared in Teams / OneDrive
          "Calendars.Read",           // upcoming events — inspections, crew schedule
        ],
        clientId: need("MS_CLIENT_ID"),
        clientSecret: need("MS_CLIENT_SECRET"),
        redirectUri: need("MS_REDIRECT_URI"),
        extraAuthParams: { response_mode: "query" },
      };
    }
  }
}
