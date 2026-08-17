use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_yaml::Value;

use crate::format::ParseError;

/// 单条 key → value 条目（键按字母序排列）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvEntry {
    pub key: String,
    pub value: String,
}

/// 单条键级变更
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KvChange {
    pub key: String,
    /// added / removed / modified
    pub change: String,
    /// 变更前的值（Added 时为 None）
    pub left: Option<String>,
    /// 变更后的值（Removed 时为 None）
    pub right: Option<String>,
}

/// 配置文件值比对结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareResult {
    /// 左侧解析出的键值（按 key 字母序）
    pub left_entries: Vec<KvEntry>,
    /// 右侧解析出的键值（按 key 字母序）
    pub right_entries: Vec<KvEntry>,
    /// 键级变更（按 key 字母序）
    pub changes: Vec<KvChange>,
}

/// 比对两侧配置（各自可为 .properties 或 YAML，自动识别）为扁平键值后按键 diff。
pub fn compare_kv(left: &str, right: &str) -> Result<CompareResult, ParseError> {
    let l = parse_side(left, "左值")?;
    let r = parse_side(right, "右值")?;

    let mut changes = Vec::new();
    for (k, lv) in &l {
        match r.get(k) {
            Some(rv) if rv != lv => changes.push(KvChange {
                key: k.clone(),
                change: "modified".to_string(),
                left: Some(lv.clone()),
                right: Some(rv.clone()),
            }),
            Some(_) => {}
            None => changes.push(KvChange {
                key: k.clone(),
                change: "removed".to_string(),
                left: Some(lv.clone()),
                right: None,
            }),
        }
    }
    for (k, rv) in &r {
        if !l.contains_key(k) {
            changes.push(KvChange {
                key: k.clone(),
                change: "added".to_string(),
                left: None,
                right: Some(rv.clone()),
            });
        }
    }
    changes.sort_by(|a, b| a.key.cmp(&b.key));

    let left_entries = l
        .into_iter()
        .map(|(key, value)| KvEntry { key, value })
        .collect();
    let right_entries = r
        .into_iter()
        .map(|(key, value)| KvEntry { key, value })
        .collect();

    Ok(CompareResult {
        left_entries,
        right_entries,
        changes,
    })
}

/// 解析一侧输入为扁平键值映射。自动识别格式（JSON 优先）：
/// - 首非空白字符为 `{` 或 `[` → JSON 解析
/// - 文本带明确的 YAML 结构特征（嵌套缩进/列表/文档标记/行尾冒号）→ YAML 解析
/// - 其余一律按 .properties 解析
fn parse_side(input: &str, label: &str) -> Result<BTreeMap<String, String>, ParseError> {
    if looks_like_json(input) {
        let v: serde_json::Value = serde_json::from_str(input).map_err(|e| ParseError {
            message: format!("{}解析失败: {}", label, e),
            line: e.line() as usize,
            column: e.column() as usize,
        })?;
        let mut out = BTreeMap::new();
        flatten_json(&v, "", &mut out);
        return Ok(out);
    }
    if !looks_like_yaml(input) {
        return Ok(parse_properties(input));
    }
    let v: Value = serde_yaml::from_str(input).map_err(|e| {
        let mut pe = yaml_parse_error(e);
        pe.message = format!("{}解析失败: {}", label, pe.message);
        pe
    })?;
    let mut out = BTreeMap::new();
    flatten_yaml(&v, "", &mut out);
    Ok(out)
}

/// 文本首非空白字符是否为 `{` 或 `[`（JSON 格式）
fn looks_like_json(input: &str) -> bool {
    let t = input.trim_start();
    t.starts_with('{') || t.starts_with('[')
}

/// 文本是否带明确的 YAML 结构特征（用于决定走 YAML 解析还是回落 properties）。
/// properties 的常规形态（`=` 分隔、单层 `key: value`）不会命中这些特征。
fn looks_like_yaml(input: &str) -> bool {
    let mut prev: Option<&str> = None;
    for raw in input.lines() {
        let t = raw.trim_start();
        if t.is_empty() || is_comment_line(t) {
            continue;
        }
        if t.starts_with("---") || t.starts_with("...") {
            return true;
        }
        if t.starts_with("- ") || t.starts_with("? ") {
            return true;
        }
        // 行尾冒号：嵌套块开始或空值（`a:` 带子键）
        if t.ends_with(':') {
            return true;
        }
        // 带缩进的键值行：嵌套 YAML 结构。排除 properties 续行（上一非空行以反斜杠结尾）
        if raw.starts_with(' ') || raw.starts_with('\t') {
            if let Some(p) = prev {
                if !p.ends_with('\\') {
                    return true;
                }
            }
        }
        prev = Some(t);
    }
    false
}

/// 把 serde_yaml 的解析错误转换为 ParseError（Location 为 0-based，转 1-based）
fn yaml_parse_error(e: serde_yaml::Error) -> ParseError {
    match e.location() {
        Some(loc) => ParseError {
            message: e.to_string(),
            line: loc.line() + 1,
            column: loc.column() + 1,
        },
        None => ParseError {
            message: e.to_string(),
            line: 1,
            column: 1,
        },
    }
}

/// 把 serde_yaml 标量统一转字符串：整数直出、浮点去尾零、bool/null 字面量，
/// 对齐 properties 的字符串语义（YAML `3`/`3.0` 与 properties `3` 视为同值）。
fn scalar_to_string(v: &Value) -> Option<String> {
    match v {
        Value::Null => Some("null".to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(num) => Some(format_number(num)),
        Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

fn format_number(num: &serde_yaml::Number) -> String {
    if let Some(i) = num.as_i64() {
        return i.to_string();
    }
    if let Some(u) = num.as_u64() {
        return u.to_string();
    }
    if let Some(f) = num.as_f64() {
        if f == f.trunc() && f.abs() < 1e15 {
            return format!("{}", f as i64);
        }
        return format!("{}", f);
    }
    num.to_string()
}

/// 递归展平 YAML 值树为扁平 key → value：
/// 对象键点号拼接（`a.b.c`）、数组下标 `parent[i]`，标量经 scalar_to_string 归一。
fn flatten_yaml(node: &Value, prefix: &str, out: &mut BTreeMap<String, String>) {
    match node {
        Value::Mapping(m) => {
            for (k, v) in m {
                let Some(key) = scalar_to_string(k) else {
                    continue;
                };
                let path = if prefix.is_empty() {
                    key
                } else {
                    format!("{}.{}", prefix, key)
                };
                match v {
                    Value::Mapping(_) | Value::Sequence(_) => flatten_yaml(v, &path, out),
                    _ => {
                        if let Some(s) = scalar_to_string(v) {
                            out.insert(path, s);
                        }
                    }
                }
            }
        }
        Value::Sequence(seq) => {
            for (i, item) in seq.iter().enumerate() {
                let path = format!("{}[{}]", prefix, i);
                match item {
                    Value::Mapping(_) | Value::Sequence(_) => flatten_yaml(item, &path, out),
                    _ => {
                        if let Some(s) = scalar_to_string(item) {
                            out.insert(path, s);
                        }
                    }
                }
            }
        }
        _ => {
            if let Some(s) = scalar_to_string(node) {
                out.insert(prefix.to_string(), s);
            }
        }
    }
}

/// 递归展平 JSON 值树为扁平 key → value（逻辑镜像 flatten_yaml）。
fn flatten_json(node: &serde_json::Value, prefix: &str, out: &mut BTreeMap<String, String>) {
    match node {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                let path = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{}.{}", prefix, k)
                };
                match v {
                    serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                        flatten_json(v, &path, out)
                    }
                    _ => {
                        if let Some(s) = json_scalar_to_string(v) {
                            out.insert(path, s);
                        }
                    }
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for (i, item) in arr.iter().enumerate() {
                let path = format!("{}[{}]", prefix, i);
                match item {
                    serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                        flatten_json(item, &path, out)
                    }
                    _ => {
                        if let Some(s) = json_scalar_to_string(item) {
                            out.insert(path, s);
                        }
                    }
                }
            }
        }
        _ => {
            if let Some(s) = json_scalar_to_string(node) {
                out.insert(prefix.to_string(), s);
            }
        }
    }
}

/// 把 serde_json 标量统一转字符串，对齐 YAML/properties 的字符串语义。
fn json_scalar_to_string(v: &serde_json::Value) -> Option<String> {
    match v {
        serde_json::Value::Null => Some("null".to_string()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        serde_json::Value::Number(num) => Some(format_json_number(num)),
        serde_json::Value::String(s) => Some(s.clone()),
        _ => None,
    }
}

fn format_json_number(num: &serde_json::Number) -> String {
    if let Some(i) = num.as_i64() {
        return i.to_string();
    }
    if let Some(u) = num.as_u64() {
        return u.to_string();
    }
    if let Some(f) = num.as_f64() {
        if f == f.trunc() && f.abs() < 1e15 {
            return format!("{}", f as i64);
        }
        return format!("{}", f);
    }
    num.to_string()
}

/// 解析 Java .properties 文本为键值映射（重复 key 后者覆盖，对齐 java.util.Properties）。
fn parse_properties(input: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    // logical 为跨物理行拼接的逻辑行（续行时累积）
    let mut logical = String::new();
    // 当前逻辑行是否已累积过内容（false 表示下一物理行为新逻辑行首行）
    let mut in_line = false;
    for raw in input.split('\n') {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if in_line {
            // 续行：拼接时去掉行首空白
            logical.push_str(line.trim_start());
        } else {
            // 新逻辑行：注释行整行跳过
            if is_comment_line(line) {
                continue;
            }
            logical = line.to_string();
        }
        if ends_with_unescaped_backslash(&logical) {
            // 行尾反斜杠 → 续行，去掉该反斜杠继续拼接
            logical.pop();
            in_line = true;
            continue;
        }
        in_line = false;
        if let Some((k, v)) = split_key_value(&logical) {
            map.insert(k, v);
        }
        logical.clear();
    }
    map
}

/// 注释行：首个非空白字符为 # 或 !
fn is_comment_line(line: &str) -> bool {
    let t = line.trim_start();
    t.starts_with('#') || t.starts_with('!')
}

/// 判断行尾是否为「未转义的反斜杠」（续行标记）：尾部反斜杠数为奇数
fn ends_with_unescaped_backslash(s: &str) -> bool {
    let mut n = 0;
    for c in s.chars().rev() {
        if c == '\\' {
            n += 1;
        } else {
            break;
        }
    }
    n % 2 == 1
}

/// 按 Java Properties 规则切分一行（已去除续行与注释）为 key/value。
/// 分隔符为第一个未转义的 = / : / 空白；空白分隔后可选再跟 = / :。
/// 返回 None 表示空行（无有效内容）。
fn split_key_value(line: &str) -> Option<(String, String)> {
    let line = line.trim_start();
    if line.is_empty() {
        return None;
    }
    let chars: Vec<char> = line.chars().collect();
    let n = chars.len();
    let mut i = 0;
    let mut delim: Option<char> = None;
    while i < n {
        let c = chars[i];
        if c == '\\' {
            i += 2.min(n - i);
            continue;
        }
        if c == '=' || c == ':' || c == ' ' || c == '\t' || c == '\u{000c}' {
            delim = Some(c);
            break;
        }
        i += 1;
    }
    let key_raw: String = chars[..i].iter().collect();
    match delim {
        None => Some((unescape(&key_raw), String::new())),
        Some(d) => {
            let mut j = i;
            let is_space_delim = d == ' ' || d == '\t' || d == '\u{000c}';
            if is_space_delim {
                // 跳过空白，可选再跟 = 或 :
                while j < n && (chars[j] == ' ' || chars[j] == '\t' || chars[j] == '\u{000c}') {
                    j += 1;
                }
                if j < n && (chars[j] == '=' || chars[j] == ':') {
                    j += 1;
                    while j < n && (chars[j] == ' ' || chars[j] == '\t' || chars[j] == '\u{000c}')
                    {
                        j += 1;
                    }
                }
            } else {
                j += 1;
                while j < n && (chars[j] == ' ' || chars[j] == '\t' || chars[j] == '\u{000c}') {
                    j += 1;
                }
            }
            let value_raw: String = chars[j..].iter().collect();
            Some((unescape(&key_raw), unescape(&value_raw)))
        }
    }
}

/// 反转义 properties 文本：\t \n \r \f \\ \uXXXX，及任意 \x → x
fn unescape(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let n = chars.len();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < n {
        let c = chars[i];
        if c == '\\' && i + 1 < n {
            match chars[i + 1] {
                't' => {
                    out.push('\t');
                    i += 2;
                }
                'n' => {
                    out.push('\n');
                    i += 2;
                }
                'r' => {
                    out.push('\r');
                    i += 2;
                }
                'f' => {
                    out.push('\u{000c}');
                    i += 2;
                }
                'u' => {
                    if i + 5 < n {
                        let hex: String = chars[i + 2..i + 6].iter().collect();
                        if let Ok(v) = u32::from_str_radix(&hex, 16) {
                            if let Some(ch) = char::from_u32(v) {
                                out.push(ch);
                                i += 6;
                                continue;
                            }
                        }
                    }
                    // 非法 \u 序列按字面保留
                    out.push('\\');
                    i += 1;
                }
                other => {
                    out.push(other);
                    i += 2;
                }
            }
        } else {
            out.push(c);
            i += 1;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn props_basic_separators() {
        let m = parse_properties("a=1\nb: 2\nc 3\nd = 4\n");
        assert_eq!(m.get("a"), Some(&"1".to_string()));
        assert_eq!(m.get("b"), Some(&"2".to_string()));
        assert_eq!(m.get("c"), Some(&"3".to_string()));
        assert_eq!(m.get("d"), Some(&"4".to_string()));
    }

    #[test]
    fn props_comments_and_empty() {
        let m = parse_properties("# comment\n! also comment\na=1\n\n  # indent comment\n");
        assert_eq!(m.len(), 1);
        assert_eq!(m.get("a"), Some(&"1".to_string()));
    }

    #[test]
    fn props_value_keeps_inner_and_trailing_chars() {
        let m = parse_properties("url=http://a:8080/x\ntail=v \n");
        assert_eq!(m.get("url"), Some(&"http://a:8080/x".to_string()));
        assert_eq!(m.get("tail"), Some(&"v ".to_string()));
    }

    #[test]
    fn props_escapes() {
        let m = parse_properties(r#"msg=hello\tworld\n
path=C:\\dir\\file
code=\u4e2d\u6587
literal\:key=ok
"#);
        assert_eq!(m.get("msg"), Some(&"hello\tworld\n".to_string()));
        assert_eq!(m.get("path"), Some(&"C:\\dir\\file".to_string()));
        assert_eq!(m.get("code"), Some(&"中文".to_string()));
        assert_eq!(m.get("literal:key"), Some(&"ok".to_string()));
    }

    #[test]
    fn props_line_continuation() {
        let m = parse_properties("multi=part1\\\n    part2\nplain=x\n");
        assert_eq!(m.get("multi"), Some(&"part1part2".to_string()));
        assert_eq!(m.get("plain"), Some(&"x".to_string()));
    }

    #[test]
    fn props_duplicate_last_wins() {
        let m = parse_properties("k=first\nk=second\n");
        assert_eq!(m.get("k"), Some(&"second".to_string()));
    }

    #[test]
    fn props_escaped_trailing_backslash_not_continuation() {
        // 尾部两个反斜杠 → 偶数，非续行；值保留单个反斜杠
        let m = parse_properties("win=C:\\\\\n");
        assert_eq!(m.get("win"), Some(&"C:\\".to_string()));
    }

    #[test]
    fn yaml_nested_flatten() {
        let m = parse_side(
            "spring:\n  datasource:\n    url: jdbc:h2:mem:test\n  port: 8080\n",
            "左值",
        )
        .unwrap();
        assert_eq!(
            m.get("spring.datasource.url"),
            Some(&"jdbc:h2:mem:test".to_string())
        );
        assert_eq!(m.get("spring.port"), Some(&"8080".to_string()));
    }

    #[test]
    fn yaml_array_and_scalars() {
        let m = parse_side("items:\n  - a\n  - 2\nflag: true\nnone: null\npi: 3.5\n", "左值")
            .unwrap();
        assert_eq!(m.get("items[0]"), Some(&"a".to_string()));
        assert_eq!(m.get("items[1]"), Some(&"2".to_string()));
        assert_eq!(m.get("flag"), Some(&"true".to_string()));
        assert_eq!(m.get("none"), Some(&"null".to_string()));
        assert_eq!(m.get("pi"), Some(&"3.5".to_string()));
    }

    #[test]
    fn yaml_number_trailing_zero_normalized() {
        // 浮点整数值去尾零，与 properties 的 "3" 同值
        let m = parse_side("num:\n  count: 3.0\n", "左值").unwrap();
        assert_eq!(m.get("num.count"), Some(&"3".to_string()));
    }

    #[test]
    fn props_mixed_separators_not_treated_as_yaml() {
        // 混合 = / : 分隔符是常见 properties 写法，YAML 解析会失败，必须回落 properties
        let m = parse_side("a=1\nb: 2\nc 3\nd = 4\n", "左值").unwrap();
        assert_eq!(m.get("a"), Some(&"1".to_string()));
        assert_eq!(m.get("b"), Some(&"2".to_string()));
        assert_eq!(m.get("c"), Some(&"3".to_string()));
        assert_eq!(m.get("d"), Some(&"4".to_string()));
    }

    #[test]
    fn auto_detect_props_equals_style() {
        // a=b 在 YAML 中是纯标量，应回落 properties 解析
        let m = parse_side("a=b\nc.d=e\n", "左值").unwrap();
        assert_eq!(m.get("a"), Some(&"b".to_string()));
        assert_eq!(m.get("c.d"), Some(&"e".to_string()));
    }

    #[test]
    fn auto_detect_colon_style_same_for_both() {
        // `a: b` 同时是合法 YAML 与 properties，两种解析结果一致
        let m = parse_side("a: b\n", "左值").unwrap();
        assert_eq!(m.get("a"), Some(&"b".to_string()));
    }

    #[test]
    fn yaml_error_reports_line() {
        let err = parse_side("a:\n  b: [1,\n", "左值").unwrap_err();
        assert!(err.line >= 1);
        assert!(err.message.contains("解析失败"));
    }

    #[test]
    fn json_nested_flatten() {
        let m = parse_side(r#"{"a":1,"b":{"c":2,"d":[3,4]}}"#, "左值").unwrap();
        assert_eq!(m.get("a"), Some(&"1".to_string()));
        assert_eq!(m.get("b.c"), Some(&"2".to_string()));
        assert_eq!(m.get("b.d[0]"), Some(&"3".to_string()));
        assert_eq!(m.get("b.d[1]"), Some(&"4".to_string()));
    }

    #[test]
    fn json_scalar_types() {
        let m = parse_side(r#"{"s":"x","n":42,"f":3.5,"t":true,"f2":false,"nl":null}"#, "左值").unwrap();
        assert_eq!(m.get("s"), Some(&"x".to_string()));
        assert_eq!(m.get("n"), Some(&"42".to_string()));
        assert_eq!(m.get("f"), Some(&"3.5".to_string()));
        assert_eq!(m.get("t"), Some(&"true".to_string()));
        assert_eq!(m.get("f2"), Some(&"false".to_string()));
        assert_eq!(m.get("nl"), Some(&"null".to_string()));
    }

    #[test]
    fn json_number_trailing_zero_normalized() {
        let m = parse_side(r#"{"count":3.0}"#, "左值").unwrap();
        assert_eq!(m.get("count"), Some(&"3".to_string()));
    }

    #[test]
    fn json_error_reports_line() {
        let err = parse_side("{bad}", "左值").unwrap_err();
        assert!(err.message.contains("解析失败"));
        assert!(err.line >= 1);
    }

    #[test]
    fn compare_json_vs_props_aligned() {
        let l = r#"{"a.b":1}"#;
        let r = "a.b=1\n";
        let res = compare_kv(l, r).unwrap();
        assert!(res.changes.is_empty());
        assert_eq!(res.left_entries[0].key, "a.b");
        assert_eq!(res.right_entries[0].key, "a.b");
    }

    #[test]
    fn compare_json_vs_yaml_aligned() {
        let l = r#"{"spring":{"datasource":{"url":"jdbc:h2:mem:test"}}}"#;
        let r = "spring:\n  datasource:\n    url: jdbc:h2:mem:test\n";
        let res = compare_kv(l, r).unwrap();
        assert!(res.changes.is_empty());
    }

    #[test]
    fn json_array_root() {
        let m = parse_side(r#"[{"a":1},{"b":2}]"#, "左值").unwrap();
        assert_eq!(m.get("[0].a"), Some(&"1".to_string()));
        assert_eq!(m.get("[1].b"), Some(&"2".to_string()));
    }

    #[test]
    fn compare_added_removed_modified() {
        let l = "a=1\nb=2\nc=3\n";
        let r = "a=1\nb=20\nd=4\n";
        let res = compare_kv(l, r).unwrap();
        assert_eq!(res.changes.len(), 3);
        let by_key: BTreeMap<_, _> = res
            .changes
            .iter()
            .map(|c| (c.key.clone(), c.change.clone()))
            .collect();
        assert_eq!(by_key.get("b"), Some(&"modified".to_string()));
        assert_eq!(by_key.get("c"), Some(&"removed".to_string()));
        assert_eq!(by_key.get("d"), Some(&"added".to_string()));
    }

    #[test]
    fn compare_mixed_format_aligned() {
        // properties 的 a.b=1 与 YAML 嵌套 a.b: 1 对齐为同一 key，无变更
        let l = "a.b=1\n";
        let r = "a:\n  b: 1\n";
        let res = compare_kv(l, r).unwrap();
        assert!(res.changes.is_empty());
        assert_eq!(res.left_entries.len(), 1);
        assert_eq!(res.right_entries.len(), 1);
    }

    #[test]
    fn compare_entries_sorted_by_key() {
        let res = compare_kv("z=1\na=2\n", "m=3\n").unwrap();
        assert_eq!(res.left_entries[0].key, "a");
        assert_eq!(res.left_entries[1].key, "z");
        assert_eq!(res.right_entries[0].key, "m");
    }
}