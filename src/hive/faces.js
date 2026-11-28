/*
 * The household screen's camera and face model (rules in src/lib/faceSwitch.js).
 *
 * Everything here runs in the tablet's browser. The model (face-api, MIT) and
 * its weights are served from Hive itself (/face-models, copied at build by
 * scripts/face-models.mjs), so nothing is fetched from anyone else. Frames
 * from the camera are looked at and dropped: none is drawn, kept or sent.
 * What's kept is each taught person's face signatures, in this tablet's
 * IndexedDB, and only until they're forgotten.
 */
import { plain } from '@/lib/faceSwitch';

const MODELS = '/face-models';
const DB = 'hive-faces', STORE = 'people';

/* ------------------------------------------------------------ storage --- */
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { d.close(); resolve(out?.result); };
    t.onerror = () => { d.close(); reject(t.error); };
  });
}

/** Taught faces on this tablet: [{ id, name, descriptors, at }]. */
export const knownFaces = () => tx('readonly', (s) => s.getAll()).then((x) => x || []).catch(() => []);
export const saveFace = (id, name, descriptors) => tx('readwrite', (s) => s.put({ id, name, descriptors: descriptors.map(plain), at: Date.now() }));
export const forgetFace = (id) => tx('readwrite', (s) => s.delete(id));
/** Forget every face on this tablet (turning face switching off). */
export const forgetAllFaces = () => tx('readwrite', (s) => s.clear());

/* -------------------------------------------------------------- model --- */
let loading = null;
/** face-api, loaded only on a screen that uses it (about 1.3 MB plus 6.7 MB of weights). */
export function loadModel() {
  loading ||= (async () => {
    const faceapi = await import('@vladmandic/face-api/dist/face-api.esm.js');
    try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
    await faceapi.tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODELS),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS),
    ]);
    return faceapi;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

/** The faces in this frame: [{ descriptor: Float32Array, box }]. The frame itself isn't kept. */
export async function facesIn(video) {
  const faceapi = await loadModel();
  const found = await faceapi
    .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  return found.map((f) => ({ descriptor: f.descriptor, box: f.detection.box }));
}

/* ------------------------------------------------------------- camera --- */
export const hasCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * The front camera, small: { video, stop }. `video` can be shown (teaching,
 * so you can see you're in frame) or not (switching).
 */
export async function openCamera(video = document.createElement('video')) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } } });
  Object.assign(video, { muted: true, playsInline: true, srcObject: stream });
  video.setAttribute('playsinline', '');
  await video.play();
  return { video, stop: () => { stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; } };
}

/**
 * What stopped the camera, in words, with the browser's own reason so it can
 * be looked up. In Fully Kiosk, NotAllowed usually means Web Content
 * Settings, Enable Webcam Access is off; NotReadable that something else
 * (Fully's motion detection) has the camera.
 */
export function cameraTrouble(e) {
  const why = e?.name ? ` (${e.name})` : '';
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return `The browser won’t let Hive use the camera${why}. In Fully Kiosk: Web Content Settings, Enable Webcam Access, then reload.`;
  if (e?.name === 'NotReadableError' || e?.name === 'AbortError') return `Something else is using the camera${why}, like Fully’s motion detection. Turn that off, then try again.`;
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return `No front camera found${why}.`;
  return `Couldn’t start the camera or the face model${why}.`;
}
