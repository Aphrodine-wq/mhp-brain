// De-risk the shared OAuth module without hitting any provider: prove the crypto envelope
// round-trips, that tampering is rejected, and that the oauth_connections table exists.
// Run after migrate.mjs:  node scripts/oauth-smoke.mjs
import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";

// Throwaway 32-byte key just for this test run (real key lives in OAUTH_ENC_KEY / Vercel env).
process.env.OAUTH_ENC_KEY ??= randomBytes(32).toString("base64");

const { encrypt, decrypt } = await import("../lib/oauth/crypto.ts");

const secret = "1//refresh-token-with-unicode-✓-and-symbols-:/=";
const env = encrypt(secret);
if (env.includes(secret)) throw new Error("FAIL: token appears in clear inside the envelope");
if (decrypt(env) !== secret) throw new Error("FAIL: round-trip mismatch");
console.log("crypto round-trip: OK   (envelope:", env.slice(0, 28) + "...)");

// Flip one ciphertext char — the GCM auth tag must reject it, not return garbage.
let rejected = false;
const flipped = env.slice(0, -1) + (env.endsWith("A") ? "B" : "A");
try { decrypt(flipped); } catch { rejected = true; }
console.log("tamper rejected:  ", rejected ? "OK" : "FAIL");

const db = createClient({ url: "file:/Users/jameswalton/Projects/mhp-brain/mhp.db" });
const cols = (await db.execute("PRAGMA table_info(oauth_connections)")).rows.map((r) => r.name);
console.log("oauth table cols: ", cols.length ? cols.join(", ") : "(missing — run migrate.mjs first)");

if (!rejected || !cols.length) process.exit(1);
console.log("\nshared OAuth module: verified");
