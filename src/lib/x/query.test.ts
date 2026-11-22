import { describe, expect, it } from "vitest";
import { buildQuery, groupHandles, maxPostId } from "./query";

const domains = ["music.apple.com", "soundcloud.com", "bandcamp.com"];

describe("buildQuery", () => {
  it("仕様の形式でクエリを組み立てる", () => {
    expect(buildQuery(["a", "b"], domains)).toBe(
      '(from:a OR from:b) (url:"music.apple.com" OR url:"soundcloud.com" OR url:"bandcamp.com") -is:retweet',
    );
  });
});

describe("groupHandles", () => {
  it("すべてのグループが上限以内で、ハンドルの欠落・重複がない", () => {
    const handles = Array.from({ length: 200 }, (_, i) => `digger_${i}`);
    const groups = groupHandles(handles, domains, 512);
    expect(groups.length).toBeGreaterThan(1);
    for (const g of groups) expect(buildQuery(g, domains).length).toBeLessThanOrEqual(512);
    expect(groups.flat()).toEqual(handles);
  });
  it("@ を外す", () => {
    expect(groupHandles(["@a"], domains, 512)).toEqual([["a"]]);
  });
  it("上限が小さすぎると例外", () => {
    expect(() => groupHandles(["a"], domains, 20)).toThrow();
  });
});

describe("maxPostId", () => {
  it("桁数の多いIDも数値として比較", () => {
    expect(maxPostId("999", "1000")).toBe("1000");
    expect(maxPostId(null, "5")).toBe("5");
    expect(maxPostId("1863000000000000001", "1863000000000000000")).toBe("1863000000000000001");
  });
});
