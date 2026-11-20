alter table public.votes add column if not exists track text;

update public.votes v
set track = c.track
from public.categories c
where c.id = v.category_id
  and v.track is null;

alter table public.votes alter column track set not null;
alter table public.votes drop constraint if exists one_vote_per_category;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'votes_track_check'
      and conrelid = 'public.votes'::regclass
  ) then
    alter table public.votes
      add constraint votes_track_check check (track in ('pageant', 'awards'));
  end if;
end;
$$;

create unique index if not exists one_award_vote_per_category
  on public.votes(user_id, category_id)
  where track = 'awards';

create table if not exists public.pageant_daily_vote_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  voting_day date not null,
  vote_id uuid not null unique references public.votes(id) on delete cascade,
  primary key (user_id, voting_day)
);

insert into public.pageant_daily_vote_limits(user_id, voting_day, vote_id)
select distinct on (user_id, (created_at at time zone 'Asia/Shanghai')::date)
  user_id,
  (created_at at time zone 'Asia/Shanghai')::date,
  id
from public.votes
where track = 'pageant'
order by user_id, (created_at at time zone 'Asia/Shanghai')::date, created_at, id
on conflict do nothing;

alter table public.pageant_daily_vote_limits enable row level security;
revoke all on public.pageant_daily_vote_limits from public, anon, authenticated;

create or replace function public.cast_vote(p_nominee_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_category_id uuid;
  v_track text;
  v_open boolean;
  v_starts timestamptz;
  v_ends timestamptz;
  v_email_confirmed_at timestamptz;
  v_voting_day date := (now() at time zone 'Asia/Shanghai')::date;
  v_vote_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in before voting.';
  end if;

  select email_confirmed_at
  into v_email_confirmed_at
  from auth.users
  where id = auth.uid();

  if v_email_confirmed_at is null then
    raise exception 'Please verify your email address before voting.';
  end if;

  select n.category_id, n.track, c.voting_open, c.starts_at, c.ends_at
    into v_category_id, v_track, v_open, v_starts, v_ends
  from public.nominees n
  join public.categories c on c.id = n.category_id and c.track = n.track
  where n.id = p_nominee_id and n.published = true;

  if v_category_id is null then
    raise exception 'This nominee is not available.';
  end if;
  if not v_open then
    raise exception 'Voting is currently closed for this category.';
  end if;
  if v_starts is not null and now() < v_starts then
    raise exception 'Voting has not opened yet.';
  end if;
  if v_ends is not null and now() > v_ends then
    raise exception 'Voting has closed.';
  end if;

  begin
    insert into public.votes(user_id, category_id, nominee_id, track)
    values (auth.uid(), v_category_id, p_nominee_id, v_track)
    returning id into v_vote_id;

    if v_track = 'pageant' then
      insert into public.pageant_daily_vote_limits(user_id, voting_day, vote_id)
      values (auth.uid(), v_voting_day, v_vote_id);
    end if;
  exception when unique_violation then
    if v_track = 'pageant' then
      raise exception 'You have already voted in the pageant today.';
    else
      raise exception 'You have already voted in this category.';
    end if;
  end;
end;
$$;

create or replace function public.pageant_vote_status()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'already_voted', exists (
      select 1
      from public.pageant_daily_vote_limits l
      where l.user_id = auth.uid()
        and l.voting_day = (now() at time zone 'Asia/Shanghai')::date
    ),
    'nominee_id', (
      select v.nominee_id
      from public.pageant_daily_vote_limits l
      join public.votes v on v.id = l.vote_id
      where l.user_id = auth.uid()
        and l.voting_day = (now() at time zone 'Asia/Shanghai')::date
      limit 1
    ),
    'nominee_name', (
      select n.name
      from public.pageant_daily_vote_limits l
      join public.votes v on v.id = l.vote_id
      join public.nominees n on n.id = v.nominee_id
      where l.user_id = auth.uid()
        and l.voting_day = (now() at time zone 'Asia/Shanghai')::date
      limit 1
    )
  );
$$;

revoke all on function public.cast_vote(uuid) from public, anon;
grant execute on function public.cast_vote(uuid) to authenticated;
revoke all on function public.pageant_vote_status() from public, anon;
grant execute on function public.pageant_vote_status() to authenticated;

update public.categories c
set voting_open = true
where c.track = 'pageant'
  and exists (
    select 1
    from public.nominees n
    where n.category_id = c.id
      and n.published = true
  );
