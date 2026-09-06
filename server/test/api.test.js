import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, readOrCreateSecret } from '../lib/db.js';
import { buildApi } from '../lib/api.js';

let server, baseUrl, dataDir;

function req(method, path, body, token) {
  const url = new URL(path, baseUrl);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'diagnotes-test-'));
  process.env.DIAGNOTES_SEED_DEMO = '1';
  // Pin dev credentials explicitly: sqlite fallback defaults apply, but an
  // ambient .env.local must never leak production creds into tests.
  process.env.DIAGNOTES_EMAIL = 'diagnotes@center.local';
  process.env.DIAGNOTES_PASSWORD = 'devpassword';
  const { db } = await openDb(dataDir);
  const secret = readOrCreateSecret(dataDir);
  const api = buildApi(db, secret);
  server = createServer(async (req, res) => {
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
  // @ts-ignore — AddressInfo union includes string; we only listen on TCP
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {}
});

describe('auth', () => {
  it('rejects bad credentials', async () => {
    const r = await req('POST', '/api/auth/login', { email: 'x@x.com', password: 'nope' });
    assert.equal(r.status, 401);
  });

  it('logs in with default credentials and returns token', async () => {
    const r = await req('POST', '/api/auth/login', {
      email: 'diagnotes@center.local',
      password: 'devpassword',
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.equal(r.body.account.email, 'diagnotes@center.local');
  });

  it('trims whitespace from email on login', async () => {
    const r = await req('POST', '/api/auth/login', {
      email: '  diagnotes@center.local  ',
      password: 'devpassword',
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.equal(r.body.account.email, 'diagnotes@center.local');
  });

  it('rejects /api/auth/me without token', async () => {
    const r = await req('GET', '/api/auth/me');
    assert.equal(r.status, 401);
  });

  it('returns account info with valid token', async () => {
    const { body } = await req('POST', '/api/auth/login', {
      email: 'diagnotes@center.local',
      password: 'devpassword',
    });
    const r = await req('GET', '/api/auth/me', null, body.token);
    assert.equal(r.status, 200);
    assert.equal(r.body.account.email, 'diagnotes@center.local');
  });
});

describe('categories', () => {
  let token;
  before(async () => {
    const { body } = await req('POST', '/api/auth/login', {
      email: 'diagnotes@center.local',
      password: 'devpassword',
    });
    token = body.token;
  });

  it('lists seeded categories', async () => {
    const r = await req('GET', '/api/categories', null, token);
    assert.equal(r.status, 200);
    assert.ok(r.body.categories.length >= 5);
    const names = r.body.categories.map((c) => c.name);
    assert.ok(names.includes('Hematology'));
  });

  it('creates a new category', async () => {
    const r = await req('POST', '/api/categories', { name: 'Cytology' }, token);
    assert.equal(r.status, 201);
    assert.equal(r.body.name, 'Cytology');
  });
});

describe('comments', () => {
  let token;
  before(async () => {
    const { body } = await req('POST', '/api/auth/login', {
      email: 'diagnotes@center.local',
      password: 'devpassword',
    });
    token = body.token;
  });

  it('lists shared comments (seeded)', async () => {
    const r = await req('GET', '/api/comments?type=shared', null, token);
    assert.equal(r.status, 200);
    assert.ok(r.body.comments.length >= 5);
    assert.equal(r.body.comments[0].type, 'shared');
  });

  it('creates a personal snippet', async () => {
    const r = await req(
      'POST',
      '/api/comments',
      {
        type: 'personal',
        title: 'My quick note',
        body: [{ t: 'p', r: [{ x: 'Check sample integrity' }] }],
        tags: ['quick'],
      },
      token
    );
    assert.equal(r.status, 201);
    assert.ok(r.body.id);
  });

  it('searches by title', async () => {
    const r = await req('GET', '/api/comments?q=hemolyzed', null, token);
    assert.equal(r.status, 200);
    assert.ok(r.body.comments.some((c) => c.title.toLowerCase().includes('hemolyzed')));
  });

  it('filters by category AND tag', async () => {
    // Get a category id first
    const cats = await req('GET', '/api/categories', null, token);
    const biochem = cats.body.categories.find((c) => c.name === 'Biochemistry');
    assert.ok(biochem, 'Biochemistry category should exist');
    const r = await req(
      'GET',
      `/api/comments?type=shared&category_id=${biochem.id}&tag=hemolysis`,
      null,
      token
    );
    assert.equal(r.status, 200);
    assert.ok(r.body.comments.length >= 1);
    assert.ok(r.body.comments[0].tags.includes('hemolysis'));
  });

  it('bumps copy count', async () => {
    const list = await req('GET', '/api/comments?type=shared', null, token);
    const id = list.body.comments[0].id;
    const r = await req('POST', `/api/comments/${id}/copy`, null, token);
    assert.equal(r.status, 200);
    const updated = await req('GET', `/api/comments/${id}`, null, token);
    assert.ok(updated.body.comment.copy_count >= 1);
  });

  it('submits personal to shared library', async () => {
    const create = await req(
      'POST',
      '/api/comments',
      {
        type: 'personal',
        title: 'Submit me',
        body: [{ t: 'p', r: [{ x: 'test' }] }],
      },
      token
    );
    const r = await req('POST', `/api/comments/${create.body.id}/submit`, null, token);
    assert.equal(r.status, 200);
    const check = await req('GET', `/api/comments/${create.body.id}`, null, token);
    assert.equal(check.body.comment.type, 'shared');
    assert.equal(check.body.comment.status, 'pending_approval');
  });

  it('admin approves a pending comment', async () => {
    const create = await req(
      'POST',
      '/api/comments',
      {
        type: 'personal',
        title: 'Approve me',
        body: [{ t: 'p', r: [{ x: 'test' }] }],
      },
      token
    );
    await req('POST', `/api/comments/${create.body.id}/submit`, null, token);
    const r = await req('POST', `/api/admin/comments/${create.body.id}/approve`, null, token);
    assert.equal(r.status, 200);
    const check = await req('GET', `/api/comments/${create.body.id}`, null, token);
    assert.equal(check.body.comment.status, 'approved');
  });

  it('admin rejects with reason', async () => {
    const create = await req(
      'POST',
      '/api/comments',
      {
        type: 'personal',
        title: 'Reject me',
        body: [{ t: 'p', r: [{ x: 'test' }] }],
      },
      token
    );
    await req('POST', `/api/comments/${create.body.id}/submit`, null, token);
    const r = await req(
      'POST',
      `/api/admin/comments/${create.body.id}/reject`,
      { reason: 'Duplicate' },
      token
    );
    assert.equal(r.status, 200);
    const check = await req('GET', `/api/comments/${create.body.id}`, null, token);
    assert.equal(check.body.comment.status, 'rejected');
    assert.equal(check.body.comment.rejection_reason, 'Duplicate');
  });

  it('soft-deletes a comment', async () => {
    const create = await req(
      'POST',
      '/api/comments',
      {
        type: 'personal',
        title: 'Delete me',
        body: [{ t: 'p', r: [{ x: 'test' }] }],
      },
      token
    );
    const r = await req('DELETE', `/api/comments/${create.body.id}`, null, token);
    assert.equal(r.status, 200);
    const list = await req('GET', '/api/comments', null, token);
    assert.ok(!list.body.comments.some((c) => c.id === create.body.id));
  });
});

describe('sync', () => {
  let token;
  before(async () => {
    const { body } = await req('POST', '/api/auth/login', {
      email: 'diagnotes@center.local',
      password: 'devpassword',
    });
    token = body.token;
  });

  it('pulls all data since epoch', async () => {
    const r = await req('GET', '/api/sync?since=0', null, token);
    assert.equal(r.status, 200);
    assert.ok(r.body.comments.length >= 5);
    assert.ok(r.body.categories.length >= 5);
    assert.ok(r.body.serverTime > 0);
  });

  it('pushes offline-created comments', async () => {
    const r = await req(
      'POST',
      '/api/sync',
      {
        comments: [
          {
            id: 'offline-created-001',
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
    assert.equal(r.status, 200);
    assert.equal(r.body.created, 1);
    const check = await req('GET', '/api/comments/offline-created-001', null, token);
    assert.equal(check.status, 200);
    assert.equal(check.body.comment.title, 'Offline note');
  });
});

describe('admin stats', () => {
  let token;
  before(async () => {
    const { body } = await req('POST', '/api/auth/login', {
      email: 'diagnotes@center.local',
      password: 'devpassword',
    });
    token = body.token;
  });

  it('returns total, pending, and top copied', async () => {
    const r = await req('GET', '/api/admin/stats', null, token);
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.total === 'number');
    assert.ok(typeof r.body.pending === 'number');
    assert.ok(Array.isArray(r.body.topCopied));
  });
});
