import { useCallback, useMemo, useRef, useState } from "react";
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
import type { DiffNode, ParseError } from "../../types";
import { isParseError } from "../../types";
import "../tool.css";

/** invoke reject 的 unknown 收窄为 ParseError，否则构造通用错误 */
function toParseError(e: unknown): ParseError {
  if (isParseError(e)) return e;
  return { message: e instanceof Error ? e.message : String(e), line: 1, column: 1 };
}

/** 深度优先展开 diff 树，返回扁平化变更节点列表。
 * 跳过根节点本身（path 恒为 `$`，无展示意义），只收集其子节点中的变更。
 */
function flattenChanges(node: DiffNode, out: DiffNode[] = []): DiffNode[] {
  if (node.change !== "modified" || node.children.length === 0) {
    out.push(node);
  }
  for (const c of node.children) {
    flattenChanges(c, out);
  }
  return out;
}

/** 取 path 末段（如 `$.a.b[0].c` → `c`），用于在 diff 文本中定位行 */
function lastSegment(path: string): string {
  const m = path.match(/([^.[\]]+)(?:\[\d+\])*$/);
  return m?.[1] ?? "";
}

export function JsonDiff() {
  const savedDraft = useAppStore((s) => s.drafts["json-diff"]) as Record<string, unknown> | undefined;
  const [left, setLeft] = useState((savedDraft?.left as string) ?? "");
  const [right, setRight] = useState((savedDraft?.right as string) ?? "");
  const [changes, setChanges] = useState<DiffNode[]>([]);
  const [leftPretty, setLeftPretty] = useState("");
  const [rightPretty, setRightPretty] = useState("");
  const [error, setError] = useState<ParseError | null>(null);
  const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);

  // 历史「加载」回填输入
  useApplyHistory("json-diff", ({ left, right }) => {
    if (left !== undefined) setLeft(left);
    if (right !== undefined) setRight(right);
  });

  const compare = useCallback(async () => {
    if (!left.trim() || !right.trim()) return;
    setError(null);
    try {
      const node = await backend<DiffNode>("compare_json", { left, right });
      // 用 Rust 的格式化把两边标准化为 pretty JSON，交给 Monaco diff
      const [lp, rp] = await Promise.all([
        backend<string>("fmt_json", { input: left, indent: 2 }),
        backend<string>("fmt_json", { input: right, indent: 2 }),
      ]);
      setLeftPretty(lp);
      setRightPretty(rp);
      // 收集根节点下的所有变更（跳过根自身，其 path 恒为 `$`）
      setChanges(node.children.flatMap((c) => flattenChanges(c)));
      addHistory({
        toolId: "json-diff",
        toolName: "JSON 比对",
        action: "比对",
        payload: { left, right },
      });
    } catch (e) {
      setError(toParseError(e));
    }
  }, [left, right]);

  // 路径点击 → 在右侧 diff 编辑器中定位到包含该 key 的行
  const revealPath = useCallback(
    (path: string) => {
      const ed = diffRef.current;
      if (!ed) return;
      const key = lastSegment(path);
      const modifiedEditor = ed.getModifiedEditor();
      const model = modifiedEditor.getModel();
      if (!model) return;
      const lines = rightPretty.split("\n");
      const idx = lines.findIndex((l) => l.includes(`"${key}"`));
      if (idx < 0) return;
      const line = idx + 1;
      modifiedEditor.revealLineInCenter(line, 0);
      modifiedEditor.setPosition({ lineNumber: line, column: 1 });
      modifiedEditor.focus();
    },
    [rightPretty],
  );

  const loadLeft = useCallback(async (file: File) => {
    setLeft(await file.text());
  }, []);
  const loadRight = useCallback(async (file: File) => {
    setRight(await file.text());
  }, []);

  const leftDrop = useFileDrop({ onFile: loadLeft, accept: [".json", ".txt"] });
  const rightDrop = useFileDrop({ onFile: loadRight, accept: [".json", ".txt"] });

  const leftFileRef = useRef<HTMLInputElement>(null);
  const rightFileRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => {
    const added = changes.filter((c) => c.change === "added").length;
    const removed = changes.filter((c) => c.change === "removed").length;
    const modified = changes.filter((c) => c.change === "modified").length;
    return { added, removed, modified };
  }, [changes]);

  useSaveDraft("json-diff", { left, right });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={compare}>
          比对
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <span className="hint">
          变更 {changes.length}（新增 {summary.added} / 删除 {summary.removed} / 修改 {summary.modified}）
        </span>
        <span className="spacer" />
        <button className="btn" onClick={() => leftFileRef.current?.click()}>打开左值文件</button>
        <button className="btn" onClick={() => rightFileRef.current?.click()}>打开右值文件</button>
        <input
          ref={leftFileRef}
          type="file"
          hidden
          onChange={(e) => e.target.files?.[0] && e.target.files[0].text().then(setLeft)}
        />
        <input
          ref={rightFileRef}
          type="file"
          hidden
          onChange={(e) => e.target.files?.[0] && e.target.files[0].text().then(setRight)}
        />
        <ToolHistory toolId="json-diff" />
      </div>
      {error && (
        <div className="error-box">
          解析失败: {error.message}（第 {error.line} 行，第 {error.column} 列）
        </div>
      )}
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">左值</div>
            <div className="drop-zone" {...leftDrop.bindDrop}>
              <JsonEditor value={left} onChange={setLeft} error={error} />
            </div>
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">右值</div>
            <div className="drop-zone" {...rightDrop.bindDrop}>
              <JsonEditor value={right} onChange={setRight} />
            </div>
          </div>
        }
      />
      <ResizableSplit
        style={{ flex: 2 }}
        left={
          <div className="pane">
            <div className="pane-title">diff 视图（标准化后）</div>
            {leftPretty || rightPretty ? (
              <TextDiffEditor original={leftPretty} modified={rightPretty} editorRef={diffRef} />
            ) : (
              <div className="empty-state">
                <span className="empty-icon">🔍</span>
                输入两侧 JSON 后点击「比对」
              </div>
            )}
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">变更路径（{changes.length}）</div>
            {changes.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">✅</span>
                完全一致
              </div>
            ) : (
              <div className="path-list">
                {changes.map((c, i) => (
                  <div key={i} className="path-item" onClick={() => revealPath(c.path)} title={c.path}>
                    <span className={`badge badge-${c.change}`}>{c.change}</span>
                    <span className="path-text">{c.path}</span>
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
