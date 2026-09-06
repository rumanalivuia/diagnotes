import { useState, useRef, useEffect } from 'react';
import { useDiag } from '../AppContext.jsx';

export default function Login({ onClose }) {
  const { login, loginCenter, signup, neonEnabled, toast } = useDiag();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'center'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const emailRef = useRef(null);

  // Restore remembered email
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dn_remembered_email');
      if (saved) setEmail(saved);
    } catch {}
  }, []);

  const isSignup = neonEnabled && mode === 'signup';
  const isCenter = mode === 'center';

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');

    // Client-side email validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }

    // Client-side password validation for signup
    if (isSignup && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (isCenter) {
        await loginCenter(trimmedEmail, password);
        toast.success('Welcome back');
      } else if (isSignup) {
        await signup(name.trim(), trimmedEmail, password);
        toast.success('Account created — welcome');
      } else {
        await login(trimmedEmail, password);
        toast.success('Welcome back');
      }
      // Remember email on success
      try {
        localStorage.setItem('dn_remembered_email', trimmedEmail);
      } catch {}
      onClose?.();
    } catch (err) {
      const msg = err.message || 'Sign-in failed';
      if (isSignup && /already exists/i.test(msg)) {
        setMode('signin');
        setError('An account with this email already exists — sign in below.');
      } else if (!isCenter && neonEnabled && /invalid email or password/i.test(msg)) {
        setError(
          'No member account matches this email. Create one with "Create account", or use center login below.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const title = isCenter ? 'Center sign in' : isSignup ? 'Create account' : 'Sign in';
  const busyLabel = isCenter || !isSignup ? 'Signing in…' : 'Creating account…';
  const goLabel = isCenter || !isSignup ? 'Sign in' : 'Create account';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="login-card modal-login"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <div className="login-brand">
          <div className="brand-mark">D</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>DiagNotes</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              diagnostic comments library
            </div>
          </div>
        </div>
        <h1>{title}</h1>
        <p className="sub">
          {isCenter
            ? 'Shared center login (recovery path).'
            : neonEnabled
              ? 'One account per member. Everyone shares the same comments library.'
              : 'One shared login per center. Comments sync across this device and the web.'}
        </p>
        {neonEnabled && !isCenter && (
          <div className="auth-tabs" role="tablist" aria-label="Sign in or create account">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => {
                setMode('signin');
                setError('');
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => {
                setMode('signup');
                setError('');
              }}
            >
              Create account
            </button>
          </div>
        )}
        {error && (
          <div className="login-error" role="alert">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {isSignup && (
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input
              id="name"
              className="input"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lab — Hematology"
              required
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">{isSignup ? 'Work email' : 'Email'}</label>
          <input
            id="email"
            ref={emailRef}
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Center email address"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">
            Password{isSignup ? ' (min. 8 characters, letters and numbers)' : ''}
          </label>
          <div className="pw-wrap">
            <input
              id="password"
              className="input pw-input"
              type={showPw ? 'text' : 'password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={isSignup ? 8 : undefined}
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPw ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          {isSignup && (
            <p
              className="pw-hint mono"
              style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 4 }}
            >
              Use at least 8 characters with a mix of letters and numbers
            </p>
          )}
        </div>
        <button
          className="btn btn-primary login-submit"
          style={{ width: '100%' }}
          disabled={busy}
          type="submit"
        >
          {busy && <span className="spinner" />}
          {busy ? busyLabel : goLabel}
        </button>
        {neonEnabled && (
          <p
            className="mono"
            style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 14, textAlign: 'center' }}
          >
            {isCenter ? (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setMode('signin');
                  setError('');
                }}
              >
                ← Back to member sign-in
              </button>
            ) : (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setMode('center');
                  setError('');
                }}
              >
                Use center login instead
              </button>
            )}
          </p>
        )}
        {import.meta.env.DEV && !neonEnabled && (
          <p
            className="mono"
            style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16, textAlign: 'center' }}
          >
            default dev login: diagnotes@center.local / devpassword
          </p>
        )}
      </form>
    </div>
  );
}
