/*
 * Changes made on the board, passed through to the app that owns them:
 *
 *   POST /api/chores/:id     { done }     → GalaxyFarm POST /api/board/v1/chores/:id
 *   POST /api/shopping       { name, section? } → KitchenHub POST /shopping
 *   POST /api/shopping/:id   { bought }   → KitchenHub POST /shopping/:id
 *   POST /api/todos/learnleaf/:id     { done } → LearnLeaf PATCH /api/tasks/:id
 *   POST /api/todos/google/:list/:id  { done } → Our Den POST /api/board/google/tasks/:list/:id
 *                                    (as the signed-in Hive user, with a pass)
 *
 * Same access as /api/board (the board key, or a signed-in household member); the app tokens never leave this function.
 */
import { bearer, json, urls } from '../lib/shared.mjs';
import { asUser, passHeader } from '../lib/hiveUser.mjs';
import { boardGate } from '../lib/household.mjs';

async function forward(url, token, body, { method = 'POST', headers } = {}) {
  const res = await fetch(url, {
    method,
    ...(headers ? { headers: { ...headers, 'content-type': 'application/json' } } : bearer(token, { 'content-type': 'application/json' })),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  return new Response(text || '{}', { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default async (req, context) => {
  const gate = await boardGate(req);
  if (!gate.ok) return gate.response;
  const { user } = gate;
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json(400, { error: 'Body must be a JSON object' });

  const path = new URL(req.url).pathname;
  const id = context.params?.id;
  try {
    if (path.startsWith('/api/todos/')) {
      if (typeof body.done !== 'boolean') return json(400, { error: 'done must be true or false' });
      if (path.startsWith('/api/todos/learnleaf/')) {
        return await asUser(user, 'learnleaf', 'LEARNLEAF_TOKEN', (headers) => forward(`${urls.learnleaf()}/api/tasks/${encodeURIComponent(id)}`, null, { taskStatus: body.done ? 'Completed' : 'Not Started' }, { method: 'PATCH', headers }));
      }
      let headers;
      try { headers = passHeader(user, 'ourden'); } catch (e) { return json(401, { error: e.message }); }
      const list = context.params?.list;
      return await forward(`${urls.ourden()}/api/board/google/tasks/${encodeURIComponent(list)}/${encodeURIComponent(id)}`, null, { done: body.done }, { headers });
    }
    if (path.startsWith('/api/chores/')) {
      if (typeof body.done !== 'boolean') return json(400, { error: 'done must be true or false' });
      return await asUser(user, 'galaxyfarm', 'GALAXYFARM_TOKEN', (headers) => forward(`${urls.galaxyfarm()}/api/board/v1/chores/${encodeURIComponent(id)}`, null, { done: body.done }, { headers }));
    }
    if (!id) {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
      if (!name) return json(400, { error: 'name is required' });
      return await asUser(user, 'kitchenhub', 'KITCHENHUB_TOKEN', (headers) => forward(`${urls.kitchenhub()}/shopping`, null, { name, ...(typeof body.section === 'string' ? { section: body.section } : {}) }, { headers }));
    }
    if (typeof body.bought !== 'boolean') return json(400, { error: 'bought must be true or false' });
    return await asUser(user, 'kitchenhub', 'KITCHENHUB_TOKEN', (headers) => forward(`${urls.kitchenhub()}/shopping/${encodeURIComponent(id)}`, null, { bought: body.bought }, { headers }));
  } catch (e) {
    if (e.unconfigured) return json(401, { error: e.message });
    console.error('act failed:', e);
    return json(502, { error: 'The app could not be reached' });
  }
};

export const config = { path: ['/api/chores/:id', '/api/shopping', '/api/shopping/:id', '/api/todos/learnleaf/:id', '/api/todos/google/:list/:id'] };
