import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, unknown>();

/** 既定は実在曲のデモ（fixtures/demo）。E2E は架空データの fixtures/e2e を使う */
export function fixturesDir(): string {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.FIXTURES_DIR || "fixtures/demo");
}

/** fixtures/ 配下のJSONを読む（USE_FIXTURES=true 用） */
export function loadFixture<T>(rel: string): T {
  const file = path.join(fixturesDir(), rel);
  if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(file, "utf8")));
  return cache.get(file) as T;
}
