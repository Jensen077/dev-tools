# VERSION.md — 版本迭代记录

> 版本号三处同步维护：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`。
> 每次发版先在这里补一条，再改三处版本号，最后 `pnpm tauri build`。
> **积压式**：功能落地时先记一条 `## Unreleased`（技术性），到发版日把 `Unreleased` 改为 `## vX.Y.Z — 日期`。

## v1.0.13 — 2026-08-13

**新增：RSA 密钥生成与加解密工具**（侧边栏「RSA」，id `rsa`，「编码与安全」分组，纯前端零 Rust）

- `src/tools/rsa/Rsa.tsx` 新建工具：密钥生成 + 加密 + 解密三段式布局（生成区上下分栏展示公私钥，加密/解密左右并排），按「新工具三步」注册到 `src/tools/index.tsx` 的 `TOOLS` 数组（`{ id: "rsa", name: "RSA", icon: <ToolIcon name="rsa" />, component: Rsa, cat: "编码与安全" }`）
- 密钥生成：Web Crypto `crypto.subtle.generateKey({ name: "RSA-OAEP" })`，支持 512/1024/2048 位；公钥导出 SPKI、私钥导出 PKCS#8（均 Base64），生成后自动填入加密（公钥）/解密（私钥）密钥框；生成密钥对写历史（`addHistory`）、草稿走 `useSaveDraft`、`useApplyHistory` 回填
- 加解密三种密码类型：RSA（无填充）/ RSA/ECB/PKCS1Padding（PKCS1 v1.5）/ RSA/ECB/OAEPWithSHA-1AndMGF1Padding（OAEP），公私钥四个方向均可操作
- 实现细节：OAEP 走 Web Crypto `encrypt`/`decrypt`（公钥加密/私钥解密）；非标准方向（私钥加密 `m^d mod n`、公钥解密 `c^e mod n`）用 node-forge `forge.jsbn.BigInteger.modPow` 手写 raw RSA，私钥加密补 PKCS1 Type 1 填充、公钥解密去填充
- 新增依赖 `node-forge` + `@types/node-forge`（纯前端实现，桌面与网页行为一致，无 Rust 命令，无需在 `commands.rs`/`lib.rs` 注册）

**修复：CI 全挂 + 工具链统一——CI 升级到 pnpm 10，`packageManager` 单一版本来源**

- 现象：RSA 提交新增的 `pnpm-workspace.yaml`（pnpm 10 的 `allowBuilds` 写法，无 `packages` 字段）让锁 pnpm 9 的 CI 直接报 `packages field missing or empty`，release.yml 三平台与 pages.yml 全部失败（根因与排查见 MEMORY.md）
- 根治：CI 不再锁 pnpm 9——`package.json` 加 `"packageManager": "pnpm@10.33.2"`（pnpm 版本单一来源），release.yml / pages.yml 的 `pnpm/action-setup@v4` 去掉 `version: 9` 自动读该字段；恢复 `pnpm-workspace.yaml`（`allowBuilds: esbuild: true`），删除 `package.json` 里已废弃的 `pnpm.onlyBuiltDependencies`
- 效果：本地与 CI 工具链对齐（本地本就是 pnpm 10.33.2），「版本漂移」故障类消除

**CI：Release 产物名加平台后缀**（本次发版生效）

- `.github/workflows/release.yml` 弃用 `tauri-action` 自动上传（无法干预文件名），改为手动 `pnpm tauri build` → 收集产物到 `artifacts/` 并重命名 → `softprops/action-gh-release` 上传草稿
- 重命名规则：文件名中的架构段（`_universal`/`_amd64`/`_x64`）替换为平台后缀——macOS `_macos64`、Linux `_linux64`、Windows `_windows64`（如 `devbox_1.0.12_macos64.dmg` / `devbox_1.0.12_windows64-setup.exe`）；`find` 按产物扩展名白名单（dmg/msi/exe/deb/AppImage）过滤，排除 linuxdeploy 与 deb 打包的中间文件
- 坑：`find bundle -type f` 会把 AppImage/deb 打包时 linuxdeploy 留在 `bundle/appimage/`、`bundle/deb/` 的临时文件（lib*.so、gschema、im-*.so 等）一并上传；macOS 的 `.app.tar.gz` 此前由 tauri-action 自动打包，改手动 build 后不会生成，需用 `tar` 手动把 `.app` 目录打成 tar.gz
- 各矩阵任务把 `suffix`/`bundle_dir` 放进 matrix；Linux 产物在 `target/release/bundle`、mac universal 在 `target/universal-apple-darwin/release/bundle`

## v1.0.12 — 2026-08-13

**修复：侧边栏 ⌘1-⌘9 快捷键显示与触发错位**

- 根因：侧边栏（`Sidebar.tsx`）按分组展示顺序给工具编号 `⌘1-⌘9`，而全局快捷键（`useKeyboardShortcuts.ts`）按 settings 扁平 `order` 数组取工具，两者顺序不一致——默认扁平顺序中 `text-diff`（第 4 位）与分组展示位置不同，导致侧边栏徽标显示「表格导出 ⌘4」按下实际打开「文本比对」等错位
- 修复：`src/tools/index.tsx` 新增共享函数 `getDisplayTools(order)`（先按 `GROUP_ORDER` 分组、组内保持 settings 顺序）+ 导出 `GROUP_ORDER` 常量；`Sidebar.tsx` 与 `useKeyboardShortcuts.ts` 均改用它，保证徽标显示与按下触发一致，消除顺序定义漂移风险

## v1.0.11 — 2026-08-12

**修复：JSON 格式化/比对/表格导出/文本比对四工具问题排查**（逐项复现验证）

- `format.rs`/`backend.ts` `reindent` 闭合括号错位：缩进 4 时 `}`/`]` 少缩一级（如 `],` 应为 8 空格、`},` 应为 4 空格），根因是闭合括号行被多余地 `saturating_sub(1)`——serde pretty 输出中闭合括号与开启块同缩进；去掉特判统一 `line_depth`，补精确断言测试 `format_pretty_indent4_closing_brackets_aligned`（原测试只断言开启行缩进，未捕获此问题）
- `JsonDiff.tsx` `findPathLine` 嵌套数组定位错行：数组元素计数只跳过 `}` 开头行，数组元素为嵌套数组时其闭合 `],` 被误计为元素（如 `$.list[1]` 跳到元素 0 的闭合行）；补跳 `]` 开头行
- `JsonDiff.tsx` 标量根差异漏报：`1` vs `2` 时 diff 树根节点无 children，变更列表误显「完全一致」；改为以标准化 `leftPretty===rightPretty` 判定无变更，无子节点时把根节点自身纳入变更列表
- `JsonDiff.tsx` 清空任一侧输入残留旧 diff/错误：自动比对 effect 在任一侧为空时清空 `changes`/`leftPretty`/`rightPretty`/`error`
- `Formatter.tsx` 自动格式化/日志提取成功后不清历史解析错误：成功回调补 `setError(null)`，避免改好 JSON 后错误红框仍在
- 非 UTF-8 文件乱码：`json-diff`/`json-table` 的拖拽与「打开文件」改用 `readFileAsUtf8`（GBK 回退），此前 `file.text()` 仅 UTF-8 解码，与 Formatter/TextDiff 不一致
- `JsonTable.tsx` 扁平化 key 冲突静默丢数据：`{"a.b":1,"a":{"b":2}}` 后写覆盖前写；`escapeKey` 转义 key 中的 `\`/`.`，数据源路径（`collectArrayPaths`/`getPath`/`defaultSource`）同步转义，`splitPath` 按未转义点分割、`unescapeKey` 反转义
- `JsonTable.tsx` `toCsv` 前置 UTF-8 BOM + 行分隔改 CRLF（RFC 4180），修复 Windows Excel 按 ANSI 解码中文乱码

**JSON 比对交互优化**（自动比对 + 只看变更 + 导航 + 精确路径定位）

- `JsonDiff.tsx` 两侧输入就绪后 500ms 防抖自动比对（`autoTimerRef` + `useEffect`），自动触发不写历史（`compare(fromUser)` 区分，手动「比对」按钮/⌘↩ 才 `addHistory`）
- 工具栏新增「只看变更」复选框（`.tool-toggle`，`tool.css`）：`TextDiffEditor` 加 `hideUnchanged` prop → Monaco `hideUnchangedRegions: { enabled, contextLineCount: 3, minimumLineCount: 3 }` 折叠未变更区域；状态随 `useSaveDraft` 持久化
- 工具栏新增「上一个/下一个变更」（`data-hotkey="diff-prev"/"diff-next"`，`goToDiff`），复用全局 ⌘↑/⌘↓ 快捷键
- 变更路径定位改回 `findPathLine`（按 path 段 + 缩进深度逐层定位行，替换 `lastSegment` 模糊搜 key，大 JSON 下同名 key 不再定位错行；依赖 `fmt_json` indent 2 格式，见 MEMORY.md）；并修复 removed（删除）变更定位不到：删除项只存在于左侧文本，`revealPath` 按 `change` 类型分侧定位——removed 走 original 编辑器 + `leftPretty`，added/modified 走 modified + `rightPretty`，定位顺序改为先 `setPosition` 再 `revealLineInCenter`

**JSON 格式化多标签样式与输出交互优化**（胶囊标签栏 + 点击弹层预览）

- `formatter-tabs.css` 标签栏改胶囊风格（对齐 `.match-tab` 范式）：标签激活 Baby Blue 底（`--accent-soft`）+ 蓝字，关闭按钮圆形 hover 圆底；「+ 新建」去掉与 `btn btn-sm` 的类冲突，改虚线胶囊 + hover 强调色
- `monaco-setup.ts` 输出侧点击交互由「点击即复制」改为「点击弹出浮层」：`onMouseDown` 命中 key/value 区间后 `openValuePopover` 在 body 下挂一个 fixed 浮层（模块级单例 `popupEl`），展示 key + pretty value，点击浮层内容才 `navigator.clipboard.writeText` 复制并 toast 关闭；未命中/滚动/内容变化/编辑器销毁时 `closeValuePopover`；点击浮层外任意处（含输入编辑器/非编辑器区域）经 `document` 捕获阶段 mousedown 收起
- 浮层定位用 Monaco `IMouseEvent.event.posx/posy`（即 `pageX/pageY`，非 clientX/clientY，TS 报错提示），优先右下展开，超视口边界回退到左上；样式在 `src/value-popover.css`（Meta 令牌 + GitHub 代码配色、`prefers-reduced-motion` 关动画）
- `settings/Settings.tsx` 开关文案更新为「点击 key 弹出，点击复制」；`store/app.ts` 注释同步（jsonPreview 开关同时控制悬停预览与点击弹层）
- 修复 autoRun 竞态：手动格式化/压缩未清除排队的自动格式化定时器，600ms 后 autoRun 的 `fmt_json` 覆盖手动压缩结果——`autoTimerRef` 记录定时器 id，`run()` 先清除再执行
- 修复折叠按钮：压缩输出是单行 JSON，Monaco 折叠基于物理行，单行无折叠区域——`canFold = output.includes("\n")` 单行时禁用「全部闭合/展开」并提示

**JSON 格式化多标签**（单窗口多开面板，内容跨重启持久化）

- `src/tools/json-formatter/FormatterTabs.tsx` 新增标签容器：持有 `tabs: Tab[]`（`{id, input, indent, autoRun}`）+ `activeId`，只挂载激活标签的 `<Formatter>`（Monaco 一次一个实例）；标签栏仿浏览器 tab（新建 `+ 新建`/关闭 `×`/点击切换），上限 10、至少保留一个；实例隔离用 `key={tab.id}`
- `Formatter.tsx` 受控化：新增 `initialData`（初始值）/`onChange`（内容上报）props，移除 `useSaveDraft` 与 drafts store 依赖；`useState` 初始值改从 `initialData` 取；历史回填（`useApplyHistory`）与日志提取跳转（`extractedJson`）逻辑不变
- 持久化 localStorage `devbox-json-formatter-tabs`：读 try/catch 防御、非法回落单标签默认，写 debounce 400ms + 组件卸载时补写一次（避免切走工具丢最后改动）；标签 id 用 `crypto.getRandomValues` 自实现 UUID v4
- `src/tools/index.tsx` 的 `json-formatter` 组件换为 `FormatterTabs`（工具 id 不变，侧边栏/快捷键/历史筛选零影响）
- `src/tools/json-formatter/formatter-tabs.css` 新增标签栏样式（`.formatter-tab.on` 复用 `--surface`/`--border-strong` 令牌）
- 坑：`readTabs` fallback 若返回 `activeId: ""`，首次挂载时 `handleChange` 用空串匹配不到任何 tab，编辑内容永不持久化——fallback 必须把 `activeId` 设为新标签 id

**JSON 编辑器交互增强**（悬停预览/点击复制/折叠控制，codicon 字体修复）

- `src/monaco-setup.ts` 修复 codicon 字体缺失：`@font-face` 只在 `editor.main` 链式引入，本项目用 `editor.api` 到不了，折叠箭头/展开按钮等 codicon 图标一直空字形；显式 import `codicon.css` 补上（产出 `dist/assets/codicon-*.ttf`）
- JSON key/value 分色：Monarch tokenizer 加 lookahead 规则识别对象 key（`"(?:[^"\\]|\\.)*"(?=\s*:)`），双主题各加 `key` 配色（浅 `#0969da` / 深 `#79c0ff`）
- 悬停预览（json-handle 式）：`src/utils/jsonHover.ts` 单遍扫描器记录每个对象 key 区间（含嵌套/数组/转义），`monaco.languages.registerHoverProvider` 悬停 key/value 区间浮层展示 pretty 值；`WeakMap` 按 model+versionId 缓存，大 JSON 不卡
- 点击复制：`monaco.editor.onDidCreateEditor` + `onMouseDown`，只读编辑器（输出侧）点击 key/value 区间即复制该值，Toast 提示；可编辑输入框不受影响
- 设置页新增「悬停预览 JSON 值」开关（`src/store/app.ts` 加 `jsonPreview`，持久化 `devbox-json-preview`），关闭时 hover 与点击复制均停用
- JSON 格式化输出 pane 标题栏新增「全部闭合/全部展开」按钮（`editor.foldAll`/`editor.unfoldAll`），`JsonOutput` 透传 `editorRef`；`.pane-title` 改 flex 支持右侧按钮
- 坑：`jsonHover.ts` DEV 自检断言 `findKeyAt(spans, 0)` 期望命中首个 key，但偏移 0 是 `{` 不在任何 key 区间，DEV 模式抛错导致白屏；改为断言 `keyA.keyStart`

**JSON 比对移植文本对比的交互增强**（布局切换/变更导航/统计头/精确路径定位）

- `src/tools/json-diff/JsonDiff.tsx` 增加三种 diff 布局（左右/上下/仅对比），复用文本对比的 `LAYOUTS` + `.seg` 分段控件；仅「左右」显示输入框，上下/仅对比全宽展示 diff + 变更路径列表；布局随 `useSaveDraft` 持久化
- 「上一个/下一个变更」按钮（`data-hotkey="diff-prev"/"diff-next"`，⌘↑/⌘↓ 全局快捷键已注册）：上下布局走 `StackedDiffHandle.goChange`，左右/仅对比走 Monaco `goToDiff`
- 并排 diff 开启 `sideHeaders`（顶部常驻「变更 −N/+N · 总 M 行」+ 复制，不随内容滚动）
- 输入 pane-title 内嵌「打开文件」按钮（对齐 diffchecker 结构，从 toolbar 移入）
- `StackedDiff.tsx` 的 `StackedDiffHandle` 新增 `revealLine(line)`（定位改后文本编辑器到指定行）
- 变更路径点击定位改为 `findPathLine`（按 path 段逐层行走定位行号），修复原 `lastSegment` 只匹配末段 key、大 JSON 下定位到首个同名 key 的问题；依赖 serde_json `to_string_pretty`（indent 2）固定缩进，改 fmt_json 输出格式会破坏定位

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