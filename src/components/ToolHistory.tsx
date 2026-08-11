import { useCallback, useMemo, useState } from "react";
import { Popover } from "@base-ui/react/popover";
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

const IconClock = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
  >
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3l2 2" />
  </svg>
);

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

  const toolItems = useMemo(() => {
    const base = items.filter((it) => it.toolId === toolId);
    if (!query.trim()) return base;
    const q = query.toLowerCase();
    return base.filter((it) =>
      [it.toolName, it.action, it.preview].some((f) => f.toLowerCase().includes(q)),
    );
  }, [items, toolId, query]);

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
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="tool-history-btn btn" title="查看该工具的历史记录">
        <IconClock />
        历史
        {toolItems.length > 0 && <span className="tool-history-count">{toolItems.length}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="pop-positioner" side="bottom" align="end" sideOffset={6}>
          <Popover.Popup className="tool-history-dropdown">
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
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
