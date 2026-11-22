"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CalendarDays, ChevronLeft, Heart, Loader2, Pause, Play, Send } from "lucide-react";
import { toast } from "sonner";
import { ArtistInput } from "@/components/artist-input";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { Artwork } from "@/components/player/artwork";
import { ServiceBadge } from "@/components/player/service-badge";
import { TrackList, usePlayList } from "@/components/player/track-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { appConfig } from "@/lib/config";
import type { PitchView } from "@/lib/repo/campaigns";
import type { Campaign, QueueItem, Service } from "@/lib/types";
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
  unsupported_domain: "Apple Music・SoundCloud・Bandcamp の曲URLを入力してください",
  soundcloud_set_unsupported: "SoundCloud のプレイリスト（セット）は対象外です。曲のURLを入力してください",
  soundcloud_not_embeddable_or_missing: "SoundCloud の曲が見つからないか、埋め込みが許可されていません",
  bandcamp_page_not_found: "Bandcamp のページが見つかりません",
  apple_song_not_found: "Apple Music の曲が見つかりません",
};

function PitchForm({ campaignId, remaining, onDone }: { campaignId: string; remaining: number; onDone: () => void }) {
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
  const { data: preview, isLoading: previewLoading } = useSWR<Preview>(
    debounced ? `/api/resolve-preview?url=${encodeURIComponent(debounced)}` : null,
    fetcher,
  );
  const valid = preview?.ok && refs.length >= minReferenceArtists && comment.length <= commentMaxLength;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="brand" disabled={remaining <= 0} data-testid="open-pitch-form">
          <Send />
          曲を推薦する（残り{remaining}件）
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await apiSend(`/api/campaigns/${campaignId}/pitches`, "POST", {
                url: url.trim(),
                reference_artists: refs,
                comment,
              });
              toast("推薦を送信しました。審査後に公開されます");
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
          <DialogHeader>
            <DialogTitle>曲を推薦する</DialogTitle>
            <DialogDescription>推薦は管理者の審査後に公開され、好きなアーティストが一致するリスナーに届きます。</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="pitch-url">1. 曲のURL</Label>
            <Input
              id="pitch-url"
              inputMode="url"
              placeholder="https://… (Apple Music / SoundCloud / Bandcamp)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            {debounced && (
              <div className="min-h-12" aria-live="polite">
                {previewLoading ? (
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    曲を確認しています…
                  </p>
                ) : preview?.ok ? (
                  <div className="flex items-center gap-3 rounded-md border p-2" data-testid="pitch-preview">
                    <Artwork src={preview.artwork_url} seed={preview.title} alt="" className="size-10" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{preview.title}</div>
                      <div className="text-muted-foreground truncate text-xs">{preview.artist}</div>
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
              2. このアーティストが好きな人へ（{minReferenceArtists}〜{maxReferenceArtists}組）
            </Label>
            <ArtistInput
              id="pitch-refs"
              value={refs.map((r) => ({ key: r, name: r }))}
              onAdd={(n) => setRefs((rs) => [...rs, n])}
              onRemove={(k) => setRefs((rs) => rs.filter((r) => r !== k))}
              max={maxReferenceArtists}
              placeholder="例: 好きな人に届けたいアーティスト"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pitch-comment">3. ひとこと</Label>
            <Textarea
              id="pitch-comment"
              placeholder="どんな場面で聴いてほしいか、聴きどころなど"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={commentMaxLength}
            />
            <p className="text-muted-foreground text-right text-xs">
              {comment.length}/{commentMaxLength}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!valid || busy}>
              {busy && <Loader2 className="animate-spin" />}
              推薦を送信
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HowToPitch() {
  const { user } = useMe();
  return (
    <Alert>
      <AlertTitle>推薦できるのは目利きとアーティスト本人です</AlertTitle>
      <AlertDescription>
        {user ? (
          <p>
            目利きの方は<Link className="underline underline-offset-4" href="/settings#curator">本人確認</Link>
            、アーティストの方は<Link className="underline underline-offset-4" href="/settings#role">アーティストとして参加</Link>
            すると推薦できます。
          </p>
        ) : (
          <p>
            <Link className="underline underline-offset-4" href="/login?next=/campaigns">ログイン</Link>
            して、目利きの本人確認またはアーティスト登録をすると推薦できます。
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}

function PitchMeta({ p }: { p: PitchView }) {
  return (
    <div className="mt-1.5 space-y-1">
      {p.comment && <p className="text-sm">“{p.comment}”</p>}
      <p className="text-muted-foreground text-xs">
        {p.submitter_type === "artist" ? "アーティスト本人" : p.submitter_label} の推薦
        {p.matched && (
          <Badge variant="brand" className="ml-2 h-4 px-1 text-[10px]">
            <Heart className="size-2.5" />
            あなたの好みに一致
          </Badge>
        )}
      </p>
    </div>
  );
}

function PlayPitches({ items, label }: { items: QueueItem[]; label: string }) {
  const list = usePlayList(items, label);
  return (
    <Button onClick={list.toggleAll} disabled={items.length === 0} variant="outline" size="sm">
      {list.playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
      {list.playing ? "一時停止" : "まとめて再生"}
    </Button>
  );
}

const STATUS_LABEL = { pending: "審査中", approved: "公開中", rejected: "却下" } as const;

export function CampaignDetailView({ id }: { id: string }) {
  const { data, error, isLoading, mutate } = useSWR<Detail>(`/api/campaigns/${id}`, fetcher);
  if (error) return <ErrorState message={error.message} onRetry={() => mutate()} />;
  if (isLoading || !data) return <ListSkeleton />;
  const { campaign: c, pitches } = data;
  const matched = pitches.filter((p) => p.matched && p.item);
  const rest = pitches.filter((p) => !p.matched && p.item);
  const byTrack = new Map(pitches.map((p) => [p.item?.track_id, p]));
  const label = c.title;

  return (
    <div className="space-y-8">
      <Link href="/campaigns" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ChevronLeft className="size-4" />
        キャンペーン一覧
      </Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CampaignStatusBadge c={c} />
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <CalendarDays className="size-3.5" />
            {formatDate(c.starts_at)} 〜 {formatDate(c.ends_at)} ・ 1人{c.max_pitches_per_user}件まで
          </span>
        </div>
        <h1 className="text-2xl font-bold sm:text-3xl">{c.title}</h1>
        <p className="text-muted-foreground max-w-2xl text-sm whitespace-pre-line">{c.description}</p>
        {c.accepting &&
          (data.can_pitch ? (
            <PitchForm campaignId={c.id} remaining={data.remaining} onDone={() => mutate()} />
          ) : (
            <HowToPitch />
          ))}
      </header>

      {data.mine.length > 0 && (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-base">あなたの推薦</CardTitle>
            <CardDescription>審査が終わると公開されます。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4">
            {data.mine.map((p) => (
              <div key={p.id} className="flex items-center gap-3" data-testid="my-pitch">
                <Artwork src={p.item?.artwork_url ?? null} seed={p.item?.track_id} alt="" className="size-9" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.item?.title}</div>
                  {p.status === "rejected" && p.reject_reason && (
                    <div className="text-destructive text-xs">却下理由: {p.reject_reason}</div>
                  )}
                </div>
                <Badge variant={p.status === "approved" ? "brand" : p.status === "rejected" ? "destructive" : "outline"}>
                  {STATUS_LABEL[p.status]}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {matched.length > 0 && (
        <section className="space-y-2" data-testid="matched-pitches">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Heart className="text-brand size-5" />
              あなたへの推薦
            </h2>
            <PlayPitches items={matched.map((p) => p.item!)} label={label} />
          </div>
          <TrackList items={matched.map((p) => p.item!)} label={label} extra={(it) => <PitchMeta p={byTrack.get(it.track_id)!} />} />
        </section>
      )}

      {(rest.length > 0 || matched.length === 0) && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{matched.length ? "その他の推薦" : "推薦された曲"}</h2>
            {rest.length > 0 && <PlayPitches items={rest.map((p) => p.item!)} label={label} />}
          </div>
          {rest.length === 0 && matched.length === 0 ? (
            <EmptyState title="まだ公開された推薦はありません" />
          ) : (
            <TrackList items={rest.map((p) => p.item!)} label={label} extra={(it) => <PitchMeta p={byTrack.get(it.track_id)!} />} />
          )}
          {matched.length === 0 && pitches.length > 0 && (
            <p className="text-muted-foreground text-xs">
              <Link href="/settings#favorites" className="underline underline-offset-4">好きなアーティスト</Link>
              を登録すると、あなたに合う推薦が上にまとまります。
            </p>
          )}
        </section>
      )}
    </div>
  );
}
