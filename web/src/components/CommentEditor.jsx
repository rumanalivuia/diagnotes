import { useEffect, useRef, useState } from 'react';
import RichTextEditor from './RichTextEditor.jsx';
import { useDiag } from '../AppContext.jsx';
import { textOf, emptyDoc } from '../lib/richtext.js';

const PLACEHOLDER = 'Write the comment exactly as it should appear in the report…';

export default function CommentEditor({ initial, onClose }) {
  const { categories, saveComment, submitToShared, toast, filters } = useDiag();
  const [title, setTitle] = useState(initial?.title || '');
  const [type] = useState(initial?.type || (filters.type === 'shared' ? 'shared' : 'personal'));
  const [categoryId, setCategoryId] = useState(initial?.category_id || '');
  const [tagsText, setTagsText] = useState((initial?.tags || []).join(', '));
  const [body, setBody] = useState(initial?.body?.length ? initial.body : emptyDoc());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const canSubmitShared = type === 'personal' && textOf(body).trim();

  async function save({ submit = false } = {}) {
    if (busy) return;
    if (!title.trim()) { setError('Give the comment a short title.'); return; }
    if (type === 'shared' && !categoryId) { setError('Shared library comments need a category.'); return; }
    setBusy(true); setError('');
    const tags = tagsText.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const comment = {
      id: initial?.id,
      type,
      title: title.trim(),
      body,
      tags,
      category_id: categoryId || null,
      status: initial?.status || (type === 'shared' ? 'pending_approval' : 'draft'),
      created_at: initial?.created_at,
    };
    try {
      const saved = await saveComment(comment);
      if (submit) {
        await submitToShared(saved);
        toast.success('Saved & submitted for approval');
      } else {
        toast.success(type === 'shared' ? 'Saved to shared library' : 'Snippet saved');
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save — are you online?');
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Comment editor">
        <h2>{initial ? 'Edit comment' : 'New comment'}</h2>
        <p className="sub">
          {type === 'personal'
            ? 'Personal snippets are private to this center until you submit them to the shared library.'
            : 'Shared library comments are visible to the whole center.'}
        </p>

        {error && <div className="login-error" role="alert">{error}</div>}

        <div className="field">
          <label htmlFor="ce-title">Title</label>
          <input id="ce-title" ref={titleRef} className="input" value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Hemolyzed sample — results may be affected" />
        </div>

        <div className="row-inline" style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="ce-cat">Category</label>
            <select id="ce-cat" className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label htmlFor="ce-tags">Tags <span style={{ fontWeight: 400, color: 'var(--ink-faint)' }}>(comma-separated)</span></label>
            <input id="ce-tags" className="input" value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="urgent-flag, pediatric, follow-up" />
          </div>
        </div>

        <div className="field">
          <label>Comment text</label>
          <RichTextEditor value={body} onChange={setBody} placeholder={PLACEHOLDER} />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          {canSubmitShared && !initial && (
            <button className="btn btn-secondary" disabled={busy} onClick={() => save({ submit: true })}>Save &amp; submit</button>
          )}
          <button className="btn btn-primary" disabled={busy} onClick={() => save()}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
