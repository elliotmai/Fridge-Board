import { useState } from 'react';

/**
 * Shown when /api/board refuses the request: the board needs its key (or a
 * signed-in household member). Signed in, nothing is shown in place of your
 * data, so it only says why.
 */
export function LockBanner({ reason, onSave, signedIn }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const notSet = /BOARD_ACCESS_KEY/.test(reason);
  const submit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    const ok = await onSave(value.trim());
    setWrong(!ok);
    if (ok) setOpen(false);
  };
  return (
    <div className="lock">
      <div className="lock-row">
        <span>{signedIn ? <strong>{reason}.</strong> : <strong>Showing sample data.</strong>} {signedIn ? 'Or enter this board’s key.' : notSet ? 'Set BOARD_ACCESS_KEY on the Fridge Board site in Netlify to turn on your data.' : 'Enter this board’s key to show your data.'}</span>
        {!notSet && !open && <button className="lock-btn" onClick={() => setOpen(true)}>Enter key</button>}
      </div>
      {open && (
        <form className="add lock-form" onSubmit={submit}>
          <input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Board key" aria-label="Board key" autoFocus />
          <button className="lock-btn" type="submit">Unlock</button>
        </form>
      )}
      {wrong && <span className="lock-err">That key didn’t work. Check BOARD_ACCESS_KEY in Netlify.</span>}
    </div>
  );
}
