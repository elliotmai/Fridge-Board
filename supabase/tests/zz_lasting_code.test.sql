\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('12121212-0000-0000-0000-000000000001', 'owner@example.com'),
  ('12121212-0000-0000-0000-000000000002', 'a@example.com'),
  ('12121212-0000-0000-0000-000000000003', 'b@example.com');
set role authenticated;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', false);
create temp table h as select core.create_household('Home') as id;
grant select on h to authenticated;
create temp table c as select core.create_invite((select id from h)) as code;
grant select on c to authenticated;
do $$ begin assert core.create_invite((select id from h)) = (select code from c), 'same lasting code each time'; end $$;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000002', false);
select core.join_household((select code from c));
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000003', false);
select core.join_household((select code from c));
do $$ begin
  assert (select count(*) from core.household_members where household_id = (select id from h)) = 3, 'two people joined with one code';
  perform core.reset_invite((select id from h));
  raise exception 'only owners replace the code';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', false);
do $$ begin assert core.reset_invite((select id from h)) <> (select code from c), 'a new code'; end $$;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000002', false);
do $$ begin
  perform core.join_household((select code from c));
  raise exception 'the old code must stop working';
exception when no_data_found then null; end $$;
reset role;
\echo lasting code: all checks passed
