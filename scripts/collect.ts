// 日次バッチ: X収集 → 人気度取得 → スコア再計算（仕様書 3章・5章）
import { runCollect } from "../src/lib/pipeline/collect";
import { refreshListeners } from "../src/lib/pipeline/listeners";
import { recomputeScores } from "../src/lib/pipeline/scores";
import { run } from "./_run";

const log = (m: string) => console.log(m);

run("daily", async (db) => {
  const collect = await runCollect(db, { log });
  const listeners = await refreshListeners(db, { log });
  const scores = await recomputeScores(db);
  return { collect, listeners, scores };
});
