\set ON_ERROR_STOP on
\o /dev/null
-- Household screens: an owner makes a code, the server claims it once and
-- attaches the screen, which then sees household things and can't run the household.
insert into auth.users (id, email, email_confirmed_at) values
  ('13131313-0000-0000-0000-000000000001', 'owner@screens.test', now()),
  ('13131313-0000-0000-0000-000000000002', 'member@screens.test', now()),
  ('13131313-0000-0000-0000-000000000009', 'screen-x@screens.hive.test', now());
set role authenticated;
select set_config('request.jwt.claim.sub', '13131313-0000-0000-0000-000000000001', false);
create temp table sh as select core.create_household('Screens home') as id;
grant select on sh to authenticated, service_role;
create temp table sc as select * from core.create_screen_code((select id from sh), 'Fridge');
grant select on sc to authenticated, service_role;
do $$ begin
  assert (select code from sc) ~ '^[A-HJ-NP-Z2-9]{8}$', 'eight easy-to-read characters';
  assert (select expires_at from sc) <= now() + interval '10 minutes', 'ten minutes';
end $$;
create temp table jc as select core.create_invite((select id from sh)) as code;
grant select on jc to authenticated, service_role;
select set_config('request.jwt.claim.sub', '13131313-0000-0000-0000-000000000002', false);
select core.join_household((select code from jc));
do $$ begin
  perform core.create_screen_code((select id from sh), 'Mine');
  raise exception 'members can''t add screens';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform core.claim_screen_code((select code from sc));
  raise exception 'people can''t claim codes themselves';
exception when insufficient_privilege then null; end $$;
reset role;

-- The server (service role) claims it: once.
set role service_role;
reset role;
create temp table claimed (household_id uuid, name text, created_by uuid);
grant all on claimed to service_role;
set role service_role;
insert into claimed select * from core.claim_screen_code(lower((select code from sc)));
do $$ begin
  assert (select count(*) from claimed) = 1, 'the code works, in any case';
  assert (select name from claimed) = 'Fridge', 'with the name the owner gave';
  assert (select count(*) from core.claim_screen_code((select code from sc))) = 0, 'and only once';
end $$;
select core.attach_screen('13131313-0000-0000-0000-000000000009', (select id from sh), 'Fridge', '13131313-0000-0000-0000-000000000001');
do $$ begin
  assert (select count(*) from core.household_people_emails((select id from sh))) = 2, 'people, not the screen';
  assert (select email from core.household_people_emails((select id from sh)) limit 1) = 'owner@screens.test', 'owners first';
end $$;
reset role;

-- As the screen.
set role authenticated;
select set_config('request.jwt.claim.sub', '13131313-0000-0000-0000-000000000009', false);
do $$ begin
  assert core.is_screen(), 'it knows it is a screen';
  assert core.is_member((select id from sh)), 'it sees household things';
  assert not core.is_owner((select id from sh)), 'and owns nothing';
  assert core.my_household() = (select id from sh), 'its household';
end $$;
do $$ begin
  perform core.create_household('Elsewhere');
  raise exception 'a screen can''t start a household';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform core.join_household((select code from jc));
  raise exception 'a screen can''t join another household';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform core.create_invite((select id from sh));
  raise exception 'a screen can''t invite';
exception when insufficient_privilege then null; end $$;
do $$ begin assert core.my_household() = (select id from sh), 'still in its household after the refusals'; end $$;
reset role;

-- A person can never be given the screen role.
do $$ begin
  insert into core.household_members (household_id, user_id, role)
    values ((select id from sh), '13131313-0000-0000-0000-000000000002', 'screen')
    on conflict (household_id, user_id) do update set role = 'screen';
  raise exception 'people are never screens';
exception when insufficient_privilege then null; end $$;

-- A code whose maker no longer owns the household doesn't work.
set role authenticated;
select set_config('request.jwt.claim.sub', '13131313-0000-0000-0000-000000000001', false);
create temp table sc2 as select * from core.create_screen_code((select id from sh), '');
grant select on sc2 to authenticated, service_role;
reset role;
update core.household_members set role = 'member' where user_id = '13131313-0000-0000-0000-000000000001';
set role service_role;
do $$ begin assert (select count(*) from core.claim_screen_code((select code from sc2))) = 0, 'maker must still own it'; end $$;
reset role;
\echo screens: all checks passed
