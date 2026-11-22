import { handler, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { listCurators } from "@/lib/repo/curators";

export const GET = handler(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const [db, user] = await Promise.all([getReadyDb(), getSessionUser()]);
  const all = await listCurators(db, user?.id ?? null);
  const curators = q
    ? all.filter((c) => c.x_handle.toLowerCase().includes(q) || c.display_name.toLowerCase().includes(q))
    : all;
  return json({ curators });
});
