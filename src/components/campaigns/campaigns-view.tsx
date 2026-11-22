"use client";

import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, CalendarDays, Megaphone } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { fetcher } from "@/lib/client/api";
import type { Campaign } from "@/lib/types";

export type CampaignListItem = Campaign & { accepting: boolean; approved_count: number; pending_count: number };

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

export function CampaignStatusBadge({ c }: { c: Pick<CampaignListItem, "status" | "accepting"> }) {
  if (c.status === "draft") return <Badge variant="outline">下書き</Badge>;
  if (c.status === "closed") return <Badge variant="secondary">終了</Badge>;
  return c.accepting ? <Badge variant="brand">募集中</Badge> : <Badge variant="outline">期間外</Badge>;
}

export function CampaignsView() {
  const { data, error, isLoading, mutate } = useSWR<{ campaigns: CampaignListItem[]; matched_count: number }>(
    "/api/campaigns",
    fetcher,
  );
  const campaigns = data?.campaigns ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="推薦キャンペーン"
        description="目利きとアーティスト本人が「このアーティストが好きな人に聴いてほしい」を添えて曲を推薦します。あなたの好きなアーティストと一致した推薦は、発見のキューにも届きます。"
      />
      {error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : isLoading ? (
        <ListSkeleton rows={3} />
      ) : campaigns.length === 0 ? (
        <EmptyState icon={<Megaphone className="size-6" />} title="開催中のキャンペーンはありません" />
      ) : (
        <div className="grid gap-3">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}`} data-testid="campaign-card">
              <Card className="hover:bg-accent/40 gap-3 py-5 transition-colors">
                <CardContent className="flex items-start gap-4 px-5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CampaignStatusBadge c={c} />
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        <CalendarDays className="size-3.5" />
                        {formatDate(c.starts_at)} 〜 {formatDate(c.ends_at)}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold">{c.title}</h2>
                    <p className="text-muted-foreground line-clamp-2 text-sm">{c.description}</p>
                    <p className="text-muted-foreground text-xs">推薦 {c.approved_count}曲</p>
                  </div>
                  <ArrowRight className="text-muted-foreground mt-1 size-5 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
