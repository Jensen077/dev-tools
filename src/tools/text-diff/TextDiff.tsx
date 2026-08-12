import { useCallback, useRef, useState } from "react";
import type { editor } from "monaco-editor";
import { JsonEditor } from "../../components/JsonEditor";
import { TextDiffEditor } from "../../components/TextDiffEditor";
import { StackedDiff, type StackedDiffHandle } from "../../components/StackedDiff";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { ResizableSplit } from "../../components/ResizableSplit";
import { useFileDrop } from "../../hooks/useFileDrop";
import { readFileAsUtf8 } from "../../utils/fileEncoding";
import "../tool.css";

/** 文本比对布局：side-by-side 左右、stacked 上下、inline 仅对比更改（内联视图） */
type DiffLayout = "side-by-side" | "stacked" | "inline";

const LAYOUTS: { id: DiffLayout; label: string }[] = [
  { id: "side-by-side", label: "左右" },
  { id: "stacked", label: "上下" },
  { id: "inline", label: "仅对比" },
];

export function TextDiff() {
  const savedDraft = useAppStore((s) => s.drafts["text-diff"]) as Record<string, unknown> | undefined;
  const [left, setLeft] = useState((savedDraft?.left as string) ?? "");
  const [right, setRight] = useState((savedDraft?.right as string) ?? "");
  const [showDiff, setShowDiff] = useState(false);
  const [layout, setLayout] = useState<DiffLayout>((savedDraft?.layout as DiffLayout) ?? "side-by-side");
  const leftFileRef = useRef<HTMLInputElement>(null);
  const rightFileRef = useRef<HTMLInputElement>(null);
  const diffRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const stackedRef = useRef<StackedDiffHandle | null>(null);
  const [changeStats, setChangeStats] = useState<{ hunks: number; added: number; removed: number } | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);

  // 从 Monaco diff 的变更块列表汇总：hunk 数 + 新增/删除行数
  const handleLineChanges = useCallback((changes: editor.ILineChange[] | null) => {
    if (!changes) {
      setChangeStats(null);
      return;
    }
    let added = 0;
    let removed = 0;
    for (const c of changes) {
      if (c.modifiedEndLineNumber > 0) added += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1;
      if (c.originalEndLineNumber > 0) removed += c.originalEndLineNumber - c.originalStartLineNumber + 1;
    }
    setChangeStats({ hunks: changes.length, added, removed });
  }, []);

  // 历史「加载」回填输入
  useApplyHistory("text-diff", ({ left, right }) => {
    if (left !== undefined) setLeft(left);
    if (right !== undefined) setRight(right);
  });

  const compare = () => {
    setShowDiff(true);
    addHistory({
      toolId: "text-diff",
      toolName: "文本比对",
      action: "比对",
      payload: { left, right },
    });
  };

  // IDEA 式上下切换变更块：并排/内联走 Monaco goToDiff，上下堆叠走组件内导航
  const goChange = useCallback(
    (dir: "next" | "previous") => {
      if (layout === "stacked") {
        stackedRef.current?.goChange(dir);
      } else {
        diffRef.current?.goToDiff(dir);
      }
    },
    [layout],
  );

  const loadLeft = useCallback(async (file: File) => {
    setLeft(await readFileAsUtf8(file));
  }, []);
  const loadRight = useCallback(async (file: File) => {
    setRight(await readFileAsUtf8(file));
  }, []);

  const leftDrop = useFileDrop({ onFile: loadLeft });
  const rightDrop = useFileDrop({ onFile: loadRight });

  useSaveDraft("text-diff", { left, right, layout });

  // 单个编辑框：pane-title 右侧放「打开文件」按钮（对齐 diffchecker 编辑框结构）
  const renderEditorPane = (
    title: string,
    value: string,
    onChange: (v: string) => void,
    fileRef: React.RefObject<HTMLInputElement | null>,
    drop: ReturnType<typeof useFileDrop>,
  ) => (
    <div className="pane">
      <div className="pane-title">
        {title}
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          打开文件
        </button>
      </div>
      <div className="drop-zone" {...drop.bindDrop}>
        <JsonEditor value={value} onChange={onChange} language="text" />
      </div>
    </div>
  );

  const bothEmpty = !left.trim() && !right.trim();

  const statsHint = changeStats ? (
    <span className="hint">
      变更 {changeStats.hunks}（
      <span className="diff-stats-added">+{changeStats.added}</span> /{" "}
      <span className="diff-stats-removed">−{changeStats.removed}</span> 行）
    </span>
  ) : null;

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={compare} disabled={bothEmpty}>
          比对
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <div className="seg">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={`seg-btn${layout === l.id ? " on" : ""}`}
              onClick={() => setLayout(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn" data-hotkey="diff-prev" onClick={() => goChange("previous")} disabled={!showDiff}>
          上一个变更
          <span className="btn-hotkey">⌘↑</span>
        </button>
        <button className="btn" data-hotkey="diff-next" onClick={() => goChange("next")} disabled={!showDiff}>
          下一个变更
          <span className="btn-hotkey">⌘↓</span>
        </button>
        <ToolHistory toolId="text-diff" />
      </div>
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
      {layout === "inline" ? (
        <div className="pane" style={{ flex: 1 }}>
          <div className="pane-title">
            仅对比更改
            {statsHint && <span className="hint">{statsHint}</span>}
          </div>
          {showDiff ? (
            <TextDiffEditor original={left} modified={right} language="text" editorRef={diffRef} renderSideBySide={false} onLineChanges={handleLineChanges} />
          ) : (
            <div className="empty-state">
              <span className="empty-icon">📄</span>
              切回「左右」或「上下」布局输入两侧文本后点击「比对」
            </div>
          )}
        </div>
      ) : (
        <>
          <ResizableSplit
            left={renderEditorPane("左值", left, setLeft, leftFileRef, leftDrop)}
            right={renderEditorPane("右值", right, setRight, rightFileRef, rightDrop)}
          />
          {layout === "stacked" ? (
            showDiff ? (
              <StackedDiff original={left} modified={right} language="text" handleRef={stackedRef} />
            ) : (
              <div className="pane" style={{ flex: 2 }}>
                <div className="pane-title">diff</div>
                <div className="empty-state">
                  <span className="empty-icon">📄</span>
                  输入两侧文本后点击「比对」
                </div>
              </div>
            )
          ) : (
            <div className="pane" style={{ flex: 2 }}>
              {!showDiff && <div className="pane-title">diff</div>}
              {showDiff ? (
                <TextDiffEditor original={left} modified={right} language="text" editorRef={diffRef} onLineChanges={handleLineChanges} sideHeaders />
              ) : (
                <div className="empty-state">
                  <span className="empty-icon">📄</span>
                  输入两侧文本后点击「比对」
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
