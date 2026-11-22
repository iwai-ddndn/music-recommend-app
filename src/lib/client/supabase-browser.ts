"use client";

import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

/** メールリンク / X OAuth のリダイレクト先 */
export function callbackUrl(next: string) {
  return `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}`;
}
