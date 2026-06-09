// Shared OAuth2 spine: read-only QuickBooks + Gmail + Microsoft Teams, tokens encrypted at rest,
// transparent refresh. Consumers (QB sync, Gmail invoice intake, Teams sync, FTW) import from here.
export { getAuthorizeUrl, exchangeCode, refreshNow, getValidAccessToken, disconnect, ReconnectRequiredError } from "./client";
export { loadConnection, accountsForProvider, type Connection } from "./store";
export { type ProviderId } from "./providers";
