// スコアだけを再計算する（係数を変えたとき用）
import { recomputeScores } from "../src/lib/pipeline/scores";
import { run } from "./_run";

run("score", (db) => recomputeScores(db));
