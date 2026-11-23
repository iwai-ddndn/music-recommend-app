// 仕様書 6章のスコア計算。すべて純粋関数。係数は config/app-config.json から渡す。
//
//   score(t,u)     = heat(t,u) × obscurity(t)^(2·d_u) × (1 + pitchBoost(t,u)) × tasteMult(t,u)
//   （tasteMult は taste.ts。好みが未取得なら 1 で、仕様書 6章の式そのまま）
//   heat(t,u)      = Σ_{c∈top5(t)} w_c · f_{u,c} · min(1 + 0.25(n_{c,t}−1), 2) · 0.5^(Δ_{c,t}/30)
//   obscurity(t)   = 1 / (1 + log10(1 + L_t / 10000))
//
// いいね数・リポスト数・再生数は一切使わない。
import type { AppConfig } from "../config";
import type { CuratorContribution } from "../types";

export type ScoringConfig = AppConfig["scoring"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** 繰り返し言及の倍率。2倍で頭打ち。 */
export function repeatFactor(mentionCount: number, cfg: ScoringConfig): number {
  if (mentionCount <= 0) return 0;
  return Math.min(1 + cfg.repeatStep * (mentionCount - 1), cfg.repeatCap);
}

/** 最新の言及からの経過日数による減衰。半減期30日。 */
export function recencyDecay(daysSinceLatest: number, cfg: ScoringConfig): number {
  const d = Math.max(0, daysSinceLatest);
  return Math.pow(0.5, d / cfg.halfLifeDays);
}

/** 無名度。リスナー数が多いほど小さくなる。null は 0（無名）として扱う。 */
export function obscurity(listeners: number | null | undefined, cfg: ScoringConfig): number {
  const L = Math.max(0, listeners ?? 0);
  return 1 / (1 + Math.log10(1 + L / cfg.obscurityScale));
}

export type MentionLike = { curator_id: string; posted_at: string };

/**
 * バッチで計算する「目利き別の寄与」（フォロー倍率 f_{u,c} を掛ける前）。
 * w_c · min(1 + 0.25(n−1), 2) · 0.5^(Δ/30)
 */
export function curatorContributions(
  mentions: MentionLike[],
  curatorWeights: Map<string, number>,
  now: Date,
  cfg: ScoringConfig,
): CuratorContribution[] {
  const byCurator = new Map<string, { n: number; latest: number }>();
  for (const m of mentions) {
    const t = new Date(m.posted_at).getTime();
    const cur = byCurator.get(m.curator_id);
    if (cur) {
      cur.n += 1;
      cur.latest = Math.max(cur.latest, t);
    } else {
      byCurator.set(m.curator_id, { n: 1, latest: t });
    }
  }
  const out: CuratorContribution[] = [];
  for (const [curator_id, { n, latest }] of byCurator) {
    const w = curatorWeights.get(curator_id) ?? cfg.defaultCuratorWeight;
    const days = (now.getTime() - latest) / DAY_MS;
    out.push({
      curator_id,
      contribution: w * repeatFactor(n, cfg) * recencyDecay(days, cfg),
      mention_count: n,
    });
  }
  return out.sort((a, b) => b.contribution - a.contribution);
}

/**
 * heat(t,u)。目利きごとの倍率 f_{u,c} を掛けたうえで寄与の大きい上位 topCurators 人だけを合計する
 * （6人目以降は加点しない）。
 */
export function heatWith(
  contributions: CuratorContribution[],
  multiplierFor: (curatorId: string) => number,
  cfg: ScoringConfig,
): number {
  return contributions
    .map((c) => c.contribution * multiplierFor(c.curator_id))
    .sort((a, b) => b - a)
    .slice(0, cfg.topCurators)
    .reduce((sum, v) => sum + v, 0);
}

/** フォロー中=followMultiplier、それ以外=1 の heat。followed を空にするとバッチ保存用の共通部分になる。 */
export function heat(
  contributions: CuratorContribution[],
  followed: ReadonlySet<string>,
  cfg: ScoringConfig,
): number {
  return heatWith(contributions, (id) => (followed.has(id) ? cfg.followMultiplier : 1), cfg);
}

/** 好きなアーティストに一致する承認済み推薦の件数から加点を決める。上限あり。 */
export function pitchBoost(matchCount: number, cfg: ScoringConfig): number {
  return Math.min(Math.max(0, matchCount) * cfg.pitchBoostPerMatch, cfg.pitchBoostCap);
}

export function clampDepth(depth: number | null | undefined, cfg: ScoringConfig): number {
  if (depth == null || Number.isNaN(depth)) return cfg.defaultDepth;
  return Math.min(1, Math.max(0, depth));
}

export function score(
  args: { heat: number; obscurity: number; depth: number; pitchMatches: number; tasteMultiplier?: number },
  cfg: ScoringConfig,
): number {
  const d = clampDepth(args.depth, cfg);
  return (
    args.heat *
    Math.pow(args.obscurity, 2 * d) *
    (1 + pitchBoost(args.pitchMatches, cfg)) *
    (args.tasteMultiplier ?? 1)
  );
}
