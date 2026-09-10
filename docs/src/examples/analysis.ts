import { p, table } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function analysis() {
  const r = createRubinate({ dictionary: "unidic" });
  const tokens = await r.analyze("お茶を淹れる。");
  const rows = [
    ["Surface", "Reading", "Part of speech", "Range"],
    ...tokens.map(t => [
      t.surface, t.reading || "—",
      t.partOfSpeech?.filter(s => s !== "*").join(" / ") || "—",
      `[${t.start}, ${t.end})`,
    ]),
  ];
  const result = table(rows.map(row => row.map(cell => ({
    type: "tableCell",
    block: p(cell, { size: 3.2, lineHeight: 5, align: "left", indent: 0, firstIndent: 0 })
  }))), {
    columnWidths: [24, 30, 65, 30],
    cellPadding: { type: "physical", top: 2, bottom: 2, left: 2, right: 2 },
  });
  return result;
}
