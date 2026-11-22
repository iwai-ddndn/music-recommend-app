// 曲URLのパーサー（純粋関数）。外部取得は resolve.ts 側で行う。
import type { Service } from "../types";

export type ParsedMusicUrl =
  | {
      ok: true;
      service: "apple";
      kind: "song" | "album";
      storefront: string | null;
      songId: string | null;
      albumId: string | null;
      canonicalUrl: string;
    }
  | {
      ok: true;
      service: "soundcloud";
      kind: "track" | "short" | "api_track";
      user: string | null;
      slug: string | null;
      secretToken: string | null;
      trackId: string | null;
      canonicalUrl: string;
    }
  | {
      ok: true;
      service: "bandcamp";
      kind: "track" | "album";
      subdomain: string;
      slug: string;
      canonicalUrl: string;
    }
  | { ok: false; service: Service | null; reason: string };

const SOUNDCLOUD_RESERVED = new Set([
  "discover",
  "stream",
  "search",
  "you",
  "upload",
  "stations",
  "charts",
  "pages",
  "settings",
  "messages",
  "notifications",
  "people",
  "terms-of-use",
  "jobs",
  "mobile",
  "pro",
  "imprint",
]);

const SOUNDCLOUD_NON_TRACK_SEGMENTS = new Set([
  "sets",
  "likes",
  "reposts",
  "tracks",
  "albums",
  "popular-tracks",
  "followers",
  "following",
  "comments",
  "spotlight",
]);

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function segments(u: URL): string[] {
  return u.pathname
    .split("/")
    .filter(Boolean)
    .map((s) => decodeURIComponent(s));
}

export function detectService(input: string): Service | null {
  const u = toUrl(input);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  if (host === "music.apple.com" || host.endsWith(".music.apple.com")) return "apple";
  if (host === "soundcloud.com" || host.endsWith(".soundcloud.com") || host === "snd.sc")
    return "soundcloud";
  if (host === "bandcamp.com" || host.endsWith(".bandcamp.com")) return "bandcamp";
  return null;
}

/** ホストが対象ドメイン（またはそのサブドメイン）に一致するか */
export function isTargetDomain(input: string, domains: string[]): boolean {
  const u = toUrl(input);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function isShortenerUrl(input: string, shorteners: string[]): boolean {
  const u = toUrl(input);
  if (!u) return false;
  return shorteners.includes(u.hostname.toLowerCase());
}

/** ストアフロントの無いAppleのURLに使う既定値 */
export const DEFAULT_APPLE_STOREFRONT = "jp";

const NUMERIC = /^\d+$/;
const STOREFRONT = /^[a-z]{2}$/i;

function parseApple(u: URL): ParsedMusicUrl {
  const segs = segments(u);
  let storefront: string | null = null;
  if (segs[0] && STOREFRONT.test(segs[0])) storefront = segs.shift()!.toLowerCase();
  const type = segs[0];
  const lastNumeric = [...segs].reverse().find((s) => NUMERIC.test(s)) ?? null;
  // .../album/{slug}/{albumId}?i={songId}
  if (type === "album") {
    const songId = u.searchParams.get("i");
    const albumId = lastNumeric;
    if (songId && NUMERIC.test(songId)) {
      return {
        ok: true,
        service: "apple",
        kind: "song",
        storefront,
        songId,
        albumId,
        canonicalUrl: `https://music.apple.com/${storefront ?? DEFAULT_APPLE_STOREFRONT}/song/${songId}`,
      };
    }
    if (!albumId) return { ok: false, service: "apple", reason: "apple_album_id_missing" };
    return {
      ok: true,
      service: "apple",
      kind: "album",
      storefront,
      songId: null,
      albumId,
      canonicalUrl: `https://music.apple.com/${storefront ?? DEFAULT_APPLE_STOREFRONT}/album/${albumId}`,
    };
  }
  if (type === "song") {
    if (!lastNumeric) return { ok: false, service: "apple", reason: "apple_song_id_missing" };
    return {
      ok: true,
      service: "apple",
      kind: "song",
      storefront,
      songId: lastNumeric,
      albumId: null,
      canonicalUrl: `https://music.apple.com/${storefront ?? DEFAULT_APPLE_STOREFRONT}/song/${lastNumeric}`,
    };
  }
  return {
    ok: false,
    service: "apple",
    reason: `apple_unsupported_type:${type ?? "none"}`,
  };
}

function parseSoundCloud(u: URL): ParsedMusicUrl {
  const host = u.hostname.toLowerCase();
  const segs = segments(u);
  if (host === "on.soundcloud.com" || host === "snd.sc") {
    if (segs.length === 0) return { ok: false, service: "soundcloud", reason: "soundcloud_short_empty" };
    return {
      ok: true,
      service: "soundcloud",
      kind: "short",
      user: null,
      slug: null,
      secretToken: null,
      trackId: null,
      canonicalUrl: `https://${host}/${segs.join("/")}`,
    };
  }
  if (host === "api.soundcloud.com" || host === "api-v2.soundcloud.com") {
    if (segs[0] === "tracks" && segs[1] && NUMERIC.test(segs[1])) {
      return {
        ok: true,
        service: "soundcloud",
        kind: "api_track",
        user: null,
        slug: null,
        secretToken: null,
        trackId: segs[1],
        canonicalUrl: `https://api.soundcloud.com/tracks/${segs[1]}`,
      };
    }
    return { ok: false, service: "soundcloud", reason: "soundcloud_api_unsupported" };
  }
  if (host === "w.soundcloud.com") {
    const inner = u.searchParams.get("url");
    if (inner) return parseMusicUrl(inner);
    return { ok: false, service: "soundcloud", reason: "soundcloud_widget_without_url" };
  }
  if (!["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com"].includes(host)) {
    return { ok: false, service: "soundcloud", reason: "soundcloud_unsupported_host" };
  }
  const [user, second, third] = segs;
  if (!user || SOUNDCLOUD_RESERVED.has(user)) {
    return { ok: false, service: "soundcloud", reason: "soundcloud_not_a_track" };
  }
  if (!second) return { ok: false, service: "soundcloud", reason: "soundcloud_profile_url" };
  if (second === "sets") return { ok: false, service: "soundcloud", reason: "soundcloud_set_unsupported" };
  if (SOUNDCLOUD_NON_TRACK_SEGMENTS.has(second)) {
    return { ok: false, service: "soundcloud", reason: "soundcloud_not_a_track" };
  }
  const secretToken = third && /^s-[A-Za-z0-9]+$/.test(third) ? third : null;
  const lowerUser = user.toLowerCase();
  const lowerSlug = second.toLowerCase();
  return {
    ok: true,
    service: "soundcloud",
    kind: "track",
    user: lowerUser,
    slug: lowerSlug,
    secretToken,
    trackId: null,
    canonicalUrl: `https://soundcloud.com/${lowerUser}/${lowerSlug}${secretToken ? `/${secretToken}` : ""}`,
  };
}

function parseBandcamp(u: URL): ParsedMusicUrl {
  const host = u.hostname.toLowerCase();
  const sub = host.endsWith(".bandcamp.com") ? host.slice(0, -".bandcamp.com".length) : "";
  if (!sub || sub === "www" || sub === "daily") {
    return { ok: false, service: "bandcamp", reason: "bandcamp_not_artist_page" };
  }
  const [type, slug] = segments(u);
  if ((type === "track" || type === "album") && slug) {
    const s = slug.toLowerCase();
    return {
      ok: true,
      service: "bandcamp",
      kind: type,
      subdomain: sub,
      slug: s,
      canonicalUrl: `https://${sub}.bandcamp.com/${type}/${s}`,
    };
  }
  return { ok: false, service: "bandcamp", reason: "bandcamp_not_track_or_album" };
}

export function parseMusicUrl(input: string): ParsedMusicUrl {
  const u = toUrl(input);
  if (!u) return { ok: false, service: null, reason: "invalid_url" };
  const service = detectService(u.toString());
  switch (service) {
    case "apple":
      return parseApple(u);
    case "soundcloud":
      return parseSoundCloud(u);
    case "bandcamp":
      return parseBandcamp(u);
    default:
      return { ok: false, service: null, reason: "unsupported_domain" };
  }
}

/**
 * ポストの展開済みURL群から対象ドメインのURLだけを抜き出し、重複を除く。
 * 短縮URLはそのまま残す（resolve 側でリダイレクトを解決する）。
 */
export function extractCandidateUrls(
  urls: string[],
  targetDomains: string[],
  shortenerDomains: string[],
): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    if (isTargetDomain(url, targetDomains) || isShortenerUrl(url, shortenerDomains)) {
      out.add(url.trim());
    }
  }
  return [...out];
}
