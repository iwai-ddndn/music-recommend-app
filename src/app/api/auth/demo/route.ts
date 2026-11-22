import { cookies } from "next/headers";
import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { DEMO_COOKIE, HttpError } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { isFixtureMode } from "@/lib/env";

const Demo = z.union([
  z.object({ user_id: z.string().min(1) }),
  z.object({ email: z.email("メールアドレスの形式が正しくありません") }),
]);

/**
 * fixtures モード専用のログイン。メールリンク認証の代わりに即時ログインする。
 * 本番（Supabase）ではメールリンク認証を使うため 404 を返す。
 */
export const POST = handler(async (req: Request) => {
  if (!isFixtureMode()) throw new HttpError(404, "Not found");
  const input = await body(req, Demo);
  const db = await getReadyDb();
  let userId: string;
  if ("user_id" in input) {
    const u = await db.get("users", input.user_id);
    if (!u) throw new HttpError(404, "ユーザーが見つかりません");
    userId = u.id;
  } else {
    const email = input.email.toLowerCase();
    const existing = (await db.list("users", { eq: { email } }))[0];
    userId =
      existing?.id ??
      (
        await db.insert("users", [
          { email, display_name: email.split("@")[0], role: "listener", depth: 0.5, preferred_service: null },
        ])
      )[0].id;
  }
  (await cookies()).set(DEMO_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return json({ ok: true });
});

/** デモ用アカウント一覧（ログイン画面のクイック切り替え用） */
export const GET = handler(async () => {
  if (!isFixtureMode()) throw new HttpError(404, "Not found");
  const db = await getReadyDb();
  const users = await db.list("users");
  const demo = users.filter((u) => u.email?.endsWith("@example.com"));
  return json({ users: demo.map((u) => ({ id: u.id, role: u.role, display_name: u.display_name })) });
});
