/**
 * Security helpers: headers, secret validation, LIKE escaping.
 */

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Minimal CSP that allows the app's own assets + inline styles used by Vite.
  // Tighten once inline styles are removed.
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.neon.tech https://*.neon-auth.com",
};

export function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    try {
      res.setHeader(k, v);
    } catch {}
  }
  // HSTS only when not localhost (Vercel sets via edge, but harmless to set here)
  try {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  } catch {}
}

export function validateSecretOrThrow(secret, context = 'DIAGNOTES_SECRET') {
  if (!secret || typeof secret !== 'string' || secret.trim().length < 32) {
    throw new Error(
      `[diagnotes] ${context} must be at least 32 characters (got ${secret ? secret.length : 0}). Set a strong random hex secret.`
    );
  }
}

/**
 * Escape LIKE wildcards so user input does not act as a pattern.
 * Escapes \, %, _ with \ as escape char.
 */
export function escapeLike(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function likePattern(str) {
  return `%${escapeLike(str)}%`;
}
