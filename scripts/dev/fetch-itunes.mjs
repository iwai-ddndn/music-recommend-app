// Fetch real track data from the iTunes Search API (no key). ~20 req/min → 3.3s spacing.
import fs from "node:fs";
// 実行: NODE_USE_ENV_PROXY=1 node scripts/dev/fetch-itunes.mjs（プロキシ環境の場合）
const out = process.argv[2] ?? new URL("../../fixtures/demo/itunes-raw.json", import.meta.url).pathname;
// cluster = editorial taste cluster used only to give demo curators coherent tastes
const catalog = {
  "indie-pop": ["Lamp", "ミツメ", "Laura day romance", "家主", "South Penguin", "Luby Sparks", "ゆうらん船", "mei ehara", "Men I Trust", "Crumb"],
  "folk": ["柴田聡子", "優河", "角銅真実", "浮", "butaji", "寺尾紗穂", "Adrianne Lenker", "Skullcrusher"],
  "shoegaze": ["揺らぎ", "For Tracy Hyde", "17歳とベルリンの壁", "Whitney's Playland", "Hatchie", "明日の叙景"],
  "electronic": ["パソコン音楽クラブ", "食品まつり a.k.a foodman", "Cwondo", "長谷川白紙", "Loraine James", "Yaeji", "Salamanda"],
  "ambient": ["冥丁", "H.Takahashi", "蓮沼執太", "Hiroshi Yoshimura", "Nala Sinephro", "Ulla", "畠山地平"],
  "beats-soul": ["Salami Rose Joe Louis", "Duval Timothy", "Sam Gendel", "んoon", "TENDRE", "Mk.gee", "L'Rain", "Alabaster DePlume"],
};
// onboarding anchors: widely known artists a new user can recognise; cluster weights are editorial
const anchors = {
  "くるり": ["indie-pop", "folk"], "cero": ["indie-pop", "beats-soul"], "坂本慎太郎": ["indie-pop"], "フィッシュマンズ": ["indie-pop", "ambient"],
  "サカナクション": ["electronic", "indie-pop"], "羊文学": ["shoegaze", "indie-pop"], "カネコアヤノ": ["folk", "indie-pop"], "折坂悠太": ["folk"],
  "青葉市子": ["folk", "ambient"], "ハナレグミ": ["folk"], "きのこ帝国": ["shoegaze"], "My Bloody Valentine": ["shoegaze"],
  "Slowdive": ["shoegaze", "ambient"], "tofubeats": ["electronic", "beats-soul"], "Cornelius": ["electronic", "indie-pop"], "Aphex Twin": ["electronic", "ambient"],
  "Floating Points": ["electronic", "ambient"], "坂本龍一": ["ambient", "electronic"], "細野晴臣": ["ambient", "indie-pop"], "Brian Eno": ["ambient"],
  "Nujabes": ["beats-soul"], "Frank Ocean": ["beats-soul"], "Khruangbin": ["beats-soul", "indie-pop"], "Hiatus Kaiyote": ["beats-soul"],
  "Radiohead": ["shoegaze", "electronic"], "Tame Impala": ["indie-pop", "electronic"], "Big Thief": ["folk", "indie-pop"], "Bon Iver": ["folk", "ambient"],
  "Mac DeMarco": ["indie-pop"], "J Dilla": ["beats-soul"],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
async function search(term) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const u = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&attribute=artistTerm&country=jp&lang=ja_jp&limit=40`;
    const res = await fetch(u);
    if (res.ok) return (await res.json()).results;
    await sleep(20000);
  }
  return [];
}
const result = { fetchedAt: new Date().toISOString(), tracks: [], anchors: [], missing: [] };
const jobs = [
  ...Object.entries(catalog).flatMap(([cluster, names]) => names.map((name) => ({ kind: "track", cluster, name }))),
  ...Object.entries(anchors).map(([name, clusters]) => ({ kind: "anchor", clusters, name })),
];
for (const job of jobs) {
  const rows = (await search(job.name)).filter((r) => r.previewUrl && norm(r.artistName) === norm(job.name));
  if (rows.length === 0) { result.missing.push(job.name); console.log("MISSING", job.name); await sleep(3300); continue; }
  const pick = (r) => ({
    trackId: String(r.trackId), artistId: String(r.artistId), collectionId: String(r.collectionId), title: r.trackName, artist: r.artistName,
    genre: r.primaryGenreName, artwork: r.artworkUrl100, durationMs: r.trackTimeMillis, releaseDate: r.releaseDate,
  });
  if (job.kind === "anchor") {
    result.anchors.push({ name: rows[0].artistName, artistId: String(rows[0].artistId), artwork: rows[0].artworkUrl100, genre: rows[0].primaryGenreName, clusters: job.clusters });
  } else {
    const seen = new Set(); const picked = [];
    for (const r of rows) { // up to 3 tracks from different releases
      if (seen.has(r.collectionId) || picked.some((p) => p.title === r.trackName)) continue;
      seen.add(r.collectionId); picked.push({ ...pick(r), cluster: job.cluster });
      if (picked.length >= 3) break;
    }
    result.tracks.push(...picked);
  }
  console.log("ok", job.kind, job.name, rows.length);
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  await sleep(3300);
}
fs.writeFileSync(out, JSON.stringify(result, null, 1));
console.log("DONE tracks", result.tracks.length, "anchors", result.anchors.length, "missing", result.missing.join(", "));
