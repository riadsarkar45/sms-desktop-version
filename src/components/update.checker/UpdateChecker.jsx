
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import {
  Download,
  RefreshCw,
  X,
  CheckCircle2,
  AlertCircle,
  Bell,
} from "lucide-react";

const UpdateChecker = () => {
  const [update, setUpdate] = useState(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);

  const updateRef = useRef(null);
  const mountedRef = useRef(true);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!isTauri() || checking) return;

    setChecking(true);
    setError("");

    try {
      const result = await check();

      if (!mountedRef.current) {
        if (result) await result.close();
        return;
      }

      if (result) {
        if (updateRef.current) {
          await updateRef.current.close();
        }

        updateRef.current = result;
        setUpdate(result);
        setVisible(true);
        setStatus(
          `Version ${result.version} is available.`
        );
      } else {
        setUpdate(null);
        setVisible(false);

        if (manual) {
          setStatus("You are already using the latest version.");
          setVisible(true);
        }
      }
    } catch (err) {
      console.error("Update check failed:", err);

      if (manual && mountedRef.current) {
        setError(
          err?.message || "Unable to check for updates."
        );
        setVisible(true);
      }
    } finally {
      if (mountedRef.current) {
        setChecking(false);
      }
    }
  }, [checking]);

  const installUpdate = async () => {
    if (!updateRef.current || installing) return;

    setInstalling(true);
    setError("");
    setProgress(0);
    setStatus("Preparing update...");

    try {
      let downloaded = 0;
      let total = 0;

      await updateRef.current.downloadAndInstall((event) => {
        if (!mountedRef.current) return;

        switch (event.event) {
          case "Started":
            total = event.data.contentLength || 0;
            setStatus("Downloading update...");
            break;

          case "Progress":
            downloaded += event.data.chunkLength;

            if (total > 0) {
              setProgress(
                Math.min(100, Math.round((downloaded / total) * 100))
              );
            }
            break;

          case "Finished":
            setProgress(100);
            setStatus("Download completed. Installing...");
            break;

          default:
            break;
        }
      });

      // Windows updater automatically exits the application
      // after successfully launching the installer.
      setStatus("Update installed successfully.");
    } catch (err) {
      console.error("Update installation failed:", err);
      setError(
        err?.message || "Update installation failed."
      );
      setInstalling(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    if (!isTauri()) {
      return () => {
        mountedRef.current = false;
      };
    }

    const initialCheck = setTimeout(() => {
      checkForUpdates(false);
    }, 10000);

    const interval = setInterval(() => {
      checkForUpdates(false);
    }, 6 * 60 * 60 * 1000);

    return () => {
      mountedRef.current = false;
      clearTimeout(initialCheck);
      clearInterval(interval);

      if (updateRef.current) {
        updateRef.current.close().catch(console.error);
        updateRef.current = null;
      }
    };
  }, [checkForUpdates]);

  if (!isTauri() || !visible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[99999] w-[380px] max-w-[calc(100vw-32px)]">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Bell size={20} />
            </div>

            <div>
              <h3 className="font-semibold text-gray-800">
                SM Sourcing Updater
              </h3>
              <p className="text-xs text-gray-500">
                Desktop application
              </p>
            </div>
          </div>

          {!installing && (
            <button
              onClick={() => setVisible(false)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close update notification"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-5">
          {error ? (
            <div className="flex gap-3">
              <AlertCircle className="shrink-0 text-red-500" size={22} />
              <div>
                <p className="font-medium text-gray-800">
                  Update failed
                </p>
                <p className="mt-1 break-words text-sm text-red-600">
                  {error}
                </p>
              </div>
            </div>
          ) : update ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-green-600" size={20} />
                <h4 className="font-semibold text-gray-800">
                  New version available
                </h4>
              </div>

              <p className="mt-2 text-sm text-gray-600">
                SM Sourcing version{" "}
                <strong>{update.version}</strong> is ready to install.
              </p>

              {update.body && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-500">
                  {update.body}
                </p>
              )}

              {installing && (
                <div className="mt-5">
                  <div className="mb-2 flex justify-between text-xs text-gray-600">
                    <span>{status}</span>
                    <span>{progress}%</span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {!installing && (
                <button
                  onClick={installUpdate}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <Download size={17} />
                  Update Now
                </button>
              )}

              {installing && (
                <p className="mt-3 text-center text-xs text-gray-500">
                  Please keep the application open during the update.
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-green-600" size={22} />
              <p className="text-sm text-gray-700">{status}</p>
            </div>
          )}

          {!installing && (
            <button
              onClick={() => checkForUpdates(true)}
              disabled={checking}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw
                size={15}
                className={checking ? "animate-spin" : ""}
              />
              {checking ? "Checking..." : "Check for Updates"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateChecker;
