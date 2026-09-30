import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { useToastStore } from "../../store/toast";
import { ToolHistory } from "../../components/ToolHistory";
import {
  formatLuhn,
  generateLuhn,
  parseTemplate,
  validateNumbers,
  type LuhnRow,
} from "../../utils/luhn";
import "../tool.css";

type Mode = "gen" | "check";

/** 默认模板：任意前缀 + 尾部 x 占位（末位自动补 Luhn 校验位） */
const DEFAULT_TEMPLATE = "400004xxxxxxxxxx";
const COUNT_OPTIONS = [1, 3, 5, 10];
/** 快速示例模板（任意前缀，仅作占位用法演示） */
const QUICK_TEMPLATES = [
  "400004xxxxxxxxxx",
  "424242xxxx xxxx xx",
  "1234 5678 xxxx xxxx",
  "0000000000100xx",
];
/** 校验结果最多渲染行数 */
const MAX_CHECK_ROWS = 200;

export function Luhn() {
  const savedDraft = useAppStore((s) => s.drafts["luhn"]) as Record<string, unknown> | undefined;
  const [mode, setMode] = useState<Mode>((savedDraft?.mode as Mode) ?? "gen");
  const [template, setTemplate] = useState((savedDraft?.template as string) ?? DEFAULT_TEMPLATE);
  const [count, setCount] = useState((savedDraft?.count as number) ?? 3);
  const [rows, setRows] = useState<LuhnRow[]>([]);
  const [checkInput, setCheckInput] = useState((savedDraft?.checkInput as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);
  const historyAppliedRef = useRef(false);

  const parsed = useMemo(() => parseTemplate(template), [template]);
  const checked = useMemo(() => validateNumbers(checkInput), [checkInput]);
  const okCount = checked.filter((r) => r.ok).length;

  useApplyHistory("luhn", (payload) => {
    historyAppliedRef.current = true;
    if (payload.mode === "gen" || payload.mode === "check") setMode(payload.mode);
    if (payload.template) setTemplate(payload.template);
    if (payload.count) setCount(Number(payload.count));
    if (payload.rows) {
      try {
        const arr = JSON.parse(payload.rows);
        setRows(Array.isArray(arr) ? (arr as LuhnRow[]) : []);
      } catch {
        setRows([]);
      }
    }
  });

  const run = useCallback(() => {
    const p = parseTemplate(template);
    if (!p.ok) {
      setRows([]);
      return;
    }
    setError(null);
    const batch = generateLuhn(p, count);
    setRows(batch);
    addHistory({
      toolId: "luhn",
      toolName: "Luhn 校验 & 生成",
      action: `生成 ${batch.length} 个 Luhn 数字（${p.length} 位）`,
      payload: { template, count: String(count), mode: "gen", rows: JSON.stringify(batch) },
    });
  }, [template, count, addHistory]);

  // 打开工具时若无历史结果则先给一批
  useEffect(() => {
    if (rows.length === 0 && !historyAppliedRef.current) run();
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyText = async (text: string, tip: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(tip);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const copyAll = () => {
    if (rows.length === 0) return;
    void copyText(rows.map((r) => r.number).join("\n"), `已复制 ${rows.length} 个数字`);
  };

  const copyChecked = () => {
    if (checked.length === 0) return;
    const lines = [
      ["数字", "长度", "Luhn", "说明"].join("\t"),
      ...checked.map((r) => [formatLuhn(r.digits), String(r.length), r.luhn ? "通过" : "失败", r.reason].join("\t")),
    ];
    void copyText(lines.join("\n"), `已复制 ${checked.length} 条校验结果`);
  };

  useSaveDraft("luhn", { mode, template, count, checkInput });

  const modeSwitch = (
    <span className="seg-wrap">
      <span className="seg">
        <button
          type="button"
          className={`seg-btn${mode === "gen" ? " on" : ""}`}
          onClick={() => setMode("gen")}
        >
          生成
        </button>
        <button
          type="button"
          className={`seg-btn${mode === "check" ? " on" : ""}`}
          onClick={() => setMode("check")}
        >
          校验
        </button>
      </span>
    </span>
  );

  // 两种模式共用底部声明
  const disclaimer = (
    <div className="hint">
      仅用于表单 / 接口的 Luhn 校验测试。生成的只是「能过 Luhn 的数字串」，不保证是真实卡号，禁止用于任何支付 / 授权 / 实名场景。
    </div>
  );

  if (mode === "check") {
    return (
      <div className="tool-page">
        <div className="toolbar">
          {modeSwitch}
          <button className="btn" data-hotkey="copy" onClick={copyChecked} disabled={checked.length === 0}>
            复制结果
            <span className="btn-hotkey">⇧⌘C</span>
          </button>
          <button className="btn" onClick={() => setCheckInput("")} disabled={!checkInput}>
            清空
          </button>
          <span className="spacer" />
          <ToolHistory toolId="luhn" />
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="pane">
          <div className="pane-title">
            待校验数字（每行一个，空格与 - 忽略）
            <span className="spacer" />
            {checked.length > 0 && (
              <span className="hint">
                通过 {okCount} / 共 {checked.length}
              </span>
            )}
          </div>
          <textarea
            className="text-input tc-textarea"
            value={checkInput}
            onChange={(e) => setCheckInput(e.target.value)}
            placeholder={"4242 4242 4242 4242\n4000040000000000\n1234"}
            spellCheck={false}
          />
        </div>
        <div className="pane">
          <div className="pane-title">
            校验结果（Luhn + 长度）
            <span className="spacer" />
            {checked.length > MAX_CHECK_ROWS && <span className="hint">仅显示前 {MAX_CHECK_ROWS} 行</span>}
          </div>
          {checked.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔢</span>
              粘贴数字后实时判定 Luhn 与长度，仅本地计算、不发任何网络请求
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>数字</th>
                    <th>长度</th>
                    <th>Luhn</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.slice(0, MAX_CHECK_ROWS).map((r) => (
                    <tr key={`${r.digits}-${r.raw}`}>
                      <td>{formatLuhn(r.digits)}</td>
                      <td>{r.length}</td>
                      <td>
                        <span className={`badge ${r.luhn ? "badge-added" : "badge-removed"}`}>
                          {r.luhn ? "通过" : "失败"}
                        </span>
                      </td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {disclaimer}
      </div>
    );
  }

  return (
    <div className="tool-page">
      <div className="toolbar">
        {modeSwitch}
        <button className="btn btn-primary" data-hotkey="run" onClick={run} disabled={!parsed.ok}>
          生成
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <button className="btn" data-hotkey="copy" onClick={copyAll} disabled={rows.length === 0}>
          复制全部
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <span className="spacer" />
        <ToolHistory toolId="luhn" />
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="pane">
        <div className="pane-title">模板（固定前缀 + 尾部 x 占位，末位自动补 Luhn 校验位）</div>
        <div className="toolbar">
          <input
            className="text-input tc-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder={DEFAULT_TEMPLATE}
            spellCheck={false}
          />
          <span className="seg-wrap">
            <span className="seg-label">个数</span>
            <span className="seg">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`seg-btn${count === n ? " on" : ""}`}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
            </span>
          </span>
        </div>
        <div className="toolbar tc-bins">
          <span className="seg-label">示例</span>
          {QUICK_TEMPLATES.map((q) => (
            <button
              key={q}
              type="button"
              className="algo-chip"
              title={q}
              onClick={() => setTemplate(q)}
            >
              {q}
            </button>
          ))}
        </div>
        {!parsed.ok && <div className="error-box">{parsed.error}</div>}
      </div>
      <div className="pane">
        <div className="pane-title">
          生成结果（{rows.length} 个 · {parsed.ok ? `${parsed.length} 位` : ""} · Luhn 合法）
          <span className="spacer" />
          <span className="hint">点单行复制纯数字</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🔢</span>
            写一个模板（固定段 + 尾部 x）点「生成」，得到一批过 Luhn 的数字
          </div>
        ) : (
          <div className="hash-list">
            {rows.map((r, i) => (
              <div key={`${r.number}-${i}`} className="hash-item">
                <code className="hash-value" title={r.number}>
                  {r.formatted}
                </code>
                <span className="badge badge-neutral">{r.length} 位</span>
                <button
                  className="btn btn-sm"
                  onClick={() => void copyText(r.number, "已复制数字")}
                >
                  复制
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {disclaimer}
    </div>
  );
}