\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-000000000001', 'rancher@example.com'),
  ('cccccccc-0000-0000-0000-000000000002', 'partner@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'neighbour@example.com');

set role authenticated;
create temp table zt (hid uuid, code text, token text);
grant all on zt to authenticated, anon;

-- rancher starts a household and adds a cow; household fills itself in
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', false);
insert into zt (hid) select core.create_household('The ranch');
update zt set code = core.create_invite(hid);
insert into znt.docs (collection, id, data) values ('cattle', 'cow1', '{"tag": "42", "createdAt": {"$ts": 1700000000000}}');
insert into znt.docs (collection, id, data) values ('sessions', 's1', '{"name": "Fall heifers", "cidrDate": {"$ts": 1795000000000}}');
insert into znt.calendar_feeds default values;
update zt set token = (select token from znt.calendar_feeds);
do $$ begin
  assert (select household_id from znt.docs where id = 'cow1') = (select hid from zt), 'household filled in';
end $$;
do $$ begin
  insert into znt.docs (collection, id, data) values ('notacollection', 'x', '{}');
  raise exception 'unknown collections must be refused';
exception when check_violation then null; end $$;

-- partner joins and sees the herd, and can edit it
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000002', false);
select core.join_household((select code from zt));
update znt.docs set data = data || '{"pickedUp": true}' where id = 'cow1';
do $$ begin
  assert (select count(*) from znt.docs) = 2, 'partner sees the herd';
  assert (select data->>'pickedUp' from znt.docs where id = 'cow1') = 'true', 'partner can edit';
end $$;

-- a neighbour without the household sees and changes nothing
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
update znt.docs set data = '{}';
delete from znt.docs;
do $$ begin
  assert (select count(*) from znt.docs) = 0, 'neighbour sees nothing';
  assert (select count(*) from znt.calendar_feeds) = 0, 'or the calendar link';
end $$;
do $$ begin
  insert into znt.docs (household_id, collection, id, data) values ((select hid from zt), 'cattle', 'evil', '{}');
  raise exception 'must not write into someone else''s household';
exception when insufficient_privilege then null; end $$;

-- the calendar feed: the right link gets sessions only; anything else gets nothing
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from znt.calendar_sessions((select token from zt))) = 1, 'feed has the one session';
  assert (select (s->>'name') from znt.calendar_sessions((select token from zt)) s) = 'Fall heifers', 'with its fields';
  assert (select count(*) from znt.calendar_sessions('wrong-token-wrong-token-wrong')) = 0, 'a wrong link gets nothing';
  assert (select count(*) from znt.calendar_sessions('')) = 0, 'an empty link gets nothing';
end $$;
do $$ begin
  perform count(*) from znt.docs;
  raise exception 'signed out must not read the herd';
exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin assert (select count(*) from znt.docs where id = 'cow1') = 1, 'neighbour changed nothing'; end $$;
\echo znt: all checks passed
