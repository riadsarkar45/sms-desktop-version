import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Users } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useSocket } from "../../hooks/socketProvider/SocketContext";

const formatTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

export default function UserActivityPanel() {
  const socket = useSocket();
  const { accessToken } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(() => {
    if (!accessToken || !socket.connected) return;

    socket.emit("monitoring:user-activity:request", { token: accessToken }, (result) => {
      setLoading(false);
      if (result?.success) {
        setSnapshot(result);
        setError("");
        setUpdatedAt(new Date());
      } else {
        setError(result?.message || "Unable to load live user pages.");
      }
    });
  }, [accessToken, socket]);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return undefined;
    }

    const onConnect = () => loadActivity();
    const onDisconnect = () => setLoading(true);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    if (socket.connected) loadActivity();

    const timer = window.setInterval(loadActivity, 5_000);
    return () => {
      window.clearInterval(timer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [accessToken, loadActivity, socket]);

  if (!snapshot && error.includes("Administrator access required")) return null;

  const sessions = snapshot?.sessions || [];

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users size={19} className="text-blue-600" />
          <div>
            <h2 className="font-semibold text-slate-900">Users currently visiting</h2>
            <p className="text-xs text-slate-500">Live ERP page by user and open app tab</p>
          </div>
          {snapshot && (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>{updatedAt ? `Updated ${formatTime(updatedAt)}` : "Waiting for activity"}</span>
          <button
            type="button"
            onClick={loadActivity}
            disabled={!socket.connected}
            aria-label="Refresh current user pages"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <Activity size={18} className="text-emerald-600" />
        <div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">{snapshot ? sessions.length : "—"}</p>
          <p className="text-xs text-slate-500">Active page sessions</p>
        </div>
      </div>

      {error && !error.includes("Administrator access required") && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Currently visiting</th>
              <th className="px-3 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sessions.map((session) => (
              <tr key={session.sessionKey} className="hover:bg-slate-50">
                <td className="px-3 py-3 font-semibold text-slate-800">{session.name}</td>
                <td className="px-3 py-3 text-slate-600">{session.role || "—"}</td>
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-700">{session.page}</p>
                  <p className="max-w-[280px] truncate text-[11px] text-slate-400">{session.path}</p>
                </td>
                <td className="px-3 py-3 text-xs text-slate-500">{formatTime(session.lastSeenAt)}</td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr>
                <td colSpan="4" className="px-3 py-8 text-center text-sm text-slate-400">
                  {loading ? "Connecting to live user pages…" : "No active user pages."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">
        Each open ERP tab is listed separately. Sessions expire after 90 seconds without a heartbeat and are cleared daily at 12:00 AM Bangladesh time.
      </p>
    </section>
  );
}
