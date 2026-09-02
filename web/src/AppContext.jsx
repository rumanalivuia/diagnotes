import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { store } from './lib/store.js';
import * as sync from './lib/sync.js';
import { filterComments, allTags } from './lib/search.js';

const Ctx = createContext(null);
export const useDiag = () => useContext(Ctx);

/** Shared lightweight id generator (matches server uid() shape loosely). */
export function uid() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null); // { account, token }
  const [booted, setBooted] = useState(false);
  const [comments, setComments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recent, setRecent] = useState([]);
  const [syncState, setSyncState] = useState(sync.getState());
  const [toasts, setToasts] = useState([]);
  const bootRef = useRef(false);

  /* ── toast helpers ── */
  const pushToast = useCallback((kind, msg) => {
    const id = uid();
    setToasts((t) => [...t, { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);
  const toast = useMemo(
    () => ({
      success: (m) => pushToast('success', m),
      info: (m) => pushToast('info', m),
      error: (m) => pushToast('error', m),
    }),
    [pushToast]
  );

  const reloadLocal = useCallback(async () => {
    setComments(await sync.getComments());
    setCategories(await sync.getCategories());
    setRecent(await sync.getRecentlyCopied());
  }, []);

  /* ── boot / restore session ── */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      const token = await store.kvGet('token');
      if (token) {
        setSession({ token, account: await store.kvGet('account') });
        await reloadLocal();
        sync.syncNow().catch(() => {});
      }
      setBooted(true);
    })();
    const unsub = sync.onChange((kind) => {
      if (kind === sync.EVENT.STATE) setSyncState(sync.getState());
      if (kind === sync.EVENT.DATA) reloadLocal();
      if (kind === sync.EVENT.ERROR) toast.error('Sync failed — offline changes are safe.');
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apiBase = () => {
    const base = import.meta.env.VITE_API_BASE_URL;
    return base ? base.replace(/\/$/, '') : '';
  };
  const login = useCallback(async (email, password) => {
    const res = await fetch(`${apiBase()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Invalid email or password');
    const data = await res.json();
    await store.kvSet('token', data.token);
    await store.kvSet('account', data.account);
    setSession({ token: data.token, account: data.account });
    await reloadLocal();
    try {
      await sync.syncNow(); // populate local from server
    } catch { /* offline: local data still usable */ }
    await reloadLocal(); // reflect synced rows (incl. any DATA reload that was missed)
  }, [reloadLocal]);

  const logout = useCallback(async () => {
    await sync.clearAuth();
    setSession(null);
    setComments([]);
    setCategories([]);
    setRecent([]);
    toast.info('Signed out');
  }, [toast]);

  /* ── periodic + reconnect sync ── */
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      if (navigator.onLine) sync.syncNow().catch(() => {});
    }, 60_000);
    const on = () => sync.syncNow().catch(() => {});
    window.addEventListener('online', on);
    return () => { clearInterval(id); window.removeEventListener('online', on); };
  }, [session]);

  /* ── mutations ── */
  const saveComment = useCallback(async (comment) => {
    const saved = await sync.queueComment(comment);
    setComments(await sync.getComments());
    return saved;
  }, []);

  const deleteComment = useCallback(async (id) => {
    await sync.removeComment(id);
    await reloadLocal();
  }, [reloadLocal]);

  const copyAndTrack = useCallback(async (comment) => {
    await sync.recordCopy(comment);
    await reloadLocal();
  }, [reloadLocal]);

  const doSyncNow = useCallback(async () => {
    try { await sync.syncNow(); toast.success('Synced'); }
    catch { toast.error('Cannot reach the server right now'); }
  }, [toast]);

  /* ── server-side admin / submission actions ── */
  const serverCall = useCallback(async (path, opts = {}) => {
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
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text.slice(0, 200) || `server ${res.status}`);
    }
    return res.json();
  }, []);

  const approveShared = useCallback(async (id) => {
    await serverCall(`/admin/comments/${id}/approve`, { method: 'POST' });
    await reloadLocal();
    toast.success('Approved — now visible to everyone');
  }, [serverCall, reloadLocal, toast]);

  const rejectShared = useCallback(async (id, reason) => {
    await serverCall(`/admin/comments/${id}/reject`, { method: 'POST', json: { reason } });
    await reloadLocal();
    toast.info('Submission rejected');
  }, [serverCall, reloadLocal, toast]);

  const submitToShared = useCallback(async (comment) => {
    // Ensure the comment exists server-side first (local-only comments must be
    // pushed before the server can move them into the review queue).
    await sync.syncNow().catch(() => {});
    await serverCall(`/comments/${comment.id}/submit`, { method: 'POST' });
    await sync.syncNow().catch(() => {});
    await reloadLocal();
    toast.success('Submitted for approval');
  }, [serverCall, reloadLocal, toast]);

  const addCategory = useCallback(async (name) => {
    const out = await serverCall('/categories', { method: 'POST', json: { name } });
    await reloadLocal();
    return out;
  }, [serverCall, reloadLocal]);

  const updateCategory = useCallback(async (id, patch) => {
    await serverCall(`/categories/${id}`, { method: 'PATCH', json: patch });
    await reloadLocal();
  }, [serverCall, reloadLocal]);

  const [view, setView] = useState('library'); // library | recent | admin
  const [filters, setFilters] = useState({ type: 'shared', categoryId: null, tag: null, query: '', status: null });

  const visible = useMemo(() => {
    if (view === 'recent') return recent;
    return filterComments(comments, filters);
  }, [view, recent, comments, filters]);

  const tagCloud = useMemo(() => allTags(filterComments(comments, { type: filters.type })), [comments, filters.type]);

  const counts = useMemo(() => {
    const shared = comments.filter((c) => c.type === 'shared');
    return {
      shared: shared.length,
      personal: comments.filter((c) => c.type === 'personal').length,
      pending: comments.filter((c) => c.type === 'shared' && c.status === 'pending_approval').length,
      approved: shared.filter((c) => c.status === 'approved').length,
    };
  }, [comments]);

  const value = {
    session, booted, login, logout,
    comments, categories, recent, visible, tagCloud, counts, toasts,
    filters, setFilters, view, setView,
    saveComment, deleteComment, copyAndTrack, doSyncNow, reloadLocal,
    approveShared, rejectShared, submitToShared, addCategory, updateCategory,
    syncState, toast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
