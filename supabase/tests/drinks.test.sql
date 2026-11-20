\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('ffffffff-0000-0000-0000-000000000001', 'amy@example.com'),
  ('ffffffff-0000-0000-0000-000000000002', 'ben@example.com'),
  ('ffffffff-0000-0000-0000-000000000003', 'cat@example.com');
set role authenticated;
create function pg_temp.as_user(n int) returns void language sql as $$
  select set_config('request.jwt.claim.sub', 'ffffffff-0000-0000-0000-00000000000' || n, false)
$$;
create function pg_temp.denied(ops jsonb) returns boolean language plpgsql as $$
begin perform drinks.write(ops); return false;
exception when insufficient_privilege then return true; end $$;

-- Amy logs drinks (a set at a shallow path splits into records) and her profile
select pg_temp.as_user(1);
select drinks.write('[{"path": ["users", "ffffffff-0000-0000-0000-000000000001", "drinks"], "value": {"d1": {"name": "IPA", "date": "2026-11-01"}, "d2": {"name": "Stout"}}},
                      {"path": ["users", "ffffffff-0000-0000-0000-000000000001", "profile", "weight"], "value": 150},
                      {"path": ["users", "ffffffff-0000-0000-0000-000000000001", "aggregateStats"], "value": {"total": 2}}]');
select drinks.write('[{"path": ["users", "ffffffff-0000-0000-0000-000000000001", "drinks", "d1", "name"], "value": "Hazy IPA"}]');
do $$ begin
  assert (select count(*) from drinks.read(array['users', 'ffffffff-0000-0000-0000-000000000001', 'drinks'])) = 2, 'two drink records';
  assert (select value ->> 'name' from drinks.tree where path[4] = 'd1') = 'Hazy IPA', 'a deep set changes one field';
  assert (select value ->> 'date' from drinks.tree where path[4] = 'd1') = '2026-11-01', 'and keeps the rest';
  assert (select value from drinks.read(array['users', 'ffffffff-0000-0000-0000-000000000001', 'profile', 'weight'])) = '{"weight": 150}', 'reading below a record finds it';
end $$;

-- Ben can't read Amy's stats, can't befriend himself into them, can't write her drinks
select pg_temp.as_user(2);
do $$ begin
  assert (select count(*) from drinks.tree where path[2] = 'ffffffff-0000-0000-0000-000000000001') = 0, 'Ben sees none of Amy';
  assert pg_temp.denied('[{"path": ["friendships", "ffffffff-0000-0000-0000-000000000001", "ffffffff-0000-0000-0000-000000000002"], "value": {"since": "x"}}]'), 'no self-made friendship';
  assert pg_temp.denied('[{"path": ["drinkListShares", "ffffffff-0000-0000-0000-000000000001", "ffffffff-0000-0000-0000-000000000002"], "value": {"since": "x"}}]'), 'no self-granted share';
  assert pg_temp.denied('[{"path": ["users", "ffffffff-0000-0000-0000-000000000001", "drinks", "x"], "value": {"name": "spite"}}]'), 'no writing her drinks';
  assert pg_temp.denied('[{"path": ["users", "ffffffff-0000-0000-0000-000000000002", "x"], "value": 1}, {"path": ["users", "ffffffff-0000-0000-0000-000000000001", "x"], "value": 1}]'), 'a batch with one bad write';
  assert not drinks.has(array['users', 'ffffffff-0000-0000-0000-000000000002', 'x']), 'is undone entirely';
end $$;
-- Ben asks; Amy accepts (her side, then his side, then the request goes)
select drinks.write('[{"path": ["friendRequests", "ffffffff-0000-0000-0000-000000000001", "ffffffff-0000-0000-0000-000000000002"], "value": {"displayName": "Ben"}}]');
select pg_temp.as_user(1);
select drinks.write('[{"path": ["friendships", "ffffffff-0000-0000-0000-000000000002", "ffffffff-0000-0000-0000-000000000001"], "value": {"displayName": "Amy"}},
                      {"path": ["friendships", "ffffffff-0000-0000-0000-000000000001", "ffffffff-0000-0000-0000-000000000002"], "value": {"displayName": "Ben"}},
                      {"path": ["friendRequests", "ffffffff-0000-0000-0000-000000000001", "ffffffff-0000-0000-0000-000000000002"], "value": null}]');
select pg_temp.as_user(2);
do $$ begin
  assert (select count(*) from drinks.read(array['users', 'ffffffff-0000-0000-0000-000000000001', 'aggregateStats'])) = 1, 'friends see stats';
  assert (select count(*) from drinks.read(array['users', 'ffffffff-0000-0000-0000-000000000001', 'drinks'])) = 0, 'but not drinks';
end $$;

-- A party: Amy creates it, adds Ben, logs a drink for him
select pg_temp.as_user(1);
select drinks.write('[{"path": ["parties", "p1"], "value": {"name": "Fri", "status": "active", "createdBy": "ffffffff-0000-0000-0000-000000000001",
  "organizers": {"ffffffff-0000-0000-0000-000000000001": true}, "members": {"ffffffff-0000-0000-0000-000000000001": {"n": "Amy"}}}}]');
select drinks.write('[{"path": ["parties", "p1", "members", "ffffffff-0000-0000-0000-000000000002"], "value": {"n": "Ben"}}]');
select drinks.write('[{"path": ["parties", "p1", "entries", "e1"], "value": {"uid": "ffffffff-0000-0000-0000-000000000002", "addedBy": "ffffffff-0000-0000-0000-000000000001"}},
                      {"path": ["users", "ffffffff-0000-0000-0000-000000000002", "drinks", "pd1"], "value": {"name": "Shot", "partyId": "p1"}}]');
select pg_temp.as_user(3);
do $$ begin
  assert (select count(*) from drinks.tree where path[1] = 'parties') = 0, 'Cat sees no party';
  assert pg_temp.denied('[{"path": ["parties", "p1", "members", "ffffffff-0000-0000-0000-000000000003"], "value": {"n": "Cat"}}]'), 'Cat cannot join';
  assert pg_temp.denied('[{"path": ["parties", "p1"], "value": {"createdBy": "ffffffff-0000-0000-0000-000000000003", "organizers": {"ffffffff-0000-0000-0000-000000000003": true}, "members": {"ffffffff-0000-0000-0000-000000000003": 1}}}]'), 'or take it over';
end $$;
select pg_temp.as_user(2);
do $$ begin
  assert (select count(*) from drinks.read(array['parties', 'p1'])) = 7, 'Ben sees the party';
  assert pg_temp.denied('[{"path": ["parties", "p1", "status"], "value": "ended"}]'), 'only organizers end it';
  assert (select count(*) from drinks.read(array['users', 'ffffffff-0000-0000-0000-000000000002', 'drinks'])) = 1, 'Amy logged Ben a drink';
end $$;

-- Moving from Firebase: Cat's old id appears in Amy's friendships; Cat proves it (Hive records it) and imports
reset role;
insert into drinks.tree (path, value) values (array['friendships', 'ffffffff-0000-0000-0000-000000000001', 'oldCatFirebaseUid000'], '{"displayName": "Cat"}');
insert into core.legacy_ids (app, legacy_id, user_id) values ('alcohol', 'oldCatFirebaseUid000', 'ffffffff-0000-0000-0000-000000000003');
set role authenticated;
select pg_temp.as_user(3);
do $$ begin
  assert drinks.import('oldCatFirebaseUid000', '{
    "users/oldCatFirebaseUid000/drinks/c1": {"name": "Wine"},
    "friendships/oldCatFirebaseUid000/ffffffff-0000-0000-0000-000000000001": {"displayName": "Amy"},
    "users/ffffffff-0000-0000-0000-000000000001/profile": {"hacked": true}
  }') = 2, 'imports only her own records';
  assert drinks.has(array['users', 'ffffffff-0000-0000-0000-000000000003', 'drinks', 'c1']), 're-keyed to her new id';
  assert drinks.has(array['friendships', 'ffffffff-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001']), 'her friendship too';
end $$;
do $$ begin
  perform drinks.import('someoneElsesOldId00', '{}');
  raise exception 'must not import an unproven old id';
exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin
  assert exists (select 1 from drinks.tree where path = array['friendships', 'ffffffff-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000003']), 'Amy''s side re-keyed';
  assert not exists (select 1 from drinks.tree where path[2] = 'ffffffff-0000-0000-0000-000000000001' and path[3] = 'profile' and value ? 'hacked'), 'nothing of Amy''s overwritten';
end $$;
set role anon;
do $$ begin perform 1 from drinks.tree; raise exception 'anon reads nothing';
exception when insufficient_privilege then null; end $$;
reset role;
\echo drinks: all checks passed
