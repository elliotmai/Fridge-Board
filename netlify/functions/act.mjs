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
 * Same board key as /api/board; the app tokens never leave this function.
 */
import { bearer, env, json, requireKey, urls } from '../lib/shared.mjs';
import { appAuth, hiveUser, passHeader } from '../lib/hiveUser.mjs';

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
  const locked = requireKey(req);
  if (locked) return locked;
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return json(400, { error: 'Body must be a JSON object' });

  const path = new URL(req.url).pathname;
  const id = context.params?.id;
  try {
    if (path.startsWith('/api/todos/')) {
      if (typeof body.done !== 'boolean') return json(400, { error: 'done must be true or false' });
      if (path.startsWith('/api/todos/learnleaf/')) {
        let headers;
        try { headers = appAuth(await hiveUser(req), 'learnleaf', 'LEARNLEAF_TOKEN'); } catch (e) { return json(401, { error: e.message }); }
        return await forward(`${urls.learnleaf()}/api/tasks/${encodeURIComponent(id)}`, null, { taskStatus: body.done ? 'Completed' : 'Not Started' }, { method: 'PATCH', headers });
      }
      let headers;
      try { headers = passHeader(await hiveUser(req), 'ourden'); } catch (e) { return json(401, { error: e.message }); }
      const list = context.params?.list;
      return await forward(`${urls.ourden()}/api/board/google/tasks/${encodeURIComponent(list)}/${encodeURIComponent(id)}`, null, { done: body.done }, { headers });
    }
    if (path.startsWith('/api/chores/')) {
      if (typeof body.done !== 'boolean') return json(400, { error: 'done must be true or false' });
      let headers;
      try { headers = appAuth(await hiveUser(req), 'galaxyfarm', 'GALAXYFARM_TOKEN'); } catch (e) { return json(401, { error: e.message }); }
      return await forward(`${urls.galaxyfarm()}/api/board/v1/chores/${encodeURIComponent(id)}`, null, { done: body.done }, { headers });
    }
    const token = env('KITCHENHUB_TOKEN');
    if (!token) return json(503, { error: 'KitchenHub is not connected' });
    if (!id) {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
      if (!name) return json(400, { error: 'name is required' });
      return await forward(`${urls.kitchenhub()}/shopping`, token, { name, ...(typeof body.section === 'string' ? { section: body.section } : {}) });
    }
    if (typeof body.bought !== 'boolean') return json(400, { error: 'bought must be true or false' });
    return await forward(`${urls.kitchenhub()}/shopping/${encodeURIComponent(id)}`, token, { bought: body.bought });
  } catch (e) {
    console.error('act failed:', e);
    return json(502, { error: 'The app could not be reached' });
  }
};

export const config = { path: ['/api/chores/:id', '/api/shopping', '/api/shopping/:id', '/api/todos/learnleaf/:id', '/api/todos/google/:list/:id'] };
