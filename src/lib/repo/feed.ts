// フィードAPI（仕様書 3章・6章）。フォロー・好きなアーティスト・深さからキューを組み立てる。
import { appConfig } from "../config";
import type { Db } from "../db/types";
import { buildQueue, type FeedCandidate, type PitchMatch } from "../feed/build-queue";
import { clampDepth } from "../scoring/score";
import { decayTaste, type Taste } from "../scoring/taste";
import type { QueueItem, SessionUser } from "../types";
import { loadCatalog } from "./catalog";

/** 承認済み推薦のうち、ユーザーの好きなアーティストに一致するもの（track_id ごと） */
export async function pitchMatchesFor(
  db: Db,
  userId: string | null,
  /** 未ログインのとき端末に持っている好きなアーティスト名 */
  favoriteNames: string[] = [],
): Promise<Map<string, PitchMatch[]>> {
  const out = new Map<string, PitchMatch[]>();
  const favorites = userId ? await db.list("user_favorite_artists", { eq: { user_id: userId } }) : [];
  const favIds = new Set(favorites.map((f) => f.artist_id));
  if (favoriteNames.length) {
    const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
    const wanted = new Set(favoriteNames.map(norm));
    for (const a of await db.list("artists")) if (wanted.has(norm(a.name))) favIds.add(a.id);
  }
  if (favIds.size === 0) return out;
  const openCampaigns = await db.list("campaigns", { eq: { status: "open" } });
  if (openCampaigns.length === 0) return out;
  const pitches = await db.list("pitches", {
    eq: { status: "approved" },
    in: { campaign_id: openCampaigns.map((c) => c.id) },
  });
  if (pitches.length === 0) return out;
  const refs = await db.list("pitch_reference_artists", { in: { pitch_id: pitches.map((p) => p.id) } });
  const artists = await db.list("artists", { in: { id: [...favIds] } });
  const artistName = new Map(artists.map((a) => [a.id, a.name]));
  const curators = await db.list("curators", { in: { claimed_by_user_id: pitches.map((p) => p.submitter_user_id) } });
  const handleByUser = new Map(curators.map((c) => [c.claimed_by_user_id!, `@${c.x_handle}`]));
  for (const p of pitches) {
    const matched = refs.filter((r) => r.pitch_id === p.id && favIds.has(r.artist_id));
    if (matched.length === 0) continue;
    const arr = out.get(p.track_id) ?? [];
    arr.push({
      pitch_id: p.id,
      matched_artist_names: matched.map((r) => artistName.get(r.artist_id) ?? ""),
      submitter_type: p.submitter_type,
      submitter_label: handleByUser.get(p.submitter_user_id) ?? null,
    });
    out.set(p.track_id, arr);
  }
  return out;
}

export async function getFeed(
  db: Db,
  user: SessionUser | null,
  opts: {
    depth?: number;
    rng?: () => number;
    now?: Date;
    taste?: Taste | null;
    /** 端末側で覚えている「もう聴いた曲」（未ログイン用） */
    exclude?: string[];
    favoriteNames?: string[];
  } = {},
): Promise<{ items: QueueItem[]; depth: number }> {
  const now = opts.now ?? new Date();
  const depth = clampDepth(opts.depth ?? user?.depth, appConfig.scoring);
  const [scores, activeCurators, catalog, follows, pitchMatches, events] = await Promise.all([
    db.list("track_scores"),
    db.list("curators", { eq: { status: "active" } }),
    loadCatalog(db),
    user ? db.list("curator_follows", { eq: { user_id: user.id } }) : Promise.resolve([]),
    pitchMatchesFor(db, user?.id ?? null, opts.favoriteNames),
    user
      ? db.list("listen_events", {
          eq: { user_id: user.id },
          gte: {
            created_at: new Date(now.getTime() - appConfig.queue.excludeWindowDays * 86400000).toISOString(),
          },
        })
      : Promise.resolve([]),
  ]);

  const active = new Set(activeCurators.map((c) => c.id));
  const handles = new Map(activeCurators.map((c) => [c.id, c.x_handle]));
  const names = new Map(activeCurators.map((c) => [c.id, c.display_name]));
  const scoreByTrack = new Map(scores.map((s) => [s.track_id, s]));

  const candidates: FeedCandidate[] = [];
  for (const [trackId, t] of catalog.tracks) {
    const s = scoreByTrack.get(trackId);
    // 停止中の目利きの言及は非表示（バッチ前でも反映する）
    const contributions = (s?.contributions ?? []).filter((c) => active.has(c.curator_id));
    const matches = pitchMatches.get(trackId) ?? [];
    if (contributions.length === 0 && matches.length === 0) continue;
    candidates.push({
      track_id: trackId,
      title: t.title,
      artist_id: t.artist_id,
      artist_name: catalog.artists.get(t.artist_id)?.name ?? "Unknown",
      artwork_url: t.artwork_url,
      sources: catalog.sources.get(trackId) ?? [],
      contributions,
      obscurity: s?.obscurity ?? 1,
      mention_count: contributions.reduce((n, c) => n + c.mention_count, 0),
      pitch_matches: matches,
      tags: s?.tags ?? {},
    });
  }

  const excluded = new Set([
    ...events.filter((e) => e.event === "complete" || e.event === "skip").map((e) => e.track_id),
    ...(opts.exclude ?? []),
  ]);

  const items = buildQueue(
    {
      candidates,
      followed: new Set(follows.map((f) => f.curator_id)),
      depth,
      excludedTrackIds: excluded,
      curatorHandles: handles,
      curatorNames: names,
      taste: opts.taste ? decayTaste(opts.taste, now, appConfig.taste) : null,
      rng: opts.rng,
    },
    appConfig,
  );
  return { items, depth };
}
