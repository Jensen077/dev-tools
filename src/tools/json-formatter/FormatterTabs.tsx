import { useCallback, useEffect, useRef, useState } from "react";
import { Formatter, type FormatterData } from "./Formatter";
import { useApplyHistory } from "../../store/history";
import "../tool.css";
import "./formatter-tabs.css";

/** 单个格式化标签：状态快照 + 内容（跨重启持久化） */
interface Tab {
  id: string;
  input: string;
  indent: number;
  autoRun: boolean;
}

interface TabsState {
  activeId: string;
  tabs: Tab[];
}

const STORAGE_KEY = "devbox-json-formatter-tabs";
const MAX_TABS = 10;
const SAVE_DEBOUNCE_MS = 400;

/** RFC 4122 v4 UUID（WKWebView 无 crypto.randomUUID，用 getRandomValues 自实现） */
function randomUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function newTab(): Tab {
  return { id: randomUuid(), input: "", indent: 2, autoRun: true };
}

function readTabs(): TabsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback();
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as TabsState).tabs) ||
      (parsed as TabsState).tabs.length === 0
    ) {
      return fallback();
    }
    const s = parsed as TabsState;
    // 防御性过滤非法 tab 形状
    const tabs = s.tabs.filter(
      (t): t is Tab =>
        typeof t === "object" &&
        t !== null &&
        typeof t.id === "string" &&
        typeof t.input === "string" &&
        typeof t.indent === "number" &&
        typeof t.autoRun === "boolean",
    );
    if (tabs.length === 0) return fallback();
    const activeId = tabs.some((t) => t.id === s.activeId) ? s.activeId : tabs[0]!.id;
    return { activeId, tabs };
  } catch {
    // 存储不可用/损坏：回落单标签默认
    return fallback();
  }
}

/** 无持久化数据时的默认态：单个空白标签 */
function fallback(): TabsState {
  const tab = newTab();
  return { activeId: tab.id, tabs: [tab] };
}

function saveTabs(state: TabsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 配额满/不可用时静默忽略，内存态多标签仍生效
  }
}

/**
 * JSON 格式化多标签容器：多个独立格式化面板（仿浏览器 tab），
 * 只挂载激活标签的 Formatter（Monaco 一次一个实例），内容跨重启持久化。
 */
export function FormatterTabs() {
  const [state, setState] = useState<TabsState>(readTabs);
  const stateRef = useRef(state);
  stateRef.current = state;
  const saveTimer = useRef<number | null>(null);

  // 变更后 debounce 落盘；组件卸载（切走工具）时立即补写一次，避免丢最后改动
  const scheduleSave = useCallback((next: TabsState) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveTabs(next), SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTabs(stateRef.current);
    };
  }, []);

  const active = state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0]!;

  // 历史「加载」：新建一个 tab 回填历史输入并切过去，避免覆盖当前激活 tab 的内容
  useApplyHistory("json-formatter", ({ input }) => {
    const s = stateRef.current;
    if (s.tabs.length >= MAX_TABS) return;
    const tab: Tab = { id: randomUuid(), input: input ?? "", indent: 2, autoRun: true };
    const next: TabsState = { activeId: tab.id, tabs: [...s.tabs, tab] };
    setState(next);
    scheduleSave(next);
  });

  const handleChange = useCallback(
    (data: FormatterData) => {
      const next: TabsState = {
        ...stateRef.current,
        tabs: stateRef.current.tabs.map((t) => (t.id === stateRef.current.activeId ? { ...t, ...data } : t)),
      };
      setState(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const selectTab = useCallback(
    (id: string) => {
      if (id === stateRef.current.activeId) return;
      const next = { ...stateRef.current, activeId: id };
      setState(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const addTab = useCallback(() => {
    const s = stateRef.current;
    if (s.tabs.length >= MAX_TABS) return;
    const tab = newTab();
    const next: TabsState = { activeId: tab.id, tabs: [...s.tabs, tab] };
    setState(next);
    scheduleSave(next);
  }, [scheduleSave]);

  const closeTab = useCallback(
    (id: string) => {
      const s = stateRef.current;
      if (s.tabs.length <= 1) return;
      const idx = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      // 关闭的是激活标签时，切到相邻标签（优先右侧，越界取末位）
      const activeId = s.activeId === id ? tabs[Math.min(idx, tabs.length - 1)]!.id : s.activeId;
      const next: TabsState = { activeId, tabs };
      setState(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  return (
    <div className="formatter-tabs">
      <div className="formatter-tabbar">
        {state.tabs.map((t, i) => (
          <div
            key={t.id}
            className={`formatter-tab${t.id === active.id ? " on" : ""}`}
            onClick={() => selectTab(t.id)}
          >
            <span className="formatter-tab-name">JSON {i + 1}</span>
            {state.tabs.length > 1 && (
              <button
                className="formatter-tab-close"
                title="关闭标签"
                aria-label="关闭标签"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          className="formatter-tab-add"
          title="新建标签"
          aria-label="新建标签"
          onClick={addTab}
          disabled={state.tabs.length >= MAX_TABS}
        >
          + 新建
        </button>
      </div>
      <div className="formatter-tab-stage">
        <Formatter key={active.id} initialData={active} onChange={handleChange} />
      </div>
    </div>
  );
}
