import { useDiag } from '../AppContext.jsx';
import InstallButtons from './InstallButtons.jsx';

export default function Rail({ onNew }) {
  const { view, setView, filters, setFilters, categories, tagCloud, counts, session, isPublic, isAdmin, logout, theme, toggleTheme, favorites, showLoginPrompt } = useDiag();

  const setType = (type) => { setView('library'); setFilters((f) => ({ ...f, type })); };
  const setCat = (categoryId) => { setView('library'); setFilters((f) => ({ ...f, categoryId })); };
  const setTag = (tag) => { setView('library'); setFilters((f) => ({ ...f, tag })); };

  return (
    <aside className="rail">
      <div className="brand">
        <div className="brand-mark">D</div>
        <div>
          <div className="brand-name">DiagNotes</div>
          <div className="brand-sub mono">comments library</div>
        </div>
      </div>

      <nav className="rail-nav" aria-label="Views">
        <button className={`nav-btn ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}>
          Library
          <span className="nav-count">{counts.shared}</span>
        </button>
        {!isPublic && (
          <>
            <button className={`nav-btn ${view === 'recent' ? 'active' : ''}`} onClick={() => setView('recent')}>
              Recently copied
            </button>
            <button className={`nav-btn ${view === 'favorites' ? 'active' : ''}`} onClick={() => setView('favorites')}>
              Favorites
              {favorites.length > 0 && <span className="nav-count">{favorites.length}</span>}
            </button>
          </>
        )}
        {isAdmin && (
          <button className={`nav-btn ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>
            Admin
            {counts.pending > 0 && <span className="nav-badge">{counts.pending}</span>}
          </button>
        )}
      </nav>

      {!isPublic && (
        <div className="rail-section">
          <div className="rail-section-label">Source</div>
          <div className="filter-list">
            {[
              { t: 'shared', label: 'Shared library' },
              { t: 'personal', label: 'My snippets' },
            ].map((o) => (
              <button key={o.t} className={`filter-row ${filters.type === o.t ? 'active' : ''}`} onClick={() => setType(o.t)}>
                <span className="dot all" />
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rail-section">
        <div className="rail-section-label">Category</div>
        <div className="filter-list">
          <button className={`filter-row ${!filters.categoryId ? 'active' : ''}`} onClick={() => setCat(null)}>
            <span className="dot all" />All categories
          </button>
          {categories.map((c) => (
            <button key={c.id} className={`filter-row ${filters.categoryId === c.id ? 'active' : ''}`} onClick={() => setCat(c.id)}>
              <span className="dot" style={{ background: 'var(--teal)' }} />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="rail-section">
        <div className="rail-section-label">Tags</div>
        <div className="filter-list">
          <button className={`filter-row ${!filters.tag ? 'active' : ''}`} onClick={() => setTag(null)}>
            <span className="dot all" />All tags
          </button>
          {tagCloud.slice(0, 12).map((t) => (
            <button key={t.name} className={`filter-row ${filters.tag === t.name ? 'active' : ''}`} onClick={() => setTag(t.name)}>
              <span className="dot" style={{ background: 'var(--amber)' }} />
              {t.name}
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rail-footer">
        {isPublic ? (
          <>
            <button className="btn btn-primary btn-block" onClick={showLoginPrompt}>Sign in to contribute</button>
            <InstallButtons />
          </>
        ) : (
          <>
            <div className="user-line">
              <span className="avatar">{session?.account?.email?.[0]?.toUpperCase() || '?'}</span>
              <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                {session?.account?.email}
              </span>
            </div>
            <button className="link-btn" onClick={onNew}>+ New comment</button>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="link-btn" onClick={logout}>Sign out</button>
            </div>
          </>
        )}
        <button className="theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`${theme === 'dark' ? 'Light' : 'Dark'} mode`}>
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
          )}
        </button>
      </div>
    </aside>
  );
}
