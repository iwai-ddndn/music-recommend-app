// SoundCloud: 埋め込みウィジェット(iframe)を HTML5 Widget API で操作する。APIキー不要。
// Widget API: SC.Widget(iframe)、イベントは SC.Widget.Events.*、getter はコールバック形式、seekTo はミリ秒。
import type { AdapterState, PlayerAdapter, TrackSource } from "../types";
import { loadScript, withTimeout } from "./load-script";

type Widget = {
  bind(event: string, cb: (e?: { currentPosition?: number; relativePosition?: number }) => void): void;
  unbind(event: string): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  getDuration(cb: (ms: number) => void): void;
};
type SCGlobal = {
  Widget: ((el: HTMLIFrameElement) => Widget) & {
    Events: Record<"READY" | "PLAY" | "PAUSE" | "FINISH" | "PLAY_PROGRESS" | "ERROR", string>;
  };
};

declare global {
  interface Window {
    SC?: SCGlobal;
  }
}

const API = "https://w.soundcloud.com/player/api.js";

function widgetSrc(source: TrackSource): string {
  if (source.embed_url) return source.embed_url;
  const p = new URLSearchParams({ url: source.url, auto_play: "false", visual: "false", show_comments: "false" });
  return `https://w.soundcloud.com/player/?${p}`;
}

export class SoundCloudAdapter implements PlayerAdapter {
  readonly service = "soundcloud" as const;
  readonly canAutoAdvance = true;
  private iframe: HTMLIFrameElement | null = null;
  private widget: Widget | null = null;
  private stateCb: (s: AdapterState) => void = () => {};
  private progressCb: (p: number, d: number) => void = () => {};
  private durationSec = 0;

  constructor(private container: HTMLElement) {}

  async load(source: TrackSource) {
    this.stateCb("loading");
    await loadScript(API, () => Boolean(window.SC?.Widget));
    const SC = window.SC!;
    const iframe = document.createElement("iframe");
    iframe.src = widgetSrc(source);
    iframe.allow = "autoplay; encrypted-media";
    iframe.title = "SoundCloud player";
    iframe.className = "w-full h-[166px] border-0 rounded-lg";
    this.container.appendChild(iframe);
    this.iframe = iframe;
    const widget = SC.Widget(iframe);
    this.widget = widget;
    const E = SC.Widget.Events;
    await withTimeout(
      new Promise<void>((resolve) => widget.bind(E.READY, () => resolve())),
      15000,
      "soundcloud_ready_timeout",
    );
    widget.getDuration((ms) => (this.durationSec = ms / 1000));
    widget.bind(E.PLAY, () => this.stateCb("playing"));
    widget.bind(E.PAUSE, () => this.stateCb("paused"));
    widget.bind(E.FINISH, () => this.stateCb("ended"));
    widget.bind(E.ERROR, () => this.stateCb("error"));
    widget.bind(E.PLAY_PROGRESS, (e) => {
      if (!this.durationSec) widget.getDuration((ms) => (this.durationSec = ms / 1000));
      const pos = (e?.currentPosition ?? 0) / 1000;
      this.progressCb(pos, this.durationSec);
    });
    this.stateCb("paused");
  }

  async play() {
    this.widget?.play();
  }

  async pause() {
    this.widget?.pause();
  }

  async seek(seconds: number) {
    this.widget?.seekTo(seconds * 1000);
  }

  onStateChange(cb: (s: AdapterState) => void) {
    this.stateCb = cb;
  }

  onProgress(cb: (p: number, d: number) => void) {
    this.progressCb = cb;
  }

  destroy() {
    try {
      this.widget?.pause();
    } catch {
      /* iframe が既に無い */
    }
    this.iframe?.remove();
    this.iframe = null;
    this.widget = null;
  }
}
