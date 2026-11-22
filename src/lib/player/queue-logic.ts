// キューの遷移判断（純粋関数）。仕様書 7章「キューの挙動」。
import { pickSource } from "../feed/build-queue";
import type { QueueItem, QueueSource, Service } from "../types";

export type PickOptions = {
  preferred: Service | null;
  appleAuthorized: boolean;
  priority: Service[];
};

export type PlayerStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  /** Bandcamp: 外部から操作できないためカードを出してユーザー操作を待つ */
  | "awaiting_user"
  /** スマホ等で自動送りに失敗。「タップして続きを再生」 */
  | "blocked"
  | "error"
  /** キューの最後まで再生した */
  | "finished";

export const SKIP_REASON_LABEL: Record<string, string> = {
  unplayable: "再生できない曲のためスキップしました",
  error: "再生エラーのためスキップしました",
};

/**
 * from の次（from を含めるなら inclusive）から再生可能な曲を探す。
 * 再生可能なソースが無い曲は自動でスキップし、その曲を skipped に返す（トースト用）。
 */
export function findPlayable(
  queue: QueueItem[],
  from: number,
  opts: PickOptions,
  inclusive = false,
): { index: number; source: QueueSource | null; skipped: QueueItem[] } {
  const skipped: QueueItem[] = [];
  for (let i = inclusive ? from : from + 1; i < queue.length; i++) {
    const source = pickSource(queue[i].sources, opts);
    if (source) return { index: i, source, skipped };
    skipped.push(queue[i]);
  }
  return { index: -1, source: null, skipped };
}

/**
 * 曲を読み込んだ直後の状態。
 * - Bandcamp は外部から再生・終了検知ができないため常に「ユーザー操作待ち」
 * - それ以外はユーザー操作起点なら再生、自動送りでも再生を試みる（失敗したら blocked）
 */
export function statusAfterLoad(service: Service): PlayerStatus {
  return service === "bandcamp" ? "awaiting_user" : "loading";
}

/** 完聴判定（曲の80%以上）。Bandcamp は判定できないので常に false。 */
export function isComplete(
  service: Service,
  positionSec: number,
  durationSec: number,
  threshold: number,
): boolean {
  if (service === "bandcamp") return false;
  if (!durationSec || durationSec <= 0) return false;
  return positionSec / durationSec >= threshold;
}

/** 「元のサービスで開く」ラベル */
export function openLabel(service: Service): string {
  switch (service) {
    case "apple":
      return "Apple Musicで開く";
    case "soundcloud":
      return "SoundCloudで開く";
    case "bandcamp":
      return "購入ページへ";
  }
}

export function serviceLabel(service: Service): string {
  return service === "apple" ? "Apple Music" : service === "soundcloud" ? "SoundCloud" : "Bandcamp";
}
