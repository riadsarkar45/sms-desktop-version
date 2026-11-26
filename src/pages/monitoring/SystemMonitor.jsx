import { useEffect, useMemo, useState } from "react";
import { Activity, Cpu, Database, Gauge, HardDrive, RefreshCw, Server, Wifi } from "lucide-react";
import { useSocket } from "../../hooks/socketProvider/SocketContext";

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

const formatUptime = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? `${days}d` : null, hours ? `${hours}h` : null, `${minutes}m`].filter(Boolean).join(" ");
};

function MetricCard({ title, value, detail, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-700",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <span className={`rounded-xl p-2 ${tones[tone] || tones.slate}`}><Icon size={18} /></span>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Progress({ label, value, detail }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">{detail}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

export default function SystemMonitor() {
  const socket = useSocket();
  const [snapshot, setSnapshot] = useState(null);
  const [connected, setConnected] = useState(Boolean(socket.connected));
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const subscribe = () => {
      setConnected(true);
      socket.emit("monitoring:subscribe");
    };
    const onDisconnect = () => setConnected(false);
    const onMetrics = (data) => {
      setSnapshot(data);
      setHistory(previous => [...previous.slice(-23), {
        time: data.timestamp,
        cpu: data.server?.processCpuPercent ?? 0,
        memory: data.server?.processMemoryBytes ?? 0,
      }]);
    };

    socket.on("connect", subscribe);
    socket.on("disconnect", onDisconnect);
    socket.on("system:metrics", onMetrics);
    if (socket.connected) subscribe();

    return () => {
      socket.emit("monitoring:unsubscribe");
      socket.off("connect", subscribe);
      socket.off("disconnect", onDisconnect);
      socket.off("system:metrics", onMetrics);
    };
  }, [socket]);

  const server = snapshot?.server;
  const db = snapshot?.database;
  const requests = snapshot?.requests;
  const sockets = snapshot?.sockets;
  const memoryPercent = useMemo(() => {
    if (!server?.heapTotalBytes) return 0;
    return (server.heapUsedBytes / server.heapTotalBytes) * 100;
  }, [server?.heapUsedBytes, server?.heapTotalBytes]);

  return (
    <main className="min-h-full bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-slate-900 p-3 text-white"><Activity size={22} /></span>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">System Monitor</h1>
                <p className="mt-1 text-sm text-slate-500">Live SM ERP server and database activity</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-rose-500"}`} />
            <span className="font-medium text-slate-700">{connected ? "Live connection" : "Socket disconnected"}</span>
            <RefreshCw size={14} className={connected ? "text-emerald-600" : "text-slate-400"} />
          </div>
        </header>

        {!snapshot && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <RefreshCw className="mx-auto animate-spin text-slate-400" size={24} />
            <p className="mt-3 font-semibold text-slate-700">{connected ? "Waiting for live metrics…" : "Waiting for server connection…"}</p>
            <p className="mt-1 text-sm text-slate-500">Metrics are sampled by the backend every 5 seconds.</p>
          </div>
        )}

        {snapshot && (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Process CPU" value={`${server.processCpuPercent}%`} detail={`Normalized across ${server.cpuCores} CPU cores`} icon={Cpu} tone="blue" />
              <MetricCard title="Process RAM (RSS)" value={formatBytes(server.processMemoryBytes)} detail={`Heap used ${formatBytes(server.heapUsedBytes)}`} icon={HardDrive} tone="violet" />
              <MetricCard title="Active HTTP requests" value={requests.active.toLocaleString()} detail={`${requests.totalAllowed.toLocaleString()} completed · ${requests.totalBlocked.toLocaleString()} blocked`} icon={Activity} tone="amber" />
              <MetricCard title="Socket connections" value={sockets.connected.toLocaleString()} detail="Connected Socket.IO clients on this instance" icon={Wifi} tone="emerald" />
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-2">
                  <Server size={18} className="text-slate-500" />
                  <h2 className="font-semibold text-slate-900">Application process</h2>
                  <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Online</span>
                </div>
                <div className="space-y-5">
                  <Progress label="Node heap usage" value={memoryPercent} detail={`${memoryPercent.toFixed(1)}% · ${formatBytes(server.heapUsedBytes)} / ${formatBytes(server.heapTotalBytes)}`} />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Process uptime</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatUptime(server.uptimeSeconds)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Node runtime</p><p className="mt-1 text-lg font-semibold text-slate-900">{server.nodeVersion}</p></div>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">CPU and RAM values describe this Node.js process, not total Render host utilization.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-2">
                  <Database size={18} className="text-slate-500" />
                  <h2 className="font-semibold text-slate-900">Neon PostgreSQL</h2>
                  <span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-semibold ${db.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{db.status === "connected" ? "Reachable" : "Unavailable"}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">DB round-trip</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.latencyMs == null ? "—" : `${db.latencyMs} ms`}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Active sessions</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.activeSessions == null ? "—" : db.activeSessions}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Idle sessions</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.idleSessions == null ? "—" : db.idleSessions}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Visible sessions</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.totalSessions == null ? "—" : db.totalSessions}</p></div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">Session counts come from pg_stat_activity and may be limited by the database role's permissions. They are not Neon compute utilization.</p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><Gauge size={18} className="text-slate-500" /><h2 className="font-semibold text-slate-900">Recent process CPU samples</h2></div>
                <span className="text-xs text-slate-400">Last {history.length} samples · 5 sec interval</span>
              </div>
              <div className="flex h-28 items-end gap-1.5">
                {history.map((point, index) => (
                  <div key={point.time + index} className="group relative flex h-full flex-1 items-end">
                    <div title={`${point.cpu}%`} className="w-full rounded-t-md bg-blue-500/80 transition-all" style={{ height: `${Math.max(3, Math.min(100, point.cpu))}%` }} />
                  </div>
                ))}
                {!history.length && <p className="m-auto text-sm text-slate-400">Collecting samples…</p>}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>Oldest</span><span>Latest</span></div>
            </section>
            <p className="text-right text-xs text-slate-400">Last update: {new Date(snapshot.timestamp).toLocaleTimeString()}</p>
          </>
        )}
      </div>
    </main>
  );
}
