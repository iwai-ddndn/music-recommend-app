// X API v2 クライアント。
// 公式ドキュメント（docs.x.com）確認事項:
// - recent search は直近7日。max_results は 10〜100。since_id には前回の meta.newest_id を渡す。
// - URLは entities.urls[] の unwound_url（最終URL、無いこともある）→ expanded_url の順で使う。
// - 料金は pay-per-use。Posts: Read が1件 $0.005、User: Read が1件 $0.010。
//   同じリソースはUTC日内なら再課金されない。
import { env, useFixtures } from "../env";
import { fetchJson } from "./http";
import { loadFixture } from "./fixtures";

export type XPost = {
  id: string;
  author_id: string;
  created_at: string;
  entities?: { urls?: { url: string; expanded_url?: string; unwound_url?: string }[] };
};

type SearchResponse = {
  data?: XPost[];
  includes?: { users?: { id: string; username: string; name: string }[] };
  meta?: { newest_id?: string; oldest_id?: string; result_count: number; next_token?: string };
};

export type SearchResult = {
  posts: XPost[];
  usernames: Map<string, string>;
  newestId: string | null;
  nextToken: string | null;
  resultCount: number;
};

export function postUrls(p: XPost): string[] {
  return (p.entities?.urls ?? []).map((u) => u.unwound_url || u.expanded_url || u.url);
}

function searchFixture(query: string, sinceId: string | null): SearchResult {
  const all = loadFixture<SearchResponse>("x/search.json");
  const handles = new Set(
    [...query.matchAll(/from:([A-Za-z0-9_]+)/g)].map((m) => m[1].toLowerCase()),
  );
  const users = all.includes?.users ?? [];
  const ids = new Set(users.filter((u) => handles.has(u.username.toLowerCase())).map((u) => u.id));
  const posts = (all.data ?? []).filter(
    (p) => ids.has(p.author_id) && (!sinceId || BigInt(p.id) > BigInt(sinceId)),
  );
  const newest = posts.reduce<string | null>(
    (m, p) => (!m || BigInt(p.id) > BigInt(m) ? p.id : m),
    null,
  );
  return {
    posts,
    usernames: new Map(users.map((u) => [u.id, u.username])),
    newestId: newest,
    nextToken: null,
    resultCount: posts.length,
  };
}

export async function searchRecent(args: {
  query: string;
  sinceId: string | null;
  nextToken?: string | null;
  maxResults: number;
}): Promise<SearchResult> {
  if (useFixtures()) return searchFixture(args.query, args.sinceId);
  if (!env.xBearerToken) throw new Error("X_BEARER_TOKEN is not set");
  const params = new URLSearchParams({
    query: args.query,
    max_results: String(Math.min(100, Math.max(10, args.maxResults))),
    "tweet.fields": "created_at,author_id,entities",
    expansions: "author_id",
    "user.fields": "username",
  });
  if (args.sinceId) params.set("since_id", args.sinceId);
  if (args.nextToken) params.set("next_token", args.nextToken);
  const res = await fetchJson<SearchResponse>(
    `https://api.x.com/2/tweets/search/recent?${params}`,
    { headers: { authorization: `Bearer ${env.xBearerToken}` } },
  );
  return {
    posts: res.data ?? [],
    usernames: new Map((res.includes?.users ?? []).map((u) => [u.id, u.username])),
    newestId: res.meta?.newest_id ?? null,
    nextToken: res.meta?.next_token ?? null,
    resultCount: res.meta?.result_count ?? 0,
  };
}

export type XUser = { id: string; username: string; name: string };

/** ハンドルから x_user_id を取得（承認時に呼ぶ。User: Read 課金） */
export async function getUserByUsername(handle: string): Promise<XUser | null> {
  const username = handle.replace(/^@/, "");
  if (useFixtures()) {
    const users = loadFixture<SearchResponse>("x/search.json").includes?.users ?? [];
    const extra = loadFixture<XUser[]>("x/users.json");
    return (
      [...users, ...extra].find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null
    );
  }
  if (!env.xBearerToken) throw new Error("X_BEARER_TOKEN is not set");
  const res = await fetchJson<{ data?: XUser; errors?: unknown[] }>(
    `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`,
    { headers: { authorization: `Bearer ${env.xBearerToken}` } },
  );
  return res.data ?? null;
}
