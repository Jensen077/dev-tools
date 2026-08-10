import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { TOOLS } from "./tools";
import { Settings } from "./tools/settings/Settings";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./store/app";
import { useSettingsStore } from "./store/settings";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CommandPalette } from "./components/CommandPalette";
import { ToastContainer } from "./components/Toast";
import "./App.css";

const SETTINGS_ID = "settings";

/** 退场中的旧工具（交叉渐隐），保留其组件实例渲染到最后 */
interface ExitSlot {
  key: string;
  Comp: ComponentType | null;
}

export default function App() {
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const toolOrder = useSettingsStore((s) => s.order);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [exiting, setExiting] = useState<ExitSlot | null>(null);

  useKeyboardShortcuts(setCmdOpen);

  // 同步主题到根节点，驱动 CSS 变量
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 按配置顺序渲染侧边栏菜单
  const visibleTools = toolOrder
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const isSettings = activeTool === SETTINGS_ID;
  // 当前工具被隐藏时（如历史「加载」）仍可渲染，仅菜单不高亮
  const active = isSettings ? null : TOOLS.find((t) => t.id === activeTool) ?? visibleTools[0];

  const currentKey = isSettings ? SETTINGS_ID : active?.id ?? "";
  const CurrentComp = isSettings ? (Settings as ComponentType) : (active?.component ?? null);

  // 上一帧渲染的工具，供切换时放入退场槽
  const lastKeyRef = useRef<string | null>(null);
  const lastCompRef = useRef<ComponentType | null>(null);

  if (lastKeyRef.current !== null && lastKeyRef.current !== currentKey && !exiting) {
    setExiting({ key: lastKeyRef.current, Comp: lastCompRef.current });
  }
  lastKeyRef.current = currentKey;
  lastCompRef.current = CurrentComp;

  // 退场动画结束后清除退场槽
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => setExiting(null), 260);
    return () => clearTimeout(t);
  }, [exiting]);

  return (
    <div className="app-shell">
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-title" data-tauri-drag-region>
          devbox
        </div>
      </header>
      <div className="app-body">
        <Sidebar isSettings={isSettings} onSelect={setActiveTool} />
        <main className="work-area">
          <div className="tool-slot">
            <div className="tool-stage">
              {exiting && (
                <div className="tool-layer tool-layer-exit" key={`exit-${exiting.key}`}>
                  <ErrorBoundary>
                    {exiting.Comp && <exiting.Comp key={exiting.key} />}
                  </ErrorBoundary>
                </div>
              )}
              <div className="tool-layer tool-layer-enter" key={`enter-${currentKey}`}>
                <ErrorBoundary>
                  {CurrentComp && <CurrentComp key={currentKey} />}
                </ErrorBoundary>
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
