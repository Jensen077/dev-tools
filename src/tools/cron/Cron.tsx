import { useCallback, useMemo, useState } from "react";
import cronParser from "cron-parser";
import { useToastStore } from "../../store/toast";
import "../tool.css";

const CRON_EXAMPLES: { expr: string; desc: string }[] = [
  { expr: "0/2 * * * * ?", desc: "每2秒执行" },
  { expr: "0 0/2 * * * ?", desc: "每2分钟执行" },
  { expr: "0 0 2 1 * ?", desc: "每月1日凌晨2点" },
  { expr: "0 15 10 ? * MON-FRI", desc: "周一到周五上午10:15" },
  { expr: "0 15 10 ? 6L 2002-2006", desc: "2002-2006年每月最后一个星期五上午10:15" },
  { expr: "0 0 10,14,16 * * ?", desc: "每天上午10点、下午2点、4点" },
  { expr: "0 0/30 9-17 * * ?", desc: "朝九晚五每半小时" },
  { expr: "0 0 12 ? * WED", desc: "每星期三中午12点" },
  { expr: "0 0 12 * * ?", desc: "每天中午12点" },
  { expr: "0 15 10 * * ?", desc: "每天上午10:15" },
  { expr: "0 15 10 * * ? 2005", desc: "2005年每天上午10:15" },
  { expr: "0 * 14 * * ?", desc: "每天下午2点到2:59每1分钟" },
  { expr: "0 0/5 14 * * ?", desc: "每天下午2点到2:55每5分钟" },
  { expr: "0 0/5 14,18 * * ?", desc: "每天下午2-2:55和6-6:55每5分钟" },
  { expr: "0 0-5 14 * * ?", desc: "每天下午2点到2:05每1分钟" },
  { expr: "0 10,44 14 ? 3 WED", desc: "每年三月星期三下午2:10和2:44" },
  { expr: "0 15 10 15 * ?", desc: "每月15日上午10:15" },
  { expr: "0 15 10 L * ?", desc: "每月最后一日上午10:15" },
  { expr: "0 15 10 ? * 6L", desc: "每月最后一个星期五上午10:15" },
  { expr: "0 15 10 ? * 6L 2002-2005", desc: "2002-2005年每月最后一个星期五上午10:15" },
  { expr: "0 15 10 ? * 6#3", desc: "每月第三个星期五上午10:15" },
];


export function Cron() {
  const [execResults, setExecResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [manualExpr, setManualExpr] = useState("");
  const showToast = useToastStore((s) => s.showToast);

  const expression = useMemo(() => "* * * * * ?", []);


  const execute = useCallback(() => {
    setError(null);
    const expr = manualExpr.trim() || expression;
    try {
      const opts = { currentDate: new Date(), tz: "Asia/Shanghai" };
      const it = cronParser.parse(expr, opts as Parameters<typeof cronParser.parse>[1]);
      const results: string[] = [];
      for (let i = 0; i < 5; i++) {
        const next = it.next().toDate();
        results.push(
          next.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }),
        );
      }
      setExecResults(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [expression, manualExpr]);

  const copyExpression = useCallback(async () => {
    const expr = manualExpr.trim() || expression;
    try { await navigator.clipboard.writeText(expr); showToast("已复制 Cron 表达式"); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [expression, manualExpr, showToast]);

  return (
    <div className="tool-page cron-page">
      <div className="toolbar">
        <span className="rsa-section-title">Cron 表达式生成器</span>
        <span className="spacer" />
      </div>

      {/* 表达式结果区 */}
      <div className="cron-expression-bar">
        <div className="cron-expression">
          <span className="cron-expr-label">表达式：</span>
          <input
            className="cron-expr-input"
            value={manualExpr || expression}
            onChange={(e) => setManualExpr(e.target.value)}
            placeholder={expression}
          />
        </div>
        <div className="cron-expr-actions">
          <button className="btn" onClick={copyExpression}>复制表达式</button>
          <button className="btn btn-primary" onClick={execute}>执行表达式</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* 执行结果 */}
      {execResults.length > 0 && (
        <div className="cron-results">
          <div className="pane-title">最近 5 次执行时间</div>
          <div className="cron-result-list">
            {execResults.map((r, i) => (
              <div key={i} className="cron-result-item">
                <span className="cron-result-index">{i + 1}.</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 常用表达式例子 */}
      <div className="cron-examples">
        <div className="pane-title">常用表达式例子</div>
        <div className="cron-example-list">
          {CRON_EXAMPLES.map((ex, i) => (
            <div key={i} className="cron-example-item" onClick={() => { setManualExpr(ex.expr); setExecResults([]); }}>
              <code className="cron-example-expr">{ex.expr}</code>
              <span className="cron-example-desc">{ex.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

