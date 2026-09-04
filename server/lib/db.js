import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { SEED_NOTES } from './seedNotes.js';

export const DEMO_CATEGORIES = [
  'Hematology',
  'Biochemistry',
  'Microbiology',
  'Radiology',
  'Histopathology',
];

export const DEMO_COMMENTS = [
  {
    type: 'shared',
    title: 'Hemolyzed sample — results may be affected',
    body: [
      { t: 'p', r: [{ x: 'Sample was hemolyzed on receipt. Potassium, LDH, and AST results may be affected; interpret with caution. Hemolysis index: ' }, { x: 'moderate', b: 1 }, { x: '. Please recollect if clinically indicated.' }] },
    ],
    status: 'approved',
    category: 'Biochemistry',
    tags: ['hemolysis', 'pre-analytical', 'quality'],
  },
  {
    type: 'shared',
    title: 'No abnormality detected in visualized bowel loops',
    body: [
      { t: 'p', r: [{ x: 'No abnormality detected in the visualized bowel loops.' }] },
      { t: 'p', r: [{ x: 'Note: ', b: 1 }, { x: 'non-visualized segments cannot be excluded.' }] },
    ],
    status: 'approved',
    category: 'Radiology',
    tags: ['normal', 'bowel', 'follow-up'],
  },
  {
    type: 'shared',
    title: 'Blood culture — no growth at 48 hours',
    body: [
      { t: 'p', r: [{ x: 'No growth after 48 hours of incubation. Final report at 5 days unless clinically indicated otherwise.' }] },
    ],
    status: 'approved',
    category: 'Microbiology',
    tags: ['culture', 'no-growth'],
  },
  {
    type: 'shared',
    title: 'Requesting add-on testing',
    body: [
      { t: 'p', r: [{ x: 'Please add the following test(s) to the original specimen: ' }, { x: 'C-reactive protein', i: 1 }, { x: '. Specimen adequacy was verified prior to add-on.' }] },
    ],
    status: 'approved',
    category: 'Biochemistry',
    tags: ['add-on'],
  },
  {
    type: 'shared',
    title: 'Needle core biopsy — fragments present',
    body: [
      { t: 'ul', items: [
        { r: [{ x: 'Needle core biopsy specimen received.' }] },
        { r: [{ x: 'Sections show ' }, { x: 'three cores', b: 1 }, { x: ', total length ' }, { x: '1.2 cm', b: 1 }, { x: '.' }] },
        { r: [{ x: 'Diagnostic material present; see comment.' }] },
      ] },
    ],
    status: 'approved',
    category: 'Histopathology',
    tags: ['core-biopsy', 'specimen'],
  },
];

function loadLocalEnvIfNeeded() {
  if (process.env.DATABASE_URL) return;
  const altPath = 'E:\\HermesWorkspace\\projects\\diagnotes\\.env.local';
  try {
    if (existsSync(altPath)) {
      const content = readFileSync(altPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        let key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {}
  // also try cwd .env.local
  try {
    const cwdEnv = join(process.cwd(), '.env.local');
    if (cwdEnv !== altPath && existsSync(cwdEnv)) {
      const content = readFileSync(cwdEnv, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        let key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {}
}
loadLocalEnvIfNeeded();

function toPg(sql) {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

/** Open database: supports both sqlite (local/tests) and Postgres (Neon). */
export async function openDb(dataDir) {
  const isTest = dataDir && dataDir.includes('diagnotes-test-');
  const isPg = !!process.env.DATABASE_URL && !isTest;
  if (isPg) {
    return await openPgDb();
  } else {
    return openSqliteDb(dataDir);
  }
}

async function openPgDb() {
  const { Pool } = await import('pg');
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString, ssl: true });
  await pool.query('SELECT 1');
  await migratePg(pool);
  if (!process.env.DIAGNOTES_EMAIL) throw new Error('[diagnotes] DIAGNOTES_EMAIL environment variable is required for Postgres/production mode');
  if (!process.env.DIAGNOTES_PASSWORD) throw new Error('[diagnotes] DIAGNOTES_PASSWORD environment variable is required for Postgres/production mode');
  const env = {
    email: process.env.DIAGNOTES_EMAIL,
    password: process.env.DIAGNOTES_PASSWORD,
    seedDemo: process.env.DIAGNOTES_SEED_DEMO !== '0',
  };
  await seedAccountsPg(pool, env.email, env.password);
  const countRes = await pool.query('SELECT COUNT(*) as n FROM comments');
  const count = parseInt(countRes.rows[0].n, 10);
  if (count === 0 && env.seedDemo) {
    await seedDemoDataPg(pool);
  }
  console.log(`[diagnotes] postgres connected (${process.env.NEON_BRANCH || 'production'})`);
  return { db: wrapPgPool(pool), pool, kind: 'pg', env, fresh: count === 0 };
}

function openSqliteDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, 'diagnotes.db');
  const fresh = !existsSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrateSqlite(db);
  const env = {
    email: process.env.DIAGNOTES_EMAIL || 'diagnotes@center.local',
    password: process.env.DIAGNOTES_PASSWORD || 'devpassword',
    seedDemo: process.env.DIAGNOTES_SEED_DEMO !== '0',
  };
  if (!process.env.DIAGNOTES_EMAIL || !process.env.DIAGNOTES_PASSWORD) {
    console.warn('[diagnotes] WARNING: Using default credentials for local dev. Set DIAGNOTES_EMAIL and DIAGNOTES_PASSWORD for production.');
  }
  seedAccountsSqlite(db, env.email, env.password);
  if (fresh && env.seedDemo) seedDemoDataSqlite(db);
  return { db: wrapSqliteDb(db), raw: db, dbPath, fresh, env, kind: 'sqlite' };
}

function wrapSqliteDb(sqliteDb) {
  return {
    kind: 'sqlite',
    raw: sqliteDb,
    prepare(sql) {
      const stmt = sqliteDb.prepare(sql);
      return {
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params),
        run: (...params) => stmt.run(...params),
        getAsync: async (...params) => stmt.get(...params),
        allAsync: async (...params) => stmt.all(...params),
        runAsync: async (...params) => stmt.run(...params),
      };
    },
    exec(sql) { return sqliteDb.exec(sql); },
    async query(sql, params) {
      const hasSelect = /^\s*SELECT/i.test(sql);
      const stmt = sqliteDb.prepare(sql);
      if (hasSelect) {
        const rows = stmt.all(...(params||[]));
        return { rows };
      } else {
        stmt.run(...(params||[]));
        return { rows: [] };
      }
    }
  };
}

function wrapPgPool(pool) {
  return {
    kind: 'pg',
    pool,
    prepare(sql) {
      const pgSql = toPg(sql);
      return {
        get: async (...params) => {
          const res = await pool.query(pgSql, params);
          return res.rows[0] || null;
        },
        all: async (...params) => {
          const res = await pool.query(pgSql, params);
          return res.rows;
        },
        run: async (...params) => {
          await pool.query(pgSql, params);
          return { changes: 1 };
        },
        getAsync: async (...params) => {
          const res = await pool.query(pgSql, params);
          return res.rows[0] || null;
        },
        allAsync: async (...params) => {
          const res = await pool.query(pgSql, params);
          return res.rows;
        },
        runAsync: async (...params) => {
          await pool.query(pgSql, params);
          return { changes: 1 };
        },
      };
    },
    exec: async (sql) => { await pool.query(sql); },
    async query(sql, params) { return pool.query(sql, params); }
  };
}

async function migratePg(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL CHECK (type IN ('personal','shared')),
      title            TEXT NOT NULL,
      body             TEXT NOT NULL DEFAULT '[]',
      body_text        TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','approved','rejected')),
      category_id      TEXT,
      tags             TEXT NOT NULL DEFAULT '[]',
      rejection_reason TEXT,
      copy_count       INTEGER NOT NULL DEFAULT 0,
      deleted          INTEGER NOT NULL DEFAULT 0,
      archived         INTEGER NOT NULL DEFAULT 0,
      created_at       BIGINT NOT NULL,
      updated_at       BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_updated ON comments (updated_at);
    CREATE INDEX IF NOT EXISTS idx_categories_updated ON categories (updated_at);
  `);
}

function migrateSqlite(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      archived   INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL CHECK (type IN ('personal','shared')),
      title            TEXT NOT NULL,
      body             TEXT NOT NULL DEFAULT '[]',
      body_text        TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_approval','approved','rejected')),
      category_id      TEXT,
      tags             TEXT NOT NULL DEFAULT '[]',
      rejection_reason TEXT,
      copy_count       INTEGER NOT NULL DEFAULT 0,
      deleted          INTEGER NOT NULL DEFAULT 0,
      archived         INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_updated ON comments (updated_at);
    CREATE INDEX IF NOT EXISTS idx_categories_updated ON categories (updated_at);
  `);
}

async function seedAccountsPg(pool, email, password) {
  const res = await pool.query('SELECT id FROM accounts WHERE email = $1', [email]);
  if (res.rows.length) return;
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  await pool.query(
    'INSERT INTO accounts (id, email, password_hash, salt, created_at) VALUES ($1,$2,$3,$4,$5)',
    [uid(), email, hash, salt, now()]
  );
  console.log(`[diagnotes] created account ${email} (pg)`);
}

function seedAccountsSqlite(db, email, password) {
  const row = db.prepare('SELECT id FROM accounts WHERE email = ?').get(email);
  if (row) return;
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  db.prepare(
    'INSERT INTO accounts (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(uid(), email, hash, salt, now());
  console.log(`[diagnotes] created account ${email} (sqlite)`);
}

async function seedDemoDataPg(pool) {
  const at = now();
  for (const name of DEMO_CATEGORIES) {
    await pool.query(
      'INSERT INTO categories (id, name, archived, created_at, updated_at) VALUES ($1,$2,0,$3,$4) ON CONFLICT (name) DO NOTHING',
      [uid(), name, at, at]
    );
  }
  const catRes = await pool.query('SELECT id, name FROM categories');
  const cat = new Map(catRes.rows.map((c) => [c.name, c.id]));
  for (const c of [...DEMO_COMMENTS, ...SEED_NOTES]) {
    const body = JSON.stringify(c.body);
    await pool.query(
      `INSERT INTO comments
        (id, type, title, body, body_text, status, category_id, tags, rejection_reason,
         copy_count, deleted, archived, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,0,$11,$12) ON CONFLICT (id) DO NOTHING`,
      [uid(), c.type, c.title, body, textOf(c.body), c.status, cat.get(c.category) ?? null, JSON.stringify(c.tags), null, 0, at, at]
    );
  }
  console.log(`[diagnotes] seeded demo categories + ${DEMO_COMMENTS.length + SEED_NOTES.length} approved shared comments (pg)`);
}

function seedDemoDataSqlite(db) {
  const at = now();
  for (const name of DEMO_CATEGORIES) {
    db.prepare(
      'INSERT INTO categories (id, name, archived, created_at, updated_at) VALUES (?, ?, 0, ?, ?)'
    ).run(uid(), name, at, at);
  }
  const cat = new Map(
    db.prepare('SELECT id, name FROM categories').all().map((c) => [c.name, c.id])
  );
  const insertComment = db.prepare(
    `INSERT INTO comments
       (id, type, title, body, body_text, status, category_id, tags, rejection_reason,
        copy_count, deleted, archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  );
  for (const c of [...DEMO_COMMENTS, ...SEED_NOTES]) {
    const body = JSON.stringify(c.body);
    insertComment.run(
      uid(),
      c.type,
      c.title,
      body,
      textOf(c.body),
      c.status,
      cat.get(c.category) ?? null,
      JSON.stringify(c.tags),
      null,
      0,
      at,
      at
    );
  }
  console.log(`[diagnotes] seeded demo categories + ${DEMO_COMMENTS.length + SEED_NOTES.length} approved shared comments (sqlite)`);
}

/** Current time in epoch ms (all timestamps are ms). */
export function now() {
  return Date.now();
}

export function uid() {
  return randomBytes(16).toString('hex');
}

/** Render a blocks array to plain text (shared with web via the same contract). */
export function textOf(blocks) {
  if (!Array.isArray(blocks)) return String(blocks ?? '');
  const lines = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.t === 'ul' || b.t === 'ol') {
      for (const item of b.items || []) lines.push('• ' + runsText(item.r));
    } else {
      lines.push(runsText(b.r));
    }
  }
  return lines.join('\n').trim();
}

function runsText(runs) {
  return (runs || []).map((r) => r.x ?? '').join('');
}

/** Verify a password against the stored scrypt hash. */
export function verifyPassword(password, hashHex, saltHex) {
  const hash = scryptSync(password, saltHex, 64);
  const expected = Buffer.from(hashHex, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export function readOrCreateSecret(dataDir) {
  if (process.env.DIAGNOTES_SECRET) return process.env.DIAGNOTES_SECRET;
  if (dataDir) {
    const p = join(dataDir, '.secret');
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
    const s = randomBytes(32).toString('hex');
    try { writeFileSync(p, s, { mode: 0o600 }); } catch {}
    return s;
  }
  return randomBytes(32).toString('hex');
}

export { dirname };

