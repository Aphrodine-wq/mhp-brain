// Shared OAuth2 spine: read-only QuickBooks + Gmail, tokens encrypted at rest, transparent refresh.
// Consumers (QB sync, Gmail invoice intake, and the FTW connection) import from here.
export { getAuthorizeUrl, exchangeCode, refreshNow, getValidAccessToken } from "./client";
export { loadConnection, type Connection } from "./store";
export { type ProviderId } from "./providers";
