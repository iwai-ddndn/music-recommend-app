"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, Check, Loader2, Pause, Play, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/common";
import { CampaignStatusBadge, formatDate, type CampaignListItem } from "@/components/campaigns/campaigns-view";
import { Artwork } from "@/components/player/artwork";
import * as controls from "@/components/player/controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { getPlayerStore } from "@/lib/player/store";
import type { adminCurators, adminOverview } from "@/lib/repo/admin";
import type { PitchView } from "@/lib/repo/campaigns";

type Overview = Awaited<ReturnType<typeof adminOverview>>;
type AdminCurator = Awaited<ReturnType<typeof adminCurators>>[number];

async function act(fn: () => Promise<unknown>, ok: string, after: () => void) {
  try {
    await fn();
    toast(ok);
    after();
  } catch (e) {
    toast.error((e as Error).message);
  }
}

function OverviewTab() {
  const { data, mutate } = useSWR<Overview>("/api/admin/overview", fetcher);
  const [running, setRunning] = useState<string | null>(null);
  if (!data) return <ListSkeleton rows={3} />;
  const { budget, counts } = data;
  const maxUnits = Math.max(1, ...data.usage.map((u) => u.units));
  const run = async (job: "daily" | "score") => {
    setRunning(job);
    await act(
      () => apiSend("/api/admin/batch", "POST", { job }),
      job === "daily" ? "収集バッチを実行しました" : "スコアを再計算しました",
      () => mutate(),
    );
    setRunning(null);
  };
  return (
    <div className="space-y-4">
      {budget.exceeded && (
        <Alert variant="destructive" data-testid="budget-alert">
          <AlertTriangle />
          <AlertTitle>X API の当月予算に達したため、収集を停止しています</AlertTitle>
          <AlertDescription>
            推定 ${budget.spent_usd.toFixed(2)} / 予算 ${budget.monthly_budget_usd.toFixed(2)}。翌月になるか、X_MONTHLY_BUDGET_USD を見直すと再開します。
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["有効な目利き", counts.active_curators],
          ["承認待ちの目利き", counts.pending_curators],
          ["審査待ちの推薦", counts.pending_pitches],
          ["停止中の目利き", counts.paused_curators],
        ].map(([label, n]) => (
          <Card key={label as string} className="gap-1 py-4">
            <CardContent className="px-4">
              <div className="text-muted-foreground text-xs">{label}</div>
              <div className="text-2xl font-semibold tabular-nums">{n}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">X API の費用（当月）</CardTitle>
          <CardDescription>
            ポスト読み取り1件あたりの推定単価で計算しています。正確な請求額は X の Developer Console を確認してください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="tabular-nums">${budget.spent_usd.toFixed(2)}</span>
              <span className="text-muted-foreground tabular-nums">
                {budget.monthly_budget_usd ? `予算 $${budget.monthly_budget_usd.toFixed(2)}` : "予算未設定（X_MONTHLY_BUDGET_USD）"}
              </span>
            </div>
            <Progress value={Math.min(100, (budget.ratio ?? 0) * 100)} />
          </div>
          {data.usage.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1 text-xs">直近30日の読み取り件数</div>
              <div className="flex h-20 items-end gap-1" aria-label="日別の読み取り件数">
                {data.usage.map((u) => (
                  <div
                    key={u.date}
                    title={`${u.date}: ${u.units}件 / $${u.estimated_usd.toFixed(3)}`}
                    className="bg-brand/70 max-w-6 min-w-1 flex-1 rounded-t-sm"
                    style={{ height: `${(u.units / maxUnits) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => run("daily")} disabled={!!running}>
              {running === "daily" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              収集バッチを今すぐ実行
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("score")} disabled={!!running}>
              スコアだけ再計算
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            最終スコア計算: {data.last_scored_at ? new Date(data.last_scored_at).toLocaleString("ja-JP") : "—"} ／ 取得済み最新ポストID:{" "}
            {data.last_since_id ?? "—"}
          </p>
        </CardContent>
      </Card>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">解決できなかったURL</CardTitle>
          <CardDescription>捨てずに失敗理由つきで残しています。</CardDescription>
        </CardHeader>
        <CardContent>
          {data.failures.length === 0 ? (
            <p className="text-muted-foreground text-sm">ありません</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>理由</TableHead>
                  <TableHead>経路</TableHead>
                  <TableHead>日時</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.failures.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-[280px] truncate font-mono text-xs">
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {f.url}
                      </a>
                    </TableCell>
                    <TableCell className="text-xs">{f.reason}</TableCell>
                    <TableCell className="text-xs">{f.origin === "collect" ? "収集" : "推薦"}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(f.created_at).toLocaleDateString("ja-JP")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WeightInput({ c, onSaved }: { c: AdminCurator; onSaved: () => void }) {
  const [w, setW] = useState(String(c.base_weight));
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void act(
          () => apiSend(`/api/admin/curators/${c.id}`, "POST", { action: "weight", base_weight: Number(w) }),
          "ウェイトを更新しました",
          onSaved,
        );
      }}
    >
      <Input
        aria-label={`@${c.x_handle} のウェイト`}
        type="number"
        step="0.1"
        min="0"
        max="10"
        className="h-8 w-20"
        value={w}
        onChange={(e) => setW(e.target.value)}
      />
      {Number(w) !== c.base_weight && (
        <Button size="icon-sm" variant="ghost" type="submit" aria-label="保存">
          <Check />
        </Button>
      )}
    </form>
  );
}

function AddCuratorDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("1");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus />
          目利きを追加
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () =>
                apiSend("/api/admin/curators", "POST", {
                  handle,
                  display_name: name || undefined,
                  base_weight: Number(weight),
                }),
              "承認待ちに追加しました。「承認」で x_user_id を取得します",
              () => {
                setOpen(false);
                setHandle("");
                setName("");
                onAdded();
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>目利きを追加</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-xs">まとめて登録する場合は `npm run curators:import -- file.csv` を使ってください。</p>
          <div className="space-y-2">
            <Label htmlFor="add-handle">Xのハンドル</Label>
            <Input id="add-handle" value={handle} onChange={(e) => setHandle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-name">表示名</Label>
            <Input id="add-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-weight">ウェイト</Label>
            <Input id="add-weight" type="number" step="0.1" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit">追加</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CURATOR_STATUS = { pending: "承認待ち", active: "有効", paused: "停止中" } as const;

function CuratorsTab() {
  const { data, mutate } = useSWR<{ curators: AdminCurator[] }>("/api/admin/curators", fetcher);
  if (!data) return <ListSkeleton rows={4} />;
  const refresh = () => void mutate();
  const post = (c: AdminCurator, action: string, ok: string) =>
    act(() => apiSend(`/api/admin/curators/${c.id}`, "POST", { action }), ok, refresh);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AddCuratorDialog onAdded={refresh} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>目利き</TableHead>
            <TableHead>状態</TableHead>
            <TableHead>推薦票</TableHead>
            <TableHead>ウェイト</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.curators.map((c) => (
            <TableRow key={c.id} data-testid={`admin-curator-${c.x_handle}`}>
              <TableCell>
                <div className="font-medium">{c.display_name}</div>
                <div className="text-muted-foreground text-xs">
                  @{c.x_handle} {c.x_user_id ? `· id ${c.x_user_id}` : "· x_user_id 未取得"}
                </div>
                {c.comments.length > 0 && (
                  <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                    {c.comments.slice(0, 3).map((m, i) => (
                      <li key={i}>
                        「{m.comment}」— {m.by}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={c.status === "active" ? "brand" : c.status === "paused" ? "secondary" : "outline"}>
                  {CURATOR_STATUS[c.status]}
                </Badge>
              </TableCell>
              <TableCell className="tabular-nums">{c.votes}</TableCell>
              <TableCell>
                <WeightInput c={c} onSaved={refresh} />
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                {c.status === "pending" && (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => post(c, "approve", `@${c.x_handle} を承認しました`)}>
                      承認
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => post(c, "reject", `@${c.x_handle} の申請を却下しました`)}>
                      却下
                    </Button>
                  </div>
                )}
                {c.status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => post(c, "pause", `@${c.x_handle} を停止しました`)}>
                    停止
                  </Button>
                )}
                {c.status === "paused" && (
                  <Button size="sm" variant="outline" onClick={() => post(c, "activate", `@${c.x_handle} を再開しました`)}>
                    再開
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground text-xs">停止すると収集を止め、既存の言及もおすすめから外します（本人からの申し出に対応）。</p>
    </div>
  );
}

function RejectForm({ onReject }: { onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <X />
          却下
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            onReject(reason);
            setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>推薦を却下</DialogTitle>
          </DialogHeader>
          <Label htmlFor="reject-reason">却下理由（投稿者に表示されます）</Label>
          <Textarea id="reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={200} />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={!reason.trim()}>
              却下する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PitchesTab() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const { data, mutate } = useSWR<{ pitches: (PitchView & { campaign_title: string })[] }>(
    `/api/admin/pitches?status=${status}`,
    fetcher,
  );
  const review = (id: string, action: "approve" | "reject", reason?: string) =>
    act(
      () => apiSend(`/api/admin/pitches/${id}`, "POST", { action, reason: reason ?? null }),
      action === "approve" ? "承認しました" : "却下しました",
      () => void mutate(),
    );
  return (
    <div className="space-y-3">
      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
        <TabsList>
          <TabsTrigger value="pending">審査待ち</TabsTrigger>
          <TabsTrigger value="approved">承認済み</TabsTrigger>
          <TabsTrigger value="rejected">却下</TabsTrigger>
        </TabsList>
      </Tabs>
      {!data ? (
        <ListSkeleton rows={3} />
      ) : data.pitches.length === 0 ? (
        <EmptyState title="該当する推薦はありません" />
      ) : (
        <div className="space-y-3">
          {data.pitches.map((p) => (
            <Card key={p.id} className="gap-2 py-4" data-testid="admin-pitch">
              <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-start">
                <button
                  className="group relative self-start"
                  aria-label="試聴"
                  onClick={() => {
                    if (!p.item) return;
                    controls.markUserGesture();
                    getPlayerStore().getState().playQueue([p.item], 0, "推薦審査");
                  }}
                >
                  <Artwork src={p.item?.artwork_url ?? null} seed={p.item?.track_id} alt="" className="size-14" />
                  <Play className="absolute inset-0 m-auto size-5 fill-white text-white opacity-0 group-hover:opacity-100" />
                </button>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-medium">
                    {p.item?.title} <span className="text-muted-foreground font-normal">— {p.item?.artist_name}</span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {p.campaign_title} ・ {p.submitter_type === "artist" ? "アーティスト本人" : "目利き"}（{p.submitter_label}）
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.reference_artists.map((a) => (
                      <Badge key={a.id} variant="secondary" className="font-normal">
                        {a.name}が好きな人へ
                      </Badge>
                    ))}
                  </div>
                  {p.comment && <p className="text-sm">“{p.comment}”</p>}
                  {p.reject_reason && <p className="text-destructive text-xs">却下理由: {p.reject_reason}</p>}
                </div>
                {p.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => review(p.id, "approve")}>
                      <Check />
                      承認
                    </Button>
                    <RejectForm onReject={(r) => review(p.id, "reject", r)} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function CampaignDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({
    title: "",
    description: "",
    starts_at: toLocalInput(new Date()),
    ends_at: toLocalInput(new Date(Date.now() + 30 * 86400000)),
    max_pitches_per_user: "3",
  }));
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus />
          キャンペーンを作成
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void act(
              () =>
                apiSend("/api/admin/campaigns", "POST", {
                  title: form.title,
                  description: form.description,
                  starts_at: new Date(form.starts_at).toISOString(),
                  ends_at: new Date(form.ends_at).toISOString(),
                  max_pitches_per_user: Number(form.max_pitches_per_user),
                  status: "draft",
                }),
              "下書きとして作成しました",
              () => {
                setOpen(false);
                onCreated();
              },
            );
          }}
        >
          <DialogHeader>
            <DialogTitle>キャンペーンを作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="c-title">タイトル</Label>
            <Input id="c-title" value={form.title} onChange={set("title")} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-desc">説明</Label>
            <Textarea id="c-desc" value={form.description} onChange={set("description")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="c-start">開始</Label>
              <Input id="c-start" type="datetime-local" value={form.starts_at} onChange={set("starts_at")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-end">終了</Label>
              <Input id="c-end" type="datetime-local" value={form.ends_at} onChange={set("ends_at")} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-max">1人あたりの投稿上限</Label>
            <Input id="c-max" type="number" min="1" max="20" value={form.max_pitches_per_user} onChange={set("max_pitches_per_user")} />
          </div>
          <DialogFooter>
            <Button type="submit">作成</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CampaignsTab() {
  const { data, mutate } = useSWR<{ campaigns: CampaignListItem[] }>("/api/admin/campaigns", fetcher);
  if (!data) return <ListSkeleton rows={2} />;
  const setStatus = (c: CampaignListItem, status: string) =>
    act(() => apiSend(`/api/admin/campaigns/${c.id}`, "PATCH", { status }), "更新しました", () => void mutate());
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CampaignDialog onCreated={() => void mutate()} />
      </div>
      {data.campaigns.map((c) => (
        <Card key={c.id} className="gap-2 py-4">
          <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CampaignStatusBadge c={c} />
                <span className="font-medium">{c.title}</span>
              </div>
              <div className="text-muted-foreground text-xs">
                {formatDate(c.starts_at)} 〜 {formatDate(c.ends_at)} ・ 承認 {c.approved_count} ・ 審査待ち {c.pending_count}
              </div>
            </div>
            <div className="flex gap-1">
              {c.status !== "open" && (
                <Button size="sm" onClick={() => setStatus(c, "open")}>
                  <Play />
                  公開して募集
                </Button>
              )}
              {c.status === "open" && (
                <Button size="sm" variant="outline" onClick={() => setStatus(c, "closed")}>
                  <Pause />
                  締め切る
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdminView() {
  const { user, loading } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user?.role !== "admin") router.replace(user ? "/" : "/login?next=/admin");
  }, [loading, user, router]);
  const { data } = useSWR<Overview>(user?.role === "admin" ? "/api/admin/overview" : null, fetcher);
  if (loading || user?.role !== "admin") return <ListSkeleton />;
  return (
    <div className="space-y-6">
      <PageHeader title="管理" description="目利きの承認、推薦の審査、キャンペーン、X API の予算" />
      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="overview">
            概要
            {data?.budget.exceeded && <AlertTriangle className="text-destructive" />}
          </TabsTrigger>
          <TabsTrigger value="curators">
            目利き
            {!!data?.counts.pending_curators && <Badge className="h-4 px-1 text-[10px]">{data.counts.pending_curators}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="pitches">
            推薦審査
            {!!data?.counts.pending_pitches && <Badge className="h-4 px-1 text-[10px]">{data.counts.pending_pitches}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="campaigns">キャンペーン</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="curators">
          <CuratorsTab />
        </TabsContent>
        <TabsContent value="pitches">
          <PitchesTab />
        </TabsContent>
        <TabsContent value="campaigns">
          <CampaignsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
