// スコアラー（仕様書 6章）。heat の共通部分（フォロー倍率なし）と obscurity を track_scores に保存する。
// あわせて、目利きのプロフィール（シーンタグ）と曲のタグを計算する。
// フォロー倍率・深さ・推薦加点・好み倍率はリクエスト時に適用する（repo/feed.ts）。
import { appConfig } from "../config";
import type { Db } from "../db/types";
import { curatorContributions, heat, obscurity } from "../scoring/score";
import { addScaled, curatorProfile, normalize, resolveTrackTags, type TagVector } from "../scoring/taste";

export async function recomputeScores(
  db: Db,
  now = new Date(),
): Promise<{ tracks: number; tagCoverage: number }> {
  const cfg = appConfig.scoring;
  const [tracks, artists, curators, mentions] = await Promise.all([
    db.list("tracks"),
    db.list("artists"),
    db.list("curators", { eq: { status: "active" } }),
    db.list("mentions"),
  ]);
  const weights = new Map(curators.map((c) => [c.id, c.base_weight]));
  const artistTags = new Map(artists.map((a) => [a.id, a.tags ?? {}]));
  const trackArtist = new Map(tracks.map((t) => [t.id, t.artist_id]));
  const byTrack = new Map<string, typeof mentions>();
  const byCurator = new Map<string, typeof mentions>();
  // 停止中（paused）の目利きの言及は加点しない
  for (const m of mentions) {
    if (!weights.has(m.curator_id)) continue;
    byTrack.set(m.track_id, [...(byTrack.get(m.track_id) ?? []), m]);
    byCurator.set(m.curator_id, [...(byCurator.get(m.curator_id) ?? []), m]);
  }

  // 目利きのプロフィール: 推した曲（タグのあるアーティスト）のタグの平均。少ないうちは全体平均に寄せる
  let globalMean: TagVector = {};
  for (const t of tracks) {
    if (byTrack.has(t.id)) globalMean = addScaled(globalMean, normalize(artistTags.get(t.artist_id) ?? {}), 1);
  }
  const profiles = new Map<string, TagVector>();
  for (const c of curators) {
    const tagged = (byCurator.get(c.id) ?? [])
      .map((m) => artistTags.get(trackArtist.get(m.track_id) ?? "") ?? {})
      .filter((t) => Object.keys(t).length > 0);
    const profile = curatorProfile(tagged, globalMean, appConfig.taste);
    profiles.set(c.id, profile);
    await db.update("curators", { id: c.id }, { profile_tags: profile });
  }

  const computed_at = now.toISOString();
  let withTags = 0;
  const rows = tracks.map((t) => {
    const ms = byTrack.get(t.id) ?? [];
    const contributions = curatorContributions(ms, weights, now, cfg);
    const tags = resolveTrackTags(
      artistTags.get(t.artist_id),
      contributions.map((c) => ({ profile: profiles.get(c.curator_id) ?? {}, weight: c.contribution })),
      appConfig.taste,
    );
    if (Object.keys(artistTags.get(t.artist_id) ?? {}).length) withTags++;
    return {
      track_id: t.id,
      heat: heat(contributions, new Set(), cfg),
      obscurity: obscurity(t.lastfm_listeners, cfg),
      contributions,
      mention_count: ms.length,
      tags,
      computed_at,
    };
  });
  await db.upsert("track_scores", rows, ["track_id"]);
  // タグの付いている曲の割合（低いと好み倍率が目利きプロフィール頼みになる）
  return { tracks: rows.length, tagCoverage: rows.length ? withTags / rows.length : 0 };
}

