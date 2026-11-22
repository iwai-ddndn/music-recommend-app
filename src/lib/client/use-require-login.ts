"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";
import { useMe } from "./api";

/** ログインが必要な操作の前に呼ぶ。未ログインなら案内を出して false を返す */
export function useRequireLogin() {
  const { user } = useMe();
  const router = useRouter();
  return useCallback(
    (what: string) => {
      if (user) return true;
      toast(`${what}にはログインが必要です`, {
        action: {
          label: "ログイン",
          onClick: () => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`),
        },
      });
      return false;
    },
    [user, router],
  );
}
