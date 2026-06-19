/**
 * Edge-compatible admin session utilities.
 *
 * This module is split from `admin-auth.ts` so the Next.js middleware
 * (which runs in the Edge Runtime) can verify admin session tokens
 * WITHOUT pulling in Prisma (`db.ts`), which uses Node.js APIs
 * (`process.once`) not available at the edge.
 *
 * Only Web Crypto APIs are used here (PBKDF2, HMAC) — fully Edge-compatible.
 */

const SESSION_COOKIE = 'n10k_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

// In production this should be set via env var. We fall back to a dev key so
// the subsystem works out of the box in the sandbox.
const SESSION_SECRET =
  process.env.ADMIN_SESSION_SECRET ||
  'n10k-admin-dev-secret-change-in-production-9f2a7c4e1b8d';

export interface SessionPayload {
  sub: string; // admin user id
  username: string;
  name: string;
  iat: number; // issued at (seconds)
  exp: number; // expiration (seconds)
}

/* ------------------------------------------------------------------ */
/* Buffer <-> hex helpers (Edge-compatible)                            */
/* ------------------------------------------------------------------ */

function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

/* ------------------------------------------------------------------ */
/* Password hashing (PBKDF2 via Web Crypto)                            */
/* ------------------------------------------------------------------ */

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    KEY_LENGTH * 8,
  );
}

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  return {
    hash: bufferToHex(derived),
    salt: bufferToHex(salt.buffer),
  };
}

export async function verifyPassword(
  password: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  const saltBytes = hexToBuffer(salt);
  const derived = await deriveKey(password, saltBytes, PBKDF2_ITERATIONS);
  const derivedHex = bufferToHex(derived);
  // Constant-time comparison
  if (derivedHex.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= derivedHex.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* Session token (signed JWT-like, HMAC-SHA256)                        */
/* ------------------------------------------------------------------ */

async function hmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function base64UrlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  const sigB64 = base64UrlEncode(sig);
  return `${signingInput}.${sigB64}`;
}

export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await hmacKey();
  const sigBytes = base64UrlDecode(sigB64);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    sigBytes,
    new TextEncoder().encode(signingInput),
  );
  if (!valid) return null;
  try {
    const payloadBytes = base64UrlDecode(payloadB64);
    const payload = JSON.parse(
      new TextDecoder().decode(payloadBytes),
    ) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_COOKIE = SESSION_COOKIE;
export const ADMIN_SESSION_MAX_AGE = SESSION_MAX_AGE;

/** Verify a raw token string — Edge-compatible (used by middleware). */
export async function verifyAdminToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  return verifySession(token);
}
