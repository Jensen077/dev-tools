# 按钮 UI 改造设计

日期: 2026-08-08 · 分支: `ui/button-redesign`

## 背景

devbox 现有 52 个 `<button>` 分布在 15+ 文件中，无统一按钮体系，仅靠 `.toolbar button` 一条规则（`font-size:13px; padding:4px 10px`）加浏览器原生样式。主题变量已就绪（`App.css` dark/light）。

## 目标

- 新增统一 `.btn` 设计系统（基类 + 变体），复用现有主题变量
- 侧边栏导航按钮（`.tool-btn`）纳入统一风格语言，保留导航选中态
- 逐文件接入，无逻辑变更

## 设计系统

### 样式类

| 类 | 用途 | 视觉 |
|---|---|---|
| `.btn` | 基类 | inline-flex、13px、圆角 5px、1px 边框、hover 过渡、`focus-visible` 焦点环 |
| `.btn-primary` | 主操作（运行/解析/格式化/转换） | 实底 `--accent` 系、白字 |
| `.btn-danger` | 删除类 | 复用 `--error-*` 变量 |
| `.btn-sm` | 列表内小按钮 | 12px、紧凑 padding |

默认 `.btn` 即次级按钮（清空/打开文件/复制）。

### 新增主题变量（App.css，dark/light 各一套）

- `--btn-bg` / `--btn-bg-hover` / `--btn-fg` / `--btn-border`
- `--btn-primary-bg` / `--btn-primary-bg-hover` / `--btn-primary-fg`
- `--btn-danger-bg` / `--btn-danger-bg-hover` / `--btn-danger-fg`

### 侧边栏

`.tool-btn` 圆角/悬浮/激活态对齐 `.btn`，保持导航语义（`active` 高亮选中项）。

## 分类规则

- 主操作按钮 → `btn btn-primary`（执行/计算/格式化/比对/转表格等主动作）
- 次操作 → `btn`（清空、打开文件、复制、加载、记录）
- 危险 → `btn btn-danger`（History 清空、删除类）
- 列表小按钮 → `btn btn-sm`；删除类加 `btn-danger`

## 范围

- 新增/修改：`App.css`（变量 + `.tool-btn` 对齐）、`tool.css`（`.btn` 体系）
- 接入：14 个工具页 + `ErrorBoundary` + `ToolHistory`；侧边栏 `.tool-btn` 经 `App.css` 对齐
- 删除：`.toolbar button` 中针对按钮的 padding（select/label 保留）

## 验证

- `pnpm build`（tsc + vite）通过
- `pnpm dev` 手测主要页面 hover/disabled/主题切换
