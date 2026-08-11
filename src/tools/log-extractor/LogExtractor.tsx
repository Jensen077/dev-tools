import { useCallback, useMemo, useRef, useState } from "react";
import { backend } from "../../utils/backend";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { ToolHistory } from "../../components/ToolHistory";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { useFileDrop } from "../../hooks/useFileDrop";
import { JsonOutput } from "../../components/JsonOutput";
import { ResizableSplit } from "../../components/ResizableSplit";
import { useToastStore } from "../../store/toast";
import type { JsonMatch } from "../../types";
import "../tool.css";

/** invoke reject 可能是字符串或 Error，统一提取消息 */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function LogExtractor() {
  const savedDraft = useAppStore((s) => s.drafts["log-extractor"]) as Record<string, unknown> | undefined;
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [matches, setMatches] = useState<JsonMatch[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);
  const setExtractedJson = useAppStore((s) => s.setExtractedJson);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const fileRef = useRef<HTMLInputElement>(null);

  // 历史「加载」回填输入
  useApplyHistory("log-extractor", ({ input }) => setInput(input ?? ""));

  const extract = useCallback(async () => {
    if (!input.trim()) return;
    setError(null);
    try {
      const result = await backend<JsonMatch[]>("extract_json_cmd", { input });
      setMatches(result);
      setSelected(0);
      // 仅在有命中时记录历史，避免无价值条目堆积
      if (result.length > 0) {
        addHistory({
          toolId: "log-extractor",
          toolName: "日志提取",
          action: "提取 JSON",
          payload: { input },
        });
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }, [input]);

  const copyMatch = useCallback(
    async (m: JsonMatch) => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(m.value, null, 2));
        showToast("已复制该命中");
      } catch (e) {
        setError(errMsg(e));
      }
    },
    [showToast],
  );

  const copyAll = useCallback(async () => {
    if (matches.length === 0) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(matches.map((m) => m.value), null, 2));
      showToast(`已复制 ${matches.length} 条命中`);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [matches, showToast]);

  const formatMatch = useCallback(
    (m: JsonMatch) => {
      setExtractedJson(JSON.stringify(m.value));
      setActiveTool("json-formatter");
    },
    [setExtractedJson, setActiveTool],
  );

  const loadFile = useCallback(async (file: File) => {
    setInput(await file.text());
  }, []);

  const { bindDrop, isDragging } = useFileDrop({ onFile: loadFile, accept: [".log", ".txt", ".json"] });

  const totalBytes = useMemo(
    () => matches.reduce((acc, m) => acc + (m.end - m.start), 0),
    [matches],
  );

  // 选中的命中：selected 越界时钳制到最后一个
  const activeMatch = matches[Math.min(selected, matches.length - 1)];

  useSaveDraft("log-extractor", { input });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={extract}>
          提取 JSON
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <button className="btn" onClick={copyAll} disabled={matches.length === 0}>
          复制全部
        </button>
        <span className="hint">支持转义 JSON（如 {"{\"a\":1}"}）、跨行、日志前缀</span>
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>打开日志文件</button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => e.target.files?.[0] && e.target.files[0].text().then(setInput)}
        />
        <ToolHistory toolId="log-extractor" />
      </div>
      {error && <div className="error-box">{error}</div>}
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">日志输入</div>
            <div className="drop-zone" {...bindDrop}>
              <JsonEditor value={input} onChange={setInput} language="text" />
            </div>
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">提取结果（{matches.length}，共 {totalBytes} 字节）</div>
            {matches.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📋</span>
                点击「提取 JSON」后在此显示命中列表
              </div>
            ) : (
              <>
                {/* 命中选择条：多条命中时切换查看，与格式化页输出一致的整栏预览 */}
                <div className="match-tabs">
                  {matches.map((m, i) => (
                    <button
                      key={i}
                      className={`match-tab ${i === selected ? "active" : ""}`}
                      onClick={() => setSelected(i)}
                      title={m.raw}
                    >
                      #{i + 1}
                    </button>
                  ))}
                </div>
                {activeMatch && (
                  <>
                    <div className="match-actions">
                      <span className="hint">
                        [{activeMatch.start}..{activeMatch.end})
                      </span>
                      <span className="spacer" />
                      <button className="btn btn-sm" onClick={() => formatMatch(activeMatch)}>格式化</button>
                      <button className="btn btn-sm" onClick={() => copyMatch(activeMatch)}>复制</button>
                    </div>
                    <div className="match-preview" style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                      <JsonOutput value={JSON.stringify(activeMatch.value, null, 2)} />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        }
      />
      {isDragging && <div className="drop-hint">松开以载入日志文件</div>}
    </div>
  );
}
