import { useEffect, useMemo, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useAppStore } from "../store/app";
import type { ParseError } from "../types";

export const editorOptions: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 14,
  scrollBeyondLastLine: false,
  wordWrap: "on",
  renderWhitespace: "none",
  lineNumbersMinChars: 3,
  // 容器尺寸变化（如分栏拖拽）时自动重算布局，否则高亮/可见区域会错位
  automaticLayout: true,
};

interface JsonEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: number | string;
  onMount?: OnMount;
  language?: string;
  /** 解析错误：非空时自动定位光标到出错行列 */
  error?: ParseError | null;
}

/**
 * 统一封装的 Monaco 编辑器（默认 JSON），主题跟随全局设置。
 *
 * 编辑器内部走「非受控」模式：用户键入由 Monaco 自己维护，onChange 只上报；
 * 仅当外部回填（历史加载/解析结果/去转义）时才把 value 写回 model。
 * 避免 @monaco-editor/react 受控模式在每次按键时对全文档 getValue()/executeEdits，
 * 大文档下这是卡顿与高亮失效的直接来源。
 */
export function JsonEditor({
  value,
  onChange,
  readOnly,
  height = "100%",
  onMount,
  language = "json",
  error,
}: JsonEditorProps) {
  const theme = useAppStore((s) => s.theme);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // 上一次 Editor 已持有的值：与外部 value 比对，仅在不一致（外部变更）时回写
  const modelValueRef = useRef(value);
  // 最新外部 value：handleMount 闭包可能滞后于重渲染（@monaco-editor/react 的 onMount 只取首次渲染闭包），
  // 用 ref 取最新值，避免历史加载等场景把已创建的最新 model 覆盖回旧值/空
  const valueRef = useRef(value);
  valueRef.current = value;

  // 稳定 options 引用：避免每次按键重渲染都触发 @monaco-editor/react 的 updateOptions effect
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(
    () => ({
      ...editorOptions,
      readOnly: readOnly ?? false,
      // 关闭 Monaco 自带的文件拖放，避免拦截应用级拖拽
      dropIntoEditor: { enabled: false },
    }),
    [readOnly],
  );

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    // 挂载即用外部最新值初始化 model（defaultValue 之外的场景，如初始 draft / 历史加载）
    if (ed.getValue() !== valueRef.current) ed.setValue(valueRef.current);
    modelValueRef.current = ed.getValue();
    onMount?.(ed, monaco);
  };

  // 外部变更（而非用户键入）时才把 value 写回 model；用户键入路径由 onChange 维护 modelValueRef
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (value === modelValueRef.current) return;
    ed.setValue(value);
    modelValueRef.current = value;
  }, [value]);

  // 解析错误时定位光标到出错行列
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || !error) return;
    const line = Math.max(1, error.line);
    const col = Math.max(1, error.column);
    ed.revealPositionInCenter({ lineNumber: line, column: col }, 0);
    ed.setPosition({ lineNumber: line, column: col });
    ed.focus();
  }, [error]);

  return (
    <Editor
      height={height}
      language={language}
      theme={theme === "dark" ? "devbox-dark" : "devbox-light"}
      defaultValue={value}
      onChange={(v) => {
        const next = v ?? "";
        modelValueRef.current = next;
        onChange?.(next);
      }}
      onMount={handleMount}
      options={options}
    />
  );
}