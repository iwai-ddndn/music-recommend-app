"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { useTheme } from "next-themes";
import { ChevronRight, LogOut, Shield, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ArtistInput } from "@/components/artist-input";
import { ListSkeleton } from "@/components/common";
import { ScreenHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { useProfile } from "@/lib/client/profile";
import { callbackUrl, supabaseBrowser } from "@/lib/client/supabase-browser";
import { authorizeAppleMusic } from "@/lib/player/adapters/apple";
import { getPlayerStore, usePlayer } from "@/lib/player/store";
import type { Curator, SessionUser } from "@/lib/types";

/** 設定は「見出し＋角丸のグループ＋行」で構成する（各行は44pt以上） */
function Group({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 space-y-2">
      <h2 className="text-muted-foreground px-4 text-sm font-semibold">{title}</h2>
      <div className="bg-card divide-y overflow-hidden rounded-3xl border">{children}</div>
    </section>
  );
}

function Row({ label, children, stack }: { label?: string; children: React.ReactNode; stack?: boolean }) {
  return (
    <div className={stack ? "space-y-3 p-4" : "flex min-h-14 items-center justify-between gap-3 px-4 py-2"}>
      {label && <span className="font-medium">{label}</span>}
      {children}
    </div>
  );
}

function Profile({ user, onSaved }: { user: SessionUser; onSaved: () => void }) {
  const [name, setName] = useState(user.display_name ?? "");
  return (
    <form
      className="flex gap-2 p-4"
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
      <Input aria-label="表示名" className="h-12" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
      <Button type="submit" variant="outline" className="h-12 rounded-full" disabled={!name.trim() || name === user.display_name}>
        保存
      </Button>
    </form>
  );
}

function Favorites() {
  const { data, mutate } = useSWR<{ artists: { id: string; name: string }[] }>("/api/favorites", fetcher);
  const list = data?.artists ?? [];
  const sync = (names: string[]) => useProfile.getState().setFavorites(names);
  return (
    <ArtistInput
      id="favorite-input"
      value={list.map((a) => ({ key: a.id, name: a.name }))}
      placeholder="アーティスト名"
      onAdd={async (name) => {
        try {
          await apiSend("/api/favorites", "POST", { name });
          const next = await mutate();
          sync((next?.artists ?? []).map((a) => a.name));
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
      onRemove={async (id) => {
        await apiSend("/api/favorites", "DELETE", { artist_id: id });
        const next = await mutate();
        sync((next?.artists ?? []).map((a) => a.name));
      }}
    />
  );
}

function CuratorSection({ user, onSaved }: { user: SessionUser; onSaved: () => void }) {
  const { mode } = useMe();
  const { data, mutate } = useSWR<{ curator: Curator | null }>(user.claimed_curator_id ? "/api/curators/me" : null, fetcher);
  const [bio, setBio] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const claim = async (body?: { handle: string }) => {
    try {
      const r = await apiSend<{ handle: string }>("/api/curators/claim", "POST", body ?? {});
      toast(`@${r.handle} の本人確認ができました`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const c = data?.curator;
  if (user.claimed_curator_id) {
    if (!c) return <ListSkeleton rows={1} />;
    return (
      <form
        className="space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await apiSend("/api/curators/me", "PATCH", { bio: bio ?? c.bio });
          toast("保存しました");
          await mutate();
        }}
      >
        <Link href={`/curators/${c.id}`} className="flex h-11 items-center justify-between font-medium">
          @{c.x_handle}
          <span className="bg-brand text-brand-foreground rounded-full px-2.5 py-0.5 text-xs font-semibold">本人確認済み</span>
        </Link>
        <Textarea aria-label="プロフィール文" maxLength={300} value={bio ?? c.bio ?? ""} onChange={(e) => setBio(e.target.value)} />
        <Button type="submit" variant="outline" className="h-11 rounded-full">
          保存
        </Button>
      </form>
    );
  }
  if (mode === "fixtures") {
    // デモでは X 連携の代わりにハンドル入力で確認する
    return (
      <form
        className="flex gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void claim({ handle });
        }}
      >
        <Input className="h-12" placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} aria-label="Xのハンドル" />
        <Button type="submit" variant="outline" className="h-12 rounded-full" disabled={!handle.trim()}>
          確認
        </Button>
      </form>
    );
  }
  return (
    <Row label="X アカウントで本人確認">
      <Button
        variant="outline"
        className="h-11 rounded-full"
        onClick={async () => {
          const { error } = await supabaseBrowser().auth.linkIdentity({ provider: "x", options: { redirectTo: callbackUrl("/settings?claim=1") } });
          if (error) toast.error(error.message);
        }}
      >
        連携
      </Button>
    </Row>
  );
}

export function SettingsView() {
  const { user, loading, mode, mutate } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const claimTried = useRef(false);
  const appleAuthorized = usePlayer((s) => s.appleAuthorized);
  const { theme, setTheme } = useTheme();
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

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
  const patch = (body: Record<string, unknown>) => apiSend("/api/me", "PATCH", body).then(refresh);
  return (
    <div className="space-y-6">
      <ScreenHeader title="設定" />

      <Group title="アカウント">
        <Profile user={user} onSaved={refresh} />
        {user.role === "admin" && (
          <Link href="/admin" className="flex min-h-14 items-center gap-3 px-4 font-medium">
            <Shield className="size-5" />
            <span className="flex-1">管理</span>
            <ChevronRight className="text-muted-foreground size-5" />
          </Link>
        )}
      </Group>

      <Group id="favorites" title="好み">
        <button
          type="button"
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left font-medium"
          onClick={() => {
            useProfile.getState().restart();
            router.push("/");
          }}
        >
          <SlidersHorizontal className="size-5" />
          <span className="flex-1">好きなシーンを選び直す</span>
          <ChevronRight className="text-muted-foreground size-5" />
        </button>
        <Row label="好きなアーティスト" stack>
          <Favorites />
        </Row>
      </Group>

      <Group id="playback" title="再生">
        <Row label="優先するサービス" stack>
          <ToggleGroup
            type="single"
            variant="outline"
            className="w-full"
            value={user.preferred_service ?? "auto"}
            onValueChange={(v) => {
              if (!v) return;
              const preferred_service = v === "auto" ? null : (v as SessionUser["preferred_service"]);
              getPlayerStore().getState().setPreferredService(preferred_service);
              void patch({ preferred_service });
            }}
          >
            <ToggleGroupItem className="h-11" value="auto">おまかせ</ToggleGroupItem>
            <ToggleGroupItem className="h-11" value="apple">Apple</ToggleGroupItem>
            <ToggleGroupItem className="h-11" value="soundcloud">SoundCloud</ToggleGroupItem>
            <ToggleGroupItem className="h-11" value="bandcamp">Bandcamp</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        {mode === "live" && (
          <Row label="Apple Music">
            <Button
              variant={appleAuthorized ? "secondary" : "outline"}
              className="h-11 rounded-full"
              disabled={appleAuthorized}
              onClick={async () => {
                try {
                  getPlayerStore().getState().setAppleAuthorized(await authorizeAppleMusic());
                } catch (e) {
                  toast.error(`接続できませんでした（${(e as Error).message}）`);
                }
              }}
            >
              {appleAuthorized ? "接続済み" : "接続してフル再生"}
            </Button>
          </Row>
        )}
        <Row label="テーマ" stack>
          <ToggleGroup type="single" variant="outline" className="w-full" value={theme ?? "system"} onValueChange={(v) => v && setTheme(v)}>
            <ToggleGroupItem className="h-11" value="system">自動</ToggleGroupItem>
            <ToggleGroupItem className="h-11" value="light">ライト</ToggleGroupItem>
            <ToggleGroupItem className="h-11" value="dark">ダーク</ToggleGroupItem>
          </ToggleGroup>
        </Row>
      </Group>

      <Group id="role" title="推薦する側として参加">
        {(user.role === "listener" || user.role === "artist") && (
          <Row label="アーティスト本人として参加">
            <Switch
              aria-label="アーティスト本人として参加"
              checked={user.role === "artist"}
              onCheckedChange={(v) => void patch({ role: v ? "artist" : "listener" })}
            />
          </Row>
        )}
        <div id="curator" className="scroll-mt-4">
          <div className="px-4 pt-3 text-sm font-medium">目利きの本人確認</div>
          <CuratorSection user={user} onSaved={refresh} />
        </div>
      </Group>

      <Group title="このアプリについて">
        <p className="text-muted-foreground p-4 text-sm">
          曲は配信せず、Apple Music・SoundCloud・Bandcamp の公式プレイヤーで再生します。いいね数や再生数は選曲に使いません。
        </p>
        <Row label="目利きの掲載停止・削除の申し出">
          {contact ? (
            <a className="text-sm underline underline-offset-4" href={`mailto:${contact}`}>
              {contact}
            </a>
          ) : (
            <span className="text-muted-foreground text-sm">運営まで</span>
          )}
        </Row>
      </Group>

      <Button
        variant="ghost"
        className="text-muted-foreground h-12 w-full rounded-full"
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
