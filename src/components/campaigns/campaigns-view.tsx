"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Megaphone } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common";
import { ScreenHeader } from "@/components/layout/app-shell";
import { fetcher } from "@/lib/client/api";
import type { Campaign } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CampaignListItem = Campaign & { accepting: boolean; approved_count: number; pending_count: number };

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export function CampaignStatusBadge({ c }: { c: Pick<CampaignListItem, "status" | "accepting"> }) {
  const [label, cls] =
    c.status === "draft"
      ? ["下書き", "border"]
      : c.status === "closed"
        ? ["終了", "bg-muted text-muted-foreground"]
        : c.accepting
          ? ["募集中", "bg-brand text-brand-foreground"]
          : ["期間外", "border"];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold", cls)}>{label}</span>;
}

export function CampaignsView() {
  const { data, error, isLoading, mutate } = useSWR<{ campaigns: CampaignListItem[] }>("/api/campaigns", fetcher);
  const campaigns = data?.campaigns ?? [];
  return (
    <div className="space-y-4">
      <ScreenHeader title="推薦" />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <ListSkeleton rows={3} />
      ) : campaigns.length === 0 ? (
        <EmptyState icon={<Megaphone className="size-6" />} title="開催中のキャンペーンはありません" />
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              data-testid="campaign-card"
              className={cn("bg-card active:bg-accent flex items-center gap-3 rounded-3xl border p-5", c.status === "closed" && "opacity-60")}
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <CampaignStatusBadge c={c} />
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatDate(c.starts_at)}–{formatDate(c.ends_at)}
                  </span>
                </div>
                <h2 className="text-lg leading-snug font-bold">{c.title}</h2>
                <p className="text-muted-foreground text-sm tabular-nums">{c.approved_count}曲</p>
              </div>
              <ChevronRight className="text-muted-foreground size-5 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
