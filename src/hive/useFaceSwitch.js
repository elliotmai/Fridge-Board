import { useCallback, useEffect, useRef, useState } from 'react';
import { bestMatch, createSwitcher } from '@/lib/faceSwitch';
import { facesIn, hasCamera, knownFaces, openCamera } from './faces';

/** One look every this often while the camera is on. */
const LOOK_MS = 900;
const ON = 'hive-faces-on', PAUSED = 'hive-faces-paused-until';
export const FACES_CHANGED = 'hive:faces-changed';

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
export const facesOn = () => read(ON) === '1';
export const setFacesOn = (on) => { write(ON, on ? '1' : null); window.dispatchEvent(new Event(FACES_CHANGED)); };
export const pausedUntil = () => Number(read(PAUSED)) || 0;

/**
 * Face switching on a household screen. `people` is the board's
 * viewer.screen.people; null anywhere else, where it never starts.
 * Returns { person, camera, paused, pause(ms), resume, error }:
 *   person  who is looking (from `people`), or null for Both
 *   camera  true while the camera is on (the board shows a light)
 * `hold` (teaching a face) stops it, so the camera is used once at a time.
 */
export function useFaceSwitch(people, { hold = false } = {}) {
  const [on, setOn] = useState(facesOn);
  const [until, setUntil] = useState(pausedUntil);
  const [known, setKnown] = useState([]);
  const [viewId, setViewId] = useState(null);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(() => !document.hidden);
  const [, setNow] = useState(0);

  useEffect(() => {
    const changed = () => { setOn(facesOn()); setUntil(pausedUntil()); knownFaces().then(setKnown); };
    const vis = () => setVisible(!document.hidden);
    changed();
    window.addEventListener(FACES_CHANGED, changed);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener(FACES_CHANGED, changed); document.removeEventListener('visibilitychange', vis); };
  }, []);

  // A pause ends by itself.
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    const id = setTimeout(() => { write(PAUSED, null); setUntil(0); }, until - Date.now() + 50);
    return () => clearTimeout(id);
  }, [until]);

  const paused = until > Date.now();
  // Only people still in the household, taught on this tablet.
  const taught = (people || []).map((p) => ({ ...p, descriptors: known.find((k) => k.id === p.id)?.descriptors })).filter((p) => p.descriptors?.length);
  const run = Boolean(people && on && !paused && !hold && visible && taught.length && hasCamera());
  const taughtRef = useRef(taught);
  taughtRef.current = taught;

  useEffect(() => {
    if (!run) { setViewId(null); return undefined; }
    let live = true, cam = null, timer = null;
    const switcher = createSwitcher();
    (async () => {
      try {
        cam = await openCamera();
        if (!live) { cam.stop(); return; }
        setCamera(true); setError('');
        const look = async () => {
          if (!live) return;
          try {
            const faces = await facesIn(cam.video);
            const id = faces.length === 1 ? bestMatch(faces[0].descriptor, taughtRef.current) : null;
            if (live) setViewId(switcher.step({ faces: faces.length, id }, Date.now()));
          } catch (e) { console.warn('[faces] a look failed:', e.message); }
          if (live) timer = setTimeout(look, LOOK_MS);
        };
        look();
      } catch (e) {
        if (live) setError(e.name === 'NotAllowedError' ? 'The camera isn’t allowed for Hive on this tablet' : 'Couldn’t start the camera');
      }
    })();
    return () => { live = false; clearTimeout(timer); cam?.stop(); setCamera(false); setViewId(null); };
  }, [run]);

  const pause = useCallback((ms) => { const t = Date.now() + ms; write(PAUSED, String(t)); setUntil(t); setNow(t); }, []);
  const resume = useCallback(() => { write(PAUSED, null); setUntil(0); }, []);
  const person = (people || []).find((p) => p.id === viewId) || null;
  return { person, camera, paused, until, pause, resume, error, on, taught: taught.length };
}
