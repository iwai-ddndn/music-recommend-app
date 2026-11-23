// Apple Music API / デベロッパートークン。
// 公式ドキュメント確認事項:
// - JWT は ES256、ヘッダに kid、クレームに iss(Team ID)/iat/exp（最大 15,777,000 秒 ≒ 6か月）。
// - GET /v1/catalog/{storefront}/songs/{id} の attributes.isrc は「任意」項目（無い場合がある）。
// - relationships.artists は既定で識別子のみ含まれる。
import { importPKCS8, SignJWT } from "jose";
import { env, isFixtureMode } from "../env";
import { fetchJson } from "./http";
import { loadFixture } from "./fixtures";

const TOKEN_TTL_SEC = 60 * 60 * 12;
let cached: { token: string; exp: number } | null = null;

export function appleConfigured(): boolean {
  return Boolean(env.appleTeamId && env.appleKeyId && env.applePrivateKey);
}

export async function developerToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 300 > now) return cached.token;
  if (!appleConfigured()) throw new Error("Apple Music credentials are not configured");
  const key = await importPKCS8(env.applePrivateKey, "ES256");
  const exp = now + TOKEN_TTL_SEC;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.appleKeyId })
    .setIssuer(env.appleTeamId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key);
  cached = { token, exp };
  return token;
}

type SongResource = {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    url: string;
    isrc?: string;
    genreNames?: string[];
    durationInMillis?: number;
    artwork?: { url: string; width: number; height: number };
    previews?: { url: string }[];
  };
  relationships?: { artists?: { data: { id: string }[] } };
};

export type AppleSong = {
  id: string;
  name: string;
  artistName: string;
  appleArtistId: string | null;
  isrc: string | null;
  artworkUrl: string | null;
  url: string;
  genres: string[];
};

function toSong(r: SongResource): AppleSong {
  return {
    id: r.id,
    name: r.attributes.name,
    artistName: r.attributes.artistName,
    appleArtistId: r.relationships?.artists?.data?.[0]?.id ?? null,
    isrc: r.attributes.isrc ?? null,
    artworkUrl: r.attributes.artwork?.url.replace("{w}", "400").replace("{h}", "400") ?? null,
    url: r.attributes.url,
    genres: r.attributes.genreNames ?? [],
  };
}

type AppleFixtures = {
  songs: Record<string, SongResource>;
  albums: Record<string, { trackIds: string[] }>;
};

export async function getSong(storefront: string, id: string): Promise<AppleSong | null> {
  if (isFixtureMode()) {
    const r = loadFixture<AppleFixtures>("apple/catalog.json").songs[id];
    return r ? toSong(r) : null;
  }
  const token = await developerToken();
  try {
    const res = await fetchJson<{ data: SongResource[] }>(
      `https://api.music.apple.com/v1/catalog/${storefront}/songs/${id}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    return res.data[0] ? toSong(res.data[0]) : null;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

/** 曲指定の無いアルバムURLはMVPでは先頭曲を採用する */
export async function getAlbumFirstSongId(storefront: string, albumId: string): Promise<string | null> {
  if (isFixtureMode()) {
    return loadFixture<AppleFixtures>("apple/catalog.json").albums[albumId]?.trackIds[0] ?? null;
  }
  const token = await developerToken();
  const res = await fetchJson<{ data: { id: string }[] }>(
    `https://api.music.apple.com/v1/catalog/${storefront}/albums/${albumId}/tracks?limit=1`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  return res.data[0]?.id ?? null;
}
