import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Password + token primitives. All `node:crypto`, no dependencies.
 *
 * Passwords: scrypt with the parameters embedded in the stored string, so the
 * cost can be raised later without a migration —
 *   `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`
 *
 * Session tokens: 256 bits of randomness handed to the client in the cookie;
 * only their SHA-256 is stored, so a database leak can't be replayed.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(plain, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, "base64");
    expected = Buffer.from(parts[5]!, "base64");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** The raw session token that goes in the cookie. URL-safe, 256-bit. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What actually gets stored in `sessions.token_hash`. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Crockford-ish base32 without the visually ambiguous characters (0/O, 1/I/L, U).
const OTP_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** A one-time password for an invite email. ~10^14 space; pair with a short expiry. */
export function generateOtp(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += OTP_ALPHABET[randomInt(OTP_ALPHABET.length)];
  }
  return out;
}

/** Opaque per-user id — also the on-disk folder name. Passes storage.ts's USER_ID regex. */
export function generateUserId(): string {
  return randomUUID();
}
