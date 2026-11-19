import { useEffect, useRef, useState } from 'react';
import {
  authMessage, checkConfirmed, createAccount, resendConfirmation, resetPassword,
  signInWithEmail, signInWithGoogle, signOut,
} from './account';

/**
 * The Hive account sheet: sign in, create an account, confirm the email, or
 * sign out. Apps trust a Hive account only once its email is confirmed, so a
 * new email-and-password account waits on the "Check your email" step.
 */
export function AccountSheet({ user, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('input, button')?.focus();
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('keydown', esc); prev?.focus?.(); };
  }, [onClose]);

  return (
    <div className="scrim hive-layer" onClick={onClose}>
      <div className="sheet-panel account" role="dialog" aria-modal="true" aria-label="Hive account" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>Hive account</h2><button className="pill" onClick={onClose}>Close</button></div>
        {!user ? <SignedOut onDone={onClose} /> : !user.verified ? <Confirm user={user} onDone={onClose} /> : <SignedIn user={user} />}
      </div>
    </div>
  );
}

function SignedOut({ onDone }) {
  const [mode, setMode] = useState('in'); // 'in' | 'new' | 'reset'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });

  const run = async (fn, after) => {
    setBusy(true); setMsg({ text: '', bad: false });
    try { await fn(); after?.(); } catch (e) { const t = authMessage(e); if (t) setMsg({ text: t, bad: true }); } finally { setBusy(false); }
  };
  const submit = (e) => {
    e.preventDefault();
    if (mode === 'in') run(() => signInWithEmail(email, password), onDone);
    else if (mode === 'new') run(() => createAccount(name, email, password));
    else run(() => resetPassword(email), () => setMsg({ text: `If ${email.trim()} has a Hive account, a link to reset the password is on its way.`, bad: false }));
  };

  return (
    <>
      <p className="sheet-note">Sign in once, and apps that support Hive sign you in by themselves.</p>
      {mode !== 'reset' && (
        <div className="seg" role="tablist" aria-label="Sign in or create an account">
          <button role="tab" aria-selected={mode === 'in'} onClick={() => { setMode('in'); setMsg({ text: '' }); }}>Sign in</button>
          <button role="tab" aria-selected={mode === 'new'} onClick={() => { setMode('new'); setMsg({ text: '' }); }}>Create account</button>
        </div>
      )}
      <form className="auth-form" onSubmit={submit}>
        {mode === 'new' && (
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        )}
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
        {mode !== 'reset' && (
          <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} /></label>
        )}
        {msg.text && <p className={`auth-msg ${msg.bad ? 'bad' : ''}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
        <button className="pill strong wide" type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'new' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'in' && <button type="button" className="link-btn" onClick={() => { setMode('reset'); setMsg({ text: '' }); }}>Forgot your password?</button>}
        {mode === 'reset' && <button type="button" className="link-btn" onClick={() => { setMode('in'); setMsg({ text: '' }); }}>Back to sign in</button>}
        {mode === 'new' && <p className="sheet-note">Use the same email as your apps, so Hive finds your accounts. We’ll send a link to confirm it.</p>}
      </form>
      {mode !== 'reset' && (
        <>
          <div className="or"><span>or</span></div>
          <button className="pill wide" disabled={busy} onClick={() => run(signInWithGoogle, onDone)}>Continue with Google</button>
        </>
      )}
    </>
  );
}

function Confirm({ user }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const act = async (fn) => {
    setBusy(true); setMsg({ text: '', bad: false });
    try { await fn(); } catch (e) { setMsg({ text: authMessage(e) || 'Something went wrong. Try again.', bad: true }); } finally { setBusy(false); }
  };
  return (
    <div className="confirm">
      <h3>Check your email</h3>
      <p>We sent a link to <b>{user.email}</b>. Open it to confirm this is your address, then come back here.</p>
      <p className="sheet-note">Until then, apps inside Hive ask you to sign in on their own.</p>
      {msg.text && <p className={`auth-msg ${msg.bad ? 'bad' : ''}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p>}
      <button className="pill strong wide" disabled={busy} onClick={() => act(async () => {
        if (!(await checkConfirmed())) setMsg({ text: 'Not confirmed yet. Open the link in the email first.', bad: true });
      })}>I’ve confirmed it</button>
      <div className="confirm-row">
        <button className="link-btn" disabled={busy} onClick={() => act(async () => { await resendConfirmation(); setMsg({ text: 'Sent again. Check your spam folder too.', bad: false }); })}>Send the email again</button>
        <button className="link-btn" disabled={busy} onClick={() => signOut()}>Use a different account</button>
      </div>
    </div>
  );
}

function SignedIn({ user }) {
  return (
    <div className="set-row">
      <span><b>{user.name || 'Signed in'}</b><small>{user.email}. Apps that support Hive sign you in by themselves.</small></span>
      <button className="pill" onClick={() => signOut()}>Sign out</button>
    </div>
  );
}
