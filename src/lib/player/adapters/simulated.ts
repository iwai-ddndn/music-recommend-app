// fixtures モード用: 埋め込みの代わりに再生を模擬する（fixtures の曲URLは架空のため）。
// サービスごとの性質（Bandcamp は終了を検知できない等）は本物のアダプターに合わせる。
import type { Service } from "../../types";
import type { AdapterState, PlayerAdapter, TrackSource } from "../types";

declare global {
  interface Window {
    /** E2E 用: 自動送り時の再生開始をブロックしてモバイルの自動再生制限を再現する */
    __SIM_BLOCK_AUTOPLAY?: boolean;
  }
}

const LABEL: Record<Service, string> = {
  apple: "Apple Music",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
};

export class SimulatedAdapter implements PlayerAdapter {
  readonly canAutoAdvance: boolean;
  private el: HTMLDivElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pos = 0;
  private readonly duration: number;
  private stateCb: (s: AdapterState) => void = () => {};
  private progressCb: (p: number, d: number) => void = () => {};

  constructor(
    readonly service: Service,
    private container: HTMLElement,
    private opts: { isUserInitiated: () => boolean },
  ) {
    this.canAutoAdvance = service !== "bandcamp";
    this.duration = Number(process.env.NEXT_PUBLIC_SIM_DURATION_SEC) || 30;
  }

  async load(source: TrackSource) {
    this.stateCb("loading");
    const el = document.createElement("div");
    el.dataset.testid = "sim-embed";
    el.dataset.service = this.service;
    el.className =
      "flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground";
    el.textContent = `デモ再生（${LABEL[this.service]} の埋め込みの代わり） ${source.external_id}`;
    this.container.appendChild(el);
    this.el = el;
    await new Promise((r) => setTimeout(r, 150));
    this.stateCb("paused");
  }

  async play() {
    if (window.__SIM_BLOCK_AUTOPLAY && !this.opts.isUserInitiated()) return;
    if (this.timer) return;
    this.stateCb("playing");
    const step = 0.25;
    this.timer = setInterval(() => {
      this.pos = Math.min(this.duration, this.pos + step);
      this.progressCb(this.pos, this.duration);
      if (this.pos >= this.duration) {
        this.stop();
        // Bandcamp は終了を検知できないので ended を出さない
        this.stateCb(this.canAutoAdvance ? "ended" : "paused");
      }
    }, step * 1000);
  }

  async pause() {
    this.stop();
    this.stateCb("paused");
  }

  async seek(seconds: number) {
    this.pos = Math.max(0, Math.min(this.duration, seconds));
    this.progressCb(this.pos, this.duration);
  }

  onStateChange(cb: (s: AdapterState) => void) {
    this.stateCb = cb;
  }

  onProgress(cb: (p: number, d: number) => void) {
    this.progressCb = cb;
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  destroy() {
    this.stop();
    this.el?.remove();
    this.el = null;
  }
}
