import { useRef } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useAppStore } from "../store/app";

interface TextDiffEditorProps {
  original: string;
  modified: string;
  height?: number | string;
  language?: string;
  /** 挂载后写入 diff 编辑器实例，供外部 revealLine 导航 */
  editorRef?: React.MutableRefObject<editor.IStandaloneDiffEditor | null>;
}

/** 基于 Monaco DiffEditor 的左右分栏比对视图，主题跟随全局设置 */
export function TextDiffEditor({
  original,
  modified,
  height = "100%",
  language = "json",
  editorRef,
}: TextDiffEditorProps) {
  const theme = useAppStore((s) => s.theme);
  const internalRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  const handleMount: DiffOnMount = (ed) => {
    internalRef.current = ed;
    if (editorRef) editorRef.current = ed;
  };

  return (
    <DiffEditor
      height={height}
      language={language}
      theme={theme === "dark" ? "devbox-dark" : "devbox-light"}
      original={original}
      modified={modified}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        readOnly: true,
        renderSideBySide: true,
        renderOverviewRuler: true,
      }}
    />
  );
}
