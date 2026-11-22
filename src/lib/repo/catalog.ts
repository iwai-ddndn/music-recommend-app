// 曲カタログの読み出し補助（ローカル/Supabase 共通）
import type { Db } from "../db/types";
import type { Artist, QueueSource, Track, TrackSource } from "../types";

export type Catalog = {
  tracks: Map<string, Track>;
  artists: Map<string, Artist>;
  sources: Map<string, QueueSource[]>;
};

export function toQueueSource(s: TrackSource): QueueSource {
  return {
    service: s.service,
    external_id: s.external_id,
    url: s.url,
    embed_url: s.embed_url,
    storefront: s.storefront,
    playable: s.playable,
  };
}

export async function loadCatalog(db: Db, trackIds?: string[]): Promise<Catalog> {
  const filter = trackIds ? { in: { id: trackIds } } : undefined;
  const tracks = await db.list("tracks", filter);
  const artistIds = [...new Set(tracks.map((t) => t.artist_id))];
  const [artists, sources] = await Promise.all([
    db.list("artists", { in: { id: artistIds } }),
    db.list("track_sources", { in: { track_id: tracks.map((t) => t.id) } }),
  ]);
  const byTrack = new Map<string, QueueSource[]>();
  for (const s of sources) {
    const arr = byTrack.get(s.track_id) ?? [];
    arr.push(toQueueSource(s));
    byTrack.set(s.track_id, arr);
  }
  return {
    tracks: new Map(tracks.map((t) => [t.id, t])),
    artists: new Map(artists.map((a) => [a.id, a])),
    sources: byTrack,
  };
}

export type TrackCard = {
  track_id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  artwork_url: string | null;
  sources: QueueSource[];
};

export function trackCard(c: Catalog, trackId: string): TrackCard | null {
  const t = c.tracks.get(trackId);
  if (!t) return null;
  return {
    track_id: t.id,
    title: t.title,
    artist_id: t.artist_id,
    artist_name: c.artists.get(t.artist_id)?.name ?? "Unknown",
    artwork_url: t.artwork_url,
    sources: c.sources.get(t.id) ?? [],
  };
}
