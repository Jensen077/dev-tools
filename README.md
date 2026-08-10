# devbox 开发者工具箱

一款面向开发者的桌面工具箱应用，解决日常开发中高频的 JSON 处理、文本比对、日志分析、调试辅助等需求。基于 Tauri 2 + React + TypeScript，macOS 原生体验，体积小、启动快。

## 功能一览

### JSON 系列
- **JSON 格式化** — 美化（缩进 2/4 可切换）与压缩（minify），解析失败精确定位行列
- **JSON 比对** — 递归按 key 比对，识别新增/删除/值修改，下方变更路径列表
- **日志提取** — 从混排日志中提取转义 JSON（`"{\"a\":1}"`），支持跨行与日志前缀，命中列表可格式化/复制
- **表格导出** — JSON 递归扁平化，表格预览，导出 CSV / JSONL（含公式注入防护）
- **字段提取** — 按 JSON 路径提取字段，嵌套 key 用 `.` 连接

### 文本与调试
- **文本比对** — Monaco 并排 diff，行级高亮、点击导航
- **Curl 执行** — 粘贴 curl 脚本直接执行，展示状态码/响应头/响应体（JSON 自动格式化高亮）
- **正则测试** — 语法高亮命中、捕获组展开、实时匹配计数
- **图片预览** — 快速查看图片文件

### 编码与安全
- **编码转换** — Base64 编解码、URL 编解码、大小写转换（UTF-8 安全）
- **时间戳** — 秒/毫秒 ↔ 日期互转，本地/UTC 时区
- **Hash 计算** — MD5、SHA-1、SHA-256/384/512，支持文本与文件
- **JWT 解析** — 解码 header/payload，展示过期状态与剩余时间

### 通用能力
- **历史记录** — 所有工具的操作历史，可一键加载重放
- 文件拖拽导入、全局快捷键（`Cmd+1..9` 切换工具、`Cmd+Enter` 执行、`Cmd+Shift+C` 复制）、命令面板（`Cmd+P`）、深浅主题切换、工具启停排序

## 界面截图

![JSON 格式化](docs/screenshots/01-json-formatter.png)

![JSON 比对](docs/screenshots/02-json-diff.png)

![日志提取](docs/screenshots/03-log-extractor.png)

## 技术栈

| 层 | 选型 |
|-----|------|
| 桌面框架 | Tauri 2.x（Rust 后端 + Web 前端） |
| 前端 | React 19 + TypeScript + Vite |
| 编辑器/Diff | Monaco（`@monaco-editor/react`，本地打包无 CDN） |
| 状态管理 | zustand |
| JSON 核心逻辑 | Rust + serde_json（前端 invoke 调用，异步不阻塞 UI） |

## 环境要求

- macOS（Apple Silicon 或 Intel）
- Rust 1.97+、Node 22+、Xcode Command Line Tools

## 开发与构建

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm tauri dev

# 生产构建（产出 .app，自动清理旧 dist 重新打包）
pnpm tauri build

# 类型检查（会先清理 dist 再重新构建）
pnpm build
```

构建产物位于 `src-tauri/target/release/bundle/macos/devbox.app`。

## 下载

访问 [Releases](https://github.com/Hokok/dev-tools/releases) 下载最新版本。

> 注：当前为未签名/未公证构建，macOS 首次打开需右键选择"打开"，或到 系统设置 → 隐私与安全性 中允许。
