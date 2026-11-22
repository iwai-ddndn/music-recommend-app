import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";

export const GET = handler(async () => {
  const user = await requireUser();
  if (!user.claimed_curator_id) return json({ curator: null });
  const db = await getReadyDb();
  return json({ curator: await db.get("curators", user.claimed_curator_id) });
});

const Patch = z.object({
  display_name: z.string().trim().min(1).max(50).optional(),
  bio: z.string().trim().max(300).nullable().optional(),
});

/** 本人確認済みの目利きはプロフィール文を編集できる */
export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  if (!user.claimed_curator_id) throw new HttpError(403, "目利きの本人確認が必要です");
  const input = await body(req, Patch);
  const db = await getReadyDb();
  const [curator] = await db.update("curators", { id: user.claimed_curator_id }, input);
  return json({ curator });
});
