import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { appConfig } from "@/lib/config";
import { getReadyDb } from "@/lib/db";
import { emptyTaste, mergeTaste } from "@/lib/scoring/taste";
import { TasteSchema } from "@/lib/taste/schema";

export const GET = handler(async () => {
  const user = await requireUser();
  const db = await getReadyDb();
  const row = (await db.list("user_taste", { eq: { user_id: user.id } }))[0];
  return json({ taste: row?.taste ?? null });
});

const Put = z.object({ taste: TasteSchema, merge: z.boolean().default(false) });

/** 好みを保存する。merge=true はログイン直後の統合（端末の好み + サーバーの好み） */
export const PUT = handler(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, Put);
  const db = await getReadyDb();
  const row = (await db.list("user_taste", { eq: { user_id: user.id } }))[0];
  const taste = input.merge ? mergeTaste(row?.taste ?? emptyTaste(), input.taste, appConfig.taste) : input.taste;
  await db.upsert("user_taste", [{ user_id: user.id, taste, updated_at: new Date().toISOString() }], ["user_id"]);
  return json({ taste });
});
