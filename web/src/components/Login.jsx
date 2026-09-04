import { useState } from 'react';
import { useDiag } from '../AppContext.jsx';

export default function Login() {
  const { login, toast } = useDiag();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      toast.success('Welcome back');
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
        <h1>Sign in</h1>
        <p className="sub">One shared login per center. Comments sync across this device and the web.</p>
        {error && <div className="login-error" role="alert">{error}</div>}
        <div className="field">
          <label htmlFor="email">Center email</label>
          <input id="email" className="input" type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="diagnotes@center.local" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" className="input" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mono" style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 16, textAlign: 'center' }}>
          default dev login: diagnotes@center.local / devpassword
        </p>
      </form>
    </div>
  );
}
