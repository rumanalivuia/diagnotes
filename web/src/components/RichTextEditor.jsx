import { useRef, useState, useEffect } from 'react';

/**
 * Lightweight rich-text editor built on contentEditable + the browser's
 * native execCommand for bold/italic/underline/lists.  Output is produced as
 * our block model ({ t, r } / items), parsed back from the DOM, so there is no
 * HTML stored anywhere and nothing untrusted can be injected.
 */

/** Wrap a run value into runs if it is a plain string. */
export function wrapRuns(r) {
  return Array.isArray(r) ? r : [{ x: r || '' }];
}

/** Serialize current DOM children into our block model. */
export function blocksFromHtml(el) {
  const blocks = [];
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) blocks.push({ t: 'p', r: [{ x: node.textContent }] });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      const items = [];
      for (const li of node.querySelectorAll(':scope > li')) {
        items.push({ r: runsFromNode(li) });
      }
      if (items.length) blocks.push({ t: tag, items });
    } else if (tag === 'div' || tag === 'p' || tag === 'br') {
      const text = node.textContent || '';
      if (text.trim() || tag !== 'br') blocks.push({ t: 'p', r: runsFromNode(node) });
    } else {
      const text = node.textContent || '';
      if (text.trim()) blocks.push({ t: 'p', r: runsFromNode(node) });
    }
  }
  return blocks.length ? blocks : [{ t: 'p', r: [{ x: '' }] }];
}

/** Extract runs (with b/i/u) from a contentEditable element's text nodes. */
function runsFromNode(el) {
  const runs = [];
  const walk = (n) => {
    for (const child of n.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const x = child.textContent || '';
        if (!x) continue;
        let p = child.parentElement;
        const r = { x };
        while (p && p !== el) {
          const t = p.tagName.toLowerCase();
          if (t === 'b' || t === 'strong') r.b = true;
          if (t === 'i' || t === 'em') r.i = true;
          if (t === 'u') r.u = true;
          p = p.parentElement;
        }
        runs.push(r);
      } else if (child.nodeType === Node.ELEMENT_NODE && !['UL', 'OL', 'LI'].includes(child.tagName)) {
        walk(child);
      }
    }
  };
  walk(el);
  return runs.length ? runs : [{ x: el.textContent || '' }];
}

export default function RichTextEditor({ value = [], onChange, placeholder }) {
  const elRef = useRef(null);
  const [activeMarks, setActiveMarks] = useState({ b: false, i: false, u: false });
  const editingRef = useRef(false);

  // Populate the editor when `value` changes from outside (load comment).
  useEffect(() => {
    if (editingRef.current) { editingRef.current = false; return; }
    const el = elRef.current;
    if (!el) return;
    if (JSON.stringify(blocksFromHtml(el)) === JSON.stringify(value)) return;
    el.innerHTML = '';
    appendBlocks(el, value);
  }, [value]);

  function commit() {
    if (!elRef.current) return;
    editingRef.current = true;
    onChange(blocksFromHtml(elRef.current));
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      // allow default (new paragraph)
    }
    // Ctrl+B / Ctrl+I handled natively by execCommand in toolbar; keep shortcuts here too.
    requestAnimationFrame(updateMarks);
  }

  function updateMarks() {
    const active = {
      b: document.queryCommandState?.('bold') ?? false,
      i: document.queryCommandState?.('italic') ?? false,
      u: document.queryCommandState?.('underline') ?? false,
    };
    setActiveMarks(active);
  }

  function exec(cmd, mark) {
    elRef.current?.focus();
    document.execCommand(cmd);
    setActiveMarks((m) => ({ ...m, [mark]: !m[mark] }));
    commit();
    requestAnimationFrame(updateMarks);
  }

  return (
    <div className="editor-shell">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" className={`tb-btn ${activeMarks.b ? 'on' : ''}`} title="Bold (Ctrl+B)"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold', 'b')}><b>B</b></button>
        <button type="button" className={`tb-btn ${activeMarks.i ? 'on' : ''}`} title="Italic (Ctrl+I)"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic', 'i')}><i>I</i></button>
        <button type="button" className={`tb-btn ${activeMarks.u ? 'on' : ''}`} title="Underline (Ctrl+U)"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline', 'u')}><u>U</u></button>
        <span className="tb-sep" />
        <button type="button" className="tb-btn" title="Bullet list"
          onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList', null)}>•≡</button>
      </div>
      <div
        ref={elRef}
        className="editor"
        contentEditable
        data-placeholder={placeholder || 'Write the comment text…'}
        role="textbox"
        aria-multiline="true"
        onInput={commit}
        onKeyUp={() => requestAnimationFrame(updateMarks)}
        onMouseUp={() => requestAnimationFrame(updateMarks)}
        onBlur={() => { commit(); updateMarks(); }}
        suppressContentEditableWarning
      />
    </div>
  );
}

/** Populate a contentEditable element from block model. */
export function appendBlocks(el, blocks = []) {
  for (const b of blocks) {
    if (!b) continue;
    if (b.t === 'ul' || b.t === 'ol') {
      const ul = document.createElement(b.t);
      for (const item of b.items || []) {
        const li = document.createElement('li');
        appendRuns(li, item.r);
        ul.appendChild(li);
      }
      el.appendChild(ul);
    } else {
      const p = document.createElement('p');
      appendRuns(p, b.r);
      el.appendChild(p);
    }
  }
  if (!el.childNodes.length) el.appendChild(document.createElement('p'));
}

function appendRuns(parent, runs = []) {
  for (const r of runs) {
    let node = document.createTextNode(r.x ?? (typeof r === 'string' ? r : ''));
    if (typeof r !== 'string' && (r.b || r.i || r.u)) {
      const wrap = [];
      if (r.b) wrap.push('b');
      if (r.i) wrap.push('i');
      if (r.u) wrap.push('u');
      node = document.createElement(wrap[0]);
      node.appendChild(document.createTextNode(r.x ?? ''));
      for (const tag of wrap.slice(1)) {
        const outer = document.createElement(tag);
        outer.appendChild(node);
        node = outer;
      }
    }
    parent.appendChild(node);
  }
}
