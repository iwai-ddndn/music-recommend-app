import { handler, json } from "@/lib/api";
import { lookupPreviews } from "@/lib/external/itunes";

/** Apple の曲のプレビュー音源URL（キー不要）。再生中の曲と次の数曲をまとめて引く */
export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean);
  const previews = await lookupPreviews(ids, url.searchParams.get("sf") ?? "jp");
  return json({ previews }, { headers: { "cache-control": "private, max-age=600" } });
});
