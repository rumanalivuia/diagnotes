import { textOf } from './richtext.js';

/**
 * Comment search + filter (client-side, mirrors the server's contract so the
 * offline store behaves identically to the API). Category filter AND tag
 * filter combine with AND logic (PRD §8).
 */

export function matchesQuery(comment, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return (
    (comment.title || '').toLowerCase().includes(q) ||
    textOf(comment.body || []).toLowerCase().includes(q)
  );
}

export function filterComments(comments, { type, categoryId, tag, query, status } = {}) {
  return comments.filter((c) => {
    if (type && c.type !== type) return false;
    if (status && c.status !== status) return false;
    if (categoryId && c.category_id !== categoryId) return false;
    if (tag && !(c.tags || []).includes(tag)) return false;
    if (!matchesQuery(c, query)) return false;
    return true;
  });
}

/** Aggregate tag list across a set of comments with counts. */
export function allTags(comments) {
  const counts = new Map();
  for (const c of comments) for (const t of c.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
