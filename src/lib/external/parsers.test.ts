import { describe, expect, it } from "vitest";
import { embedUrl, parseBandcampPage } from "./bandcamp";
import { trackIdFromEmbedHtml } from "./soundcloud";

describe("parseBandcampPage", () => {
  it("bc-page-properties と og:title から取得", () => {
    const html = `<html><head>
      <meta name="bc-page-properties" content="{&quot;item_type&quot;:&quot;t&quot;,&quot;item_id&quot;:12345}">
      <meta property="og:title" content="Quiet Harbor, by Mizuiro Tape">
      <meta property="og:image" content="https://f4.bcbits.com/img/a1_10.jpg">
    </head></html>`;
    expect(parseBandcampPage(html)).toEqual({
      itemId: "12345",
      itemType: "track",
      title: "Quiet Harbor",
      artist: "Mizuiro Tape",
      artworkUrl: "https://f4.bcbits.com/img/a1_10.jpg",
    });
  });

  it("bc-page-properties が無ければ og:video の EmbeddedPlayer URL から取る", () => {
    const html = `<meta property="og:video" content="https://bandcamp.com/EmbeddedPlayer/v=2/album=999/size=large/">
      <meta property="og:title" content="EP One, by X">`;
    expect(parseBandcampPage(html)).toMatchObject({ itemId: "999", itemType: "album", title: "EP One" });
  });

  it("IDが取れなければ失敗理由", () => {
    expect(parseBandcampPage(`<meta property="og:title" content="a">`)).toEqual({
      error: "bandcamp_item_id_missing",
    });
  });

  it("埋め込みURL", () => {
    expect(embedUrl("track", "1")).toMatch(/^https:\/\/bandcamp\.com\/EmbeddedPlayer\/track=1\//);
  });
});

describe("trackIdFromEmbedHtml", () => {
  it("oEmbed の iframe src から trackId を取る", () => {
    const html =
      '<iframe width="100%" height="400" scrolling="no" frameborder="no" src="https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F293&show_artwork=true"></iframe>';
    expect(trackIdFromEmbedHtml(html)).toBe("293");
  });
  it("無ければ null", () => {
    expect(trackIdFromEmbedHtml("<div></div>")).toBeNull();
  });
});
