// コールドスタート対策の「好み」モデル。すべて純粋関数。
//
// 曲・目利き・ユーザーを同じシーンタグ空間（config/onboarding.json の scenes）に置く。
//   tasteMult(t,u) = 1 + boostMax × clamp(cos(userTags, trackTags), 0, 1) × min(1, signals / confidenceSignals)
// - 好みが空なら 1（仕様書 6章の式と同じ結果）
// - 上限つきの倍率で、heat を足さない。目利きの言及が無い曲は好みだけでは出てこない
// - 使うのは本人の反応だけ。他ユーザーの再生数やいいね数は使わない
import type { AppConfig } from "../config";

export type TasteConfig = AppConfig["taste"];
export type TagVector = Record<string, number>;

export type Taste = {
  /** オンボーディングで本人が選んだ好み（スキップ数回で消えないよう下限を持つ） */
  seeds: TagVector;
  /** 再生中の反応（保存・完聴・スキップ）から学習した分 */
  learned: TagVector;
  /** 目利きごとの相性（-1〜1 程度） */
  curators: Record<string, number>;
  /** 好みに合う目利きの自動フォロー（本人が明示的にフォローするまでの仮フォロー） */
  softFollows: string[];
  /** 得られたシグナルの数（倍率の確信度に使う） */
  signals: number;
  updatedAt: string | null;
};

export function emptyTaste(): Taste {
  return { seeds: {}, learned: {}, curators: {}, softFollows: [], signals: 0, updatedAt: null };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function cosine(a: TagVector, b: TagVector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of Object.entries(a)) {
    na += v * v;
    if (b[k] !== undefined) dot += v * b[k];
  }
  for (const v of Object.values(b)) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function addScaled(into: TagVector, v: TagVector, scale: number): TagVector {
  const out = { ...into };
  for (const [k, x] of Object.entries(v)) out[k] = (out[k] ?? 0) + x * scale;
  return out;
}

/** 合計1に正規化し、上位 max 個だけ残す */
export function normalize(v: TagVector, max = Infinity): TagVector {
  const entries = Object.entries(v)
    .filter(([, x]) => x > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
  const sum = entries.reduce((s, [, x]) => s + x, 0);
  if (sum === 0) return {};
  return Object.fromEntries(entries.map(([k, x]) => [k, x / sum]));
}

/** ユーザーの好みベクトル = 選んだ好み + 学習分。選んだタグには下限を設ける */
export function userTags(t: Taste, cfg: TasteConfig): TagVector {
  const out: TagVector = {};
  for (const k of new Set([...Object.keys(t.seeds), ...Object.keys(t.learned)])) {
    const seed = t.seeds[k] ?? 0;
    let v = clamp(seed + (t.learned[k] ?? 0), cfg.tagMin, cfg.tagMax);
    if (seed > 0) v = Math.max(v, cfg.seedFloor);
    if (v !== 0) out[k] = v;
  }
  return out;
}

export function tasteMultiplier(
  user: TagVector,
  track: TagVector,
  signals: number,
  cfg: TasteConfig,
): number {
  const confidence = Math.min(1, Math.max(0, signals) / cfg.confidenceSignals);
  if (confidence === 0) return 1;
  return 1 + cfg.boostMax * clamp(cosine(user, track), 0, 1) * confidence;
}

/** heat の f_{u,c}: フォロー中 > 仮フォロー > 相性（上下限つき） */
export function curatorMultiplier(
  curatorId: string,
  ctx: { followed: ReadonlySet<string>; taste: Taste; followMultiplier: number },
  cfg: TasteConfig,
): number {
  if (ctx.followed.has(curatorId)) return ctx.followMultiplier;
  if (ctx.taste.softFollows.includes(curatorId)) return cfg.softFollowMultiplier;
  return clamp(1 + (ctx.taste.curators[curatorId] ?? 0), cfg.curatorMultiplierMin, cfg.curatorMultiplierMax);
}

/** オンボーディング: シーンを選ぶ / 知っているアーティストを選ぶ */
export function seedTaste(
  t: Taste,
  input: { scenes: string[]; anchors: TagVector[] },
  cfg: TasteConfig,
  now = new Date(),
): Taste {
  let seeds: TagVector = {};
  for (const s of input.scenes) seeds[s] = (seeds[s] ?? 0) + cfg.seedWeight;
  for (const a of input.anchors) seeds = addScaled(seeds, normalize(a), cfg.anchorWeight);
  for (const k of Object.keys(seeds)) seeds[k] = clamp(seeds[k], 0, cfg.tagMax);
  return {
    ...t,
    seeds,
    signals: t.signals + input.scenes.length + input.anchors.length,
    updatedAt: now.toISOString(),
  };
}

export type TasteEvent = {
  kind: "save" | "complete" | "skip";
  /** スキップした時点の再生位置（秒）。早いスキップほど強い否定 */
  positionSec?: number;
  trackTags: TagVector;
  /** この曲を推した目利きと寄与の割合（合計1） */
  curatorShares: { id: string; share: number }[];
};

/** 再生中の反応を好みに反映する */
export function applyEvent(t: Taste, e: TasteEvent, cfg: TasteConfig, now = new Date()): Taste {
  const key =
    e.kind === "skip" ? ((e.positionSec ?? Infinity) < cfg.fastSkipSec ? "fastSkip" : "skip") : e.kind;
  const delta = cfg.events[key];
  // 過去の学習分を少しずつ忘れる
  const learned: TagVector = {};
  for (const [k, v] of Object.entries(t.learned)) learned[k] = v * cfg.eventDecay;
  const curators: Record<string, number> = {};
  for (const [k, v] of Object.entries(t.curators)) curators[k] = v * cfg.eventDecay;

  for (const [tag, w] of Object.entries(normalize(e.trackTags))) {
    learned[tag] = clamp((learned[tag] ?? 0) + delta.tag * w, cfg.tagMin, cfg.tagMax);
  }
  for (const c of e.curatorShares) {
    curators[c.id] = clamp((curators[c.id] ?? 0) + delta.curator * c.share, -1, 1);
  }
  return { ...t, learned, curators, signals: t.signals + 1, updatedAt: now.toISOString() };
}

/** 保存しておいた好みの時間減衰（半減期 halfLifeDays）。選んだ好み（seeds）は減衰しない */
export function decayTaste(t: Taste, now: Date, cfg: TasteConfig): Taste {
  if (!t.updatedAt) return t;
  const days = Math.max(0, (now.getTime() - new Date(t.updatedAt).getTime()) / 86400000);
  const f = Math.pow(0.5, days / cfg.halfLifeDays);
  if (f > 0.99) return t;
  const scale = (v: Record<string, number>) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x * f]));
  return { ...t, learned: scale(t.learned), curators: scale(t.curators), updatedAt: now.toISOString() };
}

/** 好みに合う目利きを上位 n 人選ぶ（仮フォロー用） */
export function suggestCurators(
  user: TagVector,
  profiles: { id: string; tags: TagVector }[],
  n: number,
  exclude: ReadonlySet<string> = new Set(),
): string[] {
  return profiles
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({ id: p.id, sim: cosine(user, p.tags) }))
    .filter((p) => p.sim > 0)
    .sort((a, b) => b.sim - a.sim || a.id.localeCompare(b.id))
    .slice(0, n)
    .map((p) => p.id);
}

/** ログイン時の統合: 端末の好みとサーバーの好みを合わせる */
export function mergeTaste(server: Taste, local: Taste, cfg: TasteConfig): Taste {
  const keys = (a: object, b: object) => new Set([...Object.keys(a), ...Object.keys(b)]);
  const seeds: TagVector = {};
  for (const k of keys(server.seeds, local.seeds)) seeds[k] = Math.max(server.seeds[k] ?? 0, local.seeds[k] ?? 0);
  const learned: TagVector = {};
  for (const k of keys(server.learned, local.learned)) {
    learned[k] = clamp((server.learned[k] ?? 0) + (local.learned[k] ?? 0), cfg.tagMin, cfg.tagMax);
  }
  const curators: Record<string, number> = {};
  for (const k of keys(server.curators, local.curators)) {
    curators[k] = clamp((server.curators[k] ?? 0) + (local.curators[k] ?? 0), -1, 1);
  }
  return {
    seeds,
    learned,
    curators,
    softFollows: [...new Set([...server.softFollows, ...local.softFollows])],
    signals: server.signals + local.signals,
    updatedAt: [server.updatedAt, local.updatedAt].filter(Boolean).sort().pop() ?? null,
  };
}

/** 目利きのプロフィール: 推した曲のタグの平均。言及が少ないうちは全体平均に寄せる */
export function curatorProfile(
  trackTags: TagVector[],
  globalMean: TagVector,
  cfg: TasteConfig,
): TagVector {
  let sum: TagVector = {};
  for (const t of trackTags) sum = addScaled(sum, normalize(t), 1);
  const n = trackTags.length;
  const own = normalize(sum);
  const k = cfg.profileShrinkMentions;
  const w = n / (n + k);
  return normalize(addScaled(addScaled({}, own, w), normalize(globalMean), 1 - w));
}

/** 曲のタグ: アーティストのタグ → 無ければ推した目利きのプロフィールの加重平均 */
export function resolveTrackTags(
  artistTags: TagVector | null | undefined,
  curators: { profile: TagVector; weight: number }[],
  cfg: TasteConfig,
): TagVector {
  if (artistTags && Object.keys(artistTags).length > 0) return normalize(artistTags, cfg.trackTagsMax);
  let sum: TagVector = {};
  for (const c of curators) sum = addScaled(sum, c.profile, c.weight);
  return normalize(sum, cfg.trackTagsMax);
}
