# JSON 格式化多标签 — 设计文档

日期：2026-08-12
状态：已批准（方案 A：工具内局部多标签）

## 背景与目标

用户有多开 JSON 格式化面板的需求（如同时格式化多份 JSON，互不覆盖草稿）。
形态确认：单窗口内多标签页（仿浏览器 tab），每页一个独立的「输入 | 输出」格式化视图，
内容跨应用重启持久化。仅作用于 JSON 格式化工具，不做通用多标签架构（YAGNI）。

## 现状约束

- `App.tsx:37` 单工具渲染，工具切换即卸载组件；工具由 `activeTool` 驱动，`TOOLS` 注册表
  （`src/tools/index.tsx`）定义组件。
- `Formatter.tsx` 是自治组件：输入/输出/缩进/自动格式化全在内部 `useState`，草稿经
  `useSaveDraft("json-formatter", ...)` 在卸载时写回 zustand 内存 store（不落 localStorage）。
- 历史是工具级的：`ToolHistory` + `pendingLoad` 缓冲，`useApplyHistory` 只回填当前挂载的编辑器。
- Monaco 每次渲染一个编辑器实例；多实例同时挂载会累积内存。
- 项目约定：持久化走 localStorage（`devbox-*` key），读取 try/catch 防御、写入静默忽略；
  标签 id 用 `crypto.getRandomValues` 自实现 UUID v4（WKWebView 无 `crypto.randomUUID`）。

## 架构

新增 `src/tools/json-formatter/FormatterTabs.tsx` 标签容器，`TOOLS` 中 `json-formatter` 的
`component` 替换为 `FormatterTabs`（工具 id 不变 → 侧边栏/快捷键/命令面板/历史筛选零影响）。

容器状态：
- `tabs: Tab[]`，`Tab = { id: string; input: string; indent: number; autoRun: boolean }`
- `activeId: string`

渲染策略：**只挂载激活标签**的 `<Formatter tabId={id} initialData={...} onChange={...} />`，
切换标签即卸载旧实例 → Monaco 一次仅一个，内存可控；`useApplyHistory`/`extractedJson` 跳转
因只有激活标签挂载而自然回填到激活 tab。

## Formatter.tsx 改造（受控化，改动最小化）

新增 props：
- `tabId: string` — 标签标识（当前仅用于潜在的多实例区分，预留）
- `initialData?: { input: string; indent: number; autoRun: boolean }` — 初始值
- `onChange?: (d: { input: string; indent: number; autoRun: boolean }) => void` — 内容上报

改动点：
- `useState` 初始值改从 `initialData` 取（不再读 `useAppStore.drafts`）
- 移除 `useSaveDraft`
- 输入/缩进/自动格式化变化时调用 `onChange` 上报容器

不变点：
- `useApplyHistory("json-formatter", ...)` 历史回填逻辑
- `extractedJson`（日志提取跳转）载入逻辑
- `addHistory` / `ToolHistory` 工具 id 筛选
- `run("format" | "minify")`、`handleUnescape`、折叠/展开、文件拖拽、复制

## 持久化（跨重启）

- key `devbox-json-formatter-tabs`：`{ activeId: string, tabs: Tab[] }`
- 读取 try/catch 防御，非法/异常回落单标签默认（空输入、indent 2、autoRun true）
- 写入静默忽略（配额满时同现有模式丢弃）
- 标签 id 自实现 UUID v4

## UI（标签栏）

- 位置：工具栏上方一行标签栏（仿浏览器 tab）
- 标签名：默认「JSON N」序号；激活态高亮
- 右侧 `+ 新建` 按钮；每个标签带关闭按钮 `×`
- 至少保留一个标签（最后一个不可关）
- 标签上限 10（防 Monaco 累积）

## 兼容性

- `ToolHistory` 不动；`addHistory` 记录来源 tab 的 input，行为与现在一致
- 从日志提取跳转、命令面板、`data-hotkey` 快捷键（⌘↩ 格式化 / ⇧⌘C 复制）均作用于激活标签

## 验证

- `pnpm build`（tsc 严格模式：`noUncheckedIndexedAccess`/`noUnusedLocals`/`noImplicitReturns`）通过
- `cargo test` 无 Rust 侧改动，不受影响
- 手动验证清单：
  1. 开/关标签（新建、关闭、激活切换）
  2. 切换工具再回（激活标签内容保留）
  3. 重启 App（所有标签与激活态恢复）
  4. 历史「加载」回填到激活 tab
  5. 日志提取跳转 → 载入激活 tab

## 开发方式

按用户要求用 git worktree 隔离开发：`.worktrees/json-formatter-tabs`（已 gitignore）
新分支开发，完成后合并回 main。当前 main 未提交改动（`StackedDiff.tsx`/`JsonDiff.tsx`）
与本功能无关，保留在原工作区。
