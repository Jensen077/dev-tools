# VERSION.md — 版本迭代记录

> 版本号三处同步维护：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`。
> 每次发版先在这里补一条，再改三处版本号，最后 `pnpm tauri build`。

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