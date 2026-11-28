/*
 * Face switching on the household screen: the rules, with no camera in them
 * (src/hive/faces.js has the camera and the model; this file decides).
 *
 * A face signature is 128 numbers the model gives for a face. It can't be
 * turned back into a picture. Signatures stay on the tablet (IndexedDB), and
 * no frame is ever kept or sent anywhere.
 *
 * The view starts as Both (null). It switches to one person only when they're
 * the one face in front of the screen and recognised in 3 of the last 4 looks,
 * and goes back to Both the moment two people are there, or 20 seconds after
 * that person was last recognised. Unsure always means Both.
 */

/** Euclidean distance between two face signatures (the model's own measure). */
export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

/** Below this, two signatures are the same person (face-api's usual 0.6, tightened). */
export const MATCH_UNDER = 0.5;
/** And the next-closest person must be at least this much further away. */
export const MARGIN = 0.06;

/**
 * Who this face is, from `known` ([{ id, descriptors: number[][] }]), or null
 * when nobody is close enough or two people are nearly as close.
 */
export function bestMatch(descriptor, known, { under = MATCH_UNDER, margin = MARGIN } = {}) {
  const scored = known
    .filter((p) => p.descriptors?.length)
    .map((p) => ({ id: p.id, d: Math.min(...p.descriptors.map((x) => distance(descriptor, x))) }))
    .sort((a, b) => a.d - b.d);
  const [first, second] = scored;
  if (!first || first.d >= under) return null;
  if (second && second.d - first.d < margin) return null;
  return first.id;
}

/**
 * The view over time. `step({ faces, id }, now)`, one per look: `faces` is how
 * many faces the camera sees, `id` who the one face is (or null). Returns the
 * person's id to show, or null for Both.
 */
export function createSwitcher({ need = 3, of = 4, holdMs = 20000 } = {}) {
  let history = [];
  let view = null;
  let lastSeen = 0;
  const count = (id) => history.filter((x) => x === id).length;
  return {
    step({ faces, id }, now) {
      if (faces >= 2) { history = []; view = null; return view; }
      history = [...history, faces === 1 ? id ?? null : null].slice(-of);
      const sure = id && faces === 1 && count(id) >= need;
      if (sure) { view = id; lastSeen = now; return view; }
      if (view && id === view && faces === 1) lastSeen = now;
      if (view && now - lastSeen > holdMs) view = null;
      return view;
    },
    reset() { history = []; view = null; lastSeen = 0; },
    get view() { return view; },
  };
}

/** Is this row (with `who`, e.g. "E" or "E+K") this person's? Rows without one are everyone's. */
export const isTheirs = (row, initial) => !row?.who || String(row.who).split('+').includes(initial);

/**
 * The board's data as one person sees it on the household screen: their
 * calendar, tasks and trips (and trips' travel), and everything shared.
 */
export function viewFor(data, person) {
  if (!person) return data;
  const mine = (rows) => (rows || []).filter((r) => isTheirs(r, person.initial));
  return {
    ...data,
    tasks: mine(data.tasks),
    gtasks: mine(data.gtasks),
    events: mine(data.events),
    trips: mine(data.trips).map((t) => ({ ...t, items: mine(t.items) })),
  };
}

/** A face signature as stored: plain numbers (IndexedDB can't hold Float32Array everywhere). */
export const plain = (d) => Array.from(d, (x) => Math.round(x * 1e6) / 1e6);

/** How many good looks to keep when someone teaches the screen their face. */
export const TEACH_LOOKS = 6;
