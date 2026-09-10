import { useState, useEffect } from 'react';
import { useDiag } from '../AppContext.jsx';

export default function TopBar({ onNew }) {
  const {
    filters,
    setFilters,
    syncState,
    doSyncNow,
    session,
    isPublic,
    isAdmin,
    logout,
    showLoginPrompt,
    shareApp,
  } = useDiag();
  const q = filters.query || '';
  const [offlineDismissed, setOfflineDismissed] = useState(false);

  const isOffline = !syncState.online;
  const dotCls = isOffline ? 'offline' : syncState.syncing ? 'syncing' : 'online';
  const dotLabel = isOffline ? 'Offline' : syncState.syncing ? 'Syncing…' : 'Synced';

  // Reset dismiss when coming back online
  useEffect(() => {
    if (syncState.online) setOfflineDismissed(false);
  }, [syncState.online]);

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" onClick={shareApp} title="Share DiagNotes" aria-label="Share DiagNotes">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
        </button>
        {!isPublic && (
          <button className="btn btn-primary" onClick={onNew} style={{ flex: 'none' }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
        )}

        <div className="search-wrap">
          <span className="search-icon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            className="search-input"
            type="search"
            placeholder="Search comments…  (title or body)"
            value={q}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            aria-label="Search comments"
          />
        </div>

        {!isPublic ? (
          <>
            <div className="sync-state" title="Sync status">
              <span className={`sync-dot ${dotCls}`} />
              <span className="mono">{dotLabel}</span>
            </div>
            <button className="icon-btn" onClick={doSyncNow} title="Sync now" aria-label="Sync now">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12a9 9 0 1 1-2.6-6.4" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
            <div className="user-menu">
              <span className="avatar-sm">
                {session?.account?.email?.[0]?.toUpperCase() || '?'}
              </span>
              <span className="user-email mono">{session?.account?.email}</span>
              {isAdmin && <span className="admin-badge">Admin</span>}
              <button className="link-btn" onClick={logout}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <div className="auth-buttons">
            <button className="btn btn-secondary btn-sm" onClick={showLoginPrompt}>
              Sign in
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => showLoginPrompt('signup')}>
              Sign up
            </button>
          </div>
        )}
      </header>
      {isOffline && !isPublic && !offlineDismissed && (
        <div className="offline-banner" role="alert">
          <span>You're offline — changes will sync when you reconnect.</span>
          <button
            className="offline-dismiss"
            onClick={() => setOfflineDismissed(true)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
