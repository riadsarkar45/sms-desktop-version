
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
  MonitorDown,
  ChevronDown,
} from "lucide-react";

const INITIAL_CHECK_DELAY = 10 * 1000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

const UpdateChecker = () => {
  const [update, setUpdate] = useState(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);

  const mountedRef = useRef(false);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);
  const updateRef = useRef(null);

  // Release the updater resource when it is no longer needed.
  const closeUpdate = useCallback(async () => {
    const currentUpdate = updateRef.current;

    updateRef.current = null;

    if (currentUpdate) {
      try {
        await currentUpdate.close();
      } catch (err) {
        console.error("Failed to close updater resource:", err);
      }
    }
  }, []);

  // Check for available updates.
  const checkForUpdates = useCallback(
    async (manual = false) => {
      if (!isTauri()) return;

      if (checkingRef.current || installingRef.current) return;

      checkingRef.current = true;

      if (mountedRef.current) {
        setChecking(true);
        setError("");

        if (manual) {
          setVisible(true);
          setStatus("Checking for updates...");
        }
      }

      try {
        const result = await check({
          timeout: 30000,
        });

        if (!mountedRef.current) {
          if (result) {
            await result.close();
          }
          return;
        }

        if (result) {
          await closeUpdate();

          if (!mountedRef.current) {
            await result.close();
            return;
          }

          updateRef.current = result;

          setUpdate(result);
          setStatus(`Version ${result.version} is available.`);
          setVisible(true);
        } else {
          await closeUpdate();

          if (!mountedRef.current) return;

          setUpdate(null);

          if (manual) {
            setStatus("You are already using the latest version.");
            setVisible(true);
          }
        }
      } catch (err) {
        console.error("Update check failed:", err);

        if (mountedRef.current && manual) {
          setError(
            err?.message || "Unable to check for updates. Please try again."
          );

          setVisible(true);
        }
      } finally {
        checkingRef.current = false;

        if (mountedRef.current) {
          setChecking(false);
        }
      }
    },
    [closeUpdate]
  );

  // Download and install the available update.
  const installUpdate = async () => {
    if (!updateRef.current) return;
    if (installingRef.current) return;

    installingRef.current = true;

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
          case "Started": {
            total = event.data.contentLength || 0;
            downloaded = 0;

            setStatus("Downloading update...");
            setProgress(0);
            break;
          }

          case "Progress": {
            downloaded += event.data.chunkLength;

            if (total > 0) {
              const percentage = Math.min(
                100,
                Math.round((downloaded / total) * 100)
              );

              setProgress(percentage);
            }

            break;
          }

          case "Finished": {
            setProgress(100);
            setStatus("Download completed. Installing...");
            break;
          }

          default:
            break;
        }
      });

      // On Windows, Tauri exits the app after launching the installer.
      if (mountedRef.current) {
        setProgress(100);
        setStatus("Update installer launched successfully.");
      }

      updateRef.current = null;
    } catch (err) {
      console.error("Update installation failed:", err);

      if (mountedRef.current) {
        setError(
          err?.message || "Update installation failed. Please try again."
        );

        setInstalling(false);
      }

      installingRef.current = false;
    }
  };

  // Automatic update checks.
  useEffect(() => {
    mountedRef.current = true;

    if (!isTauri()) {
      return () => {
        mountedRef.current = false;
      };
    }

    const initialCheck = window.setTimeout(() => {
      checkForUpdates(false);
    }, INITIAL_CHECK_DELAY);

    const interval = window.setInterval(() => {
      checkForUpdates(false);
    }, CHECK_INTERVAL);

    return () => {
      mountedRef.current = false;

      window.clearTimeout(initialCheck);
      window.clearInterval(interval);

      const currentUpdate = updateRef.current;
      updateRef.current = null;

      if (currentUpdate) {
        currentUpdate.close().catch((err) => {
          console.error("Updater cleanup failed:", err);
        });
      }
    };
  }, [checkForUpdates]);

  if (!isTauri()) return null;

  return (
    <>
      {/* Floating update button */}
      {!visible && (
        <button
          type="button"
          onClick={() => checkForUpdates(true)}
          disabled={checking || installing}
          title="Check for application updates"
          aria-label="Check for updates"
          className="fixed bottom-6 right-6 z-[99999] flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-xl transition hover:bg-gray-50 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? (
            <RefreshCw
              size={19}
              className="animate-spin text-blue-600"
            />
          ) : (
            <MonitorDown size={19} className="text-blue-600" />
          )}

          <span>
            {checking ? "Checking..." : "Check for Updates"}
          </span>
        </button>
      )}

      {/* Update notification panel */}
      {visible && (
        <div className="fixed bottom-6 right-6 z-[99999] w-[380px] max-w-[calc(100vw-32px)]">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">

            {/* Header */}
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
                  type="button"
                  onClick={() => setVisible(false)}
                  className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close update notification"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Content */}
            <div className="p-5">

              {/* Error */}
              {error && (
                <div className="flex gap-3">
                  <AlertCircle
                    className="shrink-0 text-red-500"
                    size={22}
                  />

                  <div className="min-w-0">
                    <p className="font-medium text-gray-800">
                      Update failed
                    </p>

                    <p className="mt-1 break-words text-sm text-red-600">
                      {error}
                    </p>
                  </div>
                </div>
              )}

              {/* Available update */}
              {!error && update && (
                <>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className="text-green-600"
                      size={20}
                    />

                    <h4 className="font-semibold text-gray-800">
                      New version available
                    </h4>
                  </div>

                  <p className="mt-2 text-sm text-gray-600">
                    SM Sourcing version{" "}
                    <strong>{update.version}</strong> is ready to install.
                  </p>

                  {update.body && (
                    <div className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                      {update.body}
                    </div>
                  )}

                  {/* Installation progress */}
                  {installing && (
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-gray-600">
                        <span>{status}</span>
                        <span>{progress}%</span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300"
                          style={{
                            width: `${progress}%`,
                          }}
                        />
                      </div>

                      <p className="mt-3 text-center text-xs text-gray-500">
                        Please keep the application open during the update.
                      </p>
                    </div>
                  )}

                  {!installing && (
                    <button
                      type="button"
                      onClick={installUpdate}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      <Download size={17} />
                      Update Now
                    </button>
                  )}
                </>
              )}

              {/* Checking */}
              {!error && !update && checking && (
                <div className="flex items-center gap-3">
                  <RefreshCw
                    size={20}
                    className="animate-spin text-blue-600"
                  />

                  <p className="text-sm text-gray-700">
                    Checking for updates...
                  </p>
                </div>
              )}

              {/* No update available */}
              {!error && !update && !checking && status && (
                <div className="flex items-center gap-3">
                  <CheckCircle2
                    className="shrink-0 text-green-600"
                    size={22}
                  />

                  <p className="text-sm text-gray-700">
                    {status}
                  </p>
                </div>
              )}

              {/* Manual check button */}
              {!installing && (
                <button
                  type="button"
                  onClick={() => checkForUpdates(true)}
                  disabled={checking}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={15}
                    className={checking ? "animate-spin" : ""}
                  />

                  {checking ? "Checking..." : "Check for Updates"}
                </button>
              )}

              {/* Minimize */}
              {!installing && (
                <button
                  type="button"
                  onClick={() => setVisible(false)}
                  className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-xs text-gray-400 transition hover:text-gray-700"
                >
                  <ChevronDown size={14} />
                  Minimize
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UpdateChecker;
