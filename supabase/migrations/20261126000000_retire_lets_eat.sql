-- Retire Let's Eat into KitchenHub. PREPARED, NOT APPLIED: apply it when
-- Let's Eat's site starts forwarding to KitchenHub (lets-eat branch
-- `retire-into-kitchenhub`) and KitchenHub's kitchen-merge branch is live.
--
-- Let's Eat's recipes are already KitchenHub's (20261125130000). This brings
-- the rest across, into each household's kitchen:
--   events + their days  → kitchen.docs 'events/le-<event>' (days keep their
--                          ids, dates and statuses; each day's recipes become
--                          menu lines pointing at KitchenHub's copy)
--   stores               → 'stores/<id>'
--   the shopping list    → 'shoppingItems/le-<…>' by item, no amounts, in
--                          their store, ticked ones as bought
-- and stops the Let's Eat → KitchenHub meal sync (its days are events now).
-- Let's Eat's own rows are left untouched, read by nobody, for the record.
-- Safe to run twice: everything is keyed and inserted only if missing.

create or replace function kitchen.slug(t text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(left(trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g')), 60), ''), 'store')
$$;

create or replace function kitchen.retire_lets_eat() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_events int; n_stores int; n_items int;
begin
  insert into kitchen.docs (household_id, path, data)
  select e.household_id, 'events/le-' || split_part(e.path, '/', 2), jsonb_build_object(
    'name', coalesce(nullif(btrim(e.data ->> 'name'), ''), 'Event'),
    'guests', '', 'notes', coalesce(e.data ->> 'notes', ''),
    'createdAt', coalesce(e.data -> 'createdAt', jsonb_build_object('$ts', (extract(epoch from now()) * 1000)::bigint)),
    'fromLetsEat', e.path,
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', split_part(d.path, '/', 4),
        'name', coalesce(nullif(btrim(d.data ->> 'name'), ''), 'Day'),
        'date', case when d.data ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$' then d.data ->> 'date' end,
        'status', case when d.data ->> 'status' in ('Not Started', 'Shopping', 'Cooking', 'Done') then d.data ->> 'status' else 'Not Started' end,
        'menu', coalesce((
          select jsonb_agg(jsonb_build_object(
            'recipeId', kitchen.lets_eat_recipe(d.household_id, r),
            'label', coalesce((select x.data ->> 'name' from letseat.docs x where x.household_id = d.household_id and x.path = 'recipes/' || r), '')))
          from jsonb_array_elements_text(case when jsonb_typeof(d.data -> 'recipes') = 'array' then d.data -> 'recipes' else '[]' end) r), '[]'::jsonb))
        order by d.data ->> 'date' nulls last)
      from letseat.docs d where d.household_id = e.household_id and d.path like e.path || '/days/%'), '[]'::jsonb))
  from letseat.docs e where e.path ~ '^events/[^/]+$'
  on conflict (household_id, path) do nothing;
  get diagnostics n_events = row_count;

  insert into kitchen.docs (household_id, path, data)
  select l.household_id, 'stores/' || kitchen.slug(s.key),
         jsonb_build_object('name', s.key, 'order', s.ord - 1)
  from letseat.lists l
  cross join lateral (select key, row_number() over (order by key) ord
                      from jsonb_object_keys(coalesce(l.tree -> 'stores', '{}'::jsonb)) key
                      where key <> 'Uncategorized') s
  on conflict (household_id, path) do nothing;
  get diagnostics n_stores = row_count;

  insert into kitchen.docs (household_id, path, data)
  select l.household_id, 'shoppingItems/le-' || left(md5(st.key || '/' || it.key), 20), jsonb_strip_nulls(jsonb_build_object(
    'name', btrim(it.value ->> 'ingredient'),
    'normalized', lower(btrim(it.value ->> 'ingredient')),
    'quantity', null, 'unit', '', 'notes', '',
    'status', case when (it.value ->> 'checked')::boolean then 'bought' else 'pending' end,
    'source', 'manual',
    'createdAt', jsonb_build_object('$ts', (extract(epoch from now()) * 1000)::bigint),
    'store', case when l.tree -> 'stores' ? st.key and st.key <> 'Uncategorized' then kitchen.slug(st.key) end,
    'recipeName', nullif(it.value ->> 'recipe', '')))
    || jsonb_build_object('quantity', null, 'boughtAt', null)
  from letseat.lists l
  cross join lateral jsonb_each(coalesce(l.tree -> 'shoppingList', '{}'::jsonb)) st
  cross join lateral jsonb_each(case when jsonb_typeof(st.value) = 'object' then st.value else '{}'::jsonb end) it
  where jsonb_typeof(it.value) = 'object' and coalesce(btrim(it.value ->> 'ingredient'), '') <> ''
  on conflict (household_id, path) do nothing;
  get diagnostics n_items = row_count;

  return jsonb_build_object('events', n_events, 'stores', n_stores, 'items', n_items);
end $$;

revoke execute on function kitchen.retire_lets_eat(), kitchen.slug(text) from public, anon, authenticated;
grant execute on function kitchen.retire_lets_eat() to service_role;

select kitchen.retire_lets_eat();

-- Let's Eat's days are KitchenHub events now: stop mirroring them onto the
-- meal plan (the entries already there stay, as ordinary planned meals).
drop trigger if exists lets_eat_to_kitchen on letseat.docs;
