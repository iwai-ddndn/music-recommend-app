import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, unknown>();

/** fixtures/ 配下のJSONを読む（USE_FIXTURES=true 用） */
export function loadFixture<T>(rel: string): T {
  const file = path.join(process.cwd(), "fixtures", rel);
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(file, "utf8")));
  return cache.get(file) as T;
}
