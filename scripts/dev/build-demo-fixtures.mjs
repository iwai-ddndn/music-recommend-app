// デモ用 fixtures（fixtures/demo）と config/onboarding.json を生成する。
//   1) node scripts/dev/fetch-itunes.mjs   … iTunes Search API から実在曲のデータを取得（fixtures/demo/itunes-raw.json）
//   2) node scripts/dev/build-demo-fixtures.mjs
// 曲・アーティストは iTunes API が返した実データ。目利き・ポスト・リスナー数は架空のデモデータ。
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "fixtures/demo");
const raw = JSON.parse(fs.readFileSync(path.join(out, "itunes-raw.json"), "utf8"));

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const big = (u) => (u ? u.replace("100x100bb", "400x400bb") : null);

// ---- シーン（好みの語彙）。aliases は Last.fm のタグ名 / Apple のジャンル名 ----
const scenes = [
  { id: "indie-pop", label: "インディーポップ", aliases: ["indie pop", "indie", "indie rock", "bedroom pop", "city pop", "jangle pop", "alternative", "オルタナティブ", "インディー・ロック", "インディー・ポップ", "indie-pop"] },
  { id: "folk", label: "フォーク / 歌もの", aliases: ["folk", "singer-songwriter", "indie folk", "acoustic", "フォーク", "シンガーソングライター", "トラディショナル・フォーク", "フォーク・ロック"] },
  { id: "shoegaze", label: "シューゲイズ", aliases: ["shoegaze", "dream pop", "noise pop", "post-rock", "blackgaze", "post-punk", "シューゲイザー"] },
  { id: "electronic", label: "エレクトロニック", aliases: ["electronic", "electronica", "house", "techno", "idm", "club", "footwork", "dance", "エレクトロニック", "IDM / エクスペリメンタル", "ダンス", "ハウス", "テクノ"] },
  { id: "ambient", label: "アンビエント", aliases: ["ambient", "new age", "drone", "environmental", "kankyo ongaku", "minimal", "modern classical", "アンビエント", "ニューエイジ", "インストゥルメンタル"] },
  { id: "beats-soul", label: "ビート / ソウル / ジャズ", aliases: ["soul", "neo-soul", "r&b", "rnb", "hip-hop", "hip hop", "beats", "lo-fi", "jazz", "funk", "R&B／ソウル", "ソウル", "ジャズ", "ヒップホップ/ラップ", "ヒップホップ"] },
];

// ---- 架空の目利き（デモ用）。好みのシーンを2つずつ持つ ----
const curators = [
  { handle: "lighthouse_rec", name: "Lighthouse Records", id: "1500000000000000001", weight: 1.2, bio: "下北沢の小さなレコード店", likes: ["indie-pop", "folk"] },
  { handle: "tidepool_label", name: "Tidepool Label", id: "1500000000000000002", weight: 1.0, bio: "宅録とアンビエントのレーベル", likes: ["ambient", "electronic"] },
  { handle: "nagi_writes", name: "凪", id: "1500000000000000003", weight: 1.0, bio: "音楽ライター", likes: ["folk", "indie-pop"] },
  { handle: "kamome_digs", name: "かもめディグ", id: "1500000000000000004", weight: 1.0, bio: "クラブとビートを掘る人", likes: ["electronic", "beats-soul"] },
  { handle: "midnight_crate", name: "Midnight Crate", id: "1500000000000000005", weight: 1.0, bio: "深夜のジャズとソウル", likes: ["beats-soul", "ambient"] },
  { handle: "bunkyo_tapes", name: "文京テープス", id: "1500000000000000006", weight: 1.0, bio: "カセットとZINEの店", likes: ["shoegaze", "indie-pop"] },
  { handle: "hoshino_listens", name: "星野", id: "1500000000000000007", weight: 0.8, bio: "通勤で聴いたものの記録", likes: ["shoegaze", "folk"] },
  { handle: "shibuya_hifi", name: "Shibuya Hi-Fi Store", id: "1500000000000000008", weight: 1.0, bio: "中古オーディオと新譜", likes: ["beats-soul", "electronic"] },
];
const pending = [
  { handle: "underpass_fm", name: "Underpass FM", id: "1500000000000000009" },
  { handle: "sora_no_oto", name: "空の音", id: "1500000000000000010" },
];

const tracks = raw.tracks;
const byCluster = {};
for (const t of tracks) (byCluster[t.cluster] ??= []).push(t);
const songUrl = (t) => `https://music.apple.com/jp/song/${t.trackId}`;

// ---- Apple カタログ（実データ） ----
const apple = { songs: {}, albums: {} };
for (const t of tracks) {
  apple.songs[t.trackId] = {
    id: t.trackId,
    type: "songs",
    attributes: {
      name: t.title,
      artistName: t.artist,
      url: songUrl(t),
      genreNames: [t.genre],
      durationInMillis: t.durationMs,
      artwork: t.artwork ? { url: t.artwork.replace("100x100bb", "{w}x{h}bb"), width: 1000, height: 1000 } : undefined,
    },
    relationships: { artists: { data: [{ id: t.artistId, type: "artists" }] } },
  };
}

// ---- タグ（デモ: 取得時に付けた編集上のシーン）とリスナー数（デモ用の概算。実測値ではない） ----
const tags = {};
const listeners = { _comment: "デモ用の概算値（実測ではない）。本番は Last.fm API から取得する。", tracks: {}, artists: {} };
const known = new Set(["men i trust", "yaeji", "adrianne lenker", "lamp", "長谷川白紙", "mk.gee", "nala sinephro", "tendre", "crumb", "loraine james", "パソコン音楽クラブ", "sam gendel", "alabaster deplume"]);
for (const t of tracks) {
  const k = t.artist.normalize("NFKC").trim().toLowerCase();
  tags[k] = { [t.cluster]: 1 };
  if (!(k in listeners.artists)) listeners.artists[k] = known.has(k) ? 200000 + Math.floor(rnd() * 900000) : 2000 + Math.floor(rnd() * 40000);
  listeners.tracks[`${k}|${t.title.trim().toLowerCase()}`] = Math.floor(listeners.artists[k] / (4 + rnd() * 8));
}

// ---- ポスト（架空） ----
const now = Date.parse(raw.fetchedAt);
const DAY = 86400000;
const posts = [];
const post = (c, url, daysAgo) => posts.push({ author_id: c.id, created_at: new Date(now - daysAgo * DAY).toISOString(), url });
const clusters = Object.keys(byCluster);
for (const c of curators) {
  const mine = c.likes.flatMap((l) => byCluster[l] ?? []);
  const chosen = new Set();
  for (let i = 0; i < 14; i++) {
    const pool = rnd() < 0.8 ? mine : byCluster[pick(clusters)];
    const t = pick(pool);
    if (chosen.has(t.trackId)) continue;
    chosen.add(t.trackId);
    post(c, songUrl(t), Math.floor(rnd() * 40));
    if (rnd() < 0.25) post(c, songUrl(t), Math.floor(rnd() * 10)); // 繰り返し推す
  }
}
// 解決できないURLの例（管理画面の確認用）
post(curators[1], "https://soundcloud.com/tidepool/sets/winter-compilation", 3);
post(curators[0], "https://music.apple.com/jp/album/missing/1?i=2", 8);
post(pending[0], songUrl(tracks[0]), 1); // 承認待ちの目利きは収集しない

posts.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
let id = 1863000000000000000n;
const search = {
  data: posts.map((p) => {
    id += 1000n + BigInt(Math.floor(rnd() * 1000));
    return { id: String(id), author_id: p.author_id, created_at: p.created_at, entities: { urls: [{ url: `https://t.co/x${id}`, expanded_url: p.url }] } };
  }),
  includes: { users: [...curators, ...pending].map((c) => ({ id: c.id, username: c.handle, name: c.name })) },
  meta: { result_count: posts.length },
};

// ---- シード ----
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const anchorNames = raw.anchors.map((a) => a.name);
const ref = (cluster) => raw.anchors.filter((a) => a.clusters.includes(cluster)).slice(0, 2).map((a) => a.name);
const pitchTrack = (cluster, n) => byCluster[cluster][n % byCluster[cluster].length];
const seedData = {
  users: [
    { id: U(1), role: "listener", display_name: "デモ リスナー", email: "listener@example.com", depth: 0.5, preferred_service: null },
    { id: U(2), role: "curator", display_name: "凪", email: "curator@example.com", depth: 0.5, preferred_service: null },
    { id: U(3), role: "artist", display_name: "デモ アーティスト", email: "artist@example.com", depth: 0.5, preferred_service: null },
    { id: U(4), role: "admin", display_name: "管理者", email: "admin@example.com", depth: 0.5, preferred_service: null },
  ],
  curators: [
    ...curators.map((c) => ({ x_user_id: c.id, x_handle: c.handle, display_name: c.name, status: "active", base_weight: c.weight, claimed_by_user_id: c.handle === "nagi_writes" ? U(2) : null, bio: c.bio })),
    ...pending.map((c) => ({ x_user_id: null, x_handle: c.handle, display_name: c.name, status: "pending", base_weight: 1.0, claimed_by_user_id: null, bio: null })),
  ],
  curator_suggestions: [
    { handle: "underpass_fm", user_id: U(1), comment: "深夜ラジオ系の選曲がいい" },
    { handle: "underpass_fm", user_id: U(3), comment: "毎週の新譜まとめが信頼できる" },
    { handle: "sora_no_oto", user_id: U(1), comment: "アンビエントに強い" },
  ],
  follows: [],
  favorite_artists: [],
  campaigns: [
    { key: "winter", title: "冬の夜に、まだ知られていない1曲を", description: "", starts_at: new Date(now - 7 * DAY).toISOString(), ends_at: new Date(now + 60 * DAY).toISOString(), max_pitches_per_user: 3, status: "open" },
    { key: "autumn", title: "秋の散歩BGM", description: "", starts_at: new Date(now - 90 * DAY).toISOString(), ends_at: new Date(now - 60 * DAY).toISOString(), max_pitches_per_user: 3, status: "closed" },
  ],
  pitches: [
    { campaign: "winter", user_id: U(2), submitter_type: "curator", url: songUrl(pitchTrack("folk", 1)), comment: "静かな夜の帰り道に。", status: "approved", refs: ref("folk") },
    { campaign: "winter", user_id: U(2), submitter_type: "curator", url: songUrl(pitchTrack("ambient", 2)), comment: "雪の朝みたいな音。", status: "approved", refs: ref("ambient") },
    { campaign: "winter", user_id: U(3), submitter_type: "artist", url: songUrl(pitchTrack("indie-pop", 4)), comment: "デモ用の投稿です。", status: "approved", refs: ref("indie-pop") },
    { campaign: "winter", user_id: U(3), submitter_type: "artist", url: songUrl(pitchTrack("shoegaze", 3)), comment: "デモ用の投稿です。", status: "pending", refs: ref("shoegaze") },
  ],
};

const w = (p, d) => {
  fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true });
  fs.writeFileSync(path.join(out, p), JSON.stringify(d, null, 1) + "\n");
};
w("x/search.json", search);
w("x/users.json", [{ id: "1500000000000000011", username: "new_digger", name: "New Digger" }]);
w("apple/catalog.json", apple);
w("soundcloud/oembed.json", {});
w("bandcamp/pages.json", {});
w("lastfm/listeners.json", listeners);
w("lastfm/tags.json", tags);
w("redirects.json", {});
w("seed.json", seedData);
fs.writeFileSync(
  path.join(root, "config/onboarding.json"),
  JSON.stringify(
    {
      $comment: "オンボーディングの語彙。scenes.aliases は Last.fm のタグ / Apple のジャンル名をシーンに寄せる対応表。anchors は iTunes Search API の実データ（タグは編集上の割り当て）。",
      scenes,
      anchors: raw.anchors.map((a) => ({ name: a.name, apple_artist_id: a.artistId, artwork_url: big(a.artwork), tags: a.clusters })),
    },
    null,
    1,
  ) + "\n",
);
console.log("tracks", tracks.length, "posts", posts.length, "anchors", anchorNames.length);
