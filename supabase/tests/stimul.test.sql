\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@example.com');
insert into stimul.drinks (id, drink, caffeine) values ('d1', 'Coffee', 95);

set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into stimul.logs (drink, mg, at, legacy_id) values ('Coffee', 95, now(), 'fs-1');
do $$ begin
  assert (select user_id from stimul.logs limit 1) = 'aaaaaaaa-0000-0000-0000-000000000001', 'owner filled in';
  assert (select count(*) from stimul.drinks) = 1, 'catalog readable';
end $$;
-- the same Firestore row twice is one row
insert into stimul.logs (drink, mg, at, legacy_id) values ('Coffee', 95, now(), 'fs-1') on conflict (user_id, legacy_id) do nothing;
do $$ begin assert (select count(*) from stimul.logs) = 1, 'import is idempotent'; end $$;
do $$ begin
  insert into stimul.logs (user_id, drink, mg, at) values ('aaaaaaaa-0000-0000-0000-000000000002', 'x', 1, now());
  raise exception 'must not write as someone else';
exception when insufficient_privilege then null; end $$;

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from stimul.logs) = 0, 'b sees none of a''s logs';
end $$;
update stimul.logs set mg = 0;
delete from stimul.logs;
reset role;
do $$ begin assert (select count(*) from stimul.logs where mg = 95) = 1, 'b could not change or delete a''s log'; end $$;

set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin assert (select count(*) from stimul.drinks) = 1, 'signed out can read the catalog'; end $$;
do $$ begin
  perform count(*) from stimul.logs;
  raise exception 'signed out must not read logs';
exception when insufficient_privilege then null; end $$;
reset role;
\echo stimul: all checks passed
