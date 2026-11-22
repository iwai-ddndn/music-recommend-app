import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";

const Patch = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  starts_at: z.iso.datetime({ offset: true }).optional(),
  ends_at: z.iso.datetime({ offset: true }).optional(),
  max_pitches_per_user: z.number().int().min(1).max(20).optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
});

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/admin/campaigns/[id]">) => {
  await requireUser(["admin"]);
  const { id } = await ctx.params;
  const input = await body(req, Patch);
  const db = await getReadyDb();
  const current = await db.get("campaigns", id);
  if (!current) throw new HttpError(404, "キャンペーンが見つかりません");
  const next = { ...current, ...input };
  if (new Date(next.ends_at) <= new Date(next.starts_at)) {
    throw new HttpError(400, "終了日時は開始日時より後にしてください");
  }
  const [campaign] = await db.update("campaigns", { id }, input);
  return json({ campaign });
});
