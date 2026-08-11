import { useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { useToastStore } from "../../store/toast";
import {
  base64Decode,
  base64Encode,
  toLowerCase,
  toUpperCase,
  urlDecode,
  urlEncode,
} from "../../utils/encoding";
import "../tool.css";

type Mode = "b64-enc" | "b64-dec" | "url-enc" | "url-dec" | "upper" | "lower";

const MODES: { id: Mode; label: string }[] = [
  { id: "b64-enc", label: "B64 编码" },
  { id: "b64-dec", label: "B64 解码" },
  { id: "url-enc", label: "URL 编码" },
  { id: "url-dec", label: "URL 解码" },
  { id: "upper", label: "转大写" },
  { id: "lower", label: "转小写" },
];

/** 按当前模式做单向转换，非法输入抛异常 */
function transform(input: string, mode: Mode): string {
  switch (mode) {
    case "b64-enc":
      return base64Encode(input);
    case "b64-dec":
      return base64Decode(input);
    case "url-enc":
      return urlEncode(input);
    case "url-dec":
      return urlDecode(input);
    case "upper":
      return toUpperCase(input);
    case "lower":
      return toLowerCase(input);
  }
}

export function EncodeConvert() {
  const savedDraft = useAppStore((s) => s.drafts["encode-convert"]) as Record<string, unknown> | undefined;
  const [mode, setMode] = useState<Mode>((savedDraft?.mode as Mode) ?? "b64-enc");
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  useApplyHistory("encode-convert", ({ input }) => setInput(input ?? ""));

  const run = () => {
    if (!input) return;
    setError(null);
    try {
      setOutput(transform(input, mode));
      addHistory({
        toolId: "encode-convert",
        toolName: "编码转换",
        action: MODES.find((m) => m.id === mode)?.label ?? mode,
        payload: { input },
      });
    } catch (e) {
      setOutput("");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const exchange = () => {
    setInput(output);
    setOutput(input);
    setError(null);
  };

  const copy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showToast("已复制结果");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useSaveDraft("encode-convert", { input, mode });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <span className="seg-wrap">
          <span className="seg-label">模式</span>
          <span className="seg">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`seg-btn${mode === m.id ? " on" : ""}`}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </span>
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => setInput("")}>清空</button>
        <ToolHistory toolId="encode-convert" />
      </div>

      <div className="pane">
        <div className="pane-title">输入（待转换文本）</div>
        <JsonEditor value={input} onChange={setInput} language="text" />
      </div>

      <div className="action-row">
        <button className="btn btn-primary" data-hotkey="run" onClick={run} disabled={!input}>
          {MODES.find((m) => m.id === mode)?.label ?? mode}
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <button className="btn" onClick={exchange} disabled={!output}>
          交换上下
        </button>
        <button className="btn" data-hotkey="copy" onClick={copy} disabled={!output}>
          复制结果
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        {output && (
          <span className="hint">
            输入 {input.length} 字符 → 输出 {output.length} 字符
          </span>
        )}
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="pane">
        <div className="pane-title">输出（转换结果）</div>
        <JsonEditor value={output} readOnly language="text" />
      </div>
    </div>
  );
}
