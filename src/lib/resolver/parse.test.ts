import { describe, expect, it } from "vitest";
import {
  detectService,
  extractCandidateUrls,
  isShortenerUrl,
  parseMusicUrl,
} from "./parse";

describe("parseMusicUrl: Apple Music", () => {
  it("アルバムURL + ?i= から曲IDとストアフロントを取り出す", () => {
    const r = parseMusicUrl(
      "https://music.apple.com/jp/album/some-album/1440857781?i=1440857795&l=en",
    );
    expect(r).toMatchObject({
      ok: true,
      service: "apple",
      kind: "song",
      storefront: "jp",
      songId: "1440857795",
      albumId: "1440857781",
    });
  });

  it("/song/{slug}/{id} 形式", () => {
    const r = parseMusicUrl("https://music.apple.com/us/song/blue/1597384521");
    expect(r).toMatchObject({ ok: true, kind: "song", storefront: "us", songId: "1597384521" });
  });

  it("/song/{id}（スラッグなし）", () => {
    const r = parseMusicUrl("https://music.apple.com/gb/song/1597384521");
    expect(r).toMatchObject({ ok: true, kind: "song", songId: "1597384521" });
  });

  it("曲指定のないアルバムURLは album として返す（先頭曲の採用は resolve 側）", () => {
    const r = parseMusicUrl("https://music.apple.com/jp/album/x/1440857781");
    expect(r).toMatchObject({ ok: true, kind: "album", albumId: "1440857781", songId: null });
  });

  it("ストアフロントが無いURLは storefront=null", () => {
    const r = parseMusicUrl("https://music.apple.com/song/1597384521");
    expect(r).toMatchObject({ ok: true, storefront: null, songId: "1597384521" });
  });

  it("geo.music.apple.com も Apple として扱う", () => {
    expect(detectService("https://geo.music.apple.com/jp/album/x/1?i=2")).toBe("apple");
  });

  it("プレイリストやアーティストURLは失敗理由つきで返す", () => {
    const r = parseMusicUrl("https://music.apple.com/jp/playlist/abc/pl.123");
    expect(r).toEqual({ ok: false, service: "apple", reason: "apple_unsupported_type:playlist" });
  });
});

describe("parseMusicUrl: SoundCloud", () => {
  it("soundcloud.com/{user}/{track} を正規化（クエリ除去・小文字化）", () => {
    const r = parseMusicUrl("https://SoundCloud.com/Some-Artist/Night-Drive?si=abc&utm_source=x");
    expect(r).toMatchObject({
      ok: true,
      service: "soundcloud",
      kind: "track",
      user: "some-artist",
      slug: "night-drive",
      canonicalUrl: "https://soundcloud.com/some-artist/night-drive",
    });
  });

  it("m.soundcloud.com も受け付ける", () => {
    expect(parseMusicUrl("https://m.soundcloud.com/a/b")).toMatchObject({ ok: true, kind: "track" });
  });

  it("シークレットトークン付きURL", () => {
    const r = parseMusicUrl("https://soundcloud.com/a/b/s-AbC123");
    expect(r).toMatchObject({ ok: true, secretToken: "s-AbC123" });
  });

  it("セット（プレイリスト）はMVP対象外", () => {
    expect(parseMusicUrl("https://soundcloud.com/a/sets/my-set")).toEqual({
      ok: false,
      service: "soundcloud",
      reason: "soundcloud_set_unsupported",
    });
  });

  it("プロフィールURLは曲ではない", () => {
    expect(parseMusicUrl("https://soundcloud.com/someone")).toMatchObject({
      ok: false,
      reason: "soundcloud_profile_url",
    });
  });

  it("予約パスは曲ではない", () => {
    expect(parseMusicUrl("https://soundcloud.com/discover/sets")).toMatchObject({ ok: false });
    expect(parseMusicUrl("https://soundcloud.com/a/likes")).toMatchObject({ ok: false });
  });

  it("on.soundcloud.com は短縮URLとして返す", () => {
    expect(parseMusicUrl("https://on.soundcloud.com/AbCd1")).toMatchObject({
      ok: true,
      kind: "short",
    });
  });

  it("api.soundcloud.com/tracks/{id}", () => {
    expect(parseMusicUrl("https://api.soundcloud.com/tracks/12345")).toMatchObject({
      ok: true,
      kind: "api_track",
      trackId: "12345",
    });
  });

  it("ウィジェットURLは中の url パラメータを解析する", () => {
    const r = parseMusicUrl(
      "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fa%2Fb&auto_play=false",
    );
    expect(r).toMatchObject({ ok: true, kind: "track", user: "a", slug: "b" });
  });
});

describe("parseMusicUrl: Bandcamp", () => {
  it("/track/ URL", () => {
    expect(parseMusicUrl("https://artistname.bandcamp.com/track/song-title?from=x")).toEqual({
      ok: true,
      service: "bandcamp",
      kind: "track",
      subdomain: "artistname",
      slug: "song-title",
      canonicalUrl: "https://artistname.bandcamp.com/track/song-title",
    });
  });

  it("/album/ URL", () => {
    expect(parseMusicUrl("https://artistname.bandcamp.com/album/ep")).toMatchObject({
      ok: true,
      kind: "album",
    });
  });

  it("アーティストのトップや bandcamp.com 本体は対象外", () => {
    expect(parseMusicUrl("https://artistname.bandcamp.com/")).toMatchObject({ ok: false });
    expect(parseMusicUrl("https://bandcamp.com/discover")).toMatchObject({ ok: false });
    expect(parseMusicUrl("https://daily.bandcamp.com/features/x")).toMatchObject({ ok: false });
  });
});

describe("parseMusicUrl: その他", () => {
  it("対象外ドメイン", () => {
    expect(parseMusicUrl("https://open.spotify.com/track/abc")).toEqual({
      ok: false,
      service: null,
      reason: "unsupported_domain",
    });
  });
  it("壊れた入力", () => {
    expect(parseMusicUrl("")).toMatchObject({ ok: false, reason: "invalid_url" });
    expect(parseMusicUrl("http://")).toMatchObject({ ok: false });
  });
  it("スキーム無しでも解析する", () => {
    expect(parseMusicUrl("soundcloud.com/a/b")).toMatchObject({ ok: true });
  });
});

describe("extractCandidateUrls", () => {
  const domains = ["music.apple.com", "soundcloud.com", "bandcamp.com"];
  const shorteners = ["on.soundcloud.com", "t.co"];
  it("対象ドメインと短縮URLだけを重複なく残す", () => {
    expect(
      extractCandidateUrls(
        [
          "https://soundcloud.com/a/b",
          "https://soundcloud.com/a/b",
          "https://example.com/x",
          "https://x.bandcamp.com/track/y",
          "https://on.soundcloud.com/zz",
          "https://music.apple.com/jp/song/1",
          "https://notbandcamp.com/track/y",
        ],
        domains,
        shorteners,
      ),
    ).toEqual([
      "https://soundcloud.com/a/b",
      "https://x.bandcamp.com/track/y",
      "https://on.soundcloud.com/zz",
      "https://music.apple.com/jp/song/1",
    ]);
  });
  it("isShortenerUrl", () => {
    expect(isShortenerUrl("https://on.soundcloud.com/a", shorteners)).toBe(true);
    expect(isShortenerUrl("https://soundcloud.com/a", shorteners)).toBe(false);
  });
});
