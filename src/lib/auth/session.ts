import "server-only";
import { cookies } from "next/headers";
import { getReadyDb } from "../db";
import type { Db } from "../db/types";
import { useFixtures } from "../env";
import type { Role, SessionUser, User } from "../types";
import { supabaseServer } from "./supabase-server";

export const DEMO_COOKIE = "demo_uid";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function toSessionUser(db: Db, u: User): Promise<SessionUser> {
  const claimed = (await db.list("curators", { eq: { claimed_by_user_id: u.id } }))[0];
  return {
    id: u.id,
    role: u.role,
    display_name: u.display_name,
    email: u.email,
    depth: u.depth,
    preferred_service: u.preferred_service,
    claimed_curator_id: claimed?.id ?? null,
  };
}

/** Supabase の Auth ユーザーから X アカウントのIDを取り出す（目利き本人確認用） */
export async function currentXIdentity(): Promise<{ id: string; username: string | null } | null> {
  if (useFixtures()) return null;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const identity = data.user?.identities?.find((i) => i.provider === "x" || i.provider === "twitter");
  if (!identity) return null;
  const d = identity.identity_data ?? {};
  return {
    id: String(d.provider_id ?? d.sub ?? identity.id),
    username: (d.user_name as string) ?? (d.preferred_username as string) ?? null,
  };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const db = await getReadyDb();
  if (useFixtures()) {
    const id = (await cookies()).get(DEMO_COOKIE)?.value;
    if (!id) return null;
    const u = await db.get("users", id);
    return u ? toSessionUser(db, u) : null;
  }
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  let u = await db.get("users", data.user.id);
  if (!u) {
    // トリガーが未適用の環境向けのフォールバック
    [u] = await db.upsert(
      "users",
      [
        {
          id: data.user.id,
          role: "listener",
          email: data.user.email ?? null,
          display_name: (data.user.user_metadata?.name as string) ?? data.user.email?.split("@")[0] ?? null,
          depth: 0.5,
          preferred_service: null,
        },
      ],
      ["id"],
    );
  }
  return toSessionUser(db, u);
}

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new HttpError(401, "ログインが必要です");
  if (roles && !roles.includes(u.role)) throw new HttpError(403, "権限がありません");
  return u;
}
