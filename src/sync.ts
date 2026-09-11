import { ruby as minitypeRuby } from "@minitype/minitype";
import type { Ruby } from "@minitype/minitype";

import { alignReading } from "./index.js";
import type { AnalyzedToken, Dictionary, Morpheme, RubyOptions, Segment, TokenizerOptions } from "./index.js";
import { tokenizeLinderaSync } from "./lindera-sync.js";
import { loadUserDictionarySync } from "./user-dictionary.js";

export interface SyncRubinateConfig extends RubyOptions {
  /** TSX components are synchronous, so custom tokenizers must also be synchronous. */
  tokenizer?: (text: string, options: TokenizerOptions) => readonly Morpheme[];
}

const han = /[\p{Script=Han}々〆ヵヶ]/u;
const readingPattern = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\u3099\u309a]+$/u;
const hira = (s: string) => s.replace(/[\uFF66-\uFF9F]+/g, kana => kana.normalize("NFKC")).normalize("NFC").replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const kata = (s: string) => hira(s).replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));

/** Synchronous Rubinate instance intended for @minitype/tsx components. */
export function createRubinateSync(config: SyncRubinateConfig = {}) {
  const tokenizer = config.tokenizer ?? tokenizeLinderaSync;
  const defaults = { ...config, readings: { ...config.readings } };

  function analyze(text: string, options: RubyOptions = {}): AnalyzedToken[] {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    const settings = { dictionary: "ipadic" as Dictionary, correspondence: true, kana: "hiragana", granularity: "kanji", ...defaults, ...options };
    // Explicit undefined is equivalent to omitting an optional setting.
    for (const key of ["dictionary", "correspondence", "kana", "granularity"] as const) {
      if (settings[key] === undefined) {
        Object.assign(settings, { [key]: defaults[key] === undefined
          ? { dictionary: "ipadic", correspondence: true, kana: "hiragana", granularity: "kanji" }[key]
          : defaults[key] });
      }
    }
    if (settings.dictionary !== "ipadic" && settings.dictionary !== "unidic") throw new TypeError("dictionary must be ipadic or unidic");
    if ("splitMode" in settings) throw new TypeError("splitMode was removed: the bundled Lindera uses normal mode");
    if (typeof settings.correspondence !== "boolean") throw new TypeError("correspondence must be a boolean");
    const dictionarySource = options.userDictionary !== undefined || options.userDictionaryPath !== undefined ? options : defaults;
    const userDictionary = loadUserDictionarySync(dictionarySource.userDictionary, dictionarySource.userDictionaryPath);
    if (!["hiragana", "katakana"].includes(settings.kana)) throw new TypeError("kana must be hiragana or katakana");
    if (!["kanji", "word"].includes(settings.granularity)) throw new TypeError("granularity must be kanji or word");
    const readings = { ...defaults.readings, ...options.readings };
    const keys = Object.keys(readings).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (!key || (readings[key] !== null && (typeof readings[key] !== "string" || !readingPattern.test(hira(readings[key]!))))) {
        throw new TypeError("readings must map nonempty surfaces to kana readings or null");
      }
    }
    const convert = settings.kana === "katakana" ? kata : hira;
    const result: AnalyzedToken[] = [];

    function append(token: Morpheme, start: number, source: AnalyzedToken["source"]) {
      const reading = convert(token.reading);
      const tokenSegments = settings.granularity === "word" && han.test(token.surface) && readingPattern.test(reading)
        ? [{ text: token.surface, reading }] : token.segments ?? alignReading(token.surface, reading);
      if (tokenSegments.some(s => !s || typeof s.text !== "string" || (s.reading !== undefined && typeof s.reading !== "string"))
        || tokenSegments.map(s => s.text).join("") !== token.surface) throw new Error("Ruby segments do not preserve the token surface");
      result.push({ ...token, reading, start, end: start + token.surface.length, source,
        segments: tokenSegments.map(s => s.reading ? { text: s.text, reading: convert(s.reading) } : s) });
    }

    function analyzeChunk(chunk: string, offset: number) {
      if (!chunk) return;
      if (!chunk.trim()) { append({ surface: chunk, reading: "" }, offset, "gap"); return; }
      const tokens = tokenizer(chunk, { dictionary: settings.dictionary, userDictionary, correspondence: settings.correspondence });
      let cursor = 0;
      for (const token of tokens) {
        if (!token || typeof token.surface !== "string" || !token.surface || typeof token.reading !== "string") {
          throw new Error("Tokenizer returned an invalid morpheme");
        }
        const at = chunk.indexOf(token.surface, cursor);
        if (at < 0 || chunk.slice(cursor, at).trim()) throw new Error("Tokenizer surfaces do not preserve the input text");
        if (at > cursor) append({ surface: chunk.slice(cursor, at), reading: "" }, offset + cursor, "gap");
        append(token, offset + at, config.tokenizer ? "custom" : "lindera");
        cursor = at + token.surface.length;
      }
      if (chunk.slice(cursor).trim()) throw new Error("Tokenizer omitted non-whitespace input");
      if (cursor < chunk.length) append({ surface: chunk.slice(cursor), reading: "" }, offset + cursor, "gap");
    }

    let cursor = 0;
    let chunkStart = 0;
    while (cursor < text.length) {
      const key = keys.find(key => text.startsWith(key, cursor));
      if (!key) { cursor += text.codePointAt(cursor)! > 0xffff ? 2 : 1; continue; }
      analyzeChunk(text.slice(chunkStart, cursor), chunkStart);
      append({ surface: key, reading: readings[key] ?? "" }, cursor, "override");
      cursor += key.length;
      chunkStart = cursor;
    }
    analyzeChunk(text.slice(chunkStart), chunkStart);
    return result;
  }

  function segments(text: string, options?: RubyOptions): Segment[] {
    return analyze(text, options).flatMap(token => token.segments);
  }

  function autoRuby(text: string, options?: RubyOptions): (string | Ruby)[] {
    return segments(text, options).map(s => s.reading ? minitypeRuby(s.text, s.reading) : s.text);
  }

  return { analyze, segments, autoRuby };
}

export type SyncRubinate = ReturnType<typeof createRubinateSync>;
