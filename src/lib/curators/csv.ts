// 目利き一括登録用CSV（ハンドル, 表示名, ウェイト）のパーサー。純粋関数。
export type CuratorCsvRow = { handle: string; display_name: string; base_weight: number };
export type CsvParseResult = { rows: CuratorCsvRow[]; errors: { line: number; message: string }[] };

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

export function parseCuratorCsv(text: string, defaultWeight = 1.0): CsvParseResult {
  const rows: CuratorCsvRow[] = [];
  const errors: CsvParseResult["errors"] = [];
  const seen = new Set<string>();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const [h = "", name = "", w = ""] = splitCsvLine(raw);
    const handle = h.replace(/^@/, "");
    if (idx === 0 && /^(handle|ハンドル)$/i.test(handle)) return; // ヘッダ行
    if (!HANDLE.test(handle)) {
      errors.push({ line, message: `invalid handle: ${h}` });
      return;
    }
    const weight = w === "" ? defaultWeight : Number(w);
    if (!Number.isFinite(weight) || weight < 0) {
      errors.push({ line, message: `invalid weight: ${w}` });
      return;
    }
    const key = handle.toLowerCase();
    if (seen.has(key)) {
      errors.push({ line, message: `duplicate handle: ${handle}` });
      return;
    }
    seen.add(key);
    rows.push({ handle, display_name: name || handle, base_weight: weight });
  });
  return { rows, errors };
}
