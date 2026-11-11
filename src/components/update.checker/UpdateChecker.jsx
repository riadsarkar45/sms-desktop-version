
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";

import {
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Bell,
  Loader2,
} from "lucide-react";

const INITIAL_CHECK_DELAY = 10_000;
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const CHECK_TIMEOUT = 30_000;

const DISMISSED_VERSION_KEY = "sm-sourcing-dismissed-update-version";

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

  // Prevent duplicate checks and updates.
  const checkRequestRef = useRef(0);

  const getDismissedVersion = useCallback(() => {
    try {
      return localStorage.getItem(DISMISSED_VERSION_KEY);
    } catch (err) {
      console.error("Unable to read dismissed update version:", err);
      return null;
    }
  }, []);

  const saveDismissedVersion = useCallback((version) => {
    try {
      localStorage.setItem(DISMISSED_VERSION_KEY, version);
    } catch (err) {
      console.error("Unable to save dismissed update version:", err);
    }
  }, []);

  const getErrorMessage = useCallback((err) => {
    const message =
      typeof err === "string"
        ? err
        : err?.message || String(err || "");

    const normalized = message.toLowerCase();

    if (
      normalized.includes("signature") ||
      normalized.includes("verify") ||
      normalized.includes("verification")
    ) {
      return "The update package could not be verified. For your security, installation was stopped.";
    }

    if (
      normalized.includes("permission") ||
      normalized.includes("access denied")
    ) {
      return "Windows denied permission to install the update. Please close other SM Sourcing instances and try again.";
    }

    if (
      normalized.includes("network") ||
      normalized.includes("connection") ||
      normalized.includes("timeout") ||
      normalized.includes("fetch") ||
      normalized.includes("request")
    ) {
      return "Unable to connect to the update server. Please check your internet connection and try again.";
    }

    if (normalized.includes("download")) {
      return "The update could not be downloaded. Please check your internet connection and try again.";
    }

    return "The update could not be installed. Your current version is still available. Please try again.";
  }, []);

  // Release an updater resource safely.
  const closeUpdate = useCallback(async () => {
    const currentUpdate = updateRef.current;

    updateRef.current = null;

    if (!currentUpdate) return;

    try {
      await currentUpdate.close();
    } catch (err) {
      console.error("Updater resource cleanup failed:", err);
    }
  }, []);

  // Check for a new update.
  // This function never displays UI when no update is available.
  const checkForUpdates = useCallback(
    async ({ showError = false } = {}) => {
      if (!isTauri()) return;

      if (checkingRef.current || installingRef.current) return;

      checkingRef.current = true;

      const requestId = ++checkRequestRef.current;

      if (mountedRef.current) {
        setChecking(true);
      }

      let result = null;

      try {
        result = await check({
          timeout: CHECK_TIMEOUT,
        });

        // Component was unmounted or a newer request replaced this one.
        if (
          !mountedRef.current ||
          requestId !== checkRequestRef.current
        ) {
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
          setError("");
          setStatus("");
          setProgress(0);

          return;
        }

        // Do not show the same dismissed version again.
        const dismissedVersion = getDismissedVersion();

        if (dismissedVersion === result.version) {
          await result.close();

          await closeUpdate();

          if (!mountedRef.current) return;

          setUpdate(null);
          setVisible(false);
          setError("");
          setStatus("");

          return;
        }

        // Replace any previously stored update resource.
        await closeUpdate();

        if (!mountedRef.current) {
          await result.close();
          return;
        }

        updateRef.current = result;

        setUpdate(result);
        setVisible(true);

        setProgress(0);
        setError("");
        setStatus(`Version ${result.version} is available.`);
      } catch (err) {
        console.error("Update check failed:", err);

        if (result && result !== updateRef.current) {
          try {
            await result.close();
          } catch (closeError) {
            console.error("Update cleanup failed:", closeError);
          }
        }

        if (mountedRef.current && showError) {
          setError(getErrorMessage(err));
          setStatus("");
          setVisible(true);
        }
      } finally {
        checkingRef.current = false;

        if (mountedRef.current) {
          setChecking(false);
        }
      }
    },
    [closeUpdate, getDismissedVersion, getErrorMessage]
  );

  // Download and install.
  const installUpdate = useCallback(async () => {
    const currentUpdate = updateRef.current;

    if (!currentUpdate || installingRef.current) return;

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

      // Windows normally exits the application after launching
      // the updater installer successfully.
      // If execution continues, show the completion state.
      setProgress(100);
      setStatus("Update installation completed.");

      saveDismissedVersion(currentUpdate.version);

      updateRef.current = null;

      setUpdate(null);
      setInstalling(false);
      setVisible(true);

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
  }, [getErrorMessage, saveDismissedVersion]);

  // Dismiss the popup.
  const dismissNotification = useCallback(async () => {
    if (installingRef.current) return;

    const currentUpdate = updateRef.current;

    if (currentUpdate?.version) {
      saveDismissedVersion(currentUpdate.version);
    }

    await closeUpdate();

    if (!mountedRef.current) return;

    setUpdate(null);
    setVisible(false);

    setError("");
    setStatus("");
    setProgress(0);
  }, [closeUpdate, saveDismissedVersion]);

  // Retry installation or update checking.
  const retryUpdate = useCallback(async () => {
    if (installingRef.current) return;

    setError("");

    // Existing update resource is still available.
    if (updateRef.current) {
      await installUpdate();
      return;
    }

    // Previous update resource is unavailable.
    // Check the server again.
    setVisible(false);

    await checkForUpdates({
      showError: true,
    });
  }, [installUpdate, checkForUpdates]);

  // Automatic update checks.
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

      // Invalidate any pending check result.
      checkRequestRef.current += 1;

      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);

      // Do not close an updater resource during installation.
      if (!installingRef.current) {
        const currentUpdate = updateRef.current;

        updateRef.current = null;

        if (currentUpdate) {
          currentUpdate.close().catch((err) => {
            console.error("Updater cleanup failed:", err);
          });
        }
      }
    };
  }, [checkForUpdates]);

  // No UI in browser.
  if (!isTauri()) return null;

  // No update and no error: render nothing.
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      >
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
              <h3
                id="update-dialog-title"
                className="text-sm font-bold text-gray-900"
              >
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

        {/* Body */}
        <div className="p-5">

          {/* Error */}
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
                disabled={installing || checking}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {checking ? (
                  <Loader2 size={17} className="animate-spin" />
                ) : (
                  <Download size={17} />
                )}

                {checking ? "Checking..." : "Try Again"}
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

          {/* New update available */}
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

              {/* Download progress */}
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

                  <div
                    className="h-2 overflow-hidden rounded-full bg-gray-100"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
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

              {/* Install */}
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

              {/* Remind later */}
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

                <p className="mt-2 text-xs text-gray-500">
                  Restart the application if required.
                </p>
              </div>
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
