import { useDiag } from '../AppContext.jsx';
import { copyComment } from '../lib/clipboard.js';
import { renderBlocks } from './RichText.jsx';
import { formatRel } from './Time.jsx';
import { useState } from 'react';

export default function CommentDetail({ commentId, onBack }) {
  const { comments, categories, copyAndTrack, toast } = useDiag();
  const [copied, setCopied] = useState(false);
  const comment = comments.find((c) => c.id === commentId);
  const cat = comment ? categories.find((c) => c.id === comment.category_id) : null;

  if (!comment) {
    return (
      <div className="content-grid">
        <div className="results-col">
          <div className="empty-state">
            <div className="big">🔍</div>
            <h3>Comment not found</h3>
            <p>This comment may not be synced yet, or the link may be incorrect.</p>
            <button className="btn btn-secondary" onClick={onBack}>← Back to library</button>
          </div>
        </div>
      </div>
    );
  }

  async function handleCopy() {
    try {
      await copyComment(comment);
      await copyAndTrack(comment);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Clipboard unavailable — copy manually');
    }
  }

  return (
    <div className="content-grid">
      <div className="results-col">
        <button className="link-btn" onClick={onBack} style={{ marginBottom: 14 }}>← Back to library</button>
        <article className="card" style={{ borderLeftColor: 'var(--teal)' }}>
          <div className="card-header">
            <h2 className="card-title" style={{ fontSize: 18 }}>{comment.title}</h2>
            <button className={`copy-btn ${copied ? 'done' : ''}`} onClick={handleCopy} aria-label="Copy comment">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="card-body" style={{ maxHeight: 'none' }}>{renderBlocks(comment.body || [])}</div>
          <div className="card-meta">
            {cat && <span className="chip cat">{cat.name}</span>}
            {(comment.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}
            {comment.type === 'shared' && (
              <span className={`chip status ${comment.status}`}>{comment.status.replace('_', ' ')}</span>
            )}
          </div>
          <div className="mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-faint)' }}>
            Updated {formatRel(comment.updated_at)}
          </div>
        </article>
      </div>
    </div>
  );
}
