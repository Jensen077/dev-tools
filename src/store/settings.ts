import { create } from "zustand";
import { TOOLS } from "../tools";

const SETTINGS_KEY = "devbox-tool-config";
const COLLAPSED_KEY = "devbox-collapsed-groups";
const FAV_KEY = "devbox-favorites";

/// 首次使用时的默认收藏工具
const DEFAULT_FAVORITES = [
  "json-formatter",
  "json-diff",
  "text-diff",
  "curl-runner",
  "log-extractor",
  "props-diff",
];

interface ToolSettingsState {
  /// 启用的工具 id，按侧边栏显示顺序排列；未出现的即隐藏
  order: string[];
  setEnabled: (id: string, enabled: boolean) => void;
  move: (id: string, dir: -1 | 1) => void;
  reorder: (fromIdx: number, toIdx: number) => void;
  reset: () => void;
  /// 收起状态为 true，展开为 false
  collapsedGroups: string[];
  toggleGroup: (cat: string) => void;
  isGroupCollapsed: (cat: string) => boolean;
  /// 收藏的工具 id 列表
  favorites: string[];
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
}

/// 防御性清理持久化顺序：过滤未知 id、去重，补入缺失的新工具，并确保历史记录在末位
function sanitize(raw: unknown): string[] {
  const list: string[] = [];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === "string" && TOOLS.some((t) => t.id === id) && !list.includes(id)) {
        list.push(id);
      }
    }
  }
  for (const t of TOOLS) if (!list.includes(t.id)) list.push(t.id);
  const hi = list.indexOf("history");
  if (hi >= 0) {
    list.splice(hi, 1);
    list.push("history");
  }
  return list;
}

/// 默认顺序：历史记录始终在末位
function defaultOrder(): string[] {
  const ids = TOOLS.map((t) => t.id);
  const hi = ids.indexOf("history");
  if (hi >= 0) {
    ids.splice(hi, 1);
    ids.push("history");
  }
  return ids;
}

function readOrder(): string[] {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultOrder();
    return sanitize((JSON.parse(raw) as { order?: unknown }).order);
  } catch {
    // 存储不可用/数据损坏时回落默认全量
    return defaultOrder();
  }
}

function saveOrder(order: string[]) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ order }));
  } catch {
    // 存储不可用时忽略，内存态配置仍生效
  }
}

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return ["JSON", "文本", "编码与安全", "通用"]; // 默认常用展开，其他收起
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return ["JSON", "文本", "编码与安全", "通用"];
  }
}

function saveCollapsed(groups: string[]) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(groups)); } catch { /* */ }
}

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return DEFAULT_FAVORITES;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : DEFAULT_FAVORITES;
  } catch {
    return DEFAULT_FAVORITES;
  }
}

function saveFavorites(favs: string[]) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch { /* */ }
}

export const useSettingsStore = create<ToolSettingsState>((set, get) => ({
  order: readOrder(),

  setEnabled: (id, enabled) =>
    set((s) => {
      const order = enabled
        ? s.order.includes(id)
          ? s.order
          : [...s.order, id]
        : s.order.filter((x) => x !== id);
      saveOrder(order);
      return { order };
    }),

  move: (id, dir) =>
    set((s) => {
      const i = s.order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.order.length) return s;
      const order = [...s.order];
      // 上下界已校验，i/j 必然有效
      const a = order[i]!;
      const b = order[j]!;
      order[i] = b;
      order[j] = a;
      saveOrder(order);
      return { order };
    }),

  reorder: (fromIdx, toIdx) =>
    set((s) => {
      if (fromIdx < 0 || fromIdx >= s.order.length) return s;
      if (toIdx < 0 || toIdx >= s.order.length) return s;
      if (fromIdx === toIdx) return s;
      const order = [...s.order];
      const [removed] = order.splice(fromIdx, 1);
      order.splice(toIdx, 0, removed!);
      saveOrder(order);
      return { order };
    }),

  reset: () => {
    const order = defaultOrder();
    saveOrder(order);
    set({ order });
  },

  collapsedGroups: readCollapsed(),
  toggleGroup: (cat) =>
    set((s) => {
      const collapsed = s.collapsedGroups.includes(cat)
        ? s.collapsedGroups.filter((x) => x !== cat)
        : [...s.collapsedGroups, cat];
      saveCollapsed(collapsed);
      return { collapsedGroups: collapsed };
    }),
  isGroupCollapsed: (cat) => get().collapsedGroups.includes(cat),

  favorites: readFavorites(),
  toggleFavorite: (id) =>
    set((s) => {
      const favorites = s.favorites.includes(id)
        ? s.favorites.filter((x) => x !== id)
        : [...s.favorites, id];
      saveFavorites(favorites);
      return { favorites };
    }),
  isFavorite: (id) => get().favorites.includes(id),
}));
