// 人気度の取得（仕様書 5章）。新しい曲・アーティストと、30日以上前に取得したものを Last.fm から更新する。
import { appConfig } from "../config";
import type { Db } from "../db/types";
import { isFixtureMode } from "../env";
import { artistListeners, artistTopTags, trackListeners } from "../external/lastfm";
import { normalizeTags } from "../taste/vocabulary";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function refreshListeners(
  db: Db,
  opts: { now?: Date; log?: (m: string) => void } = {},
): Promise<{ artists: number; tracks: number }> {
  const now = opts.now ?? new Date();
  const threshold = new Date(now.getTime() - appConfig.popularity.refreshDays * 86400000).toISOString();
  const stale = (at: string | null) => !at || at < threshold;
  // Last.fm の利用規約（平均5リクエスト/秒以下）に収まるよう間隔を空ける
  const pause = () => (isFixtureMode() ? Promise.resolve() : sleep(250));

  const artists = (await db.list("artists")).filter((a) => stale(a.listeners_updated_at));
  const artistName = new Map((await db.list("artists")).map((a) => [a.id, a.name]));
  for (const a of artists) {
    try {
      const r = await artistListeners(a.name);
      // シーンタグ: Last.fm のタグを語彙に正規化。取れなければ既存（Apple のジャンル由来）を残す
      const tags = normalizeTags(await artistTopTags(a.name), appConfig.taste.trackTagsMax);
      await pause();
      await db.update(
        "artists",
        { id: a.id },
        {
          lastfm_listeners: r.listeners,
          mbid: a.mbid ?? r.mbid,
          listeners_updated_at: now.toISOString(),
          tags: Object.keys(tags).length ? tags : a.tags,
          tags_updated_at: now.toISOString(),
        },
      );
    } catch (e) {
      opts.log?.(`artist ${a.name}: ${(e as Error).message}`);
    }
    await pause();
  }

  const tracks = (await db.list("tracks")).filter((t) => stale(t.listeners_updated_at));
  for (const t of tracks) {
    try {
      const listeners = await trackListeners(artistName.get(t.artist_id) ?? "", t.title);
      await db.update("tracks", { id: t.id }, { lastfm_listeners: listeners, listeners_updated_at: now.toISOString() });
    } catch (e) {
      opts.log?.(`track ${t.title}: ${(e as Error).message}`);
    }
    await pause();
  }
  return { artists: artists.length, tracks: tracks.length };
}
