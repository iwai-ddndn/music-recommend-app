// 目利きをCSV（ハンドル, 表示名, ウェイト）で一括登録する（仕様書 8章）。
//   npm run curators:import -- path/to/curators.csv [--no-lookup]
// 管理者による登録なので status=active で作成する。--no-lookup を付けない場合は
// X API でハンドルから x_user_id を取得する（User: Read 課金）。
import fs from "node:fs";
import { parseCuratorCsv } from "../src/lib/curators/csv";
import { getUserByUsername } from "../src/lib/external/x";
import { run } from "./_run";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const lookup = !args.includes("--no-lookup");

if (!file) {
  console.error("usage: npm run curators:import -- <file.csv> [--no-lookup]");
  process.exit(1);
}

run("import-curators", async (db) => {
  const { rows, errors } = parseCuratorCsv(fs.readFileSync(file, "utf8"));
  for (const e of errors) console.warn(`line ${e.line}: ${e.message}`);
  const existing = await db.list("curators");
  let created = 0;
  let updated = 0;
  const lookupFailed: string[] = [];
  for (const r of rows) {
    const x = lookup ? await getUserByUsername(r.handle).catch(() => null) : null;
    if (lookup && !x) lookupFailed.push(r.handle);
    const hit = existing.find(
      (c) => c.x_handle.toLowerCase() === r.handle.toLowerCase() || (x && c.x_user_id === x.id),
    );
    if (hit) {
      await db.update(
        "curators",
        { id: hit.id },
        {
          x_handle: r.handle,
          display_name: r.display_name,
          base_weight: r.base_weight,
          status: hit.status === "pending" ? "active" : hit.status,
          x_user_id: x?.id ?? hit.x_user_id,
        },
      );
      updated++;
    } else {
      await db.insert("curators", [
        {
          x_user_id: x?.id ?? null,
          x_handle: r.handle,
          display_name: r.display_name,
          status: "active",
          base_weight: r.base_weight,
          claimed_by_user_id: null,
          bio: null,
        },
      ]);
      created++;
    }
  }
  return { created, updated, invalidLines: errors.length, lookupFailed };
});
