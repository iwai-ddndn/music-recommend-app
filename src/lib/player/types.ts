// 仕様書 7章の共通インターフェース。3サービスの差はアダプターで吸収する。
import type { QueueSource, Service } from "../types";

export type TrackSource = QueueSource;
export type AdapterState = "loading" | "playing" | "paused" | "ended" | "error";

export interface PlayerAdapter {
  service: Service;
  /** 曲終わりを検知できるか */
  canAutoAdvance: boolean;
  load(source: TrackSource): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek?(seconds: number): Promise<void>;
  onStateChange(cb: (s: AdapterState) => void): void;
  onProgress?(cb: (positionSec: number, durationSec: number) => void): void;
  destroy(): void;
}

export type AdapterFactoryContext = {
  /** iframe を置くコンテナ（常駐する再生パネル内） */
  container: HTMLElement;
  /** fixtures モード等で実際の埋め込みを使わずに再生を模擬する */
  simulate: boolean;
};
