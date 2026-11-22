// 目利き（仕様書 8章）
import { appConfig } from "../config";
import { HttpError } from "../auth/session";
import type { Db } from "../db/types";
import { getUserByUsername } from "../external/x";
import { recomputeScores } from "../pipeline/scores";
import type { Curator, QueueItem } from "../types";
import { loadCatalog, trackCard } from "./catalog";

export type CuratorListItem = {
  id: string;
  x_handle: string;
  display_name: string;
  bio: string | null;
  claimed: boolean;
  recent_count: number;
  recent_tracks: QueueItem[];
  following: boolean;
  follower_count: number;
};

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
export function normalizeHandle(input: string): string {
  const h = input
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  if (!HANDLE.test(h)) throw new HttpError(400, "Xのハンドルの形式が正しくありません");
  return h;
}

export async function listCurators(
  db: Db,
  userId: string | null,
  opts: { now?: Date; curatorId?: string; recentLimit?: number } = {},
): Promise<CuratorListItem[]> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - appConfig.curators.recentWindowDays * 86400000).toISOString();
  const curators = await db.list("curators", {
    eq: opts.curatorId ? { status: "active", id: opts.curatorId } : { status: "active" },
  });
  const ids = curators.map((c) => c.id);
  const [mentions, follows, mine] = await Promise.all([
    db.list("mentions", { in: { curator_id: ids }, order: { column: "posted_at", ascending: false } }),
    db.list("curator_follows", { in: { curator_id: ids } }),
    userId ? db.list("curator_follows", { eq: { user_id: userId } }) : Promise.resolve([]),
  ]);
  const limit = opts.recentLimit ?? appConfig.curators.recentTracksShown;
  const recentByCurator = new Map<string, string[]>();
  const countByCurator = new Map<string, Set<string>>();
  for (const m of mentions) {
    const list = recentByCurator.get(m.curator_id) ?? [];
    if (!list.includes(m.track_id) && list.length < limit) list.push(m.track_id);
    recentByCurator.set(m.curator_id, list);
    if (m.posted_at >= since) {
      const s = countByCurator.get(m.curator_id) ?? new Set();
      s.add(m.track_id);
      countByCurator.set(m.curator_id, s);
    }
  }
  const catalog = await loadCatalog(db, [...new Set([...recentByCurator.values()].flat())]);
  const following = new Set(mine.map((f) => f.curator_id));
  return curators
    .map((c) => ({
      id: c.id,
      x_handle: c.x_handle,
      display_name: c.display_name,
      bio: c.bio,
      claimed: Boolean(c.claimed_by_user_id),
      recent_count: countByCurator.get(c.id)?.size ?? 0,
      recent_tracks: (recentByCurator.get(c.id) ?? []).flatMap((tid) => {
        const card = trackCard(catalog, tid);
        return card
          ? [{ ...card, reason: `@${c.x_handle} が推薦`, context: "feed" as const, pitch_id: null }]
          : [];
      }),
      following: following.has(c.id),
      follower_count: follows.filter((f) => f.curator_id === c.id).length,
    }))
    .sort((a, b) => Number(b.following) - Number(a.following) || b.recent_count - a.recent_count);
}

export async function follow(db: Db, userId: string, curatorId: string, on: boolean) {
  const c = await db.get("curators", curatorId);
  if (!c || c.status !== "active") throw new HttpError(404, "目利きが見つかりません");
  if (on) {
    await db.upsert("curator_follows", [{ user_id: userId, curator_id: curatorId }], ["user_id", "curator_id"]);
  } else {
    await db.remove("curator_follows", { user_id: userId, curator_id: curatorId });
  }
}

/** 目利きの推薦（リスナー）。既存ハンドルなら票として数える。 */
export async function suggestCurator(
  db: Db,
  userId: string,
  input: { handle: string; comment: string | null },
): Promise<{ status: "created" | "voted" | "already_active"; curator: Curator }> {
  const handle = normalizeHandle(input.handle);
  const existing = (await db.list("curators")).find((c) => c.x_handle.toLowerCase() === handle.toLowerCase());
  let curator = existing;
  let status: "created" | "voted" | "already_active" = "voted";
  if (!curator) {
    [curator] = await db.insert("curators", [
      {
        x_user_id: null,
        x_handle: handle,
        display_name: handle,
        status: "pending",
        base_weight: appConfig.scoring.defaultCuratorWeight,
        claimed_by_user_id: null,
        bio: null,
      },
    ]);
    status = "created";
  } else if (curator.status === "active") {
    status = "already_active";
  }
  await db.upsert(
    "curator_suggestions",
    [{ curator_id: curator.id, user_id: userId, comment: input.comment }],
    ["curator_id", "user_id"],
  );
  return { status, curator };
}

/** 承認（管理者）。X API でハンドルから x_user_id を取得して保存する。 */
export async function approveCurator(db: Db, curatorId: string): Promise<Curator> {
  const c = await db.get("curators", curatorId);
  if (!c) throw new HttpError(404, "目利きが見つかりません");
  const x = await getUserByUsername(c.x_handle);
  if (!x) throw new HttpError(422, `X に @${c.x_handle} が見つかりません`);
  const dup = (await db.list("curators", { eq: { x_user_id: x.id } })).find((o) => o.id !== c.id);
  if (dup) throw new HttpError(409, `同じXアカウントの目利き（@${dup.x_handle}）が既に登録されています`);
  const [updated] = await db.update(
    "curators",
    { id: c.id },
    {
      status: "active",
      x_user_id: x.id,
      x_handle: x.username,
      display_name: c.display_name === c.x_handle ? x.name : c.display_name,
    },
  );
  return updated;
}

export async function setCuratorStatus(db: Db, curatorId: string, status: "active" | "paused") {
  const [c] = await db.update("curators", { id: curatorId }, { status });
  if (!c) throw new HttpError(404, "目利きが見つかりません");
  // 停止時は収集を止め、既存の mentions をスコアから外す
  await recomputeScores(db);
  return c;
}

/** 本人確認（目利き）: Xアカウントでログインした本人が自分の curators 行を請求する */
export async function claimCurator(
  db: Db,
  userId: string,
  identity: { xUserId: string | null; handle: string | null },
): Promise<Curator> {
  const all = await db.list("curators", { eq: { status: "active" } });
  const target =
    (identity.xUserId && all.find((c) => c.x_user_id === identity.xUserId)) ||
    (identity.handle && all.find((c) => c.x_handle.toLowerCase() === identity.handle!.toLowerCase())) ||
    null;
  if (!target) throw new HttpError(404, "このXアカウントは目利きとして登録されていません");
  if (target.claimed_by_user_id && target.claimed_by_user_id !== userId) {
    throw new HttpError(409, "この目利きは既に本人確認済みです");
  }
  const [c] = await db.update("curators", { id: target.id }, { claimed_by_user_id: userId });
  const u = await db.get("users", userId);
  if (u && u.role === "listener") await db.update("users", { id: userId }, { role: "curator" });
  return c;
}
