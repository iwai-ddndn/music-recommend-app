// fixtures モードのローカルDB初期化。seed.json の基本データを入れ、
// 実際の収集→人気度取得→スコア計算のパイプラインを fixtures 応答で流す。
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db/types";
import { fixturesDir } from "../external/fixtures";
import { resolveAndStore } from "../resolver/resolve";
import type { Campaign, PitchStatus, Role } from "../types";
import { runCollect } from "./collect";
import { refreshListeners } from "./listeners";
import { recomputeScores } from "./scores";
import { setState } from "./state";

type Seed = {
  users: { id: string; role: Role; display_name: string; email: string; depth: number; preferred_service: null }[];
  curators: {
    x_user_id: string | null;
    x_handle: string;
    display_name: string;
    status: "active" | "pending";
    base_weight: number;
    claimed_by_user_id: string | null;
    bio: string | null;
  }[];
  curator_suggestions: { handle: string; user_id: string; comment: string }[];
  follows: { user_id: string; handle: string }[];
  favorite_artists: { user_id: string; artist: string }[];
  campaigns: (Omit<Campaign, "id" | "created_at"> & { key: string })[];
  pitches: {
    campaign: string;
    user_id: string;
    submitter_type: "curator" | "artist";
    url: string;
    comment: string;
    status: PitchStatus;
    reject_reason?: string;
    refs: string[];
  }[];
};

export async function findOrCreateArtist(db: Db, name: string): Promise<string> {
  const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
  const hit = (await db.list("artists")).find((a) => norm(a.name) === norm(name));
  if (hit) return hit.id;
  const [a] = await db.insert("artists", [
    {
      name: name.trim(),
      apple_artist_id: null,
      mbid: null,
      lastfm_listeners: null,
      listeners_updated_at: null,
      tags: {},
      tags_updated_at: null,
    },
  ]);
  return a.id;
}

export async function bootstrapLocal(db: Db, log: (m: string) => void = () => {}): Promise<void> {
  const seed = JSON.parse(
    fs.readFileSync(path.join(fixturesDir(), "seed.json"), "utf8"),
  ) as Seed;
  const now = new Date();

  await db.insert("users", seed.users.map((u) => ({ ...u })));
  const curators = await db.insert(
    "curators",
    seed.curators.map((c) => ({ ...c, profile_tags: {} })),
  );
  const cid = (h: string) => curators.find((c) => c.x_handle === h)!.id;
  await db.insert(
    "curator_suggestions",
    seed.curator_suggestions.map((s) => ({ curator_id: cid(s.handle), user_id: s.user_id, comment: s.comment })),
  );
  await db.insert(
    "curator_follows",
    seed.follows.map((f) => ({ user_id: f.user_id, curator_id: cid(f.handle) })),
  );
  const campaigns = await db.insert(
    "campaigns",
    seed.campaigns.map(({ key: _k, ...c }) => {
      void _k;
      return c;
    }),
  );

  const collected = await runCollect(db, { now, log });
  log(`collect: ${JSON.stringify(collected)}`);

  for (const p of seed.pitches) {
    const r = await resolveAndStore(db, p.url, "pitch");
    if (!r.ok) continue;
    const campaign = campaigns[seed.campaigns.findIndex((c) => c.key === p.campaign)];
    const [pitch] = await db.insert("pitches", [
      {
        campaign_id: campaign.id,
        submitter_user_id: p.user_id,
        submitter_type: p.submitter_type,
        track_id: r.trackId,
        comment: p.comment,
        status: p.status,
        reject_reason: p.reject_reason ?? null,
      },
    ]);
    for (const name of p.refs) {
      await db.insert("pitch_reference_artists", [{ pitch_id: pitch.id, artist_id: await findOrCreateArtist(db, name) }]);
    }
  }

  for (const f of seed.favorite_artists) {
    await db.insert("user_favorite_artists", [
      { user_id: f.user_id, artist_id: await findOrCreateArtist(db, f.artist), source: "manual" },
    ]);
  }

  await refreshListeners(db, { now, log });
  await recomputeScores(db, now);
  await setState(db, "seeded", { at: now.toISOString() });
}
