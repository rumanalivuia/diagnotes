import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, readOrCreateSecret } from './lib/db.js';
import { buildApi } from './lib/api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);
const DATA_DIR = process.env.DIAGNOTES_DATA || join(__dirname, 'data');

// Load .env.local if present (for Neon local dev via neon env pull)
try {
  const { readFileSync, existsSync } = await import('node:fs');
  const envLocal = join(__dirname, '..', '.env.local');
  const altEnv = 'E:\\HermesWorkspace\\projects\\diagnotes\\.env.local';
  for (const p of [envLocal, altEnv, join(process.cwd(), '.env.local')]) {
    if (existsSync(p) && !process.env.DATABASE_URL) {
      const content = readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq < 0) continue;
        let k = t.slice(0, eq).trim();
        let v = t.slice(eq+1).trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1);
        if (!process.env[k]) process.env[k] = v;
      }
      if (process.env.DATABASE_URL) break;
    }
  }
} catch {}

const { db, pool, kind } = await openDb(DATA_DIR);
const secret = readOrCreateSecret(DATA_DIR);
const api = buildApi(db, secret);

const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s=>s.trim());

const server = createServer(async (req, res) => {
  // CORS - allowlist or wildcard
  const origin = req.headers.origin || '*';
  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const handled = await api(req, res);
  if (!handled && !res.writableEnded) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`[diagnotes] server listening on http://localhost:${PORT} (${kind})`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[diagnotes] SIGTERM, closing');
  if (pool) await pool.end().catch(()=>{});
  server.close(() => process.exit(0));
});
