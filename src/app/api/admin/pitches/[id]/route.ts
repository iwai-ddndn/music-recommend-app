import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { reviewPitch } from "@/lib/repo/campaigns";

const Review = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(200).nullable().optional(),
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/admin/pitches/[id]">) => {
  await requireUser(["admin"]);
  const { id } = await ctx.params;
  const input = await body(req, Review);
  return json({ pitch: await reviewPitch(await getReadyDb(), id, input.action, input.reason ?? null) });
});
