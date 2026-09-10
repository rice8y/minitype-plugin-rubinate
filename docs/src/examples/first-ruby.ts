import { p } from "@minitype/minitype";
import { autoRuby } from "minitype-plugin-rubinate";

export async function firstRuby() {
  const result = p([
    await autoRuby("東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。"),
  ]);
  return result;
}
