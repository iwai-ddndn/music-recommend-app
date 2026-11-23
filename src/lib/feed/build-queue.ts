// 仕様書 6章「キューの組み立て」。純粋関数（乱数は注入）。
import type { AppConfig } from "../config";
import { heatWith, score } from "../scoring/score";
import { curatorMultiplier, tasteMultiplier, userTags, type TagVector, type Taste } from "../scoring/taste";
import type { CuratorContribution, QueueItem, QueueSource } from "../types";

export type PitchMatch = {
  pitch_id: string;
  /** 一致したユーザーの好きなアーティスト名 */
  matched_artist_names: string[];
  submitter_type: "curator" | "artist";
  /** curator の場合は @handle */
  submitter_label: string | null;
};

export type FeedCandidate = {
  track_id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  artwork_url: string | null;
  sources: QueueSource[];
  contributions: CuratorContribution[];
  obscurity: number;
  mention_count: number;
  pitch_matches: PitchMatch[];
  /** 曲のシーンタグ */
  tags?: TagVector;
};

export type BuildQueueInput = {
  candidates: FeedCandidate[];
  followed: ReadonlySet<string>;
  depth: number;
  /** 過去30日に完聴・スキップした曲 */
  excludedTrackIds: ReadonlySet<string>;
  curatorHandles: ReadonlyMap<string, string>;
  curatorNames?: ReadonlyMap<string, string>;
  /** 好み（オンボーディングと再生中の反応）。無ければ仕様書 6章の式そのまま */
  taste?: Taste | null;
  rng?: () => number;
};

type Scored = FeedCandidate & { score: number; lead: string | null };

export function hasPlayableSource(c: Pick<FeedCandidate, "sources">): boolean {
  return c.sources.some((s) => s.playable);
}

/** 「なぜ出てきたか」 */
export function explain(
  c: FeedCandidate,
  followed: ReadonlySet<string>,
  handles: ReadonlyMap<string, string>,
): { reason: string; context: "feed" | "pitch"; pitch_id: string | null } {
  const pitch = c.pitch_matches[0];
  if (pitch) {
    const who =
      pitch.submitter_type === "artist" ? "本人推薦" : `${pitch.submitter_label ?? "目利き"} 推薦`;
    const names = pitch.matched_artist_names.slice(0, 2).join("、");
    return { reason: `${names}が好きな人へ（${who}）`, context: "pitch", pitch_id: pitch.pitch_id };
  }
  const sorted = [...c.contributions].sort((a, b) => {
    const fa = followed.has(a.curator_id) ? 1 : 0;
    const fb = followed.has(b.curator_id) ? 1 : 0;
    return fb - fa || b.contribution - a.contribution;
  });
  const lead = sorted[0];
  if (!lead) return { reason: "推薦曲", context: "feed", pitch_id: null };
  const handle = handles.get(lead.curator_id);
  const name = handle ? `@${handle}` : "目利き";
  const others = sorted.length - 1;
  if (others > 0) {
    return { reason: `${name} ほか${others}人が推薦`, context: "feed", pitch_id: null };
  }
  if (lead.mention_count > 1) {
    return { reason: `${name} が${lead.mention_count}回推薦`, context: "feed", pitch_id: null };
  }
  return { reason: `${name} が推薦`, context: "feed", pitch_id: null };
}

function toItem(c: Scored, input: BuildQueueInput, serendipity: boolean): QueueItem {
  const e = explain(c, input.followed, input.curatorHandles);
  return {
    track_id: c.track_id,
    title: c.title,
    artist_id: c.artist_id,
    artist_name: c.artist_name,
    artwork_url: c.artwork_url,
    sources: c.sources,
    reason: serendipity ? `埋もれた1曲 · ${e.reason}` : e.reason,
    context: e.context,
    pitch_id: e.pitch_id,
    score: c.score,
    tags: c.tags ?? {},
    curators: curatorShares(c, input),
    buried: serendipity,
  };
}

/** この曲を推した目利きと寄与の割合（表示と好みの学習に使う） */
function curatorShares(c: FeedCandidate, input: BuildQueueInput): NonNullable<QueueItem["curators"]> {
  const total = c.contributions.reduce((s, x) => s + x.contribution, 0);
  return [...c.contributions]
    .sort((a, b) => {
      const fa = input.followed.has(a.curator_id) ? 1 : 0;
      const fb = input.followed.has(b.curator_id) ? 1 : 0;
      return fb - fa || b.contribution - a.contribution;
    })
    .map((x) => ({
      id: x.curator_id,
      handle: input.curatorHandles.get(x.curator_id) ?? "",
      name: input.curatorNames?.get(x.curator_id) ?? input.curatorHandles.get(x.curator_id) ?? "",
      share: total > 0 ? x.contribution / total : 0,
      count: x.mention_count,
    }));
}

/** 埋もれた曲を均等な位置に差し込む位置（0始まり） */
export function serendipityPositions(total: number, slots: number): number[] {
  if (slots <= 0 || total <= 0) return [];
  const step = total / (slots + 1);
  return Array.from({ length: slots }, (_, i) => Math.min(total - 1, Math.round(step * (i + 1))));
}

export function buildQueue(
  input: BuildQueueInput,
  cfg: Pick<AppConfig, "scoring" | "queue" | "taste">,
): QueueItem[] {
  const rng = input.rng ?? Math.random;
  const { size, maxPerArtist, serendipitySlots, maxPerLeadCurator } = cfg.queue;
  const taste = input.taste ?? null;
  const tags = taste ? userTags(taste, cfg.taste) : {};
  const multiplierFor = (id: string) =>
    taste
      ? curatorMultiplier(id, { followed: input.followed, taste, followMultiplier: cfg.scoring.followMultiplier }, cfg.taste)
      : input.followed.has(id)
        ? cfg.scoring.followMultiplier
        : 1;

  const scored: Scored[] = input.candidates
    .filter((c) => !input.excludedTrackIds.has(c.track_id) && hasPlayableSource(c))
    .map((c) => {
      let h = heatWith(c.contributions, multiplierFor, cfg.scoring);
      if (h === 0 && c.pitch_matches.length > 0) h = cfg.scoring.pitchBaseHeat;
      const lead = [...c.contributions].sort((a, b) => b.contribution - a.contribution)[0]?.curator_id ?? null;
      return {
        ...c,
        lead,
        score: score(
          {
            heat: h,
            obscurity: c.obscurity,
            depth: input.depth,
            pitchMatches: c.pitch_matches.length,
            tasteMultiplier: taste ? tasteMultiplier(tags, c.tags ?? {}, taste.signals, cfg.taste) : 1,
          },
          cfg.scoring,
        ),
      };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score || a.track_id.localeCompare(b.track_id));

  const perArtist = new Map<string, number>();
  const chosen = new Set<string>();
  // 同じ目利きが先頭に立つ曲ばかりにならないようにする（好みの偏り対策）
  const perLead = new Map<string, number>();
  const canTake = (c: Scored) =>
    (perArtist.get(c.artist_id) ?? 0) < maxPerArtist &&
    (!taste || !c.lead || (perLead.get(c.lead) ?? 0) < maxPerLeadCurator);
  const take = (c: Scored) => {
    perArtist.set(c.artist_id, (perArtist.get(c.artist_id) ?? 0) + 1);
    if (c.lead) perLead.set(c.lead, (perLead.get(c.lead) ?? 0) + 1);
    chosen.add(c.track_id);
  };

  // 1) 埋もれた曲（言及が1件だけ）からランダムに選ぶ
  const pool = scored.filter((c) => c.mention_count === 1);
  const serendipity: Scored[] = [];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // 上位に既に入る曲を「埋もれた枠」で消費しないよう、先にメイン枠の上位を見積もる
  const mainTarget = Math.max(0, size - serendipitySlots);
  const projectedTop = new Set<string>();
  {
    const counts = new Map<string, number>();
    for (const c of scored) {
      if (projectedTop.size >= mainTarget) break;
      if ((counts.get(c.artist_id) ?? 0) >= maxPerArtist) continue;
      counts.set(c.artist_id, (counts.get(c.artist_id) ?? 0) + 1);
      projectedTop.add(c.track_id);
    }
  }
  for (const c of shuffled) {
    if (serendipity.length >= serendipitySlots) break;
    if (projectedTop.has(c.track_id) || !canTake(c)) continue;
    take(c);
    serendipity.push(c);
  }

  // 2) スコア上位から埋める（同一アーティスト上限つき）
  const main: Scored[] = [];
  const mainSize = size - serendipity.length;
  for (const c of scored) {
    if (main.length >= mainSize) break;
    if (chosen.has(c.track_id) || !canTake(c)) continue;
    take(c);
    main.push(c);
  }

  // 3) 埋もれた曲を均等な位置に差し込む
  const items: QueueItem[] = main.map((c) => toItem(c, input, false));
  const total = items.length + serendipity.length;
  const positions = serendipityPositions(total, serendipity.length);
  serendipity.forEach((c, i) => {
    items.splice(Math.min(positions[i], items.length), 0, toItem(c, input, true));
  });
  return items;
}

/** 1曲に複数サービスがある場合の再生先選択（7章） */
export function pickSource(
  sources: QueueSource[],
  opts: { preferred: QueueSource["service"] | null; appleAuthorized: boolean; priority: QueueSource["service"][] },
): QueueSource | null {
  const playable = sources.filter((s) => s.playable);
  if (playable.length === 0) return null;
  const order: QueueSource["service"][] = [];
  if (opts.preferred) order.push(opts.preferred);
  for (const s of opts.priority) {
    if (s === "apple" && !opts.appleAuthorized) continue;
    if (!order.includes(s)) order.push(s);
  }
  // 未認可の Apple はプレビュー再生になるため最後の候補にする
  if (!order.includes("apple")) order.push("apple");
  for (const svc of order) {
    const found = playable.find((s) => s.service === svc);
    if (found) return found;
  }
  return playable[0];
}
