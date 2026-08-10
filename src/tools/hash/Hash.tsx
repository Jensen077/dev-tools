import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { useToastStore } from "../../store/toast";
import { ResizableSplit } from "../../components/ResizableSplit";
import { ALL_ALGORITHMS, computeAll, type HashAlgorithm } from "../../utils/hash";
import "../tool.css";

export function Hash() {
  const savedDraft = useAppStore((s) => s.drafts["hash"]) as Record<string, unknown> | undefined;
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [selected, setSelected] = useState<HashAlgorithm[]>(
    () => (savedDraft?.selected as HashAlgorithm[]) ?? [...ALL_ALGORITHMS],
  );
  const [results, setResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  useApplyHistory("hash", ({ input }) => setInput(input ?? ""));

  const toggleAlgo = (algo: HashAlgorithm) => {
    setSelected((prev) => (prev.includes(algo) ? prev.filter((a) => a !== algo) : [...prev, algo]));
  };

  const run = useCallback(async () => {
    if (!input) return;
    setError(null);
    try {
      const out = await computeAll(selected, input);
      setResults(out);
      addHistory({
        toolId: "hash",
        toolName: "Hash 计算",
        action: `哈希（${selected.length} 算法）`,
        payload: { input },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [input, selected]);

  // 输入或算法变化时自动重算
  useEffect(() => {
    if (!input) {
      setResults({});
      return;
    }
    const t = setTimeout(async () => {
      try {
        const out = await computeAll(selected, input);
        setResults(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [input, selected]);

  const copyHash = async (algo: HashAlgorithm) => {
    const v = results[algo];
    if (!v) return;
    try {
      await navigator.clipboard.writeText(v);
      showToast(`已复制 ${algo}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // results 的 key 均来自 ALL_ALGORITHMS 计算产物，是合法算法名
  const isAlgorithm = (key: string): key is HashAlgorithm =>
    (ALL_ALGORITHMS as readonly string[]).includes(key);

  const loadFile = async (file: File) => {
    // 二进制文件读 buffer 哈希更准确
    try {
      const buf = await file.arrayBuffer();
      const out = await computeAll(selected, new Uint8Array(buf));
      setResults(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const outputText = useMemo(() => {
    if (Object.keys(results).length === 0) return "";
    return Object.entries(results)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  }, [results]);

  useSaveDraft("hash", { input, selected });

  return (
    <div className="tool-page">
      <div className="toolbar">
        {ALL_ALGORITHMS.map((a) => (
          <label key={a} className="algo-chip">
            <input type="checkbox" checked={selected.includes(a)} onChange={() => toggleAlgo(a)} />
            {a}
          </label>
        ))}
        <button className="btn btn-primary" data-hotkey="run" onClick={run} disabled={!input}>
          计算
          <span className="btn-hotkey">⌘↩</span>
        </button>
        <button
          className="btn"
          data-hotkey="copy"
          onClick={() => {
            if (!outputText) return;
            navigator.clipboard
              .writeText(outputText)
              .then(() => showToast("已复制全部哈希"))
              .catch((e) => {
                setError(e instanceof Error ? e.message : String(e));
              });
          }}
          disabled={!outputText}
        >
          复制全部
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>哈希文件</button>
        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
        />
        <ToolHistory toolId="hash" />
      </div>
      {error && <div className="error-box">{error}</div>}
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">输入（文本或拖入文件）</div>
            <JsonEditor value={input} onChange={setInput} language="text" />
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">哈希结果（实时）</div>
            {Object.keys(results).length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">🔐</span>
                输入文本或拖入文件后自动计算
              </div>
            ) : (
              <div className="hash-list">
                {Object.entries(results).map(([algo, hex]) =>
                  isAlgorithm(algo) ? (
                    <div key={algo} className="hash-item">
                      <span className="hash-key">{algo}</span>
                      <code className="hash-value" title={hex}>
                        {hex}
                      </code>
                      <button className="btn btn-sm" onClick={() => copyHash(algo)}>复制</button>
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
