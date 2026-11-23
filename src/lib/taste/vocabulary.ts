// シーンタグの語彙。Last.fm のタグや Apple のジャンル名を、少数の「シーン」に正規化する（純粋関数）。
import raw from "../../../config/onboarding.json";
import { normalize, type TagVector } from "../scoring/taste";

export type Scene = { id: string; label: string; aliases: string[] };
export type Anchor = {
  name: string;
  apple_artist_id: string;
  artwork_url: string | null;
  tags: string[];
};

export const scenes = raw.scenes as Scene[];
export const anchors = raw.anchors as Anchor[];

const key = (s: string) => s.normalize("NFKC").trim().toLowerCase();

const aliasMap = new Map<string, string>();
for (const s of scenes) {
  aliasMap.set(key(s.id), s.id);
  for (const a of s.aliases) aliasMap.set(key(a), s.id);
}

/** 生のタグ（名前と重み）をシーンのベクトルにする。語彙に無いタグは捨てる */
export function normalizeTags(rawTags: { name: string; weight: number }[], max = Infinity): TagVector {
  const out: TagVector = {};
  for (const t of rawTags) {
    const scene = aliasMap.get(key(t.name));
    if (scene && t.weight > 0) out[scene] = (out[scene] ?? 0) + t.weight;
  }
  return normalize(out, max);
}

export function sceneLabel(id: string): string {
  return scenes.find((s) => s.id === id)?.label ?? id;
}

export function anchorTagVector(a: Anchor): TagVector {
  return Object.fromEntries(a.tags.map((t) => [t, 1]));
}
