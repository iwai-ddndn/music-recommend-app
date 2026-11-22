import { handler, json } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getReadyDb } from "@/lib/db";
import { loadCatalog, trackCard } from "@/lib/repo/catalog";

/** 保存した曲 */
export const GET = handler(async () => {
  const user = await requireUser();
  const db = await getReadyDb();
  const saves = await db.list("listen_events", {
    eq: { user_id: user.id, event: "save" },
    order: { column: "created_at", ascending: false },
  });
  const ids = [...new Set(saves.map((s) => s.track_id))];
  const catalog = await loadCatalog(db, ids);
  const items = ids.flatMap((id) => {
    const c = trackCard(catalog, id);
    return c ? [{ ...c, reason: "保存した曲", context: "feed" as const, pitch_id: null }] : [];
  });
  return json({ items });
});
