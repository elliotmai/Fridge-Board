-- Hive Brain: what every session, agent and app is doing, and what they know.
--
-- Reporters (Claude Code hooks, Muster, app triggers, chats through the brain
-- connector) push short events here with their own key, made by the person in
-- Hive and stored hashed in core.api_tokens (app 'brain'). A key can only add
-- events as its person; it can't read anything. Nothing depends on the Claude
-- login token Muster used to poll with.
--
-- Shape: a graph in four tables.
--   nodes      one thing (household, app, repo, project, session, subagent, ...)
--   edges      a link between two things; each firing makes it brighter
--   events     something that happened, append-only
--   knowledge  something known; corrected by superseding, never overwritten
--
-- Sharing: a row is 'private' (its owner only) or 'household' (anyone in its
-- household, core.is_member, which includes the household's screens). A node
-- made private hides everything under it too. Prompts are always private.
-- Personal apps (journal, drinks, stimul) never report here.
--
-- Plan: the "Hive Brain: plan" doc in the All Apps project.

create schema if not exists brain;
grant usage on schema brain to authenticated, service_role;

-- ------------------------------------------------------------------- nodes --
create table brain.nodes (
  id            uuid primary key default gen_random_uuid(),
  -- The reporter's stable name for it: 'repo:elliotmai/muster', 'session:<id>'.
  key           text not null check (char_length(key) between 1 and 300),
  kind          text not null check (kind in ('household', 'person', 'app', 'repo', 'project',
                  'thread', 'session', 'subagent', 'chat', 'task', 'device', 'doc')),
  title         text not null check (char_length(title) between 1 and 200),
  parent_id     uuid references brain.nodes (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  household_id  uuid references core.households (id) on delete cascade,
  -- One node per key per household (or per person without one), so the same
  -- repo reported by two housemates is one planet.
  scope         uuid not null generated always as (coalesce(household_id, owner_id)) stored,
  visibility    text not null default 'household' check (visibility in ('private', 'household')),
  status        text not null default 'working' check (status in ('working', 'waiting', 'idle', 'done', 'failed')),
  attrs         jsonb not null default '{}' check (pg_column_size(attrs) <= 8192),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (scope, key)
);
create index nodes_parent on brain.nodes (parent_id);
create index nodes_household on brain.nodes (household_id, last_seen_at desc);
create index nodes_owner on brain.nodes (owner_id);

-- ------------------------------------------------------------------- edges --
create table brain.edges (
  src           uuid not null references brain.nodes (id) on delete cascade,
  dst           uuid not null references brain.nodes (id) on delete cascade,
  rel           text not null check (rel in ('part_of', 'spawned', 'works_on', 'touches', 'depends_on', 'mentions', 'reads')),
  fire_count    integer not null default 1,
  created_at    timestamptz not null default now(),
  last_fired_at timestamptz not null default now(),
  primary key (src, dst, rel),
  check (src <> dst)
);
create index edges_dst on brain.edges (dst);

-- ------------------------------------------------------------------ events --
create table brain.events (
  id          bigint generated always as identity primary key,
  node_id     uuid not null references brain.nodes (id) on delete cascade,
  -- Set when the event acts on another thing: the firings the solar view draws.
  to_node_id  uuid references brain.nodes (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  at          timestamptz not null default now(),
  type        text not null check (type ~ '^[a-z][a-z0-9_]{0,39}$'),
  summary     text check (char_length(summary) <= 500),
  -- The What's Next owner and line, as the session wrote them.
  next_owner  text check (next_owner in ('you', 'claude', 'nothing')),
  next_line   text check (char_length(next_line) <= 300),
  tokens      bigint check (tokens >= 0),
  cost_usd    numeric(12, 4) check (cost_usd >= 0),
  -- Owner only, whatever the node's visibility: prompts, mostly.
  private     boolean not null default false,
  payload     jsonb not null default '{}' check (pg_column_size(payload) <= 8192)
);
create index events_node on brain.events (node_id, at desc);
create index events_at on brain.events (at desc);

-- --------------------------------------------------------------- knowledge --
create table brain.knowledge (
  id            uuid primary key default gen_random_uuid(),
  node_id       uuid references brain.nodes (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  household_id  uuid references core.households (id) on delete cascade,
  scope         uuid not null generated always as (coalesce(household_id, owner_id)) stored,
  visibility    text not null default 'household' check (visibility in ('private', 'household')),
  -- What it is about, for catching contradictions: 'hive.supabase.project'.
  subject       text check (subject ~ '^[a-z0-9][a-z0-9_.:/-]{0,199}$'),
  title         text not null check (char_length(title) between 1 and 200),
  body          text not null check (char_length(body) between 1 and 20000),
  source_url    text check (char_length(source_url) <= 1000),
  source_hash   text check (char_length(source_hash) <= 128),
  status        text not null default 'current' check (status in ('current', 'superseded', 'disputed')),
  superseded_by uuid references brain.knowledge (id) on delete set null,
  verified_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  search        tsvector generated always as (to_tsvector('english', title || ' ' || body)) stored
);
create index knowledge_search on brain.knowledge using gin (search);
create index knowledge_subject on brain.knowledge (scope, subject) where status = 'current';
create index knowledge_node on brain.knowledge (node_id);

-- ------------------------------------------------------------------ access --

/*
 * May I see this node? Its own rule, and every ancestor's: a node made private
 * hides everything under it. Security definer so rules on events and
 * knowledge can ask it.
 */
create function brain.can_see(nid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive up as (
    select id, parent_id, owner_id, household_id, visibility, 1 as depth from brain.nodes where id = nid
    union all
    select n.id, n.parent_id, n.owner_id, n.household_id, n.visibility, up.depth + 1
    from brain.nodes n join up on n.id = up.parent_id
    where up.depth < 50
  )
  select exists (select 1 from up) and not exists (
    select 1 from up
    where not (owner_id = auth.uid()
               or (visibility = 'household' and household_id is not null and core.is_member(household_id)))
  )
$$;

alter table brain.nodes     enable row level security;
alter table brain.edges     enable row level security;
alter table brain.events    enable row level security;
alter table brain.knowledge enable row level security;

create policy "see what I may" on brain.nodes for select to authenticated using (brain.can_see(id));
create policy "rename or hide my own" on brain.nodes for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "forget my own" on brain.nodes for delete to authenticated using (owner_id = auth.uid());

create policy "see links between what I may see" on brain.edges for select to authenticated
  using (brain.can_see(src) and brain.can_see(dst));

create policy "see what I may" on brain.events for select to authenticated
  using ((not private or owner_id = auth.uid())
         and brain.can_see(node_id)
         and (to_node_id is null or brain.can_see(to_node_id)));
create policy "forget my own" on brain.events for delete to authenticated using (owner_id = auth.uid());

create policy "see what I may" on brain.knowledge for select to authenticated
  using (owner_id = auth.uid()
         or (visibility = 'household' and household_id is not null and core.is_member(household_id)
             and (node_id is null or brain.can_see(node_id))));
create policy "hide my own" on brain.knowledge for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "forget my own" on brain.knowledge for delete to authenticated using (owner_id = auth.uid());

revoke all on all tables in schema brain from anon, authenticated;
grant select on brain.nodes, brain.edges, brain.events, brain.knowledge to authenticated;
grant update (title, visibility) on brain.nodes to authenticated;
grant update (visibility) on brain.knowledge to authenticated;
grant delete on brain.nodes, brain.events, brain.knowledge to authenticated;
grant all on all tables in schema brain to service_role;

-- ----------------------------------------------------------------- helpers --

/*
 * Strip what looks like a secret or an email before it is stored. Reporters
 * strip too; this is the backstop, so a careless reporter can't leak a key
 * into a household-visible row.
 */
create function brain.redact(t text) returns text
language sql immutable set search_path = '' as $$
  select case when t is null then null else
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(t,
      '(sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|sb_(secret|publishable)_[A-Za-z0-9_-]{10,}|hb_[0-9a-f]{40,}|xox[abpr]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})',
        '[redacted]', 'g'),
      'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}', '[redacted]', 'g'),
      '-----BEGIN [A-Z ]*PRIVATE KEY-----[^-]*-----END [A-Z ]*PRIVATE KEY-----', '[redacted]', 'g'),
      '((password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)\S+', '\1[redacted]', 'gi'),
      '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g'),
      '[[:cntrl:]]', ' ', 'g')
  end
$$;

/* A cleaned, cut-down string, or null. */
create function brain.clip(t text, n integer) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(brain.redact(t)), n), '')
$$;

/*
 * Find or make a node, and mark it seen. Never changes who owns it or its
 * visibility: those are its owner's to set, from Hive.
 */
create function brain.touch_node(me uuid, hid uuid, k text, knd text, ttl text,
                                 parent uuid, vis text, st text, extra jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  insert into brain.nodes as n (key, kind, title, parent_id, owner_id, household_id, visibility, status, attrs)
  values (k, knd, coalesce(brain.clip(ttl, 200), k), parent, me, hid, coalesce(vis, 'household'),
          coalesce(st, 'working'), coalesce(extra, '{}'))
  on conflict (scope, key) do update set
    title        = coalesce(brain.clip(ttl, 200), n.title),
    parent_id    = coalesce(excluded.parent_id, n.parent_id),
    status       = coalesce(st, n.status),
    attrs        = n.attrs || coalesce(extra, '{}'),
    last_seen_at = now()
  returning id into nid;
  return nid;
end $$;

/* Link two nodes; a link that already exists fires again. */
create function brain.fire(a uuid, b uuid, r text) returns void
language sql security definer set search_path = '' as $$
  insert into brain.edges (src, dst, rel) select a, b, r where a is not null and b is not null and a <> b
  on conflict (src, dst, rel) do update set fire_count = brain.edges.fire_count + 1, last_fired_at = now()
$$;

/*
 * Add what someone learned. Corrects itself rather than piling up:
 *   - same subject, same words: just verified again
 *   - same subject, new words, and the new one has a source (or neither does):
 *     the new one is current and the old one superseded by it
 *   - the old one has a source and the new one doesn't: a claim doesn't beat
 *     a source, so the new one goes in disputed for a person to settle
 * Without a subject nothing can conflict, so it is simply added.
 */
create function brain.learn(me uuid, hid uuid, nid uuid, vis text, k jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  subj text := nullif(lower(btrim(k ->> 'subject')), '');
  ttl  text := brain.clip(k ->> 'title', 200);
  bod  text := brain.clip(k ->> 'body', 20000);
  src  text := brain.clip(k ->> 'source_url', 1000);
  old  brain.knowledge;
  new_id uuid;
begin
  if ttl is null or bod is null then return null; end if;
  if subj is not null and subj !~ '^[a-z0-9][a-z0-9_.:/-]{0,199}$' then subj := null; end if;
  if subj is not null then
    select * into old from brain.knowledge
    where scope = coalesce(hid, me) and subject = subj and status = 'current'
    order by created_at desc limit 1;
  end if;

  if old.id is not null and old.body = bod then
    update brain.knowledge set verified_at = now(), source_url = coalesce(src, source_url) where id = old.id;
    return old.id;
  end if;

  insert into brain.knowledge (node_id, owner_id, household_id, visibility, subject, title, body, source_url, source_hash, status)
  values (nid, me, hid, coalesce(vis, 'household'), subj, ttl, bod, src, brain.clip(k ->> 'source_hash', 128),
          case when old.id is not null and old.source_url is not null and src is null then 'disputed' else 'current' end)
  returning id into new_id;

  if old.id is not null and not (old.source_url is not null and src is null) then
    update brain.knowledge set status = 'superseded', superseded_by = new_id where id = old.id;
  end if;
  return new_id;
end $$;

-- ------------------------------------------------------------------ report --

/*
 * The one way in for reporters. Hive's /api/brain/report checks nothing but
 * the shape of the request and passes the SHA-256 of the key it was given;
 * everything else is decided here, so it is the same for every reporter.
 *
 *   {
 *     "visibility": "household" | "private",           default household
 *     "repo":    "elliotmai/muster",                    optional
 *     "project": "All Apps - Hive",                     optional
 *     "app":     "kitchen",                             optional
 *     "node":  { "key": "session:abc", "kind": "session", "title": "...",
 *                "parent": "session:xyz", "status": "working", "attrs": {} },
 *     "event": { "type": "reply", "summary": "...", "next_owner": "you",
 *                "next_line": "...", "tokens": 1200, "cost_usd": 0.04,
 *                "private": false, "to": "repo:elliotmai/fridge-board",
 *                "payload": {} },                         optional
 *     "knowledge": [ { "subject": "...", "title": "...", "body": "...",
 *                      "source_url": "..." } ]           optional, up to 20
 *   }
 *
 * Returns { ok, node, event }. Raises on a bad key (insufficient_privilege)
 * or a bad shape (invalid_parameter_value).
 */
create function brain.report(key_hash text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me     uuid;
  hid    uuid;
  vis    text := coalesce(p ->> 'visibility', 'household');
  n      jsonb := p -> 'node';
  e      jsonb := p -> 'event';
  knd    text;
  st     text;
  home   uuid;   -- the planet this session orbits: its repo, project or app
  parent uuid;
  nid    uuid;
  target uuid;
  eid    bigint;
  item   jsonb;
begin
  select t.user_id into me from core.api_tokens t
  where t.hash = key_hash and t.app = 'brain' and t.revoked_at is null;
  if me is null then
    raise exception 'unknown or revoked brain key' using errcode = 'insufficient_privilege';
  end if;
  update core.api_tokens set last_used_at = now() where hash = key_hash;

  -- The person's own household; a screen never reports.
  select m.household_id into hid from core.household_members m
  where m.user_id = me and m.role <> 'screen' order by m.joined_at limit 1;

  if vis not in ('private', 'household') then
    raise exception 'visibility must be private or household' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(n) is distinct from 'object' or coalesce(n ->> 'key', '') = '' then
    raise exception 'node.key is required' using errcode = 'invalid_parameter_value';
  end if;
  knd := coalesce(n ->> 'kind', 'session');
  if knd not in ('thread', 'session', 'subagent', 'chat', 'task', 'device', 'doc') then
    raise exception 'node.kind % cannot report', knd using errcode = 'invalid_parameter_value';
  end if;
  st := n ->> 'status';
  if st is not null and st not in ('working', 'waiting', 'idle', 'done', 'failed') then
    raise exception 'node.status % is not one of working, waiting, idle, done, failed', st
      using errcode = 'invalid_parameter_value';
  end if;

  -- Planets: repo, project and app nodes are shared with the household, so
  -- housemates' sessions orbit the same one.
  if coalesce(p ->> 'repo', '') <> '' then
    home := brain.touch_node(me, hid, 'repo:' || lower(left(p ->> 'repo', 200)), 'repo',
                             p ->> 'repo', null, 'household', null, null);
  end if;
  if coalesce(p ->> 'project', '') <> '' then
    parent := brain.touch_node(me, hid, 'project:' || lower(left(p ->> 'project', 200)), 'project',
                               p ->> 'project', null, 'household', null, null);
    perform brain.fire(home, parent, 'part_of');
    home := coalesce(home, parent);
    parent := null;
  end if;
  if coalesce(p ->> 'app', '') <> '' then
    target := brain.touch_node(me, hid, 'app:' || lower(left(p ->> 'app', 60)), 'app',
                               p ->> 'app', null, 'household', null, null);
    perform brain.fire(home, target, 'works_on');
    home := coalesce(home, target);
    target := null;
  end if;

  -- A subagent orbits the session that spawned it; a session orbits its planet.
  if coalesce(n ->> 'parent', '') <> '' then
    parent := brain.touch_node(me, hid, left(n ->> 'parent', 300), 'session', null, home, vis, null, null);
  end if;

  nid := brain.touch_node(me, hid, left(n ->> 'key', 300), knd, n ->> 'title', coalesce(parent, home), vis, st,
                          case when jsonb_typeof(n -> 'attrs') = 'object' then n -> 'attrs' end);
  if parent is not null then perform brain.fire(parent, nid, 'spawned'); end if;
  if home is not null then perform brain.fire(nid, home, 'works_on'); end if;

  if jsonb_typeof(e) = 'object' then
    if coalesce(e ->> 'type', '') !~ '^[a-z][a-z0-9_]{0,39}$' then
      raise exception 'event.type must be a short lowercase word' using errcode = 'invalid_parameter_value';
    end if;
    if e ->> 'next_owner' is not null and lower(e ->> 'next_owner') not in ('you', 'claude', 'nothing') then
      raise exception 'event.next_owner must be you, claude or nothing' using errcode = 'invalid_parameter_value';
    end if;
    if coalesce(e ->> 'to', '') <> '' then
      target := brain.touch_node(me, hid, left(e ->> 'to', 300),
                                 case split_part(e ->> 'to', ':', 1)
                                   when 'repo' then 'repo' when 'app' then 'app' when 'project' then 'project'
                                   when 'subagent' then 'subagent' when 'doc' then 'doc' else 'session' end,
                                 split_part(e ->> 'to', ':', 2), null, 'household', null, null);
      perform brain.fire(nid, target, 'touches');
    end if;
    insert into brain.events (node_id, to_node_id, owner_id, type, summary, next_owner, next_line,
                              tokens, cost_usd, private, payload)
    values (nid, target, me, e ->> 'type',
            brain.clip(e ->> 'summary', 500),
            lower(e ->> 'next_owner'),
            brain.clip(e ->> 'next_line', 300),
            case when (e ->> 'tokens') ~ '^\d{1,15}$' then (e ->> 'tokens')::bigint end,
            case when (e ->> 'cost_usd') ~ '^\d{1,7}(\.\d+)?$' then round((e ->> 'cost_usd')::numeric, 4) end,
            coalesce((e ->> 'private')::boolean, false) or e ->> 'type' = 'prompt',
            case when jsonb_typeof(e -> 'payload') = 'object' and pg_column_size(e -> 'payload') <= 8192
                 then brain.redact((e -> 'payload')::text)::jsonb else '{}' end)
    returning id into eid;
  end if;

  if jsonb_typeof(p -> 'knowledge') = 'array' then
    for item in select value from jsonb_array_elements(p -> 'knowledge') with ordinality where ordinality <= 20 loop
      perform brain.learn(me, hid, nid, vis, item);
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'node', nid, 'event', eid);
end $$;

-- -------------------------------------------------------------- for people --

/*
 * Make a brain key for one computer, cloud environment or agent. Returns the
 * key once; only its SHA-256 is kept. Revoke it from Hive (core.api_tokens).
 */
create function brain.create_key(label text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = 'insufficient_privilege'; end if;
  if core.is_screen() then raise exception 'a screen can''t report' using errcode = 'insufficient_privilege'; end if;
  k := 'hb_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into core.api_tokens (hash, user_id, app, label)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), auth.uid(), 'brain',
          coalesce(nullif(left(btrim(label), 60), ''), 'Brain reporter'));
  return k;
end $$;

/* "This is wrong": anyone who can see a fact can mark it disputed for its owner to settle. */
create function brain.dispute(kid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update brain.knowledge k set status = 'disputed'
  where k.id = kid and k.status = 'current'
    and (k.owner_id = auth.uid()
         or (k.visibility = 'household' and k.household_id is not null and core.is_member(k.household_id)));
  if not found then raise exception 'no such fact you can see' using errcode = 'no_data_found'; end if;
end $$;

/* Search what the brain knows, current facts first. Runs as the asker, so it sees only what they may. */
create function brain.search(q text, max_rows integer default 20)
returns table (id uuid, node_id uuid, title text, body text, source_url text, status text,
               verified_at timestamptz, stale boolean, rank real)
language sql stable security invoker set search_path = '' as $$
  select k.id, k.node_id, k.title, k.body, k.source_url, k.status, k.verified_at,
         k.verified_at < now() - interval '30 days',
         ts_rank(k.search, websearch_to_tsquery('english', q))
  from brain.knowledge k
  where k.search @@ websearch_to_tsquery('english', q) and k.status <> 'superseded'
  order by (k.status = 'current') desc, 9 desc
  limit least(greatest(coalesce(max_rows, 20), 1), 100)
$$;

/* Sessions that went quiet: working for 30 minutes with no word means idle. */
create function brain.mark_idle() returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update brain.nodes set status = 'idle'
    where status = 'working' and kind in ('session', 'subagent', 'chat', 'thread')
      and last_seen_at < now() - interval '30 minutes'
    returning 1
  ) select count(*)::integer from done
$$;

revoke execute on all functions in schema brain from public, anon, authenticated;
grant execute on function brain.can_see(uuid), brain.create_key(text), brain.dispute(uuid),
  brain.search(text, integer) to authenticated;
grant execute on all functions in schema brain to service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table brain.events, brain.nodes;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('brain-mark-idle', '*/5 * * * *', 'select brain.mark_idle()');
  end if;
end $$;
