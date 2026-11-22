"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { ArtistInput } from "@/components/artist-input";
import { ListSkeleton, PageHeader } from "@/components/common";
import { depthLabel } from "@/components/feed/discover-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { callbackUrl, supabaseBrowser } from "@/lib/client/supabase-browser";
import { authorizeAppleMusic } from "@/lib/player/adapters/apple";
import { getPlayerStore, usePlayer } from "@/lib/player/store";
import type { Curator, SessionUser } from "@/lib/types";

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20 gap-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Profile({ user, onSaved }: { user: SessionUser; onSaved: () => void }) {
  const [name, setName] = useState(user.display_name ?? "");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await apiSend("/api/me", "PATCH", { display_name: name });
          toast("保存しました");
          onSaved();
        } catch (err) {
          toast.error((err as Error).message);
        }
      }}
    >
      <Input aria-label="表示名" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
      <Button type="submit" variant="outline" disabled={!name.trim() || name === user.display_name}>
        保存
      </Button>
    </form>
  );
}

function Playback({ user, onSaved }: { user: SessionUser; onSaved: () => void }) {
  const { mode } = useMe();
  const [depth, setDepth] = useState(user.depth);
  const appleAuthorized = usePlayer((s) => s.appleAuthorized);
  const { theme, setTheme } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <>
      <div className="space-y-2">
        <Label>優先して使うサービス</Label>
        <p className="text-muted-foreground text-xs">1曲が複数のサービスにあるとき、ここで選んだサービスで再生します。</p>
        <ToggleGroup
          type="single"
          variant="outline"
          value={user.preferred_service ?? "auto"}
          onValueChange={async (v) => {
            if (!v) return;
            const preferred_service = v === "auto" ? null : v;
            await apiSend("/api/me", "PATCH", { preferred_service });
            getPlayerStore().getState().setPreferredService(preferred_service as SessionUser["preferred_service"]);
            onSaved();
          }}
          className="w-full flex-wrap sm:w-auto"
        >
          <ToggleGroupItem value="auto">おまかせ</ToggleGroupItem>
          <ToggleGroupItem value="apple">Apple Music</ToggleGroupItem>
          <ToggleGroupItem value="soundcloud">SoundCloud</ToggleGroupItem>
          <ToggleGroupItem value="bandcamp">Bandcamp</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-muted-foreground text-xs">おまかせ: Apple Music（接続済みのとき）→ SoundCloud → Bandcamp</p>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label htmlFor="settings-depth">深さ</Label>
          <span className="text-brand text-sm font-medium">{depthLabel(depth)}</span>
        </div>
        <Slider
          id="settings-depth"
          aria-label="深さ"
          min={0}
          max={1}
          step={0.1}
          value={[depth]}
          onValueChange={([v]) => {
            setDepth(v);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => void apiSend("/api/me", "PATCH", { depth: v }).then(onSaved), 400);
          }}
        />
      </div>
      {mode === "live" && (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">Apple Music</div>
            <div className="text-muted-foreground text-xs">
              {appleAuthorized ? "接続済み（フル再生）" : "未接続のときはプレビュー再生になります"}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={appleAuthorized}
            onClick={async () => {
              try {
                const ok = await authorizeAppleMusic();
                getPlayerStore().getState().setAppleAuthorized(ok);
              } catch (e) {
                toast.error(`接続できませんでした（${(e as Error).message}）`);
              }
            }}
          >
            {appleAuthorized ? "接続済み" : "接続する"}
          </Button>
        </div>
      )}
      <div className="space-y-2">
        <Label>テーマ</Label>
        <ToggleGroup type="single" variant="outline" value={theme ?? "system"} onValueChange={(v) => v && setTheme(v)}>
          <ToggleGroupItem value="system">端末に合わせる</ToggleGroupItem>
          <ToggleGroupItem value="light">ライト</ToggleGroupItem>
          <ToggleGroupItem value="dark">ダーク</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </>
  );
}

function Favorites({ onChanged }: { onChanged: () => void }) {
  const { data, mutate } = useSWR<{ artists: { id: string; name: string }[] }>("/api/favorites", fetcher);
  const list = data?.artists ?? [];
  return (
    <ArtistInput
      id="favorite-input"
      value={list.map((a) => ({ key: a.id, name: a.name }))}
      placeholder="好きなアーティストを追加"
      onAdd={async (name) => {
        try {
          await apiSend("/api/favorites", "POST", { name });
          await mutate();
          onChanged();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
      onRemove={async (id) => {
        await apiSend("/api/favorites", "DELETE", { artist_id: id });
        await mutate();
        onChanged();
      }}
    />
  );
}

function ArtistRole({ user, onSaved }: { user: SessionUser; onSaved: () => void }) {
  if (user.role !== "listener" && user.role !== "artist") {
    return <p className="text-muted-foreground text-sm">現在のロール: {user.role === "admin" ? "管理者" : "目利き"}</p>;
  }
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor="artist-role" className="flex-col items-start gap-1">
        <span>アーティスト本人として参加する</span>
        <span className="text-muted-foreground text-xs font-normal">
          推薦キャンペーンに自分の曲を投稿できます（投稿は管理者が審査します）。
        </span>
      </Label>
      <Switch
        id="artist-role"
        checked={user.role === "artist"}
        onCheckedChange={async (v) => {
          await apiSend("/api/me", "PATCH", { role: v ? "artist" : "listener" });
          toast(v ? "アーティストとして参加しました" : "リスナーに戻しました");
          onSaved();
        }}
      />
    </div>
  );
}

function CuratorProfile({ onSaved }: { onSaved: () => void }) {
  const { data, mutate } = useSWR<{ curator: Curator | null }>("/api/curators/me", fetcher);
  const [bio, setBio] = useState<string | null>(null);
  const c = data?.curator;
  if (!c) return <ListSkeleton rows={1} />;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await apiSend("/api/curators/me", "PATCH", { bio: bio ?? c.bio });
        toast("プロフィールを保存しました");
        await mutate();
        onSaved();
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="brand">本人確認済み</Badge>
        <Link href={`/curators/${c.id}`} className="font-medium hover:underline">
          @{c.x_handle}
        </Link>
      </div>
      <Label htmlFor="curator-bio">プロフィール文</Label>
      <Textarea id="curator-bio" maxLength={300} value={bio ?? c.bio ?? ""} onChange={(e) => setBio(e.target.value)} />
      <Button type="submit" variant="outline" size="sm">
        保存
      </Button>
    </form>
  );
}

function CuratorClaim({ onClaimed }: { onClaimed: () => void }) {
  const { mode } = useMe();
  const [handle, setHandle] = useState("");
  const claim = async (body?: { handle: string }) => {
    try {
      const r = await apiSend<{ handle: string }>("/api/curators/claim", "POST", body ?? {});
      toast(`@${r.handle} の本人確認ができました`);
      onClaimed();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (mode === "fixtures") {
    return (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void claim({ handle });
        }}
      >
        <p className="text-muted-foreground text-xs">デモモードでは X 連携の代わりにハンドル入力で確認します。</p>
        <div className="flex gap-2">
          <Input placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} aria-label="Xのハンドル" />
          <Button type="submit" variant="outline" disabled={!handle.trim()}>
            確認
          </Button>
        </div>
      </form>
    );
  }
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const { error } = await supabaseBrowser().auth.linkIdentity({
          provider: "x",
          options: { redirectTo: callbackUrl("/settings?claim=1") },
        });
        if (error) toast.error(error.message);
      }}
    >
      X アカウントで本人確認
    </Button>
  );
}

export function SettingsView() {
  const { user, loading, mutate } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const claimTried = useRef(false);

  // X 連携から戻ってきたら本人確認を試みる
  useEffect(() => {
    if (!user || claimTried.current || params.get("claim") !== "1" || user.claimed_curator_id) return;
    claimTried.current = true;
    apiSend<{ handle: string }>("/api/curators/claim", "POST", {})
      .then((r) => {
        toast(`@${r.handle} の本人確認ができました`);
        void mutate();
      })
      .catch((e) => toast.error((e as Error).message));
  }, [user, params, mutate]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login?next=/settings");
  }, [loading, user, router]);

  if (loading || !user) return <ListSkeleton />;
  const refresh = () => void mutate();
  return (
    <div className="space-y-6">
      <PageHeader title="設定" />
      <Section id="profile" title="プロフィール">
        <Profile user={user} onSaved={refresh} />
      </Section>
      <Section id="playback" title="再生">
        <Playback user={user} onSaved={refresh} />
      </Section>
      <Section
        id="favorites"
        title="好きなアーティスト"
        description="推薦キャンペーンで「このアーティストが好きな人へ」と一致した曲が、発見のキューに届きます。"
      >
        <Favorites onChanged={refresh} />
      </Section>
      <Section id="role" title="アーティストとして参加">
        <ArtistRole user={user} onSaved={refresh} />
      </Section>
      <Section
        id="curator"
        title="目利きの本人確認"
        description="目利きとして登録されている方は、本人確認するとプロフィール文の編集とキャンペーンへの投稿ができます。"
      >
        {user.claimed_curator_id ? <CuratorProfile onSaved={refresh} /> : <CuratorClaim onClaimed={refresh} />}
      </Section>
      <Button
        variant="ghost"
        className="text-muted-foreground"
        onClick={async () => {
          await apiSend("/api/auth/logout", "POST");
          getPlayerStore().getState().setSaved([]);
          await mutate();
          router.push("/");
        }}
      >
        <LogOut />
        ログアウト
      </Button>
    </div>
  );
}
