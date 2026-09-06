import { textOf, htmlOf } from './richtext.js';

/**
 * Copy a comment to the clipboard.
 *
 * Best effort: try the modern async Clipboard API with a ClipboardItem that
 * carries BOTH text/html and text/plain (so pasting into Word/rich editors
 * keeps formatting and pasting into a plain field gets clean text). Falls back
 * to a hidden textarea + execCommand('copy') for older engines / Tauri webview.
 *
 * Returns the plain-text that was copied (for toast messaging).
 */

export async function copyComment(comment) {
  const plain = textOf(comment.body || []);
  const rich = htmlOf(comment.body || []);

  // Prefer async clipboard with both flavors when available.
  if (typeof navigator !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([rich || plain], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return plain;
    } catch {
      // fall through to legacy path
    }
  }

  // Legacy: write plain text via a hidden textarea.
  const ta = document.createElement('textarea');
  ta.value = plain;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  if (!ok) throw new Error('clipboard unavailable');
  return plain;
}
