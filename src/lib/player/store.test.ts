import { describe, expect, it, vi } from "vitest";
import type { QueueItem, Service } from "../types";
import { isComplete } from "./queue-logic";
import { createPlayerStore } from "./store";

const item = (id: string, service: Service, playable = true): QueueItem => ({
  track_id: id,
  title: `T${id}`,
  artist_id: "a",
  artist_name: "A",
  artwork_url: null,
  sources: [{ service, external_id: id, url: "u", embed_url: null, storefront: null, playable }],
  reason: "r",
  context: "feed",
  pitch_id: null,
});

function setup() {
  const log = vi.fn();
  const notify = vi.fn();
  const store = createPlayerStore({ log, notify });
  return { store, log, notify, s: () => store.getState() };
}

describe("player store", () => {
  it("playQueue で先頭から読み込む", () => {
    const { s } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "apple")], 0, "発見");
    expect(s()).toMatchObject({ index: 0, status: "loading", label: "発見", startedByUser: true });
    expect(s().source?.service).toBe("soundcloud");
  });

  it("ended → 次の曲へ自動で進む（startedByUser=false）", () => {
    const { s } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "soundcloud")]);
    const token = s().loadToken;
    s().next("auto");
    expect(s()).toMatchObject({ index: 1, status: "loading", startedByUser: false });
    expect(s().loadToken).toBe(token + 1);
  });

  it("次が Bandcamp ならカードを出して停止（awaiting_user）", () => {
    const { s } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "bandcamp")]);
    s().next("auto");
    expect(s()).toMatchObject({ index: 1, status: "awaiting_user" });
  });

  it("playable=false の曲は自動でスキップしトーストを出す", () => {
    const { s, notify } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "soundcloud", false), item("3", "apple")]);
    s().next("auto");
    expect(s().index).toBe(2);
    expect(notify).toHaveBeenCalledWith("「T2」は再生できないためスキップしました");
  });

  it("エラー時は自動スキップ", () => {
    const { s, notify } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "soundcloud")]);
    s().skipOnError();
    expect(s().index).toBe(1);
    expect(notify).toHaveBeenCalled();
  });

  it("最後の曲の後は finished", () => {
    const { s } = setup();
    s().playQueue([item("1", "soundcloud")]);
    s().next("auto");
    expect(s().status).toBe("finished");
  });

  it("完聴前にユーザーが次へ進むと skip を記録、完聴後は記録しない", () => {
    const { s, log } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "soundcloud"), item("3", "soundcloud")]);
    s().setStatus("playing");
    s().next("user");
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ track_id: "1", event: "skip" }));
    log.mockClear();
    s().setStatus("playing");
    s().markCompleteLogged();
    s().next("user");
    expect(log).not.toHaveBeenCalled();
  });

  it("自動送りでは skip を記録しない", () => {
    const { s, log } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "soundcloud")]);
    s().setStatus("playing");
    s().next("auto");
    expect(log).not.toHaveBeenCalled();
  });

  it("ユーザー設定のサービスを優先して再生先を選ぶ", () => {
    const { s } = setup();
    s().setPreferredService("bandcamp");
    const multi: QueueItem = {
      ...item("1", "soundcloud"),
      sources: [...item("1", "soundcloud").sources, ...item("1", "bandcamp").sources],
    };
    s().playQueue([multi]);
    expect(s().source?.service).toBe("bandcamp");
  });

  it("prev は5秒以上再生していたら同じ曲を頭から", () => {
    const { s } = setup();
    s().playQueue([item("1", "soundcloud"), item("2", "soundcloud")], 1);
    s().setProgress(10, 100);
    const token = s().loadToken;
    s().prev();
    expect(s().index).toBe(1);
    expect(s().loadToken).toBe(token + 1);
    s().prev();
    expect(s().index).toBe(0);
  });
});

describe("isComplete", () => {
  it("80%以上で完聴、Bandcamp は判定しない", () => {
    expect(isComplete("soundcloud", 79, 100, 0.8)).toBe(false);
    expect(isComplete("soundcloud", 80, 100, 0.8)).toBe(true);
    expect(isComplete("bandcamp", 100, 100, 0.8)).toBe(false);
    expect(isComplete("apple", 10, 0, 0.8)).toBe(false);
  });
});
