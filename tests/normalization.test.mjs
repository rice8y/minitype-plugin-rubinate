import test from "node:test";
import assert from "node:assert/strict";
import { createRubinate, alignReading } from "../dist/index.js";
import { createAutoRuby } from "../dist/tsx.js";

for (const [name, create] of [
  ["async", config => createRubinate(config).autoRuby],
  ["TSX", config => {
    const Component = createAutoRuby(config);
    return (children, options) => Component({ children, ...options });
  }],
]) {
  test(`${name}: halfwidth readings normalize while preserving source text`, async () => {
    const render = create({ readings: { 猫: "ﾈｺ", 学校: "ｶﾞｯｺｳ", 珈琲: "ｺｰﾋｰ" } });
    for (const [surface, hiragana, katakana] of [["猫", "ねこ", "ネコ"], ["学校", "がっこう", "ガッコウ"], ["珈琲", "こーひー", "コーヒー"]]) {
      for (const [kana, reading] of [["hiragana", hiragana], ["katakana", katakana]]) {
        assert.deepEqual(await render(surface, { kana }), [{ type: "ruby", base: surface, ruby: reading }]);
      }
    }
    const custom = create({ tokenizer: surface => [{ surface, reading: "ﾀﾍﾞﾙ" }] });
    assert.deepEqual(await custom("食ﾍﾞﾙ"), [{ type: "ruby", base: "食", ruby: "た" }, "ﾍﾞﾙ"]);
    const segmented = create({ tokenizer: surface => [{ surface, reading: "ｶﾞｯｺｳ", segments: [{ text: surface, reading: "ｶﾞｯｺｳ" }] }] });
    assert.deepEqual(await segmented("学校"), [{ type: "ruby", base: "学校", ruby: "がっこう" }]);
  });

  test(`${name}: undefined options inherit configured and built-in defaults`, async () => {
    const omitted = { dictionary: undefined, correspondence: undefined, kana: undefined, granularity: undefined };
    for (const configured of [omitted, { dictionary: "unidic", correspondence: false, kana: "katakana", granularity: "word" }]) {
      let received;
      const render = create({ ...configured, tokenizer: (surface, options) => {
        received = options;
        return [{ surface, reading: "タベル" }];
      } });
      assert.deepEqual(await render("食べる", omitted), configured.kana === "katakana"
        ? [{ type: "ruby", base: "食べる", ruby: "タベル" }]
        : [{ type: "ruby", base: "食", ruby: "た" }, "べる"]);
      assert.equal(received.dictionary, configured.dictionary ?? "ipadic");
      assert.equal(received.correspondence, configured.correspondence ?? true);
      assert.deepEqual(await render("食べる", { kana: "hiragana", granularity: "kanji", dictionary: "ipadic", correspondence: true }),
        [{ type: "ruby", base: "食", ruby: "た" }, "べる"]);
      assert.equal(received.dictionary, "ipadic");
      assert.equal(received.correspondence, true);
    }
    for (const key of Object.keys(omitted)) {
      await assert.rejects(async () => create({ readings: { 猫: "ねこ" } })("猫", { [key]: null }), TypeError);
    }
  });
}

test("alignment accepts halfwidth voiced readings without changing surface", () => {
  assert.deepEqual(alignReading("食ﾍﾞﾙ", "ﾀﾍﾞﾙ"), [{ text: "食", reading: "た" }, { text: "ﾍﾞﾙ" }]);
});
