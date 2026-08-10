import { useEffect, useRef } from "react";
import { useAppStore } from "../store/app";

export function useSaveDraft(toolId: string, data: Record<string, unknown>): void {
  const setDraft = useAppStore((s) => s.setDraft);
  const ref = useRef(data);
  ref.current = data;

  useEffect(() => {
    return () => setDraft(toolId, ref.current);
  }, [toolId, setDraft]);
}
