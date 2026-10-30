import {  useEffect, useMemo, useState } from "react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";
import UseUserRoles from "../../hooks/all-users/UseUserRoles";
import DashboardLayout from '../../components/DashboardLayout';   
import TotalSummary from "../../components/DashboardSummary";
const AVATAR_STYLES = [
    "bg-blue-50 text-blue-700",
    "bg-emerald-50 text-emerald-700",
    "bg-orange-50 text-orange-700",
    "bg-violet-50 text-violet-700",
    "bg-amber-50 text-amber-700",
];

const DELIVERY_TYPES = {
    knittingOrder: ["Yarn Delivery", "Yarn Return", "Grey Fabric Received"],
    dyeingOrder: [
        "Grey Received", "Grey Delivery", "Grey Return",
        "Sent For Compacting", "Received From Compacting",
        "Sent For Reprocess", "Received From Reprocess",
        "Finish Received", "Finish Return",
    ],
    aopOrder: ["Sent For Aop", "Return From Aop", "Received From Aop", "AOP Finish Fabric Rcvd"],
    yarnDyeingOrder: [
        "Yarn Delivery For Yarn Dye", "Yarn Return From Yarn Dye",
        "Yarn Received From Yarn Dye",
    ],
};

const ORDER_LABELS = {
    knittingOrder: "Knitting",
    dyeingOrder: "Dyeing",
    aopOrder: "AOP",
    yarnDyeingOrder: "Yarn Dyeing",
};

const CATEGORY_STYLES = {
    sent: { rgb: "55, 138, 221", dot: "#378ADD", label: "Delivery / Sent" },
    received: { rgb: "29, 158, 117", dot: "#1D9E75", label: "Received" },
    return: { rgb: "216, 90, 48", dot: "#D85A30", label: "Return" },
};

const CATEGORY_OF = {
    "Yarn Delivery": "sent", "Yarn Return": "return", "Grey Fabric Received": "received",
    "Grey Received": "received", "Grey Delivery": "sent", "Grey Return": "return",
    "Sent For Compacting": "sent", "Received From Compacting": "received",
    "Sent For Reprocess": "sent", "Received From Reprocess": "received",
    "Finish Received": "received", "Finish Return": "return",
    "Sent For Aop": "sent", "Return From Aop": "return",
    "Received From Aop": "received", "AOP Finish Fabric Rcvd": "received",
    "Yarn Delivery For Yarn Dye": "sent", "Yarn Return From Yarn Dye": "return",
    "Yarn Received From Yarn Dye": "received",
};

const guessCategory = (name = "") => {
    const n = name.toLowerCase();
    if (n.includes("return")) return "return";
    if (n.includes("receiv") || n.includes("rcvd")) return "received";
    return "sent";
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const BDT_OFFSET = 6;
const hourOf = (iso) => (new Date(iso).getUTCHours() + BDT_OFFSET) % 24;
const todayBST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

const fmtHour = (h) => {
    const period = h < 12 ? "AM" : "PM";
    const hr = h % 12 === 0 ? 12 : h % 12;
    return `${hr} ${period}`;
};

const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, {
        weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

const initials = (name = "") =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

const heatColor = (value, max) => {
    if (!value) return "#F1F5F9";
    const t = Math.sqrt(value / max);
    return `rgba(55, 138, 221, ${0.15 + 0.85 * t})`;
};

/* -------------------------------------------------------------------------- */
/*  COMPONENTS                                                                */
/* -------------------------------------------------------------------------- */

const HourlyBookingBoard = ({ payload, loading }) => {
    const rows = payload?.data ?? [];

    const { users, grandTotal, peakHour, maxCell } = useMemo(() => {
        const map = new Map();
        const hourTotals = Array(24).fill(0);

        rows.forEach((r) => {
            const h = hourOf(r.hour);
            const u = map.get(r.userId) ?? {
                userId: r.userId,
                userName: r.userName,
                hours: Array(24).fill(0),
                total: 0,
                peakHour: null,
                peakCount: 0,
                hourBreakdown: new Map() // Tracks orderType breakdown per hour
            };

            // Safely handle both 'bookingCount' and 'workOrderCount' field names
            const count = Number(r.bookingCount ?? r.workOrderCount ?? 0);

            u.hours[h] += count;
            u.total += count;
            hourTotals[h] += count;

            if (count > u.peakCount) {
                u.peakCount = count;
                u.peakHour = h;
            }

            if (!u.hourBreakdown.has(h)) {
                u.hourBreakdown.set(h, new Map());
            }
            const otMap = u.hourBreakdown.get(h);
            // Fallback to "General Booking" if orderType is an empty string or missing
            const ot = r.orderType || "General Booking";
            otMap.set(ot, (otMap.get(ot) || 0) + count);

            map.set(r.userId, u);
        });

        const users = [...map.values()].sort((a, b) => b.total - a.total);
        return {
            users,
            grandTotal: users.reduce((s, u) => s + u.total, 0),
            peakHour: hourTotals.indexOf(Math.max(...hourTotals)),
            maxCell: Math.max(1, ...users.flatMap((u) => u.hours)),
        };
    }, [rows]);

    if (loading) return <div className="mt-6 h-44 rounded-xl bg-slate-100 animate-pulse" />;

    if (!rows.length)
        return (
            <div className="mt-6 bg-white border border-slate-100 rounded-xl p-5">
                <p className="text-sm font-medium text-slate-700 mb-4">Hourly booking activity</p>
                <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
            </div>
        );

    return (
        <div className="mt-6 bg-white border border-slate-100 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <p className="text-sm font-medium text-slate-700">Hourly booking activity</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {payload?.date ? fmtDate(payload.date) : ""} · granularity: {payload.granularity} · BST (UTC+6)
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Total: <b className="text-slate-800 tabular-nums">{grandTotal.toLocaleString()}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Peak hour: <b className="text-blue-700 tabular-nums">{fmtHour(peakHour)}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Users: <b className="text-slate-800 tabular-nums">{users.length}</b>
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {users.map((u, idx) => {
                    const getTooltip = (h) => {
                        const breakdown = u.hourBreakdown.get(h);
                        if (!breakdown || breakdown.size === 0) return `${u.userName} · ${fmtHour(h)} → 0 bookings`;

                        let text = `${u.userName} · ${fmtHour(h)}\n`;
                        let total = 0;
                        breakdown.forEach((count, ot) => {
                            const label = ORDER_LABELS[ot] || ot;
                            text += `• ${label}: ${count.toLocaleString()}\n`;
                            total += count;
                        });
                        text += `Total: ${total.toLocaleString()} bookings`;
                        return text;
                    };

                    return (
                        <div key={u.userId} className="flex items-center gap-4">
                            <div className="flex w-44 shrink-0 items-center gap-3">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                                    {initials(u.userName)}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-700">{u.userName}</p>
                                    <p className="text-[11px] text-slate-400">peak {u.peakHour != null ? fmtHour(u.peakHour) : "—"}</p>
                                </div>
                            </div>

                            <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                                {u.hours.map((v, h) => (
                                    <div
                                        key={h}
                                        title={getTooltip(h)}
                                        className="h-8 rounded-md cursor-default transition-shadow hover:ring-2 hover:ring-blue-300"
                                        style={{ background: heatColor(v, maxCell) }}
                                    />
                                ))}
                            </div>

                            <div className="w-28 shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums text-slate-800">{u.total.toLocaleString()}</p>
                                <p className="text-[11px] text-slate-400 -mt-0.5">bookings</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-2 flex items-center gap-4">
                <div className="w-44 shrink-0" />
                <div className="grid flex-1 text-[10px] text-slate-400" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                    {HOURS.map((h) => (
                        <span key={h} className={[0, 6, 12, 18, 23].includes(h) ? "whitespace-nowrap" : "opacity-0"}>
                            {fmtHour(h)}
                        </span>
                    ))}
                </div>
                <div className="w-28 shrink-0" />
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-[11px] text-slate-400">Hover a cell for order type breakdown</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    Less
                    <span className="h-2 w-24 rounded-full bg-gradient-to-r from-slate-200 to-[#378ADD]" />
                    More
                </div>
            </div>
        </div>
    );
};

const HourlyWorkOrderBoard = ({ payload, loading }) => {
    const rows = payload?.data ?? [];

    const { users, grandTotal, peakHour, maxCell } = useMemo(() => {
        const map = new Map();
        const hourTotals = Array(24).fill(0);

        rows.forEach((r) => {
            const h = hourOf(r.hour);
            const u = map.get(r.userId) ?? {
                userId: r.userId,
                userName: r.userName,
                hours: Array(24).fill(0),
                total: 0,
                peakHour: null,
                peakCount: 0,
                hourBreakdown: new Map()
            };

            const count = Number(r.workOrderCount ?? 0);
            u.hours[h] += count;
            u.total += count;
            hourTotals[h] += count;

            if (count > u.peakCount) {
                u.peakCount = count;
                u.peakHour = h;
            }

            if (!u.hourBreakdown.has(h)) {
                u.hourBreakdown.set(h, new Map());
            }
            const otMap = u.hourBreakdown.get(h);
            const ot = r.orderType || "Unknown";
            otMap.set(ot, (otMap.get(ot) || 0) + count);

            map.set(r.userId, u);
        });

        const users = [...map.values()].sort((a, b) => b.total - a.total);
        return {
            users,
            grandTotal: users.reduce((s, u) => s + u.total, 0),
            peakHour: hourTotals.indexOf(Math.max(...hourTotals)),
            maxCell: Math.max(1, ...users.flatMap((u) => u.hours)),
        };
    }, [rows]);

    if (loading) return <div className="mt-6 h-44 rounded-xl bg-slate-100 animate-pulse" />;

    if (!rows.length)
        return (
            <div className="mt-6 bg-white border border-slate-100 rounded-xl p-5">
                <p className="text-sm font-medium text-slate-700 mb-4">Hourly work order activity</p>
                <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
            </div>
        );

    return (
        <div className="mt-6 bg-white border border-slate-100 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <p className="text-sm font-medium text-slate-700">Hourly work order activity</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {payload?.date ? fmtDate(payload.date) : ""} · granularity: {payload.granularity} · BST (UTC+6)
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Total: <b className="text-slate-800 tabular-nums">{grandTotal.toLocaleString()}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Peak hour: <b className="text-blue-700 tabular-nums">{fmtHour(peakHour)}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Users: <b className="text-slate-800 tabular-nums">{users.length}</b>
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {users.map((u, idx) => {
                    const getTooltip = (h) => {
                        const breakdown = u.hourBreakdown.get(h);
                        if (!breakdown || breakdown.size === 0) return `${u.userName} · ${fmtHour(h)} → 0 work orders`;

                        let text = `${u.userName} · ${fmtHour(h)}\n`;
                        let total = 0;
                        breakdown.forEach((count, ot) => {
                            const label = ORDER_LABELS[ot] || ot;
                            text += `• ${label}: ${count.toLocaleString()}\n`;
                            total += count;
                        });
                        text += `Total: ${total.toLocaleString()} work orders`;
                        return text;
                    };

                    return (
                        <div key={u.userId} className="flex items-center gap-4">
                            <div className="flex w-44 shrink-0 items-center gap-3">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                                    {initials(u.userName)}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-700">{u.userName}</p>
                                    <p className="text-[11px] text-slate-400">peak {u.peakHour != null ? fmtHour(u.peakHour) : "—"}</p>
                                </div>
                            </div>

                            <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                                {u.hours.map((v, h) => (
                                    <div
                                        key={h}
                                        title={getTooltip(h)}
                                        className="h-8 rounded-md cursor-default transition-shadow hover:ring-2 hover:ring-blue-300"
                                        style={{ background: heatColor(v, maxCell) }}
                                    />
                                ))}
                            </div>

                            <div className="w-28 shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums text-slate-800">{u.total.toLocaleString()}</p>
                                <p className="text-[11px] text-slate-400 -mt-0.5">work orders</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-2 flex items-center gap-4">
                <div className="w-44 shrink-0" />
                <div className="grid flex-1 text-[10px] text-slate-400" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                    {HOURS.map((h) => (
                        <span key={h} className={[0, 6, 12, 18, 23].includes(h) ? "whitespace-nowrap" : "opacity-0"}>
                            {fmtHour(h)}
                        </span>
                    ))}
                </div>
                <div className="w-28 shrink-0" />
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-[11px] text-slate-400">Hover a cell for order type breakdown</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    Less
                    <span className="h-2 w-24 rounded-full bg-gradient-to-r from-slate-200 to-[#378ADD]" />
                    More
                </div>
            </div>
        </div>
    );
};

const HourlyChallanBoard = ({ payload, loading }) => {
    const rows = payload?.data ?? [];

    const { users, grandTotal, peakHour, maxCell } = useMemo(() => {
        const map = new Map();
        const hourTotals = Array(24).fill(0);
        rows.forEach((r) => {
            const h = hourOf(r.hour);
            const u = map.get(r.userId) ?? {
                userId: r.userId, userName: r.userName,
                hours: Array(24).fill(0), total: 0, peakHour: null, peakCount: 0,
            };
            u.hours[h] += r.challanCount;
            u.total += r.challanCount;
            hourTotals[h] += r.challanCount;
            if (r.challanCount > u.peakCount) { u.peakCount = r.challanCount; u.peakHour = h; }
            map.set(r.userId, u);
        });
        const users = [...map.values()].sort((a, b) => b.total - a.total);
        return {
            users,
            grandTotal: users.reduce((s, u) => s + u.total, 0),
            peakHour: hourTotals.indexOf(Math.max(...hourTotals)),
            maxCell: Math.max(1, ...users.flatMap((u) => u.hours)),
        };
    }, [rows]);

    if (loading) return <div className="mt-6 h-44 rounded-xl bg-slate-100 animate-pulse" />;

    if (!rows.length)
        return (
            <div className="mt-6 bg-white border border-slate-100 rounded-xl p-5">
                <p className="text-sm font-medium text-slate-700 mb-4">Hourly challan activity</p>
                <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No data yet</div>
            </div>
        );

    return (
        <div className="mt-6 bg-white border border-slate-100 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <p className="text-sm font-medium text-slate-700">Hourly challan activity</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {payload?.date ? fmtDate(payload.date) : ""} · granularity: {payload.granularity} · BST (UTC+6)
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Total: <b className="text-slate-800 tabular-nums">{grandTotal.toLocaleString()}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Peak hour: <b className="text-blue-700 tabular-nums">{fmtHour(peakHour)}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Users: <b className="text-slate-800 tabular-nums">{users.length}</b>
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {users.map((u, idx) => (
                    <div key={u.userId} className="flex items-center gap-4">
                        <div className="flex w-44 shrink-0 items-center gap-3">
                            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${AVATAR_STYLES[idx % AVATAR_STYLES.length]}`}>
                                {initials(u.userName)}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-700">{u.userName}</p>
                                <p className="text-[11px] text-slate-400">peak {u.peakHour != null ? fmtHour(u.peakHour) : "—"}</p>
                            </div>
                        </div>

                        <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                            {u.hours.map((v, h) => (
                                <div
                                    key={h}
                                    title={`${u.userName} · ${fmtHour(h)} → ${v.toLocaleString()} challans`}
                                    className="h-8 rounded-md cursor-default transition-shadow hover:ring-2 hover:ring-blue-300"
                                    style={{ background: heatColor(v, maxCell) }}
                                />
                            ))}
                        </div>

                        <div className="w-28 shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums text-slate-800">{u.total.toLocaleString()}</p>
                            <p className="text-[11px] text-slate-400 -mt-0.5">challans</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-2 flex items-center gap-4">
                <div className="w-44 shrink-0" />
                <div className="grid flex-1 text-[10px] text-slate-400" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                    {HOURS.map((h) => (
                        <span key={h} className={[0, 6, 12, 18, 23].includes(h) ? "whitespace-nowrap" : "opacity-0"}>
                            {fmtHour(h)}
                        </span>
                    ))}
                </div>
                <div className="w-28 shrink-0" />
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-[11px] text-slate-400">Hover a cell for the exact count</p>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    Less
                    <span className="h-2 w-24 rounded-full bg-gradient-to-r from-slate-200 to-[#378ADD]" />
                    More
                </div>
            </div>
        </div>
    );
};

const DailyDeliveryBoard = ({ payload, loading, selectedDate, onDateChange }) => {
    const raw = payload?.data;
    const today = todayBST();

    const rows = useMemo(() => {
        if (Array.isArray(raw)) return raw;
        if (raw && typeof raw === "object")
            return Object.entries(raw).flatMap(([orderType, types]) =>
                Object.entries(types || {}).map(([deliveryType, quantity]) => ({ orderType, deliveryType, quantity }))
            );
        return [];
    }, [raw]);

    const { orderRows, grandTotal, totalEntries, sentTotal, receivedTotal, returnTotal, maxCell } = useMemo(() => {
        const byOrder = new Map();
        rows.forEach((r) => {
            if (!r?.orderType || !r?.deliveryType) return;
            if (!byOrder.has(r.orderType)) byOrder.set(r.orderType, new Map());
            const m = byOrder.get(r.orderType);
            const existing = m.get(r.deliveryType) || { quantity: 0, entries: 0 };
            m.set(r.deliveryType, {
                quantity: existing.quantity + (Number(r.quantity) || 0),
                entries: existing.entries + (Number(r.entries) || 0),
            });
        });

        const catTotals = { sent: 0, received: 0, return: 0 };
        let grandTotal = 0, totalEntries = 0, maxCell = 1;
        const orderRows = [];

        const orderKeys = [
            ...Object.keys(DELIVERY_TYPES),
            ...[...byOrder.keys()].filter((k) => !DELIVERY_TYPES[k]),
        ];

        orderKeys.forEach((orderType) => {
            const qtyMap = byOrder.get(orderType) || new Map();
            const known = DELIVERY_TYPES[orderType] || [];
            const types = [...known, ...[...qtyMap.keys()].filter((t) => !known.includes(t))];

            const cells = types.map((type) => {
                const d = qtyMap.get(type) || { quantity: 0, entries: 0 };
                const category = CATEGORY_OF[type] || guessCategory(type);
                catTotals[category] += d.quantity;
                grandTotal += d.quantity;
                totalEntries += d.entries;
                if (d.quantity > maxCell) maxCell = d.quantity;
                return { type, quantity: d.quantity, entries: d.entries, category };
            });

            orderRows.push({
                orderType,
                cells,
                total: cells.reduce((s, c) => s + c.quantity, 0),
                entries: cells.reduce((s, c) => s + c.entries, 0),
            });
        });

        return {
            orderRows, grandTotal, totalEntries, maxCell,
            sentTotal: catTotals.sent,
            receivedTotal: catTotals.received,
            returnTotal: catTotals.return,
        };
    }, [rows]);

    if (loading) return <div className="mt-6 h-44 rounded-xl bg-slate-100 animate-pulse" />;

    return (
        <div className="mt-6 bg-white border border-slate-100 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <p className="text-sm font-medium text-slate-700">Daily delivery summary</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                        {payload?.date ? fmtDate(payload.date) : ""} ·{" "}
                        {payload?.groupedBy === "deliveryDate" ? "by delivery date" : "by entry date"} · BST (UTC+6)
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={selectedDate}
                        max={today}
                        onChange={(e) => e.target.value && onDateChange(e.target.value)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    {selectedDate !== today && (
                        <button
                            onClick={() => onDateChange(today)}
                            className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
                        >
                            Today
                        </button>
                    )}

                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Total qty: <b className="text-slate-800 tabular-nums">{grandTotal.toLocaleString()}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Deliveries: <b className="text-slate-800 tabular-nums">{totalEntries.toLocaleString()}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Sent: <b className="text-blue-700 tabular-nums">{sentTotal.toLocaleString()}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Received: <b className="text-emerald-700 tabular-nums">{receivedTotal.toLocaleString()}</b>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2.5 py-1 text-[11px] text-slate-500 ring-1 ring-slate-200">
                        Returned: <b className="text-orange-700 tabular-nums">{returnTotal.toLocaleString()}</b>
                    </span>
                </div>
            </div>

            <div className="space-y-3">
                {orderRows.map(({ orderType, cells, total, entries }) => (
                    <div key={orderType} className="flex items-center gap-4">
                        <div className="w-44 shrink-0">
                            <p className="text-sm font-medium text-slate-700">
                                {ORDER_LABELS[orderType] || orderType}
                            </p>
                            <p className="text-[11px] text-slate-400">{cells.length} movement types</p>
                        </div>

                        <div
                            className="grid flex-1 gap-1.5"
                            style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
                        >
                            {cells.map((c) => {
                                const cat = CATEGORY_STYLES[c.category];
                                const t = maxCell > 1 ? Math.sqrt(c.quantity / maxCell) : 0;
                                const strong = t > 0.55;
                                return (
                                    <div
                                        key={c.type}
                                        title={`${c.type} → ${c.quantity.toLocaleString()} qty · ${c.entries} deliveries`}
                                        className="flex h-12 cursor-default flex-col items-center justify-center rounded-md px-2 transition-shadow hover:ring-2 hover:ring-slate-300"
                                        style={{
                                            background: c.quantity
                                                ? `rgba(${cat.rgb}, ${0.12 + 0.88 * t})`
                                                : "#F1F5F9",
                                        }}
                                    >
                                        <span className={`text-sm font-semibold tabular-nums ${strong ? "text-white" : "text-slate-800"}`}>
                                            {c.quantity.toLocaleString()}
                                        </span>
                                        <span className={`w-full truncate text-center text-[10px] ${strong ? "text-white/80" : "text-slate-500"}`}>
                                            {c.type}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="w-28 shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums text-slate-800">{total.toLocaleString()}</p>
                            <p className="text-[11px] text-slate-400 -mt-0.5">{entries} deliveries</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <p className="text-[11px] text-slate-400">Hover a cell for details</p>
                <div className="flex items-center gap-4 text-[11px] text-slate-500">
                    {Object.entries(CATEGORY_STYLES).map(([key, c]) => (
                        <span key={key} className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.dot }} />
                            {c.label}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

const Home = () => {
    const axiosPrivate = useAxiosPrivate();
    
    const [challan, setChallan] = useState(null);
    const [challanLoading, setChallanLoading] = useState(true);

    const [workOrder, setWorkOrder] = useState(null);
    const [workOrderLoading, setWorkOrderLoading] = useState(true);

    const [booking, setBooking] = useState(null);
    const [bookingLoading, setBookingLoading] = useState(true);

    const [delivery, setDelivery] = useState(null);
    const [deliveryLoading, setDeliveryLoading] = useState(true);
    const [deliveryDate, setDeliveryDate] = useState(todayBST);
    const { sections } = UseUserRoles();
    
    // const { user } = useContext(AuthContext);

    useEffect(() => {
        const fetchChallanData = async () => {
            try {
                const res = await axiosPrivate.get("/api/reports/hourly-challan");
                setChallan(res.data);
            } catch (err) {
                console.error("Failed to fetch challan data", err);
            } finally {
                setChallanLoading(false);
            }
        };
        fetchChallanData();

        const fetchWorkOrderData = async () => {
            try {
                const res = await axiosPrivate.get("/api/hourly-work-order");
                setWorkOrder(res.data);
            } catch (err) {
                console.error("Failed to fetch work order data", err);
            } finally {
                setWorkOrderLoading(false);
            }
        };
        fetchWorkOrderData();

        const fetchBookingData = async () => {
            try {
                const res = await axiosPrivate.get("/api/hourly-booking");
                setBooking(res.data);
            } catch (err) {
                console.error("Failed to fetch booking data", err);
            } finally {
                setBookingLoading(false);
            }
        };
        fetchBookingData();
    }, [axiosPrivate]);

    useEffect(() => {
        const fetchDeliveryData = async () => {
            setDeliveryLoading(true);
            try {
                const res = await axiosPrivate.get(`/api/reports/daily-delivery?date=${deliveryDate}`);
                setDelivery(res.data);
            } catch (err) {
                console.error("Failed to fetch delivery data", err);
            } finally {
                setDeliveryLoading(false);
            }
        };
        fetchDeliveryData();
    }, [axiosPrivate, deliveryDate]);

    return (
        <DashboardLayout title="Dashboard">
            <div className="p-6 space-y-6">
                <TotalSummary
                    bgColor={"bg-white"}
                    color={"text-black"}
                    height={""}
                />

                {
                    sections?.dashboard?.hourlyChallanActivity && (
                        <HourlyChallanBoard payload={challan} loading={challanLoading} />
                    )
                }

                {
                    sections?.dashboard?.hourlyWorkOrderActivity && (
                        <HourlyWorkOrderBoard payload={workOrder} loading={workOrderLoading} />
                    )
                }

                {
                    sections?.dashboard?.hourlyBookingActivity && (
                        <HourlyBookingBoard payload={booking} loading={bookingLoading} />
                    )
                }

                <DailyDeliveryBoard
                    payload={delivery}
                    loading={deliveryLoading}
                    selectedDate={deliveryDate}
                    onDateChange={setDeliveryDate}
                />
            </div>
        </DashboardLayout>
    );
};

export default Home;