import { p } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function firstRuby() {
  const r = createRubinate();
  const result = p([
    await r.autoRuby("東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。"),
  ]);
  return result;
}
