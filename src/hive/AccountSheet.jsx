import { useCallback, useEffect, useRef, useState } from 'react';
import { connectGoogle, GOOGLE_CHANGED, googleStatus, takeGoogleResult } from './googleConnect';
import {
  authMessage, createAccount, createHousehold, householdMessage, inviteCode, newInviteCode, joinHousehold, myHousehold,
  resendConfirmation, resetPassword, setNewPassword, signInWithEmail, signInWithGoogle, signOut,
} from './account';

/**
 * The Hive account sheet: sign in, create an account (confirmed by email),
 * set a new password from a reset link, sign out, and the household: start
 * one, invite someone with a code, or join with theirs.
 */
export function AccountSheet({ user, recovering, onClose }) {
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
        {recovering && user ? <NewPassword /> : !user ? <SignedOut onDone={onClose} /> : <SignedIn user={user} />}
      </div>
    </div>
  );
}

function useRun() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', bad: false });
  const run = async (fn, explain = authMessage) => {
    setBusy(true); setMsg({ text: '', bad: false });
    try { return await fn(); } catch (e) { const t = explain(e); if (t) setMsg({ text: t, bad: true }); return undefined; } finally { setBusy(false); }
  };
  const Msg = () => (msg.text ? <p className={`auth-msg ${msg.bad ? 'bad' : ''}`} role={msg.bad ? 'alert' : 'status'}>{msg.text}</p> : null);
  return { busy, run, setMsg, Msg };
}

function SignedOut({ onDone }) {
  const [mode, setMode] = useState('in'); // 'in' | 'new' | 'reset' | 'sent'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, run, setMsg, Msg } = useRun();
  const go = (m) => { setMode(m); setMsg({ text: '' }); };

  const submit = async (e) => {
    e.preventDefault();
    if (mode === 'in') { if ((await run(() => signInWithEmail(email, password).then(() => true))) === true) onDone(); }
    else if (mode === 'new') { const r = await run(() => createAccount(name, email, password)); if (r?.needsConfirm) go('sent'); }
    else if (await run(() => resetPassword(email).then(() => true))) setMsg({ text: `If ${email.trim()} has a Hive account, a link to reset the password is on its way.`, bad: false });
  };

  if (mode === 'sent') {
    return (
      <div className="confirm">
        <h3>Check your email</h3>
        <p>We sent a link to <b>{email.trim()}</b>. Open it on this device to confirm it’s your address, and you’ll come back here signed in.</p>
        <Msg />
        <div className="confirm-row">
          <button className="link-btn" disabled={busy} onClick={async () => { if (await run(() => resendConfirmation(email).then(() => true))) setMsg({ text: 'Sent again. Check your spam folder too.', bad: false }); }}>Send the email again</button>
          <button className="link-btn" onClick={() => go('in')}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="sheet-note">One account for Hive and every app in it. If you already have an account in one of your apps, sign in with that email and password.</p>
      {mode !== 'reset' && (
        <div className="seg" role="tablist" aria-label="Sign in or create an account">
          <button role="tab" aria-selected={mode === 'in'} onClick={() => go('in')}>Sign in</button>
          <button role="tab" aria-selected={mode === 'new'} onClick={() => go('new')}>Create account</button>
        </div>
      )}
      <form className="auth-form" onSubmit={submit}>
        {mode === 'new' && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" /></label>
        {mode !== 'reset' && (
          <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'new' ? 'new-password' : 'current-password'} /></label>
        )}
        <Msg />
        <button className="pill strong wide" type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'new' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'in' && <button type="button" className="link-btn" onClick={() => go('reset')}>Forgot your password?</button>}
        {mode === 'reset' && <button type="button" className="link-btn" onClick={() => go('in')}>Back to sign in</button>}
        {mode === 'new' && <p className="sheet-note">We’ll send a link to confirm your email.</p>}
      </form>
      {mode !== 'reset' && (
        <>
          <div className="or"><span>or</span></div>
          <button className="pill wide" disabled={busy} onClick={() => run(signInWithGoogle)}>Continue with Google</button>
        </>
      )}
    </>
  );
}

function NewPassword() {
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const { busy, run, Msg } = useRun();
  if (done) return <p className="auth-msg" role="status">Password changed. You’re signed in.</p>;
  return (
    <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => setNewPassword(password).then(() => true))) setDone(true); }}>
      <h3>Choose a new password</h3>
      <label>New password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
      <Msg />
      <button className="pill strong wide" type="submit" disabled={busy}>{busy ? 'One moment…' : 'Save password'}</button>
    </form>
  );
}

function SignedIn({ user }) {
  return (
    <>
      <div className="set-row">
        <span><b>{user.name || 'Signed in'}</b><small>{user.email}</small></span>
        <button className="pill" onClick={() => signOut()}>Sign out</button>
      </div>
      <GoogleRow />
      <Household />
    </>
  );
}

/**
 * Google Calendar & Tasks: connect in one tap (googleConnect.js). What it says
 * comes from the server, which checks with Google each time the sheet opens.
 */
function GoogleRow() {
  const [s, setS] = useState(undefined); // undefined: checking
  const [note, setNote] = useState(() => takeGoogleResult());
  const { busy, run, Msg } = useRun();
  const check = useCallback(() => { setS(undefined); googleStatus().then(setS).catch((e) => setS({ connected: false, failed: true, reason: e.message })); }, []);
  useEffect(() => {
    check();
    const on = () => { setNote(takeGoogleResult()); check(); };
    window.addEventListener(GOOGLE_CHANGED, on);
    return () => window.removeEventListener(GOOGLE_CHANGED, on);
  }, [check]);
  const problems = s?.connected ? [['Calendar', s.calendar], ['Tasks', s.tasks]].filter(([, v]) => v !== undefined && v !== true) : [];
  const line = s === undefined ? 'Checking with Google…'
    : s.connected && !problems.length ? 'Connected: your calendar and tasks are on your board and widgets.'
      : s.connected ? problems.map(([n, why]) => `Connected, but Google won’t share ${n}: ${why}`).join(' ')
        : s.failed ? `Couldn’t check: ${s.reason}` : 'On your board and widgets. Connect once; it stays connected.';
  return (
    <>
      <div className="set-row">
        <span><b>Google Calendar &amp; Tasks</b><small role="status">{line}</small></span>
        <button className="pill" disabled={busy || s === undefined} onClick={() => run(() => connectGoogle(), (e) => (e.code === 'signed_out' ? e.message : authMessage(e)))}>
          {busy ? 'Opening Google…' : s?.connected ? 'Reconnect' : 'Connect'}
        </button>
      </div>
      {note && <p className={`auth-msg ${note.ok ? '' : 'bad'}`} role={note.ok ? 'status' : 'alert'}>{note.message}</p>}
      <Msg />
    </>
  );
}

/** Start a household, see who's in it, invite someone, or join one. */
function Household() {
  const [h, setH] = useState(undefined); // undefined: loading; null: none
  const [name, setName] = useState('Our household');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState('');
  const { busy, run, Msg } = useRun();
  const load = useCallback(() => myHousehold().then(setH).catch(() => setH(null)), []);
  useEffect(() => { load(); }, [load]);

  if (h === undefined) return <p className="sheet-note">Loading your household…</p>;

  if (!h) {
    return (
      <>
        <h3 className="sheet-sub">Household</h3>
        <p className="sheet-note">The people you share Hive with: shopping, meals, chores, the farm and trips. Personal things, like your journal, stay yours.</p>
        <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => createHousehold(name), householdMessage)) load(); }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
          <button className="pill strong wide" type="submit" disabled={busy}>Start a household</button>
        </form>
        <div className="or"><span>or join one</span></div>
        <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => joinHousehold(code), householdMessage)) load(); }}>
          <label>Invite code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" required /></label>
          <button className="pill wide" type="submit" disabled={busy}>Join</button>
        </form>
        <Msg />
      </>
    );
  }

  return (
    <>
      <h3 className="sheet-sub">{h.name}</h3>
      {h.members.map((m) => (
        <div className="set-row" key={m.id}><span><b>{m.name}{m.me ? ' (you)' : ''}</b><small>{m.email}{m.role === 'owner' ? ', owner' : ''}</small></span></div>
      ))}
      {h.role === 'owner' && (
        invite ? (
          <>
            <p className="auth-msg" role="status">Household code: <b>{invite}</b>. Anyone who enters it in their Hive account (or in Let&rsquo;s Eat) joins. It doesn&rsquo;t expire; make a new one to stop this one working.</p>
            <button className="pill wide" disabled={busy} onClick={async () => { const c = await run(() => newInviteCode(h.id), householdMessage); if (c) setInvite(c); }}>Make a new code</button>
          </>
        ) : (
          <button className="pill wide" disabled={busy} onClick={async () => { const c = await run(() => inviteCode(h.id), householdMessage); if (c) setInvite(c); }}>Show household code</button>
        )
      )}
      <Msg />
    </>
  );
}
