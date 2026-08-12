import { useEffect, useRef, useState } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useAppStore } from "../store/app";
import { useToastStore } from "../store/toast";
import "./diff-header.css";

interface TextDiffEditorProps {
  original: string;
  modified: string;
  height?: number | string;
  language?: string;
  /** 挂载后写入 diff 编辑器实例，供外部 revealLine 导航 */
  editorRef?: React.MutableRefObject<editor.IStandaloneDiffEditor | null>;
  /** 并排渲染（默认 true）；false 时为内联/统一视图，变更块上下堆叠 */
  renderSideBySide?: boolean;
  /** diff 计算完成（含挂载时）把变更块列表上报给外部，用于统计变更数量 */
  onLineChanges?: (changes: editor.ILineChange[] | null) => void;
  /** 并排模式顶部常驻统计行（变更行数 + 总行数）与复制按钮，不随内容滚动 */
  sideHeaders?: boolean;
}

interface SideStats {
  removed: number;
  added: number;
  leftTotal: number;
  rightTotal: number;
}

/** 基于 Monaco DiffEditor 的左右分栏比对视图，主题跟随全局设置 */
export function TextDiffEditor({
  original,
  modified,
  height = "100%",
  language = "json",
  editorRef,
  renderSideBySide = true,
  onLineChanges,
  sideHeaders = false,
}: TextDiffEditorProps) {
  const theme = useAppStore((s) => s.theme);
  const internalRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const subRef = useRef<{ dispose(): void } | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const onLineChangesRef = useRef(onLineChanges);
  onLineChangesRef.current = onLineChanges;
  const leftHalfRef = useRef<HTMLDivElement>(null);
  const rightHalfRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<SideStats>({ removed: 0, added: 0, leftTotal: 0, rightTotal: 0 });

  const showHeaders = sideHeaders && renderSideBySide;

  /** 依据 diff 变更块更新统计：左显删除 −，右显新增 +，附各自总行数 */
  const updateStats = (ed: editor.IStandaloneDiffEditor) => {
    const changes = ed.getLineChanges();
    if (!changes) return;
    let removed = 0;
    let added = 0;
    for (const c of changes) {
      if (c.originalEndLineNumber > 0) removed += c.originalEndLineNumber - c.originalStartLineNumber + 1;
      if (c.modifiedEndLineNumber > 0) added += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1;
    }
    setStats({
      removed,
      added,
      leftTotal: ed.getOriginalEditor().getModel()?.getLineCount() ?? 0,
      rightTotal: ed.getModifiedEditor().getModel()?.getLineCount() ?? 0,
    });
  };

  const handleMount: DiffOnMount = (ed) => {
    internalRef.current = ed;
    if (editorRef) editorRef.current = ed;

    // 常驻 header 行与 Monaco 内部分隔条对齐：跟踪两侧 pane 宽度，保持分隔线位置一致
    if (showHeaders) {
      const applyWidths = () => {
        if (leftHalfRef.current) {
          leftHalfRef.current.style.width = ed.getOriginalEditor().getDomNode()!.getBoundingClientRect().width + "px";
        }
        if (rightHalfRef.current) {
          rightHalfRef.current.style.width = ed.getModifiedEditor().getDomNode()!.getBoundingClientRect().width + "px";
        }
      };
      applyWidths();
      const ro = new ResizeObserver(applyWidths);
      ro.observe(ed.getOriginalEditor().getDomNode()!);
      ro.observe(ed.getModifiedEditor().getDomNode()!);
      roRef.current = ro;
    }

    const cb = onLineChangesRef.current;
    updateStats(ed);
    if (cb) cb(ed.getLineChanges());

    // 订阅 diff 重算：更新统计 + 上报外部
    subRef.current?.dispose();
    subRef.current = ed.onDidUpdateDiff(() => {
      updateStats(ed);
      if (cb) cb(ed.getLineChanges());
    });
  };

  // 卸载时清理订阅与 ResizeObserver，并清空外部 ref
  useEffect(() => {
    return () => {
      subRef.current?.dispose();
      subRef.current = null;
      roRef.current?.disconnect();
      roRef.current = null;
      if (editorRef) editorRef.current = null;
    };
  }, [editorRef]);

  const copySide = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => useToastStore.getState().showToast("已复制该侧文本"))
      .catch(() => {});
  };

  const themeName = theme === "dark" ? "devbox-dark" : "devbox-light";

  const editor = (
    <DiffEditor
      height={height}
      language={language}
      theme={themeName}
      original={original}
      modified={modified}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
        wordWrap: "off",
        readOnly: true,
        renderSideBySide,
        renderOverviewRuler: true,
      }}
    />
  );

  // 仅在并排带统计头时包一层 flex 列容器；其余布局直接渲染 DiffEditor，
  // 避免多余包裹层让 height:100% 失去 flex 基准而高度塌陷
  if (!showHeaders) return editor;

  return (
    <div className="diff-side-wrap">
      <div className="diff-header-row">
        <div ref={leftHalfRef} className="diff-header-half">
          <span className="diff-side-stats">
            变更 <span className="diff-stats-removed">−{stats.removed}</span> · 总 {stats.leftTotal} 行
          </span>
          <span className="spacer" />
          <button className="diff-side-copy" onClick={() => copySide(original)}>
            复制
          </button>
        </div>
        <div ref={rightHalfRef} className="diff-header-half">
          <span className="diff-side-stats">
            变更 <span className="diff-stats-added">+{stats.added}</span> · 总 {stats.rightTotal} 行
          </span>
          <span className="spacer" />
          <button className="diff-side-copy" onClick={() => copySide(modified)}>
            复制
          </button>
        </div>
      </div>
      <div className="diff-side-body">{editor}</div>
    </div>
  );
}
