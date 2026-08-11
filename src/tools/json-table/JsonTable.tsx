import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { ResizableSplit } from "../../components/ResizableSplit";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useToastStore } from "../../store/toast";
import "../tool.css";

/** 递归扁平化对象，嵌套 key 用 `.` 连接；数组折叠为单个单元格（换行拼接） */
function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (obj === null) {
    out[prefix] = "";
    return out;
  }
  if (Array.isArray(obj)) {
    // 数组不再展开索引，折叠为换行分隔；元素是对象/数组时 JSON 序列化保真
    out[prefix] = obj
      .map((v) => (v !== null && typeof v === "object" ? JSON.stringify(v) : String(v ?? "")))
      .join("\n");
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

/** 递归扁平化对象，数组字段展开为索引列（data[0].city / data[1].name），用于「整个 JSON 不解析数组」模式 */
function flattenExpand(obj: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (obj === null) {
    out[prefix] = "";
    return out;
  }
  if (Array.isArray(obj)) {
    // 数组元素按下标展开为列，嵌套数组/对象继续递归
    obj.forEach((v, i) => flattenExpand(v, `${prefix}[${i}]`, out));
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object") {
        flattenExpand(v, key, out);
      } else {
        out[key] = v === null ? "" : String(v);
      }
    }
    return out;
  }
  out[prefix] = String(obj);
  return out;
}

/** 按 `.` 路径取文档子值，空路径返回整个文档 */
function getPath(data: unknown, path: string): unknown {
  if (path === "") return data;
  let cur: unknown = data;
  for (const k of path.split(".")) {
    if (cur && typeof cur === "object" && k in cur) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** 收集文档中所有数组路径（根为数组时路径为 ""），供数据源选择 */
export function collectArrayPaths(data: unknown, prefix = "", out: string[] = []): string[] {
  if (Array.isArray(data)) {
    out.push(prefix);
    return out;
  }
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      const key = prefix ? `${prefix}.${k}` : k;
      collectArrayPaths(v, key, out);
    }
  }
  return out;
}

/** 默认数据源：根为数组→根；根对象仅一个顶层数组字段→该字段；否则整文档单行（返回 null） */
function defaultSource(data: unknown, paths: string[]): string | null {
  if (Array.isArray(data)) return "";
  const topArrays = Object.entries(data as Record<string, unknown>).filter(([, v]) => Array.isArray(v));
  if (topArrays.length === 1) return topArrays[0]![0];
  return paths[0] ?? null;
}

/** 数据源状态值：自动识别 / 整个 JSON 不解析数组（标记常量） */
export const ROWS_AUTO = "__auto__";
export const ROWS_ALL = "__all__";

/** 数据源 → 行对象数组（跨项统一列、表头 Set 去重） */
export function toRows(data: unknown, source: string | null): Record<string, string>[] {
  // 「整个 JSON 不解析数组」模式：数组字段展开为索引列；其他模式数组折叠为单格
  const flatter = source === ROWS_ALL ? flattenExpand : flatten;
  let arr: unknown;
  if (source === ROWS_ALL) {
    // 不解析数组：root 数组每项一行，root 对象单行，数组字段展开索引列
    arr = Array.isArray(data) ? data : [data];
  } else if (source === ROWS_AUTO) {
    const p = collectArrayPaths(data);
    const s = defaultSource(data, p);
    arr = s === null ? (Array.isArray(data) ? data : [data]) : getPath(data, s);
  } else {
    arr = source === null ? (Array.isArray(data) ? data : [data]) : getPath(data, source);
  }
  if (!Array.isArray(arr)) return [];
  const rows = arr.map((item) => flatter(item));
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
  const [data, setData] = useState<unknown>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragField, setDragField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef(28);
  const dragFieldRef = useRef<string | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  // 点击弹出层外部时关闭字段选择器
  useEffect(() => {
    if (!pickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

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
      const paths = collectArrayPaths(data);
      setData(data);
      setPaths(paths);
      setSource(ROWS_AUTO);
      const nextRows = toRows(data, ROWS_AUTO);
      setRows(nextRows);
      // 默认全选所有字段
      setColumnOrder(Object.keys(nextRows[0] ?? {}));
      setSelected(new Set(Object.keys(nextRows[0] ?? {})));
      setPage(0);
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

  // 切换数据源，重算行集并默认全选
  const changeSource = useCallback(
    (src: string) => {
      if (!data) return;
      setSource(src);
      const nextRows = toRows(data, src);
      setRows(nextRows);
      setColumnOrder(Object.keys(nextRows[0] ?? {}));
      setSelected(new Set(Object.keys(nextRows[0] ?? {})));
      setPage(0);
    },
    [data],
  );

  // 选择保存路径并写入文件（CSV/JSONL 导出）
  const exportFile = useCallback(
    async (content: string, name: string, filters: { name: string; extensions: string[] }[]) => {
      try {
        const path = await save({ defaultPath: name, filters });
        if (!path) return;
        await invoke("save_text_file", { path, content });
        showToast(`已保存到 ${path}`, "success", 3000);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), "error", 4000);
      }
    },
    [showToast],
  );

  useSaveDraft("json-table", { input });

  // 可见列 = 按 columnOrder 顺序过滤勾选字段
  const visibleColumns = useMemo(
    () => columnOrder.filter((h) => selected.has(h)),
    [columnOrder, selected],
  );

  // 按勾选字段与列顺序过滤行（同时约束预览与导出）
  const filteredRows = useMemo(() => {
    if (!rows) return null;
    return rows.map((r) => {
      const row: Record<string, string> = {};
      for (const k of visibleColumns) row[k] = r[k] ?? "";
      return row;
    });
  }, [rows, visibleColumns]);

  const toggleField = useCallback((h: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  }, []);

  // 去重后的完整字段表头（与列顺序一致，作为选择器列表）
  const headers = useMemo(() => columnOrder, [columnOrder]);

  // 列顺序：自绘鼠标拖拽（WKWebView 下 HTML5 DnD 不可靠）
  const dragStart = useCallback((e: React.MouseEvent, h: string) => {
    if (e.button !== 0 || dragFieldRef.current) return;
    e.preventDefault();
    const listEl = listRef.current;
    if (listEl && listEl.firstElementChild) {
      const r = listEl.firstElementChild.getBoundingClientRect();
      stepRef.current = r.height + 2;
    }
    dragFieldRef.current = h;
    setDragField(h);
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    if (!dragField) return;

    const finish = () => {
      dragFieldRef.current = null;
      setDragField(null);
      document.body.style.userSelect = "";
    };

    const onMove = (e: MouseEvent) => {
      const d = dragFieldRef.current;
      if (!d) return;
      // 鼠标在窗口外松开时 mouseup 不派发，用按钮状态兜底
      if (!(e.buttons & 1)) {
        finish();
        return;
      }
      const listEl = listRef.current;
      if (!listEl) return;
      const rect = listEl.getBoundingClientRect();
      const raw = Math.floor((e.clientY - rect.top + listEl.scrollTop) / stepRef.current);
      const target = Math.max(0, Math.min(headers.length - 1, raw));
      setColumnOrder((prev) => {
        const from = prev.indexOf(d);
        if (from < 0 || from === target) return prev;
        const next = [...prev];
        next.splice(from, 1);
        next.splice(target, 0, d);
        return next;
      });
    };

    const onUp = (e: MouseEvent) => {
      if (e.button === 0) finish();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      document.body.style.userSelect = "";
    };
  }, [dragField, columnOrder.length]);

  const selectAll = useCallback(() => setSelected(new Set(headers)), [headers]);
  const selectNone = useCallback(() => setSelected(new Set()), []);

  // 分页
  const PAGE_SIZE = 50;
  const totalPages = useMemo(() => (filteredRows ? Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)) : 1), [filteredRows]);
  const pageRows = useMemo(() => {
    if (!filteredRows) return [];
    return filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  }, [filteredRows, page]);

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={parse}>
          转表格
          <span className="btn-hotkey">⌘↩</span>
        </button>
        {filteredRows && (
          <label className="hint">
            数据源
            <select value={source ?? ""} onChange={(e) => changeSource(e.target.value)}>
              <option value={ROWS_AUTO}>自动解析数组</option>
              <option value={ROWS_ALL}>整个 JSON 不解析数组</option>
              {paths.map((p) => (
                <option key={p} value={p}>
                  {p === "" ? "根数组" : p}
                </option>
              ))}
            </select>
          </label>
        )}
        {filteredRows && (
          <>
            <button className="btn" onClick={() => exportFile(toCsv(filteredRows), "export.csv", [{ name: "CSV", extensions: ["csv"] }])}>导出 CSV</button>
            <button className="btn" onClick={() => exportFile(toJsonl(filteredRows), "export.jsonl", [{ name: "JSONL", extensions: ["jsonl"] }])}>
              导出 JSONL
            </button>
            <span className="hint">{filteredRows.length} 行</span>
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
            {filteredRows ? (
              <>
                <div className="pane-title">
                  <div className="field-picker" ref={pickerRef}>
                    <button className="btn btn-sm" onClick={() => setPickerOpen((v) => !v)}>
                      选择字段 <span className="btn-hotkey">{selected.size}/{headers.length}</span>
                    </button>
                    {pickerOpen && (
                      <div className="field-picker-pop">
                        <div className="field-picker-actions">
                          <button className="btn btn-sm" onClick={selectAll}>全选</button>
                          <button className="btn btn-sm" onClick={selectNone}>清空</button>
                          <span className="spacer" />
                          <button className="btn btn-sm btn-primary" onClick={() => setPickerOpen(false)}>完成</button>
                        </div>
                        <div className="field-picker-list" ref={listRef}>
                          {headers.map((h) => (
                            <div
                              key={h}
                              className={`field-picker-item${dragField === h ? " dragging" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(h)}
                                onChange={() => toggleField(h)}
                              />
                              <span className="field-picker-name">{h}</span>
                              <span
                                className="field-picker-drag"
                                title="拖拽排序"
                                onMouseDown={(e) => dragStart(e, h)}
                              >
                                ⋮⋮
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {visibleColumns.map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => (
                        <tr key={i}>
                          {visibleColumns.map((h) => (
                            <td key={h}>{r[h] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>上一页</button>
                  <span className="hint">第 {page + 1} / {totalPages} 页（共 {filteredRows.length} 行，每页 {PAGE_SIZE} 行）</span>
                  <button className="btn btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>下一页</button>
                </div>
              </>
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
