import { handler, json } from "@/lib/api";
import { getSessionUser, HttpError } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { listCurators } from "@/lib/repo/curators";

export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/curators/[id]">) => {
  const { id } = await ctx.params;
  const [db, user] = await Promise.all([getReadyDb(), getSessionUser()]);
  const [curator] = await listCurators(db, user?.id ?? null, { curatorId: id, recentLimit: 30 });
  if (!curator) throw new HttpError(404, "目利きが見つかりません");
  return json({ curator });
});
