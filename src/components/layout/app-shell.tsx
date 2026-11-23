"use client";

// モバイル前提の骨格。
// - 下部ナビ（4項目、アイコン＋ラベル、選択中はピル型インジケーター）
// - その上にミニプレイヤー、タップで全画面プレイヤー
// - 広い画面では下部ナビを左のナビゲーションレールに置き換える
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Bookmark, Compass, Megaphone, Shield, UserRound, Users } from "lucide-react";
import { MiniPlayer, NowPlayingSheet } from "@/components/player/now-playing";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useMe } from "@/lib/client/api";
import { usePlayer } from "@/lib/player/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "ホーム", icon: Compass },
  { href: "/curators", label: "目利き", icon: Users },
  { href: "/campaigns", label: "推薦", icon: Megaphone },
  { href: "/library", label: "保存", icon: Bookmark },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavItems({ pathname, rail }: { pathname: string | null; rail?: boolean }) {
  const { user } = useMe();
  const items = rail && user?.role === "admin" ? [...NAV, { href: "/admin", label: "管理", icon: Shield }] : NAV;
  return (
    <>
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="group flex min-h-14 flex-1 flex-col items-center justify-center gap-1 lg:flex-none lg:py-2"
          >
            <span
              className={cn(
                "flex h-8 w-16 items-center justify-center rounded-full transition-colors",
                active ? "bg-brand/20 text-foreground" : "text-muted-foreground group-hover:bg-accent",
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
            </span>
            <span className={cn("text-[11px] leading-none", active ? "font-semibold" : "text-muted-foreground")}>
              {label}
            </span>
          </Link>
        );
      })}
    </>
  );
}

function ActiveNav({ rail }: { rail?: boolean }) {
  return <NavItems pathname={usePathname()} rail={rail} />;
}

function Nav({ rail }: { rail?: boolean }) {
  return (
    <Suspense fallback={<NavItems pathname={null} rail={rail} />}>
      <ActiveNav rail={rail} />
    </Suspense>
  );
}

export function AccountButton({ className }: { className?: string }) {
  const { user } = useMe();
  return (
    <Link
      href={user ? "/settings" : "/login"}
      aria-label={user ? "設定" : "ログイン"}
      className={cn("flex size-11 items-center justify-center rounded-full", className)}
    >
      <Avatar className="size-9">
        <AvatarFallback className={user ? "bg-brand/25 font-semibold" : ""}>
          {user ? (user.display_name ?? "?").slice(0, 1) : <UserRound className="size-4" />}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const hasTrack = usePlayer((s) => s.index >= 0);
  return (
    <div className="min-h-dvh lg:pl-20">
      {/* 広い画面: ナビゲーションレール */}
      <nav
        aria-label="メイン"
        className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center gap-2 border-r py-4 lg:flex"
      >
        <Nav rail />
        <AccountButton className="mt-auto" />
      </nav>

      <main
        className={cn(
          "mx-auto w-full max-w-xl overflow-x-clip px-4 pt-[env(safe-area-inset-top)]",
          hasTrack ? "pb-[calc(9.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(5rem+env(safe-area-inset-bottom))]",
          hasTrack ? "lg:pb-24" : "lg:pb-8",
        )}
      >
        {children}
      </main>

      <NowPlayingSheet />
      <MiniPlayer />

      {/* スマホ: 下部ナビ */}
      <nav
        aria-label="メイン"
        className="bg-background/95 fixed inset-x-0 bottom-0 z-30 flex border-t px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <Nav />
      </nav>
    </div>
  );
}

/** 各画面の先頭。大きなタイトルと右上の操作（HIG のラージタイトル相当） */
export function ScreenHeader({
  title,
  back,
  action,
}: {
  title: React.ReactNode;
  back?: { href: string; label: string };
  action?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-16 items-center gap-2 pt-3 pb-2">
      <div className="min-w-0 flex-1">
        {back && (
          <Link href={back.href} className="text-muted-foreground -ml-1 inline-flex h-8 items-center text-sm">
            ‹ {back.label}
          </Link>
        )}
        <h1 className="truncate text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
      </div>
      {action}
      <AccountButton className="lg:hidden" />
    </header>
  );
}
