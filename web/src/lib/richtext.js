/**
 * DiagNotes rich-text model.
 *
 * Comments are stored as an array of "blocks". A block is either:
 *   { t: 'p', r: Runs }                 paragraph
 *   { t: 'ul', items: [{ r: Runs }] }   bullet list
 *   { t: 'ol', items: [{ r: Runs }] }   numbered list
 *
 * A Run is a string, or { x: text, b: bold, i: italic, u: underline }.
 * This is a deliberately small JSON model (no HTML), so it is safe to render
 * anywhere (web / Tauri) and trivial to sanitize.  Nothing user-supplied is
 * ever interpreted as HTML: we render to text nodes only.
 */

/** Plain text of a run array. */
export function runsText(runs = []) {
  return runs.map((r) => (typeof r === 'string' ? r : r.x ?? '')).join('');
}

/** Plain-text projection of a block array (used for search + plain clipboard). */
export function textOf(blocks = []) {
  const lines = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.t === 'ul' || b.t === 'ol') {
      for (const item of b.items || []) lines.push('• ' + runsText(item.r));
    } else {
      lines.push(runsText(b.r));
    }
  }
  return lines.join('\n').trim();
}

/** Lightweight HTML for the rich-text clipboard payload. Built from text nodes only. */
export function htmlOf(blocks = []) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const runs = (runs = []) => {
    let out = '';
    for (const r of runs) {
      const t = esc(r.x ?? (typeof r === 'string' ? r : ''));
      if (r.b) out += `<b>${t}</b>`;
      else if (r.i) out += `<i>${t}</i>`;
      else if (r.u) out += `<u>${t}</u>`;
      else out += t;
    }
    return out;
  };
  const parts = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.t === 'ul' || b.t === 'ol') {
      const li = (b.items || []).map((item) => `<li>${runs(item.r)}</li>`).join('');
      parts.push(`<${b.t}>${li}</${b.t}>`);
    } else {
      parts.push(`<p>${runs(b.r)}</p>`);
    }
  }
  return parts.join('');
}

/** Empty document. */
export function emptyDoc() {
  return [{ t: 'p', r: [{ x: '' }] }];
}

/** Run split around mark boundaries, used by the editor helpers. */
export function splitRun(run, mark, max) {
  if (typeof run === 'string') return [{ x: run, [mark]: true }];
  return [{ ...run, [mark]: true }];
}

/** Toggle a mark (b/i/u) on the current selection of a contentEditable. */
export function toggleMark(editor, mark) {
  editor.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  document.execCommand(mark === 'b' ? 'bold' : mark === 'i' ? 'italic' : 'underline');
}

/** Insert an unordered list at the cursor. */
export function insertBulletList(editor) {
  editor.focus();
  document.execCommand('insertUnorderedList');
}
