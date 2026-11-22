import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { submitPitch } from "@/lib/repo/campaigns";

const Pitch = z.object({
  url: z.string().trim().min(1, "曲のURLを入力してください"),
  reference_artists: z.array(z.string()).default([]),
  comment: z.string().default(""),
});

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/campaigns/[id]/pitches">) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const input = await body(req, Pitch);
  const pitch = await submitPitch(await getReadyDb(), user, id, input);
  return json({ pitch }, { status: 201 });
});
