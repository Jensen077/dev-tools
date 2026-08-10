import { TOOLS } from "../tools";
import type { ToolDef } from "../tools";
import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";

const SETTINGS_ID = "settings";

interface SidebarProps {
  isSettings: boolean;
  onSelect: (id: string) => void;
}

/** 侧边栏：按配置顺序扁平渲染工具列表；底部为主题切换与设置 */
export function Sidebar({ isSettings, onSelect }: SidebarProps) {
  const activeTool = useAppStore((s) => s.activeTool);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const toolOrder = useSettingsStore((s) => s.order);

  const visibleTools = toolOrder
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const renderTool = (t: ToolDef) => (
    <button
      key={t.id}
      className={`tool-btn ${t.id === activeTool ? "active" : ""}`}
      onClick={() => onSelect(t.id)}
      title={t.name}
    >
      <span className="tool-icon">{t.icon}</span>
      <span className="tool-btn-label">{t.name}</span>
    </button>
  );

  return (
    <aside className="sidebar">
      {visibleTools.map(renderTool)}
      <div className="spacer" />
      <button className="tool-btn" onClick={toggleTheme} title={theme === "dark" ? "切换浅色主题" : "切换深色主题"}>
        <span className="tool-icon">{theme === "dark" ? "☀" : "🌙"}</span>
        <span className="tool-btn-label">{theme === "dark" ? "浅色主题" : "深色主题"}</span>
      </button>
      <button
        className={`tool-btn ${isSettings ? "active" : ""}`}
        onClick={() => onSelect(SETTINGS_ID)}
        title="设置"
      >
        <span className="tool-icon">⚙</span>
        <span className="tool-btn-label">设置</span>
      </button>
    </aside>
  );
}
