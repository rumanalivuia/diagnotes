import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hook that traps focus inside a modal element, sets inert on the app root,
 * and restores focus on close.
 */
export function useModalTrap(open, onClose) {
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;

    // Remember what had focus before the modal opened
    triggerRef.current = document.activeElement;

    // Set inert on the app root
    const root = document.getElementById('root');
    const appShell = root?.querySelector('.app');
    if (appShell) appShell.setAttribute('inert', '');

    // Focus the first focusable element
    const first = el.querySelector(FOCUSABLE);
    if (first) setTimeout(() => first.focus(), 0);

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = el.querySelectorAll(FOCUSABLE);
      if (!focusable.length) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    el.addEventListener('keydown', handleKeyDown);

    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      if (appShell) appShell.removeAttribute('inert');
      // Restore focus to the trigger
      if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
        triggerRef.current.focus();
      }
    };
  }, [open, onClose]);

  return ref;
}
