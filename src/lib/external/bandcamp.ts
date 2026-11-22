// Bandcamp: 公開ページのメタタグから埋め込みプレイヤーURL・タイトル・アーティストを取る。
// 公式の開発者向けドキュメントは無い。bc-page-properties（item_id / item_type）と
// og:title / og:image を使う（非公式で変わりうるため、取れない場合は失敗理由つきで返す）。
// 1URLにつき1回だけ取得してキャッシュする（DBに track_sources があれば呼ばない＋プロセス内メモ）。
import { isFixtureMode } from "../env";
import { HttpError, USER_AGENT } from "./http";
import { loadFixture } from "./fixtures";

export type BandcampPage = {
  itemId: string;
  itemType: "track" | "album";
  title: string;
  artist: string | null;
  artworkUrl: string | null;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function meta(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]*${attr}=["']${key.replace(/[.:]/g, "\\$&")}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${key.replace(/[.:]/g, "\\$&")}["']`,
    "i",
  );
  const m = html.match(re);
  const v = m?.[1] ?? m?.[2];
  return v != null ? decodeEntities(v) : null;
}

/** 公開ページHTMLの解析（純粋関数） */
export function parseBandcampPage(html: string): BandcampPage | { error: string } {
  let itemId: string | null = null;
  let itemType: "track" | "album" | null = null;
  const props = meta(html, "name", "bc-page-properties");
  if (props) {
    try {
      const p = JSON.parse(props) as { item_id?: number | string; item_type?: string };
      if (p.item_id != null) itemId = String(p.item_id);
      if (p.item_type === "t" || p.item_type === "track") itemType = "track";
      if (p.item_type === "a" || p.item_type === "album") itemType = "album";
    } catch {
      /* fallthrough */
    }
  }
  const player = meta(html, "property", "og:video") ?? meta(html, "name", "twitter:player");
  if (player) {
    const m = player.match(/(track|album)=(\d+)/);
    if (m) {
      itemType ??= m[1] as "track" | "album";
      itemId ??= m[2];
    }
  }
  if (!itemId || !itemType) return { error: "bandcamp_item_id_missing" };
  const ogTitle = meta(html, "property", "og:title");
  if (!ogTitle) return { error: "bandcamp_title_missing" };
  // og:title は「曲名, by アーティスト」形式
  const byIdx = ogTitle.lastIndexOf(", by ");
  const title = byIdx >= 0 ? ogTitle.slice(0, byIdx) : ogTitle;
  const artist = byIdx >= 0 ? ogTitle.slice(byIdx + 5) : meta(html, "property", "og:site_name");
  return {
    itemId,
    itemType,
    title: title.trim(),
    artist: artist?.trim() || null,
    artworkUrl: meta(html, "property", "og:image"),
  };
}

export function embedUrl(itemType: "track" | "album", itemId: string): string {
  return `https://bandcamp.com/EmbeddedPlayer/${itemType}=${itemId}/size=large/bgcol=ffffff/linkcol=0687f5/tracklist=false/artwork=small/transparent=true/`;
}

const memo = new Map<string, Promise<string | null>>();

export function fetchPage(url: string): Promise<string | null> {
  if (isFixtureMode()) {
    return Promise.resolve(loadFixture<Record<string, string>>("bandcamp/pages.json")[url] ?? null);
  }
  if (!memo.has(url)) {
    memo.set(
      url,
      (async () => {
        const res = await fetch(url, {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new HttpError(res.status, `${res.status} ${url}`);
        return await res.text();
      })(),
    );
  }
  return memo.get(url)!;
}
