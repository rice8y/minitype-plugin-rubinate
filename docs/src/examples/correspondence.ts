import { p } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function correspondence() {
  const r = createRubinate();
  const sample = "東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。";
  const result = [
    p([["Correspondence: ", ...await r.autoRuby(sample)]]),
    p([["Tokenizer only: ", ...await r.autoRuby(sample, {
      correspondence: false,
    })]]),
    p([["Whole tokens: ", ...await r.autoRuby(sample, {
      granularity: "word",
    })]]),
  ];
  return result;
}
