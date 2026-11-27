-- Household screens: a device (the fridge tablet) signed in as the household,
-- not as a person. Each one is its own Supabase account with role 'screen' in
-- core.household_members, so every household-shared table (kitchen, znt, pool,
-- timers: all core.is_member) shows it the household's things, and every
-- personal table (auth.uid() = owner) shows it nothing of anyone's.
--
-- An owner makes a pairing code (core.create_screen_code, 10 minutes, one
-- use); the tablet trades it at Hive's /api/hive/screens/claim, whose server
-- (service role) claims it here, makes the account and signs the tablet in.
-- A screen can't own, invite, start or join a household (core.screen_guard).

alter table core.household_members drop constraint household_members_role_check;
alter table core.household_members add constraint household_members_role_check
  check (role in ('owner', 'member', 'screen'));

create table core.screens (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references core.households (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index screens_household on core.screens (household_id);

create table core.screen_codes (
  code         text primary key,
  household_id uuid not null references core.households (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  created_by   uuid not null references auth.users (id) on delete cascade,
  expires_at   timestamptz not null default now() + interval '10 minutes',
  used_at      timestamptz
);

alter table core.screens      enable row level security;
alter table core.screen_codes enable row level security;

create policy "see my household's screens" on core.screens for select to authenticated
  using (core.is_member(household_id));
-- screen_codes: no policies. Owners make them through create_screen_code; only
-- the service role reads or claims them.

grant select on core.screens to authenticated;
grant all on core.screens, core.screen_codes to service_role;

/** Am I a household screen? */
create function core.is_screen() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.screens where user_id = auth.uid())
$$;

/*
 * A screen account only ever has its one 'screen' membership, and a person is
 * never a 'screen'. Covers create_household (owner row), join_household and
 * anything else that inserts a membership.
 */
create function core.screen_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare is_screen boolean := exists (select 1 from core.screens where user_id = new.user_id);
begin
  if is_screen and (new.role <> 'screen' or not exists (
       select 1 from core.screens where user_id = new.user_id and household_id = new.household_id)) then
    raise exception 'a household screen can''t join or start a household' using errcode = '42501';
  end if;
  if not is_screen and new.role = 'screen' then
    raise exception 'only a household screen has that role' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger screen_guard before insert or update on core.household_members
  for each row execute function core.screen_guard();

/** Owner: a one-time code to make a device this household's screen. Replaces any unused one. */
create function core.create_screen_code(hid uuid, screen_name text default 'Kitchen screen')
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O, 1/I
  c text := '';
  clean text := btrim(coalesce(screen_name, ''));
  -- 8 of a v4 uuid's random bytes (not 6 or 8, which carry its version and variant).
  r bytea := uuid_send(gen_random_uuid());
  i int;
begin
  if not core.is_owner(hid) or core.is_screen() then
    raise exception 'only an owner can add a household screen' using errcode = '42501';
  end if;
  if clean = '' then clean := 'Kitchen screen'; end if;
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    c := c || substr(alphabet, 1 + (get_byte(r, i) % 32), 1);
  end loop;
  delete from core.screen_codes s where s.household_id = hid and s.used_at is null;
  insert into core.screen_codes (code, household_id, name, created_by) values (c, hid, left(clean, 60), auth.uid());
  return query select s.code, s.expires_at from core.screen_codes s where s.code = c;
end $$;

/** Server only: claim a code once. The household, the screen's name and who made it, or nothing. */
create function core.claim_screen_code(raw text)
returns table (household_id uuid, name text, created_by uuid)
language sql security definer set search_path = '' as $$
  update core.screen_codes s set used_at = now()
  where s.code = upper(regexp_replace(coalesce(raw, ''), '[^A-Za-z0-9]', '', 'g'))
    and s.used_at is null and s.expires_at > now()
    -- the owner who made it must still own the household
    and exists (select 1 from core.household_members m where m.household_id = s.household_id and m.user_id = s.created_by and m.role = 'owner')
  returning s.household_id, s.name, s.created_by
$$;

/** Server only: the new screen account becomes the household's screen. */
create function core.attach_screen(uid uuid, hid uuid, screen_name text, made_by uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into core.screens (user_id, household_id, name, created_by) values (uid, hid, screen_name, made_by);
  insert into core.household_members (household_id, user_id, role) values (hid, uid, 'screen');
end $$;

/** Server only: the confirmed emails of a household's people (not its screens), for a household pass. */
create function core.household_people_emails(hid uuid)
returns table (user_id uuid, email text, role text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, lower(u.email), m.role
  from core.household_members m join auth.users u on u.id = m.user_id
  where m.household_id = hid and m.role in ('owner', 'member')
    and u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false)
  order by (m.role = 'owner') desc, m.joined_at
$$;

revoke execute on function core.is_screen(), core.screen_guard(), core.create_screen_code(uuid, text),
  core.claim_screen_code(text), core.attach_screen(uuid, uuid, text, uuid), core.household_people_emails(uuid)
  from public, anon, authenticated;
grant execute on function core.is_screen(), core.create_screen_code(uuid, text) to authenticated;
grant execute on function core.is_screen(), core.create_screen_code(uuid, text), core.claim_screen_code(text),
  core.attach_screen(uuid, uuid, text, uuid), core.household_people_emails(uuid) to service_role;
