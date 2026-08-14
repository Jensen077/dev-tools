import { GROUP_ORDER, getDisplayTools } from "../tools";
import type { ToolDef } from "../tools";
import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";

const SETTINGS_ID = "settings";

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
const ICON_STAR = "M8 1.5l1.8 4.5 4.7.4-3.6 3.1 1.1 4.6L8 11.8 4 14.1l1.1-4.6L1.5 6.4l4.7-.4z";
const ICON_STAR_OUTLINE = "M8 1.5l1.8 4.5 4.7.4-3.6 3.1 1.1 4.6L8 11.8 4 14.1l1.1-4.6L1.5 6.4l4.7-.4z";

/** 侧边栏：按分类分组渲染工具列表；顶部搜索、底部固定主题切换与设置 */
export function Sidebar({ isSettings, onSelect, onSearch }: SidebarProps) {
  const activeTool = useAppStore((s) => s.activeTool);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const toolOrder = useSettingsStore((s) => s.order);
  const collapsedGroups = useSettingsStore((s) => s.collapsedGroups);
  const toggleGroup = useSettingsStore((s) => s.toggleGroup);
  const favorites = useSettingsStore((s) => s.favorites);
  const toggleFavorite = useSettingsStore((s) => s.toggleFavorite);

  const displayTools = getDisplayTools(toolOrder);

  const byCat: Record<string, ToolDef[]> = {};
  for (const t of displayTools) {
    (byCat[t.cat] ??= []).push(t);
  }

  // 常用分组：收藏的工具按 order 顺序
  const favSet = new Set(favorites);
  const favTools = displayTools.filter((t) => favSet.has(t.id));

  // 快捷键徽标与 useKeyboardShortcuts 完全同源（扁平 getDisplayTools 顺序取前 9）：
  // 收藏只影响「常用」分组的展示，不改变任何工具的快捷键分配，
  // 保证徽标显示与按下触发一致（常用分组的重复行不参与编号）
  const shortcutById = new Map<string, string>();
  displayTools.forEach((t, i) => {
    if (i < 9) shortcutById.set(t.id, `⌘${i + 1}`);
  });

  const renderTool = (t: ToolDef, isFav: boolean) => (
    <div key={t.id} className="tool-btn-wrap">
      <button
        className={`tool-btn ${t.id === activeTool ? "active" : ""}`}
        onClick={() => onSelect(t.id)}
        title={t.name}
      >
        <span className="tool-icon">{t.icon}</span>
        <span className="tool-btn-label">{t.name}</span>
        {shortcutById.has(t.id) && <kbd>{shortcutById.get(t.id)}</kbd>}
      </button>
      <button
        className={`fav-btn ${isFav ? "active" : ""}`}
        onClick={(e) => { e.stopPropagation(); toggleFavorite(t.id); }}
        title={isFav ? "取消收藏" : "收藏"}
      >
        <Svg d={isFav ? ICON_STAR : ICON_STAR_OUTLINE} width={12} height={12} fill={isFav ? "currentColor" : "none"} />
      </button>
    </div>
  );

  // 渲染分组（含折叠）；徽标按 shortcutById 查表，不受分组/折叠影响
  const renderGroup = (cat: string, tools: ToolDef[]) => {
    if (tools.length === 0) return null;
    const collapsed = collapsedGroups.includes(cat);
    return (
      <div className="side-group" key={cat}>
        <div
          className="side-group-label side-group-toggle"
          onClick={() => toggleGroup(cat)}
          title={collapsed ? "展开" : "收起"}
        >
          <span className={`group-arrow ${collapsed ? "collapsed" : "expanded"}`}>▶</span>
          {cat}
        </div>
        {!collapsed && tools.map((t) => renderTool(t, favSet.has(t.id)))}
      </div>
    );
  };

  // 构建分组列表（常用在顶部）
  const groups: { cat: string; tools: ToolDef[] }[] = [];
  if (favTools.length > 0) {
    groups.push({ cat: "常用", tools: favTools });
  }
  for (const cat of GROUP_ORDER) {
    const tools = byCat[cat] ?? [];
    if (tools.length > 0) {
      groups.push({ cat, tools });
    }
  }

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
        {groups.map((g) => renderGroup(g.cat, g.tools))}
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

