import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useToastStore } from "../../store/toast";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { TIMEZONES, diffLabel, fmtAtOffset, fmtLocal, fmtUTC, parseSmart } from "./datetime";
import "../tool.css";

/// 年份下拉范围（含 1970 前后的常用区间）
const YEARS: number[] = Array.from({ length: 201 }, (_, i) => 1900 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES_SECONDS = Array.from({ length: 60 }, (_, i) => i);

/** UTC 选择器的字段集合 */
type Field = "y" | "mo" | "d" | "h" | "mi" | "s";

export function Timestamp() {
  const savedDraft = useAppStore((s) => s.drafts["timestamp"]) as Record<string, unknown> | undefined;
  // 旧版草稿只有 tsInput 字段，做一次回落迁移
  const [input, setInput] = useState(
    (savedDraft?.input as string) ?? (savedDraft?.tsInput as string) ?? ""
  );
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  useApplyHistory("timestamp", ({ input }) => setInput(input ?? ""));

  // 智能解析：null = 空输入；{ error } = 无法识别；{ ms } = 成功
  const parsed = useMemo(() => parseSmart(input), [input]);
  const ms = parsed && "ms" in parsed ? parsed.ms : null;

  // 选择器在解析失败/空输入时保持上次有效时间（初始为当前时刻）
  const [fallbackMs, setFallbackMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (ms !== null) setFallbackMs(ms);
  }, [ms]);
  const viewMs = ms ?? fallbackMs;

  /** 修改选择器某字段：用 UTC 字段重组时间并覆写输入框（Date.UTC 自动归一化 2 月 30 日等） */
  const setField = (field: Field, value: number) => {
    const vd = new Date(viewMs);
    const parts = {
      y: vd.getUTCFullYear(),
      mo: vd.getUTCMonth() + 1,
      d: vd.getUTCDate(),
      h: vd.getUTCHours(),
      mi: vd.getUTCMinutes(),
      s: vd.getUTCSeconds(),
    };
    parts[field] = value;
    const t = Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h, parts.mi, parts.s, Math.floor(viewMs % 1000));
    setInput(fmtUTC(t));
  };

  // 快捷按钮：填入当前时刻 / UTC 今日零点（无时区输入按 UTC 解析，故填 UTC 字符串保持一致）
  const fillNow = () => setInput(fmtUTC(Date.now()));
  const fillTodayZero = () => {
    const d = new Date();
    setInput(fmtUTC(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
  };

  // 「记录」当前输入到历史（供右上角历史按钮找回）
  const record = () => {
    if (!input.trim()) return;
    addHistory({
      toolId: "timestamp",
      toolName: "时间戳",
      action: "转换",
      payload: { input },
    });
  };

  // 点击复制（仓库统一的剪贴板 + toast 模式）
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`已复制${label}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "复制失败", "error");
    }
  };

  useSaveDraft("timestamp", { input });

  // 选择器当前 UTC 字段
  const vd = new Date(viewMs);
  const sel = {
    y: vd.getUTCFullYear(),
    mo: vd.getUTCMonth() + 1,
    d: vd.getUTCDate(),
    h: vd.getUTCHours(),
    mi: vd.getUTCMinutes(),
    s: vd.getUTCSeconds(),
  };

  // 解析结果行（点击复制）
  const resultRows =
    ms === null
      ? []
      : [
          { key: "毫秒", value: String(ms) },
          { key: "秒", value: String(Math.floor(ms / 1000)) },
          { key: "ISO 8601", value: new Date(ms).toISOString() },
          { key: "UTC 时间", value: fmtUTC(ms) },
          { key: "本地时间", value: fmtLocal(ms) },
          { key: "相对当前", value: diffLabel(ms - Date.now()) },
        ];

  // 本地时区偏移（分钟），与时区卡片精确匹配才高亮
  const localOffsetMin = -new Date().getTimezoneOffset();

  const fieldSelect = (field: Field, label: string, options: number[]) => (
    <label className="ts-field">
      {label}
      <select
        value={String(sel[field])}
        onChange={(e) => setField(field, Number(e.target.value))}
      >
        {options.map((v) => (
          <option key={v} value={String(v)}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="tool-page">
      <div className="pane-title">时间戳 / 日期 智能解析（无时区的输入按 UTC 解析）</div>
      <div className="toolbar">
        <input
          className="text-input ts-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="如 1723084800000 / 1723084800 / 2024-08-08 12:30:45 / 2024/8/8 / 20240808123045 / 2024-08-08T12:30:45+08:00"
        />
        <button className="btn" onClick={fillNow} title="填入当前时刻（UTC）">
          现在
        </button>
        <button className="btn" onClick={fillTodayZero} title="UTC 今日 00:00:00">
          今天 00:00
        </button>
        <button className="btn" onClick={record} disabled={!input.trim()}>
          记录
        </button>
        <span className="spacer" />
        <ToolHistory toolId="timestamp" />
      </div>
      {parsed && (
        <div className="kv-list ts-result">
          {"error" in parsed ? (
            <div className="error-box">{parsed.error}</div>
          ) : (
            resultRows.map((r) => (
              <div
                key={r.key}
                className="kv-item kv-copy"
                onClick={() => copy(r.value, r.key)}
                title="点击复制"
              >
                <span className="kv-key">{r.key}</span>
                <span className="kv-value">{r.value}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="pane-title">时间选择器（UTC，与上方输入双向同步）</div>
      <div className="toolbar">
        {fieldSelect("y", "年", YEARS)}
        {fieldSelect("mo", "月", MONTHS)}
        {fieldSelect("d", "日", DAYS)}
        <span className="ts-sep">-</span>
        {fieldSelect("h", "时", HOURS)}
        {fieldSelect("mi", "分", MINUTES_SECONDS)}
        {fieldSelect("s", "秒", MINUTES_SECONDS)}
      </div>

      {ms !== null && (
        <>
          <div className="pane-title">世界时区（UTC-12 ~ UTC+12，点击复制该时区时间）</div>
          <div className="tz-grid">
            {TIMEZONES.map((tz) => {
              const isLocal = tz.offset * 60 === localOffsetMin;
              const offLabel = `UTC${tz.offset >= 0 ? "+" : ""}${tz.offset}`;
              const time = fmtAtOffset(ms, tz.offset * 60);
              return (
                <button
                  key={tz.offset}
                  className={`tz-card${isLocal ? " local" : ""}`}
                  onClick={() => copy(time, `${offLabel} ${tz.label}时间`)}
                  title="点击复制"
                >
                  <span className="tz-label">
                    {offLabel} · {tz.label}
                    {isLocal ? "（本地）" : ""}
                  </span>
                  <span className="tz-time">{time}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
