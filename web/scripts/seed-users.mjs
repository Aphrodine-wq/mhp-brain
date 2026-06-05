// Seed or update a user (idempotent on email). Hashing matches lib/auth.ts exactly
// (scrypt, 16-byte salt, 64-byte key, hex), so seeded users verify through the login flow.
//
// Usage:
//   SEED_EMAIL=james@mshomepros.com SEED_NAME="James Burge" SEED_PASSWORD='…' SEED_ROLE=admin \
//     node scripts/seed-users.mjs
//
// Roles: admin | ceo | field | estimator | sales | materials | editor | viewer.
import { Pool } from "pg";
import { randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt);

const email = (process.env.SEED_EMAIL || "").trim().toLowerCase();
const name = (process.env.SEED_NAME || "").trim();
const password = process.env.SEED_PASSWORD || "";
const role = process.env.SEED_ROLE || "admin";
const scope = process.env.SEED_SCOPE || null;

if (!email || !name || !password) {
  console.error("Need SEED_EMAIL, SEED_NAME, SEED_PASSWORD.");
  process.exit(1);
}
const VALID_ROLES = ["admin", "ceo", "field", "estimator", "sales", "materials", "editor", "viewer"];
if (!VALID_ROLES.includes(role)) {
  console.error(`SEED_ROLE must be one of: ${VALID_ROLES.join(" | ")}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = (await scrypt(password, salt, 64)).toString("hex");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
  `INSERT INTO users (name, email, role, pass_hash, salt, scope, active)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
   ON CONFLICT (email) DO UPDATE SET
     name = excluded.name, role = excluded.role, pass_hash = excluded.pass_hash,
     salt = excluded.salt, scope = excluded.scope, active = 1`,
  [name, email, role, hash, salt.toString("hex"), scope],
);
await pool.end();
console.log(`seeded ${role}: ${email}`);
