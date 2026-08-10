import { useCallback, useRef, useState } from "react";

export interface FileDropOptions {
  onFile: (file: File) => void;
  accept?: string[];
}

/**
 * 应用级文件拖拽。将 dropRef 挂到输入容器上，拖入文本文件时读取并回调。
 * 用于替代 Monaco 关闭 dropIntoEditor 后缺失的拖拽能力。
 */
export function useFileDrop(options: FileDropOptions) {
  const { onFile, accept } = options;
  const dropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // 进入子元素会触发 dragleave，用计数避免 isDragging 闪烁
  const depthRef = useRef(0);

  const isValid = useCallback(
    (file: File): boolean => {
      if (!accept || accept.length === 0) return true;
      const lower = file.name.toLowerCase();
      return accept.some((ext) => lower.endsWith(ext.toLowerCase()));
    },
    [accept],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragging(true);
  }, []);

  const handleDragEnter = useCallback(() => {
    depthRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    depthRef.current -= 1;
    if (depthRef.current <= 0) {
      depthRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      depthRef.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && isValid(file)) {
        onFile(file);
      }
    },
    [isValid, onFile],
  );

  const bindDrop = {
    ref: dropRef,
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  };

  return { bindDrop, isDragging };
}
