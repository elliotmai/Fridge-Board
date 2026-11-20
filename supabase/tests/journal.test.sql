\set ON_ERROR_STOP on
\o /dev/null
insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001', 'Writer@Example.com'),
  ('dddddddd-0000-0000-0000-000000000002', 'partner@example.com'),
  ('dddddddd-0000-0000-0000-000000000003', 'stranger@example.com');

set role authenticated;
-- writer: an entry, a habit, and shares entries (only) with partner
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000001', false);
insert into journal.docs (collection, id, data) values
  ('entries', 'e1', '{"text": "dear diary"}'),
  ('habits', 'h1', '{"name": "coffee"}'),
  ('permissions', 'p1', '{"sharedWith": "Partner@Example.com", "type": "entries"}');
do $$ begin
  assert (select owner_id from journal.docs where id = 'e1') = 'dddddddd-0000-0000-0000-000000000001', 'owner filled in';
end $$;

-- partner: sees the shared entry and the sharing row, not the habit; can't edit
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000002', false);
do $$ begin
  assert (select count(*) from journal.docs where collection = 'entries') = 1, 'partner sees the shared entry';
  assert (select count(*) from journal.docs where collection = 'habits') = 0, 'but not habits (not shared)';
  assert (select count(*) from journal.docs where collection = 'permissions') = 1, 'and sees who shares with them';
end $$;
update journal.docs set data = '{}' where id = 'e1';
delete from journal.docs where id = 'e1';
do $$ begin
  insert into journal.docs (collection, id, owner_id, data) values ('entries', 'forged', 'dddddddd-0000-0000-0000-000000000001', '{}');
  raise exception 'must not write as someone else';
exception when insufficient_privilege then null; end $$;

-- stranger: nothing at all
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000003', false);
do $$ begin assert (select count(*) from journal.docs) = 0, 'stranger sees nothing'; end $$;

-- writer shares "both": partner now sees habits too; unsharing hides everything again
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000001', false);
update journal.docs set data = '{"sharedWith": "partner@example.com", "type": "both"}' where id = 'p1';
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000002', false);
do $$ begin assert (select count(*) from journal.docs where collection = 'habits') = 1, '"both" shares habits'; end $$;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000001', false);
delete from journal.docs where id = 'p1';
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000002', false);
do $$ begin assert (select count(*) from journal.docs) = 0, 'unsharing hides everything'; end $$;

reset role;
do $$ begin assert (select data->>'text' from journal.docs where id = 'e1') = 'dear diary', 'partner changed nothing'; end $$;
\echo journal: all checks passed
