import { handler, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { getFeed } from "@/lib/repo/feed";

export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const d = url.searchParams.get("depth");
  const depth = d != null && d !== "" ? Number(d) : undefined;
  const [db, user] = await Promise.all([getReadyDb(), getSessionUser()]);
  const feed = await getFeed(db, user, { depth: Number.isFinite(depth) ? depth : undefined });
  return json(feed);
});
