import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import type { editor } from "monaco-editor";
import { editorOptions } from "./JsonEditor";
import { ResizableSplit } from "./ResizableSplit";
import { useAppStore } from "../store/app";
import { useToastStore } from "../store/toast";
import "./stacked-diff.css";

export interface StackedDiffHandle {
  goChange: (dir: "next" | "previous") => void;
}

interface StackedDiffProps {
  original: string;
  modified: string;
  language?: string;
  /** 外部变更跳转句柄（上下切换变更块） */
  handleRef?: React.MutableRefObject<StackedDiffHandle | null>;
}

interface ChangeItem {
  originalStart: number;
  originalEnd: number;
  modifiedStart: number;
  modifiedEnd: number;
}

interface SideStats {
  removed: number;
  added: number;
  leftTotal: number;
  rightTotal: number;
}

/**
 * 上下堆叠的文本比对：上方原文本（删除行红底）、下方改后文本（新增行绿底）。
 * 变更数据来自离屏 Monaco diff（与并排视图同源算法），仅用于上色与导航。
 */
export function StackedDiff({ original, modified, language = "text", handleRef }: StackedDiffProps) {
  const theme = useAppStore((s) => s.theme);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const origEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const modEditorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const origDecoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const modDecoRef = useRef<editor.IEditorDecorationsCollection | null>(null);
  const changesRef = useRef<ChangeItem[]>([]);
  // -1 表示尚未定位过：首次「下一个」应到首个变更，「上一个」应到最后一个
  const navIdxRef = useRef(-1);
  const [stats, setStats] = useState<SideStats | null>(null);

  const appTheme = theme === "dark" ? "devbox-dark" : "devbox-light";

  // 主题切换跟随（编辑器由本组件直接 create，需手动同步主题）
  useEffect(() => {
    origEditorRef.current?.updateOptions({ theme: appTheme });
    modEditorRef.current?.updateOptions({ theme: appTheme });
  }, [appTheme]);

  // 挂载两侧只读编辑器 + 离屏 diff 计算变更、上色
  useEffect(() => {
    if (!topRef.current || !bottomRef.current) return;
    const origModel = monaco.editor.createModel(original, language);
    const modModel = monaco.editor.createModel(modified, language);
    const origEditor = monaco.editor.create(topRef.current, {
      ...editorOptions,
      model: origModel,
      readOnly: true,
      theme: appTheme,
    });
    const modEditor = monaco.editor.create(bottomRef.current, {
      ...editorOptions,
      model: modModel,
      readOnly: true,
      theme: appTheme,
    });
    origEditorRef.current = origEditor;
    modEditorRef.current = modEditor;

    // 离屏 Monaco diff（仅计算，不渲染）：拿行级变更做红/绿上色与导航定位
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:-99999px;top:0;width:8px;height:8px;";
    document.body.appendChild(probe);
    const diffEditor = monaco.editor.createDiffEditor(probe, {
      readOnly: true,
      originalEditable: false,
      renderSideBySide: true,
    });
    diffEditor.setModel({ original: origModel, modified: modModel });

    let disposed = false;
    const apply = () => {
      if (disposed) return;
      const changes = diffEditor.getLineChanges();
      if (!changes) return;
      const items: ChangeItem[] = [];
      let removed = 0;
      let added = 0;
      for (const c of changes) {
        items.push({
          originalStart: c.originalStartLineNumber,
          originalEnd: c.originalEndLineNumber,
          modifiedStart: c.modifiedStartLineNumber,
          modifiedEnd: c.modifiedEndLineNumber,
        });
        if (c.originalEndLineNumber > 0) removed += c.originalEndLineNumber - c.originalStartLineNumber + 1;
        if (c.modifiedEndLineNumber > 0) added += c.modifiedEndLineNumber - c.modifiedStartLineNumber + 1;
      }
      changesRef.current = items;
      navIdxRef.current = -1;
      setStats({ removed, added, leftTotal: origModel.getLineCount(), rightTotal: modModel.getLineCount() });

      const origDecos: editor.IModelDeltaDecoration[] = [];
      const modDecos: editor.IModelDeltaDecoration[] = [];
      for (const c of changes) {
        if (c.originalEndLineNumber > 0) {
          origDecos.push({
            range: new monaco.Range(c.originalStartLineNumber, 1, c.originalEndLineNumber, 1),
            options: { isWholeLine: true, className: "stacked-removed" },
          });
        }
        if (c.modifiedEndLineNumber > 0) {
          modDecos.push({
            range: new monaco.Range(c.modifiedStartLineNumber, 1, c.modifiedEndLineNumber, 1),
            options: { isWholeLine: true, className: "stacked-added" },
          });
        }
      }
      origDecoRef.current?.clear();
      origDecoRef.current = origEditor.createDecorationsCollection(origDecos);
      modDecoRef.current?.clear();
      modDecoRef.current = modEditor.createDecorationsCollection(modDecos);
    };
    const sub = diffEditor.onDidUpdateDiff(apply);
    apply();

    return () => {
      disposed = true;
      sub.dispose();
      diffEditor.dispose();
      origModel.dispose();
      modModel.dispose();
      probe.remove();
      origEditor.dispose();
      modEditor.dispose();
      origEditorRef.current = null;
      modEditorRef.current = null;
      origDecoRef.current = null;
      modDecoRef.current = null;
    };
    // appTheme 变化由上方主题 effect 同步，无需在此重建编辑器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [original, modified, language]);

  // 外部「上一个/下一个变更」导航：两侧同时定位到对应 hunk 中心
  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      goChange: (dir) => {
        const changes = changesRef.current;
        if (changes.length === 0) return;
        const n = changes.length;
        // 首次定位：下一个→首个变更，上一个→最后一个；此后按方向循环
        const idx =
          navIdxRef.current < 0
            ? dir === "next"
              ? 0
              : n - 1
            : (navIdxRef.current + (dir === "next" ? 1 : -1) + n) % n;
        navIdxRef.current = idx;
        const c = changes[idx]!;
        const origEditor = origEditorRef.current;
        const modEditor = modEditorRef.current;
        if (c.originalEnd > 0 && origEditor) {
          origEditor.revealLineInCenter(Math.round((c.originalStart + c.originalEnd) / 2), 0);
          origEditor.focus();
        }
        if (c.modifiedEnd > 0 && modEditor) {
          modEditor.revealLineInCenter(Math.round((c.modifiedStart + c.modifiedEnd) / 2), 0);
          modEditor.focus();
        }
      },
    };
    return () => {
      if (handleRef) handleRef.current = null;
    };
  }, [handleRef]);

  const copySide = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => useToastStore.getState().showToast("已复制该侧文本"))
      .catch(() => {});
  };

  const renderPane = (
    label: string,
    signClass: string,
    signText: string,
    total: number,
    copyText: string,
    editorRef: React.RefObject<HTMLDivElement | null>,
  ) => (
    <div className="pane">
      <div className="pane-title">
        {label}
        {stats && (
          <span className="hint">
            变更 <span className={signClass}>{signText}</span> · 总 {total} 行
          </span>
        )}
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => copySide(copyText)}>
          复制
        </button>
      </div>
      <div ref={editorRef} className="stacked-editor" />
    </div>
  );

  return (
    <ResizableSplit
      direction="column"
      style={{ flex: 2 }}
      left={renderPane("原文本", "diff-stats-removed", `−${stats?.removed ?? 0}`, stats?.leftTotal ?? 0, original, topRef)}
      right={renderPane("改后文本", "diff-stats-added", `+${stats?.added ?? 0}`, stats?.rightTotal ?? 0, modified, bottomRef)}
    />
  );
}
