import { useMemo, useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { useToastStore } from "../../store/toast";

interface ParamConvertDraft {
  input?: string;
  delimiter?: Delimiter;
  customDelimiter?: string;
  format?: Format;
  customPrefix?: string;
  customSeparator?: string;
  customSuffix?: string;
}
import { ResizableSplit } from "../../components/ResizableSplit";
import "../tool.css";

type Delimiter = "newline" | "comma" | "space" | "tab" | "semicolon" | "custom";
type Format = "double" | "single" | "json" | "bracket" | "custom";

const DELIMITERS: { id: Delimiter; label: string; value: string }[] = [
  { id: "newline", label: "换行", value: "\n" },
  { id: "comma", label: "逗号", value: "," },
  { id: "space", label: "空格", value: " " },
  { id: "tab", label: "制表符", value: "\t" },
  { id: "semicolon", label: "分号", value: ";" },
];

const FORMATS: { id: Format; label: string }[] = [
  { id: "double", label: '"1","2","3"' },
  { id: "single", label: "'1','2','3'" },
  { id: "json", label: '["1","2","3"]' },
  { id: "bracket", label: "(1,2,3)" },
  { id: "custom", label: "自定义" },
];

function convert(
  input: string,
  delimiter: Delimiter,
  customDelimiter: string,
  format: Format,
  customPrefix: string,
  customSeparator: string,
  customSuffix: string,
): string {
  if (!input.trim()) return "";
  const delim = delimiter === "custom" ? (customDelimiter || ",") : DELIMITERS.find((d) => d.id === delimiter)?.value ?? "\n";
  const items = input.split(delim).map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return "";
  switch (format) {
    case "double":
      return items.map((v) => `"${v}"`).join(",");
    case "single":
      return items.map((v) => `'${v}'`).join(",");
    case "json":
      return JSON.stringify(items);
    case "bracket":
      return `(${items.join(",")})`;
    case "custom":
      return items.map((v) => `${customPrefix}${v}${customSuffix}`).join(customSeparator);
    default:
      return items.join(",");
  }
}

export function ParamConvert() {
  const savedDraft = useAppStore((s) => s.drafts["param-convert"]) as ParamConvertDraft | undefined;
  const [input, setInput] = useState(savedDraft?.input ?? "");
  const [delimiter, setDelimiter] = useState<Delimiter>(savedDraft?.delimiter ?? "newline");
  const [customDelimiter, setCustomDelimiter] = useState(savedDraft?.customDelimiter ?? ",");
  const [format, setFormat] = useState<Format>(savedDraft?.format ?? "double");
  const [customPrefix, setCustomPrefix] = useState(savedDraft?.customPrefix ?? '"');
  const [customSeparator, setCustomSeparator] = useState(savedDraft?.customSeparator ?? ",");
  const [customSuffix, setCustomSuffix] = useState(savedDraft?.customSuffix ?? '"');
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  useApplyHistory("param-convert", ({ input }) => setInput(input ?? ""));

  const output = useMemo(
    () => convert(input, delimiter, customDelimiter, format, customPrefix, customSeparator, customSuffix),
    [input, delimiter, customDelimiter, format, customPrefix, customSeparator, customSuffix],
  );

  const copy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showToast("已复制结果");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "复制失败", "error");
    }
  };

  const record = () => {
    if (!input) return;
    addHistory({
      toolId: "param-convert",
      toolName: "参数转换",
      action: FORMATS.find((f) => f.id === format)?.label ?? format,
      payload: { input },
    });
  };

  useSaveDraft("param-convert", {
    input,
    delimiter,
    customDelimiter,
    format,
    customPrefix,
    customSeparator,
    customSuffix,
  });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <label>
          分隔符
          <select value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)}>
            {DELIMITERS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
            <option value="custom">自定义</option>
          </select>
        </label>
        {delimiter === "custom" && (
          <input
            className="text-input"
            style={{ width: 80 }}
            value={customDelimiter}
            onChange={(e) => setCustomDelimiter(e.target.value)}
            placeholder="分隔符"
          />
        )}
        <label>
          格式
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        {format === "custom" && (
          <>
            <input
              className="text-input"
              style={{ width: 60 }}
              value={customPrefix}
              onChange={(e) => setCustomPrefix(e.target.value)}
              placeholder="前缀"
            />
            <input
              className="text-input"
              style={{ width: 60 }}
              value={customSeparator}
              onChange={(e) => setCustomSeparator(e.target.value)}
              placeholder="分隔符"
            />
            <input
              className="text-input"
              style={{ width: 60 }}
              value={customSuffix}
              onChange={(e) => setCustomSuffix(e.target.value)}
              placeholder="后缀"
            />
          </>
        )}
        <button className="btn" onClick={record} disabled={!input}>
          记录
        </button>
        <button className="btn" data-hotkey="copy" onClick={copy} disabled={!output}>
          复制结果
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => setInput("")}>
          清空
        </button>
        <ToolHistory toolId="param-convert" />
      </div>
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">输入</div>
            <JsonEditor value={input} onChange={setInput} language="text" />
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">输出（实时）</div>
            <JsonEditor value={output} readOnly language="text" />
          </div>
        }
      />
    </div>
  );
}
