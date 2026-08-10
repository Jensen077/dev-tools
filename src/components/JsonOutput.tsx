import { JsonEditor } from "./JsonEditor";

/** 只读 JSON 文本输出面板 */
export function JsonOutput({ value }: { value: string }) {
  return <JsonEditor value={value} readOnly />;
}