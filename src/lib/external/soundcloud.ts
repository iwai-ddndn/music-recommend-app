// SoundCloud: oEmbed（キー不要）と、キーがあれば /resolve で補完。
// 公式ドキュメント確認事項:
// - /resolve は OAuth 2.1 のアクセストークンが必要（client_id クエリだけでは不可）。
//   公開リソースは client credentials フローで取得: POST https://secure.soundcloud.com/oauth/token
// - oEmbed は https://soundcloud.com/oembed?format=json&url=...
import { env, isFixtureMode } from "../env";
import { fetchJson, HttpError } from "./http";
import { loadFixture } from "./fixtures";

export type OEmbed = {
  title: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  html: string;
};

export async function oembed(url: string): Promise<OEmbed | null> {
  if (isFixtureMode()) {
    return loadFixture<Record<string, OEmbed>>("soundcloud/oembed.json")[url] ?? null;
  }
  try {
    return await fetchJson<OEmbed>(
      `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
    );
  } catch (e) {
    // 404/403: 非公開・削除・埋め込み不可
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** oEmbed の iframe src から api.soundcloud.com/tracks/{id} を取り出す（純粋関数） */
export function trackIdFromEmbedHtml(html: string): string | null {
  const src = html.match(/src="([^"]+)"/)?.[1];
  if (!src) return null;
  const decoded = decodeURIComponent(src.replace(/&amp;/g, "&"));
  return decoded.match(/api\.soundcloud\.com\/tracks\/(\d+)/)?.[1] ?? null;
}

export function widgetUrl(trackUrlOrApiUrl: string): string {
  const params = new URLSearchParams({
    url: trackUrlOrApiUrl,
    auto_play: "false",
    hide_related: "true",
    show_comments: "false",
    show_user: "true",
    show_reposts: "false",
    visual: "false",
  });
  return `https://w.soundcloud.com/player/?${params}`;
}

let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (!env.soundcloudClientId || !env.soundcloudClientSecret) return null;
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${env.soundcloudClientId}:${env.soundcloudClientSecret}`).toString("base64");
  const res = await fetchJson<{ access_token: string; expires_in: number }>(
    "https://secure.soundcloud.com/oauth/token",
    {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  );
  token = { value: res.access_token, exp: Date.now() + res.expires_in * 1000 };
  return token.value;
}

export type ScResolved = {
  id: number;
  title: string;
  user?: { username: string };
  artwork_url?: string | null;
  embeddable_by?: "all" | "me" | "none";
  streamable?: boolean;
  genre?: string | null;
  isrc?: string | null;
  publisher_metadata?: { isrc?: string | null; artist?: string | null } | null;
};

/** APIキー（任意）がある場合だけ詳細を補完する */
export async function resolveTrack(url: string): Promise<ScResolved | null> {
  if (isFixtureMode()) return null;
  const t = await accessToken();
  if (!t) return null;
  try {
    return await fetchJson<ScResolved>(
      `https://api.soundcloud.com/resolve?url=${encodeURIComponent(url)}`,
      { headers: { authorization: `OAuth ${t}`, accept: "application/json; charset=utf-8" } },
    );
  } catch {
    return null;
  }
}
