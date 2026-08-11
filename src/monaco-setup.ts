import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js";
import "monaco-editor/esm/vs/languages/definitions/shell/register.js";
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
