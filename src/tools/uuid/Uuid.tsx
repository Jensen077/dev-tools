import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { useToastStore } from "../../store/toast";
import { ToolHistory } from "../../components/ToolHistory";
import "../tool.css";

/** 固定 4 种格式：小写/大写 × 带连字符/无连字符 */
const FORMATS: { key: string; label: string; fmt: (u: string) => string }[] = [
  { key: "lowerHyphen", label: "小写 · 带 -", fmt: (u) => u },
  { key: "upperHyphen", label: "大写 · 带 -", fmt: (u) => u.toUpperCase() },
  { key: "lowerBare", label: "小写 · 无 -", fmt: (u) => u.replace(/-/g, "") },
  { key: "upperBare", label: "大写 · 无 -", fmt: (u) => u.replace(/-/g, "").toUpperCase() },
];

/** 生成一个 RFC 4122 v4 UUID（crypto.randomUUID 在非安全上下文可能缺失，用 getRandomValues 自实现） */
function randomUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 一次性生成 4 种格式（每格一条独立随机 UUID） */
function generateBatch(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of FORMATS) out[f.key] = f.fmt(randomUuid());
  return out;
}

export function Uuid() {
  const savedDraft = useAppStore((s) => s.drafts["uuid"]) as Record<string, unknown> | undefined;
  const [values, setValues] = useState<Record<string, string>>(
    () => (savedDraft?.values as Record<string, string>) ?? {},
  );
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);
  // 标记本次挂载是否来自历史「加载」，避免挂载时自动生成覆盖历史回填
  const historyAppliedRef = useRef(false);

  useApplyHistory("uuid", (payload) => {
    historyAppliedRef.current = true;
    setValues(Object.fromEntries(FORMATS.map((f) => [f.key, payload[f.key] ?? ""])));
  });

  const regenerate = useCallback(() => setValues(generateBatch()), []);
  const hasValues = Object.values(values).some((v) => v);

  // 打开工具时若无历史结果则自动生成一批
  useEffect(() => {
    if (!hasValues && !historyAppliedRef.current) regenerate();
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyOne = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`已复制「${FORMATS.find((f) => f.key === key)?.label}」`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  const copyAll = async () => {
    const rows = FORMATS.map((f) => values[f.key]).filter((v): v is string => Boolean(v));
    if (rows.length === 0) return;
    try {
      await navigator.clipboard.writeText(rows.join("\n"));
      showToast(`已复制 ${rows.length} 条 UUID`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  const run = () => {
    const batch = generateBatch();
    setValues(batch);
    addHistory({
      toolId: "uuid",
      toolName: "UUID",
      action: "生成 UUID（4 种格式）",
      payload: batch,
    });
  };

  useSaveDraft("uuid", { values });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn btn-primary" data-hotkey="run" onClick={run}>
          生成一批
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <button className="btn" data-hotkey="copy" onClick={copyAll} disabled={!hasValues}>
          复制全部
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <span className="spacer" />
        <ToolHistory toolId="uuid" />
      </div>
      <div className="pane">
        <div className="pane-title">随机 UUID（4 种格式，每格独立随机）</div>
        {!hasValues ? (
          <div className="empty-state">
            <span className="empty-icon">🆔</span>
            点击「生成一批」生成随机 UUID
          </div>
        ) : (
          <div className="hash-list">
            {FORMATS.map((f) => (
              <div key={f.key} className="hash-item">
                <span className="hash-key" style={{ width: "auto" }}>
                  {f.label}
                </span>
                <code className="hash-value" title={values[f.key]}>
                  {values[f.key]}
                </code>
                <button className="btn btn-sm" onClick={() => copyOne(f.key, values[f.key]!)}>
                  复制
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}