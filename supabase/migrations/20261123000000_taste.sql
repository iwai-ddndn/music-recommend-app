-- コールドスタート対策: シーンタグと好み（user_taste）
alter type favorite_source add value if not exists 'onboarding';

alter table public.artists
  add column tags jsonb not null default '{}'::jsonb,
  add column tags_updated_at timestamptz;

alter table public.curators
  add column profile_tags jsonb not null default '{}'::jsonb;

alter table public.track_scores
  add column tags jsonb not null default '{}'::jsonb;

alter table public.listen_events
  add column position_sec integer;

-- ログイン済みユーザーの好み。未ログインの間は端末（localStorage）に持ち、ログイン時に統合する。
create table public.user_taste (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  taste jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_taste enable row level security;
create policy user_taste_select_own on public.user_taste for select using (user_id = auth.uid());
create policy user_taste_insert_own on public.user_taste for insert with check (user_id = auth.uid());
create policy user_taste_update_own on public.user_taste for update using (user_id = auth.uid()) with check (user_id = auth.uid());
