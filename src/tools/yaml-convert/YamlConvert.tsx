import { useCallback, useMemo, useRef, useState } from "react";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import { JsonEditor } from "../../components/JsonEditor";
import { ResizableSplit } from "../../components/ResizableSplit";
import { ToolHistory } from "../../components/ToolHistory";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useToastStore } from "../../store/toast";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { useFileDrop } from "../../hooks/useFileDrop";
import { readFileAsUtf8 } from "../../utils/fileEncoding";
import { looksLikeJson, looksLikeYaml, parseProperties, flattenYamlValue } from "../../utils/props";
import type { ParseError } from "../../types";
import "../tool.css";

type Format = "json" | "yaml" | "properties";

const FORMATS: { id: Format; label: string }[] = [
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "properties", label: "Properties" },
];

function detectFormat(input: string): Format | null {
  if (!input.trim()) return null;
  if (looksLikeJson(input)) return "json";
  if (looksLikeYaml(input)) return "yaml";
  return "properties";
}

/** 将扁平键值对按点号路径还原为嵌套对象（含 [index] 数组索引） */
function unflatten(map: Map<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of map) {
    const parts = key.split(".");
    let current: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      current = ensureContainer(current, parts[i]!);
    }
    setLeaf(current, parts[parts.length - 1]!, tryParseValue(value));
  }
  return result;
}

/** 确保中间路径容器存在（对象或数组），返回下一层容器 */
function ensureContainer(parent: Record<string, unknown>, segment: string): Record<string, unknown> {
  const m = segment.match(/^(.+?)\[(\d+)\]$/);
  if (m) {
    const k = m[1]!;
    const idx = Number(m[2]);
    if (!parent[k]) parent[k] = [];
    const arr = parent[k] as unknown[];
    if (!arr[idx] || typeof arr[idx] !== "object") arr[idx] = {};
    return arr[idx] as Record<string, unknown>;
  }
  if (!parent[segment] || typeof parent[segment] !== "object" || Array.isArray(parent[segment])) {
    parent[segment] = {};
  }
  return parent[segment] as Record<string, unknown>;
}

/** 设置叶子值 */
function setLeaf(parent: Record<string, unknown>, segment: string, value: unknown): void {
  const m = segment.match(/^(.+?)\[(\d+)\]$/);
  if (m) {
    const k = m[1]!;
    const idx = Number(m[2]);
    if (!parent[k]) parent[k] = [];
    (parent[k] as unknown[])[idx] = value;
    return;
  }
  parent[segment] = value;
}

/** 尝试将字符串转为数字/布尔/null，失败则保留原字符串 */
function tryParseValue(v: string): string | number | boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(v) && !/^0\d/.test(v)) {
    return Number(v);
  }
  return v;
}

function convert(input: string, from: Format, to: Format): string {
  if (from === to) return input;

  let obj: unknown;
  try {
    if (from === "json") {
      obj = JSON.parse(input);
    } else if (from === "yaml") {
      obj = yamlLoad(input);
    } else {
      const map = parseProperties(input);
      obj = unflatten(map);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const err: ParseError = { message: `输入解析失败: ${msg}`, line: 1, column: 1 };
    throw err;
  }

  if (to === "json") {
    return JSON.stringify(obj, null, 2);
  } else if (to === "yaml") {
    return yamlDump(obj, { indent: 2, lineWidth: -1, noRefs: true });
  } else {
    const flat = new Map<string, string>();
    flattenYamlValue(obj, "", flat);
    const lines: string[] = [];
    for (const [k, v] of flat) {
      lines.push(`${k}=${escapePropsValue(v)}`);
    }
    return lines.join("\n") + "\n";
  }
}

function escapePropsValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

function formatToLanguage(f: Format | null): string {
  if (f === "json") return "json";
  if (f === "yaml") return "yaml";
  if (f === "properties") return "ini";
  return "text";
}

export function YamlConvert() {
  const savedDraft = useAppStore((s) => s.drafts["yaml-convert"]) as { input?: string; outputFormat?: Format } | undefined;
  const [input, setInput] = useState(savedDraft?.input ?? "");
  const [output, setOutput] = useState("");
  const [outputFormat, setOutputFormat] = useState<Format>(savedDraft?.outputFormat ?? "json");
  const [error, setError] = useState<ParseError | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  const inputFormat = useMemo(() => detectFormat(input), [input]);

  useApplyHistory("yaml-convert", ({ input: histInput, outputFormat: histFormat }) => {
    if (histInput) setInput(histInput as string);
    if (histFormat) setOutputFormat(histFormat as Format);
  });

  const run = useCallback(() => {
    const from = detectFormat(input);
    if (!from) {
      setOutput("");
      setError(null);
      return;
    }
    try {
      const result = convert(input, from, outputFormat);
      setOutput(result);
      setError(null);
      addHistory({
        toolId: "yaml-convert",
        toolName: "YAML 互转",
        action: `${from.toUpperCase()} → ${outputFormat.toUpperCase()}`,
        payload: { input, outputFormat },
      });
    } catch (e) {
      setError(e as ParseError);
    }
  }, [input, outputFormat, addHistory]);

  const copy = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showToast("已复制结果");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "复制失败", "error");
    }
  }, [output, showToast]);

  const swap = useCallback(() => {
    if (!output) return;
    setInput(output);
    setOutput("");
  }, [output]);

  const loadFile = useCallback(async (file: File) => {
    setInput(await readFileAsUtf8(file));
  }, []);

  const formatInput = useCallback(() => {
    const fmt = detectFormat(input);
    if (!fmt) return;
    try {
      if (fmt === "json") {
        setInput(JSON.stringify(JSON.parse(input), null, 2));
      } else if (fmt === "yaml") {
        setInput(yamlDump(yamlLoad(input), { indent: 2, lineWidth: -1, noRefs: true }));
      } else {
        const map = parseProperties(input);
        const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
        setInput(sorted.map(([k, v]) => `${k}=${escapePropsValue(v)}`).join("\n") + "\n");
      }
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError({ message: `格式化失败: ${msg}`, line: 1, column: 1 });
    }
  }, [input]);

  const copyInput = useCallback(async () => {
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input);
      showToast("已复制输入");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "复制失败", "error");
    }
  }, [input, showToast]);

  const fileRef = useRef<HTMLInputElement>(null);

  const { bindDrop, isDragging } = useFileDrop({ onFile: loadFile, accept: [".json", ".yml", ".yaml", ".properties", ".txt"] });

  useSaveDraft("yaml-convert", { input, outputFormat });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <span className="format-badge">
          输入格式: {inputFormat ? <span className="badge">{inputFormat.toUpperCase()}</span> : <span className="hint">—</span>}
        </span>
        <span className="toolbar-sep" />
        <span className="format-badge">输出格式:</span>
        {FORMATS.map((f) => (
          <label key={f.id} className="radio-label">
            <input
              type="radio"
              name="outputFormat"
              checked={outputFormat === f.id}
              onChange={() => setOutputFormat(f.id)}
            />
            {f.label}
          </label>
        ))}
        <button className="btn btn-primary" data-hotkey="run" onClick={run} disabled={!input}>
          转换
          <span className="btn-hotkey">⌘↵</span>
        </button>
        <button className="btn" onClick={formatInput} disabled={!input} title="美化当前输入内容">
          格式化
        </button>
        <button className="btn" data-hotkey="copy" onClick={copy} disabled={!output}>
          复制结果
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <button className="btn" onClick={swap} disabled={!output} title="将输出作为新输入">
          交换 ⇄
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          打开文件
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".json,.yml,.yaml,.properties,.txt"
          onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
        />
        <button className="btn" onClick={() => { setInput(""); setOutput(""); setError(null); }}>
          清空
        </button>
        <ToolHistory toolId="yaml-convert" />
      </div>
      <ResizableSplit
        left={
          <div className="pane" {...bindDrop} style={isDragging ? { outline: "2px dashed var(--blue)" } : undefined}>
            <div className="pane-title">
              输入
              <span className="spacer" />
              <button className="btn btn-sm" onClick={copyInput} disabled={!input}>复制</button>
            </div>
            <JsonEditor value={input} onChange={setInput} language={formatToLanguage(inputFormat)} />
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">
              输出
              <span className="spacer" />
              <button className="btn btn-sm" onClick={copy} disabled={!output}>复制</button>
            </div>
            <JsonEditor value={output} onChange={setOutput} language={formatToLanguage(outputFormat)} />
          </div>
        }
      />
      {error && (
        <div className="error-box">
          {error.message}
          {error.line > 0 && ` (第 ${error.line} 行, 第 ${error.column} 列)`}
        </div>
      )}
    </div>
  );
}