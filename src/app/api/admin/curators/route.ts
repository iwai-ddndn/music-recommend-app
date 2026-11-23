import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { adminCurators } from "@/lib/repo/admin";
import { normalizeHandle } from "@/lib/repo/curators";
import { HttpError } from "@/lib/auth/session";

export const GET = handler(async () => {
  await requireUser(["admin"]);
  return json({ curators: await adminCurators(await getReadyDb()) });
});

const Create = z.object({
  handle: z.string().min(1),
  display_name: z.string().trim().max(50).optional(),
  base_weight: z.number().min(0).max(10).default(1),
});

/** 管理者による直接追加（pending で作り、承認操作で x_user_id を取得する） */
export const POST = handler(async (req: Request) => {
  await requireUser(["admin"]);
  const input = await body(req, Create);
  const handle = normalizeHandle(input.handle);
  const db = await getReadyDb();
  const dup = (await db.list("curators")).find((c) => c.x_handle.toLowerCase() === handle.toLowerCase());
  if (dup) throw new HttpError(409, `@${handle} は既に登録されています`);
  const [curator] = await db.insert("curators", [
    {
      x_user_id: null,
      x_handle: handle,
      display_name: input.display_name || handle,
      status: "pending",
      base_weight: input.base_weight,
      claimed_by_user_id: null,
      bio: null,
          profile_tags: {},
    },
  ]);
  return json({ curator }, { status: 201 });
});
