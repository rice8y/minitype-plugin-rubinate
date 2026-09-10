import test from "node:test";
import assert from "node:assert/strict";
import { analyze, autoRuby, createRubinate } from "../dist/index.js";

test("UniDic reconstructs orthographic readings through inflection", async () => {
  for (const [text, reading, base, phonetic] of [
    ["申し込んだ", "もうしこん", "申し込む", "モーシコン"],
    ["大きかった", "おおきかっ", "大きい", "オーキカッ"],
    ["行こう", "いこう", "行く", "イコー"],
  ]) {
    const [token] = await analyze(text, { dictionary: "unidic", correspondence: false });
    assert.equal(token.dictionary, "unidic");
    assert.equal(token.reading, reading);
    assert.equal(token.dictionaryForm, base);
    assert.equal(token.details[9], phonetic);
    assert.equal(token.details.length, 17);
  }
});
test("dictionary defaults, per-call overrides and concurrent calls are isolated", async () => {
  const r = createRubinate({ dictionary: "unidic" });
  const [u, i, d] = await Promise.all([
    r.analyze("東京"), r.analyze("東京", { dictionary: "ipadic" }), analyze("東京"),
  ]);
  assert.equal(u[0].dictionary, "unidic");
  assert.equal(i[0].dictionary, "ipadic");
  assert.equal(d[0].dictionary, "ipadic");
  assert.equal(u[0].furiganaSource, "jmnedict");
  assert.deepEqual(u[0].segments, i[0].segments);
});
test("UniDic preserves source offsets, unknown words and whitespace", async () => {
  const text = " \t東京で申し込んだ。\n🙂𠮷 ";
  const tokens = await analyze(text, { dictionary: "unidic" });
  assert.equal(tokens.map(t => t.surface).join(""), text);
  for (const t of tokens) assert.equal(text.slice(t.start, t.end), t.surface);
});
test("UniDic supports CSV, explicit readings, kana and whole-token ruby", async () => {
  const options = { dictionary: "unidic", correspondence: false };
  const [token] = await analyze("赤羽橋駅", {
    ...options, userDictionary: "赤羽橋駅,カスタム名詞,アカバネバシエキ",
  });
  assert.equal(token.surface, "赤羽橋駅");
  assert.equal(token.reading, "あかばねばしえき");
  assert.equal(token.details[0], "カスタム名詞");
  assert.notEqual((await analyze("赤羽橋駅", options))[0].details[0], "カスタム名詞");
  assert.deepEqual(await autoRuby("行こう", { ...options, kana: "katakana", granularity: "word" }),
    [{ type: "ruby", base: "行こう", ruby: "イコウ" }]);
  assert.deepEqual(await autoRuby("日本橋", { dictionary: "unidic", readings: { "日本橋": "にっぽんばし" } }),
    [{ type: "ruby", base: "日本橋", ruby: "にっぽんばし" }]);
});
test("invalid dictionary rejects even for empty input; custom callbacks receive selection", async () => {
  await assert.rejects(analyze("", { dictionary: "other" }), /dictionary/);
  const r = createRubinate({ dictionary: "unidic", tokenizer: (text, options) => {
    assert.equal(options.dictionary, "unidic");
    return [{ surface: text, reading: "ねこ" }];
  } });
  await r.autoRuby("猫");
});
