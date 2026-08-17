import { invoke } from "@tauri-apps/api/core";
import type { DiffNode, JsonMatch, ParseError } from "../types";
import { compareProps as comparePropsJs } from "./props";

/** 是否运行在 Tauri 桌面环境（存在 __TAURI_INTERNALS__ 全局注入）。
 *  浏览器（含 GitHub Pages）无此全局，invoke 调用会抛错，故需走 JS 降级。 */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// ===== JS 降级实现：与 Rust 命令返回结构逐字段对齐 =====
// 对应 src-tauri/src/{format,extract,diff}.rs 的纯逻辑，供网页版使用。

/** 递归排序对象键。Rust serde_json 默认 BTreeMap（字母序输出），
 *  JS JSON.stringify 保留插入序，需显式排序才能与桌面输出一致。 */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortKeys(src[k]);
    return out;
  }
  return v;
}

/** JSON.parse 的 SyntaxError → ParseError（行列 1-based，对齐 serde_json）。
 *  V8 消息含 "position N"（0-based 字符偏移），WebKit 含 "line X column Y"，
 *  分别提取并换算；都失败时回落 1:1。 */
function jsParseError(e: unknown, input: string): ParseError {
  const msg = e instanceof Error ? e.message : String(e);
  let line = 1;
  let column = 1;
  const posMatch = msg.match(/position (\d+)/);
  if (posMatch) {
    const pos = parseInt(posMatch[1]!, 10);
    for (let p = 0; p < pos && p < input.length; p++) {
      if (input[p] === "\n") {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
  } else {
    const lc = msg.match(/line (\d+) column (\d+)/);
    if (lc) {
      line = parseInt(lc[1]!, 10);
      column = parseInt(lc[2]!, 10);
    }
  }
  return { message: msg, line, column };
}

/** 把 2 空格 pretty JSON 重新缩进为 indent 宽度（移植 format.rs:reindent）。 */
function reindent(s: string, indent: number): string {
  if (indent === 2) return s;
  const unit = " ".repeat(indent);
  return s
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      const depth = Math.floor((line.length - trimmed.length) / 2);
      // 闭合括号行与开启块同缩进，depth 直接复用（与 Rust reindent 对齐）
      return unit.repeat(depth) + trimmed;
    })
    .join("\n");
}

/** 对应 fmt_json(input, indent)：indent clamp 2..8，2 空格 pretty 后 reindent。 */
function fmtJson(input: string, indent: number): string {
  const n = Math.max(2, Math.min(8, Math.floor(indent)));
  let v: unknown;
  try {
    v = JSON.parse(input);
  } catch (e) {
    throw jsParseError(e, input);
  }
  const pretty = JSON.stringify(sortKeys(v), null, 2);
  return reindent(pretty, n);
}

/** 对应 min_json(input)。 */
function minifyJson(input: string): string {
  let v: unknown;
  try {
    v = JSON.parse(input);
  } catch (e) {
    throw jsParseError(e, input);
  }
  return JSON.stringify(sortKeys(v));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** 递归比对两个 JSON 值，返回 diff 树（移植 diff.rs:diff_at）。
 *  Rust 的 None（无变更）对应 JS 返回 null。 */
function diffAt(path: string, left: unknown, right: unknown): DiffNode | null {
  if (isObject(left) && isObject(right)) {
    // 对象键取并集后排序，对齐 Rust BTreeMap 的字母序遍历
    const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
    const children: DiffNode[] = [];
    for (const k of keys) {
      const cp = `${path}.${k}`;
      const inL = k in left;
      const inR = k in right;
      if (inL && inR) {
        const n = diffAt(cp, left[k], right[k]);
        if (n) children.push(n);
      } else if (inL) {
        children.push({ path: cp, change: "removed", left: left[k] ?? null, right: null, children: [] });
      } else {
        children.push({ path: cp, change: "added", left: null, right: right[k] ?? null, children: [] });
      }
    }
    if (children.length === 0) return null;
    return { path, change: "modified", left, right, children };
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const len = Math.max(left.length, right.length);
    const children: DiffNode[] = [];
    for (let i = 0; i < len; i++) {
      const cp = `${path}[${i}]`;
      if (i < left.length && i < right.length) {
        const n = diffAt(cp, left[i], right[i]);
        if (n) children.push(n);
      } else if (i < left.length) {
        children.push({ path: cp, change: "removed", left: left[i] ?? null, right: null, children: [] });
      } else {
        children.push({ path: cp, change: "added", left: null, right: right[i] ?? null, children: [] });
      }
    }
    if (children.length === 0) return null;
    return { path, change: "modified", left, right, children };
  }
  // 标量或类型错配：JSON 无 NaN，=== 与 serde_json Value == 等价
  return left === right ? null : { path, change: "modified", left, right, children: [] };
}

/** 对应 compare_json(left, right)。解析失败前缀「左值/右值解析失败」对齐 commands.rs。 */
function compareJson(left: string, right: string): DiffNode {
  let l: unknown;
  let r: unknown;
  try {
    l = sortKeys(JSON.parse(left));
  } catch (e) {
    const pe = jsParseError(e, left);
    const err: ParseError = { message: `左值解析失败: ${pe.message}`, line: pe.line, column: pe.column };
    throw err;
  }
  try {
    r = sortKeys(JSON.parse(right));
  } catch (e) {
    const pe = jsParseError(e, right);
    const err: ParseError = { message: `右值解析失败: ${pe.message}`, line: pe.line, column: pe.column };
    throw err;
  }
  // 根节点无变更时退化为 Modified 空子节点，对齐 diff.rs:diff_json 的 unwrap_or_else
  return (
    diffAt("$", l, r) ?? {
      path: "$",
      change: "modified",
      left: l,
      right: r,
      children: [],
    }
  );
}

// ===== 日志提取（移植 extract.rs） =====

/** 找到与 start 处括号配平的结束位置（引号与转义感知），返回结束位置（不含）。
 *  MAX_SCAN 限制单次扫描窗口，避免海量孤立括号导致 O(n²) 退化。 */
function findBalancedEnd(input: string, start: number): number | null {
  const MAX_SCAN = 256 * 1024;
  const n = Math.min(input.length, start + MAX_SCAN);
  let depth = 0;
  let inString = false;
  let i = start;
  while (i < n) {
    const b = input[i];
    if (inString) {
      if (b === "\\") {
        if (i + 1 < n) i++;
      } else if (b === '"') {
        inString = false;
      }
    } else if (b === '"') {
      inString = true;
    } else if (b === "{" || b === "[") {
      depth++;
    } else if (b === "}" || b === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return null;
}

/** 找到 start 处引号的配平结束引号位置（含转义处理）。 */
function findClosingQuote(input: string, start: number): number | null {
  const n = input.length;
  let i = start + 1;
  while (i < n) {
    const b = input[i];
    if (b === "\\") {
      if (i + 1 < n) i++;
    } else if (b === '"') {
      return i + 1;
    }
    i++;
  }
  return null;
}

/** 剥离外层引号并对内容做 JSON 反转义（移植 extract.rs:strip_and_unescape）。
 *  内容不含反斜杠时跳过（无反转义必要）；否则把整段当 JSON 字符串值解析得到反转义结果。 */
function stripAndUnescape(s: string): string | null {
  if (s.length < 2 || s[0] !== '"' || s[s.length - 1] !== '"') return null;
  const inner = s.slice(1, s.length - 1);
  if (!inner.includes("\\")) return null;
  try {
    return JSON.parse(s) as string;
  } catch {
    return null;
  }
}

/** 从 start 位置尝试匹配一个 JSON 片段。
 *  unescape 为 true 时，先剥离外层引号 + JSON 反转义再解析。 */
function tryMatch(input: string, start: number, unescape: boolean): JsonMatch | null {
  const startChar = input[start];
  const end = startChar === '"' ? findClosingQuote(input, start) : findBalancedEnd(input, start);
  if (end === null) return null;
  const raw = input.slice(start, end);
  if (unescape) {
    const inner = stripAndUnescape(raw);
    if (inner === null) return null;
    const trimmed = inner.trimStart();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
      return { start, end, raw, value: sortKeys(JSON.parse(trimmed)) };
    } catch {
      return null;
    }
  }
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return { start, end, raw, value: sortKeys(JSON.parse(trimmed)) };
  } catch {
    return null;
  }
}

/** 对应 extract_json_cmd(input)：从日志文本中扫描提取 JSON 片段。
 *  注：start/end 为 JS 字符串索引（UTF-16），Rust 为字节偏移，
 *  非 ASCII 日志的展示数字会略有出入，不影响提取结果。 */
function extractJsonCmd(input: string): JsonMatch[] {
  const matches: JsonMatch[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const ch = input[i];
    if (ch === "{" || ch === "[") {
      // 优先尝试直接解析，失败再尝试反转义解析
      let m = tryMatch(input, i, false);
      if (m) {
        i = m.end;
        matches.push(m);
        continue;
      }
      m = tryMatch(input, i, true);
      if (m) {
        i = m.end;
        matches.push(m);
        continue;
      }
      i++;
    } else if (ch === '"') {
      // 引号开头：可能包裹着转义 JSON 字符串
      const m = tryMatch(input, i, true);
      if (m) {
        i = m.end;
        matches.push(m);
        continue;
      }
      i++;
    } else {
      i++;
    }
  }
  return matches;
}

// ===== 分发 =====

/** 命令名 → JS 实现。未注册的命令（如 run_curl_script_cmd）网页版抛错。 */
const jsImpls: Record<string, (a: Record<string, unknown>) => unknown> = {
  fmt_json: (a) => fmtJson(a.input as string, a.indent as number),
  min_json: (a) => minifyJson(a.input as string),
  compare_json: (a) => compareJson(a.left as string, a.right as string),
  compare_props: (a) => comparePropsJs(a.left as string, a.right as string),
  extract_json_cmd: (a) => extractJsonCmd(a.input as string),
};

/** 统一入口：桌面走 Rust invoke，网页走 JS 降级实现。
 *  桌面环境 __TAURI_INTERNALS__ 存在时原样转发 invoke，语义与改动前完全一致。 */
export async function backend<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (isDesktop()) return invoke<T>(cmd, args);
  const impl = jsImpls[cmd];
  if (!impl) throw new Error(`网页版不支持该命令: ${cmd}`);
  return impl(args) as T;
}
