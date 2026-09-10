import { p, em, pt } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function styling() {
  const r = createRubinate({ dictionary: "unidic" });
  const sample = "お茶を淹れる。";
  const result = p([
    [...await r.autoRuby(sample, { kana: "hiragana" })],
    [...await r.autoRuby(sample, { kana: "katakana" })],
  ], {
    size: pt(12), lineHeight: em(2),
    rubySize: em(0.5), rubyOffset: em(0.1),
    rubyAlign: "jis",
  });
  return result;
}
