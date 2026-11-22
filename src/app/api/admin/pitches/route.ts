import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { pitchViews } from "@/lib/repo/campaigns";
import type { PitchStatus } from "@/lib/types";

export const GET = handler(async (req: Request) => {
  const admin = await requireUser(["admin"]);
  const status = (new URL(req.url).searchParams.get("status") ?? "pending") as PitchStatus;
  const db = await getReadyDb();
  const pitches = await db.list("pitches", { eq: { status }, order: { column: "created_at", ascending: false } });
  const campaigns = await db.list("campaigns");
  const views = await pitchViews(db, pitches, admin.id);
  return json({
    pitches: views.map((v) => ({
      ...v,
      campaign_title: campaigns.find((c) => c.id === v.campaign_id)?.title ?? "",
    })),
  });
});
