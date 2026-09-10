import { vspace } from "@minitype/minitype";
import { codeListing, referenceCode, text, note, label } from "./layout.js";
import type { ManualPage } from "./types.js";

export function referencePages(): ManualPage[] {
  return [
    {
      section: "Public API", title: "Functions and options",
      body: [
        text("Import runtime functions and public types from minitype-plugin-rubinate. All three asynchronous functions are also methods on the object returned by createRubinate()."),
        referenceCode(`createRubinate(config?: RubinateConfig): Rubinate
autoRuby(text: string, options?: RubyOptions)
  : Promise<(string | Ruby)[]>
analyze(text: string, options?: RubyOptions)
  : Promise<AnalyzedToken[]>
segments(text: string, options?: RubyOptions)
  : Promise<Segment[]>
alignReading(surface: string, reading: string): Segment[]

type Dictionary = "ipadic" | "unidic";
interface RubyOptions {
  dictionary?: Dictionary;        // ipadic
  kana?: "hiragana" | "katakana"; // hiragana
  granularity?: "kanji" | "word"; // kanji
  correspondence?: boolean;       // true
  readings?: Readonly<Record<string, string | null>>;
  userDictionary?: string;
  userDictionaryPath?: string | URL;
}
interface TokenizerOptions {
  dictionary: Dictionary;
  userDictionary?: string;
  correspondence: boolean;
}
interface RubinateConfig extends RubyOptions {
  tokenizer?: (text: string, options: TokenizerOptions)
    => readonly Morpheme[] | Promise<readonly Morpheme[]>;
}`),
        note("createRubinate() returns immediately; analysis validates options and rejects on failure. alignReading() is synchronous and performs no dictionary lookup. Kana anchors must have one complete alignment; ambiguous correspondence falls back to a whole-token group."),
      ],
    },
    {
      section: "Public API", title: "TSX components",
      body: [
        text("Import AutoRuby or createAutoRuby from minitype-plugin-rubinate/tsx. AutoRuby analyzes text synchronously during JSX evaluation and directly returns minitype ruby inlines, so minitypeJSX can typeset the document without a resolver pass."),
        referenceCode(`AutoRuby(props: AutoRubyProps): (string | Ruby)[]
createAutoRuby(config?: SyncRubinateConfig): AutoRubyComponent

type AutoRubyText = string | number | boolean
  | null | undefined | readonly AutoRubyText[];
interface AutoRubyProps extends RubyOptions {
  children?: AutoRubyText;
}
interface SyncRubinateConfig extends RubyOptions {
  tokenizer?: (text: string, options: TokenizerOptions)
    => readonly Morpheme[];
}`),
        vspace(3),
        text("createAutoRuby supplies component-wide defaults; each element's RubyOptions override them. Text children are concatenated, numbers become text, and boolean or nullish children are ignored. Nested JSX elements are rejected; place formatting around AutoRuby and manual ruby beside it."),
        vspace(3),
        note("Call minitypeJSX(document) directly. TSX evaluation is synchronous, so custom tokenizers supplied to createAutoRuby must also be synchronous. The normal createRubinate API remains asynchronous and accepts synchronous or asynchronous custom tokenizers. Missing files and invalid options throw while the JSX tree is constructed."),
      ],
    },
    {
      section: "Public API", title: "Tokens and correspondence",
      body: [
        referenceCode(`interface Segment {
  text: string;
  reading?: string;
}
interface Morpheme {
  dictionary?: Dictionary;
  surface: string;
  reading: string;
  partOfSpeech?: readonly string[];
  dictionaryForm?: string;
  details?: readonly string[];
  segments?: Segment[];
  furiganaSource?: "jmdict" | "jmnedict" | "none";
  furiganaMatch?: "exact" | "inferred" | "none";
  rubyKind?: "mono" | "jukugo" | "group";
}
interface AnalyzedToken extends Morpheme {
  start: number; // UTF-16, inclusive
  end: number;   // UTF-16, exclusive
  source: "lindera" | "custom" | "override" | "gap";
  segments: Segment[];
}`),
        label("Dictionary details"),
        text("Known tokens retain the nine IPADIC fields: POS, three POS subdivisions, conjugation type, conjugation form, base form, reading and pronunciation. Reading is index 7; pronunciation is index 8. UniDic retains 17 fields; its lemma reading is index 6, surface pronunciation 9 and orthographic base 10. dictionary identifies the schema; unknown tokens may have fewer fields."),
        vspace(3),
        note("Correspondence first checks the proper-name dictionary for proper nouns. A found correspondence can adjust the selected reading. Use correspondence: false for raw tokenizer readings; use readings for an unconditional override."),
        vspace(3),
        text("For custom tokens, segments must reconstruct surface exactly. Without segments, Rubinate applies its independent alignment. Whitespace omitted by a custom analyzer is restored; omitted non-whitespace text rejects."),
      ],
    },
    {
      section: "Public API", title: "Layout and compatibility",
      body: [
        label("Complete document wrapper"),
        referenceCode(`import { minitype, p, em } from "@minitype/minitype";
import { autoRuby } from "minitype-plugin-rubinate";

await minitype([{ body: [
  p([await autoRuby("お茶を淹れる。")]),
] }], {
  block: { paragraph: {
    lineHeight: em(2),
    rubySize: em(0.5), rubyOffset: em(0.1),
  } },
}).save("output.pdf");`),
        label("Analysis and reading alignment"),
        text("The embedded Lindera/IPADIC and UniDic analyzers, Rust okurigana alignment and JmdictFurigana/JmnedictFurigana lookup use Rubinate’s buffer ABI. Both analyzers run in normal mode. UniDic reconstructs orthographic readings from lemma and inflected pronunciation."),
        vspace(3),
        label("What minitype controls"),
        text("Each annotated segment becomes an ordinary minitype ruby inline. rubyKind is informational classification from the correspondence dictionary, or a fallback inferred from the segment structure. It does not affect rendering. minitype controls placement and line breaking; Typst-specific jukugo behavior, intrusion/protrusion calculations and two-sided ruby are not reproduced."),
        vspace(3),
        note("Pass text to autoRuby(), or use AutoRuby directly in TSX. AutoRuby expands only its own text children; surrounding text and manual ruby remain as authored. Keep paragraph boundaries in the host document. Readings for ambiguous names still require editorial review."),
      ],
    },
    {
      section: "Public API", title: "Build, runtime and provenance",
      body: [
        label("Build this repository"),
        codeListing(`npm ci
npm test
npm run example
npm run documentation
npm pack`, "Shell commands", false, "bash"), vspace(3),
        text("After npm run build, install the local directory in your document project with npm install /path/to/minitype-plugin-rubinate and install @minitype/minitype. The package has not been published to npm."),
        vspace(3),
        label("Runtime and shipped assets"),
        text("Node.js 20.16+ (20.x) or 22.3+; minitype 0.1.6+. The Node loader reads local assets, with no analysis-time network request or native addon. IPADIC is about 11 MiB, UniDic 44 MiB and correspondence 5.4 MiB. All are packaged; only selected modules load lazily and are shared per process. The async API still runs synchronous WASM work; use a worker when event-loop latency matters."),
        vspace(3),
        label("Exact source and rebuilds"),
        text("assets/manifest.json records SHA-256 hashes of the shipped binaries and sources. Rust sources, Cargo locks and compressed dictionary data are maintained under wasm-plugins. Lindera 1.4.1 uses the pinned rice8y fork. The correspondence snapshot is 2.3.1+2026-05-25."),
        codeListing(`rustup target add wasm32-unknown-unknown
node scripts/rebuild-wasm.mjs
npm test`, "Rebuild the WASM assets", false, "bash"), vspace(3),
        text("Rebuilding requires Cargo and initial network access for dependencies and dictionary archives. It is optional: shipped WASM runs as installed. Binary identity across Rust toolchains is not promised."),
        vspace(3),
        note("License terms and component notices are summarized in the following License section."),
      ],
    },
    {
      section: "License",
      body: [
        text("Rubinate is distributed under the MIT License. The package embeds precompiled WASM components: morphological analysis uses Lindera under the MIT License, with IPADIC under its original dictionary terms and UniDic 2.1.2 under its BSD-3-Clause option. Rendering is handled by the peer dependency @minitype/minitype, licensed under PolyForm Noncommercial 1.0.0. The TSX examples use @minitype/tsx under the MIT License. See LICENSE and THIRD_PARTY_NOTICES.md for the component-to-license mapping and the locations of the full license texts."),
        vspace(3),
        text("The bundled JmdictFurigana and JmnedictFurigana correspondence data are derived from EDRDG's JMdict/EDICT and JMnedict/ENAMDICT data and are distributed under CC BY-SA 4.0. See THIRD_PARTY_NOTICES.md and wasm-plugins/NOTICE.md for attribution; assets/manifest.json records the shipped source and binary hashes."),
      ],
    },
  ];
}
