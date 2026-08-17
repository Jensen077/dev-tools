/// 与 Rust 端 ParseError 对应的类型
export interface ParseError {
  message: string;
  line: number;
  column: number;
}

/** 类型守卫：invoke reject 的 unknown 收窄为 ParseError */
export function isParseError(e: unknown): e is ParseError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { message?: unknown }).message === "string" &&
    typeof (e as { line?: unknown }).line === "number" &&
    typeof (e as { column?: unknown }).column === "number"
  );
}

/// 与 Rust 端 JsonMatch 对应的类型
export interface JsonMatch {
  start: number;
  end: number;
  raw: string;
  value: unknown;
}

/// 与 Rust 端 DiffNode 对应的类型
export interface DiffNode {
  path: string;
  change: "added" | "removed" | "modified";
  left: unknown | null;
  right: unknown | null;
  children: DiffNode[];
}

/// 与 Rust 端 HttpResult 对应的类型
export interface HttpResult {
  status: number;
  status_text: string;
  headers: [string, string][];
  body: string;
  duration_ms: number;
}

/// 与 Rust 端 KvEntry 对应的类型
export interface KvEntry {
  key: string;
  value: string;
}

/// 与 Rust 端 KvChange 对应的类型
export interface KvChange {
  key: string;
  change: "added" | "removed" | "modified";
  left: string | null;
  right: string | null;
}

/// 与 Rust 端 CompareResult 对应的类型
export interface CompareResult {
  left_entries: KvEntry[];
  right_entries: KvEntry[];
  changes: KvChange[];
}
