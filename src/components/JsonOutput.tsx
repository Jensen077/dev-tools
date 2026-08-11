import { JsonEditor } from "./JsonEditor";
import type { editor } from "monaco-editor";

/** 只读 JSON 文本输出面板 */
export function JsonOutput({
  value,
  editorRef,
}: {
  value: string;
  /** 挂载后写入 Monaco 编辑器实例，供外部触发折叠/定位等操作 */
  editorRef?: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
}) {
  return (
    <JsonEditor
      value={value}
      readOnly
      onMount={(ed) => {
        if (editorRef) editorRef.current = ed;
      }}
    />
  );
}
