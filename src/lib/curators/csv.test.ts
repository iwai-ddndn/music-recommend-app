import { describe, expect, it } from "vitest";
import { parseCuratorCsv } from "./csv";

describe("parseCuratorCsv", () => {
  it("ヘッダ・@・引用符・既定ウェイトを扱う", () => {
    const r = parseCuratorCsv(
      'handle,display_name,weight\n@lighthouse_rec,"Lighthouse, Records",1.2\nnagi_writes,凪,\n',
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toEqual([
      { handle: "lighthouse_rec", display_name: "Lighthouse, Records", base_weight: 1.2 },
      { handle: "nagi_writes", display_name: "凪", base_weight: 1 },
    ]);
  });
  it("不正な行はエラーとして行番号つきで返す", () => {
    const r = parseCuratorCsv("bad handle!,x,1\nok,y,-1\nok2,z,1\nOK2,dup,1");
    expect(r.rows.map((x) => x.handle)).toEqual(["ok2"]);
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 4]);
  });
});
