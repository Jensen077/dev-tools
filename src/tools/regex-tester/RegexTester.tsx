import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { ToolHistory } from "../../components/ToolHistory";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import "../tool.css";

interface MatchInfo {
  index: number;
  length: number;
  groups: (string | undefined)[];
}

interface RegexFlags {
  g: boolean;
  i: boolean;
  m: boolean;
  s: boolean;
  u: boolean;
}

export function RegexTester() {
  const savedDraft = useAppStore((s) => s.drafts["regex-tester"]) as Record<string, unknown> | undefined;
  const [pattern, setPattern] = useState((savedDraft?.pattern as string) ?? "");
  const [flags, setFlags] = useState<RegexFlags>(
    (savedDraft?.flags as RegexFlags) ?? { g: true, i: false, m: false, s: false, u: false },
  );
  const [text, setText] = useState((savedDraft?.text as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const theme = useAppStore((s) => s.theme);
  const addHistory = useHistoryStore((s) => s.addHistory);

  useApplyHistory("regex-tester", ({ pattern, text }) => {
    if (pattern !== undefined) setPattern(pattern);
    if (text !== undefined) setText(text);
  });

  const flagStr = useMemo(() => {
    let s = "";
    if (flags.g) s += "g";
    if (flags.i) s += "i";
    if (flags.m) s += "m";
    if (flags.s) s += "s";
    if (flags.u) s += "u";
    return s;
  }, [flags]);

  const toggleFlag = (k: keyof typeof flags) => setFlags((prev) => ({ ...prev, [k]: !prev[k] }));

  const matches = useMemo<MatchInfo[]>(() => {
    if (!pattern || !text) return [];
    try {
      const re = new RegExp(pattern, flagStr);
      const out: MatchInfo[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        out.push({ index: m.index, length: m[0].length, groups: m.slice(1) });
        if (!flags.g) break; // 无 g 旗标时只匹配首个，避免死循环
        if (m[0].length === 0) re.lastIndex++; // 空匹配防止死循环
      }
      return out;
    } catch (e) {
      return [];
    }
  }, [pattern, text, flagStr, flags.g]);

  // useMemo 保持纯函数，非法正则错误经 effect 下发
  useEffect(() => {
    let msg: string | null = null;
    if (pattern && text) {
      try {
        new RegExp(pattern, flagStr);
      } catch (e) {
        msg = e instanceof Error ? e.message : String(e);
      }
    }
    setError(msg);
  }, [pattern, text, flagStr]);

  // 用 Monaco deltaDecorations 高亮命中
  const handleMount: OnMount = (ed) => {
    editorRef.current = ed;
    applyDecorations();
  };

  const applyDecorations = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = ed.getModel();
    if (!model) return;
    const decos = matches.map((m) => {
      const start = model.getPositionAt(m.index);
      const end = model.getPositionAt(m.index + m.length);
      return {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
        options: {
          inlineClassName: "regex-match",
          overviewRuler: { color: "#4caf50", position: 3 },
        },
      };
    });
    ed.deltaDecorations([], decos);
  }, [matches]);

  // 命中或文本变化时重绘高亮
  useEffect(() => {
    applyDecorations();
  }, [matches, text, applyDecorations]);

  const record = () => {
    if (!pattern) return;
    addHistory({
      toolId: "regex-tester",
      toolName: "正则测试",
      action: `匹配 ${matches.length} 处`,
      payload: { pattern, text },
    });
  };

  useSaveDraft("regex-tester", { pattern, flags, text });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <input
          className="text-input"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="正则表达式，如 ^\\d+"
        />
        {(["g", "i", "m", "s", "u"] as const).map((f) => (
          <label key={f} className="algo-chip">
            <input type="checkbox" checked={flags[f]} onChange={() => toggleFlag(f)} />
            {f}
          </label>
        ))}
        <button className="btn" data-hotkey="run" onClick={record} disabled={!pattern}>
          记录
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <span className="hint">命中 {matches.length} 处</span>
        <span className="spacer" />
        <ToolHistory toolId="regex-tester" />
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="pane" style={{ flex: 1, minHeight: 0 }}>
        <div className="pane-title">测试文本（命中自动高亮）</div>
        <Editor
          height="60%"
          language="text"
          theme={theme === "dark" ? "vs-dark" : "light"}
          value={text}
          onChange={(v) => setText(v ?? "")}
          onMount={handleMount}
          options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
        />
        {matches.length > 0 && (
          <div className="match-list" style={{ marginTop: 8 }}>
            {matches.map((m, i) => (
              <div key={i} className="match-item">
                <div className="match-actions">
                  <span className="badge">#{i + 1}</span>
                  <span className="hint">@{m.index}</span>
                </div>
                <div className="match-preview">
                  {m.groups.length > 0 ? (
                    <>
                      <div>{m.groups[0] ?? ""}</div>
                      {m.groups.slice(1).map((g, gi) => (
                        <div key={gi}>
                          <span className="hint">$ {gi + 1}: </span>
                          {g ?? "(未捕获)"}
                        </div>
                      ))}
                    </>
                  ) : (
                    text.slice(m.index, m.index + m.length) || "(空匹配)"
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
