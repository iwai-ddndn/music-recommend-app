import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { AppShell } from "@/components/layout/app-shell";
import { PlayerProvider } from "@/components/player/player-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s | ${APP_NAME}` },
  description:
    "再生数に左右されず、目利きが推すマイナーな曲に出会える音楽プレイヤー。Apple Music・SoundCloud・Bandcamp を1本のキューで。",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f6" },
    { media: "(prefers-color-scheme: dark)", color: "#16171c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            <PlayerProvider>
              <AppShell>{children}</AppShell>
            </PlayerProvider>
            <Toaster position="top-center" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
