import { mkdir } from "node:fs/promises";
import { minitype, p, h1, h2, em, pt, vspace } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

const r = createRubinate();
const body = [
  h1("Rubinate 自動ルビ"),
  p("Lindera / IPADIC + JmdictFurigana / JmnedictFurigana", { size: pt(9) }),
  vspace(8),
  h2("文脈から読みを取得"),
  p([await r.autoRuby("東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。")]),
  vspace(7),
  h2("送り仮名を分離"),
  p([await r.autoRuby("お茶を淹れる。", { dictionary: "unidic" })]),
  vspace(7),
  h2("対応辞書と固有名詞"),
  p([await r.autoRuby("東京タワーの最寄駅は赤羽橋駅です。")]),
  vspace(7),
  h2("カタカナのルビ"),
  p([await r.autoRuby("東京タワーの最寄駅は赤羽橋駅です。", { kana: "katakana" })]),
  vspace(7),
  h2("語全体へのルビ"),
  p([await r.autoRuby("東京タワーの最寄駅は赤羽橋駅です。", { granularity: "word" })]),
  vspace(7),
  h2("ユーザー辞書と読みの上書き"),
  p([await r.autoRuby("東京タワーの最寄駅は赤羽橋駅です。", {
    userDictionary: "赤羽橋駅,カスタム名詞,アカバネバシエキ",
    readings: { "赤羽橋駅": "あかばねばしえき" },
  })]),
];
await mkdir("output/pdf", { recursive: true });
await minitype([{ body }], {
  block: {
    paragraph: { size: pt(12), lineHeight: em(2), rubySize: em(0.5), rubyOffset: em(0.1) },
    h1: { size: pt(22) },
    h2: { size: pt(12), lineHeight: em(2) },
  },
}).save("output/pdf/rubinate-example.pdf");
