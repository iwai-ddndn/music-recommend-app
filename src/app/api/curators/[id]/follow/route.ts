import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { follow } from "@/lib/repo/curators";

export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/curators/[id]/follow">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await follow(await getReadyDb(), user.id, id, true);
  return json({ following: true });
});

export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/curators/[id]/follow">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await follow(await getReadyDb(), user.id, id, false);
  return json({ following: false });
});
