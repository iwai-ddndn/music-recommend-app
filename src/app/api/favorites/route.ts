import { z } from "zod";
import { body, handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { findOrCreateArtist } from "@/lib/pipeline/bootstrap";

export const GET = handler(async () => {
  const user = await requireUser();
  const db = await getReadyDb();
  const favs = await db.list("user_favorite_artists", { eq: { user_id: user.id } });
  const artists = await db.list("artists", { in: { id: favs.map((f) => f.artist_id) } });
  return json({
    artists: favs.map((f) => ({
      id: f.artist_id,
      name: artists.find((a) => a.id === f.artist_id)?.name ?? "",
      source: f.source,
    })),
  });
});

const Add = z.object({ name: z.string().trim().min(1).max(100) });

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { name } = await body(req, Add);
  const db = await getReadyDb();
  const artistId = await findOrCreateArtist(db, name);
  await db.upsert(
    "user_favorite_artists",
    [{ user_id: user.id, artist_id: artistId, source: "manual" }],
    ["user_id", "artist_id"],
  );
  return json({ id: artistId });
});

const Remove = z.object({ artist_id: z.string().min(1) });

export const DELETE = handler(async (req: Request) => {
  const user = await requireUser();
  const { artist_id } = await body(req, Remove);
  const db = await getReadyDb();
  await db.remove("user_favorite_artists", { user_id: user.id, artist_id });
  return json({ ok: true });
});
