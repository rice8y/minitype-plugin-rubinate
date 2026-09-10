use lindera::dictionary::{load_dictionary, Dictionary, DictionaryBuilder, UserDictionaryLoader};
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;
use lindera::tokenizer::Tokenizer;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
#[path = "../../common/abi.rs"]
mod abi;

#[path = "../../common/ruby.rs"]
mod ruby;

use ruby::{build_ruby_segments, contains_kanji, is_kanji, kata_to_hira, RubySegment};

static DICTIONARY: OnceLock<Dictionary> = OnceLock::new();

fn get_dictionary() -> &'static Dictionary {
    DICTIONARY
        .get_or_init(|| load_dictionary("embedded://unidic").expect("Failed to load dictionary"))
}

#[derive(Deserialize)]
struct InputParams {
    text: String,
    #[serde(default)]
    user_dict_csv: Option<String>,
    #[serde(default = "default_kana")]
    kana: String,
}

fn default_kana() -> String {
    "hiragana".to_string()
}

#[derive(Serialize)]
struct TokenInfo {
    surface: String,
    reading: String,
    details: Vec<String>,
    ruby_segments: Vec<RubySegment>,
}

fn is_hiragana(c: char) -> bool {
    ('\u{3040}'..='\u{309F}').contains(&c)
}

fn hira_to_kata(c: char) -> char {
    if ('\u{3041}'..='\u{3096}').contains(&c) {
        std::char::from_u32(c as u32 + 0x60).unwrap_or(c)
    } else {
        c
    }
}

fn katakana_vowel(c: char) -> Option<char> {
    match c {
        'ァ' | 'ア' | 'カ' | 'ガ' | 'サ' | 'ザ' | 'タ' | 'ダ' | 'ナ' | 'ハ' | 'バ' | 'パ'
        | 'マ' | 'ャ' | 'ヤ' | 'ラ' | 'ヮ' | 'ワ' | 'ヷ' => Some('ア'),
        'ィ' | 'イ' | 'キ' | 'ギ' | 'シ' | 'ジ' | 'チ' | 'ヂ' | 'ニ' | 'ヒ' | 'ビ' | 'ピ'
        | 'ミ' | 'リ' | 'ヰ' | 'ヸ' => Some('イ'),
        'ゥ' | 'ウ' | 'ク' | 'グ' | 'ス' | 'ズ' | 'ツ' | 'ヅ' | 'ヌ' | 'フ' | 'ブ' | 'プ'
        | 'ム' | 'ュ' | 'ユ' | 'ル' | 'ヴ' | 'ヹ' => Some('ウ'),
        'ェ' | 'エ' | 'ケ' | 'ゲ' | 'セ' | 'ゼ' | 'テ' | 'デ' | 'ネ' | 'ヘ' | 'ベ' | 'ペ'
        | 'メ' | 'レ' | 'ヱ' | 'ヺ' => Some('エ'),
        'ォ' | 'オ' | 'コ' | 'ゴ' | 'ソ' | 'ゾ' | 'ト' | 'ド' | 'ノ' | 'ホ' | 'ボ' | 'ポ'
        | 'モ' | 'ョ' | 'ヨ' | 'ロ' | 'ヲ' => Some('オ'),
        _ => None,
    }
}

fn long_vowel_matches(reading: &[char], long_mark_index: usize, orthographic: char) -> bool {
    let Some(previous) = reading[..long_mark_index]
        .iter()
        .rev()
        .copied()
        .find(|c| *c != 'ー')
    else {
        return false;
    };

    match katakana_vowel(previous) {
        Some('ア') => orthographic == 'ア',
        Some('イ') => orthographic == 'イ',
        Some('ウ') => orthographic == 'ウ',
        Some('エ') => matches!(orthographic, 'エ' | 'イ'),
        Some('オ') => matches!(orthographic, 'オ' | 'ウ'),
        _ => false,
    }
}

fn reconstruct_orthography(surface: &str, phonetic: &str) -> String {
    let s_chars: Vec<char> = surface.chars().collect();
    let p_chars: Vec<char> = phonetic.chars().collect();

    let mut s_idx = s_chars.len() as isize - 1;
    let mut p_idx = p_chars.len() as isize - 1;

    let mut tail_orthography = String::new();

    while s_idx >= 0 && p_idx >= 0 {
        let s_char = s_chars[s_idx as usize];
        let p_char = p_chars[p_idx as usize];

        if is_kanji(s_char) {
            break;
        }

        let s_kata = hira_to_kata(s_char);
        let is_exact_match = s_kata == p_char;
        let is_long_vowel_match = p_char == 'ー'
            && is_hiragana(s_char)
            && long_vowel_matches(&p_chars, p_idx as usize, s_kata);

        if is_exact_match || is_long_vowel_match {
            tail_orthography.insert(0, s_kata);
            s_idx -= 1;
            p_idx -= 1;
        } else {
            break;
        }
    }

    let head_phonetic: String = if p_idx >= 0 {
        p_chars[0..=(p_idx as usize)].iter().collect()
    } else {
        "".to_string()
    };

    format!("{}{}", head_phonetic, tail_orthography)
}

fn transfer_inflection_to_orthographic_reading(
    lemma_reading: &str,
    phonetic_base: &str,
    phonetic_surface: &str,
) -> String {
    let lemma_chars: Vec<char> = lemma_reading.chars().collect();
    let base_chars: Vec<char> = phonetic_base.chars().collect();
    let surface_chars: Vec<char> = phonetic_surface.chars().collect();

    let base_is_compatible = lemma_chars.len() == base_chars.len()
        && lemma_chars.iter().zip(base_chars.iter()).enumerate().all(
            |(index, (orthographic, phonetic))| {
                orthographic == phonetic
                    || (*phonetic == 'ー'
                        && long_vowel_matches(&base_chars, index, hira_to_kata(*orthographic)))
            },
        );
    if !base_is_compatible {
        return phonetic_surface.to_string();
    }

    let common_prefix = base_chars
        .iter()
        .zip(surface_chars.iter())
        .take_while(|(base, surface)| base == surface)
        .count();

    if common_prefix > lemma_chars.len() {
        return phonetic_surface.to_string();
    }

    lemma_chars[..common_prefix]
        .iter()
        .chain(surface_chars[common_prefix..].iter())
        .collect()
}

fn derive_reading(surface: &str, details: &[String]) -> String {
    let get = |index: usize| {
        details
            .get(index)
            .map(String::as_str)
            .filter(|value| !value.is_empty() && *value != "*")
    };

    let lemma_reading = get(6);
    let conjugation_type = get(4);
    let phonetic_surface = get(9);
    let phonetic_base = get(11);

    let candidate = if conjugation_type.is_some() {
        match (lemma_reading, phonetic_base, phonetic_surface) {
            (Some(lemma), Some(base), Some(surface_form)) => {
                transfer_inflection_to_orthographic_reading(lemma, base, surface_form)
            }
            (_, _, Some(surface_form)) => surface_form.to_string(),
            (Some(lemma), _, _) => lemma.to_string(),
            _ => "*".to_string(),
        }
    } else {
        lemma_reading
            .or(phonetic_surface)
            .unwrap_or("*")
            .to_string()
    };

    if candidate == "*" {
        candidate
    } else {
        reconstruct_orthography(surface, &candidate)
    }
}

pub fn analyze(input_bytes: &[u8]) -> Vec<u8> {
    let params: InputParams = match serde_json::from_slice(input_bytes) {
        Ok(p) => p,
        Err(e) => return format!("Error: Invalid JSON: {}", e).into_bytes(),
    };

    let dictionary = get_dictionary().clone();

    let user_dictionary = if let Some(csv_data) = params.user_dict_csv {
        let builder = DictionaryBuilder::new(dictionary.metadata.clone());
        match UserDictionaryLoader::load_from_csv_data(builder, csv_data.as_bytes()) {
            Ok(ud) => Some(ud),
            Err(e) => return format!("Error: Failed to build user dictionary: {}", e).into_bytes(),
        }
    } else {
        None
    };

    let segmenter = Segmenter::new(Mode::Normal, dictionary, user_dictionary);
    let tokenizer = Tokenizer::new(segmenter);

    let mut tokens = match tokenizer.tokenize(&params.text) {
        Ok(t) => t,
        Err(e) => return format!("Error: Tokenization failed: {}", e).into_bytes(),
    };

    let mut result_list: Vec<TokenInfo> = Vec::new();
    let mut cursor_byte = 0;
    let text_bytes = params.text.as_bytes();
    let dummy_details = vec!["*".to_string(); 17];

    let to_hiragana = params.kana == "hiragana";

    for token in tokens.iter_mut() {
        if token.byte_start > cursor_byte {
            let gap_slice = &text_bytes[cursor_byte..token.byte_start];
            let gap_text = String::from_utf8_lossy(gap_slice).to_string();
            let mut gap_details = dummy_details.clone();
            gap_details[0] = "Whitespace".to_string();
            result_list.push(TokenInfo {
                surface: gap_text.clone(),
                reading: String::new(),
                details: gap_details,
                ruby_segments: vec![RubySegment {
                    text: gap_text,
                    ruby: "".to_string(),
                }],
            });
        }

        let surface = token.surface.to_string();
        let details_vec: Vec<String> = token.details().iter().map(|s| s.to_string()).collect();

        let final_reading = derive_reading(&surface, &details_vec);
        let mut ruby_segments = if !contains_kanji(&surface) {
            vec![RubySegment {
                text: surface.clone(),
                ruby: "".to_string(),
            }]
        } else {
            build_ruby_segments(&surface, &final_reading)
        };
        let mut output_reading = final_reading;

        if to_hiragana {
            output_reading = output_reading.chars().map(kata_to_hira).collect();
            for seg in ruby_segments.iter_mut() {
                if !seg.ruby.is_empty() {
                    seg.ruby = seg.ruby.chars().map(kata_to_hira).collect();
                }
            }
        }

        result_list.push(TokenInfo {
            surface,
            reading: output_reading,
            details: details_vec,
            ruby_segments,
        });

        cursor_byte = token.byte_end;
    }

    if cursor_byte < text_bytes.len() {
        let gap_slice = &text_bytes[cursor_byte..];
        let gap_text = String::from_utf8_lossy(gap_slice).to_string();
        let mut gap_details = dummy_details.clone();
        gap_details[0] = "Whitespace".to_string();
        result_list.push(TokenInfo {
            surface: gap_text.clone(),
            reading: String::new(),
            details: gap_details,
            ruby_segments: vec![RubySegment {
                text: gap_text,
                ruby: "".to_string(),
            }],
        });
    }

    match serde_json::to_vec(&result_list) {
        Ok(bytes) => bytes,
        Err(e) => format!("Error: Serialization failed: {}", e).into_bytes(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn details(
        conjugation_type: &str,
        lemma_reading: &str,
        phonetic_surface: &str,
        phonetic_base: &str,
    ) -> Vec<String> {
        let mut values = vec!["*".to_string(); 17];
        values[4] = conjugation_type.to_string();
        values[6] = lemma_reading.to_string();
        values[9] = phonetic_surface.to_string();
        values[11] = phonetic_base.to_string();
        values
    }

    #[test]
    fn curated_unidic_orthographic_reading_corpus() {
        let cases = [
            ("行こう", "五段-カ行", "イク", "イコー", "イク", "イコウ"),
            (
                "憂う",
                "文語上二段-ハ行",
                "ウレエル",
                "ウレウ",
                "ウレウ",
                "ウレウ",
            ),
            ("行っ", "五段-カ行", "イク", "イッ", "イク", "イッ"),
            ("書い", "五段-カ行", "カク", "カイ", "カク", "カイ"),
            ("泳い", "五段-ガ行", "オヨグ", "オヨイ", "オヨグ", "オヨイ"),
            ("急い", "五段-ガ行", "イソグ", "イソイ", "イソグ", "イソイ"),
            ("読ん", "五段-マ行", "ヨム", "ヨン", "ヨム", "ヨン"),
            ("遊ん", "五段-バ行", "アソブ", "アソン", "アソブ", "アソン"),
            ("死ん", "五段-ナ行", "シヌ", "シン", "シヌ", "シン"),
            ("待っ", "五段-タ行", "マツ", "マッ", "マツ", "マッ"),
            ("取っ", "五段-ラ行", "トル", "トッ", "トル", "トッ"),
            ("話し", "五段-サ行", "ハナス", "ハナシ", "ハナス", "ハナシ"),
            ("来", "カ行変格", "クル", "キ", "クル", "キ"),
            ("し", "サ行変格", "スル", "シ", "スル", "シ"),
            ("食べ", "下一段-バ行", "タベル", "タベ", "タベル", "タベ"),
            ("見", "上一段-マ行", "ミル", "ミ", "ミル", "ミ"),
            (
                "申し込ん",
                "五段-マ行",
                "モウシコム",
                "モーシコン",
                "モーシコム",
                "モウシコン",
            ),
            (
                "申し込む",
                "五段-マ行",
                "モウシコム",
                "モーシコム",
                "モーシコム",
                "モウシコム",
            ),
            (
                "有し",
                "サ行変格",
                "ユウスル",
                "ユーシ",
                "ユースル",
                "ユウシ",
            ),
            (
                "有する",
                "サ行変格",
                "ユウスル",
                "ユースル",
                "ユースル",
                "ユウスル",
            ),
            (
                "大きかっ",
                "形容詞",
                "オオキイ",
                "オーキカッ",
                "オーキー",
                "オオキカッ",
            ),
            (
                "大きい",
                "形容詞",
                "オオキイ",
                "オーキー",
                "オーキー",
                "オオキイ",
            ),
            (
                "新しかっ",
                "形容詞",
                "アタラシイ",
                "アタラシカッ",
                "アタラシー",
                "アタラシカッ",
            ),
            (
                "新しい",
                "形容詞",
                "アタラシイ",
                "アタラシー",
                "アタラシー",
                "アタラシイ",
            ),
            (
                "美しかっ",
                "形容詞",
                "ウツクシイ",
                "ウツクシカッ",
                "ウツクシー",
                "ウツクシカッ",
            ),
            (
                "美しい",
                "形容詞",
                "ウツクシイ",
                "ウツクシー",
                "ウツクシー",
                "ウツクシイ",
            ),
            ("問う", "五段-ワア行", "トウ", "トー", "トー", "トウ"),
            ("会おう", "五段-ワア行", "アウ", "アオー", "アウ", "アオウ"),
            ("買おう", "五段-ワア行", "カウ", "カオー", "カウ", "カオウ"),
            (
                "思おう",
                "五段-ワア行",
                "オモウ",
                "オモオー",
                "オモウ",
                "オモオウ",
            ),
            (
                "食べよう",
                "下一段-バ行",
                "タベル",
                "タベヨー",
                "タベル",
                "タベヨウ",
            ),
            ("見よう", "上一段-マ行", "ミル", "ミヨー", "ミル", "ミヨウ"),
            ("来よう", "カ行変格", "クル", "コヨー", "クル", "コヨウ"),
            ("しよう", "サ行変格", "スル", "シヨー", "スル", "シヨウ"),
            (
                "走ろう",
                "五段-ラ行",
                "ハシル",
                "ハシロー",
                "ハシル",
                "ハシロウ",
            ),
            ("読もう", "五段-マ行", "ヨム", "ヨモー", "ヨム", "ヨモウ"),
            ("書こう", "五段-カ行", "カク", "カコー", "カク", "カコウ"),
            (
                "泳ごう",
                "五段-ガ行",
                "オヨグ",
                "オヨゴー",
                "オヨグ",
                "オヨゴウ",
            ),
            (
                "話そう",
                "五段-サ行",
                "ハナス",
                "ハナソー",
                "ハナス",
                "ハナソウ",
            ),
            ("待とう", "五段-タ行", "マツ", "マトー", "マツ", "マトウ"),
            ("死のう", "五段-ナ行", "シヌ", "シノー", "シヌ", "シノウ"),
            (
                "遊ぼう",
                "五段-バ行",
                "アソブ",
                "アソボー",
                "アソブ",
                "アソボウ",
            ),
            (
                "申し込もう",
                "五段-マ行",
                "モウシコム",
                "モーシコモー",
                "モーシコム",
                "モウシコモウ",
            ),
            (
                "取り扱おう",
                "五段-ワア行",
                "トリアツカウ",
                "トリアツカオー",
                "トリアツカウ",
                "トリアツカオウ",
            ),
            ("関係", "*", "カンケイ", "カンケー", "カンケー", "カンケイ"),
            ("王", "*", "オウ", "オー", "オー", "オウ"),
            ("先生", "*", "センセイ", "センセー", "センセー", "センセイ"),
            ("映画", "*", "エイガ", "エーガ", "エーガ", "エイガ"),
            ("計算", "*", "ケイサン", "ケーサン", "ケーサン", "ケイサン"),
            (
                "東京",
                "*",
                "トウキョウ",
                "トーキョー",
                "トーキョー",
                "トウキョウ",
            ),
        ];

        for (surface, conjugation_type, lemma_reading, phonetic_surface, phonetic_base, expected) in
            cases
        {
            let actual = derive_reading(
                surface,
                &details(
                    conjugation_type,
                    lemma_reading,
                    phonetic_surface,
                    phonetic_base,
                ),
            );
            assert_eq!(
                actual, expected,
                "surface={surface:?}, lemma={lemma_reading:?}, surface phonetic={phonetic_surface:?}, base phonetic={phonetic_base:?}"
            );
        }
    }

    #[test]
    fn missing_unidic_fields_follow_safe_fallback_order() {
        assert_eq!(
            derive_reading("関係", &details("*", "カンケイ", "カンケー", "カンケー")),
            "カンケイ"
        );
        assert_eq!(
            derive_reading("有し", &details("サ行変格", "*", "ユーシ", "ユースル")),
            "ユーシ"
        );
        assert_eq!(
            derive_reading("有し", &details("サ行変格", "ユウスル", "*", "*")),
            "ユウスル"
        );
        assert_eq!(derive_reading("未知語", &details("*", "*", "*", "*")), "*");
    }

    #[test]
    fn exhaustive_inflection_suffix_transfer() {
        let orthographic_bases = [
            "モウシコム",
            "ユウスル",
            "オオキイ",
            "センセイ",
            "トウキョウ",
            "ケイサンスル",
            "エイゾウカスル",
            "コウセイサレル",
        ];
        let phonetic_bases = [
            "モーシコム",
            "ユースル",
            "オーキー",
            "センセー",
            "トーキョー",
            "ケーサンスル",
            "エーゾーカスル",
            "コーセーサレル",
        ];
        let suffixes = [
            "", "イ", "ウ", "エ", "オー", "カッ", "ク", "ケレ", "サセ", "シ", "タ", "テ", "ナイ",
            "ニ", "マシ", "ヨー", "ラレ", "レ",
        ];
        let mut checked = 0;

        for (orthographic, phonetic) in orthographic_bases.into_iter().zip(phonetic_bases) {
            let orthographic_chars: Vec<char> = orthographic.chars().collect();
            let phonetic_chars: Vec<char> = phonetic.chars().collect();
            assert_eq!(orthographic_chars.len(), phonetic_chars.len());

            for prefix_len in 0..=phonetic_chars.len() {
                for suffix in suffixes {
                    let surface_phonetic: String = phonetic_chars[..prefix_len]
                        .iter()
                        .copied()
                        .chain(suffix.chars())
                        .collect();
                    let actual_common_prefix = phonetic_chars
                        .iter()
                        .zip(surface_phonetic.chars())
                        .take_while(|(base, surface)| **base == *surface)
                        .count();
                    if actual_common_prefix != prefix_len {
                        continue;
                    }
                    let expected: String = orthographic_chars[..prefix_len]
                        .iter()
                        .copied()
                        .chain(suffix.chars())
                        .collect();
                    assert_eq!(
                        transfer_inflection_to_orthographic_reading(
                            orthographic,
                            phonetic,
                            &surface_phonetic
                        ),
                        expected,
                        "orthographic={orthographic:?}, phonetic={phonetic:?}, prefix_len={prefix_len}, suffix={suffix:?}"
                    );
                    checked += 1;
                }
            }
        }

        assert!(
            checked >= 700,
            "only {checked} generated cases were checked"
        );
    }

    #[test]
    fn exhaustive_long_vowel_suffix_reconstruction() {
        let prefixes = ["", "カ", "モウシ", "トリアツカ", "サイ"];
        let valid_endings = [
            ("あ", "アー", "アア"),
            ("い", "キー", "キイ"),
            ("う", "クー", "クウ"),
            ("え", "ケー", "ケエ"),
            ("い", "セー", "セイ"),
            ("お", "コー", "コオ"),
            ("う", "コー", "コウ"),
            ("こう", "コー", "コウ"),
            ("よう", "ヨー", "ヨウ"),
            ("そう", "ソー", "ソウ"),
            ("とう", "トー", "トウ"),
            ("のう", "ノー", "ノウ"),
            ("ぼう", "ボー", "ボウ"),
            ("もう", "モー", "モウ"),
            ("ろう", "ロー", "ロウ"),
            ("しい", "シー", "シイ"),
            ("せい", "セー", "セイ"),
            ("ねえ", "ネー", "ネエ"),
            ("まあ", "マー", "マア"),
            ("おお", "オー", "オオ"),
        ];
        let invalid_endings = [
            ("う", "キー"),
            ("い", "コー"),
            ("あ", "クー"),
            ("え", "マー"),
            ("お", "セー"),
        ];
        let mut checked = 0;

        for prefix in prefixes {
            for (surface_suffix, phonetic_suffix, expected_suffix) in valid_endings {
                let surface = format!("漢{surface_suffix}");
                let phonetic = format!("{prefix}{phonetic_suffix}");
                let expected = format!("{prefix}{expected_suffix}");
                assert_eq!(
                    reconstruct_orthography(&surface, &phonetic),
                    expected,
                    "surface={surface:?}, phonetic={phonetic:?}"
                );
                checked += 1;
            }

            for (surface_suffix, phonetic_suffix) in invalid_endings {
                let surface = format!("漢{surface_suffix}");
                let phonetic = format!("{prefix}{phonetic_suffix}");
                assert_eq!(
                    reconstruct_orthography(&surface, &phonetic),
                    phonetic,
                    "invalid long vowel match changed surface={surface:?}, phonetic={phonetic:?}"
                );
                checked += 1;
            }
        }

        assert_eq!(checked, 125);
    }
}

// The input remains owned by the host; the returned buffer must be freed.
#[export_name = "analyze"]
pub unsafe extern "C" fn analyze_wasm(pointer: *const u8, length: u32) -> u64 {
    abi::invoke(pointer, length, analyze)
}
