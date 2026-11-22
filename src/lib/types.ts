// 仕様書 4章のデータモデルに対応する型。全テーブルに id / created_at を持つ。

export type Service = "apple" | "soundcloud" | "bandcamp";
export const SERVICES: Service[] = ["apple", "soundcloud", "bandcamp"];

export type Role = "listener" | "curator" | "artist" | "admin";
export type CuratorStatus = "pending" | "active" | "paused";
export type CampaignStatus = "draft" | "open" | "closed";
export type PitchStatus = "pending" | "approved" | "rejected";
export type ListenEventType = "play" | "complete" | "skip" | "save";
export type ListenContext = "feed" | "pitch";

type Row = { id: string; created_at: string };

export type User = Row & {
  role: Role;
  display_name: string | null;
  email: string | null;
  depth: number;
  /** 再生先サービスのユーザー設定（7章「優先順はユーザー設定、次に…」） */
  preferred_service: Service | null;
};

export type Curator = Row & {
  x_user_id: string | null;
  x_handle: string;
  display_name: string;
  status: CuratorStatus;
  base_weight: number;
  claimed_by_user_id: string | null;
  bio: string | null;
};

/** 目利き推薦（8章「同じハンドルが既にあれば票として数える」） */
export type CuratorSuggestion = Row & {
  curator_id: string;
  user_id: string;
  comment: string | null;
};

export type CuratorFollow = Row & { user_id: string; curator_id: string };

export type Artist = Row & {
  name: string;
  apple_artist_id: string | null;
  mbid: string | null;
  lastfm_listeners: number | null;
  listeners_updated_at: string | null;
};

export type Track = Row & {
  title: string;
  artist_id: string;
  isrc: string | null;
  artwork_url: string | null;
  lastfm_listeners: number | null;
  listeners_updated_at: string | null;
};

export type TrackSource = Row & {
  track_id: string;
  service: Service;
  external_id: string;
  url: string;
  embed_url: string | null;
  storefront: string | null;
  playable: boolean;
};

export type Mention = Row & {
  curator_id: string;
  track_id: string;
  x_post_id: string;
  posted_at: string;
  source_url: string;
};

export type CuratorContribution = {
  curator_id: string;
  /** f_{u,c} を掛ける前の寄与 = w_c · min(1+0.25(n-1), 2) · 0.5^(Δ/30) */
  contribution: number;
  mention_count: number;
};

export type TrackScore = Row & {
  track_id: string;
  heat: number;
  obscurity: number;
  /** リクエスト時にフォロー倍率を適用するための目利き別寄与 */
  contributions: CuratorContribution[];
  mention_count: number;
  computed_at: string;
};

export type UserFavoriteArtist = Row & {
  user_id: string;
  artist_id: string;
  source: "manual" | "apple_library";
};

export type Campaign = Row & {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  max_pitches_per_user: number;
  status: CampaignStatus;
};

export type Pitch = Row & {
  campaign_id: string;
  submitter_user_id: string;
  submitter_type: "curator" | "artist";
  track_id: string;
  comment: string;
  status: PitchStatus;
  reject_reason: string | null;
};

export type PitchReferenceArtist = Row & { pitch_id: string; artist_id: string };

export type ListenEvent = Row & {
  user_id: string;
  track_id: string;
  event: ListenEventType;
  context: ListenContext;
  pitch_id: string | null;
};

export type ApiUsage = Row & {
  provider: string;
  date: string;
  units: number;
  estimated_usd: number;
};

/** 解決できなかったURL（5章「捨てず、失敗理由つきでログに残す」） */
export type ResolveFailure = Row & {
  url: string;
  reason: string;
  origin: "collect" | "pitch";
};

// ---- API レスポンス用のビュー型 ----

export type QueueSource = Pick<
  TrackSource,
  "service" | "external_id" | "url" | "embed_url" | "storefront" | "playable"
>;

export type QueueItem = {
  track_id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  artwork_url: string | null;
  sources: QueueSource[];
  reason: string;
  context: ListenContext;
  pitch_id: string | null;
  score?: number;
};

export type SessionUser = Pick<
  User,
  "id" | "role" | "display_name" | "email" | "depth" | "preferred_service"
> & { claimed_curator_id: string | null };
