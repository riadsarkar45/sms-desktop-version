import { useCallback, useEffect, useState } from "react";
import { Activity, Eye, Monitor, Users, RefreshCw } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { useSocket } from "../../hooks/socketProvider/SocketContext";

const formatTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const STATUS_STYLES = {
  working: "border-emerald-200 bg-emerald-50 text-emerald-700",
  viewing: "border-blue-200 bg-blue-50 text-blue-700",
  background: "border-slate-200 bg-slate-100 text-slate-600",
};

const STATUS_LABELS = {
  working: "Working",
  viewing: "Viewing",
  background: "Background",
};

function SummaryCard({ label, value, icon: Icon, tone }) {
  return (
    <div className={`rounded-xl p-3 ${tone}`}>
      <div className="flex items-center gap-2 text-xs opacity-80">
        <Icon size={14} />
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

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
        setError(result?.message || "Unable to load live user activity.");
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

    const timer = window.setInterval(loadActivity, 10_000);
    return () => {
      window.clearInterval(timer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [accessToken, loadActivity, socket]);

  // The backend authorizes every snapshot request. Do not expose any session
  // details unless the server confirms the caller has administrator access.
  if (!snapshot && error.includes("Administrator access required")) return null;

  const summary = snapshot?.summary || {
    total: 0,
    working: 0,
    viewing: 0,
    background: 0,
    modules: 0,
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity size={19} className="text-blue-600" />
          <div>
            <h2 className="font-semibold text-slate-900">Live User Activity</h2>
            <p className="text-xs text-slate-500">Active sessions, current module and recent interaction</p>
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
            aria-label="Refresh live user activity"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && !error.includes("Administrator access required") && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryCard label="Online sessions" value={summary.total} icon={Users} tone="bg-slate-50 text-slate-800" />
        <SummaryCard label="Working" value={summary.working} icon={Activity} tone="bg-emerald-50 text-emerald-800" />
        <SummaryCard label="Viewing" value={summary.viewing} icon={Eye} tone="bg-blue-50 text-blue-800" />
        <SummaryCard label="Background" value={summary.background} icon={Monitor} tone="bg-slate-100 text-slate-700" />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Current user sessions</h3>
        <span className="text-xs text-slate-500">{summary.modules} active pages</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-3">User</th>
              <th className="px-3 py-3">Current page</th>
              <th className="px-3 py-3">Working station</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Last interaction</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(snapshot?.sessions || []).map((session) => (
              <tr key={session.sessionKey} className="hover:bg-slate-50">
                <td className="px-3 py-3">
                  <p className="font-semibold text-slate-800">{session.name}</p>
                  <p className="text-[11px] text-slate-500">ID {session.userId} · {session.role}</p>
                </td>
                <td className="px-3 py-3">
                  <p className="font-medium text-slate-700">{session.page}</p>
                  <p className="max-w-[260px] truncate text-[11px] text-slate-400">{session.path}</p>
                </td>
                <td className="px-3 py-3 text-slate-600">{session.workingStation || "—"}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${STATUS_STYLES[session.status] || STATUS_STYLES.background}`}>
                    {STATUS_LABELS[session.status] || session.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-xs text-slate-500">{formatTime(session.lastInteractionAt)}</td>
              </tr>
            ))}
            {(!snapshot?.sessions || snapshot.sessions.length === 0) && (
              <tr>
                <td colSpan="5" className="px-3 py-8 text-center text-sm text-slate-400">
                  {loading ? "Connecting to live activity…" : "No active user sessions yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">
        Each open application tab is tracked separately. A session expires after 90 seconds without a heartbeat.
      </p>
    </section>
  );
}
