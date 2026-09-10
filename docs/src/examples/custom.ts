import { p } from "@minitype/minitype";
import { createRubinate } from "minitype-plugin-rubinate";

export async function custom() {
  const r = createRubinate({
    tokenizer: async (text) => {
      if (text !== "お茶を淹れる。") throw new Error("Unsupported input");
      return [
        { surface: "お茶を淹れる", reading: "オチャヲイレル" },
        { surface: "。", reading: "" },
      ];
    },
  });
  const result = p([await r.autoRuby("お茶を淹れる。")]);
  return result;
}
