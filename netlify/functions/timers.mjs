/*
 * KitchenHub's cooking timers for a board that isn't signed in to Hive (a
 * signed-in screen reads kitchen.timers directly, src/context/KitchenTimers.jsx):
 *
 *   GET  /api/timers        → KitchenHub GET  /api/board/timers
 *   POST /api/timers        { label, minutes, key? } → KitchenHub POST /api/board/timers
 *   POST /api/timers/:id    { stop: true }           → KitchenHub POST /api/board/timers/:id
 *
 * Same access as /api/board (the board key, or a signed-in household member); as the signed-in Hive user when there is one,
 * KITCHENHUB_TOKEN otherwise. The token never leaves this function.
 */
import { json, urls } from '../lib/shared.mjs';
import { asUser } from '../lib/hiveUser.mjs';
import { boardGate } from '../lib/household.mjs';

async function forward(url, { method, headers, body }) {
  const res = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  return new Response(text || '{}', { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default async (req, context) => {
  const gate = await boardGate(req);
  if (!gate.ok) return gate.response;
  const { user } = gate;
  const id = context.params?.id;
  let body;
  if (req.method === 'POST') {
    body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json(400, { error: 'Body must be a JSON object' });
  } else if (req.method !== 'GET' || id) {
    return json(405, { error: 'method_not_allowed' });
  }
  const url = `${urls.kitchenhub()}/timers${id ? `/${encodeURIComponent(id)}` : ''}`;
  const send = id
    ? { stop: body?.stop === true }
    : body && { label: typeof body.label === 'string' ? body.label.slice(0, 120) : '', minutes: Number(body.minutes), ...(typeof body.key === 'string' ? { key: body.key.slice(0, 200) } : {}) };
  try {
    return await asUser(user, 'kitchenhub', 'KITCHENHUB_TOKEN', (headers) => forward(url, { method: req.method, headers, body: send }));
  } catch (e) {
    if (e.unconfigured) return json(401, { error: e.message });
    console.error('timers failed:', e);
    return json(502, { error: 'KitchenHub could not be reached' });
  }
};

export const config = { path: ['/api/timers', '/api/timers/:id'] };
