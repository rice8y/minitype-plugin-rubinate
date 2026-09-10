import { p } from "@minitype/minitype";
import { autoRuby } from "minitype-plugin-rubinate";

export async function errors() {
  let message = "";
  try {
    await autoRuby("お茶を淹れる。", { userDictionary: "only-one-column" });
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  const result = [
    p(message, { align: "left" }),
    p([["Next valid call: ", ...await autoRuby("お茶を淹れる。")]]),
  ];
  return result;
}
