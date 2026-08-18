import { load as yamlLoad, YAMLException } from "js-yaml";
import type { CompareResult, KvChange, ParseError } from "../types";

// 配置文件值比对（移植 src-tauri/src/props.rs 的纯逻辑），供网页版降级使用。

/** 比较器：与 Rust String::cmp（UTF-8 字节序）对齐，而非 locale 排序 */
function cmpKey(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 判断行尾是否为「未转义的反斜杠」（续行标记）：尾部反斜杠数为奇数 */
function endsWithUnescapedBackslash(s: string): boolean {
  let n = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === "\\") n++;
    else break;
  }
  return n % 2 === 1;
}

/** 注释行：首个非空白字符为 # 或 ! */
function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("#") || t.startsWith("!");
}

/** 反转义 properties 文本：\t \n \r \f \\ \uXXXX，及任意 \x → x */
function unescapeProps(s: string): string {
  const chars = Array.from(s);
  const n = chars.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const c = chars[i]!;
    if (c === "\\" && i + 1 < n) {
      const next = chars[i + 1]!;
      if (next === "t") {
        out += "\t";
        i += 2;
      } else if (next === "n") {
        out += "\n";
        i += 2;
      } else if (next === "r") {
        out += "\r";
        i += 2;
      } else if (next === "f") {
        out += "\f";
        i += 2;
      } else if (next === "u") {
        const hex = chars.slice(i + 2, i + 6).join("");
        if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        // 非法 \u 序列按字面保留
        out += "\\";
        i += 1;
      } else {
        out += next;
        i += 2;
      }
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** 按 Java Properties 规则切分一行（已去除续行与注释）为 key/value（对齐 split_key_value） */
function splitKeyValue(line: string): [string, string] | null {
  line = line.trimStart();
  if (!line) return null;
  const chars = Array.from(line);
  const n = chars.length;
  let i = 0;
  let delim: string | null = null;
  while (i < n) {
    const c = chars[i]!;
    if (c === "\\") {
      i += Math.min(2, n - i);
      continue;
    }
    if (c === "=" || c === ":" || c === " " || c === "\t" || c === "\f") {
      delim = c;
      break;
    }
    i += 1;
  }
  const keyRaw = chars.slice(0, i).join("");
  if (delim === null) return [unescapeProps(keyRaw), ""];
  let j = i;
  const isSpaceDelim = delim === " " || delim === "\t" || delim === "\f";
  if (isSpaceDelim) {
    while (j < n && (chars[j] === " " || chars[j] === "\t" || chars[j] === "\f")) j++;
    if (j < n && (chars[j] === "=" || chars[j] === ":")) {
      j++;
      while (j < n && (chars[j] === " " || chars[j] === "\t" || chars[j] === "\f")) j++;
    }
  } else {
    j++;
    while (j < n && (chars[j] === " " || chars[j] === "\t" || chars[j] === "\f")) j++;
  }
  const valueRaw = chars.slice(j).join("");
  return [unescapeProps(keyRaw), unescapeProps(valueRaw)];
}

/** 解析 .properties 文本为键值映射（重复 key 后者覆盖；键按字母序返回） */
export function parseProperties(input: string): Map<string, string> {
  const map = new Map<string, string>();
  let logical = "";
  let inLine = false;
  for (const raw of input.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (inLine) {
      logical += line.trimStart();
    } else {
      if (isCommentLine(line)) continue;
      logical = line;
    }
    if (endsWithUnescapedBackslash(logical)) {
      logical = logical.slice(0, -1);
      inLine = true;
      continue;
    }
    inLine = false;
    const kv = splitKeyValue(logical);
    if (kv) map.set(kv[0], kv[1]);
    logical = "";
  }
  return map;
}

/** 文本是否带明确的 YAML 结构特征（用于决定走 YAML 解析还是回落 properties）。
 *  properties 的常规形态（`=` 分隔、单层 `key: value`）不会命中这些特征。 */
export function looksLikeYaml(input: string): boolean {
  let prev: string | null = null;
  for (const raw of input.split("\n")) {
    const t = raw.trimStart();
    if (!t || isCommentLine(t)) continue;
    if (t.startsWith("---") || t.startsWith("...")) return true;
    if (t.startsWith("- ") || t.startsWith("? ")) return true;
    // 行尾冒号：嵌套块开始或空值（`a:` 带子键）
    if (t.endsWith(":")) return true;
    // 带缩进的键值行：嵌套 YAML 结构。排除 properties 续行（上一非空行以反斜杠结尾）
    if (raw.startsWith(" ") || raw.startsWith("\t")) {
      if (prev && !prev.endsWith("\\")) return true;
    }
    prev = t;
  }
  return false;
}

/** 把 JS 标量统一转字符串：null → "null"、数字/布尔经 String 归一（3.0 → "3"） */
function scalarToString(v: unknown): string {
  if (v === null || v === undefined) return "null";
  return String(v);
}

/** 递归展平 YAML 值树为扁平 key → value（对齐 flatten_yaml） */
export function flattenYamlValue(v: unknown, prefix: string, out: Map<string, string>): void {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (val !== null && typeof val === "object") {
        flattenYamlValue(val, path, out);
      } else {
        out.set(path, scalarToString(val));
      }
    }
  } else if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const path = `${prefix}[${i}]`;
      const item = v[i];
      if (item !== null && typeof item === "object") {
        flattenYamlValue(item, path, out);
      } else {
        out.set(path, scalarToString(item));
      }
    }
  } else {
    out.set(prefix, scalarToString(v));
  }
}

/** 文本首非空白字符是否为 `{` 或 `[`（JSON 格式） */
export function looksLikeJson(input: string): boolean {
  const t = input.trimStart();
  return t.startsWith("{") || t.startsWith("[");
}

/** 解析 JSON 文本为扁平键值映射（对齐 flatten_json） */
function parseJson(input: string, label: string): Map<string, string> {
  let v: unknown;
  try {
    v = JSON.parse(input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    let line = 1;
    let column = 1;
    const posMatch = msg.match(/position (\d+)/);
    if (posMatch) {
      const pos = parseInt(posMatch[1]!, 10);
      for (let p = 0; p < pos && p < input.length; p++) {
        if (input[p] === "\n") { line++; column = 1; }
        else { column++; }
      }
    }
    const err: ParseError = { message: `${label}解析失败: ${msg}`, line, column };
    throw err;
  }
  const out = new Map<string, string>();
  flattenYamlValue(v, "", out);
  return out;
}

/** 解析一侧输入为扁平键值映射，自动识别格式（JSON 优先，对齐 parse_side） */
function parseSide(input: string, label: string): Map<string, string> {
  if (looksLikeJson(input)) {
    return parseJson(input, label);
  }
  if (!looksLikeYaml(input)) {
    return parseProperties(input);
  }
  let v: unknown;
  try {
    v = yamlLoad(input);
  } catch (e) {
    const err: ParseError = {
      message: `${label}解析失败: ${e instanceof Error ? e.message : String(e)}`,
      line: (e instanceof YAMLException && e.mark ? e.mark.line : 0) + 1,
      column: (e instanceof YAMLException && e.mark ? e.mark.column : 0) + 1,
    };
    throw err;
  }
  const out = new Map<string, string>();
  flattenYamlValue(v, "", out);
  return out;
}

/** 对应 compare_kv(left, right)：解析两侧为扁平键值后按键 diff */
export function compareProps(left: string, right: string): CompareResult {
  const l = parseSide(left, "左值");
  const r = parseSide(right, "右值");
  const changes: KvChange[] = [];
  for (const [k, lv] of l) {
    if (r.has(k)) {
      const rv = r.get(k)!;
      if (rv !== lv) changes.push({ key: k, change: "modified", left: lv, right: rv });
    } else {
      changes.push({ key: k, change: "removed", left: lv, right: null });
    }
  }
  for (const [k, rv] of r) {
    if (!l.has(k)) changes.push({ key: k, change: "added", left: null, right: rv });
  }
  changes.sort((a, b) => cmpKey(a.key, b.key));
  const toEntries = (m: Map<string, string>) =>
    Array.from(m, ([key, value]) => ({ key, value })).sort((a, b) => cmpKey(a.key, b.key));
  return { left_entries: toEntries(l), right_entries: toEntries(r), changes };
}