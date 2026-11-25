/*
 * KitchenHub's cooking timers, shared by the household (kitchen.timers in
 * Hive's Supabase project; KitchenHub's src/timers/timerLogic.js is the same
 * arithmetic). A timer is stored by when it ends, so every screen works out
 * what is left from its own clock and nothing has to keep counting: a reload,
 * a closed tab or another device all agree.
 *
 * Step timers are keyed 'recipe:<KitchenHub recipe id>:<step index from 0>',
 * the same on the fridge board and in KitchenHub's recipe page, so a timer
 * started on one shows against that step on the other.
 */

const MAX_SECONDS = 24 * 60 * 60;

/** A kitchen.timers row (or a KitchenHub board API timer) → { id, key, label, endsAt }. */
export function fromRow(row) {
  return {
    id: row.id,
    key: row.key ?? null,
    label: row.label,
    endsAt: typeof row.endsAt === 'number' ? row.endsAt : new Date(row.ends_at).getTime(),
  };
}

/** The row to insert for a new timer, or null for a time that cannot be one. */
export function newTimerRow({ label, minutes, key = null, now = Date.now() }) {
  const total = Math.round(Number(minutes) * 60);
  if (!Number.isFinite(total) || total < 1 || total > MAX_SECONDS) return null;
  return {
    key: key ? String(key).slice(0, 200) : null,
    label: String(label ?? '').trim().slice(0, 120) || `${Math.round(total / 60)} minute timer`,
    duration_s: total,
    ends_at: new Date(now + total * 1000).toISOString(),
  };
}

/** A recipe step's timer key; `step` counts from 0. */
export const stepKey = (recipeId, step) => `recipe:${recipeId}:${step}`;

export const isDone = (t, now) => now >= t.endsAt;

/** "4:05", "1:02:05", or "Done"; seconds round up, so 0:01 shows until it rings. */
export function timeLeft(t, now) {
  const s = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
  if (s === 0) return 'Done';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Ringing first, then the next to end. */
export const sortTimers = (timers, now) =>
  [...timers].sort((a, b) => (isDone(b, now) - isDone(a, now)) || (a.endsAt - b.endsAt) || String(a.id).localeCompare(String(b.id)));

export const ringing = (timers, now) => timers.filter((t) => isDone(t, now));

/** The board's shape: { [key]: { id, endsAt, label } } for timers started from a step. */
export const byKey = (timers) => Object.fromEntries(timers.filter((t) => t.key).map((t) => [t.key, t]));
