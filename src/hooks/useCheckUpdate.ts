import { useState, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isDesktop } from "../utils/backend";
import { useToastStore } from "../store/toast";

export function useCheckUpdate() {
  const [checking, setChecking] = useState(false);
  const showToast = useToastStore((s) => s.showToast);

  const checkForUpdate = useCallback(async () => {
    if (!isDesktop()) {
      showToast("仅桌面版支持自动更新", "info");
      return;
    }
    setChecking(true);
    try {
      const update = await check();
      if (!update) {
        showToast("已是最新版本", "success");
        return;
      }
      showToast(`发现新版本 ${update.version}，正在下载...`, "info", 4000);
      await update.downloadAndInstall();
      const confirmed = window.confirm(
        `新版本 ${update.version} 已下载安装，是否立即重启应用？`,
      );
      if (confirmed) {
        await relaunch();
      }
    } catch (e) {
      showToast(`更新检查失败: ${String(e)}`, "error", 4000);
    } finally {
      setChecking(false);
    }
  }, [showToast]);

  return { checkForUpdate, checking };
}