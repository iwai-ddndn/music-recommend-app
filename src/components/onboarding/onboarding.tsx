"use client";

// 初回の好み取り。読ませず、タップだけで30秒以内に終わる2ステップ。
//   1. 好きなシーンを選ぶ（大きなタイル。中のアートワークで中身が分かる）
//   2. 知っているアーティストを選ぶ（丸いアートワーク）→「はじめる」でそのまま再生が始まる
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, ArrowRight, Check, Play } from "lucide-react";
import { Artwork } from "@/components/player/artwork";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/client/api";
import { useProfile } from "@/lib/client/profile";
import type { CuratorListItem } from "@/lib/repo/curators";
import { anchors, anchorTagVector, scenes } from "@/lib/taste/vocabulary";
import { cn } from "@/lib/utils";

function Dots({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`ステップ ${step + 1} / 2`}>
      {[0, 1].map((i) => (
        <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "bg-foreground w-6" : "bg-muted-foreground/30 w-1.5")} />
      ))}
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  // 目利きのプロフィール（好みに合う目利きを仮フォローするため）
  const { data } = useSWR<{ curators: CuratorListItem[] }>("/api/curators", fetcher);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // 選んだシーンのアーティストを先に並べる
  const ordered = useMemo(() => {
    const score = (tags: string[]) => tags.filter((t) => picked.includes(t)).length;
    return [...anchors].sort((a, b) => score(b.tags) - score(a.tags)).slice(0, 18);
  }, [picked]);

  const finish = () => {
    useProfile.getState().completeOnboarding({
      scenes: picked,
      anchors: anchors.filter((a) => artists.includes(a.name)).map((a) => ({ name: a.name, tags: anchorTagVector(a) })),
      curators: (data?.curators ?? []).map((c) => ({ id: c.id, tags: c.profile_tags })),
    });
    onDone();
  };

  return (
    <div className="bg-background fixed inset-0 z-[60] flex flex-col" data-testid="onboarding">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        {step === 1 ? (
          <Button variant="ghost" className="size-11 rounded-full" aria-label="戻る" onClick={() => setStep(0)}>
            <ArrowLeft className="size-5" />
          </Button>
        ) : (
          <span className="size-11" />
        )}
        <Dots step={step} />
        <Button
          variant="ghost"
          className="text-muted-foreground h-11 rounded-full"
          onClick={() => {
            if (step === 0 && picked.length === 0) useProfile.getState().skipOnboarding();
            else finish();
          }}
        >
          スキップ
        </Button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-4 pb-28">
        {step === 0 ? (
          <>
            <h1 className="py-5 text-[28px] leading-tight font-bold">どんな音が好き？</h1>
            <div className="grid grid-cols-2 gap-3">
              {scenes.map((s) => {
                const on = picked.includes(s.id);
                const arts = anchors.filter((a) => a.tags.includes(s.id)).slice(0, 4);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    data-testid={`scene-${s.id}`}
                    onClick={() => toggle(picked, setPicked, s.id)}
                    className={cn(
                      "relative overflow-hidden rounded-3xl border-2 text-left transition-all active:scale-[0.97]",
                      on ? "border-brand" : "border-transparent",
                    )}
                  >
                    <div className="grid aspect-[4/3] grid-cols-2">
                      {arts.map((a) => (
                        <Artwork key={a.name} src={a.artwork_url} seed={a.name} alt="" className="size-full rounded-none" />
                      ))}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <span className="absolute bottom-3 left-3 text-base font-bold text-white">{s.label}</span>
                    {on && (
                      <span className="bg-brand text-brand-foreground absolute top-2 right-2 flex size-7 items-center justify-center rounded-full">
                        <Check className="size-4" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <h1 className="py-5 text-[28px] leading-tight font-bold">よく聴くのは？</h1>
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {ordered.map((a) => {
                const on = artists.includes(a.name);
                return (
                  <button
                    key={a.name}
                    type="button"
                    aria-pressed={on}
                    data-testid="anchor"
                    onClick={() => toggle(artists, setArtists, a.name)}
                    className="flex flex-col items-center gap-2 transition-transform active:scale-95"
                  >
                    <span className={cn("relative rounded-full p-1 ring-2", on ? "ring-brand" : "ring-transparent")}>
                      <Artwork src={a.artwork_url} seed={a.name} alt="" className="aspect-square w-full rounded-full" />
                      {on && (
                        <span className="bg-brand text-brand-foreground absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full">
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="line-clamp-1 text-sm font-medium">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="from-background via-background fixed inset-x-0 bottom-0 bg-gradient-to-t to-transparent px-4 pt-8 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          {step === 0 ? (
            <Button
              variant="brand"
              className="h-14 w-full rounded-full text-base font-bold"
              disabled={picked.length === 0}
              data-testid="onboarding-next"
              onClick={() => setStep(1)}
            >
              次へ
              <ArrowRight className="size-5" />
            </Button>
          ) : (
            <Button variant="brand" className="h-14 w-full rounded-full text-base font-bold" data-testid="onboarding-start" onClick={finish}>
              <Play className="size-5 fill-current" />
              聴きはじめる
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
