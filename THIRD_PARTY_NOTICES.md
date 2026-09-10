# Third-party components

## auto-jrubby

Rubinate ports the automatic Japanese ruby functionality of <https://github.com/rice8y/auto-jrubby> to a minitype plugin. It shares the IPADIC and UniDic analyzers, JmdictFurigana lookup, Rust sources and compressed correspondence data. The Rust sources are maintained as part of this project under `wasm-plugins/`. Exact file hashes are recorded in `assets/manifest.json`. The TypeScript host adapter and minitype integration are Rubinate additions.

The Rubinate implementation is distributed under the MIT License. Copyright 2026 Eito Yoneyama. The full MIT text is in `LICENSE`; dictionary and component notices are collected in `wasm-plugins/NOTICE.md`. Rust source, Cargo locks and correspondence assets are included under `wasm-plugins`; build instructions are in the README and `scripts/rebuild-wasm.mjs`. No Typst layout code is included.

## Lindera and IPADIC

The analyzer uses Lindera 1.4.1 from the fork <https://github.com/rice8y/lindera_fork>, revision `33f5874c934877382bfebd9a6acc62e36f58d208`, as pinned by the copied Cargo.lock. Lindera's MIT license is preserved in `wasm-plugins/NOTICE.md` (Lindera section). The embedded IPADIC dictionary's notice is preserved verbatim in `wasm-plugins/NOTICE.md` (IPADIC section) (from the MeCab IPADIC distribution).

The WASM interface uses Rubinate’s own buffer ABI, implemented in `wasm-plugins/common/abi.rs`. The Cargo manifests and locks enumerate Rust dependencies, including Serde, serde_json and ruzstd, and their exact versions.

## UniDic

UniDic 2.1.2 is distributed under its BSD-3-Clause option. The original BSD license text, license options and author attribution are collected in `wasm-plugins/NOTICE.md`. The source archive and checksum are recorded in `assets/manifest.json`.

## Furigana data

JmdictFurigana and JmnedictFurigana are derived from JMdict/EDICT and JMnedict/ENAMDICT, maintained by EDRDG. The data is CC BY-SA 4.0. The snapshot is `2.3.1+2026-05-25`; auto-jrubby transformed it into indexed, independently compressed Zstandard blocks. The complete data notice is preserved in `wasm-plugins/NOTICE.md` (Furigana data section). See <https://github.com/Doublevil/JmdictFurigana> and <https://www.edrdg.org/edrdg/licence.html>.

## minitype

`@minitype/minitype@0.1.6` is a peer dependency licensed under PolyForm Noncommercial 1.0.0. Its license applies independently of this package. See the installed LICENSE and THIRD_PARTY_LICENSES.txt.

The dependency audit on 2026-09-10 reported four findings (three high, one moderate), including transitive findings in `image-size`, `@xmldom/xmldom` and `speech-rule-engine`, and their effect on minitype. `npm audit fix --ignore-scripts` made no updates within the current dependency constraints. These remain unresolved; re-run `npm audit` before release. This audit status is separate from license attribution.

## TSX examples

The optional TSX examples and integration tests use `@minitype/tsx` 0.1.1, copyright 2026 Yuto Wada, under the MIT License. It is a development dependency of this checkout; users install it separately for JSX documents. See the installed package’s LICENSE and <https://github.com/minitype-project/tsx>.
