import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { FileDown, FolderOpen, X } from "lucide-react";

const TOAST_DURATION = 15000;

export default function DownloadFeedback() {
  const [download, setDownload] = useState(null);
  const timeoutRef = useRef(null);
  const lastDownloadRef = useRef({ name: "", at: 0 });

  const dismiss = useCallback(() => {
    setDownload(null);
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return undefined;

    const handleDownloadClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[download]");
      if (!anchor) return;

      const rawName = anchor.getAttribute("download") || "";
      const fileName = rawName.split(/[\\/]/).filter(Boolean).pop();
      if (!fileName) return;

      // Some spreadsheet exporters dispatch the same synthetic anchor click twice.
      const now = Date.now();
      if (lastDownloadRef.current.name === fileName && now - lastDownloadRef.current.at < 800) return;
      lastDownloadRef.current = { name: fileName, at: now };

      setDownload({ fileName });
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setDownload(null), TOAST_DURATION);
    };

    // Capture programmatic anchor.click() calls too, including XLSX/CSV exporters.
    document.addEventListener("click", handleDownloadClick, true);
    return () => {
      document.removeEventListener("click", handleDownloadClick, true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const openExportedFile = async () => {
    if (!download?.fileName) return;
    try {
      const directory = await downloadDir();
      await openPath(await join(directory, download.fileName));
    } catch (error) {
      console.error("Unable to open exported file:", error);
    }
  };

  const openDownloadFolder = async () => {
    try {
      await openPath(await downloadDir());
    } catch (error) {
      console.error("Unable to open Downloads folder:", error);
    }
  };

  if (!download) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[11000] w-[min(420px,calc(100vw-2rem))]">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xl ring-1 ring-black/5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <FileDown size={20} />
        </div>

        <button
          type="button"
          onClick={openExportedFile}
          className="min-w-0 flex-1 text-left"
          title={`Open ${download.fileName}`}
        >
          <span className="block text-sm font-semibold text-slate-900">Export ready</span>
          <span className="block truncate text-xs text-slate-500">{download.fileName}</span>
          <span className="mt-0.5 block text-[11px] font-medium text-blue-600">Click to open file</span>
        </button>

        <button
          type="button"
          onClick={openDownloadFolder}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          title="Open Downloads folder"
          aria-label="Open Downloads folder"
        >
          <FolderOpen size={19} />
        </button>

        <button
          type="button"
          onClick={dismiss}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Dismiss"
          aria-label="Dismiss export notification"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
