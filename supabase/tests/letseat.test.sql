\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email, created_at) values
  ('efefefef-0000-0000-0000-000000000001', 'cook@example.com', '2026-01-01'),
  ('efefefef-0000-0000-0000-000000000002', 'late@example.com', '2026-12-01');
insert into letseat.legacy (path, data) values ('recipes/r1', '{"name": "Chili"}'), ('events/e1', '{"name": "BBQ"}'), ('events/e1/days/d1', '{"recipes": ["r1"]}');
set role authenticated;
create function pg_temp.as_user(n int) returns void language sql as $$ select set_config('request.jwt.claim.sub', 'efefefef-0000-0000-0000-00000000000' || n, false) $$;

-- someone who signed up after the move can't take the old data, even with a household
select pg_temp.as_user(2);
select core.create_household('Late house');
do $$ begin
  assert letseat.legacy_status() = 'not_eligible', 'late sign-ups are not eligible';
  perform letseat.claim_legacy();
  raise exception 'must not claim';
exception when insufficient_privilege then null; end $$;
insert into letseat.docs (path, data) values ('recipes/mine', '{"name": "Toast"}');

-- the cook (an older account) claims it into their household, once
select pg_temp.as_user(1);
do $$ begin
  assert letseat.legacy_status() = 'waiting', 'waiting for the cook';
  perform letseat.claim_legacy();
  raise exception 'needs a household first';
exception when insufficient_privilege then null; end $$;
select core.create_household('Cook house');
do $$ begin
  assert letseat.claim_legacy('{"stores": {"Costco": true}}') = 3, 'three records';
  assert letseat.legacy_status() = 'claimed', 'only once';
  assert (select count(*) from letseat.docs) = 3, 'sees only their household';
  assert (select parent from letseat.docs where path = 'events/e1/days/d1') = 'events/e1/days', 'parent';
end $$;
select letseat.list_set(array['shoppingList', 'Costco', 'k1'], '{"name": "eggs"}');
select letseat.list_set(array['stores', 'Costco'], null);
do $$ begin
  assert (select tree from letseat.lists) = '{"stores": {}, "shoppingList": {"Costco": {"k1": {"name": "eggs"}}}}', 'list paths';
end $$;

select pg_temp.as_user(2);
do $$ begin
  assert (select count(*) from letseat.docs) = 1, 'the late house sees only its toast';
  assert (select count(*) from letseat.lists) = 0, 'and not the cook''s lists';
end $$;
reset role;
set role anon;
do $$ begin perform 1 from letseat.docs; raise exception 'anon reads nothing';
exception when insufficient_privilege then null; end $$;
reset role;
\echo letseat: all checks passed
