"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <p className="text-muted-foreground text-xs">デモ用アカウント</p>
      <div className="grid grid-cols-2 gap-2">
        {data?.users.map((u) => (
          <Button
            key={u.id}
            variant="outline"
            className="h-auto min-h-14 flex-col items-start rounded-2xl py-2"
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
    <div className="mx-auto max-w-md space-y-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">ログイン</CardTitle>
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
                className="h-12"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" className="h-12 w-full rounded-full text-base" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Mail />}
                {fixtures ? "ログイン" : "ログインリンクを送る"}
              </Button>
            </form>
          )}

          <Separator />
          {fixtures ? (
            <DemoAccounts next={next} />
          ) : (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">目利きの方</p>
              <Button
                variant="outline"
                className="h-12 w-full rounded-full"
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
