/**
 * End-to-end smoke test: starts the server on a temp SQLite DB, hits every
 * major API endpoint, and validates responses.  Run with:
 *   node server/test/e2e-smoke.mjs
 */
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, readOrCreateSecret } from '../lib/db.js';
import { buildApi } from '../lib/api.js';

process.env.DIAGNOTES_SEED_DEMO = '1';
process.env.DIAGNOTES_EMAIL = 'diagnotes@center.local';
process.env.DIAGNOTES_PASSWORD = 'devpassword';

const dataDir = mkdtempSync(join(tmpdir(), 'diagnotes-test-e2e-'));
const { db } = await openDb(dataDir);
const secret = readOrCreateSecret(dataDir);
const api = buildApi(db, secret);

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const handled = await api(req, res);
  if (!handled && !res.writableEnded) {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

let pass = 0,
  fail = 0;
function ok(label, cond) {
  if (cond) {
    pass++;
    console.log(`  ✔ ${label}`);
  } else {
    fail++;
    console.error(`  ✘ ${label}`);
  }
}

function req(method, path, body, token) {
  const url = new URL(path, baseUrl);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined }).then(
    async (r) => ({ status: r.status, body: await r.json() })
  );
}

async function run() {
  console.log('\n── Auth ──');
  let r = await req('POST', '/api/auth/login', { email: 'bad@x.com', password: 'nope' });
  ok('rejects bad credentials', r.status === 401);

  r = await req('POST', '/api/auth/login', {
    email: 'diagnotes@center.local',
    password: 'devpassword',
  });
  ok('login succeeds', r.status === 200 && !!r.body.token);
  const token = r.body.token;

  r = await req('POST', '/api/auth/login', {
    email: '  diagnotes@center.local  ',
    password: 'devpassword',
  });
  ok('trims email whitespace', r.status === 200 && !!r.body.token);

  r = await req('GET', '/api/auth/me');
  ok('rejects me without token', r.status === 401);

  r = await req('GET', '/api/auth/me', null, token);
  ok('me returns account', r.status === 200 && r.body.account.email === 'diagnotes@center.local');

  console.log('\n── Categories ──');
  r = await req('GET', '/api/categories', null, token);
  ok('lists categories (>=5)', r.status === 200 && r.body.categories.length >= 5);

  r = await req('POST', '/api/categories', { name: 'E2E-Test' }, token);
  ok('creates category', r.status === 201 && r.body.name === 'E2E-Test');

  console.log('\n── Comments ──');
  r = await req('GET', '/api/comments?type=shared', null, token);
  ok('lists shared comments (>=5)', r.status === 200 && r.body.comments.length >= 5);

  r = await req(
    'POST',
    '/api/comments',
    {
      type: 'personal',
      title: 'E2E test note',
      body: [{ t: 'p', r: [{ x: 'Created by e2e smoke test' }] }],
      tags: ['e2e'],
    },
    token
  );
  ok('creates personal snippet', r.status === 201 && !!r.body.id);
  const noteId = r.body.id;

  r = await req('GET', `/api/comments/${noteId}`, null, token);
  ok('fetches snippet by id', r.status === 200 && r.body.comment.title === 'E2E test note');

  r = await req('GET', '/api/comments?q=E2E', null, token);
  ok(
    'search finds snippet',
    r.status === 200 && r.body.comments.some((c) => c.title.includes('E2E'))
  );

  r = await req('POST', `/api/comments/${noteId}/copy`, null, token);
  ok('bumps copy count', r.status === 200);

  r = await req('POST', `/api/comments/${noteId}/submit`, null, token);
  ok('submits to shared library', r.status === 200);

  r = await req('GET', `/api/comments/${noteId}`, null, token);
  ok('status is pending_approval', r.body.comment.status === 'pending_approval');

  r = await req('POST', `/api/admin/comments/${noteId}/approve`, null, token);
  ok('admin approves', r.status === 200);

  r = await req('GET', `/api/comments/${noteId}`, null, token);
  ok('status is approved', r.body.comment.status === 'approved');

  // reject
  const rejectNote = await req(
    'POST',
    '/api/comments',
    {
      type: 'personal',
      title: 'Reject me',
      body: [{ t: 'p', r: [{ x: 'test' }] }],
    },
    token
  );
  await req('POST', `/api/comments/${rejectNote.body.id}/submit`, null, token);
  r = await req(
    'POST',
    `/api/admin/comments/${rejectNote.body.id}/reject`,
    { reason: 'Duplicate' },
    token
  );
  ok('admin rejects', r.status === 200);
  r = await req('GET', `/api/comments/${rejectNote.body.id}`, null, token);
  ok('rejection reason stored', r.body.comment.rejection_reason === 'Duplicate');

  // delete
  const delNote = await req(
    'POST',
    '/api/comments',
    {
      type: 'personal',
      title: 'Delete me',
      body: [{ t: 'p', r: [{ x: 'test' }] }],
    },
    token
  );
  r = await req('DELETE', `/api/comments/${delNote.body.id}`, null, token);
  ok('soft-deletes comment', r.status === 200);

  console.log('\n── Sync ──');
  r = await req('GET', '/api/sync?since=0', null, token);
  ok('sync pull works', r.status === 200 && r.body.comments.length >= 5 && r.body.serverTime > 0);

  r = await req(
    'POST',
    '/api/sync',
    {
      comments: [
        {
          id: 'e2e-offline-001',
          type: 'personal',
          title: 'Offline note',
          body: [{ t: 'p', r: [{ x: 'created offline' }] }],
          tags: ['offline'],
          status: 'draft',
          created_at: Date.now() - 1000,
          updated_at: Date.now() - 1000,
        },
      ],
    },
    token
  );
  ok('sync push creates offline comment', r.status === 200 && r.body.created === 1);

  r = await req('GET', '/api/comments/e2e-offline-001', null, token);
  ok('offline comment accessible', r.status === 200 && r.body.comment.title === 'Offline note');

  console.log('\n── Admin Stats ──');
  r = await req('GET', '/api/admin/stats', null, token);
  ok(
    'stats endpoint works',
    r.status === 200 && typeof r.body.total === 'number' && Array.isArray(r.body.topCopied)
  );

  console.log(`\n── Results: ${pass} passed, ${fail} failed ──`);
  server.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
