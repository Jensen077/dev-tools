# AGENTS.md

macOS 桌面开发工具箱（devbox）：Tauri 2 + React 19 + TypeScript + Vite + zustand，JSON/文本处理工具集合。代码注释与 UI 文案均为中文，新代码沿用中文注释。

## 命令

- 安装/开发/构建用 `pnpm`（`package-lock.json` 是遗留物，勿用 npm；`pnpm-lock.yaml` 与源码保持一致）
- `pnpm tauri dev` — 开发模式（前端 1420 端口 strict，Vite 忽略 `src-tauri`）
- `pnpm build` — `rm -rf dist && tsc && vite build`：前端类型检查 + 构建（会先清空 dist）。**这是前端唯一的验证手段：无 ESLint、无 JS 测试框架、无 `typecheck` 脚本**
- `cargo test`（在 `src-tauri/` 下）— Rust 逻辑测试（format/extract/diff/curl，curl 端到端测试真实调用系统 curl）
- `pnpm tauri build` — 产出 `src-tauri/target/release/bundle/macos/devbox.app`（未签名/未公证）

## CI 工作流

- `.github/workflows/pages.yml` — push 到 `main`：`pnpm build` 产 `dist/` 部署到 GitHub Pages（纯前端静态站点，网页版降级见 `backend.ts`）
- `.github/workflows/release.yml` — push `v*` 标签：矩阵构建 macos(universal dmg)/ubuntu(deb+AppImage)/windows(msi+nsis)，挂资产到草稿 Release；本地无需改动，`git tag vX.Y.Z && git push origin vX.Y.Z` 即触发。仓库 Settings → Pages → Source 选「GitHub Actions」（Pages 一次设置）

## 架构

- **JSON 等重的逻辑在 Rust 侧**：`src-tauri/src/{format,extract,diff,curl}.rs` 为纯逻辑模块（各有 `#[cfg(test)]`），`commands.rs` 定义 `#[tauri::command]`，新命令必须在 `src-tauri/src/lib.rs` 的 `generate_handler![...]` 注册
- 前端经 `@tauri-apps/api/core` 的 `invoke` 异步调用；invoke reject 可能是字符串或 Error，工具内用 `errMsg`/`toParseError` 统一提取命中的 `ParseError{message,line,column}`（行列均 1-based）
- **网页版降级**：`src/utils/backend.ts` 的 `backend<T>(cmd, args)` 统一入口，`isDesktop()` 检测 `window.__TAURI_INTERNALS__`——桌面走 `invoke`（语义零变化），网页走 `jsImpls` 的 JS 实现。4 个 JSON 命令（fmt/min/compare/extract）已移植，返回结构与 Rust 逐字段对齐；`save_text_file` 在 JsonTable 内 `isDesktop()` 分支（网页走 Blob 下载）；`run_curl_script_cmd` 桌面专属，网页禁用按钮+提示。新增 invoke 命令若需网页支持，在 `jsImpls` 注册 JS 实现即可
- **新工具三步**：组件放 `src/tools/<name>/`，在 `src/tools/index.tsx` 的 `TOOLS` 数组追加一项（含 id/name/icon/component），侧边栏/快捷键/命令面板自动可见
- Monaco 本地打包无 CDN：`vite.config.ts` 对其做了 alias/exclude/`inlineDynamicImports` 特殊处理（WKWebView 动态 import 会挂）。**改 vite.config 前先确认与 monaco 无关**；TS 路径映射在 `tsconfig.json`.
- 状态持久化走 localStorage（`devbox-*` key），读取一律 try/catch 防御并回落默认，写入失败静默忽略——新持久化逻辑照此模式
- 历史记录模式：工具执行后 `addHistory({toolId, toolName, action, payload})`，挂载时 `useApplyHistory(toolId, apply)` 回填；payload 按工具自由结构存放

## 项目结构

- `src/` — 前端代码（React 19 + TypeScript + Vite）
  - `components/` — 通用组件：Sidebar、JsonEditor、JsonOutput、TextDiffEditor、ResizableSplit（可拖拽分栏）、ToolHistory、CommandPalette、Toast、ErrorBoundary、icons
  - `hooks/` — 自定义 Hook：useSaveDraft（草稿持久化）、useKeyboardShortcuts（全局快捷键）、useFileDrop（文件拖拽）
  - `store/` — zustand 状态：app（主题/当前工具/草稿）、history、settings（工具显隐排序）、toast
  - `utils/` — 纯函数工具：hash（MD5 内联 + SHA Web Crypto）、encoding、base64url、fileEncoding、backend（桌面/网页 invoke 适配层 + JS 降级实现）
  - `tools/` — 工具组件（每工具一个子目录，含 `index.tsx` 注册表与 `tool.css` 通用样式）
    - `json-formatter/`、`json-diff/`、`log-extractor/`、`text-diff/`、`json-table/`、`json-field-extract/`、`history/`、`curl-runner/`、`image-preview/`、`encode-convert/`、`timestamp/`、`hash/`、`regex-tester/`、`jwt/`、`param-convert/`、`uuid/`
  - `App.tsx` — 应用根组件（标题栏拖拽区、侧边栏、工具交叉渐隐舞台、命令面板）
  - `main.tsx` / `monaco-setup.ts` / `types.ts` — 入口与 Monaco/类型基础
- `src-tauri/` — Rust 后端
  - `src/` — Rust 代码
    - `commands.rs` — 全部 `#[tauri::command]` 定义
    - `format.rs` / `extract.rs` / `diff.rs` / `curl.rs` — JSON 格式化/提取/比对、curl 执行的纯逻辑模块（各有 `#[cfg(test)]`）
    - `lib.rs` — Builder 与 `generate_handler!` 注册（新命令必须在此登记）
    - `main.rs` — 启动入口
  - `capabilities/default.json` — Tauri 权限声明（`core:window:allow-*` 等）
  - `tauri.conf.json` + `tauri.macos.conf.json` — 窗口/打包/标题栏（Overlay）配置
- `docs/` — 设计文档（screenshots、DEVBOX-V1/V3-DESIGN）
- 根目录三件核心文档：`README.md`（功能一览）、`VERSION.md`（版本记录）、`MEMORY.md`（踩坑点）

## 关键入口

- `src/main.tsx` — 前端入口（React 挂载）
- `src/App.tsx` — 应用根组件（标题栏 `data-tauri-drag-region` 拖拽区、工具切换）
- `src/tools/index.tsx` — 工具注册表（`TOOLS` 数组，新增工具唯一入口）
- `src-tauri/src/lib.rs` — Rust 端命令注册（`generate_handler!`）
- `src-tauri/src/commands.rs` — 全部 Tauri 命令定义
- `src/utils/backend.ts` — 桌面/网页 invoke 适配层（`isDesktop` + `backend` + JS 降级实现，网页版核心）

## 约定与陷阱

- `tsconfig` 极严格：`noUncheckedIndexedAccess`/`noUnusedLocals`/`noImplicitReturns`，数组索引访问需非空断言（现有代码用 `order[i]!`）
- 每个工具组件内 `useSaveDraft(toolId, {...})` 保存草稿、启动时从 `drafts[toolId]` 恢复
- 版本号同步维护三处：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`
- 允许的文件拖拽由 `useFileDrop` 自实现计数方案（Monaco 关了 dropIntoEditor），勿回退到 Monaco 原生拖拽
- 主题在 `src/store/app.ts` 模块加载时即写 `documentElement.dataset.theme`（防 FOUC），`index.html` 有深色首帧兜底
- `data-hotkey="run"` / `data-hotkey="copy"` 按钮由 `useKeyboardShortcuts` 驱动（`Cmd+Enter`/`Cmd+Shift+C`），新工具加主操作按钮时打对应标记
- **Tauri 能力权限**：依赖窗口/系统能力的隐藏实现（窗口拖拽、最小化等）须在 `src-tauri/capabilities/default.json` 显式声明 `core:window:allow-*`，否则静默失效（拖拽 bug 的根因）。排查顺序：权限 → 配置 → 代码
- **macOS 标题栏**：保持默认 `decorations`（勿设 `false`，否则红绿灯消失）+ `titleBarStyle: Overlay` + `trafficLightPosition`；窗口拖拽用 `data-tauri-drag-region` + 上面权限
- **UUID 生成**用 `crypto.getRandomValues` 自实现 v4（`crypto.randomUUID` 在 WKWebView 非安全上下文不可用）
- **网页版 invoke 降级**：浏览器无 `__TAURI_INTERNALS__`，`invoke` 调用抛错（import 不报错）。`backend.ts` 的 `isDesktop()` 守卫在调用前分支，浏览器永不进 invoke 路径。JS 降级实现必须经 `sortKeys()` 排序对象键以对齐 `serde_json` 默认 BTreeMap 字母序输出（`Cargo.toml` 未启用 `preserve_order`）
- **GitHub Pages 部署**：`vite.config.ts` 的 `base: "./"` 相对路径（项目页/组织页通吃，无 SPA 路由故无 404）；`.github/workflows/pages.yml` 在 `main` 分支 push 时构建发布，仓库 Settings → Pages → Source 选「GitHub Actions」
- **跨平台打包**：`tauri.conf.json` 的 `bundle.targets` 含 `["app","dmg","msi","nsis","deb","appimage"]`，Tauri 按宿主 OS 自动过滤（mac 不构建 deb、linux 不构建 dmg 等）。mac 用 `--target universal-apple-darwin` 出通用二进制（一个 dmg 通吃 arm64/intel，需两个 rust target）。当前未签名未公证：mac 右键打开、windows SmartScreen 警告，与本地 `pnpm tauri build` 一致；如需签名/公证再加 APPLE_* 密钥与 `tauri-action` 的签名输入

## 开发范式

功能开发的完整链路：**澄清形态（问清合并/拆分与默认值）→ 按「新工具三步」实现 → `pnpm build` 验证 → 功能收尾补文档**。文档四件套：

- `README.md` — 新增/变更功能时同步「功能一览」
- `VERSION.md` — 发版前补一条版本记录，再同步三处版本号。**技术性记录**（改了哪些文件/怎么实现），面向开发者与 AI；面向终端用户的发行说明写在 GitHub Release body（发布草稿时手写），两者不重复
- `MEMORY.md` — 踩坑点（现象→根因→对策），踩过就写，避免 AI 反复踩
- `AGENTS.md` — 本文件的架构/约定/陷阱随新认知持续更新