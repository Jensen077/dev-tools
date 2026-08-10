import { useToastStore } from "../store/toast";
import "./toast.css";

/** 全局 Toast 容器：右下角堆叠展示，自动消失，点击可手动关闭 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => dismiss(t.id)}
        >
          {t.type === "success" && <span className="toast-icon">✓</span>}
          {t.type === "error" && <span className="toast-icon">✕</span>}
          {t.type === "info" && <span className="toast-icon">ℹ</span>}
          <span>{t.message}</span>
        </button>
      ))}
    </div>
  );
}
