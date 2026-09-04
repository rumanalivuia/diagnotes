import { openDb, readOrCreateSecret } from '../server/lib/db.js';
import { buildApi } from '../server/lib/api.js';

let cached = null;
let cachedSecret = null;

/**
 * Same-origin proxy for Neon Auth.  By forwarding requests through the app's
 * own origin, the session cookie is first-party (set by the app's domain) and
 * immune to third-party cookie restrictions in all browsers.
 */
async function handleNeonAuthProxy(req, res) {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'NEON_AUTH_BASE_URL not configured' }));
  }
  const targetPath = req.url.replace(/^\/neonauth\//, '').replace(/^\//, '');
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const target = new URL(targetPath, base).toString();
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString() || undefined;
  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        Cookie: req.headers.cookie || '',
        Origin: req.headers.origin || '',
        Referer: req.headers.referer || '',
      },
      body,
      redirect: 'manual',
    });
    for (const [key, value] of upstream.headers.entries()) {
      if (/^content-encoding|content-length|transfer-encoding|connection$/i.test(key)) continue;
      res.setHeader(key, value);
    }
    const text = await upstream.text();
    res.writeHead(upstream.status);
    res.end(text);
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'neon-auth proxy failed', message: err.message }));
  }
}

async function getHandler() {
  if (cached) return cached;
  const tmpDir = process.env.VERCEL ? '/tmp' : new URL('../server/data', import.meta.url).pathname;
  const { db } = await openDb(tmpDir);
  const secret = process.env.DIAGNOTES_SECRET || readOrCreateSecret(tmpDir);
  cached = buildApi(db, secret);
  cachedSecret = secret;
  return cached;
}

export default async function handler(req, res) {
  const allowed = (process.env.CORS_ORIGIN || '*').split(',').map(s=>s.trim());
  const origin = req.headers.origin;
  if (allowed.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.url?.startsWith('/neonauth/')) {
    return handleNeonAuthProxy(req, res);
  }

  const api = await getHandler();
  const handled = await api(req, res);
  if (!handled && !res.writableEnded) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found', path: req.url }));
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};