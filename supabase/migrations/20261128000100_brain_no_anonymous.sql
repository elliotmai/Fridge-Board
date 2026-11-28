-- Anonymous sessions get nothing from the brain, the same as every schema
-- outside ZNT (20261125020000_no_anonymous_outside_znt.sql). They own nothing
-- and belong to no household, so they could already see nothing; this also
-- stops one making a brain key and reporting junk.

do $$
declare t record;
begin
  for t in
    select c.relname as r from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and c.relrowsecurity and n.nspname = 'brain'
  loop
    execute format('drop policy if exists "no anonymous sessions" on brain.%I', t.r);
    execute format($p$create policy "no anonymous sessions" on brain.%I as restrictive for all to authenticated
      using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false)
      with check (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false)$p$, t.r);
  end loop;
end $$;

create or replace function brain.create_key(label text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare k text;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if core.is_screen() then raise exception 'a screen can''t report' using errcode = 'insufficient_privilege'; end if;
  k := 'hb_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into core.api_tokens (hash, user_id, app, label)
  values (encode(extensions.digest(k, 'sha256'), 'hex'), auth.uid(), 'brain',
          coalesce(nullif(left(btrim(label), 60), ''), 'Brain reporter'));
  return k;
end $$;
