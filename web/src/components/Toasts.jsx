import { useDiag } from '../AppContext.jsx';

export default function Toasts() {
  const { toasts } = useDiag();
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind !== 'info' ? t.kind : ''}`}>
          {t.kind === 'success' && <span>✓</span>}
          {t.kind === 'error' && <span>✕</span>}
          {t.msg}
        </div>
      ))}
    </div>
  );
}
