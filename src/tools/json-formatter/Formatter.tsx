import { useCallback, useEffect, useRef, useState } from "react";
import { backend } from "../../utils/backend";
import { JsonEditor } from "../../components/JsonEditor";
import { JsonOutput } from "../../components/JsonOutput";
import type { editor } from "monaco-editor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { ResizableSplit } from "../../components/ResizableSplit";
import { useToastStore } from "../../store/toast";
import { readFileAsUtf8 } from "../../utils/fileEncoding";
import type { ParseError } from "../../types";
import { isParseError } from "../../types";
import "../tool.css";

/** 前端反转义 JSON 字符串：将转义后的 JSON 文本解码为格式化 JSON */
function unescapeJson(input: string): string {
  const escaped = input.replace(/\r\n/g, "\\n").replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  const unescaped: string = JSON.parse('"' + escaped + '"');
  return JSON.stringify(JSON.parse(unescaped), null, 2);
}

/** invoke reject 可能是字符串或 Error，统一提取消息 */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** unknown → ParseError 或带 1:1 的通用错误 */
function toParseError(e: unknown): ParseError {
  if (isParseError(e)) return e;
  return { message: errMsg(e), line: 1, column: 1 };
}

export function Formatter() {
  const savedDraft = useAppStore((s) => s.drafts["json-formatter"]) as Record<string, unknown> | undefined;
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [output, setOutput] = useState("");
  const [indent, setIndent] = useState((savedDraft?.indent as number) ?? 2);
  const [error, setError] = useState<ParseError | null>(null);
  const [autoRun, setAutoRun] = useState((savedDraft?.autoRun as boolean) ?? true);
  const fileRef = useRef<HTMLInputElement>(null);
  const outputEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const extractedJson = useAppStore((s) => s.extractedJson);
  const setExtractedJson = useAppStore((s) => s.setExtractedJson);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  // 历史「加载」回填输入
  useApplyHistory("json-formatter", ({ input }) => setInput(input ?? ""));

  // 从日志提取页跳转过来时，载入一次并格式化，随后立即消费掉，
  // 避免切换缩进时 effect 用陈旧的 extractedJson 覆盖用户已编辑内容
  useEffect(() => {
    if (extractedJson) {
      setInput(extractedJson);
      backend<string>("fmt_json", { input: extractedJson, indent })
        .then(setOutput)
        .catch((e) => setError(toParseError(e)));
      setExtractedJson("");
    }
  }, [extractedJson, indent, setExtractedJson]);

  const run = useCallback(
    async (mode: "format" | "minify") => {
      if (!input.trim()) return;
      setError(null);
      try {
        const result =
          mode === "format"
            ? await backend<string>("fmt_json", { input, indent })
            : await backend<string>("min_json", { input });
        setOutput(result);
        addHistory({
          toolId: "json-formatter",
          toolName: "JSON 格式化",
          action: mode === "format" ? "格式化" : "压缩",
          payload: { input },
        });
      } catch (e) {
        setError(toParseError(e));
      }
    },
    [input, indent],
  );

  const handleUnescape = useCallback(() => {
    if (!input.trim()) return;
    setError(null);
    try {
      const result = unescapeJson(input);
      setInput(result);
      addHistory({
        toolId: "json-formatter",
        toolName: "JSON 格式化",
        action: "去转义",
        payload: { input },
      });
    } catch (e) {
      setError(toParseError(e));
    }
  }, [input, addHistory]);

  // 粘贴后自动格式化（debounce 600ms，autoRun 关闭时跳过）
  useEffect(() => {
    if (!autoRun || !input.trim()) return;
    const t = setTimeout(() => {
      backend<string>("fmt_json", { input, indent })
        .then(setOutput)
        .catch((e) => setError(toParseError(e)));
    }, 600);
    return () => clearTimeout(t);
  }, [input, indent, autoRun]);

  const loadFile = useCallback(async (file: File) => {
    setInput(await readFileAsUtf8(file));
  }, []);

  const { bindDrop, isDragging } = useFileDrop({ onFile: loadFile, accept: [".json", ".txt"] });

  const copyResult = useCallback(async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showToast("已复制到剪贴板");
    } catch (e) {
      setError({ message: `复制失败: ${errMsg(e)}`, line: 1, column: 1 });
    }
  }, [output, showToast]);

  /** 全部折叠/展开输出编辑器 */
  const foldAll = useCallback(() => {
    outputEditorRef.current?.getAction("editor.foldAll")?.run();
  }, []);
  const unfoldAll = useCallback(() => {
    outputEditorRef.current?.getAction("editor.unfoldAll")?.run();
  }, []);

  useSaveDraft("json-formatter", { input, indent, autoRun });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={() => run("format")}>
          格式化
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <button className="btn" onClick={() => run("minify")}>压缩</button>
        <button className="btn" onClick={handleUnescape}>去转义</button>
        <span className="seg-wrap">
          <span className="seg-label">缩进</span>
          <span className="seg">
            <button type="button" className={`seg-btn${indent === 2 ? " on" : ""}`} onClick={() => setIndent(2)}>
              2
            </button>
            <button type="button" className={`seg-btn${indent === 4 ? " on" : ""}`} onClick={() => setIndent(4)}>
              4
            </button>
          </span>
        </span>
        <label className="switch-label">
          <input type="checkbox" className="switch" checked={autoRun} onChange={(e) => setAutoRun(e.target.checked)} />
          自动格式化
        </label>
        <button className="btn" data-hotkey="copy" onClick={copyResult} disabled={!output}>
          复制结果
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>打开文件</button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
        />
        <ToolHistory toolId="json-formatter" />
      </div>
      {isDragging && <div className="drop-hint">松开以载入文件</div>}
      {error && (
        <div className="error-box">
          解析失败: {error.message}（第 {error.line} 行，第 {error.column} 列）
        </div>
      )}
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">输入</div>
            <div className="drop-zone" {...bindDrop}>
              <JsonEditor value={input} onChange={setInput} error={error} />
            </div>
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">
              输出
              <span className="spacer" />
              <button className="btn btn-sm" onClick={foldAll} disabled={!output}>
                全部闭合
              </button>
              <button className="btn btn-sm" onClick={unfoldAll} disabled={!output}>
                全部展开
              </button>
            </div>
            <JsonOutput value={output} editorRef={outputEditorRef} />
          </div>
        }
      />
    </div>
  );
}