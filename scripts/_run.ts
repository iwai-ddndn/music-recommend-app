// バッチ共通: .env を読み、DBを取得して処理を実行する
import { getDb, getReadyDb } from "../src/lib/db";

export async function run(name: string, fn: (db: Awaited<ReturnType<typeof getReadyDb>>) => Promise<unknown>) {
  const started = Date.now();
  try {
    const db = process.env.SKIP_BOOTSTRAP ? getDb() : await getReadyDb();
    const result = await fn(db);
    console.log(JSON.stringify({ job: name, ok: true, ms: Date.now() - started, result }));
  } catch (e) {
    console.error(JSON.stringify({ job: name, ok: false, error: (e as Error).message }));
    process.exitCode = 1;
  }
}
