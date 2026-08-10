import { useEffect, useMemo, useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { useToastStore } from "../../store/toast";
import { ResizableSplit } from "../../components/ResizableSplit";
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
  { id: "b64-enc", label: "Base64 编码" },
  { id: "b64-dec", label: "Base64 解码" },
  { id: "url-enc", label: "URL 编码" },
  { id: "url-dec", label: "URL 解码" },
  { id: "upper", label: "转大写" },
  { id: "lower", label: "转小写" },
];

export function EncodeConvert() {
  const savedDraft = useAppStore((s) => s.drafts["encode-convert"]) as Record<string, unknown> | undefined;
  const [mode, setMode] = useState<Mode>((savedDraft?.mode as Mode) ?? "b64-enc");
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  useApplyHistory("encode-convert", ({ input }) => setInput(input ?? ""));

  const { output, outputError } = useMemo(() => {
    if (!input) return { output: "", outputError: null };
    try {
      let out = "";
      switch (mode) {
        case "b64-enc":
          out = base64Encode(input);
          break;
        case "b64-dec":
          out = base64Decode(input);
          break;
        case "url-enc":
          out = urlEncode(input);
          break;
        case "url-dec":
          out = urlDecode(input);
          break;
        case "upper":
          out = toUpperCase(input);
          break;
        case "lower":
          out = toLowerCase(input);
          break;
      }
      return { output: out, outputError: null };
    } catch (e) {
      return { output: "", outputError: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, input]);

  // useMemo 保持纯函数，setState 移到 effect 内
  useEffect(() => {
    setError(outputError);
  }, [outputError]);

  const record = () => {
    if (!input) return;
    addHistory({
      toolId: "encode-convert",
      toolName: "编码转换",
      action: MODES.find((m) => m.id === mode)?.label ?? mode,
      payload: { input },
    });
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
        <label>
          模式
          <select
            value={mode}
            onChange={(e) => {
              const next = MODES.find((m) => m.id === e.target.value);
              if (next) setMode(next.id);
            }}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={record} disabled={!input}>
          记录
        </button>
        <button className="btn" data-hotkey="copy" onClick={copy} disabled={!output}>
          复制结果
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => setInput("")}>清空</button>
        <ToolHistory toolId="encode-convert" />
      </div>
      {error && <div className="error-box">{error}</div>}
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
