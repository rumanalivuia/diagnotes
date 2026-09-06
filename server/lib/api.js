import { uid, now, textOf, verifyPassword, getAdminCount } from './db.js';
import { createToken, verifyToken } from './auth.js';
import { isRateLimited } from './rateLimit.js';
import { likePattern } from './security.js';
import { json, readBody, badRequest } from './http.js';
import {
  parse,
  loginSchema,
  createCategorySchema,
  updateCategorySchema,
  createCommentSchema,
  updateCommentSchema,
  rejectSchema,
} from './validate.js';

let jwksCache = null;
async function verifyNeonAuth(token) {
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!jwksUrl || !token || token.split('.').length !== 3) return null;
  // Constrain tokens to this Neon Auth instance. Per Neon docs the JWT issuer
  // is the *origin* of NEON_AUTH_BASE_URL (e.g. base
  // https://ep-xx.aws.neon.tech/neondb/auth -> issuer https://ep-xx.aws.neon.tech).
  // No `audience` check: Better Auth JWTs carry no aud claim and jose rejects
  // tokens that lack a claim listed in options — pinning aud would break login.
  let issuer;
  try {
    issuer = new URL(process.env.NEON_AUTH_BASE_URL || jwksUrl).origin;
  } catch {
    return null;
  }
  try {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    if (!jwksCache) {
      jwksCache = createRemoteJWKSet(new URL(jwksUrl));
    }
    // Constrain token to this Neon Auth instance (see issuer derivation above)
    const jwtOptions = { issuer };
    const { payload } = await jwtVerify(token, jwksCache, jwtOptions);
    // Neon Auth payload should have sub
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      exp: payload.exp ? payload.exp * 1000 : Date.now() + 3600000,
      payload,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Resolve a verified Neon Auth principal to a local account, provisioning one
 * on first login (open signup). Neon-provisioned rows carry empty
 * password_hash/salt so they can never authenticate via the HMAC login path
 * (verifyPassword fails on length mismatch).
 */
export async function findOrProvisionNeonAccount(stmts, neon, db) {
  const email = neon.payload?.email?.trim();
  if (email) {
    const acct = await stmts.getAccountByEmail.get(email);
    if (acct) return { sub: acct.id, exp: neon.exp, role: acct.role || 'user' };
  }
  if (neon.sub) {
    const bySub = await stmts.getAccountByNeonSub.get(neon.sub);
    if (bySub) return { sub: bySub.id, exp: neon.exp, role: bySub.role || 'user' };
    const id = uid();
    // First-ever Neon Auth signup becomes admin
    const role = (await getAdminCount(db)) === 0 ? 'admin' : 'user';
    await stmts.insertNeonAccount.run(
      id,
      email || `neon_${neon.sub}@users.local`,
      '',
      '',
      neon.sub,
      role,
      now()
    );
    return { sub: id, exp: neon.exp, role };
  }
  return null;
}

/**
 * Build the API router.  Returns a function (req, res) => boolean.
 * Every handler returns true if it handled the request, false otherwise.
 */
export function buildApi(db, secret) {
  const stmts = prepareAll(db);
  const _db = db; // ref for findOrProvisionNeonAccount admin check

  /* ── helpers ─────────────────────────────────────────────── */

  // json / readBody now imported from ./http.js; keep auth helpers here

  async function auth(req) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null;
    // Try Neon Auth first if configured
    if (process.env.NEON_AUTH_JWKS_URL) {
      const neon = await verifyNeonAuth(token);
      if (neon) return findOrProvisionNeonAccount(stmts, neon, _db);
    }
    return verifyToken(secret, token);
  }

  async function requireAuth(req, res) {
    const session = await auth(req);
    if (!session) {
      json(res, 401, { error: 'unauthorized' });
      return null;
    }
    return session;
  }

  async function optionalAuth(req) {
    try {
      return await auth(req);
    } catch {
      return null;
    }
  }

  async function requireAdmin(req, res) {
    const session = await requireAuth(req, res);
    if (!session) return null;
    const acct = await stmts.getAccountById.get(session.sub);
    if (!acct || acct.role !== 'admin') {
      json(res, 403, { error: 'admin access required' });
      return null;
    }
    return session;
  }

  /* ── routes ──────────────────────────────────────────────── */

  return async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const method = req.method;

    try {
      // Health
      if (p === '/api/health' && method === 'GET') {
        return json(res, 200, {
          ok: true,
          branch: process.env.NEON_BRANCH || 'local',
          time: now(),
        });
      }
      if (p === '/health' && method === 'GET') {
        return json(res, 200, { ok: true });
      }
      // ── Auth ──
      if (p === '/api/auth/login' && method === 'POST') {
        // Rate limit: 30/min per IP, 20/min per email (best-effort in-memory; bypass in test)
        const isTest =
          process.env.NODE_ENV === 'test' ||
          (process.env.DIAGNOTES_TEST_BYPASS_RATELIMIT ?? '') === '1';
        if (!isTest) {
          const ip =
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress ||
            'unknown';
          const ipCheck = isRateLimited(`login:ip:${ip}`, 30, 60_000);
          if (ipCheck.limited) {
            res.setHeader('Retry-After', String(ipCheck.retryAfter));
            return json(res, 429, { error: 'too many login attempts, try again later' });
          }
        }
        const raw = await readBody(req);
        const parsed = parse(loginSchema, raw);
        if (!parsed.ok) return badRequest(res, 'invalid request', parsed.error);
        const body = parsed.data;
        if (!body.email || !body.password)
          return json(res, 400, { error: 'email and password required' });
        if (!isTest) {
          const emailKey = `login:email:${String(body.email).toLowerCase().trim()}`;
          const emailCheck = isRateLimited(emailKey, 20, 60_000);
          if (emailCheck.limited) {
            res.setHeader('Retry-After', String(emailCheck.retryAfter));
            return json(res, 429, { error: 'too many login attempts, try again later' });
          }
        }
        const acct = await stmts.getAccountByEmail.get(body.email.trim());
        if (!acct || !verifyPassword(body.password, acct.password_hash, acct.salt))
          return json(res, 401, { error: 'invalid credentials' });
        const token = createToken(secret, acct.id);
        return json(res, 200, {
          token,
          account: { id: acct.id, email: acct.email, role: acct.role || 'user' },
        });
      }

      if (p === '/api/auth/me' && method === 'GET') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const acct = await stmts.getAccountById.get(session.sub);
        if (!acct) return json(res, 404, { error: 'account not found' });
        return json(res, 200, {
          account: { id: acct.id, email: acct.email, role: acct.role || 'user' },
        });
      }

      // ── Categories ──
      if (p === '/api/categories' && method === 'GET') {
        await optionalAuth(req); // public read
        const rows = await stmts.listCategories.all();
        return json(res, 200, { categories: rows });
      }

      if (p === '/api/categories' && method === 'POST') {
        const session = await requireAdmin(req, res);
        if (!session) return;
        const raw = await readBody(req);
        const parsed = parse(createCategorySchema, raw);
        if (!parsed.ok) return badRequest(res, 'invalid request', parsed.error);
        const body = parsed.data;
        if (!body.name) return json(res, 400, { error: 'name required' });
        const id = uid();
        const t = now();
        await stmts.insertCategory.run(id, body.name.trim(), 0, t, t);
        return json(res, 201, {
          id,
          name: body.name.trim(),
          archived: 0,
          created_at: t,
          updated_at: t,
        });
      }

      const catMatch = p.match(/^\/api\/categories\/([A-Za-z0-9_-]+)$/);
      if (catMatch && method === 'PATCH') {
        const session = await requireAdmin(req, res);
        if (!session) return;
        const rawCat = await readBody(req);
        const catParsed = parse(updateCategorySchema, rawCat);
        if (!catParsed.ok) return badRequest(res, 'invalid request', catParsed.error);
        const body = catParsed.data;
        const existing = await stmts.getCategoryById.get(catMatch[1]);
        if (!existing) return json(res, 404, { error: 'not found' });
        const name = body.name ?? existing.name;
        const archived = body.archived ?? existing.archived;
        const t = now();
        await stmts.updateCategory.run(name, archived, t, catMatch[1]);
        return json(res, 200, { id: catMatch[1], name, archived, updated_at: t });
      }

      // ── Comments ──
      if (p === '/api/comments' && method === 'GET') {
        const session = await optionalAuth(req);
        const sp = url.searchParams;
        let type = sp.get('type');
        let status = sp.get('status');
        const category = sp.get('category_id');
        const tag = sp.get('tag');
        const q = sp.get('q');
        const since = sp.get('since');
        const limit = Math.min(parseInt(sp.get('limit') || '200', 10), 500);

        // Public visitors can only see approved shared comments
        if (!session) {
          type = 'shared';
          status = 'approved';
        }

        let rows;
        if (since && session) {
          rows = await stmts.syncComments.all(Number(since));
        } else if (q) {
          const pat = likePattern(q);
          if (!session) {
            rows = await stmts.searchPublicComments.all(pat, pat, limit);
          } else {
            rows = await stmts.searchComments.all(pat, pat, limit);
          }
        } else if (type && category && tag) {
          rows = await stmts.filterCommentsTypeCatTag.all(type, category, likePattern(tag), limit);
        } else if (type && category) {
          rows = await stmts.filterCommentsTypeCat.all(type, category, limit);
        } else if (type && tag) {
          rows = await stmts.filterCommentsTypeTag.all(type, likePattern(tag), limit);
        } else if (category && tag) {
          rows = await stmts.filterCommentsCatTag.all(category, likePattern(tag), limit);
        } else if (type) {
          rows = await stmts.filterCommentsType.all(type, limit);
        } else if (category) {
          rows = await stmts.filterCommentsCat.all(category, limit);
        } else if (tag) {
          rows = await stmts.filterCommentsTag.all(likePattern(tag), limit);
        } else {
          rows = !session
            ? await stmts.listPublicComments.all(limit)
            : await stmts.listComments.all(limit);
        }
        return json(res, 200, { comments: rows.map(decodeComment) });
      }

      if (p === '/api/comments' && method === 'POST') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const rawC = await readBody(req);
        const cParsed = parse(createCommentSchema, rawC);
        if (!cParsed.ok) return badRequest(res, 'invalid request', cParsed.error);
        const body = cParsed.data;
        if (!body.title) return json(res, 400, { error: 'title required' });
        const id = uid();
        const t = now();
        const commentBody = body.body ?? [];
        await stmts.insertComment.run(
          id,
          body.type || 'personal',
          body.title,
          JSON.stringify(commentBody),
          textOf(commentBody),
          body.status || 'draft',
          body.category_id || null,
          JSON.stringify(body.tags || []),
          null,
          0,
          0,
          0,
          t,
          t
        );
        return json(res, 201, { id, created_at: t, updated_at: t });
      }

      const commentMatch = p.match(/^\/api\/comments\/([A-Za-z0-9_-]+)$/);
      if (commentMatch && method === 'GET') {
        const session = await optionalAuth(req);
        const row = await stmts.getCommentById.get(commentMatch[1]);
        if (!row) return json(res, 404, { error: 'not found' });
        // Public visitors can only see approved shared comments
        if (!session && (row.type !== 'shared' || row.status !== 'approved')) {
          return json(res, 404, { error: 'not found' });
        }
        return json(res, 200, { comment: decodeComment(row) });
      }

      if (commentMatch && method === 'PATCH') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const existing = await stmts.getCommentById.get(commentMatch[1]);
        if (!existing) return json(res, 404, { error: 'not found' });
        const rawUp = await readBody(req);
        const upParsed = parse(updateCommentSchema, rawUp || {});
        if (!upParsed.ok) return badRequest(res, 'invalid request', upParsed.error);
        const body = upParsed.data;
        const t = now();
        const commentBody = body.body !== undefined ? body.body : JSON.parse(existing.body);
        await stmts.updateComment.run(
          body.title ?? existing.title,
          JSON.stringify(commentBody),
          textOf(commentBody),
          body.status ?? existing.status,
          body.category_id !== undefined ? body.category_id : existing.category_id,
          JSON.stringify(body.tags !== undefined ? body.tags : JSON.parse(existing.tags)),
          body.rejection_reason !== undefined ? body.rejection_reason : existing.rejection_reason,
          body.copy_count !== undefined ? body.copy_count : existing.copy_count,
          body.deleted !== undefined ? body.deleted : existing.deleted,
          body.archived !== undefined ? body.archived : existing.archived,
          t,
          commentMatch[1]
        );
        return json(res, 200, { id: commentMatch[1], updated_at: t });
      }

      if (commentMatch && method === 'DELETE') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const existing = await stmts.getCommentById.get(commentMatch[1]);
        if (!existing) return json(res, 404, { error: 'not found' });
        await stmts.softDeleteComment.run(now(), commentMatch[1]);
        return json(res, 200, { ok: true });
      }

      // ── Copy count bump ──
      const copyMatch = p.match(/^\/api\/comments\/([A-Za-z0-9_-]+)\/copy$/);
      if (copyMatch && method === 'POST') {
        const session = await requireAuth(req, res);
        if (!session) return;
        await stmts.bumpCopyCount.run(now(), copyMatch[1]);
        return json(res, 200, { ok: true });
      }

      // ── Submit to shared library ──
      const submitMatch = p.match(/^\/api\/comments\/([A-Za-z0-9_-]+)\/submit$/);
      if (submitMatch && method === 'POST') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const existing = await stmts.getCommentById.get(submitMatch[1]);
        if (!existing) return json(res, 404, { error: 'not found' });
        if (existing.type !== 'personal')
          return json(res, 400, { error: 'only personal snippets can be submitted' });
        await stmts.submitToShared.run('pending_approval', now(), submitMatch[1]);
        return json(res, 200, { ok: true });
      }

      // ── Admin approve / reject ──
      const approveMatch = p.match(/^\/api\/admin\/comments\/([A-Za-z0-9_-]+)\/approve$/);
      if (approveMatch && method === 'POST') {
        const session = await requireAdmin(req, res);
        if (!session) return;
        await stmts.approveComment.run('approved', null, now(), approveMatch[1]);
        try {
          await stmts.insertAudit.run(uid(), session.sub, 'approve', approveMatch[1], null, now());
        } catch {}
        return json(res, 200, { ok: true });
      }

      const rejectMatch = p.match(/^\/api\/admin\/comments\/([A-Za-z0-9_-]+)\/reject$/);
      if (rejectMatch && method === 'POST') {
        const session = await requireAdmin(req, res);
        if (!session) return;
        const rawRej = await readBody(req);
        const rejParsed = parse(rejectSchema, rawRej || {});
        const body = rejParsed.ok ? rejParsed.data : {};
        await stmts.rejectComment.run('rejected', body?.reason || null, now(), rejectMatch[1]);
        try {
          await stmts.insertAudit.run(
            uid(),
            session.sub,
            'reject',
            rejectMatch[1],
            body?.reason || null,
            now()
          );
        } catch {}
        return json(res, 200, { ok: true });
      }

      // ── Admin stats ──
      if (p === '/api/admin/stats' && method === 'GET') {
        const session = await requireAdmin(req, res);
        if (!session) return;
        const totalRow = await stmts.countComments.get();
        const pendingRow = await stmts.countPending.get();
        const total = totalRow.n ?? totalRow.count ?? 0;
        const pending = pendingRow.n ?? pendingRow.count ?? 0;
        const topCopied = (await stmts.topCopied.all(10)).map(decodeComment);
        return json(res, 200, { total: Number(total), pending: Number(pending), topCopied });
      }

      // ── Admin audit log ──
      if (p === '/api/admin/audit' && method === 'GET') {
        const session = await requireAdmin(req, res);
        if (!session) return;
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);
        const rows = await stmts.listAudit.all(limit);
        return json(res, 200, {
          audit: rows.map((r) => ({ ...r, created_at: Number(r.created_at) })),
        });
      }

      // ── Sync endpoint (bulk pull) ──
      if (p === '/api/sync' && method === 'GET') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const since = Number(url.searchParams.get('since') || '0');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000', 10), 2000);
        const comments = (await stmts.syncComments.all(since, limit)).map(decodeComment);
        const categories = await stmts.syncCategories.all(since, limit);
        const hasMore = comments.length === limit || categories.length === limit;
        return json(res, 200, { comments, categories, serverTime: now(), hasMore });
      }

      // ── Sync push (bulk create/update from offline) ──
      if (p === '/api/sync' && method === 'POST') {
        const session = await requireAuth(req, res);
        if (!session) return;
        const body = await readBody(req);
        const results = { created: 0, updated: 0, conflicts: 0, skipped: 0 };
        // Try transaction for sqlite (prevents partial writes on crash); pg via pool is best-effort here
        // — a future improvement should grab a single pg client for true atomicity.
        let inTx = false;
        try {
          try {
            await _db.exec('BEGIN');
            inTx = true;
          } catch {}
          for (const c of body?.comments || []) {
            if (!c || typeof c.id !== 'string' || !c.id || typeof c.title !== 'string') {
              results.skipped++;
              continue;
            }
            const existing = await stmts.getCommentById.get(c.id);
            if (!existing) {
              const t = now();
              const commentBody = c.body ?? [];
              await stmts.insertComment.run(
                c.id,
                c.type || 'personal',
                c.title,
                JSON.stringify(commentBody),
                textOf(commentBody),
                c.status || 'draft',
                c.category_id || null,
                JSON.stringify(c.tags || []),
                c.rejection_reason || null,
                c.copy_count || 0,
                c.deleted ? 1 : 0,
                c.archived ? 1 : 0,
                c.created_at || t,
                t
              );
              results.created++;
            } else if (c.updated_at > existing.updated_at) {
              const t = now();
              const commentBody = c.body ?? JSON.parse(existing.body);
              await stmts.updateComment.run(
                c.title ?? existing.title,
                JSON.stringify(commentBody),
                textOf(commentBody),
                c.status ?? existing.status,
                c.category_id !== undefined ? c.category_id : existing.category_id,
                JSON.stringify(c.tags !== undefined ? c.tags : JSON.parse(existing.tags)),
                c.rejection_reason ?? existing.rejection_reason,
                c.copy_count ?? existing.copy_count,
                c.deleted !== undefined ? (c.deleted ? 1 : 0) : 0,
                c.archived !== undefined ? (c.archived ? 1 : 0) : 0,
                t,
                c.id
              );
              results.updated++;
            } else {
              results.conflicts++;
            }
          }
          if (inTx) await _db.exec('COMMIT');
        } catch (e) {
          if (inTx)
            try {
              await _db.exec('ROLLBACK');
            } catch {}
          throw e;
        }
        return json(res, 200, results);
      }

      // Not handled
      return false;
    } catch (err) {
      console.error('[api] error', err);
      return json(res, 500, { error: 'internal server error' });
    }
  };
}

function decodeComment(row) {
  // pg returns bigint as string for BIGINT columns; coerce numeric fields
  const out = {
    ...row,
    body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
  };
  // Coerce bigint strings to numbers for timestamps
  if (typeof out.created_at === 'string') out.created_at = Number(out.created_at);
  if (typeof out.updated_at === 'string') out.updated_at = Number(out.updated_at);
  if (typeof out.copy_count === 'string') out.copy_count = Number(out.copy_count);
  if (typeof out.deleted === 'string') out.deleted = Number(out.deleted);
  if (typeof out.archived === 'string') out.archived = Number(out.archived);
  return out;
}

function prepareAll(db) {
  return {
    getAccountByEmail: db.prepare('SELECT * FROM accounts WHERE email = ?'),
    getAccountById: db.prepare('SELECT id, email, role FROM accounts WHERE id = ?'),
    getAccountByNeonSub: db.prepare('SELECT id, email, role FROM accounts WHERE neon_sub = ?'),
    insertNeonAccount: db.prepare(
      'INSERT INTO accounts (id, email, password_hash, salt, neon_sub, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),

    listCategories: db.prepare('SELECT * FROM categories WHERE archived = 0 ORDER BY name'),
    getCategoryById: db.prepare('SELECT * FROM categories WHERE id = ?'),
    insertCategory: db.prepare(
      'INSERT INTO categories (id, name, archived, created_at, updated_at) VALUES (?,?,?,?,?)'
    ),
    updateCategory: db.prepare('UPDATE categories SET name=?, archived=?, updated_at=? WHERE id=?'),

    listComments: db.prepare(
      'SELECT * FROM comments WHERE deleted=0 ORDER BY updated_at DESC LIMIT ?'
    ),
    getCommentById: db.prepare('SELECT * FROM comments WHERE id=?'),
    insertComment: db.prepare(
      `INSERT INTO comments
         (id,type,title,body,body_text,status,category_id,tags,rejection_reason,copy_count,deleted,archived,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ),
    updateComment: db.prepare(
      `UPDATE comments SET title=?,body=?,body_text=?,status=?,category_id=?,tags=?,
         rejection_reason=?,copy_count=?,deleted=?,archived=?,updated_at=? WHERE id=?`
    ),
    softDeleteComment: db.prepare('UPDATE comments SET deleted=1, updated_at=? WHERE id=?'),
    bumpCopyCount: db.prepare(
      'UPDATE comments SET copy_count=copy_count+1, updated_at=? WHERE id=?'
    ),
    submitToShared: db.prepare(
      "UPDATE comments SET type='shared', status=?, updated_at=? WHERE id=?"
    ),
    approveComment: db.prepare(
      'UPDATE comments SET status=?, rejection_reason=?, updated_at=? WHERE id=?'
    ),
    rejectComment: db.prepare(
      'UPDATE comments SET status=?, rejection_reason=?, updated_at=? WHERE id=?'
    ),

    searchComments: db.prepare(
      `SELECT * FROM comments WHERE deleted=0 AND (title LIKE ? ESCAPE '\\' OR body_text LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?`
    ),
    filterCommentsType: db.prepare(
      'SELECT * FROM comments WHERE deleted=0 AND type=? ORDER BY updated_at DESC LIMIT ?'
    ),
    filterCommentsCat: db.prepare(
      'SELECT * FROM comments WHERE deleted=0 AND category_id=? ORDER BY updated_at DESC LIMIT ?'
    ),
    filterCommentsTag: db.prepare(
      `SELECT * FROM comments WHERE deleted=0 AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`
    ),
    filterCommentsTypeCat: db.prepare(
      'SELECT * FROM comments WHERE deleted=0 AND type=? AND category_id=? ORDER BY updated_at DESC LIMIT ?'
    ),
    filterCommentsTypeTag: db.prepare(
      `SELECT * FROM comments WHERE deleted=0 AND type=? AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`
    ),
    filterCommentsCatTag: db.prepare(
      `SELECT * FROM comments WHERE deleted=0 AND category_id=? AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`
    ),
    filterCommentsTypeCatTag: db.prepare(
      `SELECT * FROM comments WHERE deleted=0 AND type=? AND category_id=? AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?`
    ),

    listPublicComments: db.prepare(
      "SELECT * FROM comments WHERE deleted=0 AND type='shared' AND status='approved' ORDER BY updated_at DESC LIMIT ?"
    ),
    searchPublicComments: db.prepare(
      "SELECT * FROM comments WHERE deleted=0 AND type='shared' AND status='approved' AND (title LIKE ? ESCAPE '\\' OR body_text LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ?"
    ),

    syncComments: db.prepare(
      'SELECT * FROM comments WHERE deleted=0 AND updated_at > ? ORDER BY updated_at LIMIT ?'
    ),
    syncCategories: db.prepare(
      'SELECT * FROM categories WHERE updated_at > ? ORDER BY updated_at LIMIT ?'
    ),

    countComments: db.prepare('SELECT COUNT(*) as n FROM comments WHERE deleted=0'),
    countPending: db.prepare(
      "SELECT COUNT(*) as n FROM comments WHERE deleted=0 AND status='pending_approval'"
    ),
    topCopied: db.prepare(
      'SELECT * FROM comments WHERE deleted=0 ORDER BY copy_count DESC LIMIT ?'
    ),

    insertAudit: db.prepare(
      'INSERT INTO audit_log (id, actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ),
    listAudit: db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?'),
  };
}
