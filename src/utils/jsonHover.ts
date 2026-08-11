/** JSON 悬停预览：单遍扫描文本，记录每个对象 key 的起止区间与对应 value 区间 */

export interface JsonKeySpan {
  /** key 原始文本（不含引号） */
  key: string;
  /** key 起始引号偏移 */
  keyStart: number;
  /** key 结束引号之后（即冒号前）偏移 */
  keyEnd: number;
  /** value 起始偏移 */
  valueStart: number;
  /** value 结束偏移（独占，值为标量时指向其后第一个分隔符/空白） */
  valueEnd: number;
}

/** 跳到 value 区间的结尾：递归处理嵌套对象/数组与字符串转义 */
function scanValue(text: string, start: number, out: JsonKeySpan[]): number {
  let i = start;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  const c = text[i];
  if (c === "{") {
    const end = scanObject(text, i, out);
    return end;
  }
  if (c === "[") {
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j]!)) j++;
    if (text[j] === "]") return j + 1;
    while (j < text.length) {
      j = scanValue(text, j, out);
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (text[j] === ",") {
        j++;
        continue;
      }
      if (text[j] === "]") return j + 1;
      break;
    }
    return j;
  }
  if (c === '"') {
    let j = i + 1;
    while (j < text.length) {
      const ch = text[j];
      if (ch === "\\") {
        j += 2;
        continue;
      }
      if (ch === '"') return j + 1;
      j++;
    }
    return j;
  }
  // 数字/true/false/null：读到分隔符或空白为止
  let j = i;
  while (j < text.length && !/[,\]\s]/.test(text[j]!)) j++;
  return j;
}

/** 扫描一个对象字面量（自 `{` 起），记录所有 key，返回对象结束偏移（`}` 之后） */
function scanObject(text: string, start: number, out: JsonKeySpan[]): number {
  let i = start + 1;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (text[i] === "}") return i + 1;
    if (text[i] !== '"') {
      // 异常输入防御：跳过一字符继续
      i++;
      continue;
    }
    const keyStart = i;
    i++;
    let key = "";
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\") {
        key += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') {
        i++;
        break;
      }
      key += ch;
      i++;
    }
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (text[i] !== ":") {
      // 非 key 字符串（异常时），跳过继续
      i++;
      continue;
    }
    i++;
    const valueStart = i;
    const valueEnd = scanValue(text, i, out);
    out.push({ key, keyStart, keyEnd: i, valueStart, valueEnd });
    i = valueEnd;
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (text[i] === ",") {
      i++;
      continue;
    }
    if (text[i] === "}") return i + 1;
    i++;
  }
  return i;
}

/** 扫描整段 JSON 文本，返回所有对象 key 的区间（根为数组时仍递归收集元素对象内的 key） */
export function scanJsonKeys(text: string): JsonKeySpan[] {
  const out: JsonKeySpan[] = [];
  const trimmed = text.trim();
  if (!trimmed) return out;
  if (trimmed.startsWith("[")) {
    // 数组：扫描第一个元素，可能为对象
    let j = 1;
    while (j < text.length && /\s/.test(text[j]!)) j++;
    if (text[j] === "]") return out;
    scanValue(text, j, out);
    return out;
  }
  if (trimmed.startsWith("{")) {
    scanObject(text, 0, out);
  }
  return out;
}

/** 光标偏移命中的最深 key（区间包含 offset 且 keyStart 最大者） */
export function findKeyAt(spans: JsonKeySpan[], offset: number): JsonKeySpan | null {
  let best: JsonKeySpan | null = null;
  for (const s of spans) {
    if (offset >= s.keyStart && offset <= s.valueEnd) {
      if (!best || s.keyStart > best.keyStart) best = s;
    }
  }
  return best;
}

// 开发期自检：区间扫描与命中逻辑
if (import.meta.env.DEV) {
  const eq = (actual: unknown, expect: unknown, label: string) => {
    if (JSON.stringify(actual) !== JSON.stringify(expect)) {
      throw new Error(`[jsonHover self-check] ${label}: 期望 ${JSON.stringify(expect)}，实际 ${JSON.stringify(actual)}`);
    }
  };
  const text = JSON.stringify(
    {
      a: { b: 1, c: [1, { d: "x" }] },
      e: "hello",
      f: [1, 2, 3],
    },
    null,
    2,
  );
  const spans = scanJsonKeys(text);
  eq(
    spans.map((s) => s.key).sort(),
    ["a", "b", "c", "d", "e", "f"].sort(),
    "收集全部 key（含嵌套）",
  );
  const keyA = spans.find((s) => s.key === "a")!;
  const keyE = spans.find((s) => s.key === "e")!;
  eq(findKeyAt(spans, keyA.keyStart + 1)?.key, "a", "悬停 key 命中自身");
  eq(findKeyAt(spans, keyA.valueStart + 5)?.key, "a", "悬停 value 区间命中父 key");
  eq(findKeyAt(spans, keyE.keyEnd - 1)?.key, "e", "悬停 key 尾部命中");
  eq(findKeyAt(spans, keyA.keyStart)?.key, "a", "根起始命中首个 key");
  eq(findKeyAt(spans, text.length - 1), null, "文末非 value 区不命中");
  console.log("[jsonHover] 自检通过");
}
