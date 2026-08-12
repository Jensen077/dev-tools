use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 解析错误：包含消息与 1-based 行列位置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseError {
    pub message: String,
    pub line: usize,
    pub column: usize,
}

/// 将 JSON 文本格式化为缩进美化形式
pub fn format_json(input: &str, indent: usize) -> Result<String, ParseError> {
    let v: Value = serde_json::from_str(input).map_err(to_parse_error)?;
    let s = serde_json::to_string_pretty(&v).map_err(|e| serr(&e.to_string()))?;
    Ok(reindent(&s, indent))
}

/// 将 JSON 文本压缩为单行
pub fn minify_json(input: &str) -> Result<String, ParseError> {
    let v: Value = serde_json::from_str(input).map_err(to_parse_error)?;
    serde_json::to_string(&v).map_err(|e| serr(&e.to_string()))
}

/// 反转义并格式化 JSON 字符串：输入为转义后的 JSON 文本（如 `{\"a\":1}`），
/// 先解除转义再格式化为美化 JSON。支持多行（含字面换行符）。
pub fn unescape_json(input: &str) -> Result<String, ParseError> {
    // 字面换行符在 JSON 字符串中必须转义为 \n/\r，否则 serde_json 拒绝解析
    let escaped = input.replace("\r\n", "\\n").replace('\r', "\\r").replace('\n', "\\n");
    let quoted = format!("\"{}\"", escaped);
    let unescaped: String = serde_json::from_str(&quoted).map_err(to_parse_error)?;
    let v: Value = serde_json::from_str(&unescaped).map_err(to_parse_error)?;
    serde_json::to_string_pretty(&v).map_err(|e| serr(&e.to_string()))
}

fn serr(message: &str) -> ParseError {
    ParseError {
        message: message.to_string(),
        line: 1,
        column: 1,
    }
}

/// 把 serde_json 的解析错误转换为带行列位置的结构
///
/// serde_json 的 line()/column() 均为 1-based，直接透传即可
fn to_parse_error(e: serde_json::Error) -> ParseError {
    ParseError {
        message: e.to_string(),
        line: e.line() as usize,
        column: e.column() as usize,
    }
}

/// 将 serde_json 默认的 2 空格缩进替换为指定宽度
fn reindent(s: &str, indent: usize) -> String {
    if indent == 2 {
        return s.to_string();
    }
    let unit = " ".repeat(indent);
    let mut out = String::with_capacity(s.len());
    for line in s.lines() {
        // serde_json pretty 输出每行缩进为 2*depth 空格；
        // 闭合括号行与开启块同缩进，depth 直接复用即可（勿回退一级）
        let leading = line.len() - line.trim_start().len();
        let line_depth = leading / 2;
        out.push_str(&unit.repeat(line_depth));
        out.push_str(line.trim_start());
        out.push('\n');
    }
    out.pop();
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{"a":1,"b":{"c":[1,2],"d":"x"},"e":null}"#;

    #[test]
    fn format_pretty_default() {
        let out = format_json(SAMPLE, 2).unwrap();
        assert!(out.contains("\n  \"a\""));
        assert!(out.contains("\n    \"c\""));
    }

    #[test]
    fn format_pretty_indent4() {
        let out = format_json(SAMPLE, 4).unwrap();
        assert!(out.contains("\n    \"a\""));
        assert!(out.contains("\n        \"c\""));
    }

    #[test]
    fn format_pretty_indent4_closing_brackets_aligned() {
        // 闭合括号与开启块同缩进：`c` 数组结束 `]` 应与 `"c": [` 同级缩进
        let out = format_json(SAMPLE, 4).unwrap();
        assert_eq!(
            out,
            "{\n    \"a\": 1,\n    \"b\": {\n        \"c\": [\n            1,\n            2\n        ],\n        \"d\": \"x\"\n    },\n    \"e\": null\n}"
        );
    }

    #[test]
    fn minify_compacts() {
        let pretty = format_json(SAMPLE, 2).unwrap();
        let out = minify_json(&pretty).unwrap();
        assert_eq!(out, SAMPLE);
    }

    #[test]
    fn error_reports_line_column() {
        let err = format_json("{\n  \"a\": [1,\n}", 2).unwrap_err();
        assert!(err.line >= 2);
        assert!(err.column >= 1);
        assert!(!err.message.is_empty());
    }

    #[test]
    fn error_column_is_one_based() {
        // serde_json column() 为 1-based，`{"a":1}x` 的 x 在第 8 列
        let err = format_json("{\"a\":1}x", 2).unwrap_err();
        assert_eq!(err.column, 8);
    }

    #[test]
    fn unescape_escaped_json() {
        // 输入为转义 JSON 字符串 {\"a\":1}，serde_json 应正确解除转义
        let input = r#"{\"a\":1}"#;
        let out = unescape_json(input).unwrap();
        assert_eq!(out, "{\n  \"a\": 1\n}");
    }

    #[test]
    fn unescape_nested_escaped_json() {
        let input = r#"{\"a\":1,\"b\":{\"c\":[1,2]}}"#;
        let out = unescape_json(input).unwrap();
        assert!(out.contains("\"a\": 1"));
        assert!(out.contains("\"c\": ["));
    }

    #[test]
    fn unescape_multiline_escaped_json() {
        // 多行转义 JSON，含字面换行符和 \" 转义引号
        let input = r#"{
  \"code\": 0,
  \"msg\": \"success\"
}"#;
        let out = unescape_json(input).unwrap();
        assert!(out.contains("\"code\": 0"));
        assert!(out.contains("\"msg\": \"success\""));
    }
}
