import { create } from "zustand";
import { TOOLS } from "../tools";

const SETTINGS_KEY = "devbox-tool-config";

interface ToolSettingsState {
  /// 启用的工具 id，按侧边栏显示顺序排列；未出现的即隐藏
  order: string[];
  setEnabled: (id: string, enabled: boolean) => void;
  move: (id: string, dir: -1 | 1) => void;
  reorder: (fromIdx: number, toIdx: number) => void;
  reset: () => void;
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

export const useSettingsStore = create<ToolSettingsState>((set) => ({
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
}));
