"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ChevronDown, ExternalLink, ListMusic, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useMe } from "@/lib/client/api";
import { authorizeAppleMusic } from "@/lib/player/adapters/apple";
import { openLabel, serviceLabel } from "@/lib/player/queue-logic";
import { currentItem, getPlayerStore, usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";
import { Artwork, EqualizerIcon } from "./artwork";
import * as controls from "./controls";
import { SaveButton } from "./save-button";
import { ServiceBadge } from "./service-badge";

export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PlayPauseButton({ size = "icon-lg", className }: { size?: "icon" | "icon-lg"; className?: string }) {
  const status = usePlayer((s) => s.status);
  const hasItem = usePlayer((s) => s.index >= 0);
  const playing = status === "playing" || status === "loading";
  return (
    <Button
      size={size}
      className={cn("rounded-full", className)}
      disabled={!hasItem || status === "awaiting_user" || status === "finished"}
      aria-label={playing ? "一時停止" : "再生"}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) void controls.pause();
        else void controls.play();
      }}
    >
      {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
    </Button>
  );
}

function Transport() {
  const hasItem = usePlayer((s) => s.index >= 0);
  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label="前の曲"
        disabled={!hasItem}
        onClick={() => {
          controls.markUserGesture();
          getPlayerStore().getState().prev();
        }}
      >
        <SkipBack className="fill-current" />
      </Button>
      <PlayPauseButton />
      <Button
        variant="ghost"
        size="icon"
        aria-label="次の曲"
        disabled={!hasItem}
        onClick={() => {
          controls.markUserGesture();
          getPlayerStore().getState().next("user");
        }}
      >
        <SkipForward className="fill-current" />
      </Button>
    </div>
  );
}

function ProgressBar() {
  const pos = usePlayer((s) => s.positionSec);
  const dur = usePlayer((s) => s.durationSec);
  const service = usePlayer((s) => s.source?.service);
  const canSeek = service !== "bandcamp" && dur > 0;
  return (
    <div className="space-y-1">
      <Slider
        aria-label="再生位置"
        value={[dur ? Math.min(pos, dur) : 0]}
        max={dur || 1}
        step={1}
        disabled={!canSeek}
        onValueChange={([v]) => {
          getPlayerStore().getState().setProgress(v, dur);
          void controls.seek(v);
        }}
      />
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{formatTime(pos)}</span>
        <span>{dur ? formatTime(dur) : "--:--"}</span>
      </div>
    </div>
  );
}

/** 状態に応じた案内（Bandcamp カード、自動送り失敗、Apple のプレビュー） */
function StatusNotice() {
  const status = usePlayer((s) => s.status);
  const source = usePlayer((s) => s.source);
  const appleAuthorized = usePlayer((s) => s.appleAuthorized);
  const { mode } = useMe();
  const item = usePlayer(currentItem);

  if (status === "awaiting_user" && source?.service === "bandcamp") {
    return (
      <Alert variant="brand" data-testid="bandcamp-card">
        <AlertTitle>Bandcamp の曲です</AlertTitle>
        <AlertDescription>
          <p>Bandcamp は自動で再生・曲送りができません。上のプレイヤーの ▶ で再生し、聴き終えたら「次へ」を押してください。</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                const st = getPlayerStore().getState();
                if (item && !st.loggedPlay) {
                  void fetch("/api/events", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      track_id: item.track_id,
                      event: "play",
                      context: item.context,
                      pitch_id: item.pitch_id,
                    }),
                  });
                  st.markPlayLogged();
                }
                st.setStatus("playing");
                void controls.play();
              }}
            >
              <Play className="fill-current" />
              再生する
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                controls.markUserGesture();
                getPlayerStore().getState().next("user");
              }}
            >
              <SkipForward />
              スキップ
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (status === "playing" && source?.service === "bandcamp") {
    return (
      <p className="text-muted-foreground text-xs">
        Bandcamp の曲は終了を検知できません。聴き終えたら「次へ」を押してください。
      </p>
    );
  }
  if (status === "blocked") {
    return (
      <Button
        className="w-full"
        variant="brand"
        data-testid="tap-to-continue"
        onClick={() => {
          controls.markUserGesture();
          void controls.play();
        }}
      >
        <Play className="fill-current" />
        タップして続きを再生
      </Button>
    );
  }
  if (status === "finished") {
    return <p className="text-muted-foreground text-sm">キューの最後まで再生しました。</p>;
  }
  if (source?.service === "apple" && !appleAuthorized && mode === "live") {
    return (
      <Alert>
        <AlertTitle>プレビュー再生中</AlertTitle>
        <AlertDescription>
          <p>Apple Music のサブスクリプションに接続するとフル再生できます。</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={async () => {
              try {
                const ok = await authorizeAppleMusic();
                getPlayerStore().getState().setAppleAuthorized(ok);
                if (ok) toast("Apple Music に接続しました");
              } catch (e) {
                toast.error(`接続できませんでした（${(e as Error).message}）`);
              }
            }}
          >
            Apple Music に接続
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function UpNext() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const upcoming = queue.slice(index + 1, index + 31);
  if (upcoming.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-wide">
        <ListMusic className="size-3.5" />
        次に再生（{queue.length - index - 1}曲）
      </h3>
      <ol className="space-y-0.5" data-testid="up-next">
        {upcoming.map((q, i) => (
          <li key={`${q.track_id}-${i}`}>
            <button
              className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left"
              onClick={() => {
                controls.markUserGesture();
                getPlayerStore().getState().playAt(index + 1 + i);
              }}
            >
              <Artwork src={q.artwork_url} seed={q.track_id} alt="" className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{q.title}</span>
                <span className="text-muted-foreground block truncate text-xs">{q.artist_name}</span>
              </span>
              <ServiceBadge service={q.sources.find((s) => s.playable)?.service ?? q.sources[0]?.service ?? "soundcloud"} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * 常駐する再生パネル。PCでは右カラム、スマホではミニプレイヤーから開く全画面パネル。
 * 埋め込み iframe を保持するため、閉じてもアンマウントしない（CSSで隠す）。
 */
export function NowPlayingPanel() {
  const item = usePlayer(currentItem);
  const source = usePlayer((s) => s.source);
  const label = usePlayer((s) => s.label);
  const status = usePlayer((s) => s.status);
  const open = usePlayer((s) => s.panelOpen);
  const embedRef = useCallback((el: HTMLDivElement | null) => controls.setEmbedContainer(el), []);

  return (
    <aside
      aria-label="再生中"
      data-testid="now-playing"
      data-status={status}
      className={cn(
        "bg-background fixed inset-0 z-40 flex flex-col transition-transform duration-300",
        open ? "translate-y-0" : "pointer-events-none translate-y-full",
        "lg:pointer-events-auto lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[360px] lg:translate-y-0 lg:border-l",
      )}
    >
      <div className="flex items-center justify-between px-4 pt-3 lg:pt-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="閉じる"
          onClick={() => getPlayerStore().getState().setPanelOpen(false)}
        >
          <ChevronDown />
        </Button>
        <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs font-medium">
          <EqualizerIcon playing={status === "playing"} />
          <span className="truncate">{label ? `再生中 · ${label}` : "再生中"}</span>
        </div>
        <span className="size-9 lg:hidden" />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pt-3 pb-6">
        {!item ? (
          <div className="text-muted-foreground flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
            <Artwork src={null} alt="" className="size-16" />
            <p>曲を選ぶとここで再生されます。</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/">発見を開く</Link>
            </Button>
          </div>
        ) : (
          <>
            <Artwork src={item.artwork_url} seed={item.track_id} alt={`${item.title} のアートワーク`} className="mx-auto aspect-square w-full max-w-[280px] lg:max-w-none" />
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold" data-testid="now-title">
                  {item.title}
                </h2>
                <p className="text-muted-foreground truncate">{item.artist_name}</p>
              </div>
              <SaveButton item={item} size="icon" />
            </div>
            <Badge variant="brand" className="max-w-full truncate font-normal">
              {item.reason}
            </Badge>
          </>
        )}

        {/* 埋め込みプレイヤーの置き場所（常に1つ） */}
        <div
          ref={embedRef}
          data-testid="embed-host"
          className={cn("space-y-2 empty:hidden", source?.service === "apple" && "hidden")}
        />

        {item && (
          <>
            <StatusNotice />
            <ProgressBar />
            <Transport />
            {source && (
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
                <ServiceBadge service={source.service} full />
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 underline-offset-4 hover:underline"
                  data-testid="open-original"
                >
                  {openLabel(source.service)}
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            )}
            {item.sources.filter((s) => s.service !== source?.service).length > 0 && (
              <p className="text-muted-foreground text-center text-xs">
                他でも聴けます:{" "}
                {item.sources
                  .filter((s) => s.service !== source?.service)
                  .map((s, i) => (
                    <a key={s.service} href={s.url} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                      {i > 0 && "、"}
                      {serviceLabel(s.service)}
                    </a>
                  ))}
              </p>
            )}
            <UpNext />
          </>
        )}
      </div>
    </aside>
  );
}

/** スマホ用のミニプレイヤー（下部タブの上）。タップで再生パネルを開く */
export function MiniPlayer() {
  const item = usePlayer(currentItem);
  const pos = usePlayer((s) => s.positionSec);
  const dur = usePlayer((s) => s.durationSec);
  const status = usePlayer((s) => s.status);
  if (!item) return null;
  return (
    <div
      className="bg-card fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 overflow-hidden rounded-xl border shadow-lg lg:hidden"
      data-testid="mini-player"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="再生パネルを開く"
        className="flex items-center gap-3 p-2"
        onClick={() => getPlayerStore().getState().setPanelOpen(true)}
        onKeyDown={(e) => e.key === "Enter" && getPlayerStore().getState().setPanelOpen(true)}
      >
        <Artwork src={item.artwork_url} seed={item.track_id} alt="" className="size-10" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.title}</div>
          <div className="text-muted-foreground truncate text-xs">
            {status === "awaiting_user"
              ? "Bandcamp: タップして再生"
              : status === "blocked"
                ? "タップして続きを再生"
                : item.artist_name}
          </div>
        </div>
        <PlayPauseButton size="icon" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="次の曲"
          onClick={(e) => {
            e.stopPropagation();
            controls.markUserGesture();
            getPlayerStore().getState().next("user");
          }}
        >
          <SkipForward className="fill-current" />
        </Button>
      </div>
      <div className="bg-muted h-0.5">
        <div className="bg-brand h-full transition-[width]" style={{ width: dur ? `${(pos / dur) * 100}%` : "0%" }} />
      </div>
    </div>
  );
}
