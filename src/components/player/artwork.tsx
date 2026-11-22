/* eslint-disable @next/next/no-img-element -- 外部サービスのアートワークを最適化せずに表示する */
"use client";

import { Disc3 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** アートワークが無い曲用。曲ごとに決まるグラデーション */
function generated(seed: string) {
  const h = hash(seed);
  const a = h % 360;
  const b = (a + 40 + (h % 80)) % 360;
  return `linear-gradient(135deg, oklch(0.72 0.12 ${a}), oklch(0.45 0.1 ${b}))`;
}

export function Artwork({
  src,
  alt,
  seed,
  className,
}: {
  src: string | null;
  alt: string;
  seed?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <div
      className={cn("bg-muted relative shrink-0 overflow-hidden rounded-md", className)}
      style={!showImg && seed ? { background: generated(seed) } : undefined}
    >
      {showImg ? (
        <img src={src} alt={alt} loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className={cn("flex size-full items-center justify-center", seed ? "text-white/70" : "text-muted-foreground")}>
          <Disc3 className="size-1/2" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}

export function EqualizerIcon({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <span className={cn("flex h-3.5 items-end gap-[2px]", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("bg-brand w-[3px] rounded-sm", playing ? "animate-pulse" : "")}
          style={{ height: playing ? `${[60, 100, 40][i]}%` : "30%", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
