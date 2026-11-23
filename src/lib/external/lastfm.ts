// Last.fm: リスナー数（人気度）。見つからない場合は null（無名扱い）。
// track.getInfo → track.listeners、artist.getInfo → artist.stats.listeners（いずれも文字列）。
// 利用規約: 1IPあたり平均5リクエスト/秒まで。バッチ側で間隔を空ける。
import { env, isFixtureMode } from "../env";
import { fetchJson } from "./http";
import { loadFixture } from "./fixtures";

type Fixture = { tracks: Record<string, number>; artists: Record<string, number> };
const key = (s: string) => s.trim().toLowerCase();

async function call<T>(params: Record<string, string>): Promise<T | null> {
  if (!env.lastfmApiKey) throw new Error("LASTFM_API_KEY is not set");
  const qs = new URLSearchParams({ ...params, api_key: env.lastfmApiKey, format: "json", autocorrect: "1" });
  const res = await fetchJson<T & { error?: number }>(`https://ws.audioscrobbler.com/2.0/?${qs}`);
  if ((res as { error?: number }).error) return null;
  return res;
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function trackListeners(artist: string, title: string): Promise<number | null> {
  if (isFixtureMode()) {
    return loadFixture<Fixture>("lastfm/listeners.json").tracks[`${key(artist)}|${key(title)}`] ?? null;
  }
  const res = await call<{ track?: { listeners?: string } }>({ method: "track.getInfo", artist, track: title });
  return toInt(res?.track?.listeners);
}

export async function artistListeners(name: string): Promise<{ listeners: number | null; mbid: string | null }> {
  if (isFixtureMode()) {
    return {
      listeners: loadFixture<Fixture>("lastfm/listeners.json").artists[key(name)] ?? null,
      mbid: null,
    };
  }
  const res = await call<{ artist?: { mbid?: string; stats?: { listeners?: string } } }>({
    method: "artist.getInfo",
    artist: name,
  });
  return { listeners: toInt(res?.artist?.stats?.listeners), mbid: res?.artist?.mbid || null };
}

/**
 * アーティストのタグ（artist.getTopTags）。シーンタグへの正規化は taste/vocabulary.ts。
 * artist.getSimilar は人気度に引っ張られるため使わない。
 */
export async function artistTopTags(name: string): Promise<{ name: string; weight: number }[]> {
  if (isFixtureMode()) {
    const tags = loadFixture<Record<string, Record<string, number>>>("lastfm/tags.json")[key(name)] ?? {};
    return Object.entries(tags).map(([n, weight]) => ({ name: n, weight }));
  }
  const res = await call<{ toptags?: { tag?: { name: string; count: number }[] } }>({
    method: "artist.getTopTags",
    artist: name,
  });
  return (res?.toptags?.tag ?? []).map((t) => ({ name: t.name, weight: Number(t.count) || 0 }));
}
