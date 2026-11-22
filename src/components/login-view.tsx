"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiSend, fetcher, useMe } from "@/lib/client/api";
import { callbackUrl, supabaseBrowser } from "@/lib/client/supabase-browser";

const ROLE_LABEL = { listener: "リスナー", curator: "目利き（本人確認済み）", artist: "アーティスト", admin: "管理者" } as const;

function DemoAccounts({ next }: { next: string }) {
  const router = useRouter();
  const { mutate } = useMe();
  const { data } = useSWR<{ users: { id: string; role: keyof typeof ROLE_LABEL; display_name: string }[] }>(
    "/api/auth/demo",
    fetcher,
  );
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">デモ用アカウントで試す</p>
      <div className="grid grid-cols-2 gap-2">
        {data?.users.map((u) => (
          <Button
            key={u.id}
            variant="outline"
            className="h-auto flex-col items-start py-2"
            data-testid={`demo-${u.role}`}
            onClick={async () => {
              await apiSend("/api/auth/demo", "POST", { user_id: u.id });
              await mutate();
              router.push(next);
            }}
          >
            <span className="text-sm">{u.display_name}</span>
            <span className="text-muted-foreground text-xs font-normal">{ROLE_LABEL[u.role]}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function LoginView() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const errorParam = params.get("error");
  const router = useRouter();
  const { mode, mutate, user } = useMe();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const fixtures = mode === "fixtures";

  // 既にログイン済みなら元の画面へ戻す
  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">ログイン</CardTitle>
          <CardDescription>
            聴くだけならログインは不要です。フォロー・保存・推薦をするときにログインしてください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {errorParam && (
            <Alert variant="destructive">
              <AlertTitle>ログインできませんでした</AlertTitle>
              <AlertDescription>{errorParam}</AlertDescription>
            </Alert>
          )}
          {sent ? (
            <Alert variant="brand">
              <Mail />
              <AlertTitle>メールを送信しました</AlertTitle>
              <AlertDescription>{email} に届いたリンクを開くとログインできます。</AlertDescription>
            </Alert>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  if (fixtures) {
                    await apiSend("/api/auth/demo", "POST", { email });
                    await mutate();
                    router.push(next);
                  } else {
                    const { error } = await supabaseBrowser().auth.signInWithOtp({
                      email,
                      options: { emailRedirectTo: callbackUrl(next) },
                    });
                    if (error) throw error;
                    setSent(true);
                  }
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Mail />}
                {fixtures ? "ログイン（デモ: メール送信なし）" : "ログインリンクを送る"}
              </Button>
            </form>
          )}

          <Separator />
          {fixtures ? (
            <DemoAccounts next={next} />
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">目利きの方（本人確認とキャンペーン投稿用）</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  const { error } = await supabaseBrowser().auth.signInWithOAuth({
                    provider: "x",
                    options: { redirectTo: callbackUrl("/settings?claim=1") },
                  });
                  if (error) toast.error(error.message);
                }}
              >
                X でログイン
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
