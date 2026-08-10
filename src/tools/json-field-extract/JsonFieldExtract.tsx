import { useCallback, useMemo, useRef, useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { JsonOutput } from "../../components/JsonOutput";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useToastStore } from "../../store/toast";
import { ResizableSplit } from "../../components/ResizableSplit";
import "../tool.css";
import "./json-field-extract.css";

/// 解析路径为段序列，支持点路径与数组下标（如 a.b、items[0].name、a[0][1]）
function parseSegments(path: string): (string | number)[] {
  const segs: (string | number)[] = [];
  let cur = "";
  for (let i = 0; i < path.length; i++) {
    const c = path[i];
    if (c === "[") {
      if (cur) {
        segs.push(cur);
        cur = "";
      }
      const end = path.indexOf("]", i);
      if (end === -1) return [];
      const idx = path.slice(i + 1, end);
      if (!/^\d+$/.test(idx)) return [];
      segs.push(Number(idx));
      i = end;
    } else if (c === ".") {
      if (cur) {
        segs.push(cur);
        cur = "";
      }
    } else {
      cur += c;
    }
  }
  if (cur) segs.push(cur);
  return segs;
}

/// 递归平铺对象：嵌套对象展开为点路径（如 a.b），数组取首个元素展开为下标路径（如 items[0].name），数组整体也可作为叶子
function collectLeafPaths(value: unknown, prefix: string, push: (path: string) => void): void {
  if (value === null || typeof value !== "object") {
    push(prefix);
    return;
  }
  if (Array.isArray(value)) {
    push(prefix);
    if (value.length > 0) {
      collectLeafPaths(value[0], `${prefix}[0]`, push);
    }
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${k}` : k;
    collectLeafPaths(v, path, push);
  }
}

/// 类型守卫：非 null 且非数组的对象
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/// 按键路径取值：支持点路径与数组下标，缺失、越界或原型链成员（__proto__/constructor）一律返回 null
function pick(value: unknown, path: string): unknown {
  const segs = parseSegments(path);
  if (segs.length === 0) return null;
  let cur = value;
  for (const seg of segs) {
    if (typeof seg === "number") {
      if (!Array.isArray(cur) || seg < 0 || seg >= cur.length) return null;
      cur = cur[seg];
    } else {
      if (!isRecord(cur)) return null;
      if (!Object.prototype.hasOwnProperty.call(cur, seg)) return null;
      cur = cur[seg];
    }
  }
  return cur;
}

export function JsonFieldExtract() {
  const savedDraft = useAppStore((s) => s.drafts["json-field-extract"]) as Record<string, unknown> | undefined;
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [paths, setPaths] = useState<string[]>((savedDraft?.paths as string[]) ?? []);
  const [custom, setCustom] = useState((savedDraft?.custom as string) ?? "");
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  // 历史「加载」回填输入（勾选路径不恢复）
  useApplyHistory("json-field-extract", ({ input }) => setInput(input ?? ""));

  const loadFile = useCallback(async (file: File) => {
    setInput(await file.text());
  }, []);

  const { bindDrop, isDragging } = useFileDrop({ onFile: loadFile, accept: [".json", ".txt"] });

  // 扫描输入，收集所有叶子路径（供自动识别）
  const allPaths = useMemo(() => {
    try {
      const data = JSON.parse(input);
      if (!Array.isArray(data)) return [];
      const found = new Set<string>();
      for (const item of data) {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
          collectLeafPaths(item, "", (p) => p && found.add(p));
        }
      }
      return Array.from(found).sort();
    } catch {
      return [];
    }
  }, [input]);

  const selectedSet = useMemo(() => new Set(paths), [paths]);

  const togglePath = useCallback((p: string) => {
    setPaths((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }, []);

  const addCustom = useCallback(() => {
    const trimmed = custom.trim().replace(/^\.|\.$/g, "");
    if (trimmed && !paths.includes(trimmed)) {
      setPaths((prev) => [...prev, trimmed]);
    }
    setCustom("");
  }, [custom, paths]);

  const extract = useCallback(() => {
    setError(null);
    try {
      const data = JSON.parse(input);
      if (!Array.isArray(data)) {
        setError("输入必须是数组（JSON 数组）");
        setOutput(null);
        return;
      }
      const result = data.map((item) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
          const row: Record<string, unknown> = {};
          paths.forEach((p) => (row[p] = null));
          return row;
        }
        const row: Record<string, unknown> = {};
        paths.forEach((p) => (row[p] = pick(item, p)));
        return row;
      });
      setOutput(JSON.stringify(result, null, 2));
      addHistory({
        toolId: "json-field-extract",
        toolName: "字段提取",
        action: "提取字段",
        payload: { input },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOutput(null);
    }
  }, [input, paths]);

  const copy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showToast("已复制结果");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [output, showToast]);

  useSaveDraft("json-field-extract", { input, paths, custom });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" onClick={extract} disabled={paths.length === 0}>
          提取字段
        </button>
        <button className="btn" onClick={copy} disabled={!output}>
          复制结果
        </button>
        <span className="hint">已选 {paths.length} 个字段</span>
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>打开文件</button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => e.target.files?.[0] && e.target.files[0].text().then(setInput)}
        />
        <ToolHistory toolId="json-field-extract" />
      </div>
      {error && <div className="error-box">{error}</div>}
      {isDragging && <div className="drop-hint">松开以载入文件</div>}
      <div className="pane-title">字段选择（勾选自动识别字段，支持自定义点路径）</div>
      <div className="field-list-wrap">
        {allPaths.length === 0 ? (
          <div className="empty-state" style={{ flex: "none", padding: "12px 8px" }}>
            <span className="empty-icon">🗂</span>
            {input.trim() ? "未识别到可提取字段（输入需为对象数组）" : "输入数组后自动识别字段"}
          </div>
        ) : (
          allPaths.map((p) => (
            <label key={p} className="field-chip">
              <input type="checkbox" checked={selectedSet.has(p)} onChange={() => togglePath(p)} />
              <span>{p}</span>
            </label>
          ))
        )}
        <div className="custom-field">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="自定义路径（如 a.b.c），回车添加"
          />
          <button className="btn btn-sm" onClick={addCustom} disabled={!custom.trim()}>
            添加
          </button>
        </div>
      </div>
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">JSON 输入（对象数组）</div>
            <div className="drop-zone" {...bindDrop}>
              <JsonEditor value={input} onChange={setInput} />
            </div>
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">提取结果</div>
            <JsonOutput value={output ?? ""} />
          </div>
        }
      />
    </div>
  );
}

// 开发期自检：纯函数边界行为（原型链、数组下标、缺失字段）
if (import.meta.env.DEV) {
  const obj = { a: { b: 1 }, items: [{ name: "x", n: 9 }] };
  const assertEq = (actual: unknown, expect: unknown, label: string) => {
    if (JSON.stringify(actual) !== JSON.stringify(expect)) {
      throw new Error(`[JsonFieldExtract self-check] ${label}: 期望 ${JSON.stringify(expect)}，实际 ${JSON.stringify(actual)}`);
    }
  };
  assertEq(pick(obj, "a.b"), 1, "嵌套点路径");
  assertEq(pick(obj, "items[0].name"), "x", "数组下标路径");
  assertEq(pick(obj, "items.name"), null, "数组未下标");
  assertEq(pick(obj, "__proto__"), null, "原型链成员");
  assertEq(pick(obj, "constructor"), null, "内建成员");
  assertEq(pick(obj, "a.missing"), null, "缺失字段");
  assertEq(pick(obj, "a[0]"), null, "对象按下标");
  assertEq(pick(obj, "a..b"), 1, "空段路径容错");
  const leaves: string[] = [];
  collectLeafPaths(obj, "", (p) => leaves.push(p));
  assertEq(leaves.sort(), ["a.b", "items", "items[0].n", "items[0].name"], "平铺路径");
  console.log("[JsonFieldExtract] 自检通过");
}
