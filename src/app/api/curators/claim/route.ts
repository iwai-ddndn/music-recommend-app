import { z } from "zod";
import { handler, json } from "@/lib/api";
import { currentXIdentity, HttpError, requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { useFixtures } from "@/lib/env";
import { claimCurator } from "@/lib/repo/curators";

const DemoClaim = z.object({ handle: z.string().trim().min(1) });

/**
 * 本人確認（目利き）。Xアカウントでログインしたユーザーが自分の curators 行を請求する。
 * fixtures モードではX連携の代わりにハンドル入力で擬似的に確認する。
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const db = await getReadyDb();
  if (useFixtures()) {
    const { handle } = DemoClaim.parse(await req.json().catch(() => ({})));
    const c = await claimCurator(db, user.id, { xUserId: null, handle: handle.replace(/^@/, "") });
    return json({ curator_id: c.id, handle: c.x_handle });
  }
  const identity = await currentXIdentity();
  if (!identity) throw new HttpError(400, "Xアカウントでログインしてください");
  const c = await claimCurator(db, user.id, { xUserId: identity.id, handle: identity.username });
  return json({ curator_id: c.id, handle: c.x_handle });
});
