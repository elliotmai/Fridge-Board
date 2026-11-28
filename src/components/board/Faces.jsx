import { useEffect, useRef, useState } from 'react';
import { TEACH_LOOKS } from '@/lib/faceSwitch';
import { facesIn, forgetAllFaces, forgetFace, hasCamera, knownFaces, loadModel, openCamera, saveFace } from '@/hive/faces';
import { FACES_CHANGED, setFacesOn } from '@/hive/useFaceSwitch';

const HOUR = 60 * 60 * 1000;
const clock = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/**
 * The household screen's camera light and who it's showing. Always on screen
 * while face switching is on, so nobody is looked at without knowing.
 */
export function FacePill({ faces }) {
  if (!faces.on) return null;
  if (faces.paused) {
    return (
      <div className="face-pill fb-layer" role="status">
        <span className="cam-dot off" aria-hidden="true" />Camera off until {clock(faces.until)}
        <button className="pill" onClick={faces.resume}>Turn back on</button>
      </div>
    );
  }
  if (faces.error) return <div className="face-pill fb-layer" role="status"><span className="cam-dot off" aria-hidden="true" />{faces.error}</div>;
  if (!faces.camera) return null;
  return (
    <div className="face-pill fb-layer" role="status" aria-live="polite">
      <span className="cam-dot" aria-hidden="true" />Camera on
      <b>{faces.person ? `Showing ${faces.person.name}` : 'Showing Both'}</b>
      <button className="pill" onClick={() => faces.pause(HOUR)}>Off for an hour</button>
    </div>
  );
}

/** Settings on a household screen: turn face switching on, and teach or forget each person's face. */
export function FaceSettings({ people, on, onTeaching }) {
  const [known, setKnown] = useState([]);
  const [teaching, setTeaching] = useState(null);
  const refresh = () => knownFaces().then(setKnown);
  useEffect(() => { refresh(); }, []);
  useEffect(() => { onTeaching?.(!!teaching); }, [teaching, onTeaching]);
  useEffect(() => () => onTeaching?.(false), [onTeaching]); // closed mid-teach
  if (!people?.length) {
    return (
      <p className="field">Face switching
        <small>On the fridge tablet: pair it as the household screen first (Hive settings, Hive account, Set up this device as a household screen). Then Face switching shows here.</small>
      </p>
    );
  }
  if (!hasCamera()) return <p className="field">Face switching needs a camera this browser can use.</p>;
  const changed = () => { refresh(); window.dispatchEvent(new Event(FACES_CHANGED)); };
  const turnOff = async () => { await forgetAllFaces(); setFacesOn(false); changed(); };

  return (
    <div className="field faces">
      Face switching
      <small>
        When one of you is looking at the fridge, it shows just your calendar, tasks and trips, and Drinks starts on you. With nobody there, or two of you, or when it isn’t sure, it shows Both.
        It all happens on this tablet: no picture is saved or sent anywhere. What it keeps is a face signature (numbers, not a picture) for each person who teaches it, here only, until you forget it.
      </small>
      {teaching ? (
        <Teach person={teaching} onDone={() => { setTeaching(null); changed(); }} />
      ) : (
        <>
          {people.map((p) => {
            const has = known.some((k) => k.id === p.id);
            return (
              <div className="set-row" key={p.id}>
                <span><b>{p.name}</b><small>{has ? 'Knows your face' : 'Not taught'}</small></span>
                <span className="row-actions">
                  <button className="pill" onClick={() => setTeaching(p)}>{has ? 'Teach again' : 'Teach my face'}</button>
                  {has && <button className="pill" onClick={async () => { await forgetFace(p.id); changed(); }}>Forget</button>}
                </span>
              </div>
            );
          })}
          <label className="toggle-row">Switch to whoever is looking
            <input type="checkbox" checked={on} disabled={!known.length && !on} onChange={(e) => (e.target.checked ? setFacesOn(true) : turnOff())} />
          </label>
          {on && <small>Turning this off forgets every face on this tablet.</small>}
        </>
      )}
    </div>
  );
}

/**
 * Teach one person's face: they look at the camera (shown, so they can see
 * they're in frame) and a few good looks become their signature.
 */
function Teach({ person, onDone }) {
  const ref = useRef(null);
  const [got, setGot] = useState(0);
  const [msg, setMsg] = useState('Starting the camera…');
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let live = true, cam = null;
    const looks = [];
    (async () => {
      try {
        await loadModel();
        cam = await openCamera(ref.current);
        setMsg(`${person.name}: look at the screen`);
        while (live && looks.length < TEACH_LOOKS) {
          const faces = await facesIn(cam.video);
          if (faces.length === 1 && faces[0].box.width > 70) { looks.push(faces[0].descriptor); setGot(looks.length); setMsg(`${person.name}: keep looking, turn your head a little`); }
          else setMsg(faces.length > 1 ? 'Just one person in view, please' : 'Come a little closer, facing the screen');
          await new Promise((r) => setTimeout(r, 400));
        }
        if (!live) return;
        await saveFace(person.id, person.name, looks);
        setMsg('Done');
        cam.stop(); cam = null;
        done.current();
      } catch (e) {
        if (live) setMsg(e.name === 'NotAllowedError' ? 'Allow the camera for Hive on this tablet, then try again' : 'Couldn’t start the camera or the face model');
      }
    })();
    return () => { live = false; cam?.stop(); };
  }, [person]);
  return (
    <div className="face-teach">
      <video ref={ref} muted playsInline aria-label="Camera preview, not recorded" />
      <p role="status">{msg}</p>
      <progress max={TEACH_LOOKS} value={got} />
      <button className="pill" onClick={onDone}>Cancel</button>
    </div>
  );
}
