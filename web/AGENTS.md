<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# The write-back pattern

Every mutation in this app follows one contract. Precedents: `writeOverride()` in
`lib/overrides.ts` and `auditedUpdate()` in `lib/operations.ts`. New write paths copy
them, not improvise.

1. **Route gate:** `requireRole("editor")` minimum (`"ceo"` for integrations, `"admin"`
   for user management). Return 401 from the gate, 400 on missing fields.
2. **Actor is server-side:** always `user.name` from the session. Never accept an
   actor/author/by field from the request body.
3. **No request keys in SQL:** dynamic UPDATE column names must come from a hardcoded
   `ReadonlySet` allowlist. Unknown keys throw `OpsError` → route returns 400.
   Interpolating a body key into SQL is an injection — this happened once
   (`updateProjectOps`, fixed 2026-06-10); don't reintroduce it.
4. **Audit everything:** every mutation appends `audit_log` rows (ts, actor,
   entity_type, entity_id, entity_label, field, old_value, new_value, action).
   Read the old value BEFORE writing, inside the same transaction.
5. **Transactions:** multi-statement writes (the write + its audit rows) go through
   `db.transaction("write")` with commit/rollback.
6. **UI side:** client component does a busy-state `fetch`, then `router.refresh()`
   on success (see `ProjectsTable.tsx` posting to `/api/override/status`).
   Revalidation over optimistic state — server components re-read.
