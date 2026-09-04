import { useState } from 'react';
import { useDiag } from '../AppContext.jsx';

export default function Login() {
  const { login, signup, neonEnabled, toast } = useDiag();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const showSignup = neonEnabled && mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (showSignup) {
        await signup(name.trim(), email.trim(), password);
        toast.success('Account created — welcome');
      } else {
        await login(email.trim(), password);
        toast.success('Welcome back');
      }
    } catch (err) {
      setError(err.message || 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  }

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
        <h1>{showSignup ? 'Create account' : 'Sign in'}</h1>
        <p className="sub">
          {neonEnabled
            ? 'One account per member. Everyone shares the same comments library.'
            : 'One shared login per center. Comments sync across this device and the web.'}
        </p>
        {neonEnabled && (
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
        {showSignup && (
          <div className="field">
            <label htmlFor="name">Display name</label>
            <input id="name" className="input" type="text" autoComplete="name" value={name}
              onChange={(e) => setName(e.target.value)} placeholder="e.g. Lab — Hematology" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">{showSignup ? 'Work email' : 'Email'}</label>
          <input id="email" className="input" type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="Center email address" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password{showSignup ? ' (min. 8 characters)' : ''}</label>
          <input id="password" className="input" type="password"
            autoComplete={showSignup ? 'new-password' : 'current-password'} value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
            minLength={showSignup ? 8 : undefined} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
          {busy ? (showSignup ? 'Creating account…' : 'Signing in…') : (showSignup ? 'Create account' : 'Sign in')}
        </button>
        {import.meta.env.DEV && !neonEnabled && (
          <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16, textAlign: 'center' }}>
            default dev login: diagnotes@center.local / devpassword
          </p>
        )}
      </form>
    </div>
  );
}
