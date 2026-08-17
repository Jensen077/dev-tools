import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backend } from "../../utils/backend";
import type { editor } from "monaco-editor";
import { JsonEditor } from "../../components/JsonEditor";
import { TextDiffEditor } from "../../components/TextDiffEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { ResizableSplit } from "../../components/ResizableSplit";
import { useFileDrop } from "../../hooks/useFileDrop";
import { readFileAsUtf8 } from "../../utils/fileEncoding";
import type { CompareResult, KvChange, KvEntry, ParseError } from "../../types";
import { isParseError } from "../../types";
import "../tool.css";

/** invoke reject 的 unknown 收窄为 ParseError，否则构造通用错误 */
function toParseError(e: unknown): ParseError {
  if (isParseError(e)) return e;
  return { message: e instanceof Error ? e.message : String(e), line: 1, column: 1 };
}

/** 转义值中的控制字符，保证标准化视图「一 key 一行」，行号与排序后下标严格对应 */
function escapeValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

/** 把按键字母序排列的条目拼成标准化 key = value 文本 */
function buildDisplayText(entries: KvEntry[]): string {
  return entries.map((e) => `${e.key} = ${escapeValue(e.value)}`).join("\n");
}

export function PropsDiff() {
  const savedDraft = useAppStore((s) => s.drafts["props-diff"]) as Record<string, unknown> | undefined;
  const [left, setLeft] = useState((savedDraft?.left as string) ?? "");
  const [right, setRight] = useState((savedDraft?.right as string) ?? "");
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<ParseError | null>(null);
  const [hideUnchanged, setHideUnchanged] = useState((savedDraft?.hideUnchanged as boolean) ?? false);
  const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const autoTimerRef = useRef<number | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);

  // 历史「加载」回填输入（两侧就绪后由自动比对触发 diff）
  useApplyHistory("props-diff", ({ left, right }) => {
    if (left !== undefined) setLeft(left);
    if (right !== undefined) setRight(right);
  });

  // 比对：fromUser=false 为自动触发（不记历史，避免每次输入都产生记录）
  const compare = useCallback(
    async (fromUser = false) => {
      if (!left.trim() || !right.trim()) return;
      setError(null);
      try {
        const res = await backend<CompareResult>("compare_props", { left, right });
        setResult(res);
        if (fromUser) {
          addHistory({
            toolId: "props-diff",
            toolName: "配置文件值比对",
            action: "比对",
            payload: { left, right },
          });
        }
      } catch (e) {
        setResult(null);
        setError(toParseError(e));
      }
    },
    [left, right, addHistory],
  );

  // 自动比对：两侧输入就绪后 500ms 防抖触发（保留手动「比对」按钮兜底）
  useEffect(() => {
    if (!left.trim() || !right.trim()) {
      // 任一侧为空：清空残留比对结果与错误，避免展示与输入不符的旧 diff
      setResult(null);
      setError(null);
      return;
    }
    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    autoTimerRef.current = window.setTimeout(() => {
      void compare(false);
    }, 500);
    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current);
    };
  }, [left, right, compare]);

  const changes = result?.changes ?? [];
  const leftText = useMemo(() => buildDisplayText(result?.left_entries ?? []), [result]);
  const rightText = useMemo(() => buildDisplayText(result?.right_entries ?? []), [result]);
  const leftLineMap = useMemo(
    () => new Map((result?.left_entries ?? []).map((e, i) => [e.key, i + 1])),
    [result],
  );
  const rightLineMap = useMemo(
    () => new Map((result?.right_entries ?? []).map((e, i) => [e.key, i + 1])),
    [result],
  );

  const summary = useMemo(() => {
    const added = changes.filter((c) => c.change === "added").length;
    const removed = changes.filter((c) => c.change === "removed").length;
    const modified = changes.filter((c) => c.change === "modified").length;
    return { added, removed, modified };
  }, [changes]);

  // 变更 key 点击 → 按 key 定位标准化文本行：removed 只存在于左侧，added/modified 定位右侧
  const revealChange = useCallback(
    (c: KvChange) => {
      const ed = diffRef.current;
      if (!ed) return;
      const isRemoved = c.change === "removed";
      const target = isRemoved ? ed.getOriginalEditor() : ed.getModifiedEditor();
      const line = (isRemoved ? leftLineMap : rightLineMap).get(c.key);
      if (!line) return;
      target.setPosition({ lineNumber: line, column: 1 });
      target.revealLineInCenter(line);
      target.focus();
    },
    [leftLineMap, rightLineMap],
  );

  // IDEA 式上下切换变更块：走 Monaco goToDiff
  const goChange = useCallback((dir: "next" | "previous") => {
    diffRef.current?.goToDiff(dir);
  }, []);

  const loadLeft = useCallback(async (file: File) => {
    setLeft(await readFileAsUtf8(file));
  }, []);
  const loadRight = useCallback(async (file: File) => {
    setRight(await readFileAsUtf8(file));
  }, []);

  const leftDrop = useFileDrop({ onFile: loadLeft, accept: [".json", ".properties", ".yml", ".yaml", ".txt"] });
  const rightDrop = useFileDrop({ onFile: loadRight, accept: [".json", ".properties", ".yml", ".yaml", ".txt"] });

  const leftFileRef = useRef<HTMLInputElement>(null);
  const rightFileRef = useRef<HTMLInputElement>(null);

  useSaveDraft("props-diff", { left, right, hideUnchanged });

  const hasDiff = !!(leftText || rightText);

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={() => void compare(true)}>
          比对
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <label className="tool-toggle" title="折叠未变更区域，只看差异">
          <input type="checkbox" checked={hideUnchanged} onChange={(e) => setHideUnchanged(e.target.checked)} />
          只看变更
        </label>
        <span className="hint">
          变更 {changes.length}（新增 {summary.added} / 删除 {summary.removed} / 修改 {summary.modified}）
        </span>
        <span className="spacer" />
        <button className="btn" data-hotkey="diff-prev" onClick={() => goChange("previous")} disabled={!hasDiff}>
          上一个变更
          <span className="btn-hotkey">⌘↑</span>
        </button>
        <button className="btn" data-hotkey="diff-next" onClick={() => goChange("next")} disabled={!hasDiff}>
          下一个变更
          <span className="btn-hotkey">⌘↓</span>
        </button>
        <ToolHistory toolId="props-diff" />
      </div>
      {error && (
        <div className="error-box">
          解析失败: {error.message}（第 {error.line} 行，第 {error.column} 列）
        </div>
      )}
      <input
        ref={leftFileRef}
        type="file"
        hidden
        accept=".json,.properties,.yml,.yaml,.txt"
        onChange={(e) => e.target.files?.[0] && readFileAsUtf8(e.target.files[0]).then(setLeft)}
      />
      <input
        ref={rightFileRef}
        type="file"
        hidden
        accept=".json,.properties,.yml,.yaml,.txt"
        onChange={(e) => e.target.files?.[0] && readFileAsUtf8(e.target.files[0]).then(setRight)}
      />
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">
              左值
              <span className="spacer" />
              <button className="btn btn-sm" onClick={() => leftFileRef.current?.click()}>
                打开文件
              </button>
            </div>
            <div className="drop-zone" {...leftDrop.bindDrop}>
              <JsonEditor value={left} onChange={setLeft} error={error} language="text" />
            </div>
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">
              右值
              <span className="spacer" />
              <button className="btn btn-sm" onClick={() => rightFileRef.current?.click()}>
                打开文件
              </button>
            </div>
            <div className="drop-zone" {...rightDrop.bindDrop}>
              <JsonEditor value={right} onChange={setRight} language="text" />
            </div>
          </div>
        }
      />
      <ResizableSplit
        style={{ flex: 2 }}
        defaultRatio={0.72}
        left={
          <div className="pane">
            <div className="pane-title">diff 视图（标准化后，支持 JSON / properties / YAML 混用）</div>
            {hasDiff ? (
              <TextDiffEditor
                original={leftText}
                modified={rightText}
                editorRef={diffRef}
                hideUnchanged={hideUnchanged}
              />
            ) : (
              <div className="empty-state">
                <span className="empty-icon">🔍</span>
                输入两侧配置（JSON / properties / YAML）后点击「比对」
              </div>
            )}
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">变更 key（{changes.length}）</div>
            {changes.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">✅</span>
                完全一致
              </div>
            ) : (
              <div className="path-list">
                {changes.map((c, i) => (
                  <div key={i} className="path-item" onClick={() => revealChange(c)} title={c.key}>
                    <span className={`badge badge-${c.change}`}>{c.change}</span>
                    <span className="path-text">{c.key}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}