// 収集バッチ（仕様書 5章）。目利きの「曲リンク付きポストだけ」を検索で取得する。
import { appConfig } from "../config";
import type { Db } from "../db/types";
import { env, useFixtures } from "../env";
import { postUrls, searchRecent } from "../external/x";
import { extractCandidateUrls } from "../resolver/parse";
import { resolveAndStore } from "../resolver/resolve";
import { buildQuery, groupHandles, maxPostId } from "../x/query";
import { BUDGET_STATE_KEY, monthlySpend, recordUsage, X_PROVIDER } from "./budget";
import { clearState, getState, setState } from "./state";

export const SINCE_ID_KEY = "x_since_id";

export type CollectSummary = {
  groups: number;
  postsRead: number;
  mentionsUpserted: number;
  resolveFailures: number;
  estimatedUsd: number;
  stoppedByBudget: boolean;
  sinceId: string | null;
  newestId: string | null;
};

export async function runCollect(
  db: Db,
  opts: { now?: Date; log?: (msg: string) => void } = {},
): Promise<CollectSummary> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const cfg = appConfig.collect;
  const budget = env.xMonthlyBudgetUsd;
  if (!budget && !useFixtures()) {
    throw new Error("X_MONTHLY_BUDGET_USD is not set; refusing to call the paid X API without a budget");
  }

  const summary: CollectSummary = {
    groups: 0,
    postsRead: 0,
    mentionsUpserted: 0,
    resolveFailures: 0,
    estimatedUsd: 0,
    stoppedByBudget: false,
    sinceId: await getState<string>(db, SINCE_ID_KEY),
    newestId: null,
  };

  const overBudget = async () => {
    if (!budget) return false;
    const spent = await monthlySpend(db, X_PROVIDER, now);
    if (spent >= budget) {
      await setState(db, BUDGET_STATE_KEY, { month: now.toISOString().slice(0, 7), spent, budget, at: now.toISOString() });
      return true;
    }
    return false;
  };

  if (await overBudget()) {
    summary.stoppedByBudget = true;
    log("monthly budget reached; collection skipped");
    return summary;
  }
  await clearState(db, BUDGET_STATE_KEY);

  const curators = await db.list("curators", { eq: { status: "active" } });
  const byXId = new Map(curators.filter((c) => c.x_user_id).map((c) => [c.x_user_id!, c]));
  const byHandle = new Map(curators.map((c) => [c.x_handle.toLowerCase(), c]));
  const groups = groupHandles(
    curators.map((c) => c.x_handle),
    cfg.targetDomains,
    cfg.maxQueryLength,
  );
  summary.groups = groups.length;

  let newest: string | null = null;
  outer: for (const group of groups) {
    const query = buildQuery(group, cfg.targetDomains);
    let nextToken: string | null = null;
    for (let page = 0; page < cfg.maxPagesPerGroup; page++) {
      if (await overBudget()) {
        summary.stoppedByBudget = true;
        log("monthly budget reached; stopping");
        break outer;
      }
      const res = await searchRecent({
        query,
        sinceId: summary.sinceId,
        nextToken,
        maxResults: cfg.maxResultsPerPage,
      });
      const usd = res.posts.length * cfg.costPerPostReadUsd;
      summary.postsRead += res.posts.length;
      summary.estimatedUsd += usd;
      await recordUsage(db, X_PROVIDER, res.posts.length, usd, now);
      newest = maxPostId(newest, res.newestId);

      for (const post of res.posts) {
        const username = res.usernames.get(post.author_id)?.toLowerCase();
        const curator = byXId.get(post.author_id) ?? (username ? byHandle.get(username) : undefined);
        if (!curator) continue;
        const urls = extractCandidateUrls(postUrls(post), cfg.targetDomains, cfg.shortenerDomains);
        for (const url of urls) {
          const r = await resolveAndStore(db, url, "collect");
          if (!r.ok) {
            summary.resolveFailures++;
            log(`resolve failed: ${url} (${r.reason})`);
            continue;
          }
          await db.upsert(
            "mentions",
            [
              {
                curator_id: curator.id,
                track_id: r.trackId,
                x_post_id: post.id,
                posted_at: post.created_at,
                source_url: url,
              },
            ],
            ["x_post_id", "track_id"],
          );
          summary.mentionsUpserted++;
        }
      }
      nextToken = res.nextToken;
      if (!nextToken) break;
    }
  }

  // 次回は取得済みIDより新しいものだけを要求する
  summary.newestId = newest;
  const nextSince = maxPostId(summary.sinceId, newest);
  if (nextSince) await setState(db, SINCE_ID_KEY, nextSince);
  return summary;
}
