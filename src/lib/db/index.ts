import path from "node:path";
import { env, useFixtures } from "../env";
import { emptyData, LocalDb } from "./local";
import { SupabaseDb } from "./supabase";
import type { Db } from "./types";

const g = globalThis as unknown as { __db?: Db; __seeding?: Promise<void> };

export function getDb(): Db {
  if (g.__db) return g.__db;
  if (useFixtures()) {
    g.__db = new LocalDb(path.resolve(process.cwd(), env.localDbFile), emptyData);
  } else {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    }
    g.__db = new SupabaseDb(env.supabaseUrl, env.supabaseServiceRoleKey);
  }
  return g.__db;
}

/** fixtures モードでは初回アクセス時にシードとバッチを流して、すぐ試せる状態にする */
export async function getReadyDb(): Promise<Db> {
  const db = getDb();
  if (db.kind !== "local") return db;
  if (!g.__seeding) {
    g.__seeding = (async () => {
      const seeded = await db.list("app_state", { eq: { key: "seeded" } });
      if (seeded.length) return;
      const { bootstrapLocal } = await import("../pipeline/bootstrap");
      await bootstrapLocal(db);
    })();
  }
  await g.__seeding;
  return db;
}
