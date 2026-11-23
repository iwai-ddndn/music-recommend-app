// Apple Music の30秒プレビューを HTML5 <audio> で再生する（キー不要）。
// Apple Music に未接続のときの既定。接続済み（MusicKit 認可済み）ならフル再生の AppleMusicAdapter を使う。
//
// <audio> 要素はアプリ全体で1つだけ使い回す。一度ユーザー操作で再生を始めた要素は、
// src を差し替えて play() してもモバイルで止められにくい（iframe を作り直す方式より自動送りが安定する）。
import type { AdapterState, PlayerAdapter, TrackSource } from "../types";

let audio: HTMLAudioElement | null = null;
const urlCache = new Map<string, string | null>();

function element(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
  }
  return audio;
}

/** 再生中の曲と次の数曲のプレビューURLをまとめて引いておく（曲終わりで待たずに次を鳴らすため） */
export async function prefetchPreviews(sources: Pick<TrackSource, "external_id" | "storefront">[]) {
  const need = sources.filter((s) => !urlCache.has(s.external_id));
  if (need.length === 0) return;
  const sf = need[0].storefront ?? "jp";
  try {
    const res = await fetch(`/api/apple/previews?sf=${sf}&ids=${need.map((s) => s.external_id).join(",")}`);
    const data = (await res.json()) as { previews: Record<string, { url: string | null }> };
    for (const s of need) urlCache.set(s.external_id, data.previews[s.external_id]?.url ?? null);
  } catch {
    // 次に再生するときにもう一度試す
  }
}

export class PreviewAdapter implements PlayerAdapter {
  readonly service = "apple" as const;
  readonly canAutoAdvance = true;
  private stateCb: (s: AdapterState) => void = () => {};
  private progressCb: (p: number, d: number) => void = () => {};
  private el = element();
  private off: (() => void)[] = [];

  private on(type: string, fn: () => void) {
    this.el.addEventListener(type, fn);
    this.off.push(() => this.el.removeEventListener(type, fn));
  }

  async load(source: TrackSource) {
    this.stateCb("loading");
    if (!urlCache.has(source.external_id)) await prefetchPreviews([source]);
    const url = urlCache.get(source.external_id);
    if (!url) {
      urlCache.delete(source.external_id);
      throw new Error("preview_not_available");
    }
    this.on("playing", () => this.stateCb("playing"));
    this.on("pause", () => {
      if (!this.el.ended) this.stateCb("paused");
    });
    this.on("waiting", () => this.stateCb("loading"));
    this.on("ended", () => this.stateCb("ended"));
    this.on("error", () => {
      urlCache.delete(source.external_id);
      this.stateCb("error");
    });
    this.on("timeupdate", () => this.progressCb(this.el.currentTime, this.el.duration || 0));
    this.el.src = url;
    this.el.currentTime = 0;
  }

  async play() {
    await this.el.play();
  }

  async pause() {
    this.el.pause();
  }

  async seek(seconds: number) {
    this.el.currentTime = seconds;
  }

  onStateChange(cb: (s: AdapterState) => void) {
    this.stateCb = cb;
  }

  onProgress(cb: (p: number, d: number) => void) {
    this.progressCb = cb;
  }

  // 要素は使い回すので、リスナーを外して止めるだけ
  destroy() {
    this.off.forEach((f) => f());
    this.off = [];
    this.el.pause();
  }
}
