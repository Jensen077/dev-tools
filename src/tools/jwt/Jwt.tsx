import { useEffect, useMemo, useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { ResizableSplit } from "../../components/ResizableSplit";
import { base64UrlDecode } from "../../utils/base64url";
import "../tool.css";

interface JwtPayload {
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  sub?: string;
  aud?: string | string[];
  [k: string]: unknown;
}

/** JSON.parse 结果收窄为 JwtPayload（其索引签名与未知字段兼容） */
function isJwtPayload(v: unknown): v is JwtPayload {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface ClaimRow {
  key: string;
  value: string;
}

function fmtTime(ts: number): string {
  // 不可信 payload：`1e100` 等超出 Date 合法范围会抛 RangeError，先校验
  if (!Number.isFinite(ts) || Math.abs(ts) > 8_640_000_000_000) return "—";
  const d = new Date(ts * 1000);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

export function Jwt() {
  const savedDraft = useAppStore((s) => s.drafts["jwt"]) as Record<string, unknown> | undefined;
  const [token, setToken] = useState((savedDraft?.token as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);

  useApplyHistory("jwt", ({ token }) => setToken(token ?? ""));

  const parsed = useMemo(() => {
    if (!token.trim()) return null;
    const parts = token.trim().split(".");
    if (parts.length < 2 || parts.length > 3) {
      return { error: "JWT 应为 2~3 段，以 . 分隔" };
    }
    try {
      const headerRaw: unknown = JSON.parse(base64UrlDecode(parts[0] ?? ""));
      const payloadRaw: unknown = JSON.parse(base64UrlDecode(parts[1] ?? ""));
      if (!isJwtPayload(headerRaw)) {
        return { error: "Header 不是 JSON 对象" };
      }
      if (!isJwtPayload(payloadRaw)) {
        return { error: "Payload 不是 JSON 对象" };
      }
      return { header: headerRaw, payload: payloadRaw };
    } catch (e) {
      return { error: `解码失败: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, [token]);

  // useMemo 保持纯函数，错误消息经 effect 下发
  useEffect(() => {
    setError(parsed && "error" in parsed ? (parsed.error ?? null) : null);
  }, [parsed]);

  const claims = useMemo<ClaimRow[]>(() => {
    if (!parsed || "error" in parsed) return [];
    const rows: ClaimRow[] = [];
    for (const [k, v] of Object.entries(parsed.payload)) {
      if (typeof v === "number" && (k === "exp" || k === "iat" || k === "nbf")) {
        rows.push({ key: k, value: `${v}（${fmtTime(v)}）` });
      } else if (v !== null && v !== undefined) {
        rows.push({ key: k, value: typeof v === "string" ? v : JSON.stringify(v) });
      }
    }
    return rows;
  }, [parsed]);

  const expStatus = useMemo(() => {
    if (!parsed || "error" in parsed) return null;
    const exp = parsed.payload.exp;
    // exp 须为合法数字才判断有效期
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    const remain = exp - Math.floor(Date.now() / 1000);
    if (remain < 0) return { expired: true, remain };
    return { expired: false, remain };
  }, [parsed]);

  const record = () => {
    if (!token.trim()) return;
    addHistory({
      toolId: "jwt",
      toolName: "JWT 解析",
      action: parsed && !("error" in parsed) ? "解析" : "解析失败",
      payload: { token },
    });
  };

  useSaveDraft("jwt", { token });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn" onClick={record} disabled={!token.trim()}>
          记录
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => setToken("")}>清空</button>
        <ToolHistory toolId="jwt" />
      </div>
      {error && <div className="error-box">{error}</div>}
      <ResizableSplit
        style={{ flex: 2 }}
        left={
          <div className="pane">
            <div className="pane-title">JWT Token</div>
            <JsonEditor value={token} onChange={setToken} language="text" />
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">解析结果</div>
            {!parsed || "error" in parsed ? (
              <div className="empty-state">
                <span className="empty-icon">🔑</span>
                {parsed && "error" in parsed
                  ? "输入解析失败，见上方错误"
                  : "粘贴 JWT（header.payload[.signature]）自动解析"}
              </div>
            ) : (
              <div className="kv-list">
                {expStatus && (
                  <div className={`kv-item ${expStatus.expired ? "kv-expired" : ""}`}>
                    <span className="kv-key">有效期</span>
                    <span className="kv-value">
                  {expStatus.expired
                    ? `已过期 ${Math.floor(-expStatus.remain)} 秒`
                    : `剩余 ${Math.floor(expStatus.remain)} 秒（${fmtTime(expStatus.remain)}）`}
                    </span>
                  </div>
                )}
                {claims.map((c) => (
                  <div key={c.key} className="kv-item">
                    <span className="kv-key">{c.key}</span>
                    <span className="kv-value">{c.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        }
      />
      <ResizableSplit
        style={{ flex: 2 }}
        left={
          <div className="pane">
            <div className="pane-title">Header</div>
            {parsed && !("error" in parsed) ? (
              <JsonEditor value={JSON.stringify(parsed.header, null, 2)} readOnly />
            ) : (
              <JsonEditor value="" readOnly />
            )}
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">Payload</div>
            {parsed && !("error" in parsed) ? (
              <JsonEditor value={JSON.stringify(parsed.payload, null, 2)} readOnly />
            ) : (
              <JsonEditor value="" readOnly />
            )}
          </div>
        }
      />
    </div>
  );
}
