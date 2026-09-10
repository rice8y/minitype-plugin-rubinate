use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct RubySegment {
    pub text: String,
    pub ruby: String,
}

fn hira_to_kata(c: char) -> char {
    match c {
        '\u{3041}'..='\u{3096}' => char::from_u32(c as u32 + 0x60).unwrap_or(c),
        '\u{309D}' => '\u{30FD}',
        '\u{309E}' => '\u{30FE}',
        _ => c,
    }
}

pub fn kata_to_hira(c: char) -> char {
    match c {
        '\u{30A1}'..='\u{30F6}' => char::from_u32(c as u32 - 0x60).unwrap_or(c),
        '\u{30FD}' => '\u{309D}',
        '\u{30FE}' => '\u{309E}',
        _ => c,
    }
}

fn normalized_kana(c: char) -> Option<char> {
    let normalized = hira_to_kata(c);
    if matches!(
        normalized,
        '\u{30A1}'..='\u{30FA}' | '\u{30FC}'..='\u{30FE}'
    ) {
        Some(normalized)
    } else {
        None
    }
}

pub fn is_kanji(c: char) -> bool {
    matches!(
        c,
        '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{20000}'..='\u{2FA1F}'
    )
}

fn is_ruby_base(c: char) -> bool {
    is_kanji(c) || matches!(c, '々' | '〆' | '〄')
}

pub fn contains_kanji(s: &str) -> bool {
    s.chars().any(is_kanji)
}

fn contains_ruby_base(chars: &[char]) -> bool {
    chars.iter().copied().any(is_ruby_base)
}

fn gap_is_valid(has_ruby_base: bool, reading_chars: usize) -> bool {
    if has_ruby_base {
        reading_chars >= 1
    } else {
        reading_chars == 0
    }
}

fn whole_word_segment(surface: &str, reading: &str) -> Vec<RubySegment> {
    vec![RubySegment {
        text: surface.to_string(),
        ruby: reading.to_string(),
    }]
}

/// Aligns kana already present in `surface` with the dictionary reading.
///
/// Every surface-kana character is treated as an anchor. A run containing a
/// kanji between two anchors must consume at least one reading character,
/// whereas a run without a kanji consumes none. The alignment is used only
/// when exactly one complete monotonic path exists. Ambiguous or inconsistent
/// input falls back to whole-word ruby rather than emitting a plausible but
/// incorrect partial alignment.
pub fn build_ruby_segments(surface: &str, reading: &str) -> Vec<RubySegment> {
    if reading.is_empty() || reading == "*" || !contains_kanji(surface) {
        return vec![RubySegment {
            text: surface.to_string(),
            ruby: String::new(),
        }];
    }

    let surface_chars: Vec<char> = surface.chars().collect();
    let reading_chars: Vec<char> = reading.chars().collect();
    let anchors: Vec<(usize, char)> = surface_chars
        .iter()
        .copied()
        .enumerate()
        .filter_map(|(index, c)| normalized_kana(c).map(|kana| (index, kana)))
        .collect();

    if anchors.is_empty() {
        return whole_word_segment(surface, reading);
    }

    if anchors.len() > reading_chars.len() {
        return whole_word_segment(surface, reading);
    }

    // The number of paths is saturated at two. We only need to distinguish a
    // unique solution from no solution or an ambiguous solution.
    let mut ways = vec![vec![0_u8; reading_chars.len()]; anchors.len()];
    let mut predecessor = vec![vec![None; reading_chars.len()]; anchors.len()];

    let prefix_has_base = contains_ruby_base(&surface_chars[..anchors[0].0]);
    for reading_index in 0..reading_chars.len() {
        if normalized_kana(reading_chars[reading_index]) != Some(anchors[0].1) {
            continue;
        }
        if gap_is_valid(prefix_has_base, reading_index) {
            ways[0][reading_index] = 1;
        }
    }

    for anchor_index in 1..anchors.len() {
        let previous_surface_index = anchors[anchor_index - 1].0;
        let surface_index = anchors[anchor_index].0;
        let gap_has_base =
            contains_ruby_base(&surface_chars[previous_surface_index + 1..surface_index]);

        for reading_index in 0..reading_chars.len() {
            if normalized_kana(reading_chars[reading_index]) != Some(anchors[anchor_index].1) {
                continue;
            }

            let mut total_ways = 0_u8;
            let mut unique_predecessor = None;

            for (previous_reading_index, &previous_ways) in
                ways[anchor_index - 1][..reading_index].iter().enumerate()
            {
                if previous_ways == 0 {
                    continue;
                }

                let consumed = reading_index - previous_reading_index - 1;
                if !gap_is_valid(gap_has_base, consumed) {
                    continue;
                }

                let next_total = total_ways.saturating_add(previous_ways).min(2);
                if total_ways == 0 && previous_ways == 1 {
                    unique_predecessor = Some(previous_reading_index);
                } else {
                    unique_predecessor = None;
                }
                total_ways = next_total;

                if total_ways >= 2 {
                    unique_predecessor = None;
                    break;
                }
            }

            ways[anchor_index][reading_index] = total_ways;
            predecessor[anchor_index][reading_index] = unique_predecessor;
        }
    }

    let suffix_start = anchors.last().unwrap().0 + 1;
    let suffix_has_base = contains_ruby_base(&surface_chars[suffix_start..]);
    let last_anchor_index = anchors.len() - 1;
    let mut total_solutions = 0_u8;
    let mut final_reading_index = None;

    for (reading_index, &path_count) in ways[last_anchor_index].iter().enumerate() {
        if path_count == 0 {
            continue;
        }

        let remaining = reading_chars.len() - reading_index - 1;
        if !gap_is_valid(suffix_has_base, remaining) {
            continue;
        }

        if total_solutions == 0 && path_count == 1 {
            final_reading_index = Some(reading_index);
        } else {
            final_reading_index = None;
        }
        total_solutions = total_solutions.saturating_add(path_count).min(2);

        if total_solutions >= 2 {
            final_reading_index = None;
            break;
        }
    }

    if total_solutions != 1 {
        return whole_word_segment(surface, reading);
    }

    let mut aligned_reading_indices = vec![0_usize; anchors.len()];
    aligned_reading_indices[last_anchor_index] = final_reading_index.unwrap();
    for anchor_index in (1..anchors.len()).rev() {
        let current = aligned_reading_indices[anchor_index];
        let Some(previous) = predecessor[anchor_index][current] else {
            return whole_word_segment(surface, reading);
        };
        aligned_reading_indices[anchor_index - 1] = previous;
    }

    let mut segments = Vec::new();
    let mut surface_cursor = 0;
    let mut reading_cursor = 0;

    for ((surface_index, _), reading_index) in
        anchors.iter().zip(aligned_reading_indices.iter().copied())
    {
        if surface_cursor < *surface_index {
            segments.push(RubySegment {
                text: surface_chars[surface_cursor..*surface_index]
                    .iter()
                    .collect(),
                ruby: reading_chars[reading_cursor..reading_index]
                    .iter()
                    .collect(),
            });
        }

        segments.push(RubySegment {
            text: surface_chars[*surface_index].to_string(),
            ruby: String::new(),
        });

        surface_cursor = *surface_index + 1;
        reading_cursor = reading_index + 1;
    }

    if surface_cursor < surface_chars.len() {
        segments.push(RubySegment {
            text: surface_chars[surface_cursor..].iter().collect(),
            ruby: reading_chars[reading_cursor..].iter().collect(),
        });
    }

    segments
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compact(segments: &[RubySegment]) -> String {
        segments
            .iter()
            .map(|segment| format!("{}={}", segment.text, segment.ruby))
            .collect::<Vec<_>>()
            .join("|")
    }

    fn assert_case(surface: &str, reading: &str, expected: &str) {
        let actual = build_ruby_segments(surface, reading);
        assert_eq!(
            compact(&actual),
            expected,
            "surface={surface:?}, reading={reading:?}"
        );
        assert_eq!(
            actual
                .iter()
                .map(|segment| segment.text.as_str())
                .collect::<String>(),
            surface
        );
    }

    #[test]
    fn curated_regression_corpus() {
        let cases = [
            ("食べる", "タベル", "食=タ|べ=|る="),
            ("食べた", "タベタ", "食=タ|べ=|た="),
            ("食べよう", "タベヨウ", "食=タ|べ=|よ=|う="),
            ("読みます", "ヨミマス", "読=ヨ|み=|ま=|す="),
            ("読んだ", "ヨンダ", "読=ヨ|ん=|だ="),
            ("読もう", "ヨモウ", "読=ヨ|も=|う="),
            ("書いた", "カイタ", "書=カ|い=|た="),
            ("走った", "ハシッタ", "走=ハシ|っ=|た="),
            ("行こう", "イコウ", "行=イ|こ=|う="),
            ("会おう", "アオウ", "会=ア|お=|う="),
            ("伺う", "ウカガウ", "伺=ウカガ|う="),
            ("憂う", "ウレウ", "憂=ウレ|う="),
            ("潤う", "ウルオウ", "潤=ウルオ|う="),
            ("敬う", "ウヤマウ", "敬=ウヤマ|う="),
            ("占う", "ウラナウ", "占=ウラナ|う="),
            ("失う", "ウシナウ", "失=ウシナ|う="),
            ("思う", "オモウ", "思=オモ|う="),
            ("誘う", "サソウ", "誘=サソ|う="),
            ("扱う", "アツカウ", "扱=アツカ|う="),
            ("笑う", "ワラウ", "笑=ワラ|う="),
            ("習う", "ナラウ", "習=ナラ|う="),
            ("洗う", "アラウ", "洗=アラ|う="),
            ("払う", "ハラウ", "払=ハラ|う="),
            ("拾う", "ヒロウ", "拾=ヒロ|う="),
            ("救う", "スクウ", "救=スク|う="),
            ("狙う", "ネラウ", "狙=ネラ|う="),
            ("漂う", "タダヨウ", "漂=タダヨ|う="),
            ("戦う", "タタカウ", "戦=タタカ|う="),
            ("叶う", "カナウ", "叶=カナ|う="),
            ("伴う", "トモナウ", "伴=トモナ|う="),
            ("賄う", "マカナウ", "賄=マカナ|う="),
            ("損なう", "ソコナウ", "損=ソコ|な=|う="),
            ("行う", "オコナウ", "行=オコナ|う="),
            ("覆う", "オオウ", "覆=オオ|う="),
            ("問う", "トウ", "問=ト|う="),
            ("請う", "コウ", "請=コ|う="),
            ("厭う", "イトウ", "厭=イト|う="),
            ("食らう", "クラウ", "食=ク|ら=|う="),
            ("思い出す", "オモイダス", "思=オモ|い=|出=ダ|す="),
            ("申し込む", "モウシコム", "申=モウ|し=|込=コ|む="),
            ("申し込ん", "モウシコン", "申=モウ|し=|込=コ|ん="),
            ("取り扱う", "トリアツカウ", "取=ト|り=|扱=アツカ|う="),
            ("取り扱っ", "トリアツカッ", "取=ト|り=|扱=アツカ|っ="),
            ("受け取る", "ウケトル", "受=ウ|け=|取=ト|る="),
            ("立ち上がる", "タチアガル", "立=タ|ち=|上=ア|が=|る="),
            ("引き継ぐ", "ヒキツグ", "引=ヒ|き=|継=ツ|ぐ="),
            ("書き換える", "カキカエル", "書=カ|き=|換=カ|え=|る="),
            ("読み始める", "ヨミハジメル", "読=ヨ|み=|始=ハジ|め=|る="),
            ("差し支える", "サシツカエル", "差=サ|し=|支=ツカ|え=|る="),
            ("繰り返す", "クリカエス", "繰=ク|り=|返=カエ|す="),
            ("見渡す", "ミワタス", "見渡=ミワタ|す="),
            ("言い表す", "イイアラワス", "言=イ|い=|表=アラワ|す="),
            ("言い合う", "イイアウ", "言=イ|い=|合=ア|う="),
            (
                "問い合わせる",
                "トイアワセル",
                "問=ト|い=|合=ア|わ=|せ=|る=",
            ),
            ("持ち歩く", "モチアルク", "持=モ|ち=|歩=アル|く="),
            ("飛び回る", "トビマワル", "飛=ト|び=|回=マワ|る="),
            ("考え直す", "カンガエナオス", "考=カンガ|え=|直=ナオ|す="),
            ("組み立てる", "クミタテル", "組=ク|み=|立=タ|て=|る="),
            ("呼び掛ける", "ヨビカケル", "呼=ヨ|び=|掛=カ|け=|る="),
            ("振り返る", "フリカエル", "振=フ|り=|返=カエ|る="),
            ("乗り換える", "ノリカエル", "乗=ノ|り=|換=カ|え=|る="),
            ("受け入れる", "ウケイレル", "受=ウ|け=|入=イ|れ=|る="),
            ("切り替える", "キリカエル", "切=キ|り=|替=カ|え=|る="),
            ("付け加える", "ツケクワエル", "付=ツ|け=|加=クワ|え=|る="),
            ("お祝い", "オイワイ", "お=|祝=イワ|い="),
            ("お薦め", "オススメ", "お=|薦=スス|め="),
            ("ご案内", "ゴアンナイ", "ご=|案内=アンナイ"),
            ("ふり仮名", "フリガナ", "ふ=|り=|仮名=ガナ"),
            ("生ビール", "ナマビール", "生=ナマ|ビ=|ー=|ル="),
            ("缶コーヒー", "カンコーヒー", "缶=カン|コ=|ー=|ヒ=|ー="),
            ("新サービス", "シンサービス", "新=シン|サ=|ー=|ビ=|ス="),
            ("珈琲ゼリー", "コーヒーゼリー", "珈琲=コーヒー|ゼ=|リ=|ー="),
            ("東京", "トウキョウ", "東京=トウキョウ"),
            ("今日", "キョウ", "今日=キョウ"),
            ("一昨日", "オトトイ", "一昨日=オトトイ"),
            ("時々", "トキドキ", "時々=トキドキ"),
            ("山々", "ヤマヤマ", "山々=ヤマヤマ"),
            ("かな", "カナ", "かな="),
            ("カナ", "カナ", "カナ="),
            ("コンピューター", "コンピューター", "コンピューター="),
            ("漢あ字", "カアアジ", "漢あ字=カアアジ"),
            ("食べる", "タブレル", "食べる=タブレル"),
            ("食べる", "*", "食べる="),
            ("食べる", "", "食べる="),
        ];

        for (surface, reading, expected) in cases {
            assert_case(surface, reading, expected);
        }
    }

    #[test]
    fn exhaustive_single_trailing_anchor_uses_the_suffix_match() {
        let hiragana = [
            'あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ',
            'そ', 'た', 'ち', 'つ', 'て', 'と', 'な', 'に', 'ぬ', 'ね', 'の', 'は', 'ひ', 'ふ',
            'へ', 'ほ', 'ま', 'み', 'む', 'め', 'も', 'や', 'ゆ', 'よ', 'ら', 'り', 'る', 'れ',
            'ろ', 'わ', 'を', 'ん', 'が', 'ぎ', 'ぐ', 'げ', 'ご', 'ざ', 'じ', 'ず', 'ぜ', 'ぞ',
            'だ', 'ぢ', 'づ', 'で', 'ど', 'ば', 'び', 'ぶ', 'べ', 'ぼ', 'ぱ', 'ぴ', 'ぷ', 'ぺ',
            'ぽ',
        ];
        let filler = ['ア', 'ウ', 'カ', 'シ', 'ト', 'モ', 'ラ', 'ン'];
        let mut checked = 0;

        for anchor in hiragana {
            let anchor_kata = hira_to_kata(anchor);
            for prefix_len in 1..=12 {
                let mut prefix = String::new();
                for index in 0..prefix_len {
                    // Deliberately introduce false occurrences of the anchor
                    // before the true suffix occurrence.
                    let c = if index % 3 == 1 {
                        anchor_kata
                    } else {
                        filler[(index + prefix_len) % filler.len()]
                    };
                    prefix.push(c);
                }
                let surface = format!("漢{anchor}");
                let reading = format!("{prefix}{anchor_kata}");
                let expected = format!("漢={prefix}|{anchor}=");
                assert_case(&surface, &reading, &expected);
                checked += 1;
            }
        }

        assert_eq!(checked, 852);
    }

    #[test]
    fn exhaustive_two_kanji_blocks_round_trip() {
        let anchors = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ'];
        let filler = ['サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ', 'ツ'];
        let mut checked = 0;

        for first in anchors {
            for second in anchors {
                for prefix_len in 1..=6 {
                    for middle_len in 1..=6 {
                        let prefix: String = (0..prefix_len)
                            .map(|i| filler[(i + prefix_len) % filler.len()])
                            .collect();
                        let middle: String = (0..middle_len)
                            .map(|i| filler[(i + middle_len + 2) % filler.len()])
                            .collect();
                        let first_kata = hira_to_kata(first);
                        let second_kata = hira_to_kata(second);
                        let surface = format!("漢{first}字{second}");
                        let reading = format!("{prefix}{first_kata}{middle}{second_kata}");
                        let expected = format!("漢={prefix}|{first}=|字={middle}|{second}=");
                        assert_case(&surface, &reading, &expected);
                        checked += 1;
                    }
                }
            }
        }

        assert_eq!(checked, 3_600);
    }

    #[test]
    fn exhaustive_three_kanji_blocks_round_trip() {
        let anchors = ['あ', 'い', 'う', 'え', 'お', 'か'];
        let filler = ['サ', 'シ', 'ス', 'セ', 'ソ', 'タ', 'チ'];
        let mut checked = 0;

        for first in anchors {
            for second in anchors {
                for third in anchors {
                    for first_len in 1..=4 {
                        for second_len in 1..=4 {
                            for third_len in 1..=4 {
                                let block = |offset: usize, len: usize| -> String {
                                    (0..len)
                                        .map(|i| filler[(i + offset + len) % filler.len()])
                                        .collect()
                                };
                                let first_ruby = block(0, first_len);
                                let second_ruby = block(2, second_len);
                                let third_ruby = block(4, third_len);
                                let surface = format!("甲{first}乙{second}丙{third}");
                                let reading = format!(
                                    "{first_ruby}{}{second_ruby}{}{third_ruby}{}",
                                    hira_to_kata(first),
                                    hira_to_kata(second),
                                    hira_to_kata(third)
                                );
                                let expected = format!(
                                    "甲={first_ruby}|{first}=|乙={second_ruby}|{second}=|丙={third_ruby}|{third}="
                                );
                                assert_case(&surface, &reading, &expected);
                                checked += 1;
                            }
                        }
                    }
                }
            }
        }

        assert_eq!(checked, 13_824);
    }

    #[test]
    fn deterministic_fuzz_corpus_preserves_surface_and_never_panics() {
        let surface_alphabet = ['漢', '字', '々', 'あ', 'い', 'う', 'カ', 'ー', 'A', '1'];
        let reading_alphabet = ['ア', 'イ', 'ウ', 'カ', 'キ', 'ン', 'ー'];
        let mut state = 0x6A09_E667_F3BC_C909_u64;

        for case_index in 0..50_000 {
            let mut next = || {
                state = state
                    .wrapping_mul(6_364_136_223_846_793_005)
                    .wrapping_add(1_442_695_040_888_963_407);
                state
            };
            let surface_len = (next() as usize % 12) + 1;
            let reading_len = (next() as usize % 16) + 1;
            let surface: String = (0..surface_len)
                .map(|_| surface_alphabet[next() as usize % surface_alphabet.len()])
                .collect();
            let reading: String = (0..reading_len)
                .map(|_| reading_alphabet[next() as usize % reading_alphabet.len()])
                .collect();

            let result = build_ruby_segments(&surface, &reading);
            let reconstructed_surface: String =
                result.iter().map(|segment| segment.text.as_str()).collect();
            assert_eq!(
                reconstructed_surface, surface,
                "case={case_index}, reading={reading:?}"
            );
            assert!(!result.is_empty(), "case={case_index}");
            assert!(
                result.iter().all(|segment| !segment.text.is_empty()),
                "case={case_index}, surface={surface:?}, reading={reading:?}"
            );
            if !contains_kanji(&surface) {
                assert!(
                    result.iter().all(|segment| segment.ruby.is_empty()),
                    "case={case_index}, surface={surface:?}, reading={reading:?}"
                );
            }
        }
    }

    #[test]
    fn unicode_kanji_ranges_are_recognized() {
        for c in ['漢', '㐀', '﨑', '𠀀', '𪛖'] {
            assert!(is_kanji(c), "{c:?}");
        }
        for c in ['あ', 'ア', '々', 'A', '１'] {
            assert!(!is_kanji(c), "{c:?}");
        }
    }
}
