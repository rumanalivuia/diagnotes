import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb, verifyPassword } from '../lib/db.js';
import { findOrProvisionNeonAccount } from '../lib/api.js';

let db;
let raw;
let dataDir;

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'diagnotes-test-'));
  process.env.DIAGNOTES_EMAIL = 'diagnotes@center.local';
  process.env.DIAGNOTES_PASSWORD = 'devpassword';
  ({ db, raw } = await openDb(dataDir));
  // openDb twice: second run exercises the idempotent migration path
  await openDb(dataDir);
});

describe('neon_sub migration (sqlite)', () => {
  it('accounts table has neon_sub column after migrate', async () => {
    const cols = raw.prepare(`PRAGMA table_info(accounts)`).all();
    assert.ok(cols.map((c) => c.name).includes('neon_sub'));
  });
});

function fakeStmts() {
  const rows = new Map(); // id -> row
  return {
    rows,
    getAccountByEmail: { get: async (email) => [...rows.values()].find((r) => r.email === email) || null },
    getAccountByNeonSub: { get: async (sub) => [...rows.values()].find((r) => r.neon_sub === sub) || null },
    insertNeonAccount: {
      run: async (id, email, hash, salt, sub, at) => {
        rows.set(id, { id, email, password_hash: hash, salt, neon_sub: sub, created_at: at });
        return { changes: 1 };
      },
    },
  };
}

describe('findOrProvisionNeonAccount', () => {
  it('binds a known email without provisioning', async () => {
    const stmts = fakeStmts();
    stmts.rows.set('acct1', { id: 'acct1', email: 'a@x.com', password_hash: 'h', salt: 's', neon_sub: null });
    const s = await findOrProvisionNeonAccount(stmts, { sub: 'neon-1', exp: 1, payload: { email: 'a@x.com' } });
    assert.equal(s.sub, 'acct1');
    assert.equal(stmts.rows.size, 1);
  });

  it('provisions an unknown email and rebinds via neon_sub', async () => {
    const stmts = fakeStmts();
    const s1 = await findOrProvisionNeonAccount(stmts, { sub: 'neon-9', exp: 1, payload: { email: 'new@x.com' } });
    assert.ok(s1.sub);
    assert.equal(stmts.rows.size, 1);
    const row = stmts.rows.get(s1.sub);
    assert.equal(row.neon_sub, 'neon-9');
    // provisioned rows must never verify via HMAC password login
    assert.equal(verifyPassword('anything', row.password_hash, row.salt), false);
    // second login with same sub but no email binds via neon_sub
    const s2 = await findOrProvisionNeonAccount(stmts, { sub: 'neon-9', exp: 2, payload: {} });
    assert.equal(s2.sub, s1.sub);
    assert.equal(stmts.rows.size, 1);
  });

  it('returns null when the token has neither email nor sub', async () => {
    const s = await findOrProvisionNeonAccount(fakeStmts(), { sub: null, exp: 1, payload: {} });
    assert.equal(s, null);
  });
});

process.on('exit', () => {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
});
