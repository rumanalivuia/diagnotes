import { useState, useCallback, useEffect } from 'react';
import { useDiag } from './AppContext.jsx';
import Rail from './components/Rail.jsx';
import TopBar from './components/TopBar.jsx';
import LibraryView from './components/LibraryView.jsx';
import AdminView from './components/AdminView.jsx';
import CommentEditor from './components/CommentEditor.jsx';
import Login from './components/Login.jsx';
import Toasts from './components/Toasts.jsx';

/* ── Mobile FAB: opens new-comment modal when the rail is hidden ── */
function MobileFab({ onClick }) {
  return (
    <button className="fab-btn" onClick={onClick} aria-label="New comment">
      +
    </button>
  );
}

function Shell() {
  const { view, setView } = useDiag();
  const [editing, setEditing] = useState(null); // comment | { new: true }
  const [modalOpen, setModalOpen] = useState(false);

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

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      // Don't trigger shortcuts when typing in an input
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

  return (
    <div className="app">
      <Rail onNew={openNew} />
      <div className="app-header">
        <TopBar onNew={openNew} />
      </div>
      <main className="main">
        {view === 'library' || view === 'recent' ? (
          <LibraryView onEdit={openEdit} onNew={openNew} />
        ) : view === 'admin' ? (
          <AdminView onEdit={openEdit} />
        ) : (
          <div className="empty-state"><h3>Unknown view</h3></div>
        )}
      </main>
      {/* Floating Action Button — visible only below desktop breakpoint */}
      <MobileFab onClick={openNew} />
      {modalOpen && editing && (
        <CommentEditor
          initial={editing && !editing.new ? editing : null}
          onClose={closeModal}
          key={editing?.id || 'new'}
        />
      )}
      <Toasts />
    </div>
  );
}

export default function App() {
  const { session, booted } = useDiag();
  if (!booted) return <SkeletonLoader />;
  if (!session) return <Login />;
  return <Shell />;
}

function SkeletonLoader() {
  return (
    <div className="app">
      <div className="app-header">
        <div className="topbar">
          <div className="skeleton" style={{ width: 80, height: 36, borderRadius: 6 }} />
          <div className="skeleton" style={{ flex: 1, maxWidth: 620, height: 38, borderRadius: 999 }} />
        </div>
      </div>
      <main className="main">
        <div className="results-head" style={{ marginBottom: 18 }}>
          <div className="skeleton" style={{ width: 180, height: 22, borderRadius: 4 }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: 18 }}>
            <div className="skeleton" style={{ width: '60%', height: 18, borderRadius: 4, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: '100%', height: 14, borderRadius: 4, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: '85%', height: 14, borderRadius: 4, marginBottom: 12 }} />
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
