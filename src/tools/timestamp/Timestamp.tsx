import { useMemo, useState } from "react";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import "../tool.css";

const MAX_SAFE_MS = 8_640_000_000_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function Timestamp() {
  const savedDraft = useAppStore((s) => s.drafts["timestamp"]) as Record<string, unknown> | undefined;
  const [tsInput, setTsInput] = useState((savedDraft?.tsInput as string) ?? "");
  const [dtInput, setDtInput] = useState((savedDraft?.dtInput as string) ?? "");
  const addHistory = useHistoryStore((s) => s.addHistory);

  useApplyHistory("timestamp", ({ input }) => setTsInput(input ?? ""));

  // 「记录」当前输入到历史（供右上角历史按钮找回）
  const record = () => {
    const input = tsInput;
    if (!input.trim()) return;
    addHistory({
      toolId: "timestamp",
      toolName: "时间戳",
      action: "转换",
      payload: { input },
    });
  };

  // 时间戳 → 日期（支持秒/毫秒，自动识别量级）
  const fromTs = useMemo(() => {
    if (!tsInput.trim()) return null;
    const raw = Number(tsInput.trim());
    if (!Number.isFinite(raw)) return { error: "请输入数字" };
    const ms =
      raw > MAX_SAFE_MS ? raw / 1000 : raw < -MAX_SAFE_MS ? raw * 1000 : raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { error: "非法时间戳" };
    return {
      ms,
      iso: d.toISOString(),
      local: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      utc: d.toUTCString(),
      relative: diffLabel(d.getTime() - Date.now()),
    };
  }, [tsInput]);

  // 日期 → 时间戳
  const toTs = useMemo(() => {
    if (!dtInput) return null;
    const d = new Date(dtInput);
    if (Number.isNaN(d.getTime())) return { error: "非法日期" };
    return {
      seconds: Math.floor(d.getTime() / 1000),
      ms: d.getTime(),
    };
  }, [dtInput]);

  useSaveDraft("timestamp", { tsInput, dtInput });

  return (
    <div className="tool-page">
      <div className="pane-title">时间戳 → 日期（秒/毫秒自动识别）</div>
      <div className="toolbar">
        <input
          className="text-input"
          value={tsInput}
          onChange={(e) => setTsInput(e.target.value)}
          placeholder="例如 1723084800000 或 1723084800"
        />
        <button className="btn" onClick={record} disabled={!tsInput.trim()}>
          记录
        </button>
        <span className="spacer" />
        <ToolHistory toolId="timestamp" />
      </div>
      {fromTs && (
        <div className="kv-list">
          {"error" in fromTs ? (
            <div className="error-box">{fromTs.error}</div>
          ) : (
            <>
              <div className="kv-item">
                <span className="kv-key">本地时间</span>
                <span className="kv-value">{fromTs.local}</span>
              </div>
              <div className="kv-item">
                <span className="kv-key">UTC</span>
                <span className="kv-value">{fromTs.utc}</span>
              </div>
              <div className="kv-item">
                <span className="kv-key">ISO</span>
                <span className="kv-value">{fromTs.iso}</span>
              </div>
              <div className="kv-item">
                <span className="kv-key">相对当前</span>
                <span className="kv-value">{fromTs.relative}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="pane-title" style={{ marginTop: 12 }}>
        日期 → 时间戳
      </div>
      <div className="toolbar">
        <input
          className="text-input"
          type="datetime-local"
          value={dtInput}
          onChange={(e) => setDtInput(e.target.value)}
        />
      </div>
      {toTs && (
        <div className="kv-list">
          {"error" in toTs ? (
            <div className="error-box">{toTs.error}</div>
          ) : (
            <>
              <div className="kv-item">
                <span className="kv-key">秒</span>
                <span className="kv-value">{toTs.seconds}</span>
              </div>
              <div className="kv-item">
                <span className="kv-key">毫秒</span>
                <span className="kv-value">{toTs.ms}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 与当前时间的相对差（过去/未来） */
function diffLabel(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const s = Math.floor(abs / 1000);
  const past = diffMs < 0 ? "已过去" : "之后";
  if (s < 60) return `${past} ${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${past} ${m} 分 ${s % 60} 秒`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${past} ${h} 时 ${m % 60} 分`;
  const d = Math.floor(h / 24);
  return `${past} ${d} 天 ${h % 24} 时`;
}
