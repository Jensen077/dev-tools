import { useCallback, useMemo, useState } from "react";
import { useHistoryStore, type HistoryItem } from "../../store/history";
import "../tool.css";

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function History() {
  const [query, setQuery] = useState("");
  const items = useHistoryStore((s) => s.items);
  const loadFromHistory = useHistoryStore((s) => s.loadFromHistory);
  const removeItem = useHistoryStore((s) => s.removeItem);
  const clearHistory = useHistoryStore((s) => s.clearHistory);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((it) =>
      [it.toolName, it.action, it.preview].some((f) => f.toLowerCase().includes(q)),
    );
  }, [items, query]);

  const copyInput = useCallback(async (item: HistoryItem) => {
    const first = Object.values(item.payload)[0] ?? "";
    try {
      await navigator.clipboard.writeText(first);
    } catch {
      // 剪贴板不可用时忽略
    }
  }, []);

  return (
    <div className="tool-page">
      <div className="toolbar">
        <input
          className="text-input"
          type="text"
          placeholder="搜索历史记录…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn-danger" onClick={clearHistory} disabled={items.length === 0}>
          清空历史
        </button>
        <span className="hint">共 {items.length} 条（最多 30 条）</span>
        <span className="hint">点击「加载」可回到对应工具并还原当时的输入</span>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🕘</span>
          暂无历史记录，执行工具操作后会自动记录
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔎</span>
          无匹配结果
        </div>
      ) : (
        <div className="match-list">
          {filtered.map((item) => (
            <div key={item.id} className="match-item">
              <div className="match-actions">
                <span className="badge">{item.toolName}</span>
                <span className="hint">{item.action}</span>
                <span className="hint">{fmtTime(item.timestamp)}</span>
                <span className="spacer" />
                <button className="btn btn-sm" onClick={() => loadFromHistory(item)}>加载</button>
                <button className="btn btn-sm" onClick={() => copyInput(item)}>复制输入</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeItem(item.id)}>删除</button>
              </div>
              <div className="match-preview" title={Object.values(item.payload)[0] ?? ""}>
                {item.preview}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}