import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { useDiag } from './AppContext.jsx';
import Rail from './components/Rail.jsx';
import TopBar from './components/TopBar.jsx';
import LibraryView from './components/LibraryView.jsx';
import CommentDetail from './components/CommentDetail.jsx';
import Login from './components/Login.jsx';
import Toasts from './components/Toasts.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const AdminView = lazy(() => import('./components/AdminView.jsx'));
const CommentEditor = lazy(() => import('./components/CommentEditor.jsx'));

/* ── Mobile FAB: opens new-comment modal when the rail is hidden ── */
function MobileFab({ onClick }) {
  return (
    <button className="fab-btn" onClick={onClick} aria-label="New comment" title="New comment">
      <span aria-hidden>+</span>
    </button>
  );
}

function Shell() {
  const { view, setView, showLogin, hideLoginPrompt } = useDiag();
  const [editing, setEditing] = useState(null); // comment | { new: true }
  const [modalOpen, setModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null); // comment id for detail view

  // Hash-based routing for comment detail
  useEffect(() => {
    function checkHash() {
      const hash = window.location.hash;
      const match = hash.match(/^#\/comment\/(.+)$/);
      setDetailId(match ? match[1] : null);
    }
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  const openNew = useCallback(() => {
    setEditing({ new: true });
    setModalOpen(true);
    setView('library');
  }, [setView]);

  const openEdit = useCallback((comment) => {
    setEditing(comment);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditing(null);
  }, []);

  const goBack = useCallback(() => {
    window.location.hash = '';
    setDetailId(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (modalOpen) return;
      if (e.key === '/' || (e.ctrlKey && e.key === 'k')) {
        e.preventDefault();
        document.querySelector('.search-input')?.focus();
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNew();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, openNew]);

  // If viewing a specific comment via deep link
  if (detailId) {
    return (
      <div className="app">
        <Rail onNew={openNew} />
        <div className="app-header">
          <TopBar onNew={openNew} />
        </div>
        <main className="main">
          <ErrorBoundary>
            <CommentDetail commentId={detailId} onBack={goBack} />
          </ErrorBoundary>
        </main>
        <Toasts />
      </div>
    );
  }

  return (
    <div className="app">
      <Rail onNew={openNew} />
      <div className="app-header">
        <TopBar onNew={openNew} />
      </div>
      <main className="main">
        <ErrorBoundary>
          {view === 'library' || view === 'recent' || view === 'favorites' ? (
            <LibraryView onEdit={openEdit} onNew={openNew} />
          ) : view === 'admin' ? (
            <Suspense
              fallback={
                <div className="empty-state">
                  <div className="skeleton" style={{ width: 180, height: 22 }} />
                </div>
              }
            >
              <AdminView onEdit={openEdit} />
            </Suspense>
          ) : (
            <div className="empty-state">
              <h3>Unknown view</h3>
            </div>
          )}
        </ErrorBoundary>
      </main>
      <MobileFab onClick={openNew} />
      {modalOpen && editing && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="skeleton" style={{ width: 400, height: 300 }} />
            </div>
          }
        >
          <CommentEditor
            initial={editing && !editing.new ? editing : null}
            onClose={closeModal}
            key={editing?.id || 'new'}
          />
        </Suspense>
      )}
      {showLogin && <Login onClose={hideLoginPrompt} />}
      <Toasts />
    </div>
  );
}

export default function App() {
  const { booted } = useDiag();
  if (!booted) return <SkeletonLoader />;
  return <Shell />;
}

function SkeletonLoader() {
  return (
    <div className="app">
      <div className="app-header">
        <div className="topbar">
          <div className="skeleton" style={{ width: 80, height: 36, borderRadius: 6 }} />
          <div
            className="skeleton"
            style={{ flex: 1, maxWidth: 620, height: 38, borderRadius: 999 }}
          />
        </div>
      </div>
      <main className="main">
        <div className="results-head" style={{ marginBottom: 18 }}>
          <div className="skeleton" style={{ width: 180, height: 22, borderRadius: 4 }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: 18 }}>
            <div
              className="skeleton"
              style={{ width: '60%', height: 18, borderRadius: 4, marginBottom: 12 }}
            />
            <div
              className="skeleton"
              style={{ width: '100%', height: 14, borderRadius: 4, marginBottom: 6 }}
            />
            <div
              className="skeleton"
              style={{ width: '85%', height: 14, borderRadius: 4, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="skeleton" style={{ width: 60, height: 20, borderRadius: 999 }} />
              <div className="skeleton" style={{ width: 48, height: 20, borderRadius: 999 }} />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
