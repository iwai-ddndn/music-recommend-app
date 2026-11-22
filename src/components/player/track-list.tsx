"use client";

import { Pause, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlayerStore, usePlayer } from "@/lib/player/store";
import type { QueueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Artwork, EqualizerIcon } from "./artwork";
import * as controls from "./controls";
import { SaveButton } from "./save-button";
import { ServiceBadge } from "./service-badge";

/** 同じリストを再生中か（queue が同じ track_id 列か） */
function useIsThisQueue(items: QueueItem[]) {
  return usePlayer(
    (s) =>
      s.queue.length === items.length && s.queue.every((q, i) => q.track_id === items[i]?.track_id),
  );
}

export function usePlayList(items: QueueItem[], label: string) {
  const isThis = useIsThisQueue(items);
  const index = usePlayer((s) => s.index);
  const status = usePlayer((s) => s.status);
  const playing = isThis && (status === "playing" || status === "loading");
  return {
    isThis,
    playing,
    currentIndex: isThis ? index : -1,
    status,
    playFrom(i: number) {
      controls.markUserGesture();
      const st = getPlayerStore().getState();
      if (isThis && i === st.index) {
        if (st.status === "playing") void controls.pause();
        else if (st.status === "paused" || st.status === "blocked") void controls.play();
        return;
      }
      if (isThis) st.playAt(i);
      else st.playQueue(items, i, label);
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

export function TrackList({
  items,
  label,
  showReason = true,
  extra,
}: {
  items: QueueItem[];
  label: string;
  showReason?: boolean;
  extra?: (item: QueueItem, index: number) => React.ReactNode;
}) {
  const list = usePlayList(items, label);
  return (
    <ol className="divide-y" data-testid="track-list">
      {items.map((item, i) => {
        const isCurrent = list.currentIndex === i;
        const services = [...new Set(item.sources.filter((s) => s.playable).map((s) => s.service))];
        return (
          <li
            key={`${item.track_id}-${i}`}
            data-testid="track-row"
            data-current={isCurrent || undefined}
            className={cn(
              "group hover:bg-accent/50 flex cursor-pointer items-center gap-3 px-2 py-2.5 transition-colors sm:px-3",
              isCurrent && "bg-accent/60",
            )}
            onClick={() => list.playFrom(i)}
          >
            <div className="relative">
              <Artwork src={item.artwork_url} seed={item.track_id} alt="" className="size-12" />
              <div
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-md bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100",
                  isCurrent && "opacity-100",
                )}
              >
                {isCurrent && list.playing ? (
                  <>
                    <EqualizerIcon playing className="group-hover:hidden" />
                    <Pause className="hidden size-5 group-hover:block" />
                  </>
                ) : (
                  <Play className="size-5" />
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className={cn("truncate font-medium", isCurrent && "text-brand")} data-testid="track-title">
                {item.title}
              </div>
              <div className="text-muted-foreground truncate text-sm">{item.artist_name}</div>
              {showReason && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="brand" className="max-w-full truncate font-normal" data-testid="reason">
                    {item.reason}
                  </Badge>
                </div>
              )}
              {extra?.(item, i)}
            </div>
            <div className="hidden shrink-0 gap-1 sm:flex">
              {services.map((s) => (
                <ServiceBadge key={s} service={s} />
              ))}
            </div>
            <SaveButton item={item} />
            <Button
              variant="ghost"
              size="icon-sm"
              className="sr-only focus-visible:not-sr-only"
              aria-label={`${item.title}を再生`}
              onClick={(e) => {
                e.stopPropagation();
                list.playFrom(i);
              }}
            >
              <Play />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}
