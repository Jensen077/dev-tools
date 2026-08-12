import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./resizable-split.css";

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  /** 左 pane 初始占比（0~1），默认 0.5 */
  defaultRatio?: number;
  /** 透传给外层容器的 style（如 flex 权重） */
  style?: CSSProperties;
  /** 分栏方向：row 左右分栏（默认），column 上下分栏 */
  direction?: "row" | "column";
}

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

/**
 * 可拖拽分隔的左右分栏：中间 8px 分隔条，按住拖动调整两侧宽度。
 * 拖拽指针捕获在 handle 元素上，组件卸载或 pointercancel 自动结束。
 * 不持久化比例，组件卸载即复位（YAGNI，需持久化再加）。
 */
export function ResizableSplit({ left, right, defaultRatio = 0.5, style, direction = "row" }: ResizableSplitProps) {
  const [ratio, setRatio] = useState(defaultRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ axis: "x" | "y"; start: number; startRatio: number } | null>(null);

  // 拖拽回调中读取最新 ratio（避免闭包陈旧）
  const ratioRef = useRef(ratio);
  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = handleRef.current;
      if (!el) return;
      e.preventDefault();
      // 指针捕获：move/up/cancel 均派发给 handle，脱离窗口也不会丢失
      el.setPointerCapture(e.pointerId);
      dragRef.current = {
        axis: direction === "column" ? "y" : "x",
        start: direction === "column" ? e.clientY : e.clientX,
        startRatio: ratioRef.current,
      };
      document.body.style.cursor = direction === "column" ? "row-resize" : "col-resize";
    },
    [direction],
  );

  // 拖拽中组件卸载（如快捷键切换工具）：事件不会派发给已移除元素，须兜底清理光标
  useEffect(() => {
    return () => {
      if (dragRef.current) {
        dragRef.current = null;
        document.body.style.cursor = "";
      }
    };
  }, []);

  // 拖拽期间每次 render 重建 handler，闭包始终拿到当前 ratioRef/dragRef
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = containerRef.current;
    if (!d || !el) return;
    const rect = el.getBoundingClientRect();
    const size = d.axis === "y" ? rect.height : rect.width;
    if (size <= 0) return;
    const delta = (d.axis === "y" ? e.clientY - d.start : e.clientX - d.start) / size;
    setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, d.startRatio + delta)));
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = "";
  }, []);

  const leftStyle: CSSProperties = {
    flexGrow: ratio,
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0,
  };
  const rightStyle: CSSProperties = {
    flexGrow: 1 - ratio,
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0,
  };

  return (
    <div
      className={`resizable-split${direction === "column" ? " vertical" : ""}`}
      ref={containerRef}
      style={style}
    >
      <div className="resizable-pane" style={leftStyle}>
        {left}
      </div>
      <div
        className="resize-handle"
        ref={handleRef}
        title="拖动调整宽度"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
      <div className="resizable-pane" style={rightStyle}>
        {right}
      </div>
    </div>
  );
}
