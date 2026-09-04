import { useState } from 'react';
import { useDiag } from '../AppContext.jsx';

export default function Login() {
  const { login, loginCenter, signup, neonEnabled, toast } = useDiag();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'center'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = neonEnabled && mode === 'signup';
  const isCenter = mode === 'center';

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (isCenter) {
        await loginCenter(email.trim(), password);
        toast.success('Welcome back');
      } else if (isSignup) {
        await signup(name.trim(), email.trim(), password);
        toast.success('Account created — welcome');
      } else {
        await login(email.trim(), password);
        toast.success('Welcome back');
      }
    } catch (err) {
      const msg = err.message || 'Sign-in failed';
      if (isSignup && /already exists/i.test(msg)) {
        // Account exists: drop them on the sign-in tab with the email kept.
        setMode('signin');
        setError('An account with this email already exists — sign in below.');
      } else if (!isCenter && neonEnabled && /invalid email or password/i.test(msg)) {
        setError('No member account matches this email. Create one with “Create account”, or use center login below.');
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
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">D</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 18 }}>DiagNotes</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>diagnostic comments library</div>
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
            <button type="button" role="tab" aria-selected={mode === 'signin'}
              className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); }}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'}
              className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>
              Create account
            </button>
          </div>
        )}
        {error && <div className="login-error" role="alert">{error}</div>}
        {isSignup && (
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input id="name" className="input" type="text" autoComplete="name" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="e.g. Lab — Hematology" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">{isSignup ? 'Work email' : 'Email'}</label>
          <input id="email" className="input" type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="Center email address" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password{isSignup ? ' (min. 8 characters)' : ''}</label>
          <input id="password" className="input" type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
            minLength={isSignup ? 8 : undefined} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
          {busy ? busyLabel : goLabel}
        </button>
        {neonEnabled && (
          <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 14, textAlign: 'center' }}>
            {isCenter
              ? <button type="button" className="link-btn" onClick={() => { setMode('signin'); setError(''); }}>← Back to member sign-in</button>
              : <button type="button" className="link-btn" onClick={() => { setMode('center'); setError(''); }}>Use center login instead</button>}
          </p>
        )}
        {import.meta.env.DEV && !neonEnabled && (
          <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16, textAlign: 'center' }}>
            default dev login: diagnotes@center.local / devpassword
          </p>
        )}
      </form>
    </div>
  );
}
