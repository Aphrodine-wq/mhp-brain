import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope for OAuth tokens at rest. The key is 32 random bytes, base64 in OAUTH_ENC_KEY:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Never commit the key. It is the only thing standing between an encrypted token table and a
// plaintext one — a refresh token is a months-long key to the company's books or its mailbox.

const VERSION = "v1";
const IV_BYTES = 12;   // GCM standard nonce
const TAG_BYTES = 16;  // GCM auth tag

function key(): Buffer {
  const raw = process.env.OAUTH_ENC_KEY;
  if (!raw) throw new Error("OAUTH_ENC_KEY is not set — cannot encrypt/decrypt OAuth tokens.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error(`OAUTH_ENC_KEY must decode to 32 bytes (got ${k.length}).`);
  return k;
}

// Returns "v1:<base64(iv || tag || ciphertext)>". Versioned so the envelope can be rotated later.
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

export function decrypt(envelope: string): string {
  const sep = envelope.indexOf(":");
  const version = envelope.slice(0, sep);
  const payload = envelope.slice(sep + 1);
  if (version !== VERSION || !payload) throw new Error("Unrecognized OAuth token envelope.");
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag); // any tampering with iv/tag/ciphertext fails final() — never silent garbage
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
