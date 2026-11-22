"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Compass, Library, LogIn, Megaphone, Settings, Shield, Users } from "lucide-react";
import { MiniPlayer, NowPlayingPanel } from "@/components/player/now-playing";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { APP_SHORT_NAME } from "@/lib/brand";
import { useMe } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "発見", icon: Compass },
  { href: "/curators", label: "目利き", icon: Users },
  { href: "/campaigns", label: "キャンペーン", icon: Megaphone },
  { href: "/library", label: "ライブラリ", icon: Library },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="bg-brand text-brand-foreground flex size-7 items-center justify-center rounded-md text-sm">掘</span>
      <span>{APP_SHORT_NAME}</span>
    </Link>
  );
}

function SidebarNav({ pathname }: { pathname: string | null }) {
  const { user } = useMe();
  const items = user?.role === "admin" ? [...NAV, { href: "/admin", label: "管理", icon: Shield }] : NAV;
  return (
    <nav className="mt-6 space-y-1" aria-label="メイン">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname && isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "hover:bg-sidebar-accent flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname && isActive(pathname, href) ? "bg-sidebar-accent text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function SidebarNavActive() {
  return <SidebarNav pathname={usePathname()} />;
}

function Sidebar() {
  const { user, mode } = useMe();
  return (
    <aside className="bg-sidebar fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r px-3 py-4 lg:flex">
      <div className="px-2">
        <Logo />
        <p className="text-muted-foreground mt-1 text-xs">再生数に左右されない音楽の発掘</p>
      </div>
      <Suspense fallback={<SidebarNav pathname={null} />}>
        <SidebarNavActive />
      </Suspense>
      <div className="mt-auto space-y-2">
        {mode === "fixtures" && (
          <Badge variant="outline" className="mx-2 font-normal">
            デモモード（fixtures）
          </Badge>
        )}
        {user ? (
          <Link
            href="/settings"
            className="hover:bg-sidebar-accent flex items-center gap-3 rounded-md px-2 py-2 text-sm"
          >
            <Avatar>
              <AvatarFallback>{(user.display_name ?? "?").slice(0, 1)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{user.display_name}</span>
              <span className="text-muted-foreground block text-xs">設定</span>
            </span>
            <Settings className="text-muted-foreground size-4" />
          </Link>
        ) : (
          <Link
            href="/login"
            className="hover:bg-sidebar-accent flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium"
          >
            <LogIn className="size-4" />
            ログイン
          </Link>
        )}
      </div>
    </aside>
  );
}

function MobileHeader() {
  const { user } = useMe();
  return (
    <header className="bg-background/90 sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 backdrop-blur lg:hidden">
      <Logo />
      <div className="flex items-center gap-1">
        {user?.role === "admin" && (
          <Link href="/admin" aria-label="管理" className="hover:bg-accent rounded-md p-2">
            <Shield className="size-5" />
          </Link>
        )}
        <Link href={user ? "/settings" : "/login"} aria-label={user ? "設定" : "ログイン"} className="hover:bg-accent rounded-md p-2">
          {user ? <Settings className="size-5" /> : <LogIn className="size-5" />}
        </Link>
      </div>
    </header>
  );
}

function MobileTabBarActive() {
  return <MobileTabBar pathname={usePathname()} />;
}

function MobileTabBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="メイン"
      className="bg-background/95 fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname && isActive(pathname, href) ? "page" : undefined}
          className={cn(
            "flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
            pathname && isActive(pathname, href) ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function Footer() {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <footer className="text-muted-foreground mt-16 border-t px-4 py-6 text-xs sm:px-8">
      <p>
        曲は配信せず、Apple Music・SoundCloud・Bandcamp の公式プレイヤーで再生しています。いいね数や再生数はおすすめに使いません。
      </p>
      <p className="mt-2">
        目利きとしての掲載停止・削除のお申し出:{" "}
        {contact ? (
          <a className="underline underline-offset-4" href={`mailto:${contact}`}>
            {contact}
          </a>
        ) : (
          <span>運営までご連絡ください（NEXT_PUBLIC_CONTACT_EMAIL 未設定）</span>
        )}
      </p>
    </footer>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <MobileHeader />
      <main className="pb-40 lg:pr-[360px] lg:pb-0 lg:pl-60">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 lg:py-10">{children}</div>
        <Footer />
      </main>
      <NowPlayingPanel />
      <MiniPlayer />
      <Suspense fallback={<MobileTabBar pathname={null} />}>
        <MobileTabBarActive />
      </Suspense>
    </div>
  );
}
