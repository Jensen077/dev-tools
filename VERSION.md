# VERSION.md — 版本迭代记录

> 版本号三处同步维护：`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`。
> 每次发版先在这里补一条，再改三处版本号，最后 `pnpm tauri build`。

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