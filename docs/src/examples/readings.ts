import { p } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function readings() {
  const r = createRubinate();
  const sample = "東京タワーの最寄駅は赤羽橋駅です。";
  const result = p([
    [...await r.autoRuby(sample)],
    [...await r.autoRuby(sample, {
      readings: { "赤羽橋駅": "あかばねばしえき", "東京タワー": null },
    })],
  ]);
  return result;
}
