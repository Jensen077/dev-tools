import { TOOLS } from "../tools";
import type { ToolDef } from "../tools";
import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";

const SETTINGS_ID = "settings";

/** 侧边栏分组顺序（与工具注册表的 cat 对应） */
const GROUP_ORDER = ["JSON", "文本", "编码与安全", "通用"];

interface SidebarProps {
  isSettings: boolean;
  onSelect: (id: string) => void;
  onSearch: () => void;
}

const Svg = ({ d, ...rest }: { d: string } & React.SVGProps<SVGSVGElement>) => (
  <svg
    width={15}
    height={15}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    {...rest}
  >
    <path d={d} />
  </svg>
);

const ICON_SEARCH = "M8 8m-4.5 0a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0z M11.5 11.5L14 14";
const ICON_SUN = "M8 8m-3 0a3 3 0 1 1 6 0 3 3 0 0 1-6 0z M8 2v1M8 13v1M2 8h1M13 8h1M3.5 3.5l.7.7M11.8 11.8l.7.7M12.5 3.5l-.7.7M4.2 11.8l-.7.7";
const ICON_MOON = "M13.5 9.5A6 6 0 1 1 6.5 2.5 5 5 0 0 0 13.5 9.5z";
const ICON_GEAR = "M8 8m-2 0a2 2 0 1 1 4 0 2 2 0 0 1-4 0z M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3";

/** 侧边栏：按分类分组渲染工具列表；顶部搜索、底部固定主题切换与设置 */
export function Sidebar({ isSettings, onSelect, onSearch }: SidebarProps) {
  const activeTool = useAppStore((s) => s.activeTool);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const toolOrder = useSettingsStore((s) => s.order);

  const visibleTools = toolOrder
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is ToolDef => Boolean(t));

  const byCat: Record<string, ToolDef[]> = {};
  for (const t of visibleTools) {
    (byCat[t.cat] ??= []).push(t);
  }

  const renderTool = (t: ToolDef, shortcut: string | null) => (
    <button
      key={t.id}
      className={`tool-btn ${t.id === activeTool ? "active" : ""}`}
      onClick={() => onSelect(t.id)}
      title={t.name}
    >
      <span className="tool-icon">{t.icon}</span>
      <span className="tool-btn-label">{t.name}</span>
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );

  let k = 0;

  return (
    <aside className="sidebar">
      <button className="side-search" onClick={onSearch} title="搜索工具">
        <span className="s-ico">
          <Svg d={ICON_SEARCH} />
        </span>
        <span>搜索工具</span>
        <kbd>⌘P</kbd>
      </button>
      <div className="side-scroll">
        {GROUP_ORDER.map((cat) => {
          const tools = byCat[cat] ?? [];
          if (tools.length === 0) return null;
          return (
            <div className="side-group" key={cat}>
              <div className="side-group-label">{cat}</div>
              {tools.map((t) => {
                const shortcut = k < 9 ? `⌘${k + 1}` : null;
                k += 1;
                return renderTool(t, shortcut);
              })}
            </div>
          );
        })}
      </div>
      <div className="side-footer">
        <button className="tool-btn" onClick={toggleTheme} title={theme === "dark" ? "切换浅色主题" : "切换深色主题"}>
          <span className="tool-icon">{theme === "dark" ? <Svg d={ICON_SUN} /> : <Svg d={ICON_MOON} />}</span>
          <span className="tool-btn-label">{theme === "dark" ? "浅色主题" : "深色主题"}</span>
        </button>
        <button
          className={`tool-btn ${isSettings ? "active" : ""}`}
          onClick={() => onSelect(SETTINGS_ID)}
          title="设置"
        >
          <span className="tool-icon">
            <Svg d={ICON_GEAR} />
          </span>
          <span className="tool-btn-label">设置</span>
        </button>
      </div>
    </aside>
  );
}
