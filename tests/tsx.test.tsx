import test from "node:test";
import assert from "node:assert/strict";
import { p, ruby } from "@minitype/minitype";
import { Br, Table, Row, Cell, B, Document, Group, P, Ruby, minitypeJSX } from "@minitype/tsx";
import { autoRuby, createRubinate } from "minitype-plugin-rubinate";
import { AutoRuby, createAutoRuby } from "minitype-plugin-rubinate/tsx";

const text = "東京スカイツリーの最寄り駅はとうきょうスカイツリー駅です。";

test("TSX paragraph equals the standard minitype paragraph", async () => {
  const paragraph = <P><AutoRuby>{text}</AutoRuby></P>;
  assert.ok(paragraph && typeof paragraph === "object" && "lines" in paragraph);
  assert.deepEqual(paragraph.lines, p([await autoRuby(text)]).lines);
});

test("TSX composes options, styled text and manual ruby", async () => {
  const sample = "お茶を淹れる。";
  const paragraph = <P><B><AutoRuby dictionary="unidic" kana="hiragana">{sample}</AutoRuby></B><Ruby ruby="ちゃ">茶</Ruby></P>;
  const r = createRubinate({ dictionary: "unidic" });
  const expected = P({ children: [B({ children: await r.autoRuby(sample, { kana: "hiragana" }) }), ruby("茶", "ちゃ")] });
  assert.deepEqual(paragraph, expected);
});

test("TSX document reaches minitype layout directly with ruby preserved", async () => {
  const document = <Document><Group><P><AutoRuby dictionary="unidic">お茶を淹れる。</AutoRuby></P></Group></Document>;
  const result = minitypeJSX(document);
  assert.equal(await result.getPageCount(), 1);
  assert.ok((await result.getLayout()).length > 0);
});

// The upstream JSX runtime is synchronous: the normal async API still must be awaited.
function typeCheck() {
  // @ts-expect-error A pending Promise is not a valid JSX inline child.
  const invalid = <P>{autoRuby(text)}</P>;
  return invalid;
}
void typeCheck;

test("AutoRuby expands synchronously without a resolver", async () => {
  const inlines = AutoRuby({ children: text });
  assert.deepEqual(inlines, await autoRuby(text));
  assert.ok(inlines.length > 1);
  assert.ok(inlines.some(value => typeof value === "object" && value !== null && "ruby" in value));
});

test("createAutoRuby supplies document-wide defaults and props override them", async () => {
  const sample = "お茶を淹れる。";
  const UnidicRuby = createAutoRuby({ dictionary: "unidic", kana: "katakana" });
  const paragraph = <P><B><UnidicRuby kana="hiragana">{sample}</UnidicRuby></B><Ruby ruby="ちゃ">茶</Ruby><UnidicRuby>{sample}</UnidicRuby></P>;
  const r = createRubinate({ dictionary: "unidic", kana: "katakana" });
  assert.deepEqual(paragraph, P({ children: [
    B({ children: await r.autoRuby(sample, { kana: "hiragana" }) }),
    ruby("茶", "ちゃ"), await r.autoRuby(sample),
  ] }));
});

test("AutoRuby composes inside tables without a document traversal pass", async () => {
  const document = <Document><Group><Table><Row><Cell><P><AutoRuby dictionary="unidic">お茶を淹れる。</AutoRuby><Br />お茶を淹れる。</P></Cell></Row></Table></Group></Document>;
  const expected = <Document><Group><Table><Row><Cell><P>{await autoRuby("お茶を淹れる。", { dictionary: "unidic" })}<Br />お茶を淹れる。</P></Cell></Row></Table></Group></Document>;
  assert.deepEqual(document, expected);
  assert.equal(await minitypeJSX(document).getPageCount(), 1);
});

test("AutoRuby joins text and conditional children, and rejects nested elements", async () => {
  const paragraph = <P><AutoRuby>{["お茶", false, null, undefined, "を淹れる。"]}</AutoRuby></P>;
  assert.deepEqual(paragraph, P({ children: await autoRuby("お茶を淹れる。") }));
  assert.throws(() => AutoRuby({ children: Ruby({ children: "茶", ruby: "ちゃ" }) as never }), /only text children/);
  assert.throws(() => AutoRuby({ children: "茶", userDictionaryPath: "/nonexistent/rubinate.csv" }), /ENOENT/);
});

test("createAutoRuby accepts synchronous custom tokenizer defaults", () => {
  let calls = 0;
  const CustomRuby = createAutoRuby({
    tokenizer: input => {
      calls++;
      return [{ surface: input, reading: "おちゃ" }];
    },
    readings: { "。": null },
  });
  const inlines = <CustomRuby>お茶。</CustomRuby>;
  assert.deepEqual(inlines, ["お", ruby("茶", "ちゃ"), "。"]);
  assert.equal(calls, 1);
});
