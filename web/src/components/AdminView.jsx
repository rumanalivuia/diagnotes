import { useState, useEffect } from 'react';
import { useDiag } from '../AppContext.jsx';
import CommentCard from './CommentCard.jsx';
import { useModalTrap } from '../lib/modal.js';

export default function AdminView({ onEdit }) {
  const { comments, categories, counts, addCategory, updateCategory, deleteComment, rejectShared, toast } = useDiag();
  const [newCat, setNewCat] = useState('');
  const [rejecting, setRejecting] = useState(null); // comment being rejected
  const [reason, setReason] = useState('');
  const rejectModalRef = useModalTrap(!!rejecting, () => { setRejecting(null); setReason(''); });

  const pending = comments.filter((c) => c.type === 'shared' && c.status === 'pending_approval');
  const rejected = comments.filter((c) => c.type === 'shared' && c.status === 'rejected');

  async function addCat(e) {
    e.preventDefault();
    if (!newCat.trim()) return;
    try { await addCategory(newCat.trim()); toast.success('Category added'); setNewCat(''); }
    catch { toast.error('Could not add category'); }
  }

  async function toggleArchive(cat) {
    try { await updateCategory(cat.id, { archived: cat.archived ? 0 : 1 }); }
    catch { toast.error('Update failed'); }
  }

  async function doReject() {
    if (!rejecting) return;
    try { await rejectShared(rejecting.id, reason.trim() || 'No reason given'); }
    catch { toast.error('Reject failed'); }
    setRejecting(null); setReason('');
  }

  function handleDelete(comment) {
    if (!window.confirm(`Delete "${comment.title}" from the library?`)) return;
    deleteComment(comment.id).then(() => toast.success('Removed'));
  }

  return (
    <div>
      <div className="results-head"><h2>Admin</h2><span className="hint">category management · review queue</span></div>

      <div className="admin-grid">
        <div className="stat-card"><div className="num">{counts.shared}</div><div className="lbl">Shared entries</div></div>
        <div className="stat-card"><div className="num">{pending.length}</div><div className="lbl">Awaiting review</div></div>
        <div className="stat-card"><div className="num">{categories.length}</div><div className="lbl">Active categories</div></div>
        <div className="stat-card"><div className="num">{comments.filter((c) => c.type === 'personal').length}</div><div className="lbl">Personal snippets</div></div>
      </div>

      <div className="panel">
        <h3>Review queue</h3>
        {pending.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', fontSize: 13.5, margin: 0 }}>Nothing awaiting approval. Submissions from staff appear here.</p>
        ) : (
          pending.map((c) => (
            <CommentCard key={c.id} comment={c} onEdit={onEdit} showPendingActions onDelete={() => setRejecting(c)} />
          ))
        )}
      </div>

      {rejected.length > 0 && (
        <div className="panel">
          <h3>Recently rejected</h3>
          {rejected.slice(0, 5).map((c) => (
            <CommentCard key={c.id} comment={c} onEdit={onEdit} onDelete={handleDelete} />
          ))}
        </div>
      )}

      <div className="panel">
        <h3>Categories</h3>
        <form className="row-inline" onSubmit={addCat} style={{ marginBottom: 10 }}>
          <input className="input" style={{ flex: 1 }} placeholder="New category name (e.g. Immunology)" value={newCat}
            onChange={(e) => setNewCat(e.target.value)} />
          <button className="btn btn-secondary" type="submit">Add</button>
        </form>
        {categories.map((c) => (
          <div key={c.id} className="cat-row">
            <span className="name">{c.name}</span>
            {c.archived ? <span className="archived-tag">archived</span> : null}
            <button className="mini-btn" onClick={() => toggleArchive(c)}>{c.archived ? 'Restore' : 'Archive'}</button>
          </div>
        ))}
      </div>

      {rejecting && (
        <div className="modal-backdrop" onClick={() => setRejecting(null)}>
          <div ref={rejectModalRef} className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h2>Reject submission</h2>
            <p className="sub">“{rejecting.title}” will not appear in the shared library.</p>
            <div className="field">
              <label htmlFor="rej-reason">Reason (optional — shown to the submitter)</label>
              <textarea id="rej-reason" className="textarea" rows="3" value={reason}
                onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate of existing entry" />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRejecting(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={doReject}>Reject submission</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
