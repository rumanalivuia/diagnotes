import { useState } from 'react';
import { useDiag } from '../AppContext.jsx';
import { copyComment } from '../lib/clipboard.js';
import { renderBlocks } from './RichText.jsx';
import { formatRel } from './Time.jsx';

export default function CommentCard({ comment, onEdit, onDelete }) {
  const {
    copyAndTrack,
    toast,
    categories,
    approveShared,
    rejectShared,
    submitToShared,
    favorites,
    toggleFavorite,
    isPublic,
    isAdmin,
    showLoginPrompt,
  } = useDiag();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const cat = categories.find((c) => c.id === comment.category_id);
  const isFav = favorites.includes(comment.id);

  const isPersonal = comment.type === 'personal';
  const isPending = comment.type === 'shared' && comment.status === 'pending_approval';
  const canSubmit = !isPublic && isPersonal && comment.status === 'draft';

  async function handleCopy() {
    if (isPublic) {
      showLoginPrompt();
      return;
    }
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

  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}#/comment/${comment.id}`;
    const shareData = {
      title: comment.title,
      text: `Check out this diagnostic comment: ${comment.title}`,
      url,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      toast.success('Link copied');
    }
  }

  async function run(fn, okMsg) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
    } catch {
      toast.error('Action failed — are you online?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className={`card ${comment.status === 'approved' ? 'card-approved' : comment.status === 'pending_approval' ? 'card-pending' : comment.status === 'rejected' ? 'card-rejected' : ''}`}
      data-testid="comment-card"
    >
      <div className="card-header">
        <h3 className={`card-title ${isPersonal ? 'type-personal' : ''}`}>{comment.title}</h3>
        <div className="card-header-actions">
          {!isPublic && (
            <button
              className={`fav-btn ${isFav ? 'active' : ''}`}
              onClick={() => toggleFavorite(comment.id)}
              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
              title={isFav ? 'Unfavorite' : 'Favorite'}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={isFav ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          )}
          <button
            className="share-btn"
            onClick={handleShare}
            aria-label="Share link"
            title="Copy link"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          <button
            className={`copy-btn ${copied ? 'done' : ''}`}
            onClick={handleCopy}
            aria-label="Copy comment"
          >
            {copied ? (
              <span className="icon">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </span>
            ) : (
              <span className="icon">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </span>
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className={`card-body ${expanded ? '' : 'clamped'}`}>
        {renderBlocks(comment.body || [])}
      </div>
      {!expanded && (
        <button className="expand-btn" onClick={() => setExpanded(true)}>
          Show more
        </button>
      )}
      {expanded && (
        <button className="expand-btn" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}

      <div className="card-meta">
        {cat && <span className="chip cat">{cat.name}</span>}
        {(comment.tags || []).slice(0, 4).map((t) => (
          <span key={t} className="chip">
            {t}
          </span>
        ))}
        {comment.type === 'shared' && (
          <span className={`chip status ${comment.status}`}>
            {comment.status.replace('_', ' ')}
          </span>
        )}
        {comment.rejection_reason && (
          <span className="chip rejected" title={comment.rejection_reason}>
            rejected
          </span>
        )}
        <span className="copy-count" title={`Copied ${comment.copy_count || 0} times`}>
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {comment.copy_count || 0}
        </span>
        <span className="card-actions">
          {isPending && isAdmin && (
            <>
              <button
                className="mini-btn"
                disabled={busy}
                onClick={() =>
                  run(() => approveShared(comment.id), 'Approved — now visible to everyone')
                }
              >
                Approve
              </button>
              <button
                className="mini-btn"
                disabled={busy}
                onClick={() => onDelete?.(comment, { reject: true })}
              >
                Reject
              </button>
            </>
          )}
          {canSubmit && (
            <button
              className="mini-btn"
              disabled={busy}
              onClick={() => run(() => submitToShared(comment), 'Submitted for approval')}
            >
              Submit to library
            </button>
          )}
          {!isPublic && onEdit && (
            <button className="mini-btn" onClick={() => onEdit(comment)}>
              Edit
            </button>
          )}
          {!isPublic && onDelete && !isPending && (
            <button className="mini-btn danger" disabled={busy} onClick={() => onDelete(comment)}>
              Delete
            </button>
          )}
        </span>
      </div>
      <div className="mono" style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-faint)' }}>
        Updated {formatRel(comment.updated_at)}
      </div>
    </article>
  );
}
