// Apple Music: MusicKit on the Web (v3)。デベロッパートークンはサーバーで発行して渡す。
// 未認可（サブスクなし）ならプレビュー再生になる。
// PlaybackStates: none 0, loading 1, playing 2, paused 3, stopped 4, ended 5, seeking 6,
//                 waiting 8, stalled 9, completed 10
import type { AdapterState, PlayerAdapter, TrackSource } from "../types";
import { loadScript, withTimeout } from "./load-script";

type MusicKitInstance = {
  isAuthorized: boolean;
  previewOnly?: boolean;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  setQueue(o: { song: string; startPlaying?: boolean }): Promise<unknown>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seekToTime(sec: number): Promise<void>;
  addEventListener(name: string, cb: (e: { state?: number }) => void): void;
  removeEventListener(name: string, cb: (e: { state?: number }) => void): void;
};

declare global {
  interface Window {
    MusicKit?: {
      configure(o: { developerToken: string; app: { name: string; build: string } }): Promise<MusicKitInstance>;
      getInstance(): MusicKitInstance;
    };
  }
}

const SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
let instance: Promise<MusicKitInstance> | null = null;

export async function getMusicKit(): Promise<MusicKitInstance> {
  if (!instance) {
    instance = (async () => {
      const res = await fetch("/api/apple/token");
      const { token } = (await res.json()) as { token: string | null };
      if (!token) throw new Error("apple_not_configured");
      await withTimeout(loadScript(SRC, () => Boolean(window.MusicKit), "musickitloaded"), 15000, "musickit_timeout");
      return window.MusicKit!.configure({ developerToken: token, app: { name: "minor-track-player", build: "0.1" } });
    })().catch((e) => {
      instance = null;
      throw e;
    });
  }
  return instance;
}

/** Apple Music に接続（認可）。成功すればフル再生できる */
export async function authorizeAppleMusic(): Promise<boolean> {
  const mk = await getMusicKit();
  await mk.authorize();
  return mk.isAuthorized;
}

export async function isAppleAuthorized(): Promise<boolean> {
  if (!instance) return false;
  try {
    return (await instance).isAuthorized;
  } catch {
    return false;
  }
}

function mapState(n: number | undefined): AdapterState | null {
  switch (n) {
    case 1:
    case 6:
    case 8:
    case 9:
      return "loading";
    case 2:
      return "playing";
    case 3:
    case 4:
      return "paused";
    case 5:
    case 10:
      return "ended";
    default:
      return null;
  }
}

export class AppleMusicAdapter implements PlayerAdapter {
  readonly service = "apple" as const;
  readonly canAutoAdvance = true;
  private mk: MusicKitInstance | null = null;
  private stateCb: (s: AdapterState) => void = () => {};
  private progressCb: (p: number, d: number) => void = () => {};
  private ended = false;
  private onState = (e: { state?: number }) => {
    const s = mapState(e.state);
    if (!s) return;
    if (s === "ended") {
      if (this.ended) return;
      this.ended = true;
    }
    this.stateCb(s);
  };
  private onTime = () => {
    if (this.mk) this.progressCb(this.mk.currentPlaybackTime, this.mk.currentPlaybackDuration);
  };
  private onError = () => this.stateCb("error");

  async load(source: TrackSource) {
    this.stateCb("loading");
    const mk = await getMusicKit();
    this.mk = mk;
    mk.addEventListener("playbackStateDidChange", this.onState);
    mk.addEventListener("playbackTimeDidChange", this.onTime);
    mk.addEventListener("mediaPlaybackError", this.onError);
    await mk.setQueue({ song: source.external_id });
    this.stateCb("paused");
  }

  async play() {
    await this.mk?.play();
  }

  async pause() {
    this.mk?.pause();
  }

  async seek(seconds: number) {
    await this.mk?.seekToTime(seconds);
  }

  onStateChange(cb: (s: AdapterState) => void) {
    this.stateCb = cb;
  }

  onProgress(cb: (p: number, d: number) => void) {
    this.progressCb = cb;
  }

  destroy() {
    if (!this.mk) return;
    this.mk.removeEventListener("playbackStateDidChange", this.onState);
    this.mk.removeEventListener("playbackTimeDidChange", this.onTime);
    this.mk.removeEventListener("mediaPlaybackError", this.onError);
    try {
      this.mk.stop();
    } catch {
      /* noop */
    }
    this.mk = null;
  }
}
