import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JsonEditor } from "../../components/JsonEditor";
import { useAppStore } from "../../store/app";
import { useApplyHistory } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { ToolHistory } from "../../components/ToolHistory";
import { useFileDrop } from "../../hooks/useFileDrop";
import { useToastStore } from "../../store/toast";
import { ResizableSplit } from "../../components/ResizableSplit";
import "../tool.css";

function stripDataUri(input: string): string {
  const m = input.trim().match(/^data:image\/[^;]+;base64,(.+)$/i);
  return m ? (m[1] ?? input) : input;
}

export function ImagePreview() {
  const savedDraft = useAppStore((s) => s.drafts["image-preview"]) as Record<string, unknown> | undefined;
  const [input, setInput] = useState((savedDraft?.input as string) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const showToast = useToastStore((s) => s.showToast);

  useApplyHistory("image-preview", ({ input: savedInput }) => setInput(savedInput ?? ""));

  useEffect(() => {
    setImgError(null);
    if (input.trim()) setError(null);
  }, [input]);

  const { src, checkError } = useMemo(() => {
    const t = input.trim();
    if (!t) return { src: null, checkError: null };
    if (/^https?:\/\//i.test(t)) return { src: t, checkError: null };
    const b64 = stripDataUri(input);
    if (!/^[A-Za-z0-9+/=]+$/.test(b64)) {
      return { src: null, checkError: "不是有效的 Base64 编码" };
    }
    try {
      atob(b64);
    } catch {
      return { src: null, checkError: "Base64 解码失败" };
    }
    return { src: `data:image/png;base64,${b64}`, checkError: null };
  }, [input]);

  const loadFile = useCallback(async (file: File) => {
    try {
      const reader = new FileReader();
      const result = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("读取文件失败"));
        reader.readAsDataURL(file);
      });
      setInput(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const { bindDrop, isDragging } = useFileDrop({ onFile: loadFile, accept: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"] });

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const copyB64 = useCallback(async () => {
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input);
      showToast("已复制 Base64");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [input, showToast]);

  useSaveDraft("image-preview", { input });

  return (
    <div className="tool-page">
      <div className="toolbar">
        <button className="btn" onClick={pasteFromClipboard}>
          从剪贴板粘贴
        </button>
        <button className="btn" data-hotkey="copy" onClick={copyB64} disabled={!input}>
          复制 Base64
          <span className="btn-hotkey">⇧⌘C</span>
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          打开图片文件
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
        />
        <button className="btn" onClick={() => setInput("")}>清空</button>
        <ToolHistory toolId="image-preview" />
      </div>
      {error && <div className="error-box">{error}</div>}
      {checkError && <div className="error-box">{checkError}</div>}
      {imgError && <div className="error-box">{imgError}</div>}
      {isDragging && <div className="drop-hint">松开以载入图片</div>}
      <ResizableSplit
        left={
          <div className="pane">
            <div className="pane-title">Base64 输入</div>
            <div className="drop-zone" {...bindDrop}>
              <JsonEditor value={input} onChange={setInput} language="text" />
            </div>
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">图片预览</div>
            {src ? (
              <img
                src={src}
                alt="预览"
                className="image-preview-img"
                onError={() => setImgError("图片加载失败，请检查 URL 或图片数据")}
              />
            ) : (
              <div className="empty-state">
                <span className="empty-icon">🖼</span>
                {input.trim() ? "Base64 格式无效，无法预览" : "粘贴 Base64 / 图片 URL 或拖入图片文件"}
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
