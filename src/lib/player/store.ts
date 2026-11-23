// 統一キューのストア（仕様書 7章）。queue / index / status を1つのストアで持つ。
// アダプターの生成・破棄は PlayerEngine（components/player/player-engine.tsx）が担う。
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { appConfig } from "../config";
import type { ListenEventType, QueueItem, QueueSource, Service } from "../types";
import { findPlayable, type PlayerStatus } from "./queue-logic";

export type EventLogger = (e: {
  track_id: string;
  event: ListenEventType;
  context: QueueItem["context"];
  pitch_id: string | null;
}) => void;

export type Notifier = (message: string) => void;

export type PlayerState = {
  queue: QueueItem[];
  index: number;
  status: PlayerStatus;
  source: QueueSource | null;
  positionSec: number;
  durationSec: number;
  /** 何から再生しているか（例: 「発見」「冬の夜に…」） */
  label: string;
  /** 読み込みのたびに増える。PlayerEngine はこれを見てアダプターを作り直す */
  loadToken: number;
  /** 現在の曲がユーザー操作で始まったか（自動送りか） */
  startedByUser: boolean;
  /** 現在の曲で play / complete を記録済みか */
  loggedPlay: boolean;
  loggedComplete: boolean;
  preferredService: Service | null;
  appleAuthorized: boolean;
  panelOpen: boolean;
  savedTrackIds: string[];
  /** 連続して再生に失敗した曲数（通信断などで全曲を飛ばし続けないための歯止め） */
  errorStreak: number;
};

export type PlayerActions = {
  playQueue(items: QueueItem[], startIndex?: number, label?: string): void;
  playAt(index: number): void;
  next(by: "user" | "auto"): void;
  prev(): void;
  setStatus(status: PlayerStatus): void;
  setProgress(positionSec: number, durationSec: number): void;
  markPlayLogged(): void;
  markCompleteLogged(): void;
  setPreferredService(s: Service | null): void;
  setAppleAuthorized(v: boolean): void;
  setPanelOpen(v: boolean): void;
  setSaved(ids: string[]): void;
  toggleSaved(trackId: string, saved: boolean): void;
  /** 好みの学習結果を反映: これから流れる曲（直近の数曲より後ろ）だけを並べ直す */
  replaceTail(items: QueueItem[]): void;
  /** エラーになった現在の曲を自動でスキップ */
  skipOnError(): void;
  reset(): void;
};

export type PlayerStore = PlayerState & PlayerActions;

const initial: PlayerState = {
  queue: [],
  index: -1,
  status: "idle",
  source: null,
  positionSec: 0,
  durationSec: 0,
  label: "",
  loadToken: 0,
  startedByUser: false,
  loggedPlay: false,
  loggedComplete: false,
  preferredService: null,
  appleAuthorized: false,
  panelOpen: false,
  savedTrackIds: [],
  errorStreak: 0,
};

export function createPlayerStore(deps: { log: EventLogger; notify: Notifier }) {
  return createStore<PlayerStore>()((set, get) => {
    const pickOpts = () => ({
      preferred: get().preferredService,
      appleAuthorized: get().appleAuthorized,
      priority: appConfig.player.servicePriority,
    });

    /** index 以降の再生可能な曲へ移動する。再生不可の曲はトーストを出してスキップ */
    const moveTo = (from: number, inclusive: boolean, byUser: boolean) => {
      const { queue } = get();
      const r = findPlayable(queue, from, pickOpts(), inclusive);
      if (r.skipped.length) {
        deps.notify(
          r.skipped.length === 1
            ? `「${r.skipped[0].title}」は再生できないためスキップしました`
            : `再生できない${r.skipped.length}曲をスキップしました`,
        );
      }
      if (r.index < 0) {
        set({ status: "finished", source: null, positionSec: 0, durationSec: 0 });
        return;
      }
      set((s) => ({
        index: r.index,
        source: r.source,
        status: r.source!.service === "bandcamp" ? "awaiting_user" : "loading",
        positionSec: 0,
        durationSec: 0,
        loadToken: s.loadToken + 1,
        startedByUser: byUser,
        loggedPlay: false,
        loggedComplete: false,
      }));
    };

    /** ユーザーが完聴前に次へ進んだらスキップとして記録 */
    const logSkipIfNeeded = () => {
      const s = get();
      const cur = s.queue[s.index];
      if (!cur || s.loggedComplete) return;
      if (s.status === "finished" || s.status === "idle") return;
      deps.log({ track_id: cur.track_id, event: "skip", context: cur.context, pitch_id: cur.pitch_id });
    };

    return {
      ...initial,
      playQueue(items, startIndex = 0, label = "") {
        logSkipIfNeeded();
        set({ queue: items, label, index: -1 });
        moveTo(startIndex, true, true);
      },
      playAt(index) {
        if (index === get().index) return;
        logSkipIfNeeded();
        moveTo(index, true, true);
      },
      next(by) {
        if (by === "user") logSkipIfNeeded();
        moveTo(get().index, false, by === "user");
      },
      prev() {
        const { index, positionSec } = get();
        if (positionSec > 5 || index <= 0) {
          moveTo(index, true, true);
          return;
        }
        logSkipIfNeeded();
        // 前方向は再生可能な曲を後ろから探す
        for (let i = index - 1; i >= 0; i--) {
          const r = findPlayable(get().queue, i, pickOpts(), true);
          if (r.index === i) {
            moveTo(i, true, true);
            return;
          }
        }
      },
      setStatus(status) {
        set(status === "playing" ? { status, errorStreak: 0 } : { status });
      },
      setProgress(positionSec, durationSec) {
        set({ positionSec, durationSec });
      },
      markPlayLogged() {
        set({ loggedPlay: true });
      },
      markCompleteLogged() {
        set({ loggedComplete: true });
      },
      setPreferredService(preferredService) {
        set({ preferredService });
      },
      setAppleAuthorized(appleAuthorized) {
        set({ appleAuthorized });
      },
      setPanelOpen(panelOpen) {
        set({ panelOpen });
      },
      setSaved(savedTrackIds) {
        set({ savedTrackIds });
      },
      toggleSaved(trackId, saved) {
        set((s) => ({
          savedTrackIds: saved
            ? [...new Set([...s.savedTrackIds, trackId])]
            : s.savedTrackIds.filter((id) => id !== trackId),
        }));
      },
      replaceTail(items) {
        const { queue, index } = get();
        if (index < 0) return;
        const head = queue.slice(0, index + 1 + appConfig.queue.rerankKeepNext);
        const seen = new Set(head.map((q) => q.track_id));
        set({ queue: [...head, ...items.filter((i) => !seen.has(i.track_id))] });
      },
      skipOnError() {
        const cur = get().queue[get().index];
        const streak = get().errorStreak + 1;
        if (streak >= 3) {
          // 3曲続けて失敗したら止める（通信状況などの問題）
          set({ status: "error", errorStreak: 0 });
          deps.notify("再生できませんでした。通信状況を確認してください");
          return;
        }
        set({ errorStreak: streak });
        if (cur) deps.notify(`「${cur.title}」を再生できなかったためスキップしました`);
        moveTo(get().index, false, false);
      },
      reset() {
        set({ ...initial });
      },
    };
  });
}

type StoreApi = ReturnType<typeof createPlayerStore>;
let store: StoreApi | null = null;
let deps: { log: EventLogger; notify: Notifier } = { log: () => {}, notify: () => {} };

/** 依存（イベント記録・トースト）を差し替えて、アプリ全体で1つのストアを返す */
export function initPlayerStore(d: { log: EventLogger; notify: Notifier }): StoreApi {
  deps = d;
  return getPlayerStore();
}

export function getPlayerStore(): StoreApi {
  if (!store) {
    store = createPlayerStore({ log: (e) => deps.log(e), notify: (m) => deps.notify(m) });
  }
  return store;
}

export function usePlayer<T>(selector: (s: PlayerStore) => T): T {
  return useStore(getPlayerStore(), selector);
}

export function currentItem(s: PlayerState): QueueItem | null {
  return s.queue[s.index] ?? null;
}
