import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { loadCatalog, trackCard } from "@/lib/repo/catalog";
import { findByUrl, resolveUrl } from "@/lib/resolver/resolve";

/** 推薦フォームで、入力したURLがどの曲か事前に確認する（保存はしない） */
export const GET = handler(async (req: Request) => {
  await requireUser();
  const url = new URL(req.url).searchParams.get("url") ?? "";
  const db = await getReadyDb();
  const known = await findByUrl(db, url);
  if (known) {
    const card = trackCard(await loadCatalog(db, [known]), known);
    if (card) return json({ ok: true, title: card.title, artist: card.artist_name, artwork_url: card.artwork_url, service: card.sources[0]?.service });
  }
  const r = await resolveUrl(url);
  if (!r.ok) return json({ ok: false, reason: r.reason });
  return json({
    ok: true,
    title: r.track.title,
    artist: r.track.artistName,
    artwork_url: r.track.artworkUrl,
    service: r.track.source.service,
  });
});
