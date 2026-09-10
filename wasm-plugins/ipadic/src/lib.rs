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

use ruby::{build_ruby_segments, kata_to_hira, RubySegment};

static DICTIONARY: OnceLock<Dictionary> = OnceLock::new();

fn get_dictionary() -> &'static Dictionary {
    DICTIONARY
        .get_or_init(|| load_dictionary("embedded://ipadic").expect("Failed to load dictionary"))
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
    let dummy_details = vec!["*".to_string(); 9];

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
        let reading = details_vec.get(7).map(|s| s.as_str()).unwrap_or("*");

        let mut ruby_segments = build_ruby_segments(&surface, reading);
        let mut output_reading = reading.to_string();

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

// The input remains owned by the host; the returned buffer must be freed.
#[export_name = "analyze"]
pub unsafe extern "C" fn analyze_wasm(pointer: *const u8, length: u32) -> u64 {
    abi::invoke(pointer, length, analyze)
}
