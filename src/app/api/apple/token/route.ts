import { connection } from "next/server";
import { handler, json } from "@/lib/api";
import { appleConfigured, developerToken } from "@/lib/external/apple";
import { useFixtures } from "@/lib/env";

/** MusicKit on the Web 用のデベロッパートークン（サーバーで発行して渡す） */
export const GET = handler(async () => {
  await connection();
  if (useFixtures() || !appleConfigured()) return json({ token: null });
  return json({ token: await developerToken() }, { headers: { "cache-control": "private, max-age=3600" } });
});
