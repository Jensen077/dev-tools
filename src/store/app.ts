import { create } from "zustand";

export type Theme = "dark" | "light";

interface AppState {
  activeTool: string;
  setActiveTool: (id: string) => void;
  /// 日志提取出的 JSON，供跳转到格式化页使用
  extractedJson: string | null;
  setExtractedJson: (json: string) => void;
  theme: Theme;
  toggleTheme: () => void;
  /** JSON 悬停预览 + 点击复制（json-handle 式）开关 */
  jsonPreview: boolean;
  setJsonPreview: (on: boolean) => void;
  /** 切换工具时的输入草稿，避免切换丢失未保存内容 */
  drafts: Record<string, unknown>;
  setDraft: (toolId: string, data: unknown) => void;
}

const THEME_KEY = "devbox-theme";
const JSON_PREVIEW_KEY = "devbox-json-preview";

/** 读取持久化主题，非法值/异常一律回落 light（Meta 白色画布优先） */
function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** 读取 JSON 预览开关，非法值/异常回落默认开启 */
function readJsonPreview(): boolean {
  try {
    return localStorage.getItem(JSON_PREVIEW_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // 存储不可用时忽略，内存态主题仍生效
  }
}

/** 模块加载时即同步根节点主题，早于首帧 paint，避免主题闪烁（FOUC） */
const initial = readTheme();
document.documentElement.dataset.theme = initial;

export const useAppStore = create<AppState>((set) => ({
  activeTool: "json-formatter",
  setActiveTool: (id) => set({ activeTool: id }),
  extractedJson: null,
  setExtractedJson: (json) => set({ extractedJson: json }),
  theme: initial,
  toggleTheme: () => {
    // 持久化副作用放在 updater 之外（zustand 约定 updater 需纯函数）
    const next: Theme = useAppStore.getState().theme === "dark" ? "light" : "dark";
    saveTheme(next);
    set({ theme: next });
  },
  jsonPreview: readJsonPreview(),
  setJsonPreview: (on) => {
    try {
      localStorage.setItem(JSON_PREVIEW_KEY, on ? "on" : "off");
    } catch {
      // 存储不可用时忽略，内存态开关仍生效
    }
    set({ jsonPreview: on });
  },
  drafts: {},
  setDraft: (toolId, data) => set((s) => ({ drafts: { ...s.drafts, [toolId]: data } })),
}));
