// URLリゾルバ（外部取得部分）。収集バッチとキャンペーン投稿の両方から呼ばれる共通モジュール。
// 解決できなかったURLは捨てず、失敗理由つきで resolve_failures に残す。
import { appConfig } from "../config";
import type { Db } from "../db/types";
import * as apple from "../external/apple";
import * as bandcamp from "../external/bandcamp";
import { resolveRedirect } from "../external/http";
import * as soundcloud from "../external/soundcloud";
import { normalizeTags } from "../taste/vocabulary";
import type { Service } from "../types";
import { DEFAULT_APPLE_STOREFRONT, isShortenerUrl, isTargetDomain, parseMusicUrl } from "./parse";

export type ResolvedTrack = {
  title: string;
  artistName: string;
  appleArtistId: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  /** サービスが返すジャンル名（シーンタグの初期値に使う） */
  genres: string[];
  source: {
    service: Service;
    external_id: string;
    url: string;
    embed_url: string | null;
    storefront: string | null;
    playable: boolean;
  };
};

export type ResolveResult = { ok: true; track: ResolvedTrack } | { ok: false; reason: string };

/** 外部取得を含む解決。DBに既にある（service, external_id / url）は呼び出し側で先に確認する。 */
export async function resolveUrl(input: string, depth = 0): Promise<ResolveResult> {
  if (depth > 3) return { ok: false, reason: "too_many_redirects" };
  const { shortenerDomains, targetDomains } = appConfig.collect;

  if (isShortenerUrl(input, shortenerDomains)) {
    try {
      const to = await resolveRedirect(input);
      if (to === input) return { ok: false, reason: "redirect_unresolved" };
      if (!isTargetDomain(to, targetDomains)) return { ok: false, reason: "redirect_to_unsupported_domain" };
      return resolveUrl(to, depth + 1);
    } catch (e) {
      return { ok: false, reason: `redirect_failed:${(e as Error).message}` };
    }
  }

  const parsed = parseMusicUrl(input);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  try {
    switch (parsed.service) {
      case "apple": {
        const storefront = parsed.storefront ?? DEFAULT_APPLE_STOREFRONT;
        const songId =
          parsed.songId ??
          (parsed.albumId ? await apple.getAlbumFirstSongId(storefront, parsed.albumId) : null);
        if (!songId) return { ok: false, reason: "apple_album_empty" };
        const song = await apple.getSong(storefront, songId);
        if (!song) return { ok: false, reason: "apple_song_not_found" };
        return {
          ok: true,
          track: {
            title: song.name,
            artistName: song.artistName,
            appleArtistId: song.appleArtistId,
            isrc: song.isrc,
            artworkUrl: song.artworkUrl,
            genres: song.genres,
            source: {
              service: "apple",
              external_id: song.id,
              url: `https://music.apple.com/${storefront}/song/${song.id}`,
              embed_url: `https://embed.music.apple.com/${storefront}/song/${song.id}`,
              storefront,
              playable: true,
            },
          },
        };
      }
      case "soundcloud": {
        if (parsed.kind === "short") {
          const to = await resolveRedirect(parsed.canonicalUrl);
          return resolveUrl(to, depth + 1);
        }
        const url = parsed.canonicalUrl;
        const oe = await soundcloud.oembed(url);
        if (!oe) return { ok: false, reason: "soundcloud_not_embeddable_or_missing" };
        const detail = await soundcloud.resolveTrack(url);
        const trackId = detail?.id ? String(detail.id) : soundcloud.trackIdFromEmbedHtml(oe.html);
        const apiUrl = trackId ? `https://api.soundcloud.com/tracks/${trackId}` : url;
        const playable = detail ? detail.embeddable_by !== "none" && detail.streamable !== false : true;
        return {
          ok: true,
          track: {
            title: detail?.title ?? stripAuthor(oe.title, oe.author_name),
            artistName:
              detail?.publisher_metadata?.artist || oe.author_name || detail?.user?.username || parsed.user || "Unknown",
            appleArtistId: null,
            isrc: detail?.publisher_metadata?.isrc || detail?.isrc || null,
            artworkUrl: detail?.artwork_url ?? oe.thumbnail_url ?? null,
            genres: detail?.genre ? [detail.genre] : [],
            source: {
              service: "soundcloud",
              external_id: trackId ?? `${parsed.user}/${parsed.slug}`,
              url,
              embed_url: soundcloud.widgetUrl(apiUrl),
              storefront: null,
              playable,
            },
          },
        };
      }
      case "bandcamp": {
        const html = await bandcamp.fetchPage(parsed.canonicalUrl);
        if (!html) return { ok: false, reason: "bandcamp_page_not_found" };
        const page = bandcamp.parseBandcampPage(html);
        if ("error" in page) return { ok: false, reason: page.error };
        return {
          ok: true,
          track: {
            title: page.title,
            artistName: page.artist ?? parsed.subdomain,
            appleArtistId: null,
            isrc: null,
            artworkUrl: page.artworkUrl,
            genres: [],
            source: {
              service: "bandcamp",
              external_id: `${page.itemType}:${page.itemId}`,
              url: parsed.canonicalUrl,
              embed_url: bandcamp.embedUrl(page.itemType, page.itemId),
              storefront: null,
              playable: true,
            },
          },
        };
      }
    }
  } catch (e) {
    return { ok: false, reason: `fetch_failed:${(e as Error).message}` };
  }
}

/** oEmbed の title は「曲名 by アーティスト」形式のことがある */
function stripAuthor(title: string, author?: string): string {
  if (author && title.endsWith(` by ${author}`)) return title.slice(0, -` by ${author}`.length);
  return title;
}

const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * DBにアーティスト・曲・再生先を upsert して track_id を返す。
 * 同一曲の判定: (service, external_id) → ISRC → 同一アーティスト＋同名タイトル の順。
 */
export async function upsertResolved(db: Db, r: ResolvedTrack): Promise<string> {
  const existingSource = (
    await db.list("track_sources", { eq: { service: r.source.service, external_id: r.source.external_id } })
  )[0];
  if (existingSource) return existingSource.track_id;

  let trackId: string | null = null;
  if (r.isrc) {
    trackId = (await db.list("tracks", { eq: { isrc: r.isrc } }))[0]?.id ?? null;
  }

  if (!trackId) {
    // アーティストの正規化キーは apple_artist_id を優先
    let artist =
      (r.appleArtistId && (await db.list("artists", { eq: { apple_artist_id: r.appleArtistId } }))[0]) || null;
    if (!artist) {
      const all = await db.list("artists");
      artist = all.find((a) => norm(a.name) === norm(r.artistName)) ?? null;
      if (artist && r.appleArtistId && !artist.apple_artist_id) {
        await db.update("artists", { id: artist.id }, { apple_artist_id: r.appleArtistId });
      }
    }
    if (!artist) {
      [artist] = await db.insert("artists", [
        {
          name: r.artistName,
          apple_artist_id: r.appleArtistId,
          mbid: null,
          lastfm_listeners: null,
          listeners_updated_at: null,
          tags: normalizeTags(r.genres.map((name) => ({ name, weight: 1 }))),
          tags_updated_at: null,
        },
      ]);
    }
    const sameTitle = (await db.list("tracks", { eq: { artist_id: artist.id } })).find(
      (t) => norm(t.title) === norm(r.title),
    );
    if (sameTitle) {
      trackId = sameTitle.id;
      if (r.isrc && !sameTitle.isrc) await db.update("tracks", { id: trackId }, { isrc: r.isrc });
    } else {
      const [t] = await db.insert("tracks", [
        {
          title: r.title,
          artist_id: artist.id,
          isrc: r.isrc,
          artwork_url: r.artworkUrl,
          lastfm_listeners: null,
          listeners_updated_at: null,
        },
      ]);
      trackId = t.id;
    }
  }

  await db.upsert("track_sources", [{ ...r.source, track_id: trackId }], ["service", "external_id"]);
  return trackId;
}

/** DBに既にある再生先URLなら外部取得をせずに track_id を返す（Bandcamp の「1URL1回」を含む） */
export async function findByUrl(db: Db, url: string): Promise<string | null> {
  const parsed = parseMusicUrl(url);
  if (!parsed.ok) return null;
  const hit = (await db.list("track_sources", { eq: { url: parsed.canonicalUrl } }))[0];
  return hit?.track_id ?? null;
}

export async function resolveAndStore(
  db: Db,
  url: string,
  origin: "collect" | "pitch",
): Promise<{ ok: true; trackId: string } | { ok: false; reason: string }> {
  const cached = await findByUrl(db, url);
  if (cached) return { ok: true, trackId: cached };
  const r = await resolveUrl(url);
  if (!r.ok) {
    await db.insert("resolve_failures", [{ url, reason: r.reason, origin }]);
    return r;
  }
  return { ok: true, trackId: await upsertResolved(db, r.track) };
}
