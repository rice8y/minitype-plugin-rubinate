import test from "node:test";
import assert from "node:assert/strict";
import { alignReading, createRubinate, autoRuby, analyze } from "../dist/index.js";

test("okurigana and internal kana align globally", () => {
  assert.deepEqual(alignReading("取り戻す", "とりもどす"), [
    { text: "取", reading: "と" }, { text: "り" }, { text: "戻", reading: "もど" }, { text: "す" },
  ]);
  assert.deepEqual(alignReading("食べる", "たべる"), [{ text: "食", reading: "た" }, { text: "べる" }]);
  assert.deepEqual(alignReading("お祝い", "おいわい"), [{ text: "お" }, { text: "祝", reading: "いわ" }, { text: "い" }]);
});
test("ambiguous and irregular readings stay grouped", () => {
  assert.deepEqual(alignReading("甲あ乙", "かああお"), [{ text: "甲あ乙", reading: "かああお" }]);
  assert.deepEqual(alignReading("大人", "おとな"), [{ text: "大人", reading: "おとな" }]);
  assert.deepEqual(alignReading("今日", "きょう"), [{ text: "今日", reading: "きょう" }]);
});
test("unreadable tokens and kana are preserved", () => {
  for (const [text, reading] of [["猫", "猫"], ["猫", ""], ["カタカナ", "カタカナ"], ["ABC", "エービーシー"]]) {
    assert.deepEqual(alignReading(text, reading), [{ text }]);
  }
});
test("whitespace and empty input do not invoke tokenizer", async () => {
  const r = createRubinate({ tokenizer: () => { throw Error("must not load"); } });
  assert.deepEqual(await r.autoRuby(""), []);
  assert.deepEqual(await r.autoRuby(" \t\r\n"), [" \t\r\n"]);
});
test("longest overrides win, null suppresses ruby, settings merge", async () => {
  const r = createRubinate({ readings: { "東京": "とうきょう", "東京都": "とうきょうと", "京都": null }, tokenizer: () => { throw Error("must not load"); } });
  assert.deepEqual(await r.autoRuby("東京都 京都", { kana: "katakana" }), [
    { type: "ruby", base: "東京都", ruby: "トウキョウト" }, " ", "京都",
  ]);
  assert.deepEqual(await r.autoRuby("東京", { readings: { "東京": "とうけい" } }), [{ type: "ruby", base: "東京", ruby: "とうけい" }]);
});
test("word granularity includes okurigana", async () => {
  const r = createRubinate({ readings: { "食べる": "タベル" } });
  assert.deepEqual(await r.autoRuby("食べる", { granularity: "word" }), [{ type: "ruby", base: "食べる", ruby: "たべる" }]);
});
test("custom tokenizer receives options and preserves UTF-16 offsets", async () => {
  const r = createRubinate({ tokenizer: (text, options) => {
    assert.equal(options.correspondence, false);
    return [{ surface: "𠮷野", reading: "ヨシノ" }];
  } });
  const tokens = await r.analyze(" \t𠮷野\n", { correspondence: false });
  assert.deepEqual(tokens.map(t => [t.surface, t.start, t.end]), [[" \t", 0, 2], ["𠮷野", 2, 5], ["\n", 5, 6]]);
});
test("invalid tokenizers cannot silently drop or normalize source text", async () => {
  for (const tokens of [[], [{ surface: "", reading: "" }], [{ surface: "猫", reading: "ネコ" }]]) {
    await assert.rejects(createRubinate({ tokenizer: () => tokens }).autoRuby("犬"));
  }
});
test("invalid options fail explicitly", async () => {
  for (const options of [{ splitMode: "C" }, { correspondence: "yes" }, { userDictionary: 123 }, { kana: "latin" }, { granularity: "mono" }, { readings: { "": "から" } }, { readings: { "猫": "cat" } }]) {
    await assert.rejects(autoRuby("猫", options), TypeError);
  }
});
test("real WASM supplies readings, inflections, punctuation and original text", async () => {
  const text = "東京で食べた。\n  取り戻す！🙂";
  const tokens = await analyze(text);
  assert.equal(tokens.map(t => t.surface).join(""), text);
  for (const t of tokens) assert.equal(text.slice(t.start, t.end), t.surface);
  assert.equal(tokens.find(t => t.surface === "東京").reading, "とうきょう");
  assert.deepEqual(tokens.find(t => t.surface === "食べ").segments, [{ text: "食", reading: "た" }, { text: "べ" }]);
  assert.deepEqual(await autoRuby("行った"), [{ type: "ruby", base: "行", ruby: "い" }, "っ", "た"]);
});
test("IPADIC uses orthographic reading rather than pronunciation", async () => {
  const [token] = await analyze("東京", { correspondence: false });
  assert.equal(token.source, "lindera");
  assert.equal(token.details[7], "トウキョウ");
  assert.equal(token.details[8], "トーキョー");
  assert.equal(token.reading, "とうきょう");
  assert.deepEqual(token.segments, [{ text: "東京", reading: "とうきょう" }]);
});
test("parallel calls and instance defaults stay isolated", async () => {
  const h = createRubinate();
  const k = createRubinate({ kana: "katakana" });
  const [a, b] = await Promise.all([h.autoRuby("猫"), k.autoRuby("犬")]);
  assert.deepEqual(a, [{ type: "ruby", base: "猫", ruby: "ねこ" }]);
  assert.deepEqual(b, [{ type: "ruby", base: "犬", ruby: "イヌ" }]);
});

test("correspondence uses name dictionary and retains irregular groups", async () => {
  const [tokyo] = await analyze("東京");
  assert.equal(tokyo.furiganaSource, "jmnedict");
  assert.equal(tokyo.rubyKind, "jukugo");
  assert.deepEqual(tokyo.segments, [{ text: "東", reading: "とう" }, { text: "京", reading: "きょう" }]);
  const [adult] = await analyze("大人");
  assert.equal(adult.furiganaSource, "jmdict");
  assert.equal(adult.rubyKind, "group");
  assert.deepEqual(await autoRuby("大人"), [{ type: "ruby", base: "大人", ruby: "おとな" }]);
  assert.deepEqual(await autoRuby("日本橋"), [
    { type: "ruby", base: "日本", ruby: "にほん" },
    { type: "ruby", base: "橋", ruby: "ばし" },
  ]);
});
test("correspondence respects katakana and whole-word options", async () => {
  assert.deepEqual(await autoRuby("東京", { kana: "katakana" }), [
    { type: "ruby", base: "東", ruby: "トウ" }, { type: "ruby", base: "京", ruby: "キョウ" },
  ]);
  assert.deepEqual(await autoRuby("東京", { granularity: "word" }), [{ type: "ruby", base: "東京", ruby: "とうきょう" }]);
});
test("actual auto-jrubby user dictionary controls segmentation without leaking", async () => {
  const options = { userDictionary: "赤羽橋駅,カスタム名詞,アカバネバシエキ", correspondence: false };
  const [token] = await analyze("赤羽橋駅", options);
  assert.equal(token.surface, "赤羽橋駅");
  assert.equal(token.reading, "あかばねばしえき");
  assert.equal(token.details[0], "カスタム名詞");
  const normal = await analyze("赤羽橋駅", { correspondence: false });
  assert.notEqual(normal[0].details[0], "カスタム名詞");
});
test("invalid CSV reports an error and the next analysis succeeds", async () => {
  for (const csv of ["only-one-column", "猫,名詞,", "猫,名詞,cat", '"猫,名詞,ネコ', '猫,名詞,"ネコ"extra']) {
    await assert.rejects(analyze("猫", { userDictionary: csv }), /dictionary/i);
  }
  assert.equal((await analyze("猫"))[0].reading, "ねこ");
});
test("quoted user CSV and CRLF work without affecting parallel calls", async () => {
  const [custom, standard] = await Promise.all([
    analyze("赤羽橋駅", { userDictionary: '"赤羽橋駅","カスタム名詞","アカバネバシエキ"\r\n', correspondence: false }),
    analyze("赤羽橋駅", { correspondence: false }),
  ]);
  assert.equal(custom[0].surface, "赤羽橋駅");
  assert.equal(custom[0].details[0], "カスタム名詞");
  assert.notEqual(standard[0].details[0], "カスタム名詞");
});
test("invalid custom segments cannot change original text", async () => {
  const r = createRubinate({ tokenizer: () => [{ surface: "猫", reading: "ねこ", segments: [{ text: "犬", reading: "いぬ" }] }] });
  await assert.rejects(r.autoRuby("猫"), /segments/);
});

 test("rubyKind is informational and cannot change segment rendering", async () => {
  const segments = [{ text: "日本", reading: "にほん" }, { text: "橋", reading: "ばし" }];
  for (const rubyKind of [undefined, "mono", "jukugo", "group"]) {
    const r = createRubinate({ tokenizer: () => [{ surface: "日本橋", reading: "にほんばし", segments, rubyKind }] });
    assert.equal((await r.analyze("日本橋"))[0].rubyKind, rubyKind);
    assert.deepEqual(await r.autoRuby("日本橋"), segments.map(s => ({ type: "ruby", base: s.text, ruby: s.reading })));
    assert.deepEqual(await r.segments("日本橋"), segments);
    assert.deepEqual(await r.autoRuby("日本橋", { granularity: "word" }), [{ type: "ruby", base: "日本橋", ruby: "にほんばし" }]);
  }
});

test("autoRuby can be aliased without changing minitype's manual ruby helper", async () => {
  const plugin = await import("../dist/index.js");
  const { autoRuby: ruby } = plugin;
  const { ruby: manualRuby } = await import("@minitype/minitype");
  assert.equal("ruby" in plugin, false);
  assert.equal("ruby" in createRubinate(), false);
  assert.deepEqual(await ruby("東京"), await createRubinate().autoRuby("東京"));
  assert.deepEqual(manualRuby("東京", "とうきょう"), { type: "ruby", base: "東京", ruby: "とうきょう" });
});
