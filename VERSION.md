# VERSION.md — 版本迭代记录

> 版本号三处同步维护：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`。
> 每次发版先在这里补一条，再改三处版本号，最后 `pnpm tauri build`。
> **积压式**：功能落地时先记一条 `## Unreleased`（技术性），到发版日把 `Unreleased` 改为 `## vX.Y.Z — 日期`。

## Unreleased

**JSON 编辑器交互增强**（悬停预览/点击复制/折叠控制，codicon 字体修复）

- `src/monaco-setup.ts` 修复 codicon 字体缺失：`@font-face` 只在 `editor.main` 链式引入，本项目用 `editor.api` 到不了，折叠箭头/展开按钮等 codicon 图标一直空字形；显式 import `codicon.css` 补上（产出 `dist/assets/codicon-*.ttf`）
- JSON key/value 分色：Monarch tokenizer 加 lookahead 规则识别对象 key（`"(?:[^"\\]|\\.)*"(?=\s*:)`），双主题各加 `key` 配色（浅 `#0969da` / 深 `#79c0ff`）
- 悬停预览（json-handle 式）：`src/utils/jsonHover.ts` 单遍扫描器记录每个对象 key 区间（含嵌套/数组/转义），`monaco.languages.registerHoverProvider` 悬停 key/value 区间浮层展示 pretty 值；`WeakMap` 按 model+versionId 缓存，大 JSON 不卡
- 点击复制：`monaco.editor.onDidCreateEditor` + `onMouseDown`，只读编辑器（输出侧）点击 key/value 区间即复制该值，Toast 提示；可编辑输入框不受影响
- 设置页新增「悬停预览 JSON 值」开关（`src/store/app.ts` 加 `jsonPreview`，持久化 `devbox-json-preview`），关闭时 hover 与点击复制均停用
- JSON 格式化输出 pane 标题栏新增「全部闭合/全部展开」按钮（`editor.foldAll`/`editor.unfoldAll`），`JsonOutput` 透传 `editorRef`；`.pane-title` 改 flex 支持右侧按钮
- 坑：`jsonHover.ts` DEV 自检断言 `findKeyAt(spans, 0)` 期望命中首个 key，但偏移 0 是 `{` 不在任何 key 区间，DEV 模式抛错导致白屏；改为断言 `keyA.keyStart`

## v1.0.10 — 2026-08-11

**编码转换工具改为 base64.us 格局**（参考 https://base64.us/ 的纵向流布局，UI 沿用 Meta (Store) 风格）

- `src/tools/encode-convert/EncodeConvert.tsx` 重构：去掉 `ResizableSplit` 左右分栏与实时预览，改为「上输入 → 中操作行 → 下输出」纵向布局，对齐 base64.us 交互——主按钮按当前模式单向转换（文案随模式变，`data-hotkey="run"` 支持 `⌘↩` 触发），新增「交换上下」按钮（输入↔输出互换，便于编解码链式操作），复制按钮移到中间操作行（`data-hotkey="copy"`，`⇧⌘C`）
- 模式下拉改为分段控件（复用 `.seg`/`.seg-btn`），标签压缩（`B64 编码`/`B64 解码`/`URL 编码`/`URL 解码`/`转大写`/`转小写`）
- `output` 由 `useMemo` 实时计算改为 state，仅 run 时计算；出错走 error-box（按钮行与输出之间）；成功后显示「输入 N 字符 → 输出 M 字符」统计
- 保留 6 种模式、`useSaveDraft`（input+mode）、`useApplyHistory` 历史回填、`addHistory`（run 时记录）与 ToolHistory；转换逻辑复用 `src/utils/encoding.ts` 零改动
- `src/tools/tool.css` 新增 `.action-row`（中间操作行）最小样式
- 版本号同步三处：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` → 1.0.10

## v1.0.9 — 2026-08-11

**UI 视觉语言切换为 Meta (Store) 风格**（自 v1.0.8 的 GitHub Primer；设计契约见 `skills/dev-tools-design/DESIGN.md`）

- **设计令牌重映射**：`src/App.css` 保留全部变量名仅重赋值——浅色改白色画布 `#ffffff` + 暖灰副面 `#f1f4f7` + Meta Blue `#0064E0`，深色改近黑 `#181a1b` + 亮蓝 CTA `#47A5FA`；语义色/徽标/圆角（8/20/24/100）/阴影（浮层双阴影）同步切换；默认主题回浅色
- **组件库引入 Base UI**（`@base-ui/react`）：历史下拉与表格字段选择 → Popover，命令面板 → Dialog（获得焦点陷阱 / Esc 关闭 / 遮罩点击关闭），删去手写外部点击关闭逻辑
- **代码框配色**：Monaco 主题（`src/monaco-setup.ts`）改为 GitHub 默认（浅/深），diff 增删行同 GitHub 红绿
- **组件打磨**：按钮胶囊化 + Meta Blue 主按钮（hover 变深 + scale）；侧边栏扁平通栏 + 激活 Baby Blue 左条；搜索框去边框色块化；全局字号收敛 11/12/13/14 阶梯（去除 12.5/13.5 碎刻度）；JSON 缩进改分段控件；开关放大 38×23；正则旗标改胶囊
- **设计稿对齐**：`devbox-style-prototype.html` 同步为同一 Meta 体系（Open Design 设计文件区）
- **设计契约化**：重写 `skills/dev-tools-design/DESIGN.md` 为当前 Meta Store 风格契约，后续 UI 迭代遵循该文件

## v1.0.8 — 2026-08-11

**重构 UI 为 GitHub Primer 风格**（依据 `skills/dev-tools-design/DESIGN.md`，分支 `refactor/github-primer-ui`）

- **设计令牌整体重映射**：`src/App.css` 保留全部变量名（`--bg`/`--accent`/`--btn-primary-bg`/`--sidebar-active` 等），仅重赋值——浅色改用 Primer light（`#ffffff` 画布、`#f6f8fa` 副面、`#d0d7de` 发丝边框、`#0969da` 蓝、`#1a7f37` 绿），深色改用 Primer dark（`#0d1117`/`#161b22`/`#30363d`/`#58a6ff`）；所有消费 `var()` 的 CSS 与工具组件自动继承
- **默认主题浅色化**：`src/store/app.ts` 的 `readTheme()` 回落从 dark 改 light，`index.html` 首帧兜底 `#1e1e1e`→`#ffffff`
- **侧栏 296px 实色化**：`width: 180px→296px`，去掉 `backdrop-filter` 玻璃模糊，激活项改为「`--sidebar-active` 底 + `--sidebar-active-fg` 字」的 GitHub 风格，删除左侧滑入指示条
- **动效收敛**：删除 `--ease-spring`/`--dur-slow`/`--glass-blur` 令牌与 `tool-enter`/`tool-exit`/`indicator-in`/`item-in`/`error-in` 动画；hover 80ms、菜单展开 200ms；`src/App.tsx` 移除交叉渐隐的 `ExitSlot` 退场逻辑，工具切换瞬时生效
- **组件对齐**：按钮体系改 GitHub 规范（主按钮蓝 `#0969da`、danger 悬停红底白字、去 scale 按下动效）；`.pane` 白底 + `.pane-title` 顶部 `#f6f8fa` 色带头；输入框 focus 环 `0 0 0 3px rgba(9,105,218,0.3)`；`.regex-match` 与 RegexTester overviewRuler 绿改为主题感知（`#1a7f37`/`#3fb950`）
- **字号**：正文 13px→14px，重量仅 400/600

## v1.0.7 — 2026-08-11

**新增**
- 网页版（GitHub Pages）：同一套前端代码零服务端部署，`pnpm build` 产出的 `dist/` 即静态站点
- `src/utils/backend.ts` 适配层：桌面检测 `window.__TAURI_INTERNALS__` 走 Rust `invoke`，网页走 JS 降级实现，桌面端语义零变化
- 4 个 JSON 命令的 JS 降级（与 Rust 返回结构逐字段对齐）：`fmt_json`/`min_json`（含 `sortKeys` 匹配 serde_json BTreeMap 字母序）、`compare_json`（diff 树移植）、`extract_json_cmd`（括号配平扫描器移植）
- 表格导出网页分支：`Blob` + `<a download>` 下载（桌面仍走系统保存对话框）
- `.github/workflows/pages.yml`：push 到 `main` 自动构建发布到 GitHub Pages
- `.github/workflows/release.yml`：push `v*` 标签触发矩阵构建——macos universal dmg / ubuntu deb+AppImage / windows msi+nsis，挂资产到草稿 Release（未签名未公证）
- `tauri.conf.json` 的 `bundle.targets` 增加 `deb`、`appimage`（Tauri 按宿主 OS 自动过滤）
- `vite.config.ts` 加 `base: "./"`（相对路径，项目页/组织页通吃）

**网页版限制**
- Curl 执行需调用系统二进制且受 CORS 限制，网页版禁用并提示「请使用桌面版」
- `extract_json_cmd` 的 `start/end` 偏移为 UTF-16 索引（Rust 为字节偏移），非 ASCII 日志展示数字略有出入，不影响提取结果

## v1.0.6 — 2026-08-10

**新增**
- 表格导出增强：数据源三态选择（自动解析数组 / 整个 JSON 不解析数组 / 显式数组路径，嵌套数组自动收集）
- 表格预览分页（每页 50 行）+ 字段多选 + 列顺序拖拽排序（预览与导出同步生效）
- 数组折叠为换行单元格（数组字段不再展开成 `[0]`/`[1]` 列）；「整个 JSON 不解析数组」模式下数组字段展开为索引列（`data[0].city`）
- CSV / JSONL 导出改为系统保存对话框选路径写入（新增 `tauri-plugin-dialog` + Rust `save_text_file` 命令）

## v1.0.5 — 2026-08-10

**新增**
- 图片预览支持直接粘贴 http(s) URL 预览远程图片：输入框自动识别 `http://`/`https://` 开头的链接并渲染，加载失败显示错误提示

## v1.0.4 — 2026-08-10

**新增**
- UUID 生成工具（侧边栏「UUID」，id `uuid`）：一键随机生成 4 种格式（小写带 `-` / 大写带 `-` / 小写无 `-` / 大写无 `-`），批量可复制、支持历史回填与草稿保存

**修复**
- macOS 窗口拖拽失效：`data-tauri-drag-region` 静默失败，根因是 capabilities 缺 `core:window:allow-start-dragging` 权限，已显式补上（拖拽现在可用了）

## 历史版本

- v1.0.0（init）
  - devbox 初始版本：JSON 格式化/比对/提取/表格导出/字段提取、文本比对、日志提取、Curl 执行、编码转换、时间戳、Hash 计算、JWT 解析、正则测试、图片预览、历史记录、设置，Monaco 本地打包，深浅主题

> v1.0.1 ~ v1.0.3 的变更未留下记录，从 v1.0.4 起按本文件维护。