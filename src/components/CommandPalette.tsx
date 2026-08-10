import { useCallback, useEffect, useRef, useState } from "react";
import { TOOLS } from "../tools";
import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";
import { ToolIcon } from "../components/icons";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const toolOrder = useSettingsStore((s) => s.order);

  const visibleTools = toolOrder
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const filtered = query.trim()
    ? visibleTools.filter(
        (t) =>
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.id.toLowerCase().includes(query.toLowerCase()),
      )
    : visibleTools;

  const select = useCallback(
    (id: string) => {
      setActiveTool(id);
      onClose();
    },
    [setActiveTool, onClose],
  );

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setSelectedIdx((i) => Math.max(i - 1, 0));
          break;
        }
        case "Enter": {
          e.preventDefault();
          if (filtered[selectedIdx]) select(filtered[selectedIdx].id);
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIdx, select]);

  if (!open) return null;

  return (
    <div className="cmd-palette-overlay" onMouseDown={onClose}>
      <div className="cmd-palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-palette-input"
          type="text"
          placeholder="搜索工具..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIdx(0);
          }}
        />
        {filtered.length === 0 ? (
          <div className="cmd-palette-empty">无匹配工具</div>
        ) : (
          <div className="cmd-palette-list">
            {filtered.map((t, i) => (
              <button
                key={t.id}
                className={`cmd-palette-item${i === selectedIdx ? " active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(t.id);
                }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="tool-icon">
                  <ToolIcon name={t.id} />
                </span>
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
