import { describe, expect, it } from "vitest";
import { appConfig } from "../config";
import {
  curatorContributions,
  heat,
  obscurity,
  pitchBoost,
  recencyDecay,
  repeatFactor,
  score,
} from "./score";

const cfg = appConfig.scoring;
const now = new Date("2026-11-22T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

describe("repeatFactor: 繰り返しの頭打ち", () => {
  it("1回=1、2回=1.25、5回=2、それ以上も2で頭打ち", () => {
    expect(repeatFactor(1, cfg)).toBe(1);
    expect(repeatFactor(2, cfg)).toBe(1.25);
    expect(repeatFactor(5, cfg)).toBe(2);
    expect(repeatFactor(50, cfg)).toBe(2);
  });
  it("0回は寄与なし", () => {
    expect(repeatFactor(0, cfg)).toBe(0);
  });
});

describe("recencyDecay: 30日で半減", () => {
  it("0日=1、30日=0.5、60日=0.25", () => {
    expect(recencyDecay(0, cfg)).toBe(1);
    expect(recencyDecay(30, cfg)).toBeCloseTo(0.5);
    expect(recencyDecay(60, cfg)).toBeCloseTo(0.25);
  });
  it("未来日時は0日扱い", () => {
    expect(recencyDecay(-3, cfg)).toBe(1);
  });
});

describe("obscurity: リスナー数が多いほど下がる", () => {
  it("null と 0 は 1（無名）", () => {
    expect(obscurity(null, cfg)).toBe(1);
    expect(obscurity(0, cfg)).toBe(1);
  });
  it("単調減少", () => {
    const values = [0, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000].map((l) =>
      obscurity(l, cfg),
    );
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
  });
  it("L=90,000 のとき 1/(1+log10(10)) = 0.5", () => {
    expect(obscurity(90_000, cfg)).toBeCloseTo(0.5);
  });
});

describe("curatorContributions", () => {
  it("目利きごとに回数と最新日時でまとめる", () => {
    const contribs = curatorContributions(
      [
        { curator_id: "a", posted_at: daysAgo(40) },
        { curator_id: "a", posted_at: daysAgo(0) },
        { curator_id: "b", posted_at: daysAgo(30) },
      ],
      new Map([["a", 2]]),
      now,
      cfg,
    );
    expect(contribs).toEqual([
      { curator_id: "a", contribution: 2 * 1.25 * 1, mention_count: 2 },
      { curator_id: "b", contribution: expect.closeTo(0.5), mention_count: 1 },
    ]);
  });
});

describe("heat", () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      curator_id: `c${i}`,
      contribution: 1,
      mention_count: 1,
    }));

  it("6人目以降は加点しない", () => {
    expect(heat(mk(5), new Set(), cfg)).toBe(5);
    expect(heat(mk(6), new Set(), cfg)).toBe(5);
    expect(heat(mk(20), new Set(), cfg)).toBe(5);
  });

  it("フォロー中の目利きは3倍", () => {
    expect(heat(mk(1), new Set(["c0"]), cfg)).toBe(3);
  });

  it("フォロー倍率を掛けた後の寄与で上位5人を選ぶ", () => {
    const contribs = [
      ...mk(5).map((c) => ({ ...c, contribution: 1 })),
      { curator_id: "small", contribution: 0.5, mention_count: 1 },
    ];
    // フォロー無し: 上位5人は 1×5 = 5
    expect(heat(contribs, new Set(), cfg)).toBe(5);
    // small をフォロー: 0.5×3=1.5 が上位に入り 1.5+1×4 = 5.5
    expect(heat(contribs, new Set(["small"]), cfg)).toBe(5.5);
  });

  it("同じ目利きが何度推しても2倍で頭打ち（他の目利き1人分の2倍まで）", () => {
    const many = curatorContributions(
      Array.from({ length: 30 }, () => ({ curator_id: "x", posted_at: daysAgo(0) })),
      new Map(),
      now,
      cfg,
    );
    expect(heat(many, new Set(), cfg)).toBe(2);
  });
});

describe("pitchBoost", () => {
  it("一致1件につき0.5、上限1.5", () => {
    expect(pitchBoost(0, cfg)).toBe(0);
    expect(pitchBoost(1, cfg)).toBe(0.5);
    expect(pitchBoost(3, cfg)).toBe(1.5);
    expect(pitchBoost(10, cfg)).toBe(1.5);
  });
});

describe("score", () => {
  it("深さ0では人気度を無視する", () => {
    const a = score({ heat: 2, obscurity: obscurity(0, cfg), depth: 0, pitchMatches: 0 }, cfg);
    const b = score(
      { heat: 2, obscurity: obscurity(5_000_000, cfg), depth: 0, pitchMatches: 0 },
      cfg,
    );
    expect(a).toBe(b);
  });

  it("深さが大きいほど人気曲を強く割り引く", () => {
    const o = obscurity(1_000_000, cfg);
    const shallow = score({ heat: 1, obscurity: o, depth: 0.2, pitchMatches: 0 }, cfg);
    const deep = score({ heat: 1, obscurity: o, depth: 1, pitchMatches: 0 }, cfg);
    expect(deep).toBeLessThan(shallow);
  });

  it("同じ熱量ならリスナー数が多いほどスコアが下がる", () => {
    const s = (l: number) =>
      score({ heat: 1, obscurity: obscurity(l, cfg), depth: 0.5, pitchMatches: 0 }, cfg);
    expect(s(100)).toBeGreaterThan(s(100_000));
    expect(s(100_000)).toBeGreaterThan(s(10_000_000));
  });

  it("推薦一致で (1 + pitchBoost) 倍", () => {
    expect(score({ heat: 1, obscurity: 1, depth: 0.5, pitchMatches: 2 }, cfg)).toBe(2);
  });

  it("深さが範囲外ならクランプする", () => {
    const o = obscurity(1_000_000, cfg);
    expect(score({ heat: 1, obscurity: o, depth: 5, pitchMatches: 0 }, cfg)).toBe(
      score({ heat: 1, obscurity: o, depth: 1, pitchMatches: 0 }, cfg),
    );
  });
});
