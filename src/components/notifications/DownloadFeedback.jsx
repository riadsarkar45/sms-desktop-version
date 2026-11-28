import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { FileDown, FolderOpen, X, AlertCircle } from "lucide-react";

const TOAST_DURATION = 15000;

export default function DownloadFeedback() {
  const [download, setDownload] = useState(null);
  const timeoutRef = useRef(null);

  const dismiss = useCallback(() => {
    setDownload(null);
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showMessage = useCallback((nextDownload) => {
    setDownload(nextDownload);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setDownload(null), TOAST_DURATION);
  }, []);

  useEffect(() => {
    if (!isTauri()) return undefined;

    // Keep the Blob itself: several exporters revoke their object URL immediately
    // after anchor.click(), before an asynchronous fetch(blobUrl) could finish.
    const blobByUrl = new Map();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = function (object) {
      const url = originalCreateObjectURL.call(URL, object);
      if (object instanceof Blob) blobByUrl.set(url, object);
      return url;
    };

    URL.revokeObjectURL = function (url) {
      // Delay removing our Blob reference; the exporter may revoke immediately.
      window.setTimeout(() => blobByUrl.delete(url), 60000);
      return originalRevokeObjectURL.call(URL, url);
    };

    const handleDownloadClick = async (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[download]");
      if (!anchor) return;

      const fileName = (anchor.getAttribute("download") || "").split(/[\\/]/).filter(Boolean).pop();
      if (!fileName) return;

      // Stop the WebView's native download: we save it explicitly through Rust instead.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      showMessage({ fileName, status: "saving" });

      try {
        const href = anchor.href;
        let blob = blobByUrl.get(href);

        if (!blob) {
          const response = await fetch(href, { credentials: "include" });
          if (!response.ok) throw new Error(`Download request failed (${response.status})`);
          blob = await response.blob();
        }

        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        await invoke("save_export", { fileName, bytes });
        showMessage({ fileName, status: "ready" });
      } catch (error) {
        console.error("Export save failed:", error);
        showMessage({
          fileName,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    document.addEventListener("click", handleDownloadClick, true);

    return () => {
      document.removeEventListener("click", handleDownloadClick, true);
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      blobByUrl.clear();
    };
  }, [showMessage]);

  const openExportedFile = async () => {
    if (!download?.fileName || download.status !== "ready") return;
    try {
      await invoke("open_exported_file", { fileName: download.fileName });
    } catch (error) {
      console.error("Unable to open exported file:", error);
      showMessage({
        ...download,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const openDownloadFolder = async () => {
    try {
      await invoke("open_downloads_folder");
    } catch (error) {
      console.error("Unable to open Downloads folder:", error);
      showMessage({
        ...download,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!download) return null;

  const saving = download.status === "saving";
  const failed = download.status === "error";

  return (
    <div className="fixed bottom-5 right-5 z-[11000] w-[min(440px,calc(100vw-2rem))]">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xl ring-1 ring-black/5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${failed ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
          {failed ? <AlertCircle size={20} /> : <FileDown size={20} />}
        </div>

        <button
          type="button"
          onClick={openExportedFile}
          disabled={saving || failed}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
          title={`Open ${download.fileName}`}
        >
          <span className="block text-sm font-semibold text-slate-900">
            {saving ? "Saving export..." : failed ? "Export failed" : "Export ready"}
          </span>
          <span className="block truncate text-xs text-slate-500">{download.fileName}</span>
          {failed ? (
            <span className="mt-0.5 block text-[11px] text-red-600">{download.error || "Could not save the file"}</span>
          ) : (
            <span className="mt-0.5 block text-[11px] font-medium text-blue-600">
              {saving ? "Please wait" : "Click to open file"}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={openDownloadFolder}
          disabled={saving}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
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
