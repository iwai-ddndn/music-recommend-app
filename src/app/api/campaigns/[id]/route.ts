import { handler, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { getCampaignDetail } from "@/lib/repo/campaigns";

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]">) => {
  const { id } = await ctx.params;
  const [db, user] = await Promise.all([getReadyDb(), getSessionUser()]);
  const fav = (new URL(req.url).searchParams.get("fav") ?? "").split("|").filter(Boolean).slice(0, 50);
  return json(await getCampaignDetail(db, id, user, fav));
});
