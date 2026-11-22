import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { runCollect } from "@/lib/pipeline/collect";
import { refreshListeners } from "@/lib/pipeline/listeners";
import { recomputeScores } from "@/lib/pipeline/scores";

const Job = z.object({ job: z.enum(["daily", "score"]) });

/** 管理画面からバッチを手動実行する（通常は cron で scripts/collect.ts を起動） */
export const POST = handler(async (req: Request) => {
  await requireUser(["admin"]);
  const { job } = await body(req, Job);
  const db = await getReadyDb();
  if (job === "score") return json({ scores: await recomputeScores(db) });
  const collect = await runCollect(db);
  const listeners = await refreshListeners(db);
  const scores = await recomputeScores(db);
  return json({ collect, listeners, scores });
});
