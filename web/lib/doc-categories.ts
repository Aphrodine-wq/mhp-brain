// Shared between server (documents-store) and client (upload components) — keep this
// module dependency-free so it's safe in the client bundle.
export const DOC_CATEGORIES = ["W-9", "Insurance (COI)", "Contract", "Permit", "Plan", "Other"] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];
