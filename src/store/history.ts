import { create } from "zustand";
import { useEffect } from "react";
import { useAppStore } from "./app";

export interface HistoryItem {
  id: string;
  toolId: string;
  toolName: string;
  /// 动作描述，如 "格式化" / "比对"
  action: string;
  /// 输入内容，按工具结构存储：{input} 或 {left, right}
  payload: Record<string, string>;
  timestamp: number;
  /// 单行摘要，取 payload 首个值前若干字符
  preview: string;
}

interface HistoryState {
  items: HistoryItem[];
  /// 待回填缓冲：点击历史「加载」后写入，目标工具挂载时消费
  pendingLoad: { toolId: string; payload: Record<string, string> } | null;
  addHistory: (input: Omit<HistoryItem, "id" | "timestamp" | "preview">) => void;
  loadFromHistory: (item: HistoryItem) => void;
  removeItem: (id: string) => void;
  clearHistory: () => void;
}

const HISTORY_KEY = "devbox-history";
const MAX_ITEMS = 30;
const PREVIEW_LEN = 100;

function readHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 防御性校验元素形状，过滤被污染或旧 schema 数据，避免渲染时崩溃
    return parsed.filter(
      (x): x is HistoryItem =>
        typeof x === "object" &&
        x !== null &&
        typeof x.id === "string" &&
        typeof x.toolId === "string" &&
        typeof x.action === "string" &&
        typeof x.payload === "object" &&
        x.payload !== null &&
        typeof x.timestamp === "number",
    );
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): boolean {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    return true;
  } catch {
    return false;
  }
}

function previewOf(payload: Record<string, string>): string {
  const oneLine = (Object.values(payload)[0] ?? "").replace(/\s+/g, " ");
  return oneLine.length > PREVIEW_LEN ? `${oneLine.slice(0, PREVIEW_LEN)}…` : oneLine;
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq}`;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  items: readHistory(),
  pendingLoad: null,

  addHistory: (input) =>
    set((s) => {
      const item: HistoryItem = {
        ...input,
        id: newId(),
        timestamp: Date.now(),
        preview: previewOf(input.payload),
      };
      // 头插；若已存在同工具+同内容的旧记录则去掉旧条（重复执行只刷新时间）
      let items = [item, ...s.items];
      const dupIdx = items.findIndex(
        (x, i) =>
          i > 0 && x.toolId === item.toolId && JSON.stringify(x.payload) === JSON.stringify(item.payload),
      );
      if (dupIdx > 0) items.splice(dupIdx, 1);
      items = items.slice(0, MAX_ITEMS);
      if (!saveHistory(items)) {
        // 配额满：丢最旧一条再试
        saveHistory(items.slice(0, -1));
        items = items.slice(0, -1);
      }
      return { items };
    }),

  loadFromHistory: (item) => {
    useAppStore.getState().setActiveTool(item.toolId);
    set({ pendingLoad: { toolId: item.toolId, payload: item.payload } });
  },

  removeItem: (id) =>
    set((s) => {
      const items = s.items.filter((x) => x.id !== id);
      saveHistory(items);
      return { items };
    }),

  clearHistory: () => {
    saveHistory([]);
    set({ items: [] });
  },
}));

/// 目标工具消费待回填缓冲：历史「加载」后把 payload 写回编辑器
export function useApplyHistory(toolId: string, apply: (payload: Record<string, string>) => void): void {
  const pendingLoad = useHistoryStore((s) => s.pendingLoad);
  useEffect(() => {
    if (pendingLoad && pendingLoad.toolId === toolId) {
      apply(pendingLoad.payload);
      useHistoryStore.setState({ pendingLoad: null });
    }
    // apply 为内联回调，仅当 pendingLoad/toolId 变化时消费，避免每次渲染重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLoad, toolId]);
}
