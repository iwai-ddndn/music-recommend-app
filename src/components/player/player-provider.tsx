"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { useMe } from "@/lib/client/api";
import { logEvent, logEventById } from "@/lib/client/events";
import { useProfile } from "@/lib/client/profile";
import { appConfig } from "@/lib/config";
import { createAdapter } from "@/lib/player/adapters";
import { isAppleAuthorized } from "@/lib/player/adapters/apple";
import { prefetchPreviews } from "@/lib/player/adapters/preview";
import { isComplete } from "@/lib/player/queue-logic";
import { currentItem, initPlayerStore, usePlayer } from "@/lib/player/store";
import { pickSource } from "@/lib/feed/build-queue";
import * as controls from "./controls";

// サーバーでもストアは作る（SSR 中は参照のみで更新されない）
const store = initPlayerStore({ log: logEventById, notify: (m) => toast(m) });

/** ロック画面・通知の操作（Media Session）。<audio> で再生するプレビューで効く */
function useMediaSession() {
  const item = usePlayer(currentItem);
  const status = usePlayer((s) => s.status);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (!item) {
      ms.metadata = null;
      return;
    }
    ms.metadata = new MediaMetadata({
      title: item.title,
      artist: item.artist_name,
      artwork: item.artwork_url ? [{ src: item.artwork_url, sizes: "400x400" }] : [],
    });
    ms.setActionHandler("play", () => void controls.play());
    ms.setActionHandler("pause", () => void controls.pause());
    ms.setActionHandler("nexttrack", () => store.getState().next("user"));
    ms.setActionHandler("previoustrack", () => store.getState().prev());
  }, [item]);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : status === "paused" ? "paused" : "none";
  }, [status]);
}

/** アダプターの生成・破棄とイベント記録を担う（表示は持たない） */
function PlayerEngine({ simulate }: { simulate: boolean }) {
  const token = usePlayer((s) => s.loadToken);
  useMediaSession();

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

    // 次の数曲のプレビュー音源を先に引いておく（曲終わりで待たずに鳴らす）
    if (!simulate && !st.appleAuthorized) {
      const upcoming = st.queue
        .slice(st.index, st.index + 4)
        .map((q) =>
          pickSource(q.sources, {
            preferred: st.preferredService,
            appleAuthorized: false,
            priority: appConfig.player.servicePriority,
          }),
        )
        .filter((s) => s?.service === "apple");
      void prefetchPreviews(upcoming.map((s) => s!));
    }

    (async () => {
      const container = await controls.waitEmbedContainer();
      if (cancelled) return;
      adapter = createAdapter(source.service, {
        container,
        simulate,
        appleAuthorized: st.appleAuthorized,
        isUserInitiated: () => userStarted || controls.isUserGesture(),
      });
      const a = adapter;
      controls.setActiveAdapter(a);
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
              logEvent(item, "play");
              cur.markPlayLogged();
            }
            break;
          case "paused":
            if (!hasPlayed || cur.status === "awaiting_user" || cur.status === "blocked") break;
            if (cur.status === "playing" || cur.status === "loading") cur.setStatus("paused");
            break;
          case "ended":
            if (!cur.loggedComplete && a.canAutoAdvance) {
              logEvent(item, "complete");
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
          logEvent(item, "complete", p);
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
        // 再生が拒否されたら（モバイルの自動再生制限）すぐ「タップして続きを再生」にする
        await a.play().catch(() => {
          if (!cancelled && !hasPlayed) store.getState().setStatus("blocked");
        });
        blockedTimer = setTimeout(() => {
          if (!cancelled && !hasPlayed) store.getState().setStatus("blocked");
        }, 4000);
      } catch {
        if (!cancelled) store.getState().skipOnError();
      }
    })();

    return () => {
      cancelled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      adapter?.destroy();
      controls.setActiveAdapter(null);
    };
  }, [token, simulate]);

  return null;
}

/** ログイン中は端末の好みをサーバーにも保存する。ログイン直後は両方を統合する */
function ProfileSync() {
  const { user } = useMe();
  const hydrated = useProfile((s) => s.hydrated);
  const taste = useProfile((s) => s.taste);
  const merged = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !hydrated || merged.current === user.id) return;
    merged.current = user.id;
    const p = useProfile.getState();
    fetch("/api/taste", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ taste: p.taste, merge: true }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.taste && useProfile.getState().setTaste(d.taste))
      .catch(() => {});
    // 端末で選んだ好きなアーティストをアカウントにも登録する
    for (const name of p.favorites) {
      void fetch("/api/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }).catch(() => {});
    }
  }, [user, hydrated]);

  useEffect(() => {
    if (!user || merged.current !== user.id) return;
    const t = setTimeout(() => {
      void fetch("/api/taste", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taste }),
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [user, taste]);

  return null;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { user, mode } = useMe();
  const savedLoaded = useRef<string | null>(null);

  useEffect(() => {
    void useProfile.persist.rehydrate();
  }, []);

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
      <ProfileSync />
    </>
  );
}
