import { textOf } from '../db.js';
import { likePattern } from '../security.js';

function decodeComment(row) {
  const out = {
    ...row,
    body: typeof row.body === 'string' ? JSON.parse(row.body) : row.body,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
  };
  if (typeof out.created_at === 'string') out.created_at = Number(out.created_at);
  if (typeof out.updated_at === 'string') out.updated_at = Number(out.updated_at);
  if (typeof out.copy_count === 'string') out.copy_count = Number(out.copy_count);
  if (typeof out.deleted === 'string') out.deleted = Number(out.deleted);
  if (typeof out.archived === 'string') out.archived = Number(out.archived);
  return out;
}

export function prepareCommentStmts(db) {
  return {
    listComments: db.prepare(
      'SELECT * FROM comments WHERE deleted=0 ORDER BY updated_at DESC LIMIT ?'
    ),
    getCommentById: db.prepare('SELECT * FROM comments WHERE id=?'),
    insertComment: db.prepare(
      `INSERT INTO comments (id,type,title,body,body_text,status,category_id,tags,rejection_reason,copy_count,deleted,archived,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ),
    updateComment: db.prepare(
      `UPDATE comments SET title=?,body=?,body_text=?,status=?,category_id=?,tags=?,rejection_reason=?,copy_count=?,deleted=?,archived=?,updated_at=? WHERE id=?`
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
    filterPublicTypeCatTag: db.prepare(
      "SELECT * FROM comments WHERE deleted=0 AND type='shared' AND status='approved' AND category_id=? AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?"
    ),
    filterPublicTypeCat: db.prepare(
      "SELECT * FROM comments WHERE deleted=0 AND type='shared' AND status='approved' AND category_id=? ORDER BY updated_at DESC LIMIT ?"
    ),
    filterPublicTypeTag: db.prepare(
      "SELECT * FROM comments WHERE deleted=0 AND type='shared' AND status='approved' AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?"
    ),
    filterPublicCatTag: db.prepare(
      "SELECT * FROM comments WHERE deleted=0 AND type='shared' AND status='approved' AND category_id=? AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?"
    ),
    filterPublicTag: db.prepare(
      "SELECT * FROM comments WHERE deleted=0 AND type='shared' AND status='approved' AND tags LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT ?"
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
  };
}

export async function listCommentsFiltered(
  stmts,
  { session, type, category, tag, q, since, limit }
) {
  // Public visitors are restricted by the dedicated approved/shared statements.
  if (!session) {
    type = 'shared';
  }
  let rows;
  if (since && session) rows = await stmts.syncComments.all(Number(since));
  else if (q) {
    const pat = likePattern(q);
    rows = !session
      ? await stmts.searchPublicComments.all(pat, pat, limit)
      : await stmts.searchComments.all(pat, pat, limit);
  } else if (type && category && tag)
    rows = await stmts.filterCommentsTypeCatTag.all(type, category, likePattern(tag), limit);
  else if (type && category) rows = await stmts.filterCommentsTypeCat.all(type, category, limit);
  else if (type && tag) rows = await stmts.filterCommentsTypeTag.all(type, likePattern(tag), limit);
  else if (category && tag)
    rows = await stmts.filterCommentsCatTag.all(category, likePattern(tag), limit);
  else if (type) rows = await stmts.filterCommentsType.all(type, limit);
  else if (category) rows = await stmts.filterCommentsCat.all(category, limit);
  else if (tag) rows = await stmts.filterCommentsTag.all(likePattern(tag), limit);
  else
    rows = !session
      ? await stmts.listPublicComments.all(limit)
      : await stmts.listComments.all(limit);
  return rows.map(decodeComment);
}

export async function insertCommentRow(stmts, data) {
  const body = data.body ?? [];
  await stmts.insertComment.run(
    data.id,
    data.type || 'personal',
    data.title,
    JSON.stringify(body),
    textOf(body),
    data.status || 'draft',
    data.category_id || null,
    JSON.stringify(data.tags || []),
    null,
    0,
    0,
    0,
    data.created_at,
    data.updated_at
  );
}

export { decodeComment };
