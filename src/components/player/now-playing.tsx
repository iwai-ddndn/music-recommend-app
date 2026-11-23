"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ChevronDown, ExternalLink, Heart, ListMusic, Pause, Play, SkipBack, SkipForward, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useMe } from "@/lib/client/api";
import { logEvent } from "@/lib/client/events";
import { playbackKind } from "@/lib/player/adapters";
import { authorizeAppleMusic } from "@/lib/player/adapters/apple";
import { openLabel } from "@/lib/player/queue-logic";
import { currentItem, getPlayerStore, usePlayer } from "@/lib/player/store";
import type { QueueItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Artwork, EqualizerIcon } from "./artwork";
import * as controls from "./controls";
import { SaveButton } from "./save-button";
import { ServiceBadge } from "./service-badge";

export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

/**
 * 「なぜ出てきたか」を文ではなく形で見せる:
 * 推した目利きのアバター（回数バッジつき）、推薦キャンペーンはハート、埋もれた曲は星。
 */
export function WhyChips({
  item,
  link,
  max = 3,
  compact,
}: {
  item: QueueItem;
  link?: boolean;
  max?: number;
  /** リストの行用: アバターの重なりと回数だけ（名前は出さない） */
  compact?: boolean;
}) {
  const curators = item.curators ?? [];
  const pitch = item.context === "pitch";
  if (compact) {
    const lead = curators[0];
    return (
      <div className="flex shrink-0 items-center" title={item.reason} aria-label={item.reason} data-testid="reason">
        {pitch && (
          <span className="bg-brand/20 flex size-7 items-center justify-center rounded-full">
            <Heart className="fill-brand text-brand size-3.5" />
          </span>
        )}
        {item.buried && (
          <span className="bg-muted flex size-7 items-center justify-center rounded-full">
            <Sparkles className="size-3.5" />
          </span>
        )}
        {curators.slice(0, 2).map((c, i) => (
          <Avatar key={c.id} className={cn("border-background size-7 border-2", (i > 0 || pitch || item.buried) && "-ml-2")}>
            <AvatarFallback className="text-[10px] font-medium">{c.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
        ))}
        {lead && lead.count > 1 ? (
          <span className="text-brand ml-1 text-xs font-bold tabular-nums">×{lead.count}</span>
        ) : (
          curators.length > 2 && (
            <span className="text-muted-foreground ml-1 text-xs tabular-nums">+{curators.length - 2}</span>
          )
        )}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={item.reason} aria-label={item.reason} data-testid="reason">
      {pitch && (
        <span className="bg-brand/20 inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium">
          <Heart className="fill-brand text-brand size-3.5" />
          <span className="max-w-40 truncate">{item.reason.replace(/（.*$/, "")}</span>
        </span>
      )}
      {item.buried && (
        <span className="bg-muted inline-flex size-7 items-center justify-center rounded-full" title="埋もれた1曲">
          <Sparkles className="size-3.5" />
        </span>
      )}
      {curators.slice(0, max).map((c, i) => {
        const chip = (
          <span
            className={cn(
              "bg-muted inline-flex h-7 items-center gap-1.5 rounded-full pr-2.5 pl-0.5 text-xs font-medium",
              i > 0 && "pr-0.5",
            )}
          >
            <Avatar className="size-6">
              <AvatarFallback className="bg-background text-[10px]">{c.name.slice(0, 1)}</AvatarFallback>
            </Avatar>
            {i === 0 && <span className="max-w-28 truncate">{c.name}</span>}
            {i === 0 && c.count > 1 && <span className="text-brand font-bold tabular-nums">×{c.count}</span>}
          </span>
        );
        return link ? (
          <Link key={c.id} href={`/curators/${c.id}`} onClick={() => getPlayerStore().getState().setPanelOpen(false)}>
            {chip}
          </Link>
        ) : (
          <span key={c.id}>{chip}</span>
        );
      })}
      {curators.length > max && (
        <span className="text-muted-foreground text-xs font-medium tabular-nums">+{curators.length - max}</span>
      )}
    </div>
  );
}

function PlayPause({ className, iconClass }: { className?: string; iconClass?: string }) {
  const status = usePlayer((s) => s.status);
  const hasItem = usePlayer((s) => s.index >= 0);
  const playing = status === "playing" || status === "loading";
  return (
    <button
      type="button"
      className={cn(
        "bg-foreground text-background flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-40",
        status === "blocked" && "ring-brand animate-pulse ring-4",
        className,
      )}
      disabled={!hasItem || status === "awaiting_user" || status === "finished"}
      aria-label={playing ? "一時停止" : "再生"}
      onClick={(e) => {
        e.stopPropagation();
        if (playing) void controls.pause();
        else void controls.play();
      }}
    >
      {playing ? <Pause className={cn("fill-current", iconClass)} /> : <Play className={cn("ml-0.5 fill-current", iconClass)} />}
    </button>
  );
}

function next() {
  controls.markUserGesture();
  getPlayerStore().getState().next("user");
}

function Progress({ preview }: { preview: boolean }) {
  const pos = usePlayer((s) => s.positionSec);
  const dur = usePlayer((s) => s.durationSec);
  const service = usePlayer((s) => s.source?.service);
  const canSeek = service !== "bandcamp" && dur > 0;
  return (
    <div className="space-y-1.5">
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
      <div className="text-muted-foreground flex items-center justify-between text-xs tabular-nums">
        <span>{formatTime(pos)}</span>
        {preview && (
          <span className="bg-muted text-foreground rounded-full px-2 py-0.5 text-[11px] font-medium" data-testid="preview-pill">
            プレビュー
          </span>
        )}
        <span>{dur ? formatTime(dur) : "--:--"}</span>
      </div>
    </div>
  );
}

/** Bandcamp は外から操作できないので、埋め込みプレイヤーの下に2つのボタンだけを置く */
function BandcampCard({ item }: { item: QueueItem }) {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="bandcamp-card">
      <Button
        size="lg"
        className="h-12"
        onClick={() => {
          const st = getPlayerStore().getState();
          if (!st.loggedPlay) {
            logEvent(item, "play", 0);
            st.markPlayLogged();
          }
          st.setStatus("playing");
        }}
      >
        <Play className="fill-current" />
        再生する
      </Button>
      <Button size="lg" variant="outline" className="h-12" onClick={next}>
        <SkipForward />
        スキップ
      </Button>
    </div>
  );
}

function UpNext() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  return (
    <ol className="space-y-1" data-testid="up-next">
      {queue.slice(index + 1).map((q, i) => (
        <li key={`${q.track_id}-${i}`}>
          <button
            className="active:bg-accent hover:bg-accent flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left"
            onClick={() => {
              controls.markUserGesture();
              getPlayerStore().getState().playAt(index + 1 + i);
            }}
          >
            <Artwork src={q.artwork_url} seed={q.track_id} alt="" className="size-11" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{q.title}</span>
              <span className="text-muted-foreground block truncate text-sm">{q.artist_name}</span>
            </span>
            <WhyChips item={q} compact />
          </button>
        </li>
      ))}
    </ol>
  );
}

/**
 * 全画面プレイヤー。ミニプレイヤーから開く。
 * 埋め込み iframe を保持するため、閉じてもアンマウントしない（画面外に送るだけ）。
 */
export function NowPlayingSheet() {
  const item = usePlayer(currentItem);
  const source = usePlayer((s) => s.source);
  const status = usePlayer((s) => s.status);
  const open = usePlayer((s) => s.panelOpen);
  const appleAuthorized = usePlayer((s) => s.appleAuthorized);
  const { mode } = useMe();
  const [view, setView] = useState<"now" | "queue">("now");
  const embedRef = useCallback((el: HTMLDivElement | null) => controls.setEmbedContainer(el), []);
  const close = () => getPlayerStore().getState().setPanelOpen(false);
  const preview = source ? playbackKind(source.service, appleAuthorized) === "preview" : false;
  const visible = open && !!item;

  return (
    <>
      <div
        aria-hidden
        onClick={close}
        className={cn(
          "fixed inset-0 z-40 hidden bg-black/50 transition-opacity lg:block",
          visible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <section
        aria-label="再生中"
        aria-hidden={!visible}
        data-testid="now-playing"
        data-status={status}
        className={cn(
          "bg-background fixed inset-0 z-50 mx-auto flex max-w-xl flex-col transition-transform duration-300 ease-out lg:inset-y-4 lg:rounded-3xl lg:border lg:shadow-2xl",
          visible ? "translate-y-0" : "pointer-events-none translate-y-[105%]",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-[calc(0.5rem+env(safe-area-inset-top))]">
          <Button variant="ghost" size="icon-lg" className="size-12 rounded-full" aria-label="閉じる" onClick={close}>
            <ChevronDown className="size-6" />
          </Button>
          <EqualizerIcon playing={status === "playing"} />
          <Button
            variant={view === "queue" ? "secondary" : "ghost"}
            size="icon-lg"
            className="size-12 rounded-full"
            aria-label="次に流れる曲"
            aria-pressed={view === "queue"}
            onClick={() => setView(view === "queue" ? "now" : "queue")}
          >
            <ListMusic className="size-5" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {item && view === "queue" && <UpNext />}

          <div className={cn("flex flex-1 flex-col justify-center gap-5", view === "queue" && "hidden")}>
            {item && (
              <>
                <Artwork
                  src={item.artwork_url}
                  seed={item.track_id}
                  alt=""
                  className="mx-auto aspect-square w-full max-w-[min(100%,46dvh)] rounded-3xl shadow-xl"
                />
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-2xl font-bold" data-testid="now-title">
                      {item.title}
                    </h2>
                    <p className="text-muted-foreground truncate text-lg">{item.artist_name}</p>
                  </div>
                  <SaveButton item={item} large />
                </div>
                <WhyChips item={item} link />
              </>
            )}

            {/* 埋め込みプレイヤーの置き場所（常に1つ） */}
            <div ref={embedRef} data-testid="embed-host" className="space-y-2 empty:hidden" />

            {item && status === "awaiting_user" && source?.service === "bandcamp" && <BandcampCard item={item} />}
          </div>

          {item && (
            <div className="space-y-4">
              <Progress preview={preview} />
              <div className="flex items-center justify-center gap-8">
                <Button
                  variant="ghost"
                  className="size-14 rounded-full"
                  aria-label="前の曲"
                  onClick={() => {
                    controls.markUserGesture();
                    getPlayerStore().getState().prev();
                  }}
                >
                  <SkipBack className="size-7 fill-current" />
                </Button>
                {status === "blocked" ? (
                  <button
                    type="button"
                    data-testid="tap-to-continue"
                    aria-label="タップして続きを再生"
                    className="bg-brand text-brand-foreground flex size-[72px] animate-pulse items-center justify-center rounded-full"
                    onClick={() => void controls.play()}
                  >
                    <Play className="ml-1 size-8 fill-current" />
                  </button>
                ) : (
                  <PlayPause className="size-[72px]" iconClass="size-8" />
                )}
                <Button variant="ghost" className="size-14 rounded-full" aria-label="次の曲" onClick={next}>
                  <SkipForward className="size-7 fill-current" />
                </Button>
              </div>
              {source && (
                <div className="flex items-center justify-center gap-2">
                  <Button asChild variant="outline" className="h-11 rounded-full px-4">
                    <a href={source.url} target="_blank" rel="noopener noreferrer" data-testid="open-original">
                      <ServiceBadge service={source.service} />
                      {openLabel(source.service)}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                  {preview && mode === "live" && (
                    <Button
                      variant="ghost"
                      className="h-11 rounded-full"
                      onClick={async () => {
                        try {
                          const ok = await authorizeAppleMusic();
                          getPlayerStore().getState().setAppleAuthorized(ok);
                        } catch (e) {
                          toast.error(`Apple Music に接続できませんでした（${(e as Error).message}）`);
                        }
                      }}
                    >
                      フルで聴く
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/** ミニプレイヤー。下部ナビのすぐ上に常駐し、タップで全画面プレイヤーを開く */
export function MiniPlayer() {
  const item = usePlayer(currentItem);
  const pos = usePlayer((s) => s.positionSec);
  const dur = usePlayer((s) => s.durationSec);
  const status = usePlayer((s) => s.status);
  if (!item) return null;
  const openPanel = () => getPlayerStore().getState().setPanelOpen(true);
  return (
    <div
      className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl lg:bottom-4 lg:left-20"
      data-testid="mini-player"
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="再生パネルを開く"
        className="bg-card relative flex h-16 items-center gap-3 overflow-hidden rounded-2xl border pr-1 pl-2 shadow-lg"
        onClick={openPanel}
        onKeyDown={(e) => e.key === "Enter" && openPanel()}
      >
        <Artwork src={item.artwork_url} seed={item.track_id} alt="" className="size-12 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{item.title}</div>
          <div className="text-muted-foreground truncate text-sm">{item.artist_name}</div>
        </div>
        {status === "awaiting_user" ? (
          <ServiceBadge service="bandcamp" />
        ) : (
          <PlayPause className="size-12" iconClass="size-5" />
        )}
        <button
          type="button"
          aria-label="次の曲"
          className="flex size-12 items-center justify-center rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
        >
          <SkipForward className="size-5 fill-current" />
        </button>
        <div className="bg-muted absolute inset-x-0 bottom-0 h-[3px]">
          <div className="bg-brand h-full transition-[width]" style={{ width: dur ? `${(pos / dur) * 100}%` : "0%" }} />
        </div>
      </div>
    </div>
  );
}
