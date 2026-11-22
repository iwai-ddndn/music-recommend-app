import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { getSessionUser, requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { useFixtures } from "@/lib/env";

export const GET = handler(async () => {
  const user = await getSessionUser();
  return json({ user, mode: useFixtures() ? "fixtures" : "live" });
});

const Patch = z.object({
  depth: z.number().min(0).max(1).optional(),
  display_name: z.string().trim().min(1).max(50).optional(),
  preferred_service: z.enum(["apple", "soundcloud", "bandcamp"]).nullable().optional(),
  // リスナーとアーティストの切り替えのみ本人が行える（目利き・管理者は別経路）
  role: z.enum(["listener", "artist"]).optional(),
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, Patch);
  const patch: Record<string, unknown> = {};
  if (input.depth !== undefined) patch.depth = input.depth;
  if (input.display_name !== undefined) patch.display_name = input.display_name;
  if (input.preferred_service !== undefined) patch.preferred_service = input.preferred_service;
  if (input.role && (user.role === "listener" || user.role === "artist")) patch.role = input.role;
  const db = await getReadyDb();
  await db.update("users", { id: user.id }, patch);
  return json({ user: await getSessionUser() });
});
