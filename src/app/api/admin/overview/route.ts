import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { adminOverview } from "@/lib/repo/admin";

export const GET = handler(async () => {
  await requireUser(["admin"]);
  return json(await adminOverview(await getReadyDb()));
});
