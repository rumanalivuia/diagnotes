import { openDb, readOrCreateSecret } from '../server/lib/db.js';
import { buildApi } from '../server/lib/api.js';

let cached = null;
let cachedSecret = null;

async function getHandler() {
  if (cached) return cached;
  // openDb will use DATABASE_URL from env (Neon) or fallback to sqlite /tmp
  const tmpDir = process.env.VERCEL ? '/tmp' : new URL('../server/data', import.meta.url).pathname;
  const { db } = await openDb(tmpDir);
  const secret = process.env.DIAGNOTES_SECRET || readOrCreateSecret(tmpDir);
  cached = buildApi(db, secret);
  cachedSecret = secret;
  return cached;
}

export default async function handler(req, res) {
  // CORS
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

  // Vercel rewrites /api/* -> /api? Ensure url includes original path
  // Prefer x-rewrite or original url: req.url already contains /api/...
  // If vercel.json rewrote, req.url might be /api? Use header x-matched-path?
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
