// 管理画面用の集計
import type { Db } from "../db/types";
import { env } from "../env";
import { BUDGET_STATE_KEY, monthlySpend, X_PROVIDER } from "../pipeline/budget";
import { SINCE_ID_KEY } from "../pipeline/collect";
import { getState } from "../pipeline/state";

export async function adminOverview(db: Db, now = new Date()) {
  const [curators, pitches, failures, usage, budgetState, sinceId, scores, suggestions] = await Promise.all([
    db.list("curators"),
    db.list("pitches", { eq: { status: "pending" } }),
    db.list("resolve_failures", { order: { column: "created_at", ascending: false }, limit: 50 }),
    db.list("api_usage", {
      eq: { provider: X_PROVIDER },
      gte: { date: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10) },
      order: { column: "date", ascending: true },
    }),
    getState<{ month: string; spent: number; budget: number; at: string }>(db, BUDGET_STATE_KEY),
    getState<string>(db, SINCE_ID_KEY),
    db.list("track_scores", { order: { column: "computed_at", ascending: false }, limit: 1 }),
    db.list("curator_suggestions"),
  ]);
  const spent = await monthlySpend(db, X_PROVIDER, now);
  const budget = env.xMonthlyBudgetUsd;
  return {
    budget: {
      monthly_budget_usd: budget,
      spent_usd: Math.round(spent * 10000) / 10000,
      ratio: budget ? spent / budget : null,
      exceeded: Boolean(budgetState) || (budget > 0 && spent >= budget),
      exceeded_at: budgetState?.at ?? null,
    },
    usage: usage.map((u) => ({ date: u.date, units: u.units, estimated_usd: Number(u.estimated_usd) })),
    counts: {
      active_curators: curators.filter((c) => c.status === "active").length,
      pending_curators: curators.filter((c) => c.status === "pending").length,
      paused_curators: curators.filter((c) => c.status === "paused").length,
      pending_pitches: pitches.length,
      suggestions: suggestions.length,
    },
    last_since_id: sinceId,
    last_scored_at: scores[0]?.computed_at ?? null,
    failures,
  };
}

export async function adminCurators(db: Db) {
  const [curators, suggestions, users] = await Promise.all([
    db.list("curators"),
    db.list("curator_suggestions"),
    db.list("users"),
  ]);
  return curators
    .map((c) => {
      const votes = suggestions.filter((s) => s.curator_id === c.id);
      return {
        ...c,
        votes: votes.length,
        comments: votes
          .filter((v) => v.comment)
          .map((v) => ({
            comment: v.comment!,
            by: users.find((u) => u.id === v.user_id)?.display_name ?? "リスナー",
          })),
      };
    })
    .sort((a, b) => {
      const order = { pending: 0, active: 1, paused: 2 } as const;
      return order[a.status] - order[b.status] || b.votes - a.votes || a.x_handle.localeCompare(b.x_handle);
    });
}
