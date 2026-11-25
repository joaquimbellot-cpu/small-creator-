-- Global search (Search and polish agent): one function for the search box (command palette) in the top bar.
--   * global_search(p_q): creators by name or channel name, sponsors by name or industry, deals by the creator's or the
--     sponsor's name. At most 6 rows of each kind. Case-insensitive; % and _ in the text are plain characters
--     (like_pattern escapes them). Rows carry ids, names and one line of public context (channel, subscribers,
--     industry, deal stage). Never an email, phone, note or contact person, so no audit line is needed.
-- SECURITY INVOKER with a fixed search_path: the caller's row level security applies, so a login without a staff
-- role gets no rows. Granted to authenticated only (anon has nothing). Uses the trigram indexes that already exist
-- (creators_full_name_trgm, creators_channel_name_trgm, brands_name_trgm); no new index.
-- SAFE ON THE LIVE DATABASE: one new function; no table, column or row changes. Can run twice.
-- ROLL BACK (manual): drop function public.global_search(text);
set search_path = public, extensions;

create or replace function public.global_search(p_q text)
returns table (kind text, id uuid, name text, channel text, subscribers integer, industry text, stage text, other_name text)
language sql stable security invoker set search_path = public, extensions as $$
  with a as (select public.like_pattern(p_q) as pat, lower(left(btrim(coalesce(p_q, '')), 100)) as raw)
  (select 'creator'::text, c.id, c.full_name::text, c.channel_name::text, c.subscribers::integer, null::text, null::text, null::text
     from public.creators c cross join a
    where a.pat is not null and (c.full_name ilike a.pat or c.channel_name ilike a.pat)
    order by (lower(c.full_name) like left(a.raw, 100) || '%') desc, c.subscribers desc nulls last, c.full_name
    limit 6)
  union all
  (select 'sponsor'::text, b.id, b.name::text, null::text, null::integer, b.industry::text, null::text, null::text
     from public.brands b cross join a
    where a.pat is not null and (b.name::text ilike a.pat or b.industry ilike a.pat)
    order by (lower(b.name::text) like a.raw || '%') desc, b.name::text
    limit 6)
  union all
  (select 'deal'::text, d.id, c.full_name::text, null::text, null::integer, null::text, d.stage::text, b.name::text
     from public.deals d
     join public.creators c on c.id = d.creator_id
     join public.brands b on b.id = d.brand_id
     cross join a
    where a.pat is not null and (c.full_name ilike a.pat or b.name::text ilike a.pat)
    order by d.stage_changed_at desc, d.id
    limit 6)
$$;

revoke all on function public.global_search(text) from public, anon;
grant execute on function public.global_search(text) to authenticated, service_role;
