// iTunes Search / Lookup API（キー不要）。Apple Music の曲の30秒プレビューURLを取る。
// - 利用条件: プレビューはストアのコンテンツの紹介用で、ストアへのリンク（バッジ）を添えること。
//   → 再生画面に必ず「Apple Music で聴く」を出す。フル再生は MusicKit（デベロッパートークン＋ユーザーの認可）。
// - レート制限はおよそ毎分20回。結果はキャッシュし、IDはまとめて lookup する。
// - プレビューURLは作品の再納品で変わることがあるため保存せず、trackId から都度（キャッシュつきで）引く。
import { fetchJson } from "./http";

type LookupResult = { trackId?: number; previewUrl?: string; trackViewUrl?: string; trackTimeMillis?: number };

export type Preview = { url: string | null; storeUrl: string | null };

const TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: Preview }>();
const inflight = new Map<string, Promise<void>>();

function cached(key: string): Preview | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > (hit.value.url ? TTL_MS : NEGATIVE_TTL_MS)) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

/** 外部に出ないモード（E2E）ではプレビューを解決しない */
function offline(): boolean {
  return process.env.NEXT_PUBLIC_PLAYER_MODE === "simulated";
}

/** Apple の曲ID（= iTunes の trackId）からプレビューURLを引く。まとめて1回の lookup にする */
export async function lookupPreviews(ids: string[], storefront: string): Promise<Record<string, Preview>> {
  const country = /^[a-z]{2}$/i.test(storefront) ? storefront.toLowerCase() : "jp";
  const wanted = [...new Set(ids.filter((id) => /^\d+$/.test(id)))].slice(0, 50);
  const key = (id: string) => `${country}:${id}`;
  const missing = wanted.filter((id) => cached(key(id)) === undefined);
  if (missing.length && !offline()) {
    const batchKey = `${country}:${missing.join(",")}`;
    if (!inflight.has(batchKey)) {
      inflight.set(
        batchKey,
        (async () => {
          try {
            const res = await fetchJson<{ results: LookupResult[] }>(
              `https://itunes.apple.com/lookup?id=${missing.join(",")}&country=${country}&entity=song`,
            );
            const byId = new Map(res.results.filter((r) => r.trackId).map((r) => [String(r.trackId), r]));
            for (const id of missing) {
              const r = byId.get(id);
              cache.set(key(id), {
                at: Date.now(),
                value: { url: r?.previewUrl ?? null, storeUrl: r?.trackViewUrl ?? null },
              });
            }
          } catch {
            // 失敗は短時間だけ覚えておき、再生側は「再生できない曲」として自動スキップする
            for (const id of missing) cache.set(key(id), { at: Date.now(), value: { url: null, storeUrl: null } });
          } finally {
            inflight.delete(batchKey);
          }
        })(),
      );
    }
    await inflight.get(batchKey);
  }
  return Object.fromEntries(wanted.map((id) => [id, cached(key(id)) ?? { url: null, storeUrl: null }]));
}
