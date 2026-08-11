# Design System Inspired by Meta (Store) — devbox

> Category: Developer Tools × E-Commerce/Retail
> 白色画布 + 暖灰表面 + Meta Blue 胶囊 CTA + Optimistic 字体回退；代码区用 GitHub 默认主题。
> 本文件是仓库内设计契约，后续 UI 迭代一律遵循。

## 1. Visual Theme & Atmosphere

devbox 把 Meta 零售设计系统的「画廊式」克制感应用到开发者工具箱：纯白画布承载高密度信息，暖灰（Soft Gray `#f1f4f7`）做副面分层，Meta Blue `#0064E0` 是唯一交互强调色。扁平优先——表面靠颜色阶梯区分（白 → 暖灰 → 浅灰），阴影只出现在下拉/弹层浮层（双阴影：`0 12px 28px + 0 2px 4px`）。深色主题为 Meta 沉浸式近黑 `#181a1b` + 亮蓝 CTA `#47A5FA`。

代码区不套 UI 色，独立用 **GitHub 默认主题**（浅/深），diff 增删行同 GitHub 红绿——工具型应用里「编辑区 = 编辑器配色」是刻意的身份切换。

**Key Characteristics:**
- 纯白画布 + 暖灰副面 + 发丝边框，扁平分层优先
- Meta Blue 胶囊 CTA（100px 圆角），单一强调色
- Optimistic VF 回退字体栈（Inter/Montserrat/Helvetica）
- 字号阶梯收敛为 11/12/13/14，无碎刻度
- 圆角阶梯 8（输入）/ 20（面板）/ 24（浮层）/ 100（胶囊）
- 侧边栏通栏扁平行，激活项 Baby Blue `#e8f3ff` + 3px 蓝左条
- 代码区 GitHub 默认配色，与 UI 主题解耦

## 2. Color Palette & Roles

### Light（默认）
- **Canvas**: `#ffffff`（画布/面板）
- **Soft Gray**: `#f1f4f7`（副面、hover、表头、kbd）
- **Web Wash**: `#f0f2f5`（hover 强化）
- **Dark Charcoal**: `#1c2b33`（正文）；**Primary Text** `#050505`（强调标题）
- **Secondary Text**: `#65676b`（次要说明）；**CTA Disabled** `#8595a4`（占位/禁用文字）
- **Divider**: `#ced0d4`（边框）；**Divider Gray** `#dee3e9`（内部分隔）；**CTA Gray Border** `#cbd2d9`（按钮描边）
- **Meta Blue** `#0064e0`（主 CTA/链接/focus）；hover `#0143b5`；pressed `#004bb9`
- **Baby Blue** `#e8f3ff`（激活/选中底）；上字 `#0143b5`
- **Semantic**: success `#007d1e` / warn `#9a6700` / danger `#c80a28`（底用 `rgba` 淡色）
- **GitHub 代码（浅）**: 字符串/键 `#0a3069`、数字 `#0550ae`、布尔 `#cf222e`、diff 增 `#e6ffec` 删 `#ffebe9`

### Dark（沉浸式）
- **Canvas**: `#181a1b`；surface `#1c1e21`；hover `#232527`/`#2b2e30`
- **Fg**: `#f0f2f5`；muted `#b3bac1`；faint `#7d858d`
- **Border**: `rgba(255,255,255,0.1)`（发丝）
- **Meta Blue Light** `#47a5fa`（深底 CTA，文字用深色 `#0b1220`）；hover `#66b6ff`
- **Semantic**: success `#3fb950` / warn `#d29922` / danger `#f85149`
- **GitHub 代码（深）**: 字符串/键 `#a5d6ff`、数字 `#79c0ff`、布尔 `#ff7b72`、diff 增 `rgba(46,160,67,0.18)` 删 `rgba(248,81,73,0.16)`

## 3. Typography Rules

### 字号阶梯（唯一合法刻度：11 / 12 / 13 / 14）

| 刻度 | 用途 | 备注 |
|------|------|------|
| 11px | kbd 快捷键 | 等宽 |
| 12px | 徽标、面板 meta、组标题、说明 | `+0.01em` 字距 |
| 13px | 提示、列表、胶囊、路径、表格、分段 | |
| 14px | 正文/UI、按钮、输入、侧栏、编辑器 | 代码编辑器 14px，行高 1.7 |

### 规范
- **禁碎刻度**：不得出现 12.5px / 13.5px
- 行高：正文 1.6；编辑器/代码/多行中文空态 1.7
- 字距：全大写标签 ≥0.06em；小号文字 +0.01em；拉丁显示 -0.01em；中文一律 0
- 字重三级：400 正文 / 500 按钮导航 / 600 标题激活
- 字体：display/body 共用 `"Optimistic VF", Inter, Montserrat, Helvetica, Arial, "Noto Sans"`；代码 `ui-monospace, "SF Mono", Menlo, Consolas`

## 4. Component Stylings

### Buttons（胶囊）
- **Primary**: 底 `#0064e0`（深色 `#47a5fa`），字白/深；hover 变深 + `scale(1.05)`；按下 `scale(0.97)`；禁用 = 灰底灰字
- **Secondary**: 白底 + `#cbd2d9` 描边，hover 副面
- **Danger**: 透明底红字，hover 淡红底
- **Ghost**: 透明，hover 副面
- 统一 `--radius-pill`（100px）、padding 7px 18px、focus 2px 蓝环

### Switch / 分段 / 胶囊
- **Switch**: 38×23、拇指 18px、checked = `--accent`
- **Segmented**（缩进 2/4）: `--surface-1` 胶囊轨道，选中段白底 + 轻阴影 + 600 字重
- **Chip**: pill，选中 = Baby Blue 底 + 深蓝字

### 浮层 / 面板
- **下拉/命令面板**: 白卡 + 20/24px 圆角 + 双阴影 + 遮罩 `rgba(0,0,0,0.6)`
- **pane**: 20px 圆角、`#dee3e9` 发丝边框
- **输入**: 8px 圆角、focus 环 `0 0 0 3px` 蓝

### Sidebar
- 通栏扁平行（无圆角）；active = Baby Blue 整行 + `inset 3px 0 0` Meta Blue；搜索框无边框灰底；分组大写标签 `+0.06em`

## 5. Spacing & Layout

- **基础单位**：8px；工具页内边距 18/20px，面板间距 14px
- 侧边栏 236px；窄窗口 `<860px` 收缩为 48px 图标条

## 6. Motion

- hover/状态切换 150ms、浮层 200ms，`cubic-bezier(0.2,0,0,1)`
- 按钮 hover/按下用 scale 微动效；`prefers-reduced-motion` 全部关闭

## 7. Usage Guardrails（违反即返工）

- 不用 emoji 作图标（用 1.5px 单线 SVG）
- 不用 Facebook Blue `#1877F2` 作主 CTA；不引入 Meta Blue 之外的第二强调色
- 不写 <8px 圆角；不偏离 8/20/24/100
- 除浮层外不加投影；暗色卡片靠边框/色阶
- 不引入 12.5/13.5 碎字号；不超过 4 档字号
- 代码区不离开 GitHub 默认配色
- 对比度：正文 ≥4.5:1，大号/图标 ≥3:1；hover 永不调浅文字

## 8. Source of Truth

- 实现：`src/App.css`、`src/tools/tool.css`、`src/monaco-setup.ts`
- 设计稿：`devbox-style-prototype.html`（Open Design 设计文件区）
