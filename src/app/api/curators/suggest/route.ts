import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { suggestCurator } from "@/lib/repo/curators";

const Suggest = z.object({
  handle: z.string().trim().min(1, "ハンドルを入力してください"),
  comment: z.string().trim().max(200).nullable().optional(),
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, Suggest);
  const r = await suggestCurator(await getReadyDb(), user.id, {
    handle: input.handle,
    comment: input.comment || null,
  });
  return json({ status: r.status, handle: r.curator.x_handle });
});
