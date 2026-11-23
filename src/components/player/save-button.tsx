"use client";

import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { apiSend } from "@/lib/client/api";
import { logEvent } from "@/lib/client/events";
import { useRequireLogin } from "@/lib/client/use-require-login";
import { getPlayerStore, usePlayer } from "@/lib/player/store";
import type { QueueItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SaveButton({ item, large }: { item: QueueItem; large?: boolean }) {
  const saved = usePlayer((s) => s.savedTrackIds.includes(item.track_id));
  const requireLogin = useRequireLogin();
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!requireLogin("保存")) return;
    const store = getPlayerStore().getState();
    store.toggleSaved(item.track_id, !saved);
    try {
      if (saved) await apiSend("/api/events", "DELETE", { track_id: item.track_id });
      else logEvent(item, "save");
    } catch (err) {
      store.toggleSaved(item.track_id, saved);
      toast.error((err as Error).message);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? "保存を取り消す" : "保存"}
      aria-pressed={saved}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-90",
        large ? "size-12" : "size-11",
        saved ? "text-brand" : "text-muted-foreground",
      )}
    >
      <Bookmark className={cn(large ? "size-7" : "size-5", saved && "fill-current")} />
    </button>
  );
}
