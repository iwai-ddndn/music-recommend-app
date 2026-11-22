// スコアラー（仕様書 6章）。heat の共通部分（フォロー倍率なし）と obscurity を track_scores に保存する。
// フォロー倍率・深さ・推薦加点はリクエスト時に適用する（feed.ts）。
import { appConfig } from "../config";
import type { Db } from "../db/types";
import { curatorContributions, heat, obscurity } from "../scoring/score";

export async function recomputeScores(db: Db, now = new Date()): Promise<{ tracks: number }> {
  const cfg = appConfig.scoring;
  const [tracks, curators, mentions] = await Promise.all([
    db.list("tracks"),
    db.list("curators", { eq: { status: "active" } }),
    db.list("mentions"),
  ]);
  const weights = new Map(curators.map((c) => [c.id, c.base_weight]));
  const byTrack = new Map<string, typeof mentions>();
  // 停止中（paused）の目利きの言及は加点しない
  for (const m of mentions) {
    if (!weights.has(m.curator_id)) continue;
    const arr = byTrack.get(m.track_id) ?? [];
    arr.push(m);
    byTrack.set(m.track_id, arr);
  }
  const computed_at = now.toISOString();
  const rows = tracks.map((t) => {
    const ms = byTrack.get(t.id) ?? [];
    const contributions = curatorContributions(ms, weights, now, cfg);
    return {
      track_id: t.id,
      heat: heat(contributions, new Set(), cfg),
      obscurity: obscurity(t.lastfm_listeners, cfg),
      contributions,
      mention_count: ms.length,
      computed_at,
    };
  });
  await db.upsert("track_scores", rows, ["track_id"]);
  return { tracks: rows.length };
}
