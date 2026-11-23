"use client";

import { Pause, Play } from "lucide-react";
import { getPlayerStore, usePlayer } from "@/lib/player/store";
import type { QueueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Artwork, EqualizerIcon } from "./artwork";
import * as controls from "./controls";
import { WhyChips } from "./now-playing";
import { SaveButton } from "./save-button";
import { ServiceBadge } from "./service-badge";

/** 同じリストを再生中か（先頭が同じ並びか。好みの学習で後ろが並べ替わっても同じキューとみなす） */
function useIsThisQueue(items: QueueItem[], label: string) {
  return usePlayer((s) => s.index >= 0 && s.label === label && items.some((i) => i.track_id === s.queue[s.index]?.track_id));
}

export function usePlayList(items: QueueItem[], label: string) {
  const isThis = useIsThisQueue(items, label);
  const currentId = usePlayer((s) => s.queue[s.index]?.track_id);
  const status = usePlayer((s) => s.status);
  const playing = isThis && (status === "playing" || status === "loading");
  return {
    isThis,
    playing,
    currentId: isThis ? currentId : undefined,
    playFrom(i: number, opts: { open?: boolean } = {}) {
      controls.markUserGesture();
      const st = getPlayerStore().getState();
      if (isThis && items[i].track_id === currentId) {
        if (st.status === "playing") void controls.pause();
        else if (st.status === "paused" || st.status === "blocked") void controls.play();
        else st.setPanelOpen(true);
        return;
      }
      st.playQueue(items, i, label);
      if (opts.open) st.setPanelOpen(true);
    },
    toggleAll() {
      controls.markUserGesture();
      const st = getPlayerStore().getState();
      if (!isThis) return st.playQueue(items, 0, label);
      if (st.status === "playing") void controls.pause();
      else void controls.play();
    },
  };
}

/** 丸い大きな再生ボタン（その画面の主操作） */
export function PlayFab({ items, label, className }: { items: QueueItem[]; label: string; className?: string }) {
  const list = usePlayList(items, label);
  return (
    <button
      type="button"
      data-testid="play-all"
      aria-label={list.playing ? "一時停止" : "再生"}
      disabled={items.length === 0}
      onClick={list.toggleAll}
      className={cn(
        "bg-brand text-brand-foreground flex size-14 shrink-0 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 disabled:opacity-40",
        className,
      )}
    >
      {list.playing ? <Pause className="size-6 fill-current" /> : <Play className="ml-0.5 size-6 fill-current" />}
    </button>
  );
}

export function TrackList({
  items,
  label,
  showWhy = true,
  extra,
}: {
  items: QueueItem[];
  label: string;
  showWhy?: boolean;
  extra?: (item: QueueItem, index: number) => React.ReactNode;
}) {
  const list = usePlayList(items, label);
  return (
    <ol data-testid="track-list" className="-mx-2">
      {items.map((item, i) => {
        const isCurrent = list.currentId === item.track_id;
        const services = [...new Set(item.sources.filter((s) => s.playable).map((s) => s.service))];
        return (
          <li
            key={`${item.track_id}-${i}`}
            data-testid="track-row"
            data-current={isCurrent || undefined}
            className={cn(
              "active:bg-accent flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 transition-colors",
              isCurrent && "bg-accent",
            )}
            onClick={() => list.playFrom(i)}
          >
            <button
              type="button"
              aria-label={`${item.title}を再生`}
              className="relative shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                list.playFrom(i);
              }}
            >
              <Artwork src={item.artwork_url} seed={item.track_id} alt="" className="size-14 rounded-xl" />
              {isCurrent && (
                <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45">
                  <EqualizerIcon playing={list.playing} />
                </span>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <div className={cn("truncate text-base font-medium", isCurrent && "text-brand")} data-testid="track-title">
                {item.title}
              </div>
              <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                {services.map((s) => (
                  <ServiceBadge key={s} service={s} className="h-4 px-1 text-[9px]" />
                ))}
                <span className="truncate">{item.artist_name}</span>
              </div>
              {extra?.(item, i)}
            </div>
            {showWhy && <WhyChips item={item} compact />}
            <SaveButton item={item} />
          </li>
        );
      })}
    </ol>
  );
}
