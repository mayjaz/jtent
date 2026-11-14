-- Zim Excellence China Edition voting schema
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'voter' check (role in ('voter','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  track text not null check (track in ('pageant','awards')),
  description text,
  voting_open boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.nominees (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  track text not null check (track in ('pageant','awards')),
  subtitle text,
  location text,
  bio text,
  image_url text,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  nominee_id uuid not null references public.nominees(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_vote_per_category unique(user_id, category_id)
);

create index if not exists votes_nominee_idx on public.votes(nominee_id);
create index if not exists nominees_category_idx on public.nominees(category_id);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

create or replace function public.cast_vote(p_nominee_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_category_id uuid;
  v_track text;
  v_open boolean;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  if auth.uid() is null then raise exception 'Please sign in before voting.'; end if;
  select n.category_id, n.track, c.voting_open, c.starts_at, c.ends_at
    into v_category_id, v_track, v_open, v_starts, v_ends
  from public.nominees n join public.categories c on c.id=n.category_id
  where n.id=p_nominee_id and n.published=true;
  if v_category_id is null then raise exception 'This nominee is not available.'; end if;
  if not v_open then raise exception 'Voting is currently closed for this category.'; end if;
  if v_starts is not null and now()<v_starts then raise exception 'Voting has not opened yet.'; end if;
  if v_ends is not null and now()>v_ends then raise exception 'Voting has closed.'; end if;
  insert into public.votes(user_id,category_id,nominee_id)
  values(auth.uid(),v_category_id,p_nominee_id);
exception when unique_violation then
  raise exception 'You have already voted in this category.';
end;
$$;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.nominees enable row level security;
alter table public.votes enable row level security;

create policy "profiles read own" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
create policy "profiles admin update" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "public read categories" on public.categories for select to anon,authenticated using (true);
create policy "public read published nominees" on public.nominees for select to anon,authenticated using (published=true or public.is_admin());
create policy "admins manage categories" on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage nominees" on public.nominees for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "voters read own votes" on public.votes for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy "admins read votes" on public.votes for select to authenticated using (public.is_admin());
revoke all on function public.cast_vote(uuid) from public;
grant execute on function public.cast_vote(uuid) to authenticated;

-- Automatically create a voter profile for every newly registered account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'name','')); return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- IMPORTANT: Promote the event organiser manually after creating their account:
-- update public.profiles set role='admin' where id='YOUR_AUTH_USER_UUID';
-- Do this only from the Supabase SQL editor.
