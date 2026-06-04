// OAuth2 provider configs. Both providers are READ-ONLY by scope — the brain never writes to
// QuickBooks and never writes to (or reads beyond the dedicated box of) anyone's mailbox.
// Client id/secret/redirect come from env, never the repo.

export type ProviderId = "quickbooks" | "gmail";

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
  }
}
