// Bandcamp: 公式の埋め込みプレイヤー(iframe)を表示するだけ。
// 外部から操作や終了検知ができないため canAutoAdvance=false。再生と「次へ」はユーザー操作とする。
import type { AdapterState, PlayerAdapter, TrackSource } from "../types";

export class BandcampAdapter implements PlayerAdapter {
  readonly service = "bandcamp" as const;
  readonly canAutoAdvance = false;
  private iframe: HTMLIFrameElement | null = null;
  private stateCb: (s: AdapterState) => void = () => {};

  constructor(private container: HTMLElement) {}

  async load(source: TrackSource) {
    if (!source.embed_url) throw new Error("bandcamp_embed_missing");
    this.stateCb("loading");
    const iframe = document.createElement("iframe");
    iframe.src = source.embed_url;
    iframe.title = "Bandcamp player";
    iframe.setAttribute("seamless", "");
    iframe.className = "w-full h-[120px] border-0 rounded-lg";
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.onerror = () => resolve();
      this.container.appendChild(iframe);
      setTimeout(resolve, 8000);
    });
    this.iframe = iframe;
    this.stateCb("paused");
  }

  // 埋め込みプレイヤーは外部から操作できない
  async play() {}
  async pause() {}

  onStateChange(cb: (s: AdapterState) => void) {
    this.stateCb = cb;
  }

  destroy() {
    this.iframe?.remove();
    this.iframe = null;
  }
}
