import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";

// AES-256-GCM token envelope. This is the only thing between an encrypted token table and a
// plaintext one (a refresh token is a months-long key to the company's books/mailbox), so the
// round-trip, tamper detection, and key validation are all load-bearing. Real crypto, no mocks.
import { encrypt, decrypt } from "@/lib/oauth/crypto";

const goodKey = randomBytes(32).toString("base64");
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.OAUTH_ENC_KEY;
  process.env.OAUTH_ENC_KEY = goodKey;
});
afterEach(() => {
  if (saved === undefined) delete process.env.OAUTH_ENC_KEY;
  else process.env.OAUTH_ENC_KEY = saved;
});

describe("oauth/crypto — AES-256-GCM token envelope", () => {
  it("round-trips a token (encrypt then decrypt returns the original)", () => {
    const token = "ya29.a0Af-secret-refresh-token";
    expect(decrypt(encrypt(token))).toBe(token);
  });

  it("produces a fresh IV each call — same plaintext encrypts to different envelopes", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b)); // ...but both still decrypt to the same value
  });

  it("emits the versioned v1: envelope", () => {
    expect(encrypt("x").startsWith("v1:")).toBe(true);
  });

  it("rejects a tampered ciphertext (GCM auth tag fails — never silent garbage)", () => {
    const env = encrypt("important-token");
    const buf = Buffer.from(env.slice(3), "base64");
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    const tampered = `v1:${buf.toString("base64")}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const env = encrypt("important-token");
    const buf = Buffer.from(env.slice(3), "base64");
    buf[12] ^= 0xff; // tag starts after the 12-byte IV
    expect(() => decrypt(`v1:${buf.toString("base64")}`)).toThrow();
  });

  it("rejects an unrecognized envelope version or empty payload", () => {
    expect(() => decrypt("v2:abcd")).toThrow(/envelope/i);
    expect(() => decrypt("v1:")).toThrow(/envelope/i);
  });

  it("refuses to operate without a key, and rejects a wrong-length key", () => {
    delete process.env.OAUTH_ENC_KEY;
    expect(() => encrypt("x")).toThrow(/OAUTH_ENC_KEY is not set/);
    process.env.OAUTH_ENC_KEY = Buffer.from("tooshort").toString("base64");
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });

  it("cannot decrypt a token sealed under a different key", () => {
    const env = encrypt("token");
    process.env.OAUTH_ENC_KEY = randomBytes(32).toString("base64"); // rotate to a different key
    expect(() => decrypt(env)).toThrow();
  });
});
