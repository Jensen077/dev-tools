import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// process 是 nodejs 全局，由 @types/node 提供类型
const host = process.env.TAURI_DEV_HOST;

// monaco-editor 的 package exports map 会干扰 `?worker` 子路径解析，
// 直接别名到包内真实文件
const monacoRoot = fileURLToPath(
  new URL("./node_modules/monaco-editor/esm/vs", import.meta.url),
);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    // monaco-editor 的 package exports map 会把 `esm/vs` 前缀翻倍导致解析失败，
    // 用正则前缀直接映射到包内真实目录
    alias: [
      {
        find: /^monaco-editor\/esm\/vs/,
        replacement: monacoRoot,
      },
    ],
  },

  optimizeDeps: {
    // monaco 的 worker（`?worker` 引入）在 prebundle 阶段会触发
    // "optimized info should be defined" 错误，排除后作为源码直接加载
    exclude: ["monaco-editor"],
  },

  build: {
    // Tauri 生产环境下 Monaco 的 jsonMode/shell 等语言模块通过动态 import 分 chunk 加载，
    // 在 WKWebView 自定义协议下动态 import 路径解析可能异常，导致 tokenization 失败 → 无语法高亮。
    // inlineDynamicImports 将所有动态 import 内联到主 bundle，消除分 chunk 问题。
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
