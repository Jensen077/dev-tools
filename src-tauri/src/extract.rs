use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 从日志文本中提取出的 JSON 匹配项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonMatch {
    /// 原始文本中的起始字节偏移
    pub start: usize,
    /// 原始文本中的结束字节偏移（不含）
    pub end: usize,
    /// 匹配到的原始片段
    pub raw: String,
    /// 解析后的值
    pub value: Value,
}

/// 从任意日志文本中扫描提取 JSON 片段。
///
/// 支持：
/// - 纯 JSON 对象/数组
/// - 被引号包裹的转义 JSON（`"{\"a\":1}"`）
/// - 日志前缀文本（`INFO xxx {"a":1}`）
/// - 跨行 JSON
///
/// 策略：逐字节扫描，遇到 `{`/`[` 时尝试做引号与花括号配平；
/// 若直接解析失败，再尝试反转义后解析；被引号包裹时先剥掉外层引号。
pub fn extract_json(input: &str) -> Vec<JsonMatch> {
    let bytes = input.as_bytes();
    let mut matches = Vec::new();
    let mut i = 0usize;
    let n = bytes.len();

    while i < n {
        match bytes[i] {
            b'{' | b'[' => {
                // 优先尝试直接解析、反转义解析
                if let Some(m) = try_match(input, i, false) {
                    i = m.end;
                    matches.push(m);
                    continue;
                }
                if let Some(m) = try_match(input, i, true) {
                    i = m.end;
                    matches.push(m);
                    continue;
                }
                i += 1;
            }
            b'"' => {
                // 引号开头：可能包裹着转义 JSON 字符串
                if let Some(m) = try_match(input, i, true) {
                    i = m.end;
                    matches.push(m);
                    continue;
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    matches
}

/// 从 `start` 位置尝试匹配一个 JSON 片段。
/// `unescape` 为 true 时，先剥离外层引号并对内容做 JSON 反转义。
fn try_match(input: &str, start: usize, unescape: bool) -> Option<JsonMatch> {
    let bytes = input.as_bytes();

    // 找到配平的结束位置：引号感知 + 括号计数
    let end = if bytes[start] == b'"' {
        find_closing_quote(input, start)?
    } else {
        find_balanced_end(input, start)?
    };

    let raw = &input[start..end];
    // 尝试反转义：剥离外层引号 + 反转义内容，再解析
    if unescape {
        if let Some(inner) = strip_and_unescape(raw) {
            let trimmed = inner.trim_start();
            if trimmed.starts_with('{') || trimmed.starts_with('[') {
                if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
                    return Some(JsonMatch {
                        start,
                        end,
                        raw: raw.to_string(),
                        value,
                    });
                }
            }
        }
        return None;
    }

    let trimmed = raw.trim_start();
    if !trimmed.starts_with('{') && !trimmed.starts_with('[') {
        return None;
    }

    serde_json::from_str::<Value>(trimmed)
        .ok()
        .map(|value| JsonMatch {
            start,
            end,
            raw: raw.to_string(),
            value,
        })
}

/// 找到与 start 处括号配平的结束位置（引号与转义感知）。
/// 返回结束位置（不含）。
///
/// 限制单次扫描窗口 `MAX_SCAN`，避免海量孤立括号导致 O(n²) 退化：
/// 日志截断处常见大量未闭合 `{`，若每次都扫描到 EOF 会冻结 UI。
/// 代价：超过 256KB 的合法 JSON 会被静默漏检（日志 JSON 极少超此规模）。
fn find_balanced_end(input: &str, start: usize) -> Option<usize> {
    const MAX_SCAN: usize = 256 * 1024;
    let bytes = input.as_bytes();
    let n = bytes.len().min(start + MAX_SCAN);
    let mut depth = 0i32;
    let mut in_string = false;
    let mut i = start;

    while i < n {
        let b = bytes[i];
        if in_string {
            match b {
                b'\\' => {
                    // 跳过转义序列的下一字节
                    if i + 1 < n {
                        i += 1;
                    }
                }
                b'"' => in_string = false,
                _ => {}
            }
        } else {
            match b {
                b'"' => in_string = true,
                b'{' | b'[' => depth += 1,
                b'}' | b']' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some(i + 1);
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    None
}

/// 找到 start 处引号的配平结束引号位置（含转义处理）。
fn find_closing_quote(input: &str, start: usize) -> Option<usize> {
    let bytes = input.as_bytes();
    let n = bytes.len();
    let mut i = start + 1;
    while i < n {
        match bytes[i] {
            b'\\' => {
                if i + 1 < n {
                    i += 1;
                }
            }
            b'"' => return Some(i + 1),
            _ => {}
        }
        i += 1;
    }
    None
}

/// 剥离外层引号并对内容做 JSON 反转义，返回反转义后的字符串。
fn strip_and_unescape(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    if bytes.len() < 2 || bytes[0] != b'"' || *bytes.last()? != b'"' {
        return None;
    }
    let inner = &s[1..s.len() - 1];
    // 内容中需存在反斜杠才值得反转义
    if !inner.contains('\\') {
        return None;
    }
    // 尝试把整段当作 JSON 字符串值解析，得到反转义结果
    match serde_json::from_str::<String>(s) {
        Ok(v) => Some(v),
        Err(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_json() {
        let m = extract_json(r#"prefix {"a":1,"b":"x"} suffix"#);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].value["a"], 1);
    }

    #[test]
    fn extracts_json_array() {
        let m = extract_json("data [1,2,3]");
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].value.as_array().unwrap().len(), 3);
    }

    #[test]
    fn extracts_quoted_escaped_json() {
        // 日志里常见：被引号包裹且转义的 JSON
        let s = r#"msg="{\"a\":1,\"b\":\"x\"}""#;
        let m = extract_json(s);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].value["a"], 1);
        assert_eq!(m[0].value["b"], "x");
    }

    #[test]
    fn extracts_nested_escaped_json() {
        // 外层对象的值是转义 JSON 字符串
        let s = r#"{"outer":1,"inner":"{\"k\":9}"}"#;
        let m = extract_json(s);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].value["outer"], 1);
    }

    #[test]
    fn extracts_multiline_json() {
        let s = "log start\n{\n  \"a\": 1,\n  \"b\": [1,2]\n}\nlog end";
        let m = extract_json(s);
        assert_eq!(m.len(), 1);
        assert_eq!(m[0].value["b"][1], 2);
    }

    #[test]
    fn no_false_positive_on_plain_text() {
        let s = "some { random } text without json";
        let m = extract_json(s);
        assert!(m.is_empty());
    }

    #[test]
    fn extracts_multiple_json() {
        let s = r#"{"a":1} and {"b":2}"#;
        let m = extract_json(s);
        assert_eq!(m.len(), 2);
    }
}
