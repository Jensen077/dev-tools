# MEMORY.md — AI 开发踩坑点

> 本文件记录在 devbox 上踩过的坑，供 AI 协作时提前规避。按「现象 → 根因 → 对策」组织，避免反复踩。

## 设计系统重构：改变量值而非变量名

- **现象**：v1.0.8 整体切换为 GitHub Primer 风格时，若重命名 `--bg`/`--accent` 等令牌，需要同步改所有 `var()` 消费点（6 个 CSS + 16 个工具组件），风险高且易遗漏。
- **根因**：CSS 变量名是组件与样式之间的隐式契约。
- **对策**：保留全部变量名，只重映射 `:root[data-theme="..."]` 块里的值，消费方零改动自动继承；对不再使用的令牌（如 `--glass-blur`/`--ease-spring`/`--dur-slow`）再删引用，删前 `grep` 确认无残留。布局/动效类的结构性改动（侧栏宽度、交叉渐隐、字号）单独在规则层做。

## Tauri 2 权限（capabilities）缺失导致 IPC 静默失效

- **现象**：`data-tauri-drag-region` 与手动 `getCurrentWindow().startDragging()` 都拖不动窗口，且无任何报错。
- **根因**：拖拽走 `start_dragging` IPC 命令，需 `core:window:allow-start-dragging` 权限；只配了 `core:default` 时该命令被静默拒绝。
- **对策**：涉及窗口/系统能力的隐藏实现（拖拽、最小化、缩略图等）先在 `src-tauri/capabilities/default.json` 显式声明对应 `core:window:allow-*` 权限，再怀疑 JS 层。排查顺序：权限 → 配置 → 代码。

## macOS Overlay 标题栏的窗口配置陷阱

- **现象**：设置 `decorations: false` 后红绿灯（最小化/最大化/关闭）消失。
- **根因**：`titleBarStyle: "Overlay"` 下红绿灯依赖系统标题栏；`decorations: false` 把标题栏整个移除。
- **对策**：保持默认（不写 `decorations`）+ `titleBarStyle: Overlay` + `trafficLightPosition`；窗口拖拽交给 `data-tauri-drag-region`，配套上一条权限。macOS Overlay 拖拽还受「窗口失焦时首次点击不拖动」限制（tauri#4316）。

## crypto.randomUUID 需安全上下文

- **现象**：打包后在 WKWebView 某些场景下 `crypto.randomUUID` 未定义。
- **根因**：`randomUUID` 仅限安全上下文，Tauri 自定义 scheme 下不保证可用。
- **对策**：用 `crypto.getRandomValues` 自实现 RFC 4122 v4（16 随机字节 + 置 version/variant 位），前后端一致、零依赖。

## invoke 的 reject 可能是字符串

- **现象**：`invoke` 失败时 reject 的值可能是 `string` 也可能是 `Error`。
- **对策**：统一用 `errMsg` / `toParseError` 提取命中 `ParseError{message,line,column}`（行列均 1-based），不要直接假设 `e.message`。

## tsconfig 极严格，先过类型再谈功能

- **现象**：`noUncheckedIndexedAccess`/`noUnusedLocals`/`noImplicitReturns`，未用 import 或数组索引无 `!` 直接编译失败。
- **对策**：新增代码满足三件套：索引访问带非空断言（`order[i]!`）、删干净未用声明、所有分支有返回值；提交前必跑 `pnpm build`（前端唯一验证手段：无 ESLint/无测试框架）。

## 包管理器与锁定文件

- **现象**：`package-lock.json` 是遗留物，用 npm 会破坏 `pnpm-lock.yaml` 与源码的一致性。
- **对策**：一律 `pnpm`；`pnpm-lock.yaml` 与源码同步。

## pnpm 10 的 pnpm-workspace.yaml 会破坏锁 pnpm 9 的 CI

- **现象**：v1.0.13 发版时 release.yml/pages.yml 全部失败，报 `ERROR packages field missing or empty`；根因是 RSA 提交新增了 `pnpm-workspace.yaml`（pnpm 10 的 `allowBuilds` 写法，无 `packages` 字段）。
- **根因**：CI 用 `pnpm/action-setup@v4` 锁 pnpm 9，pnpm 9 只要存在 `pnpm-workspace.yaml` 就按 workspace 解析并强制要求 `packages` 字段，缺失即报错（`pnpm store path`/`pnpm install` 都挂）。pnpm 10 中 `packages` 可选，所以本地开发无感。
- **对策**：两个 CI 工作流锁的是 pnpm 9，新增 pnpm 10 专属配置（`allowBuilds`/`onlyBuiltDependencies` 等）时优先复用 `package.json` 的 `pnpm` 字段（pnpm 9/10 都认），不要新建 `pnpm-workspace.yaml`；若必须新建，务必带上 `packages` 字段。改 CI pnpm 版本号前先在本地用 `npx pnpm@9.15.9 store path` 验证 lockfile 兼容。

## 构建产物路径与静默失败

- `pnpm tauri build` 偶发 `bundle_dmg.sh` 失败（旧 dmg 占用），但 `.app` 已生成，产物：`src-tauri/target/release/bundle/macos/devbox.app`。
- React 无 `key` 或依赖数组缺失时切工具交叉渐隐可能残留旧实例——`useApplyHistory` 的回调只看 `pendingLoad/toolId`，勿在 apply 里塞渲染副作用。

## WKWebView 下 HTML5 Drag & Drop 不可靠

- **现象**：字段选择弹层用原生 `draggable` + `onDragStart/Drop` 排序无效果。
- **根因**：WKWebView（Tauri macOS）对 HTML5 DnD 支持不可靠，事件不触发。
- **对策**：自绘鼠标拖拽（手柄 `onMouseDown` 启动 → window `mousemove` 算目标槽位实时重排 → `mouseup`/Esc/按钮状态结束），项目里 Settings 页已有同款实现可直接参考。

## WKWebView 下 blob + a.download 下载静默失败

- **现象**：`URL.createObjectURL` + 动态 `<a download>` + `click()` 无任何反应。
- **根因**：WKWebView 要求 anchor 挂载到 DOM 才处理下载，且 blob 下载落到系统下载目录、无法选路径。
- **对策**：导出走系统保存对话框：`@tauri-apps/plugin-dialog` 的 `save()` 选路径 + 自定义 `#[tauri::command] save_text_file`（`std::fs::write`）写入；capabilities 需加 `dialog:allow-save`。选择 Rust 写文件而非 `plugin-fs` 可避免 fs scope 白名单配置。

## serde_json 默认 BTreeMap 输出字母序，JS 降级需 sortKeys 对齐

- **现象**：网页版格式化 `{"b":1,"a":2}` 输出 `b` 在前，桌面版输出 `a` 在前，同一输入两端结果不一致。
- **根因**：`Cargo.toml` 的 `serde_json = "1"` 未启用 `preserve_order` 特性，`Value::Object` 用 `BTreeMap`，`to_string_pretty` 按键字母序输出；JS `JSON.stringify` 保留对象插入序。
- **对策**：`src/utils/backend.ts` 的 JS 降级实现统一经 `sortKeys()` 递归排序对象键后再序列化，与桌面 BTreeMap 行为对齐。新增任何返回 JSON 结构的降级命令都要走 `sortKeys`。

## 浏览器无 __TAURI_INTERNALS__，invoke 调用静默抛错

- **现象**：网页版 `invoke("xxx")` 调用直接 reject，无报错堆栈，工具内 catch 显示通用错误。
- **根因**：`@tauri-apps/api/core` 的 `invoke` 依赖 Tauri 注入的 `window.__TAURI_INTERNALS__`；纯浏览器（含 GitHub Pages 静态托管）无此全局，invoke 在调用时抛 `__TAURI_INTERNALS__...` 错误（import 本身不报错）。
- **对策**：`backend.ts` 的 `isDesktop()` 检测 `"__TAURI_INTERNALS__" in window`，桌面走 `invoke`、网页走 `jsImpls`；`isDesktop()` 守卫在调用前分支，确保浏览器永不进入 invoke 路径。curl 等无 JS 等价的命令网页版禁用按钮 + 提示，不进 backend。

## Monaco diff 编辑器卸载时的 console 噪音错误

- **现象**：文本比对切换布局（左右/仅对比/上下）时 console 报 `Error: TextModel got disposed before DiffEditorWidget model got reset`，无任何 UI 影响。
- **根因**：@monaco-editor/react 卸载 DiffEditor 时先 dispose model 再 reset widget 的顺序问题（Monaco 0.56 已知噪音），非业务代码缺陷；仅在组件卸载（布局切换）时触发，与是否使用 sideHeaders 无关（inline→stacked 不经 header 也报错）。
- **对策**：忽略，不修。排查布局切换相关问题时先把此错误排除，别误当回归。TextDiffEditor 卸载时正常清理 subRef/ResizeObserver/editorRef 即可。

## JSON 比对路径定位依赖 fmt_json 的缩进格式

- **现象**：变更路径列表点击定位，大 JSON 下总是跳到首个同名 key 的行（如 `$.items[3].name` 定位到 item0 的 name）。
- **根因**：原 `lastSegment(path)` 只取末段 key，用 `findIndex` 匹配包含 `"key"` 的行；pretty JSON 中同名 key 出现多次，命中首个。
- **对策**：`findPathLine`（`JsonDiff.tsx`）按 path 段（对象键/数组索引）在 pretty 文本中逐层行走，用缩进深度（serde_json `to_string_pretty` indent 2）确定层级，数组段跳过以 `}` 开头的元素结束行（`},`/`}`）。**若改 `fmt_json` 的输出缩进或格式，此函数需同步调整**。

