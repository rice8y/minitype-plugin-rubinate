import { p } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function defaults() {
  const r = createRubinate({
    kana: "katakana",
    readings: { "赤羽橋駅": "あかばねばしえき", "東京タワー": null },
  });
  const result = [
    p([await r.autoRuby("東京タワーの最寄駅は赤羽橋駅です。")]),
    p([await r.autoRuby("東京タワーの最寄駅は赤羽橋駅です。", {
      kana: "hiragana",
      readings: { "東京タワー": "とうきょうたわー" },
    })]),
  ];
  return result;
}
