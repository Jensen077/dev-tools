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

/** 把 JSON path（`$.a[3].b`）解析为段序列：对象键或数组索引 */
function parsePathSegments(path: string): Array<{ key?: string; index?: number }> {
  const segs: Array<{ key?: string; index?: number }> = [];
  const rest = path.replace(/^\$\.?/, "");
  const re = /([^.[\]]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest))) {
    if (m[1] !== undefined) segs.push({ key: m[1] });
    if (m[2] !== undefined) segs.push({ index: Number(m[2]) });
  }
  return segs;
}

/** 在 pretty JSON 文本中按 path 定位行号（1-based），找不到返回 -1。
 * 依赖 Rust fmt_json（serde_json to_string_pretty, indent 2）的固定缩进：
 * 块内元素行缩进比所属块深一级；数组元素结束行以 `}` 开头，需跳过。
 */
function findPathLine(pretty: string, path: string): number {
  const lines = pretty.split("\n");
  const indentOf = (i: number) => {
    const m = lines[i]!.match(/^ */);
    return m ? m[0].length : 0;
  };
  const trim = (i: number) => lines[i]!.trim();

  const segs = parsePathSegments(path);
  if (segs.length === 0) return -1;

  // depth 为当前所在块（对象或数组）的缩进深度；块内元素行缩进 = (depth + 1) * 2
  let depth = 0;
  let pos = -1;
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si]!;
    const targetIndent = (depth + 1) * 2;
    const isLast = si === segs.length - 1;
    let found = -1;

    if (seg.key !== undefined) {
      const key = seg.key;
      for (let i = pos + 1; i < lines.length; i++) {
        if (indentOf(i) === targetIndent && trim(i).startsWith(`"${key}"`)) {
          found = i;
          break;
        }
      }
      if (found < 0) return -1;
      if (isLast) return found + 1;
      const t = trim(found);
      if (t.endsWith("{") || t.endsWith("[")) depth = indentOf(found) / 2;
      else return found + 1;
    } else {
      const idx = seg.index!;
      let seen = -1;
      for (let i = pos + 1; i < lines.length; i++) {
        // 跳过闭合括号行（对象元素结束 `}` / 嵌套数组元素结束 `]`），否则被误计为元素
        if (indentOf(i) === targetIndent && !trim(i).startsWith("}") && !trim(i).startsWith("]")) {
          seen++;
          if (seen === idx) {
            found = i;
            break;
          }
        }
      }
      if (found < 0) return -1;
      if (isLast) return found + 1;
      const t = trim(found);
      if (t.startsWith("{") || t.startsWith("[")) depth = indentOf(found) / 2;
      else return found + 1;
    }
    pos = found;
  }
  return -1;
}

export function JsonDiff() {
  const savedDraft = useAppStore((s) => s.drafts["json-diff"]) as Record<string, unknown> | undefined;
  const [left, setLeft] = useState((savedDraft?.left as string) ?? "");
  const [right, setRight] = useState((savedDraft?.right as string) ?? "");
  const [changes, setChanges] = useState<DiffNode[]>([]);
  const [leftPretty, setLeftPretty] = useState("");
  const [rightPretty, setRightPretty] = useState("");
  const [error, setError] = useState<ParseError | null>(null);
  const [hideUnchanged, setHideUnchanged] = useState((savedDraft?.hideUnchanged as boolean) ?? false);
  const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const autoTimerRef = useRef<number | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);

  // 历史「加载」回填输入
  useApplyHistory("json-diff", ({ left, right }) => {
    if (left !== undefined) setLeft(left);
    if (right !== undefined) setRight(right);
  });

  // 比对：fromUser=false 为自动触发（不记历史，避免每次输入都产生记录）
  const compare = useCallback(
    async (fromUser = false) => {
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
        // 标准化后相同 → 无变更；否则当根节点为标量（如 1 vs 2）时 node 无子节点，
        // 需把根节点自身作为变更展示，避免「完全一致」误报
        const rawChanges =
          lp === rp
            ? []
            : node.children.length === 0
              ? flattenChanges(node)
              : node.children.flatMap((c) => flattenChanges(c));
        setChanges(rawChanges);
        if (fromUser) {
          addHistory({
            toolId: "json-diff",
            toolName: "JSON 比对",
            action: "比对",
            payload: { left, right },
          });
        }
      } catch (e) {
        setError(toParseError(e));
      }
    },
    [left, right, addHistory],
  );

  // 自动比对：两侧输入就绪后 500ms 防抖触发（保留手动「比对」按钮兜底）
  useEffect(() => {
    if (!left.trim() || !right.trim()) {
      // 任一侧为空：清空残留比对结果与错误，避免展示与输入不符的旧 diff
      setChanges([]);
      setLeftPretty("");
      setRightPretty("");
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

  // 路径点击 → 按 path 精确定位行：removed 变更只存在于左侧文本，定位 original；
  // added/modified 定位 modified（diff 改后侧）
  const revealPath = useCallback(
    (c: DiffNode) => {
      const ed = diffRef.current;
      if (!ed) return;
      const isRemoved = c.change === "removed";
      const target = isRemoved ? ed.getOriginalEditor() : ed.getModifiedEditor();
      const line = findPathLine(isRemoved ? leftPretty : rightPretty, c.path);
      if (line < 0) return;
      target.setPosition({ lineNumber: line, column: 1 });
      target.revealLineInCenter(line);
      target.focus();
    },
    [leftPretty, rightPretty],
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

  useSaveDraft("json-diff", { left, right, hideUnchanged });

  const hasDiff = !!(leftPretty || rightPretty);

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
        <ToolHistory toolId="json-diff" />
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
        onChange={(e) => e.target.files?.[0] && readFileAsUtf8(e.target.files[0]).then(setLeft)}
      />
      <input
        ref={rightFileRef}
        type="file"
        hidden
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
              <JsonEditor value={left} onChange={setLeft} error={error} />
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
              <JsonEditor value={right} onChange={setRight} />
            </div>
          </div>
        }
      />
      <ResizableSplit
        style={{ flex: 2 }}
        defaultRatio={0.72}
        left={
          <div className="pane">
            <div className="pane-title">diff 视图（标准化后）</div>
            {hasDiff ? (
              <TextDiffEditor
                original={leftPretty}
                modified={rightPretty}
                editorRef={diffRef}
                hideUnchanged={hideUnchanged}
              />
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
                  <div key={i} className="path-item" onClick={() => revealPath(c)} title={c.path}>
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
