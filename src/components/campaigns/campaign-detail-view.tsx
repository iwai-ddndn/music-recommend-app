"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Heart, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { ArtistInput } from "@/components/artist-input";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { ScreenHeader } from "@/components/layout/app-shell";
import { Artwork } from "@/components/player/artwork";
import { ServiceBadge } from "@/components/player/service-badge";
import { PlayFab, TrackList } from "@/components/player/track-list";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { useProfile } from "@/lib/client/profile";
import { appConfig } from "@/lib/config";
import type { PitchView } from "@/lib/repo/campaigns";
import type { Campaign, Service } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CampaignStatusBadge, formatDate } from "./campaigns-view";

type Detail = {
  campaign: Campaign & { accepting: boolean };
  pitches: PitchView[];
  mine: PitchView[];
  can_pitch: boolean;
  submitter_type: "curator" | "artist" | null;
  remaining: number;
};

type Preview =
  | { ok: true; title: string; artist: string; artwork_url: string | null; service: Service }
  | { ok: false; reason: string };

const REASON_TEXT: Record<string, string> = {
  unsupported_domain: "Apple Music・SoundCloud・Bandcamp のURLを入れてください",
  soundcloud_set_unsupported: "プレイリストではなく曲のURLを入れてください",
  soundcloud_not_embeddable_or_missing: "曲が見つからないか、埋め込みが許可されていません",
  bandcamp_page_not_found: "ページが見つかりません",
  apple_song_not_found: "曲が見つかりません",
};

/** 推薦の投稿。下からのシートに、URL → 届けたい相手 → ひとこと の3つだけ */
function PitchSheet({ campaignId, remaining, onDone }: { campaignId: string; remaining: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [debounced, setDebounced] = useState("");
  const [refs, setRefs] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const { minReferenceArtists, maxReferenceArtists, commentMaxLength } = appConfig.campaigns;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(url.trim()), 500);
    return () => clearTimeout(t);
  }, [url]);
  const { data: preview, isLoading } = useSWR<Preview>(
    debounced ? `/api/resolve-preview?url=${encodeURIComponent(debounced)}` : null,
    fetcher,
  );
  const valid = preview?.ok && refs.length >= minReferenceArtists && comment.length <= commentMaxLength;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="brand" className="h-14 w-full rounded-full text-base font-bold" disabled={remaining <= 0} data-testid="open-pitch-form">
          <Send className="size-5" />
          曲を推薦する
          <span className="bg-brand-foreground/15 rounded-full px-2 text-sm tabular-nums">残り{remaining}</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <form
          className="flex min-h-0 flex-col"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await apiSend(`/api/campaigns/${campaignId}/pitches`, "POST", { url: url.trim(), reference_artists: refs, comment });
              toast("推薦を送信しました");
              setOpen(false);
              setUrl("");
              setRefs([]);
              setComment("");
              onDone();
            } catch (err) {
              toast.error((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <DrawerHeader>
            <DrawerTitle>曲を推薦する</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-5 overflow-y-auto px-5">
            <div className="space-y-2">
              <Label htmlFor="pitch-url">曲のURL</Label>
              <Input id="pitch-url" className="h-12" inputMode="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} required />
              {debounced && (
                <div aria-live="polite">
                  {isLoading ? (
                    <Loader2 className="text-muted-foreground size-5 animate-spin" />
                  ) : preview?.ok ? (
                    <div className="bg-muted flex items-center gap-3 rounded-2xl p-2" data-testid="pitch-preview">
                      <Artwork src={preview.artwork_url} seed={preview.title} alt="" className="size-12 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{preview.title}</div>
                        <div className="text-muted-foreground truncate text-sm">{preview.artist}</div>
                      </div>
                      <ServiceBadge service={preview.service} />
                    </div>
                  ) : preview ? (
                    <p className="text-destructive text-sm">{REASON_TEXT[preview.reason] ?? `曲を特定できませんでした（${preview.reason}）`}</p>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pitch-refs">
                このアーティストが好きな人へ
                <span className="text-muted-foreground font-normal tabular-nums">
                  {refs.length}/{maxReferenceArtists}
                </span>
              </Label>
              <ArtistInput
                id="pitch-refs"
                value={refs.map((r) => ({ key: r, name: r }))}
                onAdd={(n) => setRefs((rs) => [...rs, n])}
                onRemove={(k) => setRefs((rs) => rs.filter((r) => r !== k))}
                max={maxReferenceArtists}
                placeholder="アーティスト名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pitch-comment">
                ひとこと
                <span className="text-muted-foreground font-normal tabular-nums">
                  {comment.length}/{commentMaxLength}
                </span>
              </Label>
              <Textarea id="pitch-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={commentMaxLength} />
            </div>
          </div>
          <DrawerFooter>
            <Button type="submit" className="h-12 rounded-full text-base" disabled={!valid || busy}>
              {busy && <Loader2 className="animate-spin" />}
              推薦を送信
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

/** 投稿できない立場の人には、次の一歩になる2つの入口だけを見せる */
function HowToPitch() {
  const { user } = useMe();
  if (!user) {
    return (
      <Button asChild variant="outline" className="h-12 w-full rounded-full">
        <Link href="/login?next=/campaigns">ログインして推薦する</Link>
      </Button>
    );
  }
  return (
    <div className="space-y-2" data-testid="how-to-pitch">
      <p className="text-muted-foreground text-sm">推薦できるのは目利きとアーティスト本人です</p>
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-12 rounded-full">
          <Link href="/settings#curator">目利きの本人確認</Link>
        </Button>
        <Button asChild variant="outline" className="h-12 rounded-full">
          <Link href="/settings#role">アーティスト登録</Link>
        </Button>
      </div>
    </div>
  );
}

function PitchMeta({ p }: { p: PitchView }) {
  return (
    <div className="mt-1 space-y-0.5">
      {p.comment && <p className="line-clamp-2 text-sm">“{p.comment}”</p>}
      <p className="text-muted-foreground truncate text-xs">
        {p.submitter_type === "artist" ? "本人" : p.submitter_label} → {p.reference_artists.map((a) => a.name).join("、")}
      </p>
    </div>
  );
}

const STATUS = {
  pending: ["審査中", "border"],
  approved: ["公開中", "bg-brand text-brand-foreground"],
  rejected: ["却下", "bg-destructive text-white"],
} as const;

export function CampaignDetailView({ id }: { id: string }) {
  // 未ログインでも、端末で選んだ好きなアーティストと突き合わせる
  const favorites = useProfile((s) => s.favorites);
  const { data, error, isLoading, mutate } = useSWR<Detail>(
    `/api/campaigns/${id}?fav=${encodeURIComponent(favorites.join("|"))}`,
    fetcher,
  );
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <ListSkeleton />;
  const { campaign: c, pitches } = data;
  const matched = pitches.filter((p) => p.matched && p.item);
  const rest = pitches.filter((p) => !p.matched && p.item);
  const byTrack = new Map(pitches.map((p) => [p.item?.track_id, p]));
  const all = [...matched, ...rest].map((p) => p.item!);

  return (
    <div className="space-y-6">
      <ScreenHeader title="" back={{ href: "/campaigns", label: "推薦" }} />
      <header className="space-y-3">
        <div className="flex items-center gap-2">
          <CampaignStatusBadge c={c} />
          <span className="text-muted-foreground text-xs tabular-nums">
            {formatDate(c.starts_at)}–{formatDate(c.ends_at)}
          </span>
        </div>
        <div className="flex items-end gap-3">
          <h1 className="flex-1 text-[26px] leading-tight font-bold">{c.title}</h1>
          <PlayFab items={all} label={c.title} />
        </div>
        {c.description && <p className="text-muted-foreground text-sm whitespace-pre-line">{c.description}</p>}
      </header>

      {c.accepting &&
        (data.can_pitch ? <PitchSheet campaignId={c.id} remaining={data.remaining} onDone={() => mutate()} /> : <HowToPitch />)}

      {data.mine.length > 0 && (
        <section className="bg-card space-y-3 rounded-3xl border p-4">
          <h2 className="font-bold">あなたの推薦</h2>
          {data.mine.map((p) => (
            <div key={p.id} className="flex items-center gap-3" data-testid="my-pitch">
              <Artwork src={p.item?.artwork_url ?? null} seed={p.item?.track_id} alt="" className="size-11 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.item?.title}</div>
                {p.status === "rejected" && p.reject_reason && <div className="text-destructive truncate text-xs">{p.reject_reason}</div>}
              </div>
              <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold", STATUS[p.status][1])}>
                {STATUS[p.status][0]}
              </span>
            </div>
          ))}
        </section>
      )}

      {matched.length > 0 && (
        <section className="bg-brand/10 rounded-3xl p-4" data-testid="matched-pitches">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            <Heart className="fill-brand text-brand size-5" />
            あなたへ
          </h2>
          <TrackList items={matched.map((p) => p.item!)} label={c.title} showWhy={false} extra={(it) => <PitchMeta p={byTrack.get(it.track_id)!} />} />
        </section>
      )}

      {rest.length > 0 ? (
        <section>
          <h2 className="mb-1 text-lg font-bold">{matched.length ? "ほかの推薦" : "推薦された曲"}</h2>
          <TrackList items={rest.map((p) => p.item!)} label={c.title} showWhy={false} extra={(it) => <PitchMeta p={byTrack.get(it.track_id)!} />} />
        </section>
      ) : (
        matched.length === 0 && <EmptyState title="まだ公開された推薦はありません" />
      )}
    </div>
  );
}
