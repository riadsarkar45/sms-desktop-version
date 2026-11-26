import { isTauri } from "@tauri-apps/api/core";
import {
    isPermissionGranted,
    requestPermission,
    sendNotification,
} from "@tauri-apps/plugin-notification";

let permissionPromise;

/**
 * Show a native OS notification in the Tauri desktop app.
 * Web builds intentionally keep using their existing in-app notifications.
 */
export async function showNativeNotification({ title, body }) {
    if (!isTauri()) return;

    try {
        if (!permissionPromise) {
            permissionPromise = (async () => {
                const alreadyGranted = await isPermissionGranted();
                if (alreadyGranted) return true;

                const permission = await requestPermission();
                return permission === "granted";
            })();
        }

        const granted = await permissionPromise;
        if (!granted) return;

        sendNotification({
            title: String(title || "SM Sourcing"),
            body: String(body || ""),
            // Tauri's Windows notification plugin accepts a .wav file path.
            // Use the standard Windows 10/11 notification sound.
            sound: "C:\\Windows\\Media\\Windows Notify System Generic.wav",
        });
    } catch (error) {
        console.warn("[Native notification] Could not display notification:", error);
        // Allow a later event to retry if the plugin was temporarily unavailable.
        permissionPromise = undefined;
    }
}
