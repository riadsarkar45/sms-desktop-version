
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
  Loader2,
} from "lucide-react";

const INITIAL_CHECK_DELAY = 10 * 1000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

const UpdateChecker = () => {
  const [update, setUpdate] = useState(null);
  const [visible, setVisible] = useState(false);

  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const mountedRef = useRef(false);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);

  const updateRef = useRef(null);
  const dismissedVersionRef = useRef(null);

  // Convert technical errors into user-friendly messages.
  const getErrorMessage = (err) => {
    const message =
      typeof err === "string"
        ? err
        : err?.message || "";

    const normalized = message.toLowerCase();

    if (
      normalized.includes("network") ||
      normalized.includes("connection") ||
      normalized.includes("timeout") ||
      normalized.includes("fetch")
    ) {
      return "Unable to connect to the update server. Please check your internet connection and try again.";
    }

    if (
      normalized.includes("signature") ||
      normalized.includes("verify") ||
      normalized.includes("verification")
    ) {
      return "The update package could not be verified. For your security, the installation was stopped. Please contact your system administrator.";
    }

    if (
      normalized.includes("permission") ||
      normalized.includes("access denied")
    ) {
      return "Windows denied permission to install the update. Please close other SM Sourcing instances and try again.";
    }

    if (
      normalized.includes("download")
    ) {
      return "The update could not be downloaded. Please check your internet connection and try again.";
    }

    return "We couldn't install the update. Your current version is still available. Please try again.";
  };

  // Safely release updater resources.
  const closeUpdate = useCallback(async () => {
    const currentUpdate = updateRef.current;

    updateRef.current = null;

    if (currentUpdate) {
      try {
        await currentUpdate.close();
      } catch (err) {
        console.error("Updater cleanup error:", err);
      }
    }
  }, []);

  // Automatically check for new versions.
  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) return;

    if (checkingRef.current || installingRef.current) return;

    checkingRef.current = true;

    if (mountedRef.current) {
      setChecking(true);
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

      // No update available.
      if (!result) {
        await closeUpdate();

        if (!mountedRef.current) return;

        setUpdate(null);
        setVisible(false);
        return;
      }

      // Do not repeatedly show the same dismissed update.
      if (dismissedVersionRef.current === result.version) {
        await result.close();
        return;
      }

      // Replace any previous updater resource.
      await closeUpdate();

      if (!mountedRef.current) {
        await result.close();
        return;
      }

      updateRef.current = result;

      setUpdate(result);
      setError("");
      setProgress(0);

      setStatus(`Version ${result.version} is available.`);
      setVisible(true);
    } catch (err) {
      // Silent background check failure.
      console.error("Background update check failed:", err);
    } finally {
      checkingRef.current = false;

      if (mountedRef.current) {
        setChecking(false);
      }
    }
  }, [closeUpdate]);

  // Download and install the update.
  const installUpdate = useCallback(async () => {
    const currentUpdate = updateRef.current;

    if (!currentUpdate) {
      setError(
        "The update session has expired. Please wait while we check for updates again."
      );
      setVisible(true);
      return;
    }

    if (installingRef.current) return;

    installingRef.current = true;

    setInstalling(true);
    setError("");
    setProgress(0);
    setStatus("Preparing update...");

    try {
      let downloaded = 0;
      let total = 0;

      await currentUpdate.downloadAndInstall((event) => {
        if (!mountedRef.current) return;

        switch (event.event) {
          case "Started": {
            total = event.data.contentLength || 0;
            downloaded = 0;

            setProgress(0);
            setStatus("Downloading update...");
            break;
          }

          case "Progress": {
            downloaded += event.data.chunkLength || 0;

            if (total > 0) {
              const percentage = Math.min(
                100,
                Math.round((downloaded / total) * 100)
              );

              setProgress(percentage);
            }

            setStatus("Downloading update...");
            break;
          }

          case "Finished": {
            setProgress(100);
            setStatus("Download completed. Installing update...");
            break;
          }

          default:
            break;
        }
      });

      if (!mountedRef.current) return;

      setProgress(100);
      setStatus("Update installation completed.");

      // The application may close when the Windows installer starts.
      // Keep the success state available if it remains open.
      updateRef.current = null;
      setUpdate(null);
      setInstalling(false);

      setVisible(true);

      // No need to show the same update again.
      dismissedVersionRef.current = currentUpdate.version;
    } catch (err) {
      console.error("Update installation failed:", err);

      if (mountedRef.current) {
        setError(getErrorMessage(err));
        setStatus("");
        setInstalling(false);
        setVisible(true);
      }
    } finally {
      installingRef.current = false;
    }
  }, []);

  // Dismiss notification.
  const dismissNotification = useCallback(() => {
    if (installingRef.current) return;

    if (updateRef.current?.version) {
      dismissedVersionRef.current = updateRef.current.version;
    }

    setVisible(false);
    setError("");
  }, []);

  // Retry update installation.
  const retryUpdate = useCallback(() => {
    setError("");
    installUpdate();
  }, [installUpdate]);

  // Automatic update checking.
  useEffect(() => {
    mountedRef.current = true;

    if (!isTauri()) {
      return () => {
        mountedRef.current = false;
      };
    }

    const initialTimer = window.setTimeout(() => {
      checkForUpdates();
    }, INITIAL_CHECK_DELAY);

    const intervalTimer = window.setInterval(() => {
      checkForUpdates();
    }, CHECK_INTERVAL);

    return () => {
      mountedRef.current = false;

      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);

      const currentUpdate = updateRef.current;
      updateRef.current = null;

      if (currentUpdate) {
        currentUpdate.close().catch((err) => {
          console.error("Updater cleanup failed:", err);
        });
      }
    };
  }, [checkForUpdates]);

  if (!isTauri() || !visible) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[99999] w-[400px] max-w-[calc(100vw-32px)]">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                error
                  ? "bg-red-50 text-red-600"
                  : "bg-blue-50 text-blue-600"
              }`}
            >
              {error ? (
                <AlertCircle size={22} />
              ) : (
                <Bell size={22} />
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-900">
                SM Sourcing
              </h3>

              <p className="text-xs text-gray-500">
                Desktop Application Updater
              </p>
            </div>
          </div>

          {!installing && (
            <button
              type="button"
              onClick={dismissNotification}
              className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close update notification"
            >
              <X size={19} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5">

          {/* Installation error */}
          {error && (
            <div>
              <div className="flex items-start gap-3">
                <AlertCircle
                  size={23}
                  className="mt-0.5 shrink-0 text-red-500"
                />

                <div>
                  <h4 className="font-semibold text-gray-900">
                    Update unsuccessful
                  </h4>

                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {error}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={retryUpdate}
                disabled={installing || !updateRef.current}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={17} />
                Try Again
              </button>

              <button
                type="button"
                onClick={dismissNotification}
                disabled={installing}
                className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          )}

          {/* Available update */}
          {!error && update && (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  size={21}
                  className="text-green-600"
                />

                <h4 className="font-semibold text-gray-900">
                  New version available
                </h4>
              </div>

              <p className="mt-3 text-sm leading-6 text-gray-600">
                A new version of SM Sourcing is ready.

                <span className="mt-1 block font-semibold text-gray-900">
                  Version {update.version}
                </span>
              </p>

              {update.body && (
                <div className="mt-4 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm leading-6 text-gray-600">
                  {update.body}
                </div>
              )}

              {/* Progress */}
              {installing && (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-gray-600">
                      {status}
                    </span>

                    <span className="text-xs font-semibold tabular-nums text-blue-600">
                      {progress}%
                    </span>
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
                    Please keep SM Sourcing open during the update.
                  </p>
                </div>
              )}

              {/* Update button */}
              {!installing && (
                <button
                  type="button"
                  onClick={installUpdate}
                  disabled={!updateRef.current}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download size={18} />
                  Update Now
                </button>
              )}

              {!installing && (
                <button
                  type="button"
                  onClick={dismissNotification}
                  className="mt-2 w-full rounded-xl px-4 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                >
                  Remind Me Later
                </button>
              )}
            </>
          )}

          {/* Installation completed */}
          {!error && !update && status && (
            <div className="flex items-start gap-3">
              <CheckCircle2
                size={23}
                className="mt-0.5 shrink-0 text-green-600"
              />

              <div>
                <h4 className="font-semibold text-gray-900">
                  Update completed
                </h4>

                <p className="mt-1 text-sm leading-6 text-gray-600">
                  {status}
                </p>
              </div>
            </div>
          )}

          {/* Background checking indicator is intentionally not shown
              because normal update checks must remain silent. */}

          {checking && (
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              Checking for updates...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
          <p className="text-center text-[11px] text-gray-400">
            SM Sourcing ERP · Secure Desktop Updates
          </p>
        </div>
      </div>
    </div>
  );
};

export default UpdateChecker;
