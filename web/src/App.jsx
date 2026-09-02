import { useState, useCallback } from 'react';
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
  if (!booted) return <div className="login-wrap">Loading…</div>;
  if (!session) return <Login />;
  return <Shell />;
}
