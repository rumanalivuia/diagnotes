import { createAuthClient } from '@neondatabase/neon-js/auth';
import { store } from './store.js';

/**
 * Neon Auth (Managed Better Auth) session + JWT plumbing.
 *
 * Two modes, chosen at build time:
 * - VITE_NEON_AUTH_URL set  -> multi-user Neon Auth (sign-up + sign-in).
 *   API calls carry a short-lived JWT from authClient.token() as the Bearer
 *   token; the server verifies it against the JWKS and auto-provisions the
 *   account on first login.
 * - unset                    -> legacy single shared HMAC login (local dev).
 */

const NEON_URL = import.meta.env.VITE_NEON_AUTH_URL;

// When VITE_NEON_AUTH_URL is absolute (e.g. https://*.neon.tech/...), the auth
// service is cross-origin — credentials:'include' is needed for the session
// cookie to be sent.  On production the URL is a relative path (/neonauth) and
// the serverless function proxies to the real auth service, making the cookie
// first-party — no third-party restrictions.
const isRelative = NEON_URL && !/^https?:\/\//i.test(NEON_URL);

let authClient = null;
if (NEON_URL) {
  try {
    authClient = createAuthClient(NEON_URL, {
      fetchOptions: { credentials: isRelative ? 'same-origin' : 'include' },
    });
  } catch (e) {
    console.error('[neonAuth] createAuthClient failed — falling back to legacy login:', e);
  }
}
export { authClient };

export const isNeonAuth = !!authClient;

let cached = null; // { token, expMs }

function parseExpMs(jwt) {
  try {
    const seg = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(seg));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Fresh-ish JWT, refreshing when missing, forced, or expiring within 60s. */
export async function getNeonToken(force = false) {
  if (!authClient) throw new Error('neon auth not configured');
  if (!force && cached && cached.expMs - Date.now() > 60_000) return cached.token;
  const { data, error } = await authClient.token();
  if (error || !data?.token) throw new Error(error?.message || 'neon-token-unavailable');
  cached = { token: data.token, expMs: parseExpMs(data.token) ?? Date.now() + 14 * 60_000 };
  return cached.token;
}

export async function refreshNeonToken() {
  return getNeonToken(true);
}

export function clearNeonTokenCache() {
  cached = null;
}

/** Bearer token for API calls in either mode. */
export async function getAuthToken() {
  if (authClient) return getNeonToken();
  return store.kvGet('token');
}

export function friendlyAuthError(err, fallback) {
  const msg = (err?.message || err?.error?.message || '').toLowerCase();
  const code = (err?.code || err?.error?.code || '').toUpperCase();
  if (/neon-token-unavailable/i.test(msg)) return 'Session expired - please sign in again';
  if (/invalid email or password|invalid credentials|unauthorized/i.test(msg)) return 'Invalid email or password';
  if (/user already exists|already.*registered|already.*exists/i.test(msg)) return 'An account with this email already exists — sign in instead';
  if (code === 'PASSWORD_TOO_SHORT' || /password.*(short|weak|length|8|characters|min)/i.test(msg)) return 'Password is too short — use at least 8 characters';
  if (code === 'INVALID_PASSWORD' || /invalid.*password|password.*invalid|password.*not.*valid/i.test(msg)) return 'Password must be at least 8 characters';
  if (/password.*required/i.test(msg)) return 'Password is required';
  if (/email.*invalid|invalid.*email/i.test(msg)) return 'Please enter a valid email address';
  if (code === 'USER_ALREADY_EXISTS') return 'An account with this email already exists — sign in instead';
  return (err?.message || err?.error?.message || '') || fallback;
}


