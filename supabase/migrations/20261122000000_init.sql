-- マイナー曲発掘プレイヤー 初期スキーマ（仕様書 4章）
-- 全テーブルに id (uuid) と created_at を持たせ、行レベルセキュリティを有効にする。
-- リスナーが書けるのは自分の curator_follows / user_favorite_artists / listen_events / pitches だけ。
-- その他の書き込みはサーバー（service role）経由で行う。

create extension if not exists pgcrypto;

-- ---------- enum ----------
create type user_role as enum ('listener', 'curator', 'artist', 'admin');
create type curator_status as enum ('pending', 'active', 'paused');
create type music_service as enum ('apple', 'soundcloud', 'bandcamp');
create type favorite_source as enum ('manual', 'apple_library');
create type campaign_status as enum ('draft', 'open', 'closed');
create type pitch_status as enum ('pending', 'approved', 'rejected');
create type submitter_type as enum ('curator', 'artist');
create type listen_event_type as enum ('play', 'complete', 'skip', 'save');
create type listen_context as enum ('feed', 'pitch');

-- ---------- users ----------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  role user_role not null default 'listener',
  display_name text,
  email text,
  depth double precision not null default 0.5 check (depth >= 0 and depth <= 1),
  preferred_service music_service
);

-- Auth のユーザー作成時に users 行を作る
create function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- ---------- curators ----------
create table public.curators (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  x_user_id text unique,
  x_handle text not null,
  display_name text not null,
  status curator_status not null default 'pending',
  base_weight double precision not null default 1.0 check (base_weight >= 0),
  claimed_by_user_id uuid references public.users (id) on delete set null,
  bio text
);
create unique index curators_handle_lower_idx on public.curators (lower(x_handle));

-- 目利き推薦の票（8章「同じハンドルが既にあれば票として数える」）
create table public.curator_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  curator_id uuid not null references public.curators (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  comment text,
  unique (curator_id, user_id)
);

create table public.curator_follows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  curator_id uuid not null references public.curators (id) on delete cascade,
  unique (user_id, curator_id)
);

-- ---------- artists / tracks ----------
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  apple_artist_id text unique,
  mbid text,
  lastfm_listeners bigint,
  listeners_updated_at timestamptz
);
create index artists_name_lower_idx on public.artists (lower(name));

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  artist_id uuid not null references public.artists (id) on delete cascade,
  isrc text,
  artwork_url text,
  lastfm_listeners bigint,
  listeners_updated_at timestamptz
);
create unique index tracks_isrc_idx on public.tracks (isrc) where isrc is not null;
create index tracks_artist_idx on public.tracks (artist_id);

create table public.track_sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  service music_service not null,
  external_id text not null,
  url text not null,
  embed_url text,
  storefront text,
  playable boolean not null default true,
  unique (service, external_id)
);
create index track_sources_track_idx on public.track_sources (track_id);

-- ---------- mentions / scores ----------
create table public.mentions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  curator_id uuid not null references public.curators (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  x_post_id text not null,
  posted_at timestamptz not null,
  source_url text not null,
  unique (x_post_id, track_id)
);
create index mentions_track_idx on public.mentions (track_id);
create index mentions_curator_posted_idx on public.mentions (curator_id, posted_at desc);

create table public.track_scores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  track_id uuid not null unique references public.tracks (id) on delete cascade,
  heat double precision not null default 0,
  obscurity double precision not null default 1,
  -- リクエスト時にフォロー倍率を適用するための目利き別寄与 [{curator_id, contribution, mention_count}]
  contributions jsonb not null default '[]'::jsonb,
  mention_count integer not null default 0,
  computed_at timestamptz not null default now()
);

-- ---------- favorites ----------
create table public.user_favorite_artists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  source favorite_source not null default 'manual',
  unique (user_id, artist_id)
);

-- ---------- campaigns / pitches ----------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_pitches_per_user integer not null default 3 check (max_pitches_per_user > 0),
  status campaign_status not null default 'draft',
  check (ends_at > starts_at)
);

create table public.pitches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  submitter_user_id uuid not null references public.users (id) on delete cascade,
  submitter_type submitter_type not null,
  track_id uuid not null references public.tracks (id) on delete cascade,
  comment text not null default '',
  status pitch_status not null default 'pending',
  reject_reason text,
  unique (campaign_id, submitter_user_id, track_id)
);
create index pitches_campaign_status_idx on public.pitches (campaign_id, status);

create table public.pitch_reference_artists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pitch_id uuid not null references public.pitches (id) on delete cascade,
  artist_id uuid not null references public.artists (id) on delete cascade,
  unique (pitch_id, artist_id)
);

-- 1推薦につき参照アーティストは1〜3件（上限はここで担保、下限はアプリで検証）
create function public.check_pitch_reference_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.pitch_reference_artists where pitch_id = new.pitch_id) >= 3 then
    raise exception 'a pitch can reference at most 3 artists';
  end if;
  return new;
end;
$$;
create trigger pitch_reference_limit
  before insert on public.pitch_reference_artists
  for each row execute function public.check_pitch_reference_limit();

-- ---------- logs ----------
create table public.listen_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  track_id uuid not null references public.tracks (id) on delete cascade,
  event listen_event_type not null,
  context listen_context not null default 'feed',
  pitch_id uuid references public.pitches (id) on delete set null
);
create index listen_events_user_created_idx on public.listen_events (user_id, created_at desc);

create table public.api_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null,
  date date not null,
  units integer not null default 0,
  estimated_usd numeric(12, 4) not null default 0
);
create index api_usage_provider_date_idx on public.api_usage (provider, date);

create table public.resolve_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  url text not null,
  reason text not null,
  origin text not null check (origin in ('collect', 'pitch'))
);

-- バッチの状態（since_id など）
create table public.app_state (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key text not null unique,
  value jsonb not null
);

-- ---------- Row Level Security ----------
alter table public.users enable row level security;
alter table public.curators enable row level security;
alter table public.curator_suggestions enable row level security;
alter table public.curator_follows enable row level security;
alter table public.artists enable row level security;
alter table public.tracks enable row level security;
alter table public.track_sources enable row level security;
alter table public.mentions enable row level security;
alter table public.track_scores enable row level security;
alter table public.user_favorite_artists enable row level security;
alter table public.campaigns enable row level security;
alter table public.pitches enable row level security;
alter table public.pitch_reference_artists enable row level security;
alter table public.listen_events enable row level security;
alter table public.api_usage enable row level security;
alter table public.resolve_failures enable row level security;
alter table public.app_state enable row level security;

-- users: 自分の行だけ読める（更新は role 変更を防ぐためサーバー経由）
create policy users_select_self on public.users for select using (id = auth.uid() or public.is_admin());

-- 公開カタログ: 誰でも読める
create policy curators_read on public.curators for select using (status = 'active' or public.is_admin());
create policy artists_read on public.artists for select using (true);
create policy tracks_read on public.tracks for select using (true);
create policy track_sources_read on public.track_sources for select using (true);
create policy track_scores_read on public.track_scores for select using (true);
create policy mentions_read on public.mentions for select using (
  exists (select 1 from public.curators c where c.id = curator_id and c.status = 'active')
);
create policy campaigns_read on public.campaigns for select using (status <> 'draft' or public.is_admin());
create policy pitches_read on public.pitches for select using (
  status = 'approved' or submitter_user_id = auth.uid() or public.is_admin()
);
create policy pitch_reference_artists_read on public.pitch_reference_artists for select using (
  exists (
    select 1 from public.pitches p
    where p.id = pitch_id and (p.status = 'approved' or p.submitter_user_id = auth.uid() or public.is_admin())
  )
);

-- リスナーが書けるテーブル（自分の行のみ）
create policy follows_select_own on public.curator_follows for select using (user_id = auth.uid());
create policy follows_insert_own on public.curator_follows for insert with check (user_id = auth.uid());
create policy follows_delete_own on public.curator_follows for delete using (user_id = auth.uid());

create policy favorites_select_own on public.user_favorite_artists for select using (user_id = auth.uid());
create policy favorites_insert_own on public.user_favorite_artists for insert with check (user_id = auth.uid());
create policy favorites_delete_own on public.user_favorite_artists for delete using (user_id = auth.uid());

create policy listen_events_select_own on public.listen_events for select using (user_id = auth.uid());
create policy listen_events_insert_own on public.listen_events for insert with check (user_id = auth.uid());

create policy pitches_insert_own on public.pitches for insert with check (
  submitter_user_id = auth.uid() and status = 'pending'
);
create policy pitch_reference_artists_insert_own on public.pitch_reference_artists for insert with check (
  exists (select 1 from public.pitches p where p.id = pitch_id and p.submitter_user_id = auth.uid())
);

create policy suggestions_select_own on public.curator_suggestions for select using (user_id = auth.uid() or public.is_admin());

-- api_usage / resolve_failures / app_state は管理者のみ参照（書き込みは service role）
create policy api_usage_admin on public.api_usage for select using (public.is_admin());
create policy resolve_failures_admin on public.resolve_failures for select using (public.is_admin());
create policy app_state_admin on public.app_state for select using (public.is_admin());
