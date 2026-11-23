"use client";

// 反応（再生開始・完聴・スキップ・保存）の記録。サーバーの listen_events と、端末の好みの学習の両方に流す。
import { getPlayerStore } from "../player/store";
import type { ListenEventType, QueueItem } from "../types";
import { useProfile } from "./profile";

export function logEvent(
  item: Pick<QueueItem, "track_id" | "context" | "pitch_id" | "tags" | "curators">,
  event: ListenEventType,
  positionSec?: number,
) {
  const position = positionSec ?? getPlayerStore().getState().positionSec;
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      track_id: item.track_id,
      event,
      context: item.context,
      pitch_id: item.pitch_id,
      position_sec: Math.round(position),
    }),
    keepalive: true,
  }).catch(() => {});

  if (event === "play") return;
  useProfile.getState().learn(
    {
      kind: event,
      positionSec: position,
      trackTags: item.tags ?? {},
      curatorShares: (item.curators ?? []).map((c) => ({ id: c.id, share: c.share })),
    },
    item.track_id,
  );
}

/** プレイヤーのストアから呼ばれる形（track_id から曲を引く） */
export function logEventById(e: { track_id: string; event: ListenEventType }) {
  const item = getPlayerStore()
    .getState()
    .queue.find((q) => q.track_id === e.track_id);
  if (item) logEvent(item, e.event);
}
