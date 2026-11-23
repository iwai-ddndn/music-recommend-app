import { describe, expect, it } from "vitest";
import { appConfig } from "../config";
import {
  applyEvent,
  cosine,
  curatorMultiplier,
  curatorProfile,
  decayTaste,
  emptyTaste,
  mergeTaste,
  resolveTrackTags,
  seedTaste,
  suggestCurators,
  tasteMultiplier,
  userTags,
} from "./taste";

const cfg = appConfig.taste;
const now = new Date("2026-11-23T00:00:00Z");

describe("tasteMultiplier", () => {
  it("好みが空なら 1（仕様書の式のまま）", () => {
    expect(tasteMultiplier({}, { ambient: 1 }, 0, cfg)).toBe(1);
    expect(tasteMultiplier({ ambient: 1 }, { ambient: 1 }, 0, cfg)).toBe(1);
  });
  it("完全一致・十分なシグナルで上限 1 + boostMax", () => {
    expect(tasteMultiplier({ ambient: 1 }, { ambient: 1 }, 99, cfg)).toBeCloseTo(1 + cfg.boostMax);
  });
  it("一致しない曲は 1 のまま（減点はしない）", () => {
    expect(tasteMultiplier({ ambient: 1 }, { folk: 1 }, 99, cfg)).toBe(1);
    expect(tasteMultiplier({ ambient: -1 }, { ambient: 1 }, 99, cfg)).toBe(1);
  });
  it("シグナルが少ないうちは控えめ", () => {
    const few = tasteMultiplier({ ambient: 1 }, { ambient: 1 }, 1, cfg);
    const many = tasteMultiplier({ ambient: 1 }, { ambient: 1 }, 5, cfg);
    expect(few).toBeGreaterThan(1);
    expect(few).toBeLessThan(many);
  });
});

describe("seedTaste / userTags", () => {
  it("シーンとアンカーアーティストから好みを作る", () => {
    const t = seedTaste(emptyTaste(), { scenes: ["ambient", "folk"], anchors: [{ folk: 1, "indie-pop": 1 }] }, cfg, now);
    expect(t.seeds.ambient).toBe(1);
    expect(t.seeds.folk).toBeCloseTo(1 + 0.7 * 0.5);
    expect(t.seeds["indie-pop"]).toBeCloseTo(0.35);
    expect(t.signals).toBe(3);
  });
  it("選んだタグは何度スキップしても下限を割らない", () => {
    let t = seedTaste(emptyTaste(), { scenes: ["ambient"], anchors: [] }, cfg, now);
    for (let i = 0; i < 30; i++) {
      t = applyEvent(t, { kind: "skip", positionSec: 2, trackTags: { ambient: 1 }, curatorShares: [] }, cfg, now);
    }
    expect(userTags(t, cfg).ambient).toBe(cfg.seedFloor);
  });
});

describe("applyEvent", () => {
  const e = { trackTags: { ambient: 3, folk: 1 }, curatorShares: [{ id: "c1", share: 0.75 }, { id: "c2", share: 0.25 }] };
  it("保存 > 完聴 > 0 > 遅いスキップ > 早いスキップ", () => {
    const v = (kind: "save" | "complete" | "skip", positionSec?: number) =>
      applyEvent(emptyTaste(), { ...e, kind, positionSec }, cfg, now).learned.ambient;
    expect(v("save")).toBeGreaterThan(v("complete"));
    expect(v("complete")).toBeGreaterThan(0);
    expect(v("skip", 20)).toBeLessThan(0);
    expect(v("skip", 3)).toBeLessThan(v("skip", 20));
  });
  it("タグは曲のタグの割合で、目利きは寄与の割合で配分する", () => {
    const t = applyEvent(emptyTaste(), { ...e, kind: "save" }, cfg, now);
    expect(t.learned.ambient).toBeCloseTo(0.5 * 0.75);
    expect(t.learned.folk).toBeCloseTo(0.5 * 0.25);
    expect(t.curators.c1).toBeCloseTo(0.3 * 0.75);
    expect(t.signals).toBe(1);
  });
  it("上限・下限でクランプする", () => {
    let t = emptyTaste();
    for (let i = 0; i < 100; i++) t = applyEvent(t, { kind: "save", trackTags: { ambient: 1 }, curatorShares: [{ id: "c", share: 1 }] }, cfg, now);
    expect(t.learned.ambient).toBeLessThanOrEqual(cfg.tagMax);
    expect(t.curators.c).toBeLessThanOrEqual(1);
  });
});

describe("curatorMultiplier", () => {
  const base = { followed: new Set<string>(), taste: emptyTaste(), followMultiplier: 3 };
  it("フォロー中 3 > 仮フォロー 1.8 > 相性（0.5〜2）", () => {
    expect(curatorMultiplier("c", { ...base, followed: new Set(["c"]) }, cfg)).toBe(3);
    expect(curatorMultiplier("c", { ...base, taste: { ...emptyTaste(), softFollows: ["c"] } }, cfg)).toBe(1.8);
    expect(curatorMultiplier("c", base, cfg)).toBe(1);
    expect(curatorMultiplier("c", { ...base, taste: { ...emptyTaste(), curators: { c: 0.4 } } }, cfg)).toBeCloseTo(1.4);
    expect(curatorMultiplier("c", { ...base, taste: { ...emptyTaste(), curators: { c: -1 } } }, cfg)).toBe(0.5);
  });
});

describe("suggestCurators", () => {
  it("好みに近い順。一致しない目利きは選ばない", () => {
    const profiles: { id: string; tags: Record<string, number> }[] = [
      { id: "amb", tags: { ambient: 0.9, electronic: 0.1 } },
      { id: "mix", tags: { ambient: 0.5, folk: 0.5 } },
      { id: "shoe", tags: { shoegaze: 1 } },
    ];
    expect(suggestCurators({ ambient: 1 }, profiles, 3)).toEqual(["amb", "mix"]);
    expect(suggestCurators({ ambient: 1 }, profiles, 3, new Set(["amb"]))).toEqual(["mix"]);
  });
});

describe("mergeTaste / decayTaste", () => {
  it("ログイン時の統合: seeds は最大、学習分は合算、仮フォローは和集合", () => {
    const a = { ...emptyTaste(), seeds: { folk: 1 }, learned: { folk: 0.2 }, softFollows: ["x"], signals: 2 };
    const b = { ...emptyTaste(), seeds: { folk: 0.5, ambient: 1 }, learned: { folk: 0.3 }, softFollows: ["y"], signals: 3 };
    const m = mergeTaste(a, b, cfg);
    expect(m.seeds).toEqual({ folk: 1, ambient: 1 });
    expect(m.learned.folk).toBeCloseTo(0.5);
    expect(m.softFollows.sort()).toEqual(["x", "y"]);
    expect(m.signals).toBe(5);
  });
  it("学習分は30日で半減し、選んだ好みは残る", () => {
    const t = { ...emptyTaste(), seeds: { folk: 1 }, learned: { folk: 0.4 }, updatedAt: "2026-10-24T00:00:00Z" };
    const d = decayTaste(t, now, cfg);
    expect(d.learned.folk).toBeCloseTo(0.2);
    expect(d.seeds.folk).toBe(1);
  });
});

describe("curatorProfile / resolveTrackTags", () => {
  it("言及が少ない目利きは全体平均に寄せる", () => {
    const global = { ambient: 0.5, folk: 0.5 };
    const few = curatorProfile([{ ambient: 1 }], global, cfg);
    const many = curatorProfile(Array.from({ length: 50 }, () => ({ ambient: 1 })), global, cfg);
    expect(few.folk).toBeGreaterThan(many.folk);
    expect(many.ambient).toBeGreaterThan(0.9);
  });
  it("アーティストのタグが無い曲は、推した目利きのプロフィールで補う", () => {
    expect(resolveTrackTags({ folk: 2 }, [], cfg)).toEqual({ folk: 1 });
    const r = resolveTrackTags(null, [{ profile: { ambient: 1 }, weight: 3 }, { profile: { folk: 1 }, weight: 1 }], cfg);
    expect(r.ambient).toBeCloseTo(0.75);
  });
  it("cosine", () => {
    expect(cosine({ a: 1 }, { a: 2 })).toBeCloseTo(1);
    expect(cosine({ a: 1 }, {})).toBe(0);
  });
});
