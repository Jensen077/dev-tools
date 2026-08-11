import { useCallback, useEffect, useRef, useState } from "react";
import { TOOLS } from "../index";
import type { ToolDef } from "../index";
import { useSettingsStore } from "../../store/settings";
import { useAppStore } from "../../store/app";
import "../tool.css";

/** 拖拽中的实时数据 */
interface DragState {
  id: string;
  ox: number;
  oy: number;
}

const LIST_PAD_TOP = 4;

/** 工具显隐与排序配置页：勾选启用、拖拽整行排序、重置默认 */
export function Settings() {
  const order = useSettingsStore((s) => s.order);
  const setEnabled = useSettingsStore((s) => s.setEnabled);
  const reorder = useSettingsStore((s) => s.reorder);
  const reset = useSettingsStore((s) => s.reset);
  const jsonPreview = useAppStore((s) => s.jsonPreview);
  const setJsonPreview = useAppStore((s) => s.setJsonPreview);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [draftOrder, setDraftOrder] = useState<string[]>(order);
  const [suppressAnim, setSuppressAnim] = useState(false);

  const stepRef = useRef(36); // 行高 + gap
  const draftRef = useRef<string[]>(order);
  const dragRef = useRef<DragState | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const enabledCount = order.length;

  // 同步 draftOrder 到 ref，供 window 事件读取最新值
  useEffect(() => {
    draftRef.current = draftOrder;
  }, [draftOrder]);

  // 非拖拽时 draftOrder 始终与 order 对齐，避免勾选切换/reset 后位移残留
  useEffect(() => {
    if (!drag) setDraftOrder(order);
  }, [order, drag]);

  const isDragging = drag !== null;

  const disabled = TOOLS.filter((t) => !order.includes(t.id));
  const enabled = order
    .map((id) => TOOLS.find((t) => t.id === id))
    .filter((t): t is ToolDef => Boolean(t));
  const items = [...enabled, ...disabled];

  // 位移 = (目标槽位 - 实际槽位) × 步距。
  // DOM 始终按 order 排列，transform 只表达「应处位置」，transition 驱动平滑滑动。
  const shiftFor = useCallback(
    (id: string): number => {
      const domIdx = order.indexOf(id);
      const targetIdx = draftOrder.indexOf(id);
      if (domIdx < 0 || targetIdx < 0) return 0;
      return (targetIdx - domIdx) * stepRef.current;
    },
    [order, draftOrder],
  );

  const startDrag = useCallback(
    (e: React.MouseEvent, id: string) => {
      // 拖拽中点击其他行不劫持当前拖拽
      if (dragRef.current) return;
      e.preventDefault();
      const row = e.currentTarget as HTMLElement;
      const rect = row.getBoundingClientRect();
      stepRef.current = rect.height + 4;
      setDraftOrder(order);
      setPointer({ x: e.clientX, y: e.clientY });
      setDrag({ id, ox: e.clientX - rect.left, oy: e.clientY - rect.top });
      document.body.style.userSelect = "none";
    },
    [order],
  );

  // drag 用 ref 同步，供 window 事件闭包读取并防重入
  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    if (!drag) return;

    let lastY = -1;
    let raf = 0;

    // 指针停在边缘时持续自动滚动（不依赖 mousemove 事件）
    const scrollTick = () => {
      const listEl = listRef.current;
      if (dragRef.current && listEl && lastY >= 0) {
        const rect = listEl.getBoundingClientRect();
        if (lastY < rect.top + 24) listEl.scrollTop -= 6;
        else if (lastY > rect.bottom - 24) listEl.scrollTop += 6;
      }
      // 仅在拖拽中持续调度，拖拽结束后自然收敛
      if (dragRef.current) raf = requestAnimationFrame(scrollTick);
    };

    const finish = (id: string) => {
      const from = order.indexOf(id);
      const to = draftRef.current.indexOf(id);
      const committed = draftRef.current;
      if (from >= 0 && to >= 0 && from !== to) reorder(from, to);
      // 提交帧抑制过渡，避免落点瞬间行从错误位置弹跳归位
      setDraftOrder(committed);
      setSuppressAnim(true);
      requestAnimationFrame(() => setSuppressAnim(false));
      dragRef.current = null;
      setDrag(null);
      setPointer({ x: 0, y: 0 });
      document.body.style.userSelect = "";
    };

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // 鼠标在窗口外松开时 mouseup 不派发，用按钮状态兜底
      if (!(e.buttons & 1)) {
        finish(d.id);
        return;
      }
      lastY = e.clientY;
      setPointer({ x: e.clientX, y: e.clientY });

      const listEl = listRef.current;
      if (!listEl) return;
      const rect = listEl.getBoundingClientRect();

      // 由指针 Y 计算目标槽位（不依赖 elementFromPoint，避免采样动画中间态）
      const rawIdx = Math.floor(
        (e.clientY - rect.top - LIST_PAD_TOP + listEl.scrollTop) / stepRef.current,
      );
      const targetIdx = Math.max(0, Math.min(enabledCount - 1, rawIdx));

      setDraftOrder((prev) => {
        const cur = prev.indexOf(d.id);
        if (cur < 0 || cur === targetIdx) return prev;
        const next = [...prev];
        next.splice(cur, 1);
        next.splice(targetIdx, 0, d.id);
        return next;
      });
    };

    const onUp = (e: MouseEvent) => {
      // 仅左键松开才结束拖拽，避免右键/中键 mouseup 提前终止
      const d = dragRef.current;
      if (d && e.button === 0) finish(d.id);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dragRef.current = null;
        setDrag(null);
        setPointer({ x: 0, y: 0 });
        setDraftOrder(order);
        document.body.style.userSelect = "";
      }
    };

    // 窗口失焦兜底结束拖拽（窗口外松开且无后续事件时）
    const onBlur = () => {
      const d = dragRef.current;
      if (d) finish(d.id);
    };

    raf = requestAnimationFrame(scrollTick);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      // 组件卸载时兜底还原
      document.body.style.userSelect = "";
    };
  }, [drag, order, enabledCount, reorder]);

  const dragId = drag?.id ?? null;

  return (
    <div className="tool-page">
      <div className="toolbar">
        <span className="hint">拖拽整行调整启用工具顺序，取消勾选则隐藏，Esc 取消拖拽</span>
        <span className="spacer" />
        <button className="btn btn-danger" onClick={reset}>
          恢复默认
        </button>
      </div>
      <label className="settings-pref">
        <input
          type="checkbox"
          className="switch"
          checked={jsonPreview}
          onChange={(e) => setJsonPreview(e.target.checked)}
        />
        悬停预览 JSON 值（点击 key 复制）
      </label>
      <div
        className={`settings-list${isDragging ? " dragging" : ""}${suppressAnim ? " no-anim" : ""}`}
        ref={listRef}
      >
        {items.map((tool) => {
          const isEnabled = order.includes(tool.id);
          const isDragged = dragId === tool.id;
          const shift = shiftFor(tool.id);
          return (
            <div
              key={tool.id}
              className={`settings-item${isDragged ? " dragging" : ""}`}
              style={shift ? { transform: `translateY(${shift}px)` } : undefined}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                // 点复选框/标签等可交互控件不触发拖拽，其余区域均可拖
                const t = e.target as HTMLElement;
                if (t.closest("input, label, button, a")) return;
                if (isEnabled) startDrag(e, tool.id);
              }}
            >
              {isEnabled && (
                <span className="drag-handle" title="拖拽排序">
                  ⋮⋮
                </span>
              )}
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setEnabled(tool.id, e.target.checked)}
                />
              </label>
              <span className="tool-icon">{tool.icon}</span>
              <span className="settings-name">{tool.name}</span>
            </div>
          );
        })}
      </div>
      {/* 跟随鼠标的浮动卡片（不拦截命中检测） */}
      {isDragging && drag && (
        <div
          className="settings-drag-card"
          style={{
            left: pointer.x,
            top: pointer.y,
            transform: `translate(${-drag.ox}px, ${-drag.oy}px) scale(1.03)`,
          }}
        >
          <span className="tool-icon">
            {TOOLS.find((t) => t.id === drag.id)?.icon}
          </span>
          <span className="settings-name">{TOOLS.find((t) => t.id === drag.id)?.name}</span>
        </div>
      )}
    </div>
  );
}
