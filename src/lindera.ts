import { callWasm } from "./wasm.js";
import type { Morpheme, TokenizerOptions } from "./index.js";

interface RawToken {
  surface: string;
  reading: string;
  details: string[];
  ruby_segments: { text: string; ruby: string }[];
}
interface Match {
  found: boolean;
  dictionary: "jmdict" | "jmnedict" | "none";
  match_kind: "exact" | "inferred" | "none";
  kind: "mono" | "jukugo" | "group";
  reading: string;
  segments: { text: string; ruby: string }[];
}

export async function tokenizeLindera(text: string, options: TokenizerOptions): Promise<Morpheme[]> {
  const raw = await callWasm(options.dictionary, "analyze", {
    text, kana: "hiragana", user_dict_csv: options.userDictionary ?? null,
  }) as RawToken[];
  if (!Array.isArray(raw)) throw new Error("Invalid Lindera response");
  const matches = options.correspondence && raw.length ? await callWasm("jmdict_furigana", "lookup", {
    kana: "hiragana",
    entries: raw.map(t => ({ text: t.surface, reading: t.reading, proper_name: t.details[1] === "固有名詞" })),
  }) as Match[] : undefined;
  if (matches && (!Array.isArray(matches) || matches.length !== raw.length)) throw new Error("Invalid correspondence response");
  return raw.map((t, i) => {
    const match = matches?.[i];
    const found = match?.found ? match : undefined;
    const segments = (found?.segments ?? t.ruby_segments).map(s => s.ruby ? { text: s.text, reading: s.ruby } : { text: s.text });
    return {
      dictionary: options.dictionary,
      surface: t.surface, reading: found?.reading ?? (t.reading === "*" ? "" : t.reading),
      // Keep UniDic's orthographic base separate from its lemma/reading fields.
      // Its reading is already reconstructed by auto-jrubby's Rust implementation.
      partOfSpeech: t.details.slice(0, 4), dictionaryForm: t.details[options.dictionary === "unidic" ? 10 : 6], details: t.details,
      segments, furiganaSource: found?.dictionary ?? "none", furiganaMatch: found?.match_kind ?? "none",
      rubyKind: found?.kind ?? (segments.filter(s => s.reading).length > 1 ? "mono" : "group"),
    };
  });
}
