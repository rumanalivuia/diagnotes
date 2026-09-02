import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal HMAC-based session tokens (no external deps).
 * Token format: base64url(payload) + '.' + base64url(hmac)
 * Payload: { sub, exp }  (exp = epoch ms)
 */

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createToken(secret, subject, ttlMs = DEFAULT_TTL_MS) {
  const payload = JSON.stringify({ sub: subject, exp: Date.now() + ttlMs });
  const payloadB64 = b64(payload);
  const sig = hmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export function verifyToken(secret, token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(secret, payloadB64);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(unb64(payloadB64));
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function hmac(secret, data) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64url');
}

function unb64(s) {
  return Buffer.from(s, 'base64url').toString('utf8');
}
