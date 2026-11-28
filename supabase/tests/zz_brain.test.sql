\set ON_ERROR_STOP on
\o /dev/null
-- Hive Brain: a key reports as its person only, housemates see shared work,
-- private stays private, secrets are stripped, and knowledge corrects itself.
insert into auth.users (id, email, email_confirmed_at) values
  ('b0b0b0b0-0000-0000-0000-000000000001', 'eli@brain.test', now()),
  ('b0b0b0b0-0000-0000-0000-000000000002', 'sam@brain.test', now()),
  ('b0b0b0b0-0000-0000-0000-000000000003', 'stranger@brain.test', now());

-- Eli makes a household, Sam joins, the stranger has their own.
set role authenticated;
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000001', false);
create temp table bh as select core.create_household('Brain home') as id;
grant select on bh to authenticated, service_role;
create temp table binv as select core.create_invite((select id from bh)) as code;
grant select on binv to authenticated, service_role;
-- Each makes a brain key, shown once.
create temp table bkeys (who text, k text);
grant all on bkeys to authenticated, service_role;
insert into bkeys select 'eli', brain.create_key('Laptop');
do $$ begin
  assert (select k from bkeys where who = 'eli') ~ '^hb_[0-9a-f]{48}$', 'a key looks like hb_ + 48 hex';
  assert (select count(*) from core.api_tokens where app = 'brain') = 1, 'only its hash is kept, under app brain';
  assert not exists (select 1 from core.api_tokens where hash = (select k from bkeys where who = 'eli')), 'never the key itself';
end $$;
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000002', false);
select core.join_household((select code from binv));
insert into bkeys select 'sam', brain.create_key('Phone');
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000003', false);
select core.create_household('Elsewhere');
insert into bkeys select 'stranger', brain.create_key(null);

-- An anonymous session can't make a key.
select set_config('request.jwt.claims', '{"is_anonymous": true}', false);
do $$ begin
  perform brain.create_key('anon');
  raise exception 'anonymous sessions can''t make keys';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claims', '', false);

-- People can't report directly; only the server can.
do $$ begin
  perform brain.report('x', '{}');
  raise exception 'people can''t call report';
exception when insufficient_privilege then null; end $$;
reset role;

create temp table h (who text, hash text);
insert into h select who, encode(extensions.digest(k, 'sha256'), 'hex') from bkeys;
grant select on h to service_role;

set role service_role;
-- A bad key is refused.
do $$ begin
  perform brain.report(repeat('0', 64), '{"node":{"key":"session:x"}}');
  raise exception 'unknown keys are refused';
exception when insufficient_privilege then null; end $$;
-- A bad shape is refused.
do $$ begin
  perform brain.report((select hash from h where who = 'eli'), '{"node":{"key":"x","kind":"repo"}}');
  raise exception 'a reporter can''t make planets directly';
exception when invalid_parameter_value then null; end $$;

-- Eli's session on muster, with a secret and an email in the summary.
select brain.report((select hash from h where who = 'eli'), '{
  "repo": "elliotmai/muster", "project": "All Apps - Hive",
  "node": {"key": "session:s1", "kind": "session", "title": "Build the brain", "status": "working"},
  "event": {"type": "reply", "summary": "used sk-ant-abc123def456ghi789 and mailed eli@brain.test, token=hunter2",
            "next_owner": "YOU", "next_line": "Approve the plan", "tokens": 1200, "cost_usd": 0.0412}
}');
-- Its subagent, which touches another repo.
select brain.report((select hash from h where who = 'eli'), '{
  "repo": "elliotmai/muster",
  "node": {"key": "subagent:a1", "kind": "subagent", "title": "Explore", "parent": "session:s1"},
  "event": {"type": "subagent_stop", "summary": "read the schema", "to": "repo:elliotmai/fridge-board"}
}');
-- A prompt is always private.
select brain.report((select hash from h where who = 'eli'), '{
  "node": {"key": "session:s1"}, "event": {"type": "prompt", "summary": "my secret thoughts"}
}');
-- A private session of Eli's.
select brain.report((select hash from h where who = 'eli'), '{
  "visibility": "private", "repo": "elliotmai/muster",
  "node": {"key": "session:secret", "title": "Gift ideas"}, "event": {"type": "start"}
}');
-- Sam reports on the same repo: same planet.
select brain.report((select hash from h where who = 'sam'), '{
  "repo": "ElliotMai/Muster", "node": {"key": "session:sam1", "title": "Sam fixes CI"}, "event": {"type": "start"}
}');
-- The stranger reports on a repo of the same name: their own planet.
select brain.report((select hash from h where who = 'stranger'), '{
  "repo": "elliotmai/muster", "node": {"key": "session:z1", "title": "Not yours"}, "event": {"type": "start"}
}');

do $$ begin
  assert (select count(*) from brain.nodes where key = 'repo:elliotmai/muster') = 2,
    'one muster planet per household, whoever reported it';
  assert (select summary from brain.events where type = 'reply') =
    'used [redacted] and mailed [email], token=[redacted]', 'secrets and emails are stripped';
  assert (select next_owner from brain.events where type = 'reply') = 'you', 'What''s Next owner is kept';
  assert (select private from brain.events where type = 'prompt'), 'prompts are private';
  assert (select p.key from brain.nodes c join brain.nodes p on p.id = c.parent_id where c.key = 'subagent:a1') = 'session:s1',
    'a subagent orbits its session';
  assert (select p.key from brain.nodes c join brain.nodes p on p.id = c.parent_id where c.key = 'session:s1') = 'repo:elliotmai/muster',
    'a session orbits its repo';
  assert exists (select 1 from brain.edges e join brain.nodes a on a.id = e.src join brain.nodes b on b.id = e.dst
                 where a.key = 'session:s1' and b.key = 'subagent:a1' and e.rel = 'spawned'), 'spawning is a link';
  assert (select count(*) from brain.events where to_node_id is not null) = 1, 'touching another repo is a firing';
  assert (select used.last_used_at is not null from core.api_tokens used where hash = (select hash from h where who = 'eli')),
    'a used key says when';
end $$;
-- A link that fires again counts up.
select brain.report((select hash from h where who = 'eli'), '{
  "node": {"key": "subagent:a1", "parent": "session:s1"}, "event": {"type": "tool", "to": "repo:elliotmai/fridge-board"}
}');
do $$ begin
  assert (select e.fire_count from brain.edges e join brain.nodes b on b.id = e.dst
          where b.key = 'repo:elliotmai/fridge-board' and e.rel = 'touches') = 2, 'fires count up';
end $$;
reset role;

-- What each person sees.
set role authenticated;
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000002', false);
do $$ begin
  assert exists (select 1 from brain.nodes where key = 'session:s1'), 'Sam sees Eli''s shared session';
  assert exists (select 1 from brain.events where type = 'reply'), 'and its events';
  assert not exists (select 1 from brain.events where type = 'prompt'), 'but not Eli''s prompt';
  assert not exists (select 1 from brain.nodes where key = 'session:secret'), 'nor Eli''s private session';
  assert not exists (select 1 from brain.nodes where key = 'session:z1'), 'nor another household''s';
  assert (select count(*) from brain.nodes where key = 'repo:elliotmai/muster') = 1, 'one muster planet';
end $$;
-- Sam can't rename, hide or delete Eli's things.
update brain.nodes set title = 'mine now' where key = 'session:s1';
delete from brain.events where type = 'reply';
do $$ begin
  assert (select title from brain.nodes where key = 'session:s1') = 'Build the brain', 'not Sam''s to rename';
  assert exists (select 1 from brain.events where type = 'reply'), 'not Sam''s to delete';
end $$;

-- Eli hides the session: everything under it goes with it.
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000001', false);
do $$ begin
  assert exists (select 1 from brain.events where type = 'prompt'), 'Eli sees their own prompt';
  assert exists (select 1 from brain.nodes where key = 'session:secret'), 'and their private session';
end $$;
update brain.nodes set visibility = 'private' where key = 'session:s1';
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000002', false);
do $$ begin
  assert not exists (select 1 from brain.nodes where key = 'session:s1'), 'hidden';
  assert not exists (select 1 from brain.nodes where key = 'subagent:a1'), 'and its subagent';
  assert not exists (select 1 from brain.events where type = 'subagent_stop'), 'and its events';
end $$;
reset role;

-- Knowledge corrects itself.
set role service_role;
select brain.report((select hash from h where who = 'eli'), '{
  "repo": "elliotmai/fridge-board", "node": {"key": "session:k1"},
  "knowledge": [{"subject": "hive.supabase.region", "title": "Hive region", "body": "us-east-1"}]}');
-- A newer claim replaces an unsourced one.
select brain.report((select hash from h where who = 'sam'), '{
  "node": {"key": "session:k2"},
  "knowledge": [{"subject": "hive.supabase.region", "title": "Hive region", "body": "us-west-2",
                 "source_url": "https://supabase.com/dashboard/project/x"}]}');
-- An unsourced claim doesn't beat a sourced fact: it goes in disputed.
select brain.report((select hash from h where who = 'eli'), '{
  "node": {"key": "session:k3"},
  "knowledge": [{"subject": "hive.supabase.region", "title": "Hive region", "body": "eu-west-1"}]}');
-- Saying the same thing again just re-verifies it.
select brain.report((select hash from h where who = 'sam'), '{
  "node": {"key": "session:k2"},
  "knowledge": [{"subject": "hive.supabase.region", "title": "Hive region", "body": "us-west-2"}]}');
do $$ begin
  assert (select count(*) from brain.knowledge where subject = 'hive.supabase.region') = 3, 'nothing overwritten';
  assert (select body from brain.knowledge where subject = 'hive.supabase.region' and status = 'current') = 'us-west-2',
    'the sourced fact is current';
  assert (select status from brain.knowledge where body = 'us-east-1') = 'superseded', 'the old claim is superseded';
  assert (select k.superseded_by = n.id from brain.knowledge k, brain.knowledge n where k.body = 'us-east-1' and n.body = 'us-west-2'),
    'and points at what replaced it';
  assert (select status from brain.knowledge where body = 'eu-west-1') = 'disputed', 'a claim against a source is disputed';
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000001', false);
do $$ begin
  assert (select body from brain.search('Hive region') limit 1) = 'us-west-2', 'search puts the current fact first';
  assert not exists (select 1 from brain.search('Hive region') where status = 'superseded'), 'superseded facts stay out of search';
end $$;
-- Anyone in the household can say a fact is wrong.
select brain.dispute((select id from brain.knowledge where body = 'us-west-2'));
do $$ begin
  assert (select status from brain.knowledge where body = 'us-west-2') = 'disputed', 'flagged';
end $$;
select set_config('request.jwt.claim.sub', 'b0b0b0b0-0000-0000-0000-000000000003', false);
do $$ begin
  assert not exists (select 1 from brain.knowledge), 'another household sees none of it';
  perform brain.dispute((select id from brain.knowledge limit 1));
  raise exception 'can''t dispute what you can''t see';
exception when no_data_found then null; end $$;
reset role;

-- Quiet sessions go idle.
update brain.nodes set last_seen_at = now() - interval '1 hour' where key = 'session:sam1';
do $$ begin
  assert brain.mark_idle() >= 1, 'marked';
  assert (select status from brain.nodes where key = 'session:sam1') = 'idle', 'idle after 30 quiet minutes';
end $$;
\o
\echo brain: ok
