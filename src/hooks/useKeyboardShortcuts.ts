import { useEffect } from "react";
import { TOOLS } from "../tools";
import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";

function isMod(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

export function useKeyboardShortcuts(setCmdOpen: (open: boolean) => void): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (isMod(e) && e.key === "p") {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }

      if (!isMod(e)) return;

      // 文本比对：上下切换变更块（⌘↑/⌘↓，按钮带 data-hotkey="diff-prev"/"diff-next"）
      if (e.key === "ArrowUp") {
        const el = document.querySelector<HTMLElement>('[data-hotkey="diff-prev"]');
        if (el && !el.hasAttribute("disabled")) {
          el.click();
          e.preventDefault();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        const el = document.querySelector<HTMLElement>('[data-hotkey="diff-next"]');
        if (el && !el.hasAttribute("disabled")) {
          el.click();
          e.preventDefault();
        }
        return;
      }

      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const ordered = useSettingsStore
          .getState()
          .order.map((id) => TOOLS.find((t) => t.id === id))
          .filter((t): t is NonNullable<typeof t> => Boolean(t));
        const tool = ordered[idx];
        if (tool) {
          useAppStore.getState().setActiveTool(tool.id);
          e.preventDefault();
        }
        return;
      }

      if (e.key === "Enter") {
        const el = document.querySelector<HTMLElement>('[data-hotkey="run"]');
        if (el && !el.hasAttribute("disabled")) {
          el.click();
          e.preventDefault();
        }
        return;
      }

      if (e.key.toUpperCase() === "C" && e.shiftKey) {
        const el = document.querySelector<HTMLElement>('[data-hotkey="copy"]');
        if (el && !el.hasAttribute("disabled")) {
          el.click();
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCmdOpen]);
}
