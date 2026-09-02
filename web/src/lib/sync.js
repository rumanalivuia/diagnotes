import { store } from './store.js';

/**
 * Sync engine: pulls deltas from the server, pushes the local change queue,
 * and (on reconnect) flushes offline-created edits.  Last-write-wins per the
 * PRD §9.3: a row is replaced only when the incoming updated_at is newer.
 *
 * Offline writes are applied locally immediately and appended to the queue;
 * the queue is drained to the server on the next successful sync.
 */

export const EVENT = {
  STATE: 'sync-state',
  DATA: 'sync-data',
  ERROR: 'sync-error',
};

let listeners = new Set();
let state = {
  online: navigator.onLine,
  syncing: false,
  pending: 0, // queued local mutations not yet pushed
  lastSync: null, // serverTime of last successful pull
  error: null,
};

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(kind, payload) {
  for (const fn of listeners) fn(kind, payload);
}

export function getState() {
  return { ...state };
}

/** Local pending queue length (for badges). */
export async function pendingCount() {
  const q = await store.getAll('queue');
  return q.length;
}

function apiBase() {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base) return base.replace(/\/$/, '');
  return '';
}
async function api(path, opts = {}) {
  const token = await store.kvGet('token');
  const headers = { ...(opts.headers || {}) };
  if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = apiBase();
  const url = base ? `${base}/api${path}` : `/api${path}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
  });
  if (res.status === 401) {
    // Do NOT wipe the stored token here: a transient 401 (e.g. sync racing the
    // very first login write) must not log the user out permanently. The app
    // layer decides when to clear auth.
    throw new Error('unauthorized');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`server ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Apply a server/offline mutation to the local comments table.
 * LWW: skip when the incoming row is not newer than what we have.
 */
async function applyComment(row) {
  const existing = await store.get('comments', row.id);
  if (existing && (existing.updated_at || 0) >= (row.updated_at || 0)) return false;
  await store.put('comments', row);
  return true;
}

function normalizeComment(c) {
  return {
    ...c,
    body: Array.isArray(c.body) ? c.body : [],
    tags: Array.isArray(c.tags) ? c.tags : [],
  };
}

/**
 * Sync one direction: push local queue, then pull server changes since lastSync.
 * Returns the new serverTime.
 */
export async function syncNow() {
  state.syncing = true;
  state.error = null;
  emit(EVENT.STATE, getState());
  try {
    // 1. Push queued local mutations (drop any stale record lacking an id)
    const queue = await store.getAll('queue');
    const valid = queue.filter((m) => m.comment && typeof m.comment.id === 'string' && m.comment.id);
    const dropped = queue.length - valid.length;
    for (const m of queue) if (!valid.includes(m)) await store.delete('queue', m.id);
    if (valid.length) {
      const payload = { comments: valid.map((m) => m.comment) };
      await api('/sync', { method: 'POST', json: payload });
      for (const m of valid) await store.delete('queue', m.id);
    }
    state.pending = 0;

    // 2. Pull server deltas
    const last = (await store.kvGet('lastSync')) || 0;
    const data = await api('/sync?since=' + encodeURIComponent(last));
    let changed = 0;
    for (const c of data.comments || []) if (await applyComment(normalizeComment(c))) changed++;
    if (data.categories) await store.putMany('categories', data.categories);
    if (data.serverTime) await store.kvSet('lastSync', data.serverTime);

    state.lastSync = data.serverTime || Date.now();
    state.online = true;
    emit(EVENT.STATE, getState());
    if (changed) emit(EVENT.DATA, { changed });
    return data;
  } catch (err) {
    state.online = false;
    state.error = err.message;
    emit(EVENT.ERROR, err.message);
    throw err;
  } finally {
    state.syncing = false;
    emit(EVENT.STATE, getState());
  }
}

/** Generate a client-side comment id (server accepts any [A-Za-z0-9_-]). */
function newId() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/**
 * Queue a local mutation for push and apply it locally.
 * Mutation = { comment, created_at } snapshot at time of enqueue.
 */
export async function queueComment(comment) {
  const nowMs = Date.now();
  const isNew = !comment.id;
  const record = {
    comment: {
      ...comment,
      id: comment.id || newId(),
      created_at: comment.created_at || nowMs,
      body: comment.body || [],
      tags: comment.tags || [],
      updated_at: nowMs,
    },
    created_at: nowMs,
  };
  await store.put('queue', record);
  await applyComment(record.comment);
  state.pending++;
  emit(EVENT.STATE, getState());
  return record.comment;
}

/** Record a copy action: bump copy_count locally + queue the bump for sync. */
export async function recordCopy(comment) {
  const bump = {
    ...comment,
    copy_count: (comment.copy_count || 0) + 1,
    updated_at: Date.now(),
  };
  await queueComment(bump);

  // Track most-recently-copied (cap 25)
  const entry = { id: comment.id, title: comment.title, copied_at: Date.now() };
  await store.put('recently', entry);
  const recents = await store.getAll('recently');
  recents.sort((a, b) => b.copied_at - a.copied_at);
  for (const r of recents.slice(25)) await store.delete('recently', r.id);
}

/** Merge server / offline mutation sets, de-duplicating by id keeping newest. */
export async function getComments() {
  const all = await store.getAll('comments');
  const map = new Map();
  for (const c of all) {
    const existing = map.get(c.id);
    if (!existing || (c.updated_at || 0) > (existing.updated_at || 0)) map.set(c.id, c);
  }
  return [...map.values()].sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
}

export async function getCategories() {
  const all = await store.getAll('categories');
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRecentlyCopied() {
  const all = await store.getAll('recently');
  return all.sort((a, b) => b.copied_at - a.copied_at);
}

/** Remove a comment locally (soft delete → sync tombstone later). */
export async function removeComment(id) {
  if (!id) return;
  const existing = await store.get('comments', id);
  if (!existing) return;
  const tombstone = { ...existing, deleted: 1, updated_at: Date.now() };
  await queueComment(tombstone);
  await store.delete('comments', id);
}

export async function clearAuth() {
  await store.kvSet('token', null);
  await store.kvSet('lastSync', 0);
  await store.clear('comments');
  await store.clear('categories');
  await store.clear('queue');
  await store.clear('recently');
}
