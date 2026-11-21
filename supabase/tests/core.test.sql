-- Run: supabase/tests/run.sh. Each check raises if it fails.
\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'Me@Example.com', '{"display_name":"Me"}'),
  ('22222222-2222-2222-2222-222222222222', 'partner@example.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'stranger@example.com', '{}');

do $$ begin
  assert (select count(*) from core.profiles) = 3, 'a profile per account';
  assert (select email from core.profiles where id = '11111111-1111-1111-1111-111111111111') = 'me@example.com', 'emails lowercased';
end $$;

-- me: make a household and an invite
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
create temp table t (hid uuid, code text);
grant all on t to authenticated, anon;
insert into t (hid) select core.create_household('The farm');
update t set code = core.create_invite(hid);
do $$ begin
  assert core.is_owner((select hid from t)), 'creator owns it';
  assert (select count(*) from core.profiles) = 1, 'alone, I only see myself';
end $$;

-- partner joins with the code
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select core.join_household((select lower(code) from t));
do $$ begin
  assert core.is_member((select hid from t)), 'partner is a member';
  assert not core.is_owner((select hid from t)), 'but not an owner';
  assert (select count(*) from core.profiles) = 2, 'housemates see each other';
  assert core.my_household() = (select hid from t), 'my_household finds it';
end $$;
do $$ begin
  perform core.create_invite((select hid from t));
  raise exception 'members must not invite';
exception when insufficient_privilege then null; end $$;

-- stranger: sees nothing (household codes now last and can be reused;
-- see zz_lasting_code.test.sql for replacing one)
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  assert (select count(*) from core.households) = 0, 'stranger sees no households';
  assert (select count(*) from core.household_members) = 0, 'or members';
  assert (select count(*) from core.profiles) = 1, 'or profiles';
  assert core.my_household() is null, 'and has none';
end $$;

-- nobody but the service role reads legacy_ids
do $$ begin
  perform count(*) from core.legacy_ids;
  raise exception 'clients must not read legacy_ids';
exception when insufficient_privilege then null; end $$;

-- signed out: the questions say no instead of failing
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert not core.is_member((select hid from t)), 'anon is not a member';
end $$;
reset role;
\echo core: all checks passed
