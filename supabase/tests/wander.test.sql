\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('abababab-0000-0000-0000-000000000001', 'ann@example.com'),
  ('abababab-0000-0000-0000-000000000002', 'bob@example.com'),
  ('abababab-0000-0000-0000-000000000003', 'eve@example.com'),
  ('abababab-0000-0000-0000-000000000004', 'obi@example.com');
set role authenticated;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claim.sub', 'abababab-0000-0000-0000-00000000000' || n, false)
$$;
create function pg_temp.denied(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when insufficient_privilege then return true; end $$;

-- Ann makes a trip, joins it, adds Bob as a traveller and Obi as an observer
select pg_temp.as_user(1);
insert into wander.docs (collection, id, data) values
  ('profiles', 'abababab-0000-0000-0000-000000000001', '{"name": "Ann", "email": "ann@example.com"}'),
  ('trips', 't1', '{"name": "Lisbon", "created_by": "abababab-0000-0000-0000-000000000001"}'),
  ('trip_members', 'm1', '{"trip_id": "t1", "user_id": "abababab-0000-0000-0000-000000000001", "role": "owner"}'),
  ('trip_members', 'm2', '{"trip_id": "t1", "user_id": "abababab-0000-0000-0000-000000000002", "role": "member"}'),
  ('trip_observers', 'o1', '{"trip_id": "t1", "user_id": "abababab-0000-0000-0000-000000000004", "added_by": "abababab-0000-0000-0000-000000000001", "scope": {}}'),
  ('itinerary_events', 'e1', '{"trip_id": "t1", "title": "Tram 28"}'),
  ('polls', 'p1', '{"trip_id": "t1", "question": "Dinner?", "created_by": "abababab-0000-0000-0000-000000000001"}'),
  ('poll_options', 'po1', '{"poll_id": "p1", "text": "Fish"}');
do $$ begin
  assert (select trip_id from wander.docs where id = 'po1') = 't1', 'an option belongs to its poll''s trip';
end $$;

-- Eve (signed in, not on the trip) sees and changes nothing — the old rules let her
select pg_temp.as_user(3);
insert into wander.docs (collection, id, data) values ('profiles', 'abababab-0000-0000-0000-000000000003', '{"name": "Eve", "email": "eve@example.com"}');
do $$ begin
  assert (select count(*) from wander.docs where trip_id = 't1') = 0, 'Eve sees no trip records';
  assert (select count(*) from wander.docs where collection = 'profiles') = 1, 'only her own profile';
  assert (select data ->> 'name' from wander.find_profile('ANN@example.com')) = 'Ann', 'but can find Ann by exact email';
  assert pg_temp.denied($q$insert into wander.docs (collection, id, data) values ('trip_members', 'x', '{"trip_id": "t1", "user_id": "abababab-0000-0000-0000-000000000003"}')$q$), 'Eve cannot add herself';
  assert pg_temp.denied($q$insert into wander.docs (collection, id, data) values ('itinerary_events', 'x', '{"trip_id": "t1"}')$q$), 'or add events';
  assert pg_temp.denied($q$insert into wander.docs (collection, id, data) values ('profiles', 'abababab-0000-0000-0000-000000000001', '{}')$q$), 'or write Ann''s profile';
end $$;
update wander.docs set data = '{}' where id = 'e1';
delete from wander.docs where id = 't1';

-- Bob, a traveller: edits events, can't edit Ann's poll, votes as himself only
select pg_temp.as_user(2);
update wander.docs set data = data || '{"title": "Tram 28 at 9"}' where id = 'e1';
insert into wander.docs (collection, id, data) values ('poll_votes', 'v1', '{"trip_id": "t1", "poll_id": "p1", "user_id": "abababab-0000-0000-0000-000000000002"}');
do $$ begin
  assert (select count(*) from wander.docs where collection = 'profiles') = 1, 'Bob sees Ann (same trip)';
  assert pg_temp.denied($q$update wander.docs set data = data || '{"question": "x"}' where id = 'p1'$q$), 'not Ann''s poll';
  assert pg_temp.denied($q$insert into wander.docs (collection, id, data) values ('poll_votes', 'v2', '{"trip_id": "t1", "poll_id": "p1", "user_id": "abababab-0000-0000-0000-000000000001"}')$q$), 'no voting as Ann';
  assert pg_temp.denied($q$update wander.docs set data = data || '{"trip_id": "t2"}' where id = 'e1'$q$), 'records cannot move trips';
end $$;

-- Obi, an observer: reads, can't edit
select pg_temp.as_user(4);
do $$ begin
  assert (select count(*) from wander.docs where trip_id = 't1') >= 6, 'Obi reads the trip';
  assert pg_temp.denied($q$update wander.docs set data = '{}' where id = 'e1'$q$), 'but cannot edit it';
end $$;
reset role;
do $$ begin
  assert (select data ->> 'title' from wander.docs where id = 'e1') = 'Tram 28 at 9', 'Eve changed nothing, Bob did';
  assert exists (select 1 from wander.docs where id = 't1'), 'Eve could not delete the trip';
end $$;

-- Moving from Firebase: Eve's old id was on an old trip; she proves it and imports
insert into core.legacy_ids (app, legacy_id, user_id) values ('wander', 'oldEveFirebaseUid0001', 'abababab-0000-0000-0000-000000000003');
set role authenticated;
select pg_temp.as_user(3);
do $$ begin
  assert wander.import('oldEveFirebaseUid0001', '[
    {"collection": "trips", "id": "old1", "data": {"name": "Rome", "created_by": "someoneElse000000001"}},
    {"collection": "trip_members", "id": "om1", "data": {"trip_id": "old1", "user_id": "oldEveFirebaseUid0001"}},
    {"collection": "itinerary_events", "id": "oe1", "data": {"trip_id": "old1", "title": "Colosseum", "by": "oldEveFirebaseUid0001"}},
    {"collection": "itinerary_events", "id": "spam", "data": {"trip_id": "t1", "title": "injected"}}
  ]') = 3, 'imports her trip, not into Ann''s';
  assert (select data ->> 'by' from wander.docs where id = 'oe1') = 'abababab-0000-0000-0000-000000000003', 're-keyed';
  assert (select count(*) from wander.docs where trip_id = 'old1') = 3, 'she sees her old trip';
end $$;
reset role;
do $$ begin assert not exists (select 1 from wander.docs where id = 'spam'), 'nothing injected'; end $$;
set role anon;
do $$ begin perform 1 from wander.docs; raise exception 'anon reads nothing';
exception when insufficient_privilege then null; end $$;
reset role;
\echo wander: all checks passed
