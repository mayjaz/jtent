alter table public.nominees
  add column if not exists contestant_number text,
  add column if not exists age integer,
  add column if not exists height text,
  add column if not exists profession text,
  add column if not exists hobbies text,
  add column if not exists motto text,
  add column if not exists about_me text,
  add column if not exists vision text;
