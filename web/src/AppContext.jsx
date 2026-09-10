import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { store } from './lib/store.js';
import * as sync from './lib/sync.js';
import { filterComments, allTags } from './lib/search.js';
import {
  authClient,
  isNeonAuth,
  getNeonToken,
  getAuthToken,
  refreshNeonToken,
  clearNeonTokenCache,
  friendlyAuthError,
} from './lib/neonAuth.js';

const Ctx = createContext(null);
export const useDiag = () => useContext(Ctx);

/** Shared lightweight id generator (matches server uid() shape loosely). */
export function uid() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/* ── Theme helpers ──────────────────────────────────────── */
function getInitialTheme() {
  try {
    const saved = localStorage.getItem('dn_theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem('dn_theme', t);
  } catch {}
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(null); // { account, token }
  const [booted, setBooted] = useState(false);
  const [comments, setComments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [recent, setRecent] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [syncState, setSyncState] = useState(sync.getState());
  const [toasts, setToasts] = useState([]);
  const [theme, setTheme] = useState(getInitialTheme);
  const bootRef = useRef(false);
  const prevStatusRef = useRef(new Map()); // id -> status for notification detection

  /* ── theme ── */
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for OS theme changes
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = (e) => {
      const saved = localStorage.getItem('dn_theme');
      if (!saved) setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

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

  /* ── favorites ── */
  const loadFavorites = useCallback(async () => {
    const ids = (await store.kvGet('favorites')) || [];
    setFavorites(ids);
  }, []);

  const toggleFavorite = useCallback(async (commentId) => {
    const ids = (await store.kvGet('favorites')) || [];
    const next = ids.includes(commentId)
      ? ids.filter((id) => id !== commentId)
      : [...ids, commentId];
    await store.kvSet('favorites', next);
    setFavorites(next);
  }, []);

  const reloadLocal = useCallback(async () => {
    setComments(await sync.getComments());
    setCategories(await sync.getCategories());
    setRecent(await sync.getRecentlyCopied());
    await loadFavorites();
  }, [loadFavorites]);

  const apiBase = useCallback(() => {
    const base = import.meta.env.VITE_API_BASE_URL;
    return base ? base.replace(/\/$/, '') : '';
  }, []);

  /** Public fetch: load approved shared comments + categories without auth. */
  const loadPublic = useCallback(async () => {
    try {
      const base = apiBase();
      const [catRes, comRes] = await Promise.all([
        fetch(`${base}/api/categories`),
        fetch(`${base}/api/comments?type=shared`),
      ]);
      if (catRes.ok) {
        const d = await catRes.json();
        setCategories(d.categories || []);
      }
      if (comRes.ok) {
        const d = await comRes.json();
        setComments(d.comments || []);
      }
    } catch {
      /* offline or error — show empty state */
    }
  }, [apiBase]);

  /* ── approval notification detection ── */
  const checkApprovalNotifications = useCallback(
    async (updatedComments) => {
      const prev = prevStatusRef.current;
      for (const c of updatedComments) {
        const oldStatus = prev.get(c.id);
        if (oldStatus === 'pending_approval' && c.status === 'approved') {
          toast.success(`"${c.title}" has been approved`);
        } else if (oldStatus === 'pending_approval' && c.status === 'rejected') {
          const reason = c.rejection_reason ? `: ${c.rejection_reason}` : '';
          toast.info(`"${c.title}" was rejected${reason}`);
        }
        prev.set(c.id, c.status);
      }
    },
    [toast]
  );

  /* ── boot / restore session ── */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      let hasSession = false;
      if (isNeonAuth) {
        try {
          const { data } = await authClient.getSession();
          if (data?.user) {
            setSession({ account: { email: data.user.email, name: data.user.name } });
            hasSession = true;
            await reloadLocal();
            sync.syncNow().catch(() => {});
          }
        } catch {
          /* no session: public mode */
        }
      } else {
        const token = await store.kvGet('token');
        if (token) {
          const acct = await store.kvGet('account');
          setSession({ token, account: acct });
          hasSession = true;
          await reloadLocal();
          sync.syncNow().catch(() => {});
        }
      }
      if (hasSession) {
        // Initialize status tracking for notification detection
        const allComments = await sync.getComments();
        for (const c of allComments) prevStatusRef.current.set(c.id, c.status);
      } else {
        // Public visitor — fetch approved shared comments directly
        await loadPublic();
      }
      setBooted(true);
    })();
    const unsub = sync.onChange((kind) => {
      if (kind === sync.EVENT.STATE) setSyncState(sync.getState());
      if (kind === sync.EVENT.DATA) {
        reloadLocal().then(async () => {
          const updated = await sync.getComments();
          checkApprovalNotifications(updated);
        });
      }
      if (kind === sync.EVENT.ERROR) toast.error('Sync failed — offline changes are safe.');
    });
    return () => unsub();
    // eslint-disable-next-line
  }, []);

  const afterAuth = useCallback(
    async (account) => {
      await store.kvSet('account', account);
      setSession({ account });
      await reloadLocal();
      try {
        await sync.syncNow(); // populate local from server
      } catch {
        /* offline: local data still usable */
      }
      await reloadLocal(); // reflect synced rows (incl. any DATA reload that was missed)
    },
    [reloadLocal]
  );

  const loginCenter = useCallback(
    async (email, password) => {
      const res = await fetch(`${apiBase()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('Invalid email or password');
      const data = await res.json();
      await store.kvSet('token', data.token);
      setSession({ token: data.token, account: data.account });
      await afterAuth(data.account);
    },
    [afterAuth]
  );

  const login = useCallback(
    async (email, password) => {
      if (isNeonAuth) {
        const result = await authClient.signIn.email({ email, password });
        if (result?.error) throw new Error(friendlyAuthError(result.error, 'Sign-in failed'));
        const { data } = await authClient.getSession();
        if (!data?.user) throw new Error('Sign-in failed — no session was created');
        await getNeonToken(true);
        await afterAuth({
          email: data.user.email,
          name: data.user.name,
          neon_sub: data.user.id,
        });
        return;
      }
      const res = await fetch(`${apiBase()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error('Invalid email or password');
      const data = await res.json();
      await store.kvSet('token', data.token);
      setSession({ token: data.token, account: data.account });
      await afterAuth(data.account);
    },
    [afterAuth]
  );

  const signup = useCallback(
    async (name, email, password) => {
      if (!isNeonAuth) throw new Error('Sign-up is not enabled on this server');
      const result = await authClient.signUp.email({
        name: name || email.split('@')[0],
        email,
        password,
      });
      if (result?.error) throw new Error(friendlyAuthError(result.error, 'Sign-up failed'));
      let { data } = await authClient.getSession();
      if (!data?.user) {
        const signInResult = await authClient.signIn.email({ email, password });
        if (signInResult?.error) {
          throw new Error(
            'Account created. Please switch to Sign in and enter your password to continue.'
          );
        }
        ({ data } = await authClient.getSession());
      }
      if (!data?.user) throw new Error('Account created, but no session was created');
      await getNeonToken(true);
      await afterAuth({
        email: data.user.email,
        name: data.user.name || name || email.split('@')[0],
        neon_sub: data.user.id,
      });
    },
    [afterAuth]
  );

  const logout = useCallback(async () => {
    if (isNeonAuth) {
      try {
        await authClient.signOut();
      } catch {
        /* already out */
      }
      clearNeonTokenCache();
    }
    await sync.clearAuth();
    setSession(null);
    setComments([]);
    setCategories([]);
    setRecent([]);
    setFavorites([]);
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
    return () => {
      clearInterval(id);
      window.removeEventListener('online', on);
    };
  }, [session]);

  /* ── mutations ── */
  const saveComment = useCallback(async (comment) => {
    const saved = await sync.queueComment(comment);
    setComments(await sync.getComments());
    return saved;
  }, []);

  const deleteComment = useCallback(
    async (id) => {
      await sync.removeComment(id);
      await reloadLocal();
    },
    [reloadLocal]
  );

  const copyAndTrack = useCallback(
    async (comment) => {
      await sync.recordCopy(comment);
      await reloadLocal();
    },
    [reloadLocal]
  );

  const doSyncNow = useCallback(async () => {
    try {
      await sync.syncNow();
      toast.success('Synced');
    } catch {
      toast.error('Cannot reach the server right now');
    }
  }, [toast]);

  /* ── server-side admin / submission actions ── */
  const serverCall = useCallback(async (path, opts = {}) => {
    const base = apiBase();
    async function request(token) {
      const headers = { ...(opts.headers || {}) };
      if (opts.json !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      const url = base ? `${base}/api${path}` : `/api${path}`;
      return fetch(url, {
        method: opts.method || 'GET',
        headers,
        body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
      });
    }
    let res = await request(await getAuthToken());
    if (res.status === 401 && isNeonAuth) {
      try {
        res = await request(await refreshNeonToken());
      } catch {
        throw new Error('unauthorized');
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text.slice(0, 200) || `server ${res.status}`);
    }
    return res.json();
  }, []);

  const approveShared = useCallback(
    async (id) => {
      await serverCall(`/admin/comments/${id}/approve`, { method: 'POST' });
      await reloadLocal();
      toast.success('Approved — now visible to everyone');
    },
    [serverCall, reloadLocal, toast]
  );

  const rejectShared = useCallback(
    async (id, reason) => {
      await serverCall(`/admin/comments/${id}/reject`, { method: 'POST', json: { reason } });
      await reloadLocal();
      toast.info('Submission rejected');
    },
    [serverCall, reloadLocal, toast]
  );

  const submitToShared = useCallback(
    async (comment) => {
      await sync.syncNow().catch(() => {});
      await serverCall(`/comments/${comment.id}/submit`, { method: 'POST' });
      await sync.syncNow().catch(() => {});
      await reloadLocal();
      toast.success('Submitted for approval');
    },
    [serverCall, reloadLocal, toast]
  );

  const addCategory = useCallback(
    async (name) => {
      const out = await serverCall('/categories', { method: 'POST', json: { name } });
      await reloadLocal();
      return out;
    },
    [serverCall, reloadLocal]
  );

  const updateCategory = useCallback(
    async (id, patch) => {
      await serverCall(`/categories/${id}`, { method: 'PATCH', json: patch });
      await reloadLocal();
    },
    [serverCall, reloadLocal]
  );

  const [view, setView] = useState('library'); // library | recent | favorites | admin
  const [showLogin, setShowLogin] = useState(false);
  const isPublic = !session;
  const isAdmin = session?.account?.role === 'admin';
  const showLoginPrompt = useCallback(() => setShowLogin(true), []);
  const hideLoginPrompt = useCallback(() => setShowLogin(false), []);
  const shareApp = useCallback(async () => {
    const shareData = {
      title: 'DiagNotes',
      text: 'Browse and share diagnostic comments with your team.',
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
      }
      toast.success(navigator.share ? 'Share dialog opened' : 'App link copied');
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error('Unable to share the app link');
    }
  }, [toast]);
  const [filters, setFilters] = useState({
    type: 'shared',
    categoryId: null,
    tag: null,
    query: '',
    status: null,
  });

  const visible = useMemo(() => {
    if (view === 'recent') return recent;
    if (view === 'favorites') return comments.filter((c) => favorites.includes(c.id));
    return filterComments(comments, filters);
  }, [view, recent, comments, filters, favorites]);

  const tagCloud = useMemo(
    () => allTags(filterComments(comments, { type: filters.type })),
    [comments, filters.type]
  );

  const counts = useMemo(() => {
    const shared = comments.filter((c) => c.type === 'shared');
    return {
      shared: shared.length,
      personal: comments.filter((c) => c.type === 'personal').length,
      pending: comments.filter((c) => c.type === 'shared' && c.status === 'pending_approval')
        .length,
      approved: shared.filter((c) => c.status === 'approved').length,
    };
  }, [comments]);

  const value = {
    session,
    booted,
    login,
    loginCenter,
    signup,
    logout,
    neonEnabled: isNeonAuth,
    isPublic,
    isAdmin,
    showLogin,
    showLoginPrompt,
    hideLoginPrompt,
    shareApp,
    comments,
    categories,
    recent,
    favorites,
    visible,
    tagCloud,
    counts,
    toasts,
    filters,
    setFilters,
    view,
    setView,
    saveComment,
    deleteComment,
    copyAndTrack,
    doSyncNow,
    reloadLocal,
    loadPublic,
    approveShared,
    rejectShared,
    submitToShared,
    addCategory,
    updateCategory,
    syncState,
    toast,
    theme,
    toggleTheme,
    toggleFavorite,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
