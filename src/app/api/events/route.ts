import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";

const Event = z.object({
  track_id: z.string().min(1),
  event: z.enum(["play", "complete", "skip", "save"]),
  context: z.enum(["feed", "pitch"]).default("feed"),
  pitch_id: z.string().nullable().optional(),
});

/** 再生開始・完聴・スキップ・保存を listen_events に記録（未ログインは記録しない） */
export const POST = handler(async (req: Request) => {
  const input = await body(req, Event);
  const user = await getSessionUser();
  if (!user) return json({ recorded: false });
  const db = await getReadyDb();
  if (input.event === "save") {
    const already = await db.list("listen_events", {
      eq: { user_id: user.id, track_id: input.track_id, event: "save" },
    });
    if (already.length) return json({ recorded: false, saved: true });
  }
  await db.insert("listen_events", [
    {
      user_id: user.id,
      track_id: input.track_id,
      event: input.event,
      context: input.context,
      pitch_id: input.pitch_id ?? null,
    },
  ]);
  return json({ recorded: true });
});

const Unsave = z.object({ track_id: z.string().min(1) });

export const DELETE = handler(async (req: Request) => {
  const input = await body(req, Unsave);
  const user = await getSessionUser();
  if (!user) return json({ removed: false });
  const db = await getReadyDb();
  await db.remove("listen_events", { user_id: user.id, track_id: input.track_id, event: "save" });
  return json({ removed: true });
});
