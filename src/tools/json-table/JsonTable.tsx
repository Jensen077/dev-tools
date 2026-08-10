import { useCallback, useRef, useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { ResizableSplit } from "../../components/ResizableSplit";
import { useFileDrop } from "../../hooks/useFileDrop";
import "../tool.css";

/** 递归扁平化对象，嵌套 key 用 `.` 连接，返回表头列 */
function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (obj === null) {
    out[prefix] = "";
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object") {
        flatten(v, key, out);
      } else {
        out[key] = v === null ? "" : String(v);
      }
    }
    return out;
  }
  out[prefix] = String(obj);
  return out;
}

/** 数组 → 行对象数组（统一所有行的列） */
export function toRows(data: unknown): Record<string, string>[] {
  const arr = Array.isArray(data) ? data : [data];
  const rows = arr.map((item) => flatten(item));
  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return rows.map((r) => {
    const row: Record<string, string> = {};
    for (const h of headers) row[h] = r[h] ?? "";
    return row;
  });
}

export function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const first = rows[0] ?? {};
  const headers = Object.keys(first);
  const escape = (s: string) => {
    // 防止 CSV 公式注入：以 = + - @ 或制表符/回车开头的单元格前缀单引号
    let v = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    if (/[",\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [headers.map(escape).join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

export function toJsonl(rows: Record<string, string>[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n");
}

export function JsonTable() {
  const savedDraft = useAppStore((s) => s.drafts["json-table"]) as Record<string, unknown> | undefined;
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);

  // 历史「加载」回填输入
  useApplyHistory("json-table", ({ input }) => setInput(input ?? ""));

  const loadFile = useCallback(async (file: File) => {
    setInput(await file.text());
  }, []);

  const { bindDrop, isDragging } = useFileDrop({ onFile: loadFile, accept: [".json", ".txt"] });

  const parse = useCallback(() => {
    setError(null);
    try {
      const data = JSON.parse(input);
      setRows(toRows(data));
      addHistory({
        toolId: "json-table",
        toolName: "表格导出",
        action: "转表格",
        payload: { input },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows(null);
    }
  }, [input]);

  const download = useCallback((content: string, name: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  useSaveDraft("json-table", { input });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={parse}>
          转表格
          <span className="btn-hotkey">⌘↩</span>
        </button>
        {rows && (
          <>
            <button className="btn" onClick={() => download(toCsv(rows), "export.csv", "text/csv")}>导出 CSV</button>
            <button className="btn" onClick={() => download(toJsonl(rows), "export.jsonl", "application/x-ndjson")}>
              导出 JSONL
            </button>
            <span className="hint">{rows.length} 行</span>
          </>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>打开文件</button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => e.target.files?.[0] && e.target.files[0].text().then(setInput)}
        />
        <ToolHistory toolId="json-table" />
      </div>
      {error && <div className="error-box">解析失败: {error}</div>}
      {isDragging && <div className="drop-hint">松开以载入文件</div>}
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">JSON 输入（对象或数组）</div>
            <div className="drop-zone" {...bindDrop}>
              <JsonEditor value={input} onChange={setInput} />
            </div>
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">表格预览</div>
            {rows ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {Object.keys(rows[0] ?? {}).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        {Object.values(r).map((v, j) => (
                          <td key={j}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">📊</span>
                点击「转表格」查看预览
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
