import { P } from "@minitype/tsx";
import type { Block } from "@minitype/minitype";
import { AutoRuby } from "minitype-plugin-rubinate/tsx";

export function tsxRuby(): Block {
  const sample = "東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。";
  const result = (
    <P>
      <AutoRuby>{sample}</AutoRuby>
    </P>
  ) as Block;
  return result;
}
