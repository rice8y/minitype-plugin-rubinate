import { ruby as minitypeRuby } from "@minitype/minitype";
import type { Ruby } from "@minitype/minitype";

import { tokenizeLindera } from "./lindera.js";
import { loadUserDictionary } from "./user-dictionary.js";

export type Dictionary = "ipadic" | "unidic";
export interface TokenizerOptions {
  dictionary: Dictionary;
  userDictionary?: string;
  correspondence: boolean;
}
export interface Morpheme {
  /** Identifies the schema of details for the bundled analyzer. */
  dictionary?: Dictionary;
  surface: string;
  reading: string;
  partOfSpeech?: readonly string[];
  dictionaryForm?: string;
  details?: readonly string[];
  segments?: Segment[];
  furiganaSource?: "jmdict" | "jmnedict" | "none";
  furiganaMatch?: "exact" | "inferred" | "none";
  /** Informational classification only; autoRuby() renders segments without consulting it. */
  rubyKind?: "mono" | "jukugo" | "group";
}
export interface Segment { text: string; reading?: string }
export interface AnalyzedToken extends Morpheme {
  /** UTF-16 offsets into the original input; end is exclusive. */
  start: number;
  end: number;
  source: "lindera" | "custom" | "override" | "gap";
  segments: Segment[];
}
export interface RubyOptions {
  /** Select the bundled analyzer; defaults to ipadic. */
  dictionary?: Dictionary;
  /** auto-jrubby three-column CSV: surface,part-of-speech,reading. */
  userDictionary?: string;
  /** UTF-8 CSV file, read on each call. Relative paths resolve from process.cwd(). */
  userDictionaryPath?: string | URL;
  /** Enable JmdictFurigana/JmnedictFurigana correspondence (default true). */
  correspondence?: boolean;
  kana?: "hiragana" | "katakana";
  /** kanji separates uniquely aligned okurigana; word annotates the entire token. */
  granularity?: "kanji" | "word";
  /** Longest match wins. null leaves a surface unannotated. */
  readings?: Readonly<Record<string, string | null>>;
}
export interface RubinateConfig extends RubyOptions {
  tokenizer?: (text: string, options: TokenizerOptions) => readonly Morpheme[] | Promise<readonly Morpheme[]>;
}

const han = /[\p{Script=Han}々〆ヵヶ]/u;
const readingPattern = /^[\p{Script=Hiragana}\p{Script=Katakana}ー\u3099\u309a]+$/u;
const hira = (s: string) => s.replace(/[\uFF66-\uFF9F]+/g, kana => kana.normalize("NFKC")).normalize("NFC").replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const kata = (s: string) => hira(s).replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));

/** Split only when all kana anchors have exactly one complete alignment. */
export function alignReading(surface: string, reading: string): Segment[] {
  if (!han.test(surface) || !readingPattern.test(hira(reading))) return [{ text: surface }];
  const fallback = [{ text: surface, reading }];
  const runs = surface.match(/[\p{Script=Han}々〆ヵヶ]+|[^\p{Script=Han}々〆ヵヶ]+/gu)!;
  // Bound recursion and matching work for pathological custom tokens.
  if (surface.length > 256 || reading.length > 256) return fallback;
  const target = hira(reading);
  const memo = new Map<string, { count: number; parts: Segment[] }>();
  function solve(i: number, pos: number): { count: number; parts: Segment[] } {
    if (i === runs.length) return { count: pos === target.length ? 1 : 0, parts: [] };
    const key = `${i}:${pos}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const run = runs[i]!;
    let count = 0;
    let parts: Segment[] = [];
    if (!han.test(run)) {
      const anchor = hira(run);
      if (target.startsWith(anchor, pos)) {
        const next = solve(i + 1, pos + anchor.length);
        count = next.count;
        parts = [{ text: run }, ...next.parts];
      }
    } else {
      for (let end = pos + 1; end <= target.length; end++) {
        const next = solve(i + 1, end);
        if (next.count) {
          count = Math.min(2, count + next.count);
          parts = [{ text: run, reading: target.slice(pos, end) }, ...next.parts];
          if (count === 2) break;
        }
      }
    }
    const result = { count, parts };
    memo.set(key, result);
    return result;
  }
  const result = solve(0, 0);
  return result.count === 1 ? result.parts : fallback;
}

export function createRubinate(config: RubinateConfig = {}) {
  const tokenizer = config.tokenizer ?? tokenizeLindera;
  const defaults = { ...config, readings: { ...config.readings } };
  async function analyze(text: string, options: RubyOptions = {}): Promise<AnalyzedToken[]> {
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
    const userDictionary = await loadUserDictionary(dictionarySource.userDictionary, dictionarySource.userDictionaryPath);
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
      const segments = settings.granularity === "word" && han.test(token.surface) && readingPattern.test(reading)
        ? [{ text: token.surface, reading }] : token.segments ?? alignReading(token.surface, reading);
      if (segments.some(s => !s || typeof s.text !== "string" || (s.reading !== undefined && typeof s.reading !== "string"))
        || segments.map(s => s.text).join("") !== token.surface) throw new Error("Ruby segments do not preserve the token surface");
      result.push({ ...token, reading, start, end: start + token.surface.length, source,
        segments: segments.map(s => s.reading ? { text: s.text, reading: convert(s.reading) } : s) });
    }
    async function analyzeChunk(chunk: string, offset: number) {
      if (!chunk) return;
      // Keep whitespace verbatim without loading the dictionary for empty input.
      if (!chunk.trim()) { append({ surface: chunk, reading: "" }, offset, "gap"); return; }
      const tokens = await tokenizer(chunk, { dictionary: settings.dictionary, userDictionary, correspondence: settings.correspondence });
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
      await analyzeChunk(text.slice(chunkStart, cursor), chunkStart);
      append({ surface: key, reading: readings[key] ?? "" }, cursor, "override");
      cursor += key.length;
      chunkStart = cursor;
    }
    await analyzeChunk(text.slice(chunkStart), chunkStart);
    return result;
  }
  async function segments(text: string, options?: RubyOptions): Promise<Segment[]> {
    return (await analyze(text, options)).flatMap(token => token.segments);
  }
  async function autoRuby(text: string, options?: RubyOptions): Promise<(string | Ruby)[]> {
    return (await segments(text, options)).map(s => s.reading ? minitypeRuby(s.text, s.reading) : s.text);
  }
  return { analyze, segments, autoRuby };
}

export type Rubinate = ReturnType<typeof createRubinate>;
const shared = createRubinate();
export const analyze = shared.analyze;
export const segments = shared.segments;
export const autoRuby = shared.autoRuby;
