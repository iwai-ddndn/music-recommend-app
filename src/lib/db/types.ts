import type {
  ApiUsage,
  Artist,
  Campaign,
  Curator,
  CuratorFollow,
  CuratorSuggestion,
  ListenEvent,
  Mention,
  Pitch,
  PitchReferenceArtist,
  ResolveFailure,
  Track,
  TrackScore,
  TrackSource,
  User,
  UserFavoriteArtist,
} from "../types";

export type AppStateRow = { id: string; created_at: string; key: string; value: unknown };

export type Tables = {
  users: User;
  curators: Curator;
  curator_suggestions: CuratorSuggestion;
  curator_follows: CuratorFollow;
  artists: Artist;
  tracks: Track;
  track_sources: TrackSource;
  mentions: Mention;
  track_scores: TrackScore;
  user_favorite_artists: UserFavoriteArtist;
  campaigns: Campaign;
  pitches: Pitch;
  pitch_reference_artists: PitchReferenceArtist;
  listen_events: ListenEvent;
  api_usage: ApiUsage;
  resolve_failures: ResolveFailure;
  app_state: AppStateRow;
};

export type TableName = keyof Tables;
export const TABLE_NAMES: TableName[] = [
  "users",
  "curators",
  "curator_suggestions",
  "curator_follows",
  "artists",
  "tracks",
  "track_sources",
  "mentions",
  "track_scores",
  "user_favorite_artists",
  "campaigns",
  "pitches",
  "pitch_reference_artists",
  "listen_events",
  "api_usage",
  "resolve_failures",
  "app_state",
];

export type Filter<T> = {
  eq?: Partial<Record<keyof T & string, unknown>>;
  in?: Partial<Record<keyof T & string, readonly unknown[]>>;
  gte?: Partial<Record<keyof T & string, string | number>>;
  order?: { column: keyof T & string; ascending?: boolean };
  limit?: number;
};

export type Insert<T> = Omit<T, "id" | "created_at"> & { id?: string; created_at?: string };

/**
 * 薄い汎用CRUD。ドメインロジックは repo.ts に1つだけ書き、
 * ローカルJSON（USE_FIXTURES）と Supabase の両方で共有する。
 */
export interface Db {
  readonly kind: "local" | "supabase";
  list<K extends TableName>(table: K, filter?: Filter<Tables[K]>): Promise<Tables[K][]>;
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>;
  insert<K extends TableName>(table: K, rows: Insert<Tables[K]>[]): Promise<Tables[K][]>;
  update<K extends TableName>(
    table: K,
    eq: Partial<Tables[K]>,
    patch: Partial<Tables[K]>,
  ): Promise<Tables[K][]>;
  remove<K extends TableName>(table: K, eq: Partial<Tables[K]>): Promise<void>;
  /** onConflict の列が一致する行があれば patch で更新、無ければ挿入 */
  upsert<K extends TableName>(
    table: K,
    rows: Insert<Tables[K]>[],
    onConflict: (keyof Tables[K] & string)[],
  ): Promise<Tables[K][]>;
}
