import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { useToastStore } from "../../store/toast";
import { ToolHistory } from "../../components/ToolHistory";
import {
  PRESET_TEST_CARDS,
  TEST_BIN_RANGES,
  formatCard,
  generateFromTemplate,
  parseTemplate,
  templateForRange,
  validateCards,
  type CardRow,
} from "../../utils/testcard";
import "../tool.css";

type Mode = "gen" | "check";

/** 默认模板：Stripe Visa 公开测试段 */
const DEFAULT_TEMPLATE = "400000xxxxxxxxxx";
const COUNT_OPTIONS = [1, 3, 5, 10];
/** 校验结果最多渲染行数（防止粘贴上万行卡死界面） */
const MAX_CHECK_ROWS = 200;

/** 单张卡片复制文本：勾选时带 有效期 / CVC（Tab 分隔，方便粘进表格） */
function rowText(r: CardRow): string {
  return [r.number, r.expiry, r.cvc].filter((v) => v).join("\t");
}

export function TestCard() {
  const savedDraft = useAppStore((s) => s.drafts["test-card"]) as Record<string, unknown> | undefined;
  const [mode, setMode] = useState<Mode>((savedDraft?.mode as Mode) ?? "gen");
  const [template, setTemplate] = useState((savedDraft?.template as string) ?? DEFAULT_TEMPLATE);
  const [count, setCount] = useState((savedDraft?.count as number) ?? 3);
  const [withExtras, setWithExtras] = useState((savedDraft?.withExtras as boolean) ?? true);
  const [rows, setRows] = useState<CardRow[]>([]);
  const [checkInput, setCheckInput] = useState((savedDraft?.checkInput as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);
  // 标记本次挂载是否来自历史「加载」，避免挂载时自动生成覆盖历史回填
  const historyAppliedRef = useRef(false);

  const parsed = useMemo(() => parseTemplate(template), [template]);
  const checked = useMemo(() => validateCards(checkInput), [checkInput]);
  const okCount = checked.filter((r) => r.ok).length;

  useApplyHistory("test-card", (payload) => {
    historyAppliedRef.current = true;
    if (payload.mode === "gen" || payload.mode === "check") setMode(payload.mode);
    if (payload.template) setTemplate(payload.template);
    if (payload.count) setCount(Number(payload.count));
    if (payload.cardRows) {
      try {
        const parsedRows = JSON.parse(payload.cardRows);
        setRows(Array.isArray(parsedRows) ? (parsedRows as CardRow[]) : []);
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
    const batch = generateFromTemplate(p, count, withExtras);
    setRows(batch);
    addHistory({
      toolId: "test-card",
      toolName: "测试卡号",
      action: `生成 ${batch.length} 张（${p.range?.brand ?? ""}）`,
      payload: {
        template,
        count: String(count),
        mode: "gen",
        cardRows: JSON.stringify(batch),
      },
    });
  }, [template, count, withExtras, addHistory]);

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
    void copyText(rows.map(rowText).join("\n"), `已复制 ${rows.length} 张测试卡号`);
  };

  /** 校验结果导出为 TSV（表头 + 每行判定） */
  const copyChecked = () => {
    if (checked.length === 0) return;
    const lines = [
      ["卡号", "卡组织", "位数", "Luhn", "测试段", "说明"].join("\t"),
      ...checked.map((r) =>
        [
          formatCard(r.digits, r.brand),
          r.brand ?? "—",
          String(r.length),
          r.luhn ? "通过" : "失败",
          r.testRange ? "是" : "否",
          r.reason,
        ].join("\t"),
      ),
    ];
    void copyText(lines.join("\n"), `已复制 ${checked.length} 条校验结果`);
  };

  useSaveDraft("test-card", { mode, template, count, withExtras, checkInput });

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

  if (mode === "check") {
    return (
      <div className="tool-page">
        <div className="toolbar">
          {modeSwitch}
          <button
            className="btn"
            data-hotkey="copy"
            onClick={copyChecked}
            disabled={checked.length === 0}
          >
            复制结果
            <span className="btn-hotkey">⇧⌘C</span>
          </button>
          <button className="btn" onClick={() => setCheckInput("")} disabled={!checkInput}>
            清空
          </button>
          <span className="spacer" />
          <ToolHistory toolId="test-card" />
        </div>
        {error && <div className="error-box">{error}</div>}
        <div className="pane">
          <div className="pane-title">
            待校验卡号（每行一个，空格与 - 忽略）
            <span className="spacer" />
            {checked.length > 0 && (
              <span className="hint">
                合法 {okCount} / 共 {checked.length}
              </span>
            )}
          </div>
          <textarea
            className="text-input tc-textarea"
            value={checkInput}
            onChange={(e) => setCheckInput(e.target.value)}
            placeholder={"4242 4242 4242 4242\n4000 0000 0000 0002"}
            spellCheck={false}
          />
        </div>
        <div className="pane">
          <div className="pane-title">
            校验结果（Luhn + 卡组织 + 测试段）
            <span className="spacer" />
            {checked.length > MAX_CHECK_ROWS && (
              <span className="hint">仅显示前 {MAX_CHECK_ROWS} 行</span>
            )}
          </div>
          {checked.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">💳</span>
              粘贴卡号后实时校验，只做 Luhn / 位数 / 卡组织判定，不发起任何网络请求
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>卡号</th>
                    <th>卡组织</th>
                    <th>位数</th>
                    <th>Luhn</th>
                    <th>测试段</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.slice(0, MAX_CHECK_ROWS).map((r) => (
                    <tr key={`${r.digits}-${r.raw}`}>
                      <td>{formatCard(r.digits, r.brand)}</td>
                      <td>{r.brand ?? "—"}</td>
                      <td>{r.length}</td>
                      <td>
                        <span className={`badge ${r.luhn ? "badge-added" : "badge-removed"}`}>
                          {r.luhn ? "通过" : "失败"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${r.testRange ? "badge-neutral" : "badge-modified"}`}>
                          {r.testRange ? "是" : "否"}
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
        <ToolHistory toolId="test-card" />
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="pane">
        <div className="pane-title">卡段模板（BIN + 尾部 x 占位符，末位自动补 Luhn 校验位）</div>
        <div className="toolbar">
          <input
            className="text-input tc-template"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            placeholder={DEFAULT_TEMPLATE}
            spellCheck={false}
          />
          <span className="seg-wrap">
            <span className="seg-label">张数</span>
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
          <label className="tool-toggle" title="生成未来有效期（MM/YY）与对应位数的 CVC">
            <input
              type="checkbox"
              checked={withExtras}
              onChange={(e) => setWithExtras(e.target.checked)}
            />
            含有效期与 CVC
          </label>
        </div>
        <div className="toolbar tc-bins">
          <span className="seg-label">公开测试段</span>
          {TEST_BIN_RANGES.map((r) => (
            <button
              key={r.prefix}
              type="button"
              className="algo-chip"
              title={`${r.brand} · ${r.prefix} · ${r.length} 位 · ${r.source}`}
              onClick={() => setTemplate(templateForRange(r))}
            >
              {r.prefix}
            </button>
          ))}
        </div>
        {!parsed.ok && <div className="error-box">{parsed.error}</div>}
      </div>
      <div className="pane">
        <div className="pane-title">
          生成结果（{rows.length} 张，均为 Luhn 合法的沙箱测试卡号）
          <span className="spacer" />
          <span className="hint">点单行复制纯卡号</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">💳</span>
            选一个测试段或直接写模板，点「生成」得到一批测试卡号
          </div>
        ) : (
          <div className="hash-list">
            {rows.map((r, i) => (
              <div key={`${r.number}-${i}`} className="hash-item">
                <code className="hash-value" title={r.number}>
                  {r.formatted}
                </code>
                <span className="badge badge-neutral">{r.brand}</span>
                {r.expiry && <span className="badge badge-neutral">{r.expiry}</span>}
                {r.cvc && <span className="badge badge-neutral">CVC {r.cvc}</span>}
                <button
                  className="btn btn-sm"
                  onClick={() => void copyText(rowText(r), "已复制测试卡号")}
                >
                  复制
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="pane">
        <div className="pane-title">
          常用沙箱测试卡（官方文档原号，语义固定）
          <span className="spacer" />
          <span className="hint">点击整行复制卡号</span>
        </div>
        <div className="kv-list">
          {PRESET_TEST_CARDS.map((c) => (
            <div
              key={c.number}
              className="kv-item kv-copy"
              title="点击复制卡号"
              onClick={() => void copyText(c.number, `已复制 ${c.brand} 测试卡号`)}
            >
              <span className="kv-key">{c.brand}</span>
              <span className="kv-value">{formatCard(c.number, c.brand)}</span>
              <span className="badge badge-modified">{c.note}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
