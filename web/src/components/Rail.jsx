import { useDiag } from '../AppContext.jsx';

export default function Rail({ onNew }) {
  const { view, setView, filters, setFilters, categories, tagCloud, counts, session, logout } = useDiag();

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
        <button className={`nav-btn ${view === 'recent' ? 'active' : ''}`} onClick={() => setView('recent')}>
          Recently copied
        </button>
        <button className={`nav-btn ${view === 'admin' ? 'active' : ''}`} onClick={() => setView('admin')}>
          Admin
          {counts.pending > 0 && <span className="nav-badge">{counts.pending}</span>}
        </button>
      </nav>

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
        <div className="user-line">
          <span className="avatar">{session?.account?.email?.[0]?.toUpperCase() || '?'}</span>
          <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
            {session?.account?.email}
          </span>
        </div>
        <button className="link-btn" onClick={onNew}>+ New comment</button>
        <button className="link-btn" onClick={logout}>Sign out</button>
      </div>
    </aside>
  );
}
