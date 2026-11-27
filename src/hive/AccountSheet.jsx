import { useCallback, useEffect, useRef, useState } from 'react';
import { forgetJoinCode, joinLink, pendingJoinCode } from './joinCode';
import { connectGoogle, GOOGLE_CHANGED, googleStatus, takeGoogleResult } from './googleConnect';
import {
  authMessage, createAccount, createHousehold, eventPartners, householdMessage, makeEventPartner, removeEventPartner, removeMember, inviteCode, newInviteCode, joinHousehold, myHousehold,
  pairAsScreen, removeScreen, screenCode, showCode, resendConfirmation, resetPassword, setMyName, setNewPassword, signInWithEmail, signInWithGoogle, signOut,
} from './account';

/**
 * The Hive account sheet: sign in, create an account (confirmed by email),
 * set a new password from a reset link, sign out, and the household: start
 * one, invite someone with a code, or join with theirs. And household
 * screens: an owner adds one with a code, and the device (the fridge tablet)
 * enters it to be signed in as the household instead of as a person.
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
        {!user && pendingJoinCode() && <p className="auth-msg" role="status">You&rsquo;ve been invited to a household. Sign in or create an account, then join it here.</p>}
        {recovering && user ? <NewPassword /> : !user ? <><SignedOut onDone={pendingJoinCode() ? () => {} : onClose} /><BecomeScreen /></>
          : user.screen ? <ScreenSignedIn user={user} /> : <><SignedIn user={user} /><BecomeScreen signedIn /></>}
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
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name || '');
  const [shown, setShown] = useState(user.name || '');
  const [round, setRound] = useState(0); // reloads the household list after a rename
  const { busy, run, Msg } = useRun();
  const save = async (e) => {
    e.preventDefault();
    const saved = await run(() => setMyName(name));
    if (saved) { setShown(saved); setName(saved); setEditing(false); setRound((n) => n + 1); }
  };
  return (
    <>
      {editing ? (
        <form className="auth-form" onSubmit={save}>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" autoFocus required /></label>
          <div className="row-actions">
            <button className="pill strong" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="pill" type="button" disabled={busy} onClick={() => { setName(shown); setEditing(false); }}>Cancel</button>
          </div>
          <small className="sheet-note">What your household sees in Hive, the fridge board and the apps.</small>
        </form>
      ) : (
        <div className="set-row">
          <span><b>{shown || 'Add your name'}</b><small>{user.email}</small></span>
          <span className="row-actions">
            <button className="pill" onClick={() => setEditing(true)}>{shown ? 'Edit name' : 'Add name'}</button>
            <button className="pill" onClick={() => signOut()}>Sign out</button>
          </span>
        </div>
      )}
      <Msg />
      <GoogleRow />
      <Household key={round} />
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
  const [code, setCode] = useState(pendingJoinCode);
  const [invite, setInvite] = useState('');
  const [joining, setJoining] = useState(() => Boolean(pendingJoinCode()));
  const [copied, setCopied] = useState(false);
  const { busy, run, Msg } = useRun();
  const [partners, setPartners] = useState([]);
  const [confirm, setConfirm] = useState(null); // { id, kind: 'remove' | 'partner', name }
  const load = useCallback(() => myHousehold().then((x) => {
    setH(x);
    if (x) eventPartners(x.id).then(setPartners).catch(() => setPartners([]));
  }).catch(() => setH(null)), []);
  const doConfirm = async () => {
    const c = confirm;
    await run(() => (c.kind === 'remove' ? removeMember(h.id, c.id) : makeEventPartner(h.id, c.id, true)), householdMessage);
    setConfirm(null);
    load();
  };
  useEffect(() => { load(); }, [load]);

  const join = async (e) => {
    e.preventDefault();
    const ok = await run(() => joinHousehold(code), householdMessage);
    if (ok) { forgetJoinCode(); setCode(''); setJoining(false); load(); }
  };
  const share = async () => {
    const link = joinLink(invite);
    const text = `Join our household in Hive: ${link} (or enter the code ${invite} in Hive, Account).`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Join our household in Hive', text, url: link }); return; }
      await navigator.clipboard.writeText(link);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { /* cancelled */ }
  };
  const me = h?.members?.find((m) => m.me);
  const JoinForm = ({ cta }) => (
    <form className="auth-form" onSubmit={join}>
      <label>Household code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="e.g. 7F3K9Q2B" required /></label>
      <button className="pill strong wide" type="submit" disabled={busy}>{cta}</button>
    </form>
  );

  if (h === undefined) return <p className="sheet-note">Loading your household…</p>;

  if (!h) {
    return (
      <>
        <h3 className="sheet-sub">Household</h3>
        <p className="sheet-note">The people you share Hive with: shopping, meals, chores, the farm and trips. Personal things, like your journal, stay yours.</p>
        {code && <><JoinForm cta="Join this household" /><div className="or"><span>or start your own</span></div></>}
        <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); if (await run(() => createHousehold(name), householdMessage)) load(); }}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
          <button className="pill strong wide" type="submit" disabled={busy}>Start a household</button>
        </form>
        {!code && <><div className="or"><span>or join one with its code</span></div><JoinForm cta="Join" /></>}
        <Msg />
      </>
    );
  }

  return (
    <>
      <h3 className="sheet-sub">{h.name}</h3>
      {h.members.map((m) => (
        <div className="set-row" key={m.id}>
          <span><b>{m.name}{m.me ? ' (you)' : ''}</b><small>{m.email}{m.role === 'owner' ? ', owner' : ''}</small></span>
          {h.role === 'owner' && !m.me && (
            confirm?.id === m.id ? (
              <span className="row-actions">
                <button className="pill strong" disabled={busy} onClick={doConfirm}>{confirm.kind === 'remove' ? `Remove ${m.name}` : 'Make partner'}</button>
                <button className="pill" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
              </span>
            ) : (
              <span className="row-actions">
                <button className="pill" disabled={busy} onClick={() => setConfirm({ id: m.id, kind: 'partner', name: m.name })}>Event partner</button>
                <button className="pill" disabled={busy} onClick={() => setConfirm({ id: m.id, kind: 'remove', name: m.name })}>Remove</button>
              </span>
            )
          )}
        </div>
      ))}
      {confirm && (
        <p className="sheet-note" role="status">
          {confirm.kind === 'remove'
            ? `${confirm.name} leaves the household: shopping, meals, chores, the farm and trips. Their own things stay theirs.`
            : `${confirm.name} leaves the household but keeps planning every KitchenHub event with you, and nothing else.`}
        </p>
      )}
      <Screens h={h} onChange={load} />
      {partners.length > 0 && (
        <>
          <h3 className="sheet-sub">Event partners</h3>
          <p className="sheet-note">They plan every KitchenHub event with your household, and see nothing else.</p>
          {partners.map((p) => (
            <div className="set-row" key={p.user_id}>
              <span><b>{p.name}</b><small>{p.email}{p.can_edit ? '' : ', view only'}</small></span>
              {h.role === 'owner' && (
                <button className="pill" disabled={busy} onClick={async () => { await run(() => removeEventPartner(h.id, p.user_id), householdMessage); load(); }}>Remove</button>
              )}
            </div>
          ))}
        </>
      )}
      {h.role === 'owner' && (
        invite ? (
          <>
            <p className="auth-msg" role="status">Household code: <b>{invite}</b>. They can open the link, or enter the code in Hive under Account. It doesn&rsquo;t expire; make a new one to stop this one working.</p>
            <button className="pill strong wide" onClick={share}>{copied ? 'Link copied' : 'Share invite link'}</button>
            <button className="pill wide" disabled={busy} onClick={async () => { const c = await run(() => newInviteCode(h.id), householdMessage); if (c) setInvite(c); }}>Make a new code</button>
          </>
        ) : (
          <button className="pill wide" disabled={busy} onClick={async () => { const c = await run(() => inviteCode(h.id), householdMessage); if (c) setInvite(c); }}>Show household code</button>
        )
      )}
      {joining ? (
        <>
          <h3 className="sheet-sub">Join another household</h3>
          <p className="sheet-note">You&rsquo;ll move from {h.name} to the household whose code this is. Your own things, like your journal, come with you.</p>
          <JoinForm cta="Join with this code" />
          <button className="pill wide" disabled={busy} onClick={() => { forgetJoinCode(); setCode(''); setJoining(false); }}>Cancel</button>
        </>
      ) : (
        <span className="row-actions">
          <button className="pill" onClick={() => setJoining(true)}>Have a household code?</button>
          {h.role !== 'owner' && me && (
            <button className="pill" disabled={busy} onClick={async () => { await run(() => removeMember(h.id, me.id), householdMessage); load(); }}>Leave household</button>
          )}
        </span>
      )}
      <Msg />
    </>
  );
}

/**
 * This device is a household screen: signed in as the household, so it shows
 * the household's things (KitchenHub, GalaxyFarm, chores) and nobody's own.
 */
function ScreenSignedIn({ user }) {
  const [h, setH] = useState(undefined);
  useEffect(() => { myHousehold().then(setH).catch(() => setH(null)); }, []);
  return (
    <>
      <div className="set-row">
        <span><b>{user.name || 'Household screen'}</b><small>{h?.name ? `The ${h.name} household screen` : 'A household screen'}</small></span>
        <button className="pill" onClick={() => signOut()}>Stop</button>
      </div>
      <p className="sheet-note">This device is signed in as the household, not as a person: the kitchen, the farm and chores are the household&rsquo;s, and nobody&rsquo;s calendar, tasks, trips or drinks show here. To use it as yourself, tap Stop and sign in. An owner can remove it from their own Account.</p>
    </>
  );
}

/** On the device that should be the screen: enter the code an owner made. */
function BecomeScreen({ signedIn = false }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [done, setDone] = useState('');
  const { busy, run, Msg } = useRun();
  if (done) return <p className="auth-msg" role="status">This device is now {done}, signed in as the household.</p>;
  if (!open) return <button className="link-btn" onClick={() => setOpen(true)}>Set up this device as a household screen</button>;
  return (
    <>
      <h3 className="sheet-sub">Household screen</h3>
      <p className="sheet-note">For a device the household shares, like the fridge tablet. An owner makes a code in their own Hive, under Account, Household screens.{signedIn ? ' You’ll be signed out here (only here).' : ''}</p>
      <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); const n = await run(() => pairAsScreen(code), householdMessage); if (n) setDone(n); }}>
        <label>Screen code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="e.g. ABCD-EF23" required /></label>
        <Msg />
        <button className="pill strong wide" type="submit" disabled={busy}>{busy ? 'Setting up…' : 'Make this the household screen'}</button>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
      </form>
    </>
  );
}

/** Owner: the household's screens, and a code to add one. */
function Screens({ h, onChange }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('Kitchen screen');
  const [made, setMade] = useState(null); // { code, expiresAt }
  const [confirm, setConfirm] = useState(null);
  const { busy, run, Msg } = useRun();
  if (h.role !== 'owner' && !h.screens.length) return null;
  const left = made ? Math.max(0, Math.round((made.expiresAt - Date.now()) / 60000)) : 0;
  return (
    <>
      <h3 className="sheet-sub">Household screens</h3>
      <p className="sheet-note">A shared device, like the fridge tablet, signed in as the household: the kitchen, the farm and chores, and nobody&rsquo;s own calendar, tasks, trips or drinks.</p>
      {h.screens.map((s) => (
        <div className="set-row" key={s.id}>
          <span><b>{s.name}</b><small>Signed in as {h.name}</small></span>
          {h.role === 'owner' && (confirm === s.id ? (
            <span className="row-actions">
              <button className="pill strong" disabled={busy} onClick={async () => { await run(() => removeScreen(s.id), householdMessage); setConfirm(null); onChange(); }}>Remove {s.name}</button>
              <button className="pill" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
            </span>
          ) : <button className="pill" disabled={busy} onClick={() => setConfirm(s.id)}>Remove</button>)}
        </div>
      ))}
      {confirm && <p className="sheet-note" role="status">It&rsquo;s signed out straight away and shows nothing until it&rsquo;s set up again with a new code.</p>}
      {h.role === 'owner' && (made ? (
        <>
          <p className="auth-msg" role="status">On the screen, open Hive, Settings, Account, then <b>Set up this device as a household screen</b>, and enter <b className="code-big">{showCode(made.code)}</b>. It works once, for {left || 'less than a'} minute{left === 1 ? '' : 's'}.</p>
          <button className="pill wide" onClick={() => { setMade(null); setAdding(false); onChange(); }}>Done</button>
        </>
      ) : adding ? (
        <form className="auth-form" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => screenCode(h.id, name), householdMessage); if (r) setMade(r); }}>
          <label>Name it<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></label>
          <button className="pill strong wide" type="submit" disabled={busy}>Make a code</button>
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>Cancel</button>
        </form>
      ) : (
        <button className="pill wide" onClick={() => setAdding(true)}>Add a household screen</button>
      ))}
      <Msg />
    </>
  );
}
