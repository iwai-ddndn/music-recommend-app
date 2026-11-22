import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { HttpError, requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { recomputeScores } from "@/lib/pipeline/scores";
import { approveCurator, setCuratorStatus } from "@/lib/repo/curators";

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("activate") }),
  z.object({ action: z.literal("weight"), base_weight: z.number().min(0).max(10) }),
]);

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/admin/curators/[id]">) => {
  await requireUser(["admin"]);
  const { id } = await ctx.params;
  const input = await body(req, Action);
  const db = await getReadyDb();
  switch (input.action) {
    case "approve":
      return json({ curator: await approveCurator(db, id) });
    case "reject": {
      const c = await db.get("curators", id);
      if (!c) throw new HttpError(404, "目利きが見つかりません");
      if (c.status !== "pending") throw new HttpError(409, "却下できるのは申請中の目利きだけです");
      await db.remove("curators", { id });
      return json({ removed: true });
    }
    case "pause":
      return json({ curator: await setCuratorStatus(db, id, "paused") });
    case "activate":
      return json({ curator: await setCuratorStatus(db, id, "active") });
    case "weight": {
      const [c] = await db.update("curators", { id }, { base_weight: input.base_weight });
      if (!c) throw new HttpError(404, "目利きが見つかりません");
      await recomputeScores(db);
      return json({ curator: c });
    }
  }
});
