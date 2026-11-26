import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  RefreshCw,
  Server,
  Wifi,
  ChartNoAxesCombined,
  Clock3,
  Boxes,
  Zap,
} from "lucide-react";
import { useSocket } from "../../hooks/socketProvider/SocketContext";

const HISTORY_LIMIT = 180;

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return bytes + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return value.toFixed(1) + " " + units[unit];
};

const formatUptime = (seconds = 0) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return [days ? days + "d" : null, hours ? hours + "h" : null, minutes + "m"]
    .filter(Boolean)
    .join(" ");
};

const formatTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

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
        <span className={"rounded-xl p-2 " + (tones[tone] || tones.slate)}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Progress({ label, value, detail, color = "bg-blue-600" }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-right tabular-nums text-slate-500">{detail}</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(safeValue)}
      >
        <div
          className={"h-full rounded-full transition-all duration-500 " + color}
          style={{ width: safeValue + "%" }}
        />
      </div>
    </div>
  );
}

const CHART_METRICS = {
  cpu: {
    label: "Process CPU",
    unit: "%",
    color: "#2563eb",
    getValue: (point) => point.cpu,
    format: (value) => value.toFixed(1) + "%",
    max: () => 100,
  },
  memory: {
    label: "Process RAM (RSS)",
    unit: "MB",
    color: "#7c3aed",
    getValue: (point) => point.memoryMb,
    format: (value) => value.toFixed(1) + " MB",
    max: (values) => Math.max(64, Math.ceil(Math.max(...values, 64) / 64) * 64),
  },
  latency: {
    label: "DB round-trip",
    unit: "ms",
    color: "#0d9488",
    getValue: (point) => point.dbLatencyMs,
    format: (value) => value.toFixed(1) + " ms",
    max: (values) => Math.max(100, Math.ceil(Math.max(...values, 100) / 100) * 100),
  },
  eventLoop: {
    label: "Event loop p95",
    unit: "ms",
    color: "#d97706",
    getValue: (point) => point.eventLoopP95Ms,
    format: (value) => value.toFixed(1) + " ms",
    max: (values) => Math.max(20, Math.ceil(Math.max(...values, 20) / 20) * 20),
  },
};

function InteractiveChart({ history }) {
  const [metricKey, setMetricKey] = useState("cpu");
  const [range, setRange] = useState(5);
  const [hoverIndex, setHoverIndex] = useState(null);

  const metric = CHART_METRICS[metricKey];
  const visibleHistory = useMemo(() => {
    const sampleCount = (range * 60) / 5;
    return history.slice(-sampleCount);
  }, [history, range]);

  const values = visibleHistory
    .map(metric.getValue)
    .filter((value) => Number.isFinite(value));
  const maxValue = metric.max(values.length ? values : [0]);
  const width = 900;
  const height = 270;
  const left = 54;
  const right = 18;
  const top = 20;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const plotted = visibleHistory.map((point, index) => {
    const value = metric.getValue(point);
    return {
      ...point,
      value,
      x: left + (visibleHistory.length <= 1 ? plotWidth : (index / (visibleHistory.length - 1)) * plotWidth),
      y: top + plotHeight - ((Number.isFinite(value) ? value : 0) / maxValue) * plotHeight,
    };
  });

  const path = plotted
    .map((point, index) => (index === 0 ? "M " : "L ") + point.x.toFixed(1) + " " + point.y.toFixed(1))
    .join(" ");

  const selectedPoint = hoverIndex == null ? null : plotted[hoverIndex];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <ChartNoAxesCombined size={19} className="text-slate-500" />
          <div>
            <h2 className="font-semibold text-slate-900">Live performance trends</h2>
            <p className="mt-0.5 text-xs text-slate-500">Hover or tap a point to inspect a sample</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {[1, 5, 15].map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => {
                setRange(minutes);
                setHoverIndex(null);
              }}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
                (range === minutes ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")
              }
            >
              {minutes}m
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(CHART_METRICS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMetricKey(key);
              setHoverIndex(null);
            }}
            className={
              "rounded-lg border px-3 py-2 text-xs font-semibold transition " +
              (metricKey === key
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="relative mt-5">
        {selectedPoint && (
          <div className="absolute right-2 top-0 z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
            <p className="font-semibold text-slate-800">{metric.format(selectedPoint.value)}</p>
            <p className="mt-0.5 text-slate-500">{formatTime(selectedPoint.time)}</p>
          </div>
        )}
        <div className="overflow-hidden">
          <svg
            viewBox={"0 0 " + width + " " + height}
            className="h-auto w-full"
            role="img"
            aria-label={metric.label + " history chart"}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = top + plotHeight * fraction;
              const tickValue = maxValue * (1 - fraction);
              return (
                <g key={fraction}>
                  <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />
                  <text x={left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
                    {tickValue.toFixed(metricKey === "cpu" ? 0 : 1)}
                  </text>
                </g>
              );
            })}
            {plotted.length > 1 && (
              <path
                d={path + " L " + plotted[plotted.length - 1].x + " " + (top + plotHeight) + " L " + plotted[0].x + " " + (top + plotHeight) + " Z"}
                fill={metric.color}
                opacity="0.08"
              />
            )}
            {plotted.length > 1 && (
              <path d={path} fill="none" stroke={metric.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            )}
            {plotted.map((point, index) => (
              <circle
                key={point.time + index}
                cx={point.x}
                cy={point.y}
                r={hoverIndex === index ? 6 : plotted.length < 30 ? 3.5 : 2.5}
                fill={metric.color}
                stroke="white"
                strokeWidth="2"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
                onClick={() => setHoverIndex(index)}
              >
                <title>{metric.format(point.value)} · {formatTime(point.time)}</title>
              </circle>
            ))}
            {plotted.length === 0 && (
              <text x={width / 2} y={height / 2} textAnchor="middle" fill="#94a3b8" fontSize="13">
                Waiting for samples…
              </text>
            )}
            <text x={left} y={height - 8} fontSize="11" fill="#94a3b8">
              {plotted[0] ? formatTime(plotted[0].time) : "—"}
            </text>
            <text x={width - right} y={height - 8} textAnchor="end" fontSize="11" fill="#94a3b8">
              {plotted.length ? formatTime(plotted[plotted.length - 1].time) : "—"}
            </text>
          </svg>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
        <span>{visibleHistory.length} samples · 5-second sampling</span>
        <span>Scale: {maxValue.toFixed(metricKey === "cpu" ? 0 : 1)} {metric.unit}</span>
      </div>
    </section>
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
      setHistory((previous) => [
        ...previous.slice(-(HISTORY_LIMIT - 1)),
        {
          time: data.timestamp,
          cpu: Number(data.server?.processCpuPercent ?? 0),
          memoryMb: Number(data.server?.processMemoryBytes ?? 0) / (1024 * 1024),
          dbLatencyMs: data.database?.latencyMs == null ? null : Number(data.database.latencyMs),
          eventLoopP95Ms: Number(data.server?.eventLoopDelayMs?.p95 ?? 0),
        },
      ]);
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
  const redis = snapshot?.redis;
  const memoryPercent = useMemo(() => {
    if (!server?.heapTotalBytes) return 0;
    return (server.heapUsedBytes / server.heapTotalBytes) * 100;
  }, [server?.heapUsedBytes, server?.heapTotalBytes]);

  const cpuPercent = Math.max(0, Math.min(100, Number(server?.processCpuPercent) || 0));
  const latencyPercent = Math.max(0, Math.min(100, ((Number(db?.latencyMs) || 0) / 500) * 100));

  return (
    <main className="min-h-full bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-slate-900 p-3 text-white"><Activity size={22} /></span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">System Monitor</h1>
              <p className="mt-1 text-sm text-slate-500">Live SM ERP server and database activity</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm">
            <span className={"h-2.5 w-2.5 rounded-full " + (connected ? "bg-emerald-500" : "bg-rose-500")} />
            <span className="font-medium text-slate-700">{connected ? "Live connection" : "Socket disconnected"}</span>
            <RefreshCw size={14} className={connected ? "text-emerald-600" : "text-slate-400"} />
          </div>
        </header>

        {!snapshot && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <RefreshCw className="mx-auto animate-spin text-slate-400" size={24} />
            <p className="mt-3 font-semibold text-slate-700">
              {connected ? "Waiting for live metrics…" : "Waiting for server connection…"}
            </p>
            <p className="mt-1 text-sm text-slate-500">Metrics are sampled by the backend every 5 seconds.</p>
          </div>
        )}

        {snapshot && (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Process CPU" value={cpuPercent.toFixed(1) + "%"} detail={"Normalized across " + server.cpuCores + " CPU cores"} icon={Cpu} tone="blue" />
              <MetricCard title="Process RAM (RSS)" value={formatBytes(server.processMemoryBytes)} detail={"Heap used " + formatBytes(server.heapUsedBytes)} icon={HardDrive} tone="violet" />
              <MetricCard title="Active HTTP requests" value={requests.active.toLocaleString()} detail={requests.totalAllowed.toLocaleString() + " completed · " + (requests.requestsPerSecond ?? 0).toFixed(2) + " req/s · " + requests.totalBlocked.toLocaleString() + " blocked"} icon={Activity} tone="amber" />
              <MetricCard title="Socket connections" value={sockets.connected.toLocaleString()} detail="Connected Socket.IO clients on this instance" icon={Wifi} tone="emerald" />
              <MetricCard title="Process uptime" value={formatUptime(server.processUptimeSeconds)} detail={"Started " + new Date(server.processStartedAt).toLocaleString()} icon={Clock3} tone="blue" />
              <MetricCard title="Redis latency" value={redis?.latencyMs == null ? "—" : redis.latencyMs.toFixed(1) + " ms"} detail={redis?.status === "connected" ? "Redis PING + INFO round-trip" : "Redis " + (redis?.status || "not sampled")} icon={Boxes} tone="violet" />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2"><Gauge size={18} className="text-slate-500" /><h2 className="font-semibold text-slate-900">Operational health checks</h2></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { label: "Process CPU", ok: cpuPercent < 80, value: cpuPercent.toFixed(1) + "%", warning: "Sustained CPU above 80%" },
                  { label: "Node heap", ok: memoryPercent < 90, value: memoryPercent.toFixed(1) + "%", warning: "Heap above 90% of current allocation" },
                  { label: "Event loop p95", ok: (server.eventLoopDelayMs?.p95 ?? 0) < 100, value: (server.eventLoopDelayMs?.p95 ?? 0).toFixed(1) + " ms", warning: "Event loop delay above 100 ms" },
                  { label: "Database round-trip", ok: db.latencyMs != null && db.latencyMs < 500, value: db.latencyMs == null ? "Unavailable" : db.latencyMs.toFixed(1) + " ms", warning: "Database latency above 500 ms or unavailable" },
                  { label: "Redis", ok: redis?.status === "connected", value: redis?.status || "Not sampled", warning: "Redis connection or telemetry unavailable" },
                  { label: "Blocked requests", ok: requests.totalBlocked === 0, value: requests.totalBlocked.toLocaleString(), warning: "Rate-limited requests observed" },
                ].map((check) => (
                  <div key={check.label} className={"flex items-center justify-between gap-3 rounded-xl border px-3 py-3 " + (check.ok ? "border-emerald-100 bg-emerald-50/60" : "border-amber-200 bg-amber-50")}>
                    <div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{check.label}</p><p className="truncate text-xs text-slate-500">{check.ok ? "Within configured watch threshold" : check.warning}</p></div>
                    <span className={"shrink-0 text-sm font-bold tabular-nums " + (check.ok ? "text-emerald-700" : "text-amber-700")}>{check.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">These are initial operational warning thresholds, not vendor limits or a formal SLA. Investigate sustained breaches rather than reacting to one sample.</p>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-2">
                  <Server size={18} className="text-slate-500" />
                  <h2 className="font-semibold text-slate-900">Application process</h2>
                  <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Online</span>
                </div>
                <div className="space-y-5">
                  <Progress label="Process CPU" value={cpuPercent} detail={cpuPercent.toFixed(1) + "%"} color="bg-blue-600" />
                  <Progress label="Node heap usage" value={memoryPercent} detail={memoryPercent.toFixed(1) + "% · " + formatBytes(server.heapUsedBytes) + " / " + formatBytes(server.heapTotalBytes)} color="bg-violet-600" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Process uptime</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatUptime(server.processUptimeSeconds)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">OS host uptime</p><p className="mt-1 text-lg font-semibold text-slate-900">{formatUptime(server.hostUptimeSeconds)}</p></div>
                    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Node runtime</p><p className="mt-1 text-lg font-semibold text-slate-900">{server.nodeVersion}</p></div>
                    <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Hostname / architecture</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{server.hostname} · {server.architecture}</p></div>
                    <div className="col-span-2 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Deployment</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{server.deployment?.provider || "Unknown"} · {server.deployment?.gitCommit ? server.deployment.gitCommit.slice(0, 8) : "commit unavailable"} · Instance {server.deployment?.instanceId || "—"}</p></div>
                  </div>
                  <div className="space-y-3 rounded-xl bg-slate-50 p-4">
                    <Progress label="Event loop p95 delay" value={Math.min(100, (server.eventLoopDelayMs?.p95 || 0) / 100 * 100)} detail={(server.eventLoopDelayMs?.p95 ?? 0).toFixed(2) + " ms"} color="bg-amber-500" />
                    <p className="text-xs text-slate-500">Load average (1 / 5 / 15 min): {(server.loadAverage?.oneMinute ?? 0).toFixed(2)} / {(server.loadAverage?.fiveMinutes ?? 0).toFixed(2)} / {(server.loadAverage?.fifteenMinutes ?? 0).toFixed(2)} · External memory {formatBytes(server.externalMemoryBytes)}</p>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">CPU and RAM values describe this Node.js process, not total Render host utilization. Process uptime is the current backend process lifetime; OS uptime is the underlying host kernel uptime and is not a Render service SLA. RSS is shown as a trend; heap usage is shown as a percentage of the current V8 heap allocation.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-2">
                  <Database size={18} className="text-slate-500" />
                  <h2 className="font-semibold text-slate-900">Neon PostgreSQL</h2>
                  <span className={"ml-auto rounded-full px-2.5 py-1 text-xs font-semibold " + (db.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                    {db.status === "connected" ? "Reachable" : "Unavailable"}
                  </span>
                </div>
                <div className="mb-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">DB round-trip</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.latencyMs == null ? "—" : db.latencyMs + " ms"}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Active sessions</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.activeSessions == null ? "—" : db.activeSessions}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Idle sessions</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.idleSessions == null ? "—" : db.idleSessions}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Visible sessions</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.totalSessions == null ? "—" : db.totalSessions}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Waiting sessions</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.waitingSessions ?? "—"}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Longest active query</p><p className="mt-1 text-2xl font-bold text-slate-900">{db.longestActiveQuerySeconds == null ? "—" : db.longestActiveQuerySeconds.toFixed(1) + " s"}</p></div>
                </div>
                <Progress label="DB latency" value={latencyPercent} detail={db.latencyMs == null ? "Unavailable" : db.latencyMs.toFixed(1) + " ms · 500 ms visual scale"} color={latencyPercent >= 80 ? "bg-rose-500" : latencyPercent >= 50 ? "bg-amber-500" : "bg-teal-600"} />
                <p className="mt-4 text-xs leading-relaxed text-slate-500">Session counts come from pg_stat_activity and may be limited by the database role's permissions. They are not Neon compute utilization. The latency bar is a visual reference, not a database capacity limit.</p>
              </div>
            </section>


            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <Boxes size={19} className="text-slate-500" />
                <div>
                  <h2 className="font-semibold text-slate-900">Redis cache & queue telemetry</h2>
                  <p className="text-xs text-slate-500">Using the backend's existing ioredis connection · sampled every 15 seconds</p>
                </div>
                <span className={"ml-auto rounded-full px-2.5 py-1 text-xs font-semibold " + (redis?.status === "connected" ? "bg-emerald-50 text-emerald-700" : redis?.status === "connecting" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700")}>
                  {redis?.status === "connected" ? "Connected" : redis?.status === "connecting" ? "Connecting" : redis?.status === "error" ? "Telemetry error" : "Unavailable"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Redis uptime</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.uptimeSeconds == null ? "—" : formatUptime(redis.uptimeSeconds)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Connected clients</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.connectedClients ?? "—"}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Used memory</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.usedMemoryBytes == null ? "—" : formatBytes(redis.usedMemoryBytes)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Peak memory</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.usedMemoryPeakBytes == null ? "—" : formatBytes(redis.usedMemoryPeakBytes)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Commands processed</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.totalCommandsProcessed == null ? "—" : Number(redis.totalCommandsProcessed).toLocaleString()}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Operations / sec</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.instantaneousOpsPerSecond ?? "—"}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Total connections</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.totalConnectionsReceived == null ? "—" : Number(redis.totalConnectionsReceived).toLocaleString()}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Redis round-trip</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.latencyMs == null ? "—" : redis.latencyMs.toFixed(2) + " ms"}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Cache hit ratio</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.keyspaceHitRatePercent == null ? "—" : redis.keyspaceHitRatePercent + "%"}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Evicted keys</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.evictedKeys == null ? "—" : Number(redis.evictedKeys).toLocaleString()}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Redis max memory</p><p className="mt-1 text-xl font-bold text-slate-900">{redis?.maxMemoryBytes == null || redis.maxMemoryBytes === 0 ? "Unlimited / not set" : formatBytes(redis.maxMemoryBytes)}</p></div>
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-700">Redis keyspace</p>
                {redis?.keyspace && Object.keys(redis.keyspace).length ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(redis.keyspace).map(([dbName, value]) => (
                      <span key={dbName} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                        <strong>{dbName}</strong> · {value.keys ?? "—"} keys · {value.expires ?? "—"} expiring
                      </span>
                    ))}
                  </div>
                ) : <p className="text-xs text-slate-500">No keyspace entries reported, or Redis telemetry is unavailable.</p>}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">Redis INFO statistics are server-wide for the Redis instance, not only this ERP process. Key names, values, credentials and cached payloads are never exposed here.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><Zap size={18} className="text-slate-500" /><h2 className="font-semibold text-slate-900">Slowest API routes (rolling sample)</h2></div>
              {requests.routes?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-2 pr-4">Route</th><th className="py-2 pr-4">Requests</th><th className="py-2 pr-4">Average</th><th className="py-2 pr-4">P95</th><th className="py-2">Max</th></tr></thead>
                    <tbody>{requests.routes.map((route) => (
                      <tr key={route.route} className="border-b border-slate-100 last:border-0">
                        <td className="max-w-[360px] truncate py-3 pr-4 font-mono text-xs text-slate-700">{route.route}</td>
                        <td className="py-3 pr-4 tabular-nums">{route.count.toLocaleString()}</td>
                        <td className="py-3 pr-4 tabular-nums">{route.averageDurationMs.toFixed(1)} ms</td>
                        <td className="py-3 pr-4 tabular-nums font-semibold">{route.p95DurationMs.toFixed(1)} ms</td>
                        <td className="py-3 tabular-nums">{route.maxDurationMs.toFixed(1)} ms</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">Waiting for completed API requests to build route latency samples.</p>}
              <p className="mt-3 text-xs text-slate-500">P95 uses the latest 200 successful responses per route, held in process memory. Restarting the backend resets these counters; this is not long-term analytics.</p>
            </section>

            <InteractiveChart history={history} />
            <p className="text-right text-xs text-slate-400">Last update: {new Date(snapshot.timestamp).toLocaleTimeString()}</p>
          </>
        )}
      </div>
    </main>
  );
}
