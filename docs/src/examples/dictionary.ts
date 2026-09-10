import { p } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";
import { docsDirectory } from "../context.js";

export async function dictionary() {
  const r = createRubinate({
    userDictionaryPath: new URL("assets/dictionary.csv", docsDirectory),
  });
  const sample = "東京タワーの最寄駅は赤羽橋駅です。";
  const result = p([
    [...await r.autoRuby(sample, { userDictionary: "" })],
    [...await r.autoRuby(sample)],
  ]);
  return result;
}
