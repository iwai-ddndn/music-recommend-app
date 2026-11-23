import { handler, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { listCampaigns } from "@/lib/repo/campaigns";
import { pitchMatchesFor } from "@/lib/repo/feed";

export const GET = handler(async (req: Request) => {
  const fav = (new URL(req.url).searchParams.get("fav") ?? "").split("|").filter(Boolean).slice(0, 50);
  const [db, user] = await Promise.all([getReadyDb(), getSessionUser()]);
  const campaigns = await listCampaigns(db);
  const matches = await pitchMatchesFor(db, user?.id ?? null, fav);
  return json({
    campaigns,
    matched_count: [...matches.values()].reduce((n, m) => n + m.length, 0),
  });
});
