# devbox 开发者工具箱 — v1 需求设计文档

> 版本：v1.0
> 日期：2026-08-01
> 状态：已交付

## 1. 项目概述

**devbox** 是一款面向开发者的桌面工具箱应用，解决日常开发中高频的 JSON 处理、文本比对与日志分析需求。首版聚焦 JSON 全链路（格式化、比对、日志提取、表格导出）与文本比对，架构采用插件化工具注册表设计，支持后续无缝扩展更多工具（编码转换、Hash、JWT、时间戳、网络调试等）。

### 1.1 背景与痛点

- 开发排查问题时常需从日志中捞出 JSON，日志里普遍存在**转义 JSON**（`{\"a\":1}`）与日志前缀混排，手动提取费时易错
- 需要频繁比对 JSON 字段差异，纯文本 diff 无法识别结构化变化
- 现有命令行工具（jq 等）操作成本高，缺乏可视化

### 1.2 目标

- 提供可视化、可交互的 JSON/文本处理体验
- 重点解决「从日志中提取转义 JSON」这一高频痛点
- 插件化架构，低成本扩展更多工具

## 2. 技术选型

| 层 | 选型 | 理由 |
|-----|------|------|
| 桌面框架 | Tauri 2.x | Rust 后端 + Web 前端，体积小，Apple Silicon 原生 |
| 前端 | React 18 + TypeScript + Vite | 生态成熟，类型安全 |
| 编辑器/Diff | Monaco（`@monaco-editor/react`） | VS Code 同款，diff/高亮/搜索零成本 |
| 状态管理 | zustand | 轻量，单 store 足够 |
| 后端逻辑 | Rust + serde_json | JSON 核心逻辑放后端，可单测 |

### 2.1 平台

- macOS（Apple Silicon，M4）
- 首版仅产出 `.app`，不做 Windows/Linux
- 运行环境：Rust 1.97+，Node 22+，Xcode CLT

## 3. 功能需求

### 3.1 JSON 格式化

| 项 | 说明 |
|----|------|
| 输入 | 粘贴文本 / 打开文件 |
| 功能 | 美化（缩进 2/4 可切换）、压缩（minify） |
| 错误处理 | 解析失败显示消息 + 精确行/列（1-based） |
| 辅助 | 从「日志提取」页跳转自动载入并格式化 |

### 3.2 JSON 结构化比对

| 项 | 说明 |
|----|------|
| 输入 | 左右两个输入区（各支持粘贴/文件） |
| 比对逻辑 | 递归按 key 比对，识别 新增/删除/值修改 |
| 展示 | 上：Monaco 并排 diff（标准化后）；下：变更路径列表 |
| 边界 | 完全一致时显示「完全一致」 |

### 3.3 日志提取转义 JSON（核心功能）

| 项 | 说明 |
|----|------|
| 输入 | 粘贴多行日志 / 打开日志文件 |
| 识别能力 | 纯 JSON、被引号包裹的转义 JSON（`"{\"a\":1}"`）、日志前缀混排、跨行 JSON |
| 算法 | 字符级扫描，花括号配平 + 引号/转义感知，serde_json 解析验证 |
| 展示 | 命中列表：位置区间 + 提取后 JSON 预览 |
| 操作 | 任一命中可「格式化」（跳转格式化页）或「复制」 |
| 限制 | 单段扫描窗口 256KB，超出可能漏检（启发式取舍） |

### 3.4 文本比对

| 项 | 说明 |
|----|------|
| 输入 | 左右两个文本区（各支持粘贴/文件） |
| 展示 | Monaco DiffEditor 并排分栏，行级高亮、点击导航 |
| 用途 | 任意文本（配置文件、代码片段、日志）比对 |

### 3.5 JSON 表格导出

| 项 | 说明 |
|----|------|
| 输入 | JSON 对象或数组 |
| 功能 | 递归扁平化（嵌套 key 用 `.` 连接），表格预览 |
| 导出 | CSV / JSONL 一键下载 |
| 安全 | CSV 公式注入防护（`= + - @ \t \r` 前缀单元格加 `'`） |

## 4. 非功能需求

| 项 | 要求 |
|----|------|
| 性能 | Rust 核心命令 async，不阻塞 UI；extract 单次扫描限 256KB 防 O(n²) |
| 安全 | 显式 CSP（`script-src 'self'`）；Monaco 本地打包，无 CDN 依赖 |
| 体积 | 安装包约 11MB |
| 可扩展 | 新工具 = 新增目录 + `tools/index.ts` 注册一行，框架零改动 |
| 类型安全 | 前端 strict TS 零 `any`；Rust 无生产路径 unwrap |

## 5. 架构设计

```
┌────────────────────────────────────────────────┐
│ devbox.app (Tauri 2)                           │
│                                                │
│  Rust 后端                 React 前端          │
│  ┌────────────────────┐   ┌────────────────┐  │
│  │ commands.rs 桥接     │   │ Sidebar + WorkArea │
│  │  ├ format.rs        │◀─▶│ tools/index.ts    │
│  │  ├ extract.rs       │   │  ├ json-formatter  │
│  │  └ diff.rs          │   │  ├ json-diff       │
│  └────────────────────┘   │  ├ log-extractor    │
│  serde_json               │  ├ text-diff        │
│                           │  └ json-table       │
│                           │  Monaco + zustand   │
│                           └────────────────┘  │
└────────────────────────────────────────────────┘
```

### 5.1 Rust 模块

| 文件 | 职责 |
|------|------|
| `format.rs` | 美化/压缩，`ParseError{message,line,column}`（column 透传 serde_json 1-based） |
| `extract.rs` | 转义感知扫描，`JsonMatch{start,end,raw,value}`；MAX_SCAN 256KB |
| `diff.rs` | 递归比对 → `Option<DiffNode>`（None=无变更），`ChangeType{added,removed,modified}` |
| `commands.rs` | `fmt_json` / `min_json` / `extract_json_cmd` / `compare_json`，均 async |

### 5.2 前端结构

```
src/
  tools/index.ts        # 工具注册表 ToolDef{id,name,icon,component}
  tools/<tool>/*.tsx    # 各工具页面
  components/           # JsonEditor / TextDiffEditor / Monaco 封装
  store/app.ts          # zustand：activeTool / extractedJson（页间跳转）
  monaco-setup.ts       # 本地打包 Monaco + worker 配置
  types.ts              # 与 Rust 结构对应的 TS 类型
```

### 5.3 数据流

1. 前端 `invoke()` 调用 Rust command（async，Tauri 线程池执行）
2. Rust 返回序列化结果（`ParseError` / `JsonMatch[]` / `DiffNode`）
3. 前端类型化消费，错误经 `errMsg()` 归一化后展示
4. 「日志提取 → 格式化」通过 store 的 `extractedJson` 单向传递，消费后清空

## 6. 测试策略

| 层 | 覆盖 | 数量 |
|----|------|------|
| Rust 单测 | extract（转义/跨行/嵌套/误报/多命中）、diff（增删改/嵌套/数组/全等）、format（美化/压缩/行列） | 18 |
| 前端 | `tsc --noEmit` 严格类型 | 0 错误 |
| 构建 | `pnpm build` + `tauri build` | 成功 |
| 手动验收 | 5 工具实际使用 | 通过 |

## 7. 已交付产物

- `src-tauri/target/release/bundle/macos/devbox.app`（约 11MB）
- `src-tauri/target/release/bundle/dmg/devbox_0.1.0_aarch64.dmg`
- 开发模式：`pnpm tauri dev`

## 8. 已知取舍与后续规划

### v1 取舍（有意为之）

| 取舍 | 说明 | 升级路径 |
|------|------|----------|
| extract 启发式 | >256KB JSON 静默漏检；对抗性输入仍有 O(n×256KB) | 分块/增量扫描 |
| 数组 diff 无 LCS | `[1,2,3]`→`[3,2,1]` 报三项全改 | 引入 LCS 对齐 |
| 文本 diff 无关键词导航 | 变更路径列表不跳转行 | Monaco `revealLine` |

### v2 规划（按工具注册表扩展）

- 编码转换：Base64 / URL / 大小写
- Hash 计算：MD5 / SHA 系列
- JWT 解析、时间戳↔日期互转
- 正则测试器
- HTTP / WebSocket 调试（较重，后置）

## 9. 风险记录

| 风险 | 状态 |
|------|------|
| Tauri 首次编译慢（数分钟） | 已接受，开发用热重载 |
| CSP 阻断 Monaco（曾 CDN 加载） | 已修复：本地打包 + alias 绕过 exports map |
| 日志提取误报/漏报 | 命中全部列出由用户选择，不自动替换 |
