"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiSend } from "@/lib/client/api";
import { useRequireLogin } from "@/lib/client/use-require-login";
import { getPlayerStore, usePlayer } from "@/lib/player/store";
import type { QueueItem } from "@/lib/types";

export function SaveButton({ item, size = "icon-sm" }: { item: QueueItem; size?: "icon-sm" | "icon" }) {
  const saved = usePlayer((s) => s.savedTrackIds.includes(item.track_id));
  const requireLogin = useRequireLogin();
  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!requireLogin("保存")) return;
    const store = getPlayerStore().getState();
    store.toggleSaved(item.track_id, !saved);
    try {
      if (saved) {
        await apiSend("/api/events", "DELETE", { track_id: item.track_id });
      } else {
        await apiSend("/api/events", "POST", {
          track_id: item.track_id,
          event: "save",
          context: item.context,
          pitch_id: item.pitch_id,
        });
        toast("ライブラリに保存しました");
      }
    } catch (err) {
      store.toggleSaved(item.track_id, saved);
      toast.error((err as Error).message);
    }
  };
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={onClick}
      aria-label={saved ? "保存を取り消す" : "保存"}
      aria-pressed={saved}
      className={saved ? "text-brand" : "text-muted-foreground"}
    >
      {saved ? <BookmarkCheck /> : <Bookmark />}
    </Button>
  );
}
