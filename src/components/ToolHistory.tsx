import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistoryStore, type HistoryItem } from "../store/history";
import { useToastStore } from "../store/toast";
import "./tool-history.css";

interface ToolHistoryProps {
  /** 当前工具的 toolId，用于筛选历史 */
  toolId: string;
  /** 历史为空时的提示文案（可选） */
  emptyText?: string;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 工具页右上角的「历史」按钮：点击弹出当前工具的历史记录下拉。
 * 点某条「加载」回填到当前工具的输入（走全局 history store 的 pendingLoad 机制）。
 */
export function ToolHistory({ toolId, emptyText = "暂无该工具的历史记录" }: ToolHistoryProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const items = useHistoryStore((s) => s.items);
  const loadFromHistory = useHistoryStore((s) => s.loadFromHistory);
  const removeItem = useHistoryStore((s) => s.removeItem);
  const showToast = useToastStore((s) => s.showToast);
  const rootRef = useRef<HTMLDivElement>(null);

  const toolItems = useMemo(() => {
    const base = items.filter((it) => it.toolId === toolId);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((it) =>
      [it.toolName, it.action, it.preview].some((f) => f.toLowerCase().includes(q)),
    );
  }, [items, toolId, query]);

  // 点击组件外部时关闭下拉
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const load = useCallback(
    (item: HistoryItem) => {
      setOpen(false);
      loadFromHistory(item);
      showToast("已加载历史记录");
    },
    [loadFromHistory, showToast],
  );

  const hasItems = items.filter((it) => it.toolId === toolId).length > 0;

  return (
    <div className="tool-history" ref={rootRef}>
      <button className="tool-history-btn btn" onClick={() => setOpen((v) => !v)} title="查看该工具的历史记录">
        🕘 历史
        {toolItems.length > 0 && <span className="tool-history-count">{toolItems.length}</span>}
      </button>
      {open && (
        <div className="tool-history-dropdown">
          {hasItems && (
            <input
              className="tool-history-search"
              type="text"
              placeholder="搜索历史记录…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}
          {toolItems.length === 0 ? (
            <div className="tool-history-empty">{hasItems ? "无匹配结果" : emptyText}</div>
          ) : (
            <>
              {toolItems.slice(0, 20).map((item) => (
                <div key={item.id} className="tool-history-item">
                  <div className="tool-history-head">
                    <span className="hint">{item.action}</span>
                    <span className="hint">{fmtTime(item.timestamp)}</span>
                  </div>
                  <div className="tool-history-preview" title={Object.values(item.payload)[0] ?? ""}>
                    {item.preview || "（空输入）"}
                  </div>
                  <div className="tool-history-actions">
                    <button className="btn btn-sm" onClick={() => load(item)}>
                      加载
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeItem(item.id)}>
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {toolItems.length > 20 && (
                <div className="tool-history-empty">仅显示最近 20 条，共 {toolItems.length} 条</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}