\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'Ann@Example.com'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'bo@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000003', 'cy@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000004', 'di@example.com');

set role authenticated;

-- Ann starts a den; Bo joins with the code; Cy can't (a den holds two)
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000001', false);
create temp table t as select den.create_den('Ann', 'America/Denver') as r;
grant select on t to authenticated;
insert into den.items (couple_id, collection, id, data)
  select r->>'coupleId', 'tasks', 't1', '{"title": "call mom", "assignee": "both"}' from t;
do $$ begin
  assert (select data->'partners'->'eeeeeeee-0000-0000-0000-000000000001'->>'email' from den.couples) = 'ann@example.com', 'email recorded';
end $$;

select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000002', false);
do $$ begin assert (select count(*) from den.couples) = 0, 'Bo sees nothing before joining'; end $$;
select den.join_den((select r->>'code' from t), 'Bo');
do $$ begin
  assert (select count(*) from den.items) = 1, 'Bo sees the shared task';
  assert jsonb_array_length((select data->'members' from den.couples)) = 2, 'members listed';
end $$;

select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000003', false);
do $$ begin
  perform den.join_den((select r->>'code' from t), 'Cy');
  raise exception 'a third person must not join';
exception when insufficient_privilege then null; end $$;
do $$ begin
  assert (select count(*) from den.items) = 0, 'Cy sees nothing';
  assert (select count(*) from den.invites) = 0, 'or the invite';
end $$;
update den.couples set data = '{}';
do $$ begin
  insert into den.items (couple_id, collection, id, data) select r->>'coupleId', 'tasks', 'x', '{}' from t;
  raise exception 'Cy must not write into the den';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform 1 from den.google_tokens;
  raise exception 'google tokens are server-only';
exception when insufficient_privilege then null; end $$;

-- Moving from Firebase: Cy imports her den (old id oldCyFirebaseUid0001) naming Di's email.
-- Di (old id oldDiFirebaseUid0002) claims it; a stranger can't.
select den.import_den('fbDen1',
  '{"inviteCode": "abc123", "partners": {"oldCyFirebaseUid0001": {"email": "cy@example.com"}, "oldDiFirebaseUid0002": {"email": "DI@example.com"}}}',
  '[{"collection": "tasks", "id": "ft1", "data": {"createdBy": "oldDiFirebaseUid0002", "assignee": "oldCyFirebaseUid0001"}},
    {"collection": "calendars", "id": "oldDiFirebaseUid0002", "data": {"events": []}}]',
  'oldCyFirebaseUid0001');
do $$ begin
  assert (select data->'partners' ? 'eeeeeeee-0000-0000-0000-000000000003' from den.couples where id = 'fbDen1'), 'importer re-keyed';
  assert (select data->>'assignee' from den.items where id = 'ft1') = 'eeeeeeee-0000-0000-0000-000000000003', 'assignee re-keyed';
end $$;
do $$ begin
  perform den.import_den('fbDen1', '{}', '[]', null);
  raise exception 'must not import over an existing den';
exception when unique_violation then null; end $$;

select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000001', false);
do $$ begin
  assert not den.claim_den('fbDen1', 'oldDiFirebaseUid0002'), 'Ann is not the person named';
  assert not den.claim_den('fbDen1', 'oldCyFirebaseUid0001'), 'nor Cy';
end $$;

select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000004', false);
do $$ begin
  assert den.claim_den('fbDen1', 'oldDiFirebaseUid0002'), 'Di claims her den';
  assert (select data->>'createdBy' from den.items where id = 'ft1') = 'eeeeeeee-0000-0000-0000-000000000004', 'createdBy re-keyed';
  assert exists (select 1 from den.items where collection = 'calendars' and id = 'eeeeeeee-0000-0000-0000-000000000004'), 'calendar doc re-keyed';
  assert not (select data::text like '%oldDi%' from den.couples where id = 'fbDen1'), 'no old id left';
end $$;

-- merging: deep for the den and records, shallow for updates, $delete removes
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000004', false);
select den.merge_couple('fbDen1', '{"partners": {"eeeeeeee-0000-0000-0000-000000000004": {"timeZone": "Asia/Tokyo"}}, "tonight": {"plan": 1}}');
select den.merge_item('fbDen1', 'answers', '2026-11-20', '{"answers": {"a": "hi", "b": "yo"}}');
select den.merge_item('fbDen1', 'answers', '2026-11-20', '{"answers": {"a": {"$delete": true}}, "when": {"$ts": 5}}');
select den.patch_item('fbDen1', 'tasks', 'ft1', '{"title": "new", "assignee": {"$delete": true}}');
do $$ begin
  assert (select data->'partners'->'eeeeeeee-0000-0000-0000-000000000004'->>'email' from den.couples where id = 'fbDen1') = 'DI@example.com', 'deep merge keeps siblings';
  assert (select data->'partners'->'eeeeeeee-0000-0000-0000-000000000004'->>'timeZone' from den.couples where id = 'fbDen1') = 'Asia/Tokyo', 'and sets the new one';
  assert (select data from den.items where id = '2026-11-20') = '{"answers": {"b": "yo"}, "when": {"$ts": 5}}', 'merge_item creates, merges, deletes';
  assert (select data from den.items where id = 'ft1') = jsonb_build_object('title', 'new', 'createdBy', 'eeeeeeee-0000-0000-0000-000000000004'), 'patch replaces fields';
end $$;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000001', false);
select den.merge_couple('fbDen1', '{"hacked": true}');
do $$ begin
  perform den.merge_item('fbDen1', 'answers', 'x', '{}');
  raise exception 'a non-member must not add records';
exception when insufficient_privilege then null; end $$;

-- profiles are private
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000004', false);
insert into den.profiles (data) values ('{"coupleId": "fbDen1"}');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000003', false);
do $$ begin assert (select count(*) from den.profiles) = 0, 'Cy sees no one else''s profile'; end $$;

reset role;
do $$ begin assert not (select data ? 'hacked' from den.couples where id = 'fbDen1'), 'non-member merge changed nothing'; end $$;
set role anon;
do $$ begin
  perform 1 from den.couples;
  raise exception 'anon reads nothing';
exception when insufficient_privilege then null; end $$;
reset role;
\echo den: all checks passed
