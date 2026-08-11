import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js";
// hover 浮层组件只在 editor.main 链式引入，editor.api 到不了；
// 不加载则 registerHoverProvider 唤不起 tooltip（json-handle 式 key 预览依赖它）
import "monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution.js";
import "monaco-editor/esm/vs/languages/definitions/shell/register.js";
// codicon 字体的 @font-face 只在 editor.main 链式引入，editor.api 到不了；
// 缺了它折叠箭头/展开按钮等 codicon 图标全渲染为空字形，这里显式补上
import "monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";
import { findKeyAt, scanJsonKeys } from "./utils/jsonHover";
import { useAppStore } from "./store/app";
import { useToastStore } from "./store/toast";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker.js?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker.js?worker";
import { loader } from "@monaco-editor/react";

// 绕过 monaco.contribution → register.js → import('./jsonMode.js') 的动态加载链。
// jsonMode.js 的 WorkerManager 在 Tauri WKWebView tauri:// 协议下创建 worker 失败，
// 导致整个 setupMode 中断，tokenizer 也无法注册。
// 此处直接注册 JSON 语言 + 独立 Monarch tokenizer（纯主线程，无外部依赖），
// 再由 MonacoEnvironment.getWorker 提供 json worker 用于 LSP 功能（格式化等）。

// Standalone JSON Monarch tokenizer — no jsonc-parser dependency.
// tokenization.js 的 createTokenizationSupport 依赖 jsonc-parser 的 createScanner，
// 该深层相对路径在 Vite bundle 时无法正确解析导致 tokenizer 被 tree-shaken。
// 注意：Monarch token 名必须使用 Monaco 默认主题已定义的 token 类型
// （string / comment / keyword / number / delimiter），否则不会着色。
const JSON_TOKENIZER: monaco.languages.IMonarchLanguage = {
  tokenizer: {
    root: [
      [/\/\*/, "comment", "@commentBlock"],
      [/\/\/.*$/, "comment"],
      // 字符串后跟冒号（可含转义）即对象 key，先于通用字符串规则匹配，独立配色
      [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "key"],
      [/"/, "string", "@string"],
      [/-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/, "number"],
      [/\b(true|false|null)\b/, "keyword"],
      [/[{}[\]:,]/, "delimiter"],
    ],
    string: [
      [/[^"\\]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],
    commentBlock: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
  },
};

monaco.languages.register({
  id: "json",
  extensions: [".json", ".bowerrc", ".jshintrc", ".jscsrc", ".eslintrc", ".babelrc", ".har"],
  aliases: ["JSON", "json"],
  mimetypes: ["application/json"],
});
monaco.languages.setMonarchTokensProvider("json", JSON_TOKENIZER);
monaco.languages.setLanguageConfiguration("json", {
  wordPattern: /(-?\d*\.\d\w*)|([^\[\{\]\}\:\"\,\s]+)/g,
  comments: { lineComment: "//", blockComment: ["/*", "*/"] },
  brackets: [["{", "}"], ["[", "]"]],
  autoClosingPairs: [
    { open: "{", close: "}", notIn: ["string"] },
    { open: "[", close: "]", notIn: ["string"] },
    { open: '"', close: '"', notIn: ["string"] },
  ],
});

// json-handle 式 key 预览：悬停 key/value 区间时浮层展示该 key 的值。
// 文档变化才重扫（按 model + versionId 缓存），大 JSON 悬停不卡。
const hoverCache = new WeakMap<monaco.editor.ITextModel, { version: number; spans: ReturnType<typeof scanJsonKeys> }>();
monaco.languages.registerHoverProvider("json", {
  provideHover(model, position) {
    if (!useAppStore.getState().jsonPreview) return null;
    let cached = hoverCache.get(model);
    if (!cached || cached.version !== model.getVersionId()) {
      cached = { version: model.getVersionId(), spans: scanJsonKeys(model.getValue()) };
      hoverCache.set(model, cached);
    }
    const span = findKeyAt(cached.spans, model.getOffsetAt(position));
    if (!span) return null;
    let pretty = model.getValue().slice(span.valueStart, span.valueEnd).trim();
    try {
      pretty = JSON.stringify(JSON.parse(pretty), null, 2);
    } catch {
      // 保持原文，不作为悬停失败条件
    }
    return {
      contents: [{ value: "```json\n" + pretty + "\n```" }],
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
    };
  },
});

// json-handle 式点击复制：只读编辑器（输出侧）点击 key/value 区间即复制该值。
// 复用同一份扫描缓存，点击处命中失败（如空白/括号）时静默忽略。
monaco.editor.onDidCreateEditor((ed) => {
  ed.onMouseDown((e) => {
    if (!useAppStore.getState().jsonPreview) return;
    if (!ed.getOption(monaco.editor.EditorOption.readOnly)) return;
    const pos = e.target.position;
    if (!pos) return;
    const model = ed.getModel();
    if (!model) return;
    let cached = hoverCache.get(model);
    if (!cached || cached.version !== model.getVersionId()) {
      cached = { version: model.getVersionId(), spans: scanJsonKeys(model.getValue()) };
      hoverCache.set(model, cached);
    }
    const span = findKeyAt(cached.spans, model.getOffsetAt(pos));
    if (!span) return;
    const value = model.getValue().slice(span.valueStart, span.valueEnd).trim();
    navigator.clipboard
      .writeText(value)
      .then(() => useToastStore.getState().showToast(`已复制 ${span.key}`))
      .catch(() => useToastStore.getState().showToast("复制失败", "error"));
  });
});

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") {
      return new jsonWorker();
    }
    return new editorWorker();
  },
};

loader.config({ monaco });

// GitHub 默认主题配色（light / dark），与 App.css 令牌独立
monaco.editor.defineTheme("devbox-light", {
  base: "vs",
  inherit: true,
  rules: [
    { token: "string", foreground: "0a3069" },
    { token: "key", foreground: "0969da" },
    { token: "string.escape", foreground: "8250df" },
    { token: "keyword", foreground: "cf222e" },
    { token: "number", foreground: "0550ae" },
    { token: "delimiter", foreground: "57606a" },
    { token: "comment", foreground: "6e7781" },
  ],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#1f2328",
    "editor.lineHighlightBackground": "#f6f8fa",
    "editorCursor.foreground": "#1f2328",
    "editor.selectionBackground": "#0969da4d",
    "editor.inactiveSelectionBackground": "#0969da26",
    "editorLineNumber.foreground": "#afb8c1",
    "editorLineNumber.activeForeground": "#1f2328",
    "editorIndentGuide.background1": "#d8dee4",
    "editorIndentGuide.activeBackground1": "#afb8c1",
    "editorGutter.background": "#ffffff",
    "editorWidget.background": "#ffffff",
    "editorWidget.border": "#d8dee4",
    "editorSuggestWidget.selectedBackground": "#e8f3ff",
    "editorBracketMatch.background": "#dafbe1",
    "editorBracketMatch.border": "#31a24c",
    "diffEditor.insertedTextBackground": "#2ea04326",
    "diffEditor.removedTextBackground": "#f8514926",
    "diffEditor.insertedLineBackground": "#2ea04326",
    "diffEditor.removedLineBackground": "#f8514926",
    "scrollbarSlider.background": "#d0d7de80",
    "scrollbarSlider.hoverBackground": "#afb8c180",
    "scrollbarSlider.activeBackground": "#8c959f80",
  },
});

monaco.editor.defineTheme("devbox-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "string", foreground: "a5d6ff" },
    { token: "key", foreground: "79c0ff" },
    { token: "string.escape", foreground: "d2a8ff" },
    { token: "keyword", foreground: "ff7b72" },
    { token: "number", foreground: "79c0ff" },
    { token: "delimiter", foreground: "8b949e" },
    { token: "comment", foreground: "8b949e" },
  ],
  colors: {
    "editor.background": "#0d1117",
    "editor.foreground": "#c9d1d9",
    "editor.lineHighlightBackground": "#161b22",
    "editorCursor.foreground": "#c9d1d9",
    "editor.selectionBackground": "#388bfd66",
    "editor.inactiveSelectionBackground": "#388bfd33",
    "editorLineNumber.foreground": "#484f58",
    "editorLineNumber.activeForeground": "#c9d1d9",
    "editorIndentGuide.background1": "#21262d",
    "editorIndentGuide.activeBackground1": "#484f58",
    "editorGutter.background": "#0d1117",
    "editorWidget.background": "#161b22",
    "editorWidget.border": "#30363d",
    "editorSuggestWidget.selectedBackground": "#21262d",
    "editorBracketMatch.background": "#2ea04326",
    "editorBracketMatch.border": "#3fb950",
    "diffEditor.insertedTextBackground": "#2ea04326",
    "diffEditor.removedTextBackground": "#f8514926",
    "diffEditor.insertedLineBackground": "#2ea04326",
    "diffEditor.removedLineBackground": "#f8514926",
    "scrollbarSlider.background": "#21262d80",
    "scrollbarSlider.hoverBackground": "#30363d80",
    "scrollbarSlider.activeBackground": "#484f5880",
  },
});
