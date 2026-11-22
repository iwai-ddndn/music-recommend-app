import type { Db } from "../db/types";

export const X_PROVIDER = "x";
export const BUDGET_STATE_KEY = "x_budget_exceeded";

export function monthStart(now: Date): string {
  return `${now.toISOString().slice(0, 7)}-01`;
}

/** 当月の推定費用（USD） */
export async function monthlySpend(db: Db, provider: string, now: Date): Promise<number> {
  const rows = await db.list("api_usage", { eq: { provider }, gte: { date: monthStart(now) } });
  return rows.reduce((s, r) => s + Number(r.estimated_usd), 0);
}

/** 取得件数と推定費用を api_usage に記録（同日・同プロバイダの行に加算） */
export async function recordUsage(
  db: Db,
  provider: string,
  units: number,
  usd: number,
  now: Date,
): Promise<void> {
  if (units <= 0 && usd <= 0) return;
  const date = now.toISOString().slice(0, 10);
  const existing = (await db.list("api_usage", { eq: { provider, date } }))[0];
  if (existing) {
    await db.update(
      "api_usage",
      { id: existing.id },
      { units: existing.units + units, estimated_usd: Number(existing.estimated_usd) + usd },
    );
  } else {
    await db.insert("api_usage", [{ provider, date, units, estimated_usd: usd }]);
  }
}
