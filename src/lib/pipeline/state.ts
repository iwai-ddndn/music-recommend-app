import type { Db } from "../db/types";

export async function getState<T>(db: Db, key: string): Promise<T | null> {
  const row = (await db.list("app_state", { eq: { key } }))[0];
  return row ? (row.value as T) : null;
}

export async function setState(db: Db, key: string, value: unknown): Promise<void> {
  await db.upsert("app_state", [{ key, value }], ["key"]);
}

export async function clearState(db: Db, key: string): Promise<void> {
  await db.remove("app_state", { key });
}
