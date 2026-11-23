"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { useMe } from "@/lib/client/api";
import { appConfig } from "@/lib/config";
import { createAdapter } from "@/lib/player/adapters";
import { isAppleAuthorized } from "@/lib/player/adapters/apple";
import { isComplete } from "@/lib/player/queue-logic";
import { currentItem, initPlayerStore, usePlayer, type EventLogger } from "@/lib/player/store";
import { isUserGesture, setActiveAdapter, waitEmbedContainer } from "./controls";

const log: EventLogger = (e) => {
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(e),
    keepalive: true,
  }).catch(() => {});
};

// サーバーでもストアは作る（SSR 中は参照のみで更新されない）
const store = initPlayerStore({ log, notify: (m) => toast(m) });

/** アダプターの生成・破棄とイベント記録を担う（表示は持たない） */
function PlayerEngine({ simulate }: { simulate: boolean }) {
  const token = usePlayer((s) => s.loadToken);

  useEffect(() => {
    if (token === 0) return;
    const st = store.getState();
    const item = currentItem(st);
    const source = st.source;
    if (!item || !source) return;
    let cancelled = false;
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;
    let adapter: ReturnType<typeof createAdapter> | null = null;
    // この曲で一度でも再生が始まったか（読み込み直後の paused と、ユーザーの一時停止を区別する）
    let hasPlayed = false;
    const threshold = appConfig.queue.completeThreshold;
    const userStarted = st.startedByUser;

    (async () => {
      const container = await waitEmbedContainer();
      if (cancelled) return;
      adapter = createAdapter(source.service, {
        container,
        simulate,
        appleAuthorized: st.appleAuthorized,
        isUserInitiated: () => userStarted || isUserGesture(),
      });
      const a = adapter;
      setActiveAdapter(a);
      a.onStateChange((s) => {
        if (cancelled) return;
        const cur = store.getState();
        switch (s) {
          case "loading":
            if (cur.status !== "awaiting_user") cur.setStatus("loading");
            break;
          case "playing":
            hasPlayed = true;
            if (blockedTimer) clearTimeout(blockedTimer);
            cur.setStatus("playing");
            if (!cur.loggedPlay) {
              log({ track_id: item.track_id, event: "play", context: item.context, pitch_id: item.pitch_id });
              cur.markPlayLogged();
            }
            break;
          case "paused":
            if (!hasPlayed || cur.status === "awaiting_user" || cur.status === "blocked") break;
            if (cur.status === "playing" || cur.status === "loading") cur.setStatus("paused");
            break;
          case "ended":
            if (!cur.loggedComplete && a.canAutoAdvance) {
              log({ track_id: item.track_id, event: "complete", context: item.context, pitch_id: item.pitch_id });
              cur.markCompleteLogged();
            }
            if (a.canAutoAdvance) cur.next("auto");
            break;
          case "error":
            cur.skipOnError();
            break;
        }
      });
      a.onProgress?.((p, d) => {
        if (cancelled) return;
        const cur = store.getState();
        cur.setProgress(p, d);
        if (!cur.loggedComplete && isComplete(a.service, p, d, threshold)) {
          log({ track_id: item.track_id, event: "complete", context: item.context, pitch_id: item.pitch_id });
          cur.markCompleteLogged();
        }
      });
      try {
        await a.load(source);
        if (cancelled) return;
        if (!a.canAutoAdvance) {
          // Bandcamp: カードを出して停止。「再生する」「スキップ」はユーザー操作
          store.getState().setStatus("awaiting_user");
          return;
        }
        await a.play().catch(() => {});
        // 自動送りに失敗したら「タップして続きを再生」を出して停止する
        blockedTimer = setTimeout(() => {
          if (cancelled) return;
          if (!hasPlayed) store.getState().setStatus("blocked");
        }, 4000);
      } catch {
        if (!cancelled) store.getState().skipOnError();
      }
    })();

    return () => {
      cancelled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      adapter?.destroy();
      setActiveAdapter(null);
    };
  }, [token, simulate]);

  return null;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user, mode } = useMe();
  const savedLoaded = useRef<string | null>(null);

  useEffect(() => {
    store.getState().setPreferredService(user?.preferred_service ?? null);
  }, [user?.preferred_service]);

  useEffect(() => {
    if (!user || savedLoaded.current === user.id) return;
    savedLoaded.current = user.id;
    fetch("/api/library")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: { track_id: string }[] }) => store.getState().setSaved(d.items.map((i) => i.track_id)))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (mode !== "live") return;
    void isAppleAuthorized().then((v) => store.getState().setAppleAuthorized(v));
  }, [mode]);

  // 模擬再生は E2E 専用。通常は実際の音源（Apple のプレビュー / 各サービスの埋め込み）を鳴らす
  const simulate = process.env.NEXT_PUBLIC_PLAYER_MODE === "simulated";
  return (
    <>
      {children}
      {mode && <PlayerEngine simulate={simulate} />}
    </>
  );
}
