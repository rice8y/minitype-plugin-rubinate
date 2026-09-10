use ruzstd::decoding::StreamingDecoder;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::io::Read;
use std::sync::OnceLock;
#[path = "../../common/abi.rs"]
mod abi;

static COMPRESSED_JMDICT: &[u8] = include_bytes!("../assets/JmdictFurigana.blocks.zst");
static JMDICT_INDEX: &str = include_str!("../assets/JmdictFurigana.blocks.idx");
static COMPRESSED_JMNEDICT: &[u8] = include_bytes!("../assets/JmnedictFurigana.blocks.zst");
static JMNEDICT_INDEX: &str = include_str!("../assets/JmnedictFurigana.blocks.idx");
static JMDICT: OnceLock<BlockDictionary> = OnceLock::new();
static JMNEDICT: OnceLock<BlockDictionary> = OnceLock::new();

#[derive(Debug)]
struct DictionaryBlock {
    bytes: Vec<u8>,
    line_offsets: Vec<u32>,
}

impl DictionaryBlock {
    fn load(compressed: &[u8], expected_lines: usize) -> Self {
        let mut decoder = StreamingDecoder::new(compressed).expect("invalid zstd dictionary block");
        let mut bytes = Vec::new();
        decoder
            .read_to_end(&mut bytes)
            .expect("failed to decompress dictionary block");

        let mut line_offsets = Vec::with_capacity(expected_lines + 1);
        line_offsets.push(0);
        for (index, byte) in bytes.iter().copied().enumerate() {
            if byte == b'\n' && index + 1 < bytes.len() {
                line_offsets.push((index + 1) as u32);
            }
        }

        Self {
            bytes,
            line_offsets,
        }
    }

    fn line(&self, index: usize) -> &[u8] {
        let start = self.line_offsets[index] as usize;
        let end = self
            .line_offsets
            .get(index + 1)
            .map(|offset| *offset as usize - 1)
            .unwrap_or(self.bytes.len());
        &self.bytes[start..end]
    }

    fn surface(line: &[u8]) -> &[u8] {
        line.split(|byte| *byte == b'|').next().unwrap_or(line)
    }

    fn lower_bound(&self, surface: &[u8]) -> usize {
        let mut low = 0;
        let mut high = self.line_offsets.len();
        while low < high {
            let middle = low + (high - low) / 2;
            if Self::surface(self.line(middle)) < surface {
                low = middle + 1;
            } else {
                high = middle;
            }
        }
        low
    }

    fn lookup(&self, text: &str, reading: &str) -> Option<&str> {
        let text_bytes = text.as_bytes();
        let normalized_reading = normalize_reading(reading);
        let mut index = self.lower_bound(text_bytes);

        while index < self.line_offsets.len() {
            let line = self.line(index);
            match Self::surface(line).cmp(text_bytes) {
                Ordering::Less => index += 1,
                Ordering::Greater => break,
                Ordering::Equal => {
                    let line = std::str::from_utf8(line).ok()?;
                    let fields: Vec<&str> = line.split('|').collect();
                    match fields.as_slice() {
                        [_, spec] => return Some(spec),
                        [_, candidate_reading, spec]
                            if normalize_reading(candidate_reading) == normalized_reading =>
                        {
                            return Some(spec);
                        }
                        _ => index += 1,
                    }
                }
            }
        }

        None
    }
}

#[derive(Debug)]
struct BlockMeta {
    first_surface: Vec<u8>,
    offset: usize,
    length: usize,
    lines: usize,
}

#[derive(Debug)]
struct BlockDictionary {
    compressed: &'static [u8],
    blocks: Vec<BlockMeta>,
}

impl BlockDictionary {
    fn load(compressed: &'static [u8], index: &str, expected_lines: usize) -> Self {
        let blocks: Vec<BlockMeta> = index
            .lines()
            .map(|line| {
                let mut fields = line.split('\t');
                let first_surface = fields
                    .next()
                    .expect("missing block surface")
                    .as_bytes()
                    .to_vec();
                let offset = fields
                    .next()
                    .expect("missing block offset")
                    .parse()
                    .expect("invalid block offset");
                let length = fields
                    .next()
                    .expect("missing block length")
                    .parse()
                    .expect("invalid block length");
                let lines = fields
                    .next()
                    .expect("missing block line count")
                    .parse()
                    .expect("invalid block line count");
                assert!(fields.next().is_none(), "unexpected block index field");
                BlockMeta {
                    first_surface,
                    offset,
                    length,
                    lines,
                }
            })
            .collect();
        let lines: usize = blocks.iter().map(|block| block.lines).sum();
        assert_eq!(lines, expected_lines, "unexpected dictionary line count");
        let compressed_len = blocks
            .last()
            .map(|block| block.offset + block.length)
            .unwrap_or(0);
        assert_eq!(
            compressed_len,
            compressed.len(),
            "invalid compressed dictionary index"
        );
        Self { compressed, blocks }
    }

    fn block_index(&self, surface: &[u8]) -> usize {
        self.blocks
            .partition_point(|block| block.first_surface.as_slice() <= surface)
            .saturating_sub(1)
    }

    fn decompress(&self, index: usize) -> DictionaryBlock {
        let block = &self.blocks[index];
        DictionaryBlock::load(
            &self.compressed[block.offset..block.offset + block.length],
            block.lines,
        )
    }
}

struct DictionarySession<'a> {
    dictionary: &'a BlockDictionary,
    cache: Option<(usize, DictionaryBlock)>,
}

impl<'a> DictionarySession<'a> {
    fn new(dictionary: &'a BlockDictionary) -> Self {
        Self {
            dictionary,
            cache: None,
        }
    }

    fn block(&mut self, index: usize) -> &DictionaryBlock {
        let reload = match self.cache.as_ref() {
            Some((cached_index, _)) => *cached_index != index,
            None => true,
        };
        if reload {
            self.cache.take();
            self.cache = Some((index, self.dictionary.decompress(index)));
        }
        &self.cache.as_ref().unwrap().1
    }

    #[cfg(test)]
    fn lookup(&mut self, text: &str, reading: &str) -> Option<String> {
        let index = self.dictionary.block_index(text.as_bytes());
        self.block(index).lookup(text, reading).map(str::to_string)
    }

    fn lookup_prefix_result(
        &mut self,
        text: &str,
        reading: &str,
        kana: &str,
    ) -> Option<LookupResult> {
        let text_chars: Vec<char> = text.chars().collect();
        if text_chars.len() < 2 || !text_chars.iter().copied().all(is_kanji) {
            return None;
        }

        let text_bytes = text.as_bytes();
        let normalized_reading = normalize_reading(reading);
        let mut matched: Option<LookupResult> = None;
        let first_block = self.dictionary.block_index(text_bytes);

        'blocks: for block_index in first_block..self.dictionary.blocks.len() {
            if block_index > first_block
                && !self.dictionary.blocks[block_index]
                    .first_surface
                    .starts_with(text_bytes)
            {
                break;
            }
            let block = self.block(block_index);
            let mut line_index = if block_index == first_block {
                block.lower_bound(text_bytes)
            } else {
                0
            };

            while line_index < block.line_offsets.len() {
                let line = block.line(line_index);
                let candidate_surface = DictionaryBlock::surface(line);
                if !candidate_surface.starts_with(text_bytes) {
                    break 'blocks;
                }
                line_index += 1;

                if candidate_surface == text_bytes {
                    continue;
                }

                let line = std::str::from_utf8(line).ok()?;
                let fields: Vec<&str> = line.split('|').collect();
                let spec = match fields.as_slice() {
                    [_, spec] | [_, _, spec] => *spec,
                    _ => continue,
                };
                let Some(prefix_spec) = annotation_prefix(spec, text_chars.len()) else {
                    continue;
                };
                let Some(result) = build_result(text, &prefix_spec, kana) else {
                    continue;
                };

                if result.kind != "jukugo"
                    || normalize_reading(&result.reading) != normalized_reading
                {
                    continue;
                }

                if let Some(previous) = &matched {
                    if previous.segments != result.segments {
                        return None;
                    }
                } else {
                    matched = Some(result);
                }
            }
        }

        matched
    }
}

fn jmdict() -> &'static BlockDictionary {
    JMDICT.get_or_init(|| BlockDictionary::load(COMPRESSED_JMDICT, JMDICT_INDEX, 234_024))
}

fn jmnedict() -> &'static BlockDictionary {
    JMNEDICT.get_or_init(|| BlockDictionary::load(COMPRESSED_JMNEDICT, JMNEDICT_INDEX, 586_554))
}

#[derive(Deserialize)]
struct LookupParams {
    entries: Vec<LookupInput>,
    #[serde(default = "default_kana")]
    kana: String,
}

#[derive(Deserialize)]
struct LookupInput {
    text: String,
    reading: String,
    #[serde(default)]
    proper_name: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct LookupResult {
    found: bool,
    dictionary: String,
    match_kind: String,
    kind: String,
    reading: String,
    segments: Vec<RubySegment>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
struct RubySegment {
    text: String,
    ruby: String,
}

impl LookupResult {
    fn with_source(mut self, dictionary: &str, match_kind: &str) -> Self {
        self.dictionary = dictionary.to_string();
        self.match_kind = match_kind.to_string();
        self
    }
}

#[derive(Debug)]
struct Annotation {
    start: usize,
    end: usize,
    reading: String,
}

fn default_kana() -> String {
    "hiragana".to_string()
}

fn hira_to_kata(c: char) -> char {
    match c {
        '\u{3041}'..='\u{3096}' => char::from_u32(c as u32 + 0x60).unwrap_or(c),
        '\u{309D}' => '\u{30FD}',
        '\u{309E}' => '\u{30FE}',
        _ => c,
    }
}

fn kata_to_hira(c: char) -> char {
    match c {
        '\u{30A1}'..='\u{30F6}' => char::from_u32(c as u32 - 0x60).unwrap_or(c),
        '\u{30FD}' => '\u{309D}',
        '\u{30FE}' => '\u{309E}',
        _ => c,
    }
}

fn normalize_reading(reading: &str) -> String {
    reading.chars().map(kata_to_hira).collect()
}

fn convert_reading(reading: &str, kana: &str) -> String {
    if kana == "katakana" {
        reading.chars().map(hira_to_kata).collect()
    } else {
        reading.chars().map(kata_to_hira).collect()
    }
}

fn is_kanji(c: char) -> bool {
    matches!(
        c,
        '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{20000}'..='\u{2FA1F}'
            | '々'
            | '〆'
            | '〄'
    )
}

fn parse_annotations(spec: &str, kana: &str) -> Option<Vec<Annotation>> {
    let mut annotations = Vec::new();
    for item in spec.split(';') {
        let (range, reading) = item.split_once(':')?;
        let (start, end) = if let Some((start, end)) = range.split_once('-') {
            (start.parse().ok()?, end.parse().ok()?)
        } else {
            let index = range.parse().ok()?;
            (index, index)
        };
        annotations.push(Annotation {
            start,
            end,
            reading: convert_reading(reading, kana),
        });
    }
    annotations.sort_by_key(|annotation| annotation.start);
    Some(annotations)
}

fn annotation_prefix(spec: &str, prefix_len: usize) -> Option<String> {
    let annotations = parse_annotations(spec, "hiragana")?;
    let mut selected = Vec::new();
    let mut cursor = 0;

    for annotation in annotations {
        if annotation.start >= prefix_len {
            break;
        }
        if annotation.start != cursor || annotation.end >= prefix_len {
            return None;
        }

        let range = if annotation.start == annotation.end {
            annotation.start.to_string()
        } else {
            format!("{}-{}", annotation.start, annotation.end)
        };
        selected.push(format!("{range}:{}", annotation.reading));
        cursor = annotation.end + 1;
    }

    (cursor == prefix_len).then(|| selected.join(";"))
}

fn classify(text: &[char], annotations: &[Annotation]) -> &'static str {
    if annotations
        .iter()
        .any(|annotation| annotation.end > annotation.start)
    {
        return "group";
    }

    if annotations.len() > 1 && text.len() > 1 && text.iter().copied().all(is_kanji) {
        return "jukugo";
    }

    "mono"
}

fn build_result(text: &str, spec: &str, kana: &str) -> Option<LookupResult> {
    let text_chars: Vec<char> = text.chars().collect();
    let annotations = parse_annotations(spec, kana)?;
    let kind = classify(&text_chars, &annotations).to_string();
    let mut segments = Vec::new();
    let mut cursor = 0;

    for annotation in annotations {
        if annotation.start < cursor
            || annotation.end < annotation.start
            || annotation.end >= text_chars.len()
        {
            return None;
        }
        if cursor < annotation.start {
            segments.push(RubySegment {
                text: text_chars[cursor..annotation.start].iter().collect(),
                ruby: String::new(),
            });
        }
        segments.push(RubySegment {
            text: text_chars[annotation.start..=annotation.end]
                .iter()
                .collect(),
            ruby: annotation.reading,
        });
        cursor = annotation.end + 1;
    }

    if cursor < text_chars.len() {
        segments.push(RubySegment {
            text: text_chars[cursor..].iter().collect(),
            ruby: String::new(),
        });
    }

    let reading = segments
        .iter()
        .map(|segment| {
            if segment.ruby.is_empty() {
                convert_reading(&segment.text, kana)
            } else {
                segment.ruby.clone()
            }
        })
        .collect();

    Some(LookupResult {
        found: true,
        dictionary: "none".to_string(),
        match_kind: "none".to_string(),
        kind,
        reading,
        segments,
    })
}

fn not_found() -> LookupResult {
    LookupResult {
        found: false,
        dictionary: "none".to_string(),
        match_kind: "none".to_string(),
        kind: "group".to_string(),
        reading: String::new(),
        segments: Vec::new(),
    }
}

#[cfg(test)]
fn exact_result(
    dictionary: &mut DictionarySession,
    dictionary_name: &str,
    text: &str,
    reading: &str,
    kana: &str,
) -> Option<LookupResult> {
    dictionary
        .lookup(text, reading)
        .and_then(|spec| build_result(text, &spec, kana))
        .map(|result| result.with_source(dictionary_name, "exact"))
}

#[cfg(test)]
fn lookup_result(text: &str, reading: &str, proper_name: bool, kana: &str) -> LookupResult {
    let mut jmdict = DictionarySession::new(jmdict());
    let mut jmnedict = DictionarySession::new(jmnedict());
    lookup_result_with_sessions(&mut jmdict, &mut jmnedict, text, reading, proper_name, kana)
}

#[cfg(test)]
fn lookup_result_with_sessions(
    jmdict: &mut DictionarySession,
    jmnedict: &mut DictionarySession,
    text: &str,
    reading: &str,
    proper_name: bool,
    kana: &str,
) -> LookupResult {
    if !text.chars().any(is_kanji) {
        return not_found();
    }

    if proper_name {
        if let Some(result) = exact_result(jmnedict, "jmnedict", text, reading, kana) {
            return result;
        }
    }

    exact_result(jmdict, "jmdict", text, reading, kana)
        .or_else(|| {
            jmdict
                .lookup_prefix_result(text, reading, kana)
                .map(|result| result.with_source("jmdict", "inferred"))
        })
        .unwrap_or_else(not_found)
}

fn fill_exact_results(
    dictionary: &BlockDictionary,
    dictionary_name: &str,
    entries: &[LookupInput],
    kana: &str,
    proper_names_only: bool,
    results: &mut [Option<LookupResult>],
) {
    for block_index in 0..dictionary.blocks.len() {
        let needed = entries.iter().enumerate().any(|(index, entry)| {
            results[index].is_none()
                && (!proper_names_only || entry.proper_name)
                && entry.text.chars().any(is_kanji)
                && dictionary.block_index(entry.text.as_bytes()) == block_index
        });
        if !needed {
            continue;
        }

        let block = dictionary.decompress(block_index);
        for (index, entry) in entries.iter().enumerate() {
            if results[index].is_some()
                || (proper_names_only && !entry.proper_name)
                || !entry.text.chars().any(is_kanji)
                || dictionary.block_index(entry.text.as_bytes()) != block_index
            {
                continue;
            }

            results[index] = block
                .lookup(&entry.text, &entry.reading)
                .and_then(|spec| build_result(&entry.text, spec, kana))
                .map(|result| result.with_source(dictionary_name, "exact"));
        }
    }
}

pub fn lookup(input_bytes: &[u8]) -> Vec<u8> {
    let params: LookupParams = match serde_json::from_slice(input_bytes) {
        Ok(params) => params,
        Err(error) => return format!("Error: Invalid JSON: {error}").into_bytes(),
    };
    if params.kana != "hiragana" && params.kana != "katakana" {
        return b"Error: kana must be one of: hiragana, katakana".to_vec();
    }

    let mut results: Vec<Option<LookupResult>> = std::iter::repeat_with(|| None)
        .take(params.entries.len())
        .collect();
    fill_exact_results(
        jmnedict(),
        "jmnedict",
        &params.entries,
        &params.kana,
        true,
        &mut results,
    );
    fill_exact_results(
        jmdict(),
        "jmdict",
        &params.entries,
        &params.kana,
        false,
        &mut results,
    );

    let mut general = DictionarySession::new(jmdict());
    for (index, entry) in params.entries.iter().enumerate() {
        if results[index].is_none() && entry.text.chars().any(is_kanji) {
            results[index] = general
                .lookup_prefix_result(&entry.text, &entry.reading, &params.kana)
                .map(|result| result.with_source("jmdict", "inferred"));
        }
    }

    let results: Vec<LookupResult> = results
        .into_iter()
        .map(|result| result.unwrap_or_else(not_found))
        .collect();

    serde_json::to_vec(&results)
        .unwrap_or_else(|error| format!("Error: Serialization failed: {error}").into_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lookup_one(text: &str, reading: &str) -> LookupResult {
        let mut dictionary = DictionarySession::new(jmdict());
        exact_result(&mut dictionary, "jmdict", text, reading, "hiragana").expect("entry not found")
    }

    #[test]
    fn classifies_mono_jukugo_and_group_ruby() {
        let mono = lookup_one("食べる", "タベル");
        assert_eq!(mono.kind, "mono");
        assert_eq!(mono.segments[0].text, "食");
        assert_eq!(mono.segments[0].ruby, "た");

        let jukugo = lookup_one("東京", "トウキョウ");
        assert_eq!(jukugo.kind, "jukugo");
        assert_eq!(jukugo.segments.len(), 2);

        let group = lookup_one("大人", "オトナ");
        assert_eq!(group.kind, "group");
        assert_eq!(group.segments[0].text, "大人");
        assert_eq!(group.segments[0].ruby, "おとな");
    }

    #[test]
    fn disambiguates_entries_with_multiple_readings() {
        let common = lookup_one("憂う", "ウレウ");
        assert_eq!(common.segments[0].ruby, "うれ");

        let literary = lookup_one("憂う", "ウリョウ");
        assert_eq!(literary.segments[0].ruby, "うりょ");
    }

    #[test]
    fn katakana_output_is_supported() {
        let mut dictionary = DictionarySession::new(jmdict());
        let spec = dictionary.lookup("申し込む", "モウシコム").unwrap();
        let result = build_result("申し込む", &spec, "katakana").unwrap();
        assert_eq!(result.reading, "モウシコム");
        assert_eq!(result.segments[0].ruby, "モウ");
    }

    #[test]
    fn recovers_missing_compound_from_a_consistent_longer_entry() {
        let mut dictionary = DictionarySession::new(jmdict());
        assert!(dictionary.lookup("新宿", "シンジュク").is_none());

        let result = lookup_result("新宿", "シンジュク", false, "hiragana");
        assert!(result.found);
        assert_eq!(result.dictionary, "jmdict");
        assert_eq!(result.match_kind, "inferred");
        assert_eq!(result.kind, "jukugo");
        assert_eq!(
            result.segments,
            vec![
                RubySegment {
                    text: "新".to_string(),
                    ruby: "しん".to_string(),
                },
                RubySegment {
                    text: "宿".to_string(),
                    ruby: "じゅく".to_string(),
                },
            ]
        );
    }

    #[test]
    fn proper_names_prefer_exact_jmnedict_correspondence() {
        let result = lookup_result("新宿", "シンジュク", true, "hiragana");
        assert!(result.found);
        assert_eq!(result.dictionary, "jmnedict");
        assert_eq!(result.match_kind, "exact");
        assert_eq!(result.kind, "jukugo");
        assert_eq!(
            result.segments,
            vec![
                RubySegment {
                    text: "新".to_string(),
                    ruby: "しん".to_string(),
                },
                RubySegment {
                    text: "宿".to_string(),
                    ruby: "じゅく".to_string(),
                },
            ]
        );

        let common = lookup_result("東京", "トウキョウ", false, "hiragana");
        assert_eq!(common.dictionary, "jmdict");
        let proper = lookup_result("東京", "トウキョウ", true, "hiragana");
        assert_eq!(proper.dictionary, "jmnedict");
    }

    #[test]
    fn block_layout_bounds_the_decompression_working_set() {
        assert_eq!(jmdict().blocks.len(), 2);
        assert_eq!(jmnedict().blocks.len(), 5);

        let max_jmdict = (0..jmdict().blocks.len())
            .map(|index| jmdict().decompress(index).bytes.len())
            .max()
            .unwrap();
        let max_jmnedict = (0..jmnedict().blocks.len())
            .map(|index| jmnedict().decompress(index).bytes.len())
            .max()
            .unwrap();

        assert!(max_jmdict < 4_700_000, "{max_jmdict}");
        assert!(max_jmnedict < 4_800_000, "{max_jmnedict}");
    }

    #[test]
    fn kana_only_entries_do_not_decompress_any_dictionary_block() {
        let mut general = DictionarySession::new(jmdict());
        let mut names = DictionarySession::new(jmnedict());
        let result = lookup_result_with_sessions(
            &mut general,
            &mut names,
            "ひらがな",
            "ヒラガナ",
            false,
            "hiragana",
        );
        assert!(!result.found);
        assert!(general.cache.is_none());
        assert!(names.cache.is_none());
    }

    #[test]
    fn batch_lookup_preserves_dictionary_precedence_and_output_order() {
        let input = serde_json::json!({
            "entries": [
                {"text": "食べる", "reading": "タベル", "proper_name": false},
                {"text": "新宿", "reading": "シンジュク", "proper_name": true},
                {"text": "ひらがな", "reading": "ヒラガナ", "proper_name": false}
            ],
            "kana": "hiragana"
        });
        let output: serde_json::Value =
            serde_json::from_slice(&lookup(&serde_json::to_vec(&input).unwrap())).unwrap();
        let results = output.as_array().unwrap();

        assert_eq!(results[0]["dictionary"], "jmdict");
        assert_eq!(results[0]["match_kind"], "exact");
        assert_eq!(results[0]["kind"], "mono");
        assert_eq!(results[1]["dictionary"], "jmnedict");
        assert_eq!(results[1]["match_kind"], "exact");
        assert_eq!(results[1]["kind"], "jukugo");
        assert_eq!(results[2]["dictionary"], "none");
        assert_eq!(results[2]["match_kind"], "none");
    }

    #[test]
    fn validates_every_recoverable_jukugo_prefix() {
        let dictionary = jmdict();
        let mut candidates = Vec::new();
        let mut recovered = 0;

        for block_index in 0..dictionary.blocks.len() {
            let block = dictionary.decompress(block_index);
            for line_index in 0..block.line_offsets.len() {
                let line = std::str::from_utf8(block.line(line_index)).unwrap();
                let fields: Vec<&str> = line.split('|').collect();
                let (text, spec) = match fields.as_slice() {
                    [text, spec] | [text, _, spec] => (*text, *spec),
                    _ => panic!("invalid dictionary row: {line:?}"),
                };
                let text_chars: Vec<char> = text.chars().collect();

                for prefix_len in 2..text_chars.len() {
                    let Some(prefix_spec) = annotation_prefix(spec, prefix_len) else {
                        continue;
                    };
                    let prefix: String = text_chars[..prefix_len].iter().collect();
                    let Some(expected) = build_result(&prefix, &prefix_spec, "hiragana") else {
                        continue;
                    };
                    if expected.kind == "jukugo" {
                        candidates.push((prefix, expected));
                    }
                }
            }
        }

        let mut session = DictionarySession::new(dictionary);
        for (prefix, expected) in &candidates {
            if let Some(actual) =
                session.lookup_prefix_result(prefix, &expected.reading, "hiragana")
            {
                assert_eq!(actual.kind, "jukugo", "prefix {prefix:?}");
                assert_eq!(actual.reading, expected.reading, "prefix {prefix:?}");
                assert_eq!(actual.segments, expected.segments, "prefix {prefix:?}");
                recovered += 1;
            }
        }

        assert!(
            candidates.len() > 10_000,
            "only {} prefixes generated",
            candidates.len()
        );
        assert!(recovered > 1_000, "only {recovered} prefixes recovered");
    }

    #[test]
    fn validates_every_embedded_dictionary_entry() {
        let dictionary = jmdict();
        let mut mono = 0;
        let mut jukugo = 0;
        let mut group = 0;

        for block_index in 0..dictionary.blocks.len() {
            let block = dictionary.decompress(block_index);
            for line_index in 0..block.line_offsets.len() {
                let line = std::str::from_utf8(block.line(line_index)).unwrap();
                let fields: Vec<&str> = line.split('|').collect();
                let (text, reading, spec) = match fields.as_slice() {
                    [text, spec] => (*text, "", *spec),
                    [text, reading, spec] => (*text, *reading, *spec),
                    _ => panic!("invalid dictionary row: {line:?}"),
                };

                assert!(
                    block.lookup(text, reading).is_some(),
                    "lookup failed: {line:?}"
                );

                for kana in ["hiragana", "katakana"] {
                    let result = build_result(text, spec, kana)
                        .unwrap_or_else(|| panic!("invalid annotations: {line:?}"));
                    let reconstructed_text: String = result
                        .segments
                        .iter()
                        .map(|segment| segment.text.as_str())
                        .collect();
                    assert_eq!(reconstructed_text, text, "row {line:?}");
                    assert!(
                        result
                            .segments
                            .iter()
                            .all(|segment| !segment.text.is_empty()),
                        "empty segment: {line:?}"
                    );
                }

                match build_result(text, spec, "hiragana").unwrap().kind.as_str() {
                    "mono" => mono += 1,
                    "jukugo" => jukugo += 1,
                    "group" => group += 1,
                    kind => panic!("invalid kind {kind:?}: {line:?}"),
                }
            }
        }

        assert_eq!(
            dictionary
                .blocks
                .iter()
                .map(|block| block.lines)
                .sum::<usize>(),
            234_024
        );
        assert!(mono > 50_000, "unexpected mono count: {mono}");
        assert!(jukugo > 50_000, "unexpected jukugo count: {jukugo}");
        assert!(group > 1_000, "unexpected group count: {group}");
    }

    #[test]
    fn validates_every_embedded_jmnedict_entry() {
        let dictionary = jmnedict();
        let mut mono = 0;
        let mut jukugo = 0;
        let mut group = 0;

        for block_index in 0..dictionary.blocks.len() {
            let block = dictionary.decompress(block_index);
            for line_index in 0..block.line_offsets.len() {
                let line = std::str::from_utf8(block.line(line_index)).unwrap();
                let fields: Vec<&str> = line.split('|').collect();
                let (text, reading, spec) = match fields.as_slice() {
                    [text, spec] => (*text, "", *spec),
                    [text, reading, spec] => (*text, *reading, *spec),
                    _ => panic!("invalid JMnedict row: {line:?}"),
                };

                assert!(
                    block.lookup(text, reading).is_some(),
                    "JMnedict lookup failed: {line:?}"
                );

                for kana in ["hiragana", "katakana"] {
                    let result = build_result(text, spec, kana)
                        .unwrap_or_else(|| panic!("invalid JMnedict annotations: {line:?}"));
                    let reconstructed_text: String = result
                        .segments
                        .iter()
                        .map(|segment| segment.text.as_str())
                        .collect();
                    assert_eq!(reconstructed_text, text, "JMnedict row {line:?}");
                    assert!(
                        result
                            .segments
                            .iter()
                            .all(|segment| !segment.text.is_empty()),
                        "empty JMnedict segment: {line:?}"
                    );
                }

                match build_result(text, spec, "hiragana").unwrap().kind.as_str() {
                    "mono" => mono += 1,
                    "jukugo" => jukugo += 1,
                    "group" => group += 1,
                    kind => panic!("invalid JMnedict kind {kind:?}: {line:?}"),
                }
            }
        }

        assert_eq!(
            dictionary
                .blocks
                .iter()
                .map(|block| block.lines)
                .sum::<usize>(),
            586_554
        );
        assert!(mono > 40_000, "unexpected JMnedict mono count: {mono}");
        assert!(
            jukugo > 100_000,
            "unexpected JMnedict jukugo count: {jukugo}"
        );
        assert!(group > 1_000, "unexpected JMnedict group count: {group}");
    }
}

// The input remains owned by the host; the returned buffer must be freed.
#[export_name = "lookup"]
pub unsafe extern "C" fn lookup_wasm(pointer: *const u8, length: u32) -> u64 {
    abi::invoke(pointer, length, lookup)
}
