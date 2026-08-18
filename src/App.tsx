import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { TOOLS } from "./tools";
import { Settings } from "./tools/settings/Settings";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./store/app";
import { useSettingsStore } from "./store/settings";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCheckUpdate } from "./hooks/useCheckUpdate";
import { isDesktop } from "./utils/backend";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CommandPalette } from "./components/CommandPalette";
import { ToastContainer } from "./components/Toast";
import "./App.css";

const SETTINGS_ID = "settings";

export default function App() {
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const toolOrder = useSettingsStore((s) => s.order);
  const [cmdOpen, setCmdOpen] = useState(false);

  useKeyboardShortcuts(setCmdOpen);

  // 同步主题到根节点，驱动 CSS 变量
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 阻止 Cmd+R 刷新页面，让 Monaco 的查找替换快捷键生效
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  const { checkForUpdate } = useCheckUpdate();
  const checkedRef = useRef(false);

  // 启动时自动检查更新（仅桌面环境，仅一次）
  useEffect(() => {
    if (isDesktop() && !checkedRef.current) {
      checkedRef.current = true;
      void checkForUpdate();
    }
  }, [checkForUpdate]);

  // 按配置顺序渲染侧边栏菜单
  const visibleTools = toolOrder
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const isSettings = activeTool === SETTINGS_ID;
  // 当前工具被隐藏时（如历史「加载」）仍可渲染，仅菜单不高亮
  const active = isSettings ? null : TOOLS.find((t) => t.id === activeTool) ?? visibleTools[0];

  const currentKey = isSettings ? SETTINGS_ID : active?.id ?? "";
  const CurrentComp = isSettings ? (Settings as ComponentType) : (active?.component ?? null);

  return (
    <div className="app-shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-title" data-tauri-drag-region>
          devbox
        </div>
      </header>
      <div className="app-body">
        <Sidebar isSettings={isSettings} onSelect={setActiveTool} onSearch={() => setCmdOpen(true)} />
        <main className="work-area">
          <div className="tool-slot">
            <div className="tool-stage">
              <div className="tool-layer">
                <ErrorBoundary>{CurrentComp && <CurrentComp key={currentKey} />}</ErrorBoundary>
              </div>
            </div>
          </div>
        </main>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <ToastContainer />
    </div>
  );
}
