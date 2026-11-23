import { describe, expect, it } from "vitest";
import { appConfig } from "../config";
import { buildQueue, explain, pickSource, serendipityPositions, type FeedCandidate } from "./build-queue";

const src = (service: "apple" | "soundcloud" | "bandcamp", playable = true) => ({
  service,
  external_id: `${service}-x`,
  url: `https://example/${service}`,
  embed_url: null,
  storefront: null,
  playable,
});

function cand(i: number, over: Partial<FeedCandidate> = {}): FeedCandidate {
  return {
    track_id: `t${String(i).padStart(3, "0")}`,
    title: `Track ${i}`,
    artist_id: `a${i}`,
    artist_name: `Artist ${i}`,
    artwork_url: null,
    sources: [src("soundcloud")],
    contributions: [{ curator_id: "c1", contribution: 100 - i, mention_count: 2 }],
    obscurity: 1,
    mention_count: 2,
    pitch_matches: [],
    ...over,
  };
}

const base = {
  followed: new Set<string>(),
  depth: 0.5,
  excludedTrackIds: new Set<string>(),
  curatorHandles: new Map([["c1", "digger"], ["c2", "label"]]),
  rng: () => 0,
};

describe("buildQueue", () => {
  it("最大30曲、スコア順", () => {
    const q = buildQueue({ ...base, candidates: Array.from({ length: 50 }, (_, i) => cand(i)) }, appConfig);
    expect(q).toHaveLength(30);
    expect(q[0].track_id).toBe("t000");
  });

  it("同じアーティストは2曲まで", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => cand(i, { artist_id: "same" }));
    const q = buildQueue({ ...base, candidates }, appConfig);
    expect(q).toHaveLength(2);
  });

  it("過去30日に完聴・スキップした曲を除外する", () => {
    const q = buildQueue(
      { ...base, candidates: [cand(0), cand(1)], excludedTrackIds: new Set(["t000"]) },
      appConfig,
    );
    expect(q.map((x) => x.track_id)).toEqual(["t001"]);
  });

  it("再生可能なソースが無い曲は除外する", () => {
    const q = buildQueue(
      { ...base, candidates: [cand(0, { sources: [src("soundcloud", false)] }), cand(1)] },
      appConfig,
    );
    expect(q.map((x) => x.track_id)).toEqual(["t001"]);
  });

  it("30曲のうち3曲は言及1件の曲から選び、均等な位置に入れる", () => {
    const popular = Array.from({ length: 40 }, (_, i) => cand(i));
    const buried = Array.from({ length: 10 }, (_, i) =>
      cand(100 + i, {
        mention_count: 1,
        contributions: [{ curator_id: "c2", contribution: 0.01, mention_count: 1 }],
      }),
    );
    const q = buildQueue({ ...base, candidates: [...popular, ...buried] }, appConfig);
    expect(q).toHaveLength(30);
    const buriedIdx = q.flatMap((x, i) => (x.reason.startsWith("埋もれた1曲") ? [i] : []));
    expect(buriedIdx).toHaveLength(3);
    expect(buriedIdx).toEqual(serendipityPositions(30, 3));
    for (const i of buriedIdx) expect(Number(q[i].track_id.slice(1))).toBeGreaterThanOrEqual(100);
  });

  it("埋もれた曲が足りなければ上位曲で埋める", () => {
    const q = buildQueue({ ...base, candidates: Array.from({ length: 40 }, (_, i) => cand(i)) }, appConfig);
    expect(q.filter((x) => x.reason.startsWith("埋もれた1曲"))).toHaveLength(0);
    expect(q).toHaveLength(30);
  });

  it("フォロー中の目利きの曲が上がる", () => {
    const a = cand(0, { contributions: [{ curator_id: "c1", contribution: 1, mention_count: 1 }] });
    const b = cand(1, { contributions: [{ curator_id: "c2", contribution: 2, mention_count: 1 }] });
    expect(buildQueue({ ...base, candidates: [a, b] }, appConfig)[0].track_id).toBe("t001");
    expect(
      buildQueue({ ...base, candidates: [a, b], followed: new Set(["c1"]) }, appConfig)[0].track_id,
    ).toBe("t000");
  });

  it("深さを上げると人気曲が下がる", () => {
    const popular = cand(0, { obscurity: 0.3, contributions: [{ curator_id: "c1", contribution: 1.2, mention_count: 2 }] });
    const minor = cand(1, { obscurity: 1, contributions: [{ curator_id: "c1", contribution: 1, mention_count: 2 }] });
    expect(buildQueue({ ...base, depth: 0, candidates: [popular, minor] }, appConfig)[0].track_id).toBe("t000");
    expect(buildQueue({ ...base, depth: 1, candidates: [popular, minor] }, appConfig)[0].track_id).toBe("t001");
  });

  it("言及の無い推薦曲も、好きなアーティスト一致があればキューに入る", () => {
    const pitched = cand(5, {
      contributions: [],
      mention_count: 0,
      pitch_matches: [
        { pitch_id: "p1", matched_artist_names: ["Foo"], submitter_type: "artist", submitter_label: null },
      ],
    });
    const q = buildQueue({ ...base, candidates: [pitched] }, appConfig);
    expect(q[0]).toMatchObject({ track_id: "t005", context: "pitch", pitch_id: "p1", reason: "Fooが好きな人へ（本人推薦）" });
  });
});

describe("buildQueue: 好み（コールドスタート対策）", () => {
  const taste = { seeds: { ambient: 1 }, learned: {}, curators: {}, softFollows: [], signals: 5, updatedAt: null };
  const a = cand(0, { tags: { folk: 1 }, contributions: [{ curator_id: "c1", contribution: 2, mention_count: 1 }] });
  const b = cand(1, { tags: { ambient: 1 }, contributions: [{ curator_id: "c2", contribution: 1, mention_count: 1 }] });

  it("好みが無ければ仕様書の式のまま", () => {
    expect(buildQueue({ ...base, candidates: [a, b] }, appConfig)[0].track_id).toBe("t000");
    expect(buildQueue({ ...base, candidates: [a, b], taste: { ...taste, seeds: {}, signals: 0 } }, appConfig)[0].track_id).toBe("t000");
  });

  it("好みに合う曲が上がる（上限つきの倍率）", () => {
    const q = buildQueue({ ...base, candidates: [a, b], taste }, appConfig);
    expect(q[0].track_id).toBe("t001");
    expect(q[0].score).toBeCloseTo(1 * (1 + appConfig.taste.boostMax));
  });

  it("目利きの言及が無い曲は、好みに合っていても出てこない", () => {
    const orphan = cand(2, { tags: { ambient: 1 }, contributions: [], mention_count: 0 });
    expect(buildQueue({ ...base, candidates: [orphan], taste }, appConfig)).toHaveLength(0);
  });

  it("仮フォローの目利きは 1.8 倍、本フォローは 3 倍", () => {
    const soft = buildQueue({ ...base, candidates: [a, b], taste: { ...taste, seeds: {}, softFollows: ["c2"] } }, appConfig);
    expect(soft.find((x) => x.track_id === "t001")!.score).toBeCloseTo(1.8);
    const hard = buildQueue({ ...base, candidates: [a, b], followed: new Set(["c2"]), taste: { ...taste, seeds: {}, softFollows: ["c2"] } }, appConfig);
    expect(hard.find((x) => x.track_id === "t001")!.score).toBeCloseTo(3);
  });

  it("同じ目利きが先頭に立つ曲は1キュー4曲まで", () => {
    const many = Array.from({ length: 10 }, (_, i) => cand(i, { tags: { ambient: 1 } }));
    expect(buildQueue({ ...base, candidates: many, taste }, appConfig)).toHaveLength(appConfig.queue.maxPerLeadCurator);
  });

  it("学習用に曲のタグと目利きの寄与割合を返す", () => {
    const q = buildQueue({ ...base, candidates: [b], taste }, appConfig);
    expect(q[0].tags).toEqual({ ambient: 1 });
    expect(q[0].curators).toEqual([{ id: "c2", handle: "label", name: "label", share: 1, count: 1 }]);
  });
});

describe("explain", () => {
  it("複数回の推薦", () => {
    expect(explain(cand(0, { contributions: [{ curator_id: "c1", contribution: 1, mention_count: 3 }] }), new Set(), base.curatorHandles).reason).toBe("@digger が3回推薦");
  });
  it("複数の目利き。フォロー中を先頭にする", () => {
    const c = cand(0, {
      contributions: [
        { curator_id: "c1", contribution: 5, mention_count: 1 },
        { curator_id: "c2", contribution: 1, mention_count: 1 },
      ],
    });
    expect(explain(c, new Set(), base.curatorHandles).reason).toBe("@digger ほか1人が推薦");
    expect(explain(c, new Set(["c2"]), base.curatorHandles).reason).toBe("@label ほか1人が推薦");
  });
});

describe("pickSource", () => {
  const priority = appConfig.player.servicePriority;
  const all = [src("bandcamp"), src("soundcloud"), src("apple")];
  it("ユーザー設定が最優先", () => {
    expect(pickSource(all, { preferred: "bandcamp", appleAuthorized: true, priority })?.service).toBe("bandcamp");
  });
  it("Apple 認可済みなら Apple", () => {
    expect(pickSource(all, { preferred: null, appleAuthorized: true, priority })?.service).toBe("apple");
  });
  it("Apple 未認可なら SoundCloud → Bandcamp → Apple（プレビュー）", () => {
    expect(pickSource(all, { preferred: null, appleAuthorized: false, priority })?.service).toBe("soundcloud");
    expect(pickSource([src("apple"), src("bandcamp")], { preferred: null, appleAuthorized: false, priority })?.service).toBe("bandcamp");
    expect(pickSource([src("apple")], { preferred: null, appleAuthorized: false, priority })?.service).toBe("apple");
  });
  it("再生不可のソースは選ばない", () => {
    expect(pickSource([src("soundcloud", false)], { preferred: null, appleAuthorized: false, priority })).toBeNull();
  });
});
