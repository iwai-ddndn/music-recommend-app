import { handler, json } from "@/lib/api";
import { getReadyDb } from "@/lib/db";

/** アーティスト検索（好きなアーティスト登録・推薦の参照アーティスト入力の補完用） */
export const GET = handler(async (req: Request) => {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const db = await getReadyDb();
  const artists = await db.list("artists");
  const hits = artists
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    })
    .slice(0, 12)
    .map((a) => ({ id: a.id, name: a.name }));
  return json({ artists: hits });
});
