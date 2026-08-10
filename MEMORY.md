# MEMORY.md — AI 开发踩坑点

> 本文件记录在 devbox 上踩过的坑，供 AI 协作时提前规避。按「现象 → 根因 → 对策」组织，避免反复踩。

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

## 构建产物路径与静默失败

- `pnpm tauri build` 偶发 `bundle_dmg.sh` 失败（旧 dmg 占用），但 `.app` 已生成，产物：`src-tauri/target/release/bundle/macos/devbox.app`。
- React 无 `key` 或依赖数组缺失时切工具交叉渐隐可能残留旧实例——`useApplyHistory` 的回调只看 `pendingLoad/toolId`，勿在 apply 里塞渲染副作用。