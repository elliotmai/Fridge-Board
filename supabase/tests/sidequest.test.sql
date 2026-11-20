\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('cdcdcdcd-0000-0000-0000-000000000001', 'host@example.com'),
  ('cdcdcdcd-0000-0000-0000-000000000002', 'pal@example.com');
insert into sidequest.docs (path, data) values ('packs/base', '{"name": "Base"}'), ('users/oldHostFirebaseUid00', '{"username": "Host", "isAdmin": true, "friends": []}');
insert into core.legacy_ids (app, legacy_id, user_id) values ('sidequest', 'oldHostFirebaseUid00', 'cdcdcdcd-0000-0000-0000-000000000001');
set role authenticated;
create function pg_temp.as_user(n int) returns void language sql as $$ select set_config('request.jwt.claim.sub', 'cdcdcdcd-0000-0000-0000-00000000000' || n, false) $$;
create function pg_temp.denied(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when insufficient_privilege then return true; end $$;

select pg_temp.as_user(2);
insert into sidequest.docs (path, data) values ('users/cdcdcdcd-0000-0000-0000-000000000002', '{"username": "Pal", "friends": []}');
do $$ begin
  assert pg_temp.denied($q$insert into sidequest.docs (path, data) values ('packs/evil', '{}')$q$), 'only admins add packs';
  assert pg_temp.denied($q$update sidequest.docs set data = data || '{"isAdmin": true}' where path = 'users/cdcdcdcd-0000-0000-0000-000000000002'$q$), 'no making yourself admin';
  assert (select parent from sidequest.docs where path = 'users/cdcdcdcd-0000-0000-0000-000000000002') = 'users', 'parent kept';
end $$;

-- Host claims the old account: becomes admin with the old profile
select pg_temp.as_user(1);
do $$ begin assert sidequest.claim() = 1, 'claimed one record'; end $$;
insert into sidequest.docs (path, data) values ('packs/new', '{"name": "New"}');
insert into sidequest.docs (path, data) values ('sessions/ABC123', '{"hostUid": "cdcdcdcd-0000-0000-0000-000000000001", "participantUids": ["cdcdcdcd-0000-0000-0000-000000000001"]}');
insert into sidequest.docs (path, data) values ('sessions/ABC123/players/cdcdcdcd-0000-0000-0000-000000000001', '{"score": 0}');

-- Pal joins and scores; can't touch the host's player record; add self as host's friend only
select pg_temp.as_user(2);
insert into sidequest.docs (path, data) values ('sessions/ABC123/players/cdcdcdcd-0000-0000-0000-000000000002', '{"score": 0, "drinkUnits": 0}');
select sidequest.update('sessions/ABC123', '[{"path": ["participantUids"], "op": "union", "value": ["cdcdcdcd-0000-0000-0000-000000000002"]}]');
select sidequest.update('sessions/ABC123/players/cdcdcdcd-0000-0000-0000-000000000002', '[{"path": ["score"], "op": "increment", "value": 5}, {"path": ["drinkUnits"], "op": "increment", "value": 1.5}]');
select sidequest.update('sessions/ABC123/players/cdcdcdcd-0000-0000-0000-000000000002', '[{"path": ["score"], "op": "increment", "value": 2}]');
select sidequest.update('users/cdcdcdcd-0000-0000-0000-000000000001', '[{"path": ["friends"], "op": "union", "value": ["cdcdcdcd-0000-0000-0000-000000000002"]}]');
do $$ begin
  assert (select data -> 'participantUids' from sidequest.docs where path = 'sessions/ABC123') = '["cdcdcdcd-0000-0000-0000-000000000001", "cdcdcdcd-0000-0000-0000-000000000002"]', 'union';
  assert (select data ->> 'score' from sidequest.docs where path = 'sessions/ABC123/players/cdcdcdcd-0000-0000-0000-000000000002') = '7', 'increments add up';
  assert pg_temp.denied($q$select sidequest.update('sessions/ABC123/players/cdcdcdcd-0000-0000-0000-000000000001', '[{"path": ["score"], "op": "set", "value": -99}]')$q$), 'not the host''s score';
  assert pg_temp.denied($q$select sidequest.update('users/cdcdcdcd-0000-0000-0000-000000000001', '[{"path": ["username"], "op": "set", "value": "pwned"}]')$q$), 'not the host''s name';
  assert pg_temp.denied($q$insert into sidequest.docs (path, data) values ('sessions/ABC123/events/e1', '{"uid": "cdcdcdcd-0000-0000-0000-000000000001"}')$q$), 'no events as the host';
end $$;
-- transactions: a stale read is refused, a fresh one commits
create temp table v as select updated_at::text as version from sidequest.docs where path = 'sessions/ABC123';
grant select on v to authenticated;
select sidequest.commit(jsonb_build_array(jsonb_build_object('path', 'sessions/ABC123', 'version', (select version from v))),
  '[{"path": "sessions/ABC123", "kind": "update", "ops": [{"path": ["stock"], "op": "set", "value": [1, 2]}]}]');
do $$ begin
  perform sidequest.commit(jsonb_build_array(jsonb_build_object('path', 'sessions/ABC123', 'version', (select version from v))),
    '[{"path": "sessions/ABC123", "kind": "update", "ops": [{"path": ["stock"], "op": "set", "value": []}]}]');
  raise exception 'a stale read must not commit';
exception when serialization_failure then null; end $$;
do $$ begin
  assert pg_temp.denied($q$delete from sidequest.docs where path = 'sessions/ABC123'$q$), 'only the host deletes a game';
end $$;
select pg_temp.as_user(1);
delete from sidequest.docs where path like 'sessions/ABC123/%';
delete from sidequest.docs where path = 'sessions/ABC123';
reset role;
do $$ begin
  assert not exists (select 1 from sidequest.docs where path like 'sessions/ABC123%'), 'host deleted the game';
  assert (select data ->> 'isAdmin' from sidequest.docs where path = 'users/cdcdcdcd-0000-0000-0000-000000000001') = 'true', 'host kept admin';
  assert exists (select 1 from sidequest.docs where path = 'packs/new'), 'admin added a pack';
end $$;
set role anon;
do $$ begin perform 1 from sidequest.docs; raise exception 'anon reads nothing';
exception when insufficient_privilege then null; end $$;
reset role;
\echo sidequest: all checks passed
