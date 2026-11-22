// 仕様書 5章: 目利きのハンドルを検索クエリの長さ上限に収まる単位でグループ化する（純粋関数）。
// 公式ドキュメント確認結果: url: 演算子はトークン化マッチのためドメインをクオートする。
// -is:retweet は他の条件と組み合わせる必要がある（本クエリでは満たしている）。

export function urlClause(domains: string[]): string {
  return `(${domains.map((d) => `url:"${d}"`).join(" OR ")})`;
}

export function buildQuery(handles: string[], domains: string[]): string {
  const from = handles.map((h) => `from:${h}`).join(" OR ");
  return `(${from}) ${urlClause(domains)} -is:retweet`;
}

/**
 * クエリ長が maxLength 以下になるようにハンドルを貪欲にグループ化する。
 * 1ハンドルでも上限を超える場合は例外。
 */
export function groupHandles(handles: string[], domains: string[], maxLength: number): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  for (const raw of handles) {
    const h = raw.replace(/^@/, "");
    if (!h) continue;
    const trial = [...current, h];
    if (buildQuery(trial, domains).length <= maxLength) {
      current = trial;
      continue;
    }
    if (current.length === 0) {
      throw new Error(`handle too long for query limit: ${h}`);
    }
    groups.push(current);
    current = [h];
    if (buildQuery(current, domains).length > maxLength) {
      throw new Error(`handle too long for query limit: ${h}`);
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

/** X のポストIDは数値文字列。大きい方を返す（since_id 管理用）。 */
export function maxPostId(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return BigInt(a) >= BigInt(b) ? a : b;
}
