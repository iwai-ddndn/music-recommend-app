import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { getFeed } from "@/lib/repo/feed";
import { TasteSchema } from "@/lib/taste/schema";

export const GET = handler(async (req: Request) => {
  const d = new URL(req.url).searchParams.get("depth");
  const depth = d != null && d !== "" ? Number(d) : undefined;
  const [db, user] = await Promise.all([getReadyDb(), getSessionUser()]);
  return json(await getFeed(db, user, { depth: Number.isFinite(depth) ? depth : undefined }));
});

const Body = z.object({
  depth: z.number().min(0).max(1).optional(),
  taste: TasteSchema.nullable().optional(),
  exclude: z.array(z.string().max(64)).max(500).optional(),
  favorites: z.array(z.string().max(100)).max(50).optional(),
});

/** 端末に持っている好み・聴いた曲・好きなアーティストを添えてキューを作る（サーバーは状態を持たない） */
export const POST = handler(async (req: Request) => {
  const input = await body(req, Body);
  const [db, user] = await Promise.all([getReadyDb(), getSessionUser()]);
  return json(
    await getFeed(db, user, {
      depth: input.depth,
      taste: input.taste ?? null,
      exclude: input.exclude,
      favoriteNames: input.favorites,
    }),
  );
});
