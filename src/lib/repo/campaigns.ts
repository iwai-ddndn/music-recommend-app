// 推薦キャンペーン（投稿・審査・マッチング表示）
import { appConfig } from "../config";
import { HttpError } from "../auth/session";
import type { Db } from "../db/types";
import { findOrCreateArtist } from "../pipeline/bootstrap";
import { resolveAndStore } from "../resolver/resolve";
import type { Campaign, Pitch, QueueItem, SessionUser } from "../types";
import { loadCatalog, trackCard } from "./catalog";

export type PitchView = {
  id: string;
  status: Pitch["status"];
  reject_reason: string | null;
  comment: string;
  submitter_type: Pitch["submitter_type"];
  submitter_label: string;
  reference_artists: { id: string; name: string }[];
  matched: boolean;
  item: QueueItem | null;
  created_at: string;
  campaign_id: string;
};

export function isAcceptingPitches(c: Campaign, now = new Date()): boolean {
  return c.status === "open" && now >= new Date(c.starts_at) && now < new Date(c.ends_at);
}

export async function listCampaigns(db: Db, opts: { includeDraft?: boolean } = {}) {
  const all = await db.list("campaigns", { order: { column: "starts_at", ascending: false } });
  const visible = opts.includeDraft ? all : all.filter((c) => c.status !== "draft");
  const pitches = await db.list("pitches", { in: { campaign_id: visible.map((c) => c.id) } });
  return visible.map((c) => ({
    ...c,
    accepting: isAcceptingPitches(c),
    approved_count: pitches.filter((p) => p.campaign_id === c.id && p.status === "approved").length,
    pending_count: pitches.filter((p) => p.campaign_id === c.id && p.status === "pending").length,
  }));
}

export async function pitchViews(db: Db, pitches: Pitch[], userId: string | null): Promise<PitchView[]> {
  if (pitches.length === 0) return [];
  const [refs, favorites, catalog, curators, users] = await Promise.all([
    db.list("pitch_reference_artists", { in: { pitch_id: pitches.map((p) => p.id) } }),
    userId ? db.list("user_favorite_artists", { eq: { user_id: userId } }) : Promise.resolve([]),
    loadCatalog(db, [...new Set(pitches.map((p) => p.track_id))]),
    db.list("curators", { in: { claimed_by_user_id: pitches.map((p) => p.submitter_user_id) } }),
    db.list("users", { in: { id: pitches.map((p) => p.submitter_user_id) } }),
  ]);
  const artists = await db.list("artists", { in: { id: [...new Set(refs.map((r) => r.artist_id))] } });
  const artistName = new Map(artists.map((a) => [a.id, a.name]));
  const fav = new Set(favorites.map((f) => f.artist_id));
  return pitches.map((p) => {
    const refArtists = refs
      .filter((r) => r.pitch_id === p.id)
      .map((r) => ({ id: r.artist_id, name: artistName.get(r.artist_id) ?? "" }));
    const matchedNames = refArtists.filter((a) => fav.has(a.id)).map((a) => a.name);
    const curator = curators.find((c) => c.claimed_by_user_id === p.submitter_user_id);
    const submitter_label =
      p.submitter_type === "curator" && curator
        ? `@${curator.x_handle}`
        : (users.find((u) => u.id === p.submitter_user_id)?.display_name ?? "アーティスト本人");
    const card = trackCard(catalog, p.track_id);
    const shownNames = (matchedNames.length ? matchedNames : refArtists.map((a) => a.name)).slice(0, 2).join("、");
    const who = p.submitter_type === "artist" ? "本人推薦" : `${submitter_label} 推薦`;
    return {
      id: p.id,
      status: p.status,
      reject_reason: p.reject_reason,
      comment: p.comment,
      submitter_type: p.submitter_type,
      submitter_label,
      reference_artists: refArtists,
      matched: matchedNames.length > 0,
      item: card
        ? { ...card, reason: `${shownNames}が好きな人へ（${who}）`, context: "pitch", pitch_id: p.id }
        : null,
      created_at: p.created_at,
      campaign_id: p.campaign_id,
    };
  });
}

export async function getCampaignDetail(db: Db, campaignId: string, user: SessionUser | null) {
  const c = await db.get("campaigns", campaignId);
  if (!c || (c.status === "draft" && user?.role !== "admin")) throw new HttpError(404, "キャンペーンが見つかりません");
  const approved = await db.list("pitches", { eq: { campaign_id: c.id, status: "approved" } });
  const views = await pitchViews(db, approved, user?.id ?? null);
  views.sort((a, b) => Number(b.matched) - Number(a.matched) || b.created_at.localeCompare(a.created_at));
  const mine = user
    ? await pitchViews(db, await db.list("pitches", { eq: { campaign_id: c.id, submitter_user_id: user.id } }), user.id)
    : [];
  const submitterType = user ? submitterTypeFor(user) : null;
  return {
    campaign: { ...c, accepting: isAcceptingPitches(c) },
    pitches: views,
    mine,
    can_pitch: Boolean(user && submitterType),
    submitter_type: submitterType,
    remaining: Math.max(0, c.max_pitches_per_user - mine.length),
  };
}

export function submitterTypeFor(user: SessionUser): "curator" | "artist" | null {
  if (user.claimed_curator_id) return "curator";
  if (user.role === "artist") return "artist";
  return null;
}

export async function submitPitch(
  db: Db,
  user: SessionUser,
  campaignId: string,
  input: { url: string; reference_artists: string[]; comment: string },
): Promise<PitchView> {
  const c = await db.get("campaigns", campaignId);
  if (!c) throw new HttpError(404, "キャンペーンが見つかりません");
  if (!isAcceptingPitches(c)) throw new HttpError(409, "このキャンペーンは現在投稿を受け付けていません");
  const type = submitterTypeFor(user);
  if (!type) {
    throw new HttpError(403, "投稿できるのは本人確認済みの目利きか、アーティスト本人です");
  }
  const { minReferenceArtists, maxReferenceArtists, commentMaxLength } = appConfig.campaigns;
  const refs = [...new Set(input.reference_artists.map((s) => s.trim()).filter(Boolean))];
  if (refs.length < minReferenceArtists || refs.length > maxReferenceArtists) {
    throw new HttpError(400, `「このアーティストが好きな人へ」は${minReferenceArtists}〜${maxReferenceArtists}件で指定してください`);
  }
  if (input.comment.length > commentMaxLength) {
    throw new HttpError(400, `コメントは${commentMaxLength}文字以内にしてください`);
  }
  const mine = await db.list("pitches", { eq: { campaign_id: c.id, submitter_user_id: user.id } });
  if (mine.filter((p) => p.status !== "rejected").length >= c.max_pitches_per_user) {
    throw new HttpError(409, `このキャンペーンへの投稿は1人${c.max_pitches_per_user}件までです`);
  }
  const r = await resolveAndStore(db, input.url, "pitch");
  if (!r.ok) throw new HttpError(422, `曲のURLを解決できませんでした（${r.reason}）`);
  if (mine.some((p) => p.track_id === r.trackId)) throw new HttpError(409, "この曲は既に投稿済みです");
  const [pitch] = await db.insert("pitches", [
    {
      campaign_id: c.id,
      submitter_user_id: user.id,
      submitter_type: type,
      track_id: r.trackId,
      comment: input.comment.trim(),
      status: "pending",
      reject_reason: null,
    },
  ]);
  for (const name of refs) {
    await db.insert("pitch_reference_artists", [
      { pitch_id: pitch.id, artist_id: await findOrCreateArtist(db, name) },
    ]);
  }
  return (await pitchViews(db, [pitch], user.id))[0];
}

export async function reviewPitch(
  db: Db,
  pitchId: string,
  action: "approve" | "reject",
  reason: string | null,
) {
  if (action === "reject" && !reason?.trim()) throw new HttpError(400, "却下理由を入力してください");
  const [p] = await db.update(
    "pitches",
    { id: pitchId },
    action === "approve"
      ? { status: "approved", reject_reason: null }
      : { status: "rejected", reject_reason: reason!.trim() },
  );
  if (!p) throw new HttpError(404, "推薦が見つかりません");
  return p;
}
