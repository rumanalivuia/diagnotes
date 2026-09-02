import { useDiag } from '../AppContext.jsx';

export default function TopBar({ onNew }) {
  const { filters, setFilters, syncState, doSyncNow } = useDiag();
  const q = filters.query || '';

  const dotCls = !syncState.online ? 'offline' : syncState.syncing ? 'syncing' : 'online';
  const dotLabel = !syncState.online ? 'Offline' : syncState.syncing ? 'Syncing…' : 'Synced';

  return (
    <header className="topbar">
      <button className="btn btn-primary" onClick={onNew} style={{ flex: 'none' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        New
      </button>

      <div className="search-wrap">
        <span className="search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
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

      <div className="sync-state" title="Sync status">
        <span className={`sync-dot ${dotCls}`} />
        <span className="mono">{dotLabel}</span>
      </div>

      <button className="icon-btn" onClick={doSyncNow} title="Sync now" aria-label="Sync now">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
      </button>
    </header>
  );
}
