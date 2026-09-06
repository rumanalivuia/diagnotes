import { useState } from 'react';
import { useDiag } from '../AppContext.jsx';
import CommentCard from './CommentCard.jsx';
import { formatRel } from './Time.jsx';

export default function LibraryView({ onEdit, onNew }) {
  const {
    visible,
    filters,
    setFilters,
    view,
    recent,
    deleteComment,
    toast,
    isPublic,
    showLoginPrompt,
  } = useDiag();
  const [searching] = useState(false);

  function handleDelete(comment, opts) {
    if (opts?.reject) {
      // reject flow is handled in CommentCard for pending; here confirm plain delete
    }
    if (!window.confirm(`Delete "${comment.title}"?`)) return;
    deleteComment(comment.id).then(() => toast.success('Deleted'));
  }

  // ── Recently copied view ──
  if (view === 'recent') {
    return (
      <div className="content-grid">
        <div className="results-col">
          <div className="results-head">
            <h2>Recently copied</h2>
            <span className="hint">tap to copy again</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state">
              <div className="big">📋</div>
              <h3>Nothing copied yet</h3>
              <p>Comments you copy land here for fast re-access.</p>
            </div>
          ) : (
            <div className="recent-list">
              {recent.map((r) => {
                const c = visible.find((x) => x.id === r.id) || { title: r.title };
                return (
                  <button
                    key={r.id}
                    className="recent-item"
                    onClick={() => {
                      const full = visible.find((x) => x.id === r.id);
                      if (full) onEdit(full, { copyOnly: true });
                    }}
                  >
                    <span className="t">{c.title}</span>
                    <span className="recent-time">copied {formatRel(r.copied_at)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Favorites view ──
  if (view === 'favorites') {
    return (
      <div className="content-grid">
        <div className="results-col">
          <div className="results-head">
            <h2>Favorites</h2>
            <span className="hint">{visible.length} saved</span>
          </div>
          {visible.length === 0 ? (
            <div className="empty-state">
              <div className="big">❤️</div>
              <h3>No favorites yet</h3>
              <p>Tap the heart icon on any comment to save it here.</p>
            </div>
          ) : (
            visible.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                onEdit={(cm) => onEdit(cm)}
                onDelete={(cm) => handleDelete(cm)}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  // ── Library view ──
  const activeCat = filters.categoryId;
  const isFiltered = filters.query || filters.categoryId || filters.tag;

  return (
    <div className="content-grid">
      <div className="results-col">
        <div className="results-head">
          <h2>
            {filters.type === 'shared' ? 'Shared library' : 'My snippets'}
            {filters.tag && <> · #{filters.tag}</>}
            {activeCat && <> · category</>}
          </h2>
          <span className="hint">
            {visible.length} result{visible.length === 1 ? '' : 's'}
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="empty-state">
            <div className="big">{isFiltered ? '🔍' : '🗂️'}</div>
            <h3>{isFiltered ? 'No matching comments' : 'No comments here yet'}</h3>
            <p>
              {isFiltered
                ? 'Try a different search or clear the filters.'
                : isPublic
                  ? 'Browse the shared library of diagnostic comments. Sign in to create your own.'
                  : 'Create your first snippet — it will stay private until you submit it to the shared library.'}
            </p>
            {isFiltered ? (
              <button
                className="btn btn-secondary"
                onClick={() =>
                  setFilters({
                    type: filters.type,
                    categoryId: null,
                    tag: null,
                    query: '',
                    status: null,
                  })
                }
              >
                Clear filters
              </button>
            ) : isPublic ? (
              <button className="btn btn-primary" onClick={showLoginPrompt}>
                Sign in to contribute
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onNew}>
                + New comment
              </button>
            )}
          </div>
        ) : (
          visible.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              onEdit={(cm) => onEdit(cm)}
              onDelete={(cm) => handleDelete(cm)}
            />
          ))
        )}
      </div>
    </div>
  );
}
