# devbox 开发者工具箱 — v3 体验优化 + 新工具设计文档

> 版本：v3.0
> 日期：2026-08-08
> 状态：设计中
> 前置：v1（已交付）→ v2（历史记录/字段提取，已合入）→ v3（本次）

## 1. 目标

v3 分两条线：

1. **体验修复**：补齐 v1 交付时被精简掉的交互能力（日志提取命中列表、错误定位、路径跳转），并增加通用便捷能力（文件拖拽、复制、快捷键、自动执行）。
2. **新工具**：覆盖日常开发高频需求的编码转换、时间戳、Hash、正则、JWT，以及「粘贴 curl 脚本 → 执行 → 查看响应」的 HTTP 调试入口。

设计原则：**零新增 npm 依赖、零 CSP 改动**，纯前端工具用 TypeScript，curl 执行走 Rust 后端（避免 CORS）。

## 2. 技术约束

| 项 | 决策 | 理由 |
|----|------|------|
| 新 npm 依赖 | 无 | 全部用 Web Crypto / 原生 API / 内联实现 |
| 新 Rust 依赖 | `reqwest`(rustls) + `shell-words` | curl 执行必须绕过 CORS，放后端；rustls 避免系统 OpenSSL |
| CSP | 不改 | 请求从 WebView 外（Rust）发出，不受前端 CSP 约束 |
| 主题 | 沿用 CSS 变量 + Monaco vs-dark/light | 新工具全部复用现有 token |
| 类型 | strict，零 `any`，零 `as` 断言 | 沿用 v1 约束 |

## 3. 工作流 A：现有工具体验修复

### A1 格式化页「复制结果」
`Formatter.tsx` 输出区顶部加「复制结果」按钮，`output` 非空时可用，写入剪贴板。

### A2 应用级文件拖拽
新增 `src/hooks/useFileDrop.ts`：返回 `{ dropRef, isDragging }`，组件把 `dropRef` 挂到输入面板，拖入 `.txt/.json/.log/.js/.ts` 等文本文件后回调 `onFile`（读文本）。处理 `dragover` 阻止默认 + 视觉反馈，`drop` 取 `dataTransfer.files[0]` 读 `file.text()`。

覆盖：Formatter、LogExtractor、JsonTable、JsonFieldExtract（单输入）；TextDiff（左/右两个输入）。

### A3 日志提取命中列表（恢复设计意图）
重写 `LogExtractor.tsx`：

- 结果区从「合并 JSON 数组」改为**命中列表**：每条显示
  - 位置区间 `[start..end]`
  - 原始片段（`raw`，单行截断，hover 看全量）
  - 提取后 JSON 预览（`value`，格式化缩进 2）
  - 操作：**格式化**（写入 `extractedJson` 跳转 JSON 格式化页）、**复制**（复制该条 JSON）
- 保留顶部「复制全部」（多条时把 value 数组序列化）

### A4 解析错误定位光标
`JsonEditor` 增加可选 `error?: ParseError | null` 属性；非空时在 effect 中 `editor.revealPositionInCenter({lineNumber, column}, 0)` + `setPosition`。Formatter 与 JsonDiff 把解析错误传入输入编辑器。

### A5 变更路径点击跳转 diff 行
`TextDiffEditor` 增加 `revealLine?: (editor) => void` 或改由父级持有 ref。简化方案：`TextDiffEditor` 接收 `editorRef`（`MutableRefObject<editor.IStandaloneDiffEditor | null>`）与 `revealLine: (line: number) => void`。JsonDiff/TextDiff 将 diff 文本按行建立 `path → 行号` 索引：

- JsonDiff：标准化的 pretty JSON 里，行号如何对应到 path？**折衷**：变更路径列表点击时，在右值编辑器内 `find` 该 path 对应叶子值，用 Monaco `find`/`revealRange` 定位。**懒人方案**：点击 path → 在右值 pretty 文本中查找该 key 名所在行（`行内容包含该 key`），`revealLineInCenter`。足够导航使用。

### A6 全局快捷键
新增 `src/hooks/useKeyboardShortcuts.ts`：

| 快捷键 | 动作 |
|--------|------|
| `Cmd/Ctrl+1..7` | 切换工具（序号对应 TOOLS 顺序） |
| `Cmd/Ctrl+Enter` | 执行主动作（格式化/比对/提取） |
| `Cmd/Ctrl+Shift+C` | 复制当前结果 |

通过全局 `keydown` 监听；避免与 Monaco 内置快捷键冲突（Monaco 已占用 `Cmd+F` 等）。`useKeyboardShortcuts` 内部用 `useAppStore.getState()` 触发，不依赖组件树。各工具页在 toolbar 上给执行按钮注册 `data-hotkey="run"`，快捷键处理器查找 `[data-hotkey="run"]` 点击。

### A7 格式化页粘贴后自动执行
输入变化 debounce 600ms 后，若输入非空且 `autoRun` 开启则自动 `format`。工具栏加「自动」checkbox（默认开），显式点击「格式化/压缩」永远可用。

## 4. 工作流 B：新工具

### B1 编码转换（`tools/encode-convert/`）
- 模式：`Base64 编码` / `Base64 解码` / `URL 编码` / `URL 解码` / `大写` / `小写`
- Base64 用 `btoa`/`atob` 配合 `TextEncoder/TextDecoder`（UTF-8 安全）
- URL 用 `encodeURIComponent`/`decodeURIComponent`（异常 try/catch 提示）
- 实时双向：输入框输入，输出框即时刷新；反向模式同样成立

### B2 时间戳 ↔ 日期（`tools/timestamp/`）
- 输入秒/毫秒时间戳 → 输出本地时间、UTC 时间、ISO 字符串、相对当前时间差
- 反向：选择日期（datetime-local）→ 生成秒/毫秒时间戳
- 时区下拉（本地 / UTC），纯前端 `Date`

### B3 Hash 计算（`tools/hash/`）
- 算法：SHA-1、SHA-256、SHA-384、SHA-512（Web Crypto `crypto.subtle.digest`）+ MD5（内联 ~40 行实现，`src/utils/hash.ts`）
- 输入：文本或文件（`arrayBuffer` 直接哈希，避免大文件转字符串）
- 输出：各算法 hex 列表，一键复制单项，另存完整结果

### B4 正则测试器（`tools/regex-tester/`）
- 上：pattern + flags（`g i m s u` checkbox）+ 测试文本（JsonEditor, language=text）
- 下：Monaco `deltaDecorations` 高亮命中（`overviewRuler` + 背景色），匹配列表（序号、完整匹配、捕获组展开）
- 非法正则实时提示；`g` 旗标切换影响匹配计数

### B5 JWT 解析（`tools/jwt/`）
- 输入 token → base64url 解码 header/payload（`src/utils/base64url.ts`，含 padding 补齐）
- 展示：header/payload 格式化 JSON（只读编辑器）、标准字段提取（exp/iat/nbf/iss/sub/aud）+ 过期状态与剩余时间
- 错误处理：非三段结构、非法 base64url、非 JSON 载荷分别提示

### B6 Curl 执行器（`tools/curl-runner/` + Rust）
**实现方式**：直接调用系统 `curl` 执行脚本，不自建解析器——系统 curl 天然支持 `--url`/`-X`/`-H`/`-b`/`-d`/`-o` 等全部语法，并保留脚本原始行为（如浏览器复制脚本中的 `--url` 与 cookie 串）。

**Rust**（`src-tauri/src/curl.rs`）：

```rust
pub struct HttpResult {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
    pub duration_ms: u64,
}
```

- `run_curl_script(script) -> Result<HttpResult, String>`：`shell_words::split` 分词 → `tokio::process::Command::new("curl")` 执行，追加 `-sS --max-time 60 -D <临时头文件> -o <临时body文件> -w "__DEVBOX__%{http_code} %{time_total}"`；从 `-D` 输出解析最终响应头与 status_text，`-w` 提取状态码与耗时。
- 依赖：`shell-words` + `tokio`（process），**无 reqwest**。移除了初版设计的 `parse_curl`/`run_request`（reqwest）。

注册到 `commands.rs` / `lib.rs`，Cargo.toml 增加：

```toml
shell-words = "1"
tokio = { version = "1", features = ["process"] }
```

**前端**：

- 上：curl 文本（JsonEditor, language=text）+「解析」
- 中：解析结果表单——URL、Method（select）、Headers（key/value 行列表，可增删）、Body
- 下：「执行」按钮 → 结果：状态码徽章（2xx 绿 / 4xx 黄 / 5xx 红）、耗时、响应头列表、响应体（**尝试 JSON.parse 成功则格式化高亮只读；失败原样文本**）
- 执行记录进历史 store（action: "curl 执行"，payload: {input}），可从历史加载重放
- 错误展示：网络/DNS/超时/解析失败消息

## 5. 文件改动清单

```
新增：
  src/hooks/useFileDrop.ts
  src/hooks/useKeyboardShortcuts.ts
  src/utils/encoding.ts          # B1
  src/utils/hash.ts              # B3（含 MD5）
  src/utils/base64url.ts         # B5
  src/tools/encode-convert/EncodeConvert.tsx
  src/tools/timestamp/Timestamp.tsx
  src/tools/hash/Hash.tsx
  src/tools/regex-tester/RegexTester.tsx
  src/tools/jwt/Jwt.tsx
  src/tools/curl-runner/CurlRunner.tsx
  src-tauri/src/curl.rs

修改：
  src/tools/index.ts              # 注册 6 个新工具
  src/App.tsx                     # A6 快捷键
  src/components/JsonEditor.tsx   # A4 error 定位
  src/components/TextDiffEditor.tsx # A5 revealLine
  src/tools/json-formatter/Formatter.tsx      # A1 A2 A4 A7
  src/tools/log-extractor/LogExtractor.tsx    # A2 A3
  src/tools/json-diff/JsonDiff.tsx            # A2 A4 A5
  src/tools/text-diff/TextDiff.tsx            # A2 A5
  src/tools/json-table/JsonTable.tsx          # A2
  src/tools/json-field-extract/JsonFieldExtract.tsx # A2
  src/tools/tool.css               # 命中列表 / 状态徽章 / 表单样式
  src-tauri/src/commands.rs        # 注册 parse_curl / run_request
  src-tauri/src/lib.rs
  src-tauri/Cargo.toml             # +reqwest +shell-words
```

无 `tauri.conf.json` / CSP / 图标改动。

## 6. 测试策略

| 层 | 覆盖 | 方式 |
|----|------|------|
| Rust `parse_curl` | 单引号/双引号/转义、多 `-H`、`-d`/`-X`、`-u`→Authorization、`-G`、未知 flag 容错 | `#[cfg(test)]` 单测（沿用现有模式） |
| Rust `run_request` | 本地起测试端口验证 2xx/4xx、JSON 响应 | `#[cfg(test)]`（`std::net::TcpListener` 简易 mock） |
| 前端纯函数 | encoding / base64url / hash(MD5 已知向量) / MD5 | DEV 自检断言（沿用 JsonFieldExtract 模式） |
| 前端类型 | `pnpm build`（tsc strict） | 0 错误 |
| 手动验收 | 拖拽、快捷键、错误定位、命中列表跳转、curl 执行 JSON 响应、6 新工具 | 通过 |

## 7. 风险与取舍

| 项 | 说明 |
|----|------|
| reqwest 体积 | 安装包 +~5MB，可接受（rustls 免系统依赖） |
| `-F` 文件上传不支持 | 明确报「暂不支持」，后续可加文件选择 |
| TLS 证书不校验 | 调试场景便利优先；文档与代码注释明示风险 |
| diff 路径跳转按行找 key | 启发式定位，嵌套同名 key 可能跳错，够用即可 |

## 8. 里程碑

1. v3 文档（本文）→ 评审
2. 工作流 A：A1→A2→A3→A4→A5→A6→A7
3. 工作流 B：B1→B2→B3→B4→B5→B6
4. 注册工具 + 样式
5. `pnpm build` + `cargo test` + 手动验收
6. code review
