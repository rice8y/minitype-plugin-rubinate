import { p } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function unidic() {
  const r = createRubinate({ dictionary: "unidic" });
  const sample = "お茶を淹れる。";
  const result = p([
    [...await r.autoRuby(sample, { dictionary: "ipadic" })],
    [...await r.autoRuby(sample)],
  ]);
  return result;
}
