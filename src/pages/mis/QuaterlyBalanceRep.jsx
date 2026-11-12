import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader, Download, RefreshCw, Calendar, X } from "lucide-react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

// ===================== CONFIG =====================
const API_BASE = "/api/quarterly-balance";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 120;
const PREFETCH_OTHER_TABS = true;

const ROW_HEIGHT = 48;
const OVERSCAN = 10;

// "All Time" = default view: every party, all history, no quarter filter
const ALL_KEY = "ALL";
const ALL_PERIOD = {
  key: ALL_KEY,
  start: "1900-01-01",
  next: "2999-01-01",
  label: "All Time",
  range: "All dates",
  title: "All Time (all data)",
};

const ORDER_CONFIG = {
  knittingOrder: { title: "Knitting", delivery: "Yarn Delivery", ret: "Yarn Return", received: "Greige Received", finish: null, filePrefix: "Knitting_Quarterly_Balance" },
  dyeingOrder: { title: "Dyeing", delivery: "Grey Delivery", ret: "Grey Return", received: "Grey Received", finish: "Finish Received", filePrefix: "Dyeing_Quarterly_Balance" },
  aopOrder: { title: "AOP", delivery: "Sent For AOP", ret: "AOP Return", received: "Received From AOP", finish: "AOP Finish Fabric Rcvd", filePrefix: "AOP_Quarterly_Balance" },
};
const ORDER_TYPES = ["knittingOrder", "dyeingOrder", "aopOrder"];

// Quick filters for the Summary tab ("quarter" = default quarter wise rows)
const QUICK_FILTERS = [
  { key: "quarter", label: "Quarter Wise" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "lastWeek", label: "Last Week" },
  { key: "lastMonth", label: "Last Month" },
  { key: "thisYear", label: "This Year" },
];

// typeKey = "" -> all quantity columns; otherwise only that quantity column (used when a quantity is clicked in the Summary tab)
const getDetailColumns = (cfg, typeKey = "") => [
  { header: "Date", key: "challanDate", width: 110 },
  { header: "Challan No", key: "challanNo", width: 120 },
  { header: "Job No", key: "jobNo", width: 140 },
  { header: "Composition", key: "composition", width: 270 },
  { header: "Color", key: "color", width: 180 },
  { header: cfg.delivery, key: "yarnDelivery", width: 120, qty: true },
  { header: cfg.ret, key: "yarnReturn", width: 120, qty: true },
  { header: cfg.received, key: "greyFabricReceived", width: 130, qty: true },
  ...(cfg.finish ? [{ header: cfg.finish, key: "finishReceived", width: 140, qty: true }] : []),
  { header: "Balance", key: "balance", width: 130 },
].filter((c) => !c.qty || !typeKey || c.key === typeKey);
const getXlDetailWidths = (cfg) => [13, 14, 18, 34, 22, 15, 15, 17, ...(cfg.finish ? [20] : []), 16];

// ===================== THEME =====================
const theme = {
  colors: {
    primary: "#3b82f6", success: "#10b981", danger: "#ef4444",
    bgHeader: "#f5d8c9", bgHover: "#f1f5f9", border: "#10b981",
    borderDark: "#cbd5e1", textMain: "#0f172a", textMuted: "#0f172a", white: "#ffffff",
  },
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
  },
  radius: "8px",
};
const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const cellStyle = {
  padding: "10px 14px", borderBottom: `1px solid ${theme.colors.border}`,
  borderRight: `1px solid ${theme.colors.border}`, fontSize: "0.875rem",
  color: theme.colors.textMain, verticalAlign: "middle", textAlign: "center",
  whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.2", backgroundClip: "padding-box",
};
const thStickyStyle = {
  ...cellStyle, position: "sticky", top: 0, zIndex: 30, background: "#657582",
  fontWeight: 600, fontSize: "0.80rem", textTransform: "uppercase", letterSpacing: "0.05em",
  color: "white", borderBottom: `3px solid ${theme.colors.borderDark}`, boxShadow: theme.shadows.sm,
};
const tfootCellStyle = {
  ...cellStyle, position: "sticky", bottom: 0, zIndex: 30, background: "#657582",
  fontWeight: 700, borderTop: `2px solid ${theme.colors.borderDark}`, borderBottom: "none", color: "white",
};
const fixedCellStyle = { ...cellStyle, height: ROW_HEIGHT, padding: "4px 10px", boxSizing: "border-box", overflow: "hidden" };
const clampStyle = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word", lineHeight: 1.2 };
// a quantity that can be clicked to open its details
const linkCellStyle = { color: "#1d4ed8", textDecoration: "underline", cursor: "pointer", fontWeight: 600 };
// active = highlighted (selected) button
const toolbarBtn = (active, disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  background: active ? theme.colors.primary : theme.colors.white,
  color: active ? theme.colors.white : theme.colors.textMain,
  padding: "10px 16px", borderRadius: theme.radius,
  border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
  boxShadow: active ? "0 0 0 3px rgb(59 130 246 / 0.25)" : "none",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.7 : 1,
  fontSize: "0.875rem", fontWeight: active ? 700 : 500, fontFamily: "inherit",
});
const selectStyle = {
  padding: "10px 12px", borderRadius: theme.radius, border: `1px solid ${theme.colors.border}`,
  fontSize: "0.875rem", fontFamily: "inherit", background: theme.colors.white,
  color: theme.colors.textMain, outline: "none", cursor: "pointer",
};

// ===================== HELPERS =====================
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const isZero = (n) => Math.abs(Number(n) || 0) < 0.005;
const fmt = (n) => (isZero(n) ? "-" : Number(n).toFixed(2));
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");

const formatShortDate = (val) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(val || ""));
  if (!m) return "-";
  return `${Number(m[3])}-${MONTH_SHORT[Number(m[2]) - 1]}-${m[1].slice(-2)}`;
};

const buildQuarter = (startYear, startMonth, fyStartMonth) => {
  const qNo = Math.floor(((startMonth - fyStartMonth + 12) % 12) / 3) + 1;
  let endMonth = startMonth + 2;
  let endYear = startYear;
  if (endMonth > 12) { endMonth -= 12; endYear += 1; }
  let nextMonth = startMonth + 3;
  let nextYear = startYear;
  if (nextMonth > 12) { nextMonth -= 12; nextYear += 1; }
  const fyStartYear = fyStartMonth === 1 ? startYear : startMonth >= fyStartMonth ? startYear : startYear - 1;
  const label = fyStartMonth === 1 ? `Q${qNo} ${startYear}` : `Q${qNo} FY ${fyStartYear}-${pad2((fyStartYear + 1) % 100)}`;
  const range = `${MONTH_SHORT[startMonth - 1]}'${String(startYear).slice(-2)} - ${MONTH_SHORT[endMonth - 1]}'${String(endYear).slice(-2)}`;
  const start = `${startYear}-${pad2(startMonth)}-01`;
  return { key: start, start, next: `${nextYear}-${pad2(nextMonth)}-01`, label, range, title: `${label} (${range})` };
};

const getQuarterOf = (monthKey, fyStartMonth) => {
  const y = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  const qIdx = Math.floor(((m - fyStartMonth + 12) % 12) / 3);
  const startMonth = ((fyStartMonth - 1 + qIdx * 3) % 12) + 1;
  const startYear = startMonth > m ? y - 1 : y;
  return buildQuarter(startYear, startMonth, fyStartMonth);
};

const errorMessage = (err) => {
  if (err?.response?.status === 403) return "Permission denied";
  return err?.response?.data?.message || err?.response?.data?.msg || err?.message || "Failed to load data";
};
const isCanceled = (err) => err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError";

// Quick filter date range (start inclusive, next exclusive) for the Summary tab
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDaysTo = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const getQuickRange = (key) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startD;
  let nextD;
  if (key === "yesterday") {
    startD = addDaysTo(today, -1); nextD = today;
  } else if (key === "lastWeek") {
    const dow = (today.getDay() + 6) % 7; // Monday = 0
    const thisMonday = addDaysTo(today, -dow);
    startD = addDaysTo(thisMonday, -7); nextD = thisMonday;
  } else if (key === "lastMonth") {
    startD = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    nextD = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (key === "thisYear") {
    startD = new Date(today.getFullYear(), 0, 1);
    nextD = new Date(today.getFullYear() + 1, 0, 1);
  } else {
    startD = today; nextD = addDaysTo(today, 1);
  }
  const start = toISODate(startD);
  const next = toISODate(nextD);
  const last = toISODate(addDaysTo(nextD, -1));
  const range = start === last ? formatShortDate(start) : `${formatShortDate(start)} to ${formatShortDate(last)}`;
  const label = QUICK_FILTERS.find((q) => q.key === key)?.label || "Today";
  return { key, start, next, label, range, title: `${label} (${range})` };
};

// quarters list from a months list (same logic as the quarter dropdown)
// Invalid / empty month values from the server ("undefined", null, "NaN-..") are skipped, so no "undefined" quarter is created
const isValidMonth = (m) => {
  if (typeof m !== "string") return false;
  const mm = /^(\d{4})-(\d{2})/.exec(m);
  if (!mm) return false;
  const month = Number(mm[2]);
  return Number(mm[1]) > 1900 && month >= 1 && month <= 12;
};
const quartersFromMonths = (months, fyStartMonth) => {
  if (!Array.isArray(months)) return [];
  const map = new Map();
  months.filter(isValidMonth).forEach((m) => {
    const q = getQuarterOf(`${String(m).slice(0, 7)}-01`, fyStartMonth);
    if (!map.has(q.key)) map.set(q.key, q);
  });
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
};

// a loaded quarter row that has no transaction at all (everything zero / no party) is not shown in the Summary tab
const hasQuarterData = (row) => {
  if (!row.loaded) return true;
  if (!row.parties || row.parties.length === 0) return false;
  const t = row.totals || {};
  return ["opening", "yarnDelivery", "yarnReturn", "greyFabricReceived", "finishReceived", "closing", "challans"].some((k) => !isZero(t[k]));
};

// "Jan-26 to Mar-26" text for a quarter
const quarterDetails = (q) => {
  const sm = Number(q.start.slice(5, 7));
  const endD = new Date(Number(q.next.slice(0, 4)), Number(q.next.slice(5, 7)) - 2, 1);
  return `${MONTH_SHORT[sm - 1]}-${q.start.slice(2, 4)} to ${MONTH_SHORT[endD.getMonth()]}-${String(endD.getFullYear()).slice(-2)}`;
};

// server summary rows -> party list / totals (used by the Summary tab)
const toParties = (list) =>
  list.map((r) => ({
    key: r.key,
    name: r.name || "Unknown",
    opening: round2(r.opening),
    yarnDelivery: round2(r.delivery),
    yarnReturn: round2(r.ret),
    greyFabricReceived: round2(r.received),
    finishReceived: round2(r.finish),
    closing: round2(r.closing),
    challans: Number(r.challans) || 0,
  }));
const sumTotals = (parties) => {
  const t = { opening: 0, yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0, closing: 0, challans: 0 };
  parties.forEach((p) => Object.keys(t).forEach((k) => { t[k] += Number(p[k]) || 0; }));
  Object.keys(t).forEach((k) => { t[k] = round2(t[k]); });
  return t;
};

// ===================== CACHE + FETCH HOOK =====================
// Module level: survives tab switches and remounts.
const CACHE = new Map(); // key -> { at, data }
const cacheSet = (key, data) => {
  CACHE.set(key, { at: Date.now(), data });
  if (CACHE.size > CACHE_MAX_ENTRIES) CACHE.delete(CACHE.keys().next().value);
};
const cacheFresh = (key) => {
  const hit = CACHE.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit : null;
};
// Call this on logout so another user never sees old data.
export const clearQuarterlyBalanceCache = () => { CACHE.clear(); };

const summaryKey = (type, start, nonce) => `s|${type}|${start}|${nonce}`;

const useApi = (axiosRef, key, url, params, enabled) => {
  const [status, setStatus] = useState({ key: null, error: null });
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!enabled || !key) return undefined;
    if (cacheFresh(key)) return undefined;
    let alive = true;
    const controller = new AbortController();
    axiosRef.current
      .get(url, { params: paramsRef.current, signal: controller.signal })
      .then((res) => { if (!alive) return; cacheSet(key, res.data); setStatus({ key, error: null }); })
      .catch((err) => { if (!alive || isCanceled(err)) return; setStatus({ key, error: errorMessage(err) }); });
    return () => { alive = false; controller.abort(); };
  }, [axiosRef, key, url, enabled]);

  const data = enabled && key ? CACHE.get(key)?.data ?? null : null;
  const error = status.key === key ? status.error : null;
  return { data, error, loading: enabled && !data && !error };
};

// loads many requests (one per quarter and order type) 3 at a time into the same cache
const useBatchApi = (axiosRef, items, enabled) => {
  const [tick, setTick] = useState(0);
  const [errState, setErrState] = useState({ sig: "", msg: null });
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const sig = items.map((i) => i.key).join(",");

  useEffect(() => {
    if (!enabled) return undefined;
    const pendingItems = itemsRef.current.filter((i) => !cacheFresh(i.key));
    if (pendingItems.length === 0) return undefined;
    let alive = true;
    const controller = new AbortController();
    let idx = 0;
    const worker = async () => {
      while (alive) {
        const it = pendingItems[idx++];
        if (!it) return;
        try {
          const res = await axiosRef.current.get(it.url, { params: it.params, signal: controller.signal });
          if (!alive) return;
          cacheSet(it.key, res.data);
          setTick((t) => t + 1);
        } catch (err) {
          if (!alive || isCanceled(err)) return;
          setErrState({ sig, msg: errorMessage(err) });
        }
      }
    };
    Promise.all([worker(), worker(), worker()]);
    return () => { alive = false; controller.abort(); };
  }, [axiosRef, sig, enabled]);

  const pending = enabled ? items.filter((i) => !CACHE.has(i.key)).length : 0;
  const error = errState.sig === sig ? errState.msg : null;
  return { tick, pending, error };
};

// ===================== EXCEL HELPERS =====================
const XL = { title: "FF1E293B", header: "FF657582", zebra: "FFF8FAFC", total: "FFF5D8C9", opening: "FFFEF9C3", closing: "FFD1FAE5", line: "FFCBD5E1", white: "FFFFFFFF", text: "FF0F172A" };
const XL_NUM_FMT = '#,##0.00;[Red]-#,##0.00;"-"';
const xlThin = { style: "thin", color: { argb: XL.line } };
const xlBorder = { top: xlThin, left: xlThin, bottom: xlThin, right: xlThin };
const xlFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const makeSheetName = (name, used) => {
  const base = String(name || "Unknown").replace(/[\\/?*[\]:]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Unknown";
  let finalName = base;
  let i = 2;
  while (used.has(finalName.toLowerCase())) {
    const suffix = ` (${i++})`;
    finalName = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(finalName.toLowerCase());
  return finalName;
};

const addTitleRow = (ws, text, colCount) => {
  ws.mergeCells(1, 1, 1, colCount);
  const cell = ws.getCell(1, 1);
  cell.value = text;
  cell.font = { bold: true, size: 14, color: { argb: XL.white }, name: "Calibri" };
  cell.fill = xlFill(XL.title);
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 6;
};

const addHeaderRow = (ws, headers, numericIdx) => {
  const row = ws.getRow(3);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 11, color: { argb: XL.white }, name: "Calibri" };
    cell.fill = xlFill(XL.header);
    cell.border = xlBorder;
    cell.alignment = { vertical: "middle", horizontal: numericIdx.has(i) ? "right" : "center", wrapText: true };
  });
  row.height = 26;
};

const styleBodyRow = (row, idx, numericIdx) => {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const isNum = numericIdx.has(colNumber - 1);
    cell.border = xlBorder;
    cell.font = { size: 10, color: { argb: XL.text }, name: "Calibri" };
    cell.alignment = { vertical: "middle", horizontal: isNum ? "right" : "left", wrapText: !isNum };
    if (isNum) cell.numFmt = XL_NUM_FMT;
    if (idx % 2 === 1) cell.fill = xlFill(XL.zebra);
  });
};

const styleSpecialRow = (row, numericIdx, fillArgb, topMedium = false) => {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const isNum = numericIdx.has(colNumber - 1);
    cell.font = { bold: true, size: 11, color: { argb: XL.text }, name: "Calibri" };
    cell.fill = xlFill(fillArgb);
    cell.border = { top: topMedium ? { style: "medium", color: { argb: XL.title } } : xlThin, left: xlThin, right: xlThin, bottom: xlThin };
    cell.alignment = { vertical: "middle", horizontal: isNum ? "right" : "left" };
    if (isNum) cell.numFmt = XL_NUM_FMT;
  });
  row.height = 24;
};

// same look as addHeaderRow but on any row number (Summary sheet has 3 sections)
const addHeaderRowAt = (ws, rowNo, headers, numericIdx) => {
  const row = ws.getRow(rowNo);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 11, color: { argb: XL.white }, name: "Calibri" };
    cell.fill = xlFill(XL.header);
    cell.border = xlBorder;
    cell.alignment = { vertical: "middle", horizontal: numericIdx.has(i) ? "right" : "center", wrapText: true };
  });
  row.height = 26;
};

// ===================== SERVER ROWS -> PARTY TIMELINES =====================
const attachRows = (parties, detailData) => {
  const byKey = new Map();
  (detailData?.data || []).forEach((r) => {
    let list = byKey.get(r.partyKey);
    if (!list) { list = []; byKey.set(r.partyKey, list); }
    list.push(r);
  });
  return parties.map((p) => {
    let running = p.opening;
    const rows = (byKey.get(p.key) || []).map((r) => {
      running = round2(running + Number(r.delta));
      return {
        rowKey: String(r.id),
        challanDate: r.day,
        challanNo: r.challanNo,
        jobNo: r.jobNo || "-",
        composition: r.composition || "-",
        color: r.color || "-",
        yarnDelivery: Number(r.delivery) || 0,
        yarnReturn: Number(r.ret) || 0,
        greyFabricReceived: Number(r.received) || 0,
        finishReceived: Number(r.finish) || 0,
        balance: running,
      };
    });
    return { ...p, rows };
  });
};

// ===================== COMPONENT =====================
const QuarterlyBalance = () => {
  const [selectOrderType, setSelectOrderType] = useState("knittingOrder");
  const [fyStartMonth, setFyStartMonth] = useState(1);
  const [selectedQuarterKey, setSelectedQuarterKey] = useState(ALL_KEY); // default: everything
  const [selectedParty, setSelectedParty] = useState("ALL");
  // "overview" = Summary tab (Knitting + Dyeing + AOP together) | "summary" = Party Summary | "detail" = Challan Detail
  const [view, setView] = useState("overview");
  const [isExporting, setIsExporting] = useState(false);
  const [nonce, setNonce] = useState(0); // bump = drop cache + refetch
  const [quickFilter, setQuickFilter] = useState("quarter"); // Summary tab quick filter ("quarter" = quarter wise rows)
  const [openDetails, setOpenDetails] = useState({}); // Summary tab details toggle per row
  const [typeFilter, setTypeFilter] = useState(""); // "" = all transaction types; otherwise the quantity key whose challans are shown
  const [customPeriod, setCustomPeriod] = useState(null); // period set by a click in the Summary tab (a quarter or a quick filter range)

  const axiosPrivate = useAxiosPrivate();
  const axiosRef = useRef(axiosPrivate);
  axiosRef.current = axiosPrivate;

  const cfg = ORDER_CONFIG[selectOrderType] || ORDER_CONFIG.knittingOrder;
  const hasFinish = !!cfg.finish;
  const qtyOptions = useMemo(() => [
    { key: "yarnDelivery", header: cfg.delivery },
    { key: "yarnReturn", header: cfg.ret },
    { key: "greyFabricReceived", header: cfg.received },
    ...(cfg.finish ? [{ key: "finishReceived", header: cfg.finish }] : []),
  ], [cfg]);
  const activeType = qtyOptions.some((t) => t.key === typeFilter) ? typeFilter : "";
  const activeTypeHeader = qtyOptions.find((t) => t.key === activeType)?.header || "";
  const DETAIL_COLUMNS = useMemo(() => getDetailColumns(cfg, activeType), [cfg, activeType]);
  const EXPORT_COLUMNS = useMemo(() => getDetailColumns(cfg, ""), [cfg]);
  const freshParam = nonce > 0 ? { fresh: 1 } : {};
  const notOverview = view !== "overview";

  // Months list (only needed for the quarter dropdown, runs in parallel with the summary)
  const monthsApi = useApi(axiosRef, `m|${selectOrderType}|${nonce}`, `${API_BASE}/${selectOrderType}/months`, nonce > 0 ? freshParam : undefined, notOverview);
  const quarterOptions = useMemo(
    () => quartersFromMonths(monthsApi.data?.data, fyStartMonth),
    [monthsApi.data, fyStartMonth]
  );

  // All Time is the default; a quarter is used only when the user picks one (or clicks one in the Summary tab)
  const activeQuarter = useMemo(() => {
    if (customPeriod) return customPeriod;
    if (selectedQuarterKey === ALL_KEY) return ALL_PERIOD;
    return quarterOptions.find((q) => q.key === selectedQuarterKey) || ALL_PERIOD;
  }, [customPeriod, quarterOptions, selectedQuarterKey]);
  const isAllTime = activeQuarter.key === ALL_KEY;
  const isQuick = !!customPeriod && QUICK_FILTERS.some((q) => q.key === customPeriod.key && q.key !== "quarter");

  // Party summary (one GROUP BY query on the server). Fires immediately: no waiting for the months list.
  const summaryApi = useApi(
    axiosRef,
    summaryKey(selectOrderType, activeQuarter.start, nonce),
    `${API_BASE}/${selectOrderType}/summary`,
    { start: activeQuarter.start, next: activeQuarter.next, ...freshParam },
    notOverview
  );

  // After the current tab is ready, quietly load the other tabs' All Time summaries
  const summaryReady = !!summaryApi.data;
  useEffect(() => {
    if (!PREFETCH_OTHER_TABS || !summaryReady || !isAllTime) return undefined;
    let cancelled = false;
    const others = ORDER_TYPES.filter((t) => t !== selectOrderType);
    const timer = setTimeout(async () => {
      for (const t of others) {
        if (cancelled) return;
        const k = summaryKey(t, ALL_PERIOD.start, nonce);
        if (cacheFresh(k)) continue;
        try {
          const res = await axiosRef.current.get(`${API_BASE}/${t}/summary`, { params: { start: ALL_PERIOD.start, next: ALL_PERIOD.next, ...freshParam } });
          cacheSet(k, res.data);
        } catch (e) { /* shown when that tab is opened */ }
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryReady, isAllTime, selectOrderType, nonce]);

  const parties = useMemo(() => {
    const list = summaryApi.data?.data;
    if (!Array.isArray(list)) return [];
    return list.map((r) => ({
      key: r.key,
      name: r.name || "Unknown",
      opening: round2(r.opening),
      yarnDelivery: round2(r.delivery),
      yarnReturn: round2(r.ret),
      greyFabricReceived: round2(r.received),
      finishReceived: round2(r.finish),
      closing: round2(r.closing),
      challans: Number(r.challans) || 0,
    }));
  }, [summaryApi.data]);

  const activePartyValid = selectedParty === "ALL" || parties.some((p) => p.key === selectedParty);
  const effectiveParty = activePartyValid ? selectedParty : "ALL";
  const visibleParties = useMemo(
    () => (effectiveParty === "ALL" ? parties : parties.filter((p) => p.key === effectiveParty)),
    [parties, effectiveParty]
  );

  const grand = useMemo(() => {
    const t = { opening: 0, yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0, closing: 0, challans: 0 };
    visibleParties.forEach((p) => Object.keys(t).forEach((k) => { t[k] += Number(p[k]) || 0; }));
    Object.keys(t).forEach((k) => { t[k] = round2(t[k]); });
    return t;
  }, [visibleParties]);

  // Challan rows: requested only when the Detail view is open
  const detailParams = {
    start: activeQuarter.start,
    next: activeQuarter.next,
    ...(effectiveParty !== "ALL" ? { party: effectiveParty } : {}),
    ...freshParam,
  };
  const detailKey = `d|${selectOrderType}|${activeQuarter.start}|${effectiveParty}|${nonce}`;
  const detailApi = useApi(axiosRef, detailKey, `${API_BASE}/${selectOrderType}/detail`, detailParams, view === "detail" && !!summaryApi.data);

  // When a quantity was clicked in the Summary tab (activeType), only the challans of that transaction type are shown
  const detailParties = useMemo(() => {
    if (view !== "detail" || !detailApi.data) return [];
    const list = attachRows(visibleParties, detailApi.data);
    if (!activeType) return list;
    return list
      .map((p) => ({ ...p, rows: p.rows.filter((r) => !isZero(r[activeType])) }))
      .filter((p) => p.rows.length > 0);
  }, [view, detailApi.data, visibleParties, activeType]);

  // ===================== SUMMARY TAB (Knitting + Dyeing + AOP together) =====================
  const overviewEnabled = view === "overview";
  const quickMode = quickFilter !== "quarter";
  const quickRange = useMemo(() => getQuickRange(quickFilter), [quickFilter]);

  // Quarter wise rows: months list of every order type -> quarters -> one summary request per quarter
  const mParams = nonce > 0 ? freshParam : undefined;
  const mKnitting = useApi(axiosRef, `m|knittingOrder|${nonce}`, `${API_BASE}/knittingOrder/months`, mParams, overviewEnabled);
  const mDyeing = useApi(axiosRef, `m|dyeingOrder|${nonce}`, `${API_BASE}/dyeingOrder/months`, mParams, overviewEnabled);
  const mAop = useApi(axiosRef, `m|aopOrder|${nonce}`, `${API_BASE}/aopOrder/months`, mParams, overviewEnabled);
  const overviewMonthsApis = { knittingOrder: mKnitting, dyeingOrder: mDyeing, aopOrder: mAop };

  const quartersByType = useMemo(() => ({
    knittingOrder: quartersFromMonths(mKnitting.data?.data, fyStartMonth),
    dyeingOrder: quartersFromMonths(mDyeing.data?.data, fyStartMonth),
    aopOrder: quartersFromMonths(mAop.data?.data, fyStartMonth),
  }), [mKnitting.data, mDyeing.data, mAop.data, fyStartMonth]);

  const batchItems = useMemo(
    () => ORDER_TYPES.flatMap((t) => (quartersByType[t] || []).map((q) => ({
      key: summaryKey(t, q.start, nonce),
      url: `${API_BASE}/${t}/summary`,
      params: { start: q.start, next: q.next, ...(nonce > 0 ? { fresh: 1 } : {}) },
    }))),
    [quartersByType, nonce]
  );
  const batch = useBatchApi(axiosRef, batchItems, overviewEnabled && !quickMode);

  // Quick filter rows (today / yesterday / last week / last month / this year)
  const overviewParams = { start: quickRange.start, next: quickRange.next, ...freshParam };
  const quickEnabled = overviewEnabled && quickMode;
  const ovKnitting = useApi(axiosRef, `o|knittingOrder|${quickRange.start}|${quickRange.next}|${nonce}`, `${API_BASE}/knittingOrder/summary`, overviewParams, quickEnabled);
  const ovDyeing = useApi(axiosRef, `o|dyeingOrder|${quickRange.start}|${quickRange.next}|${nonce}`, `${API_BASE}/dyeingOrder/summary`, overviewParams, quickEnabled);
  const ovAop = useApi(axiosRef, `o|aopOrder|${quickRange.start}|${quickRange.next}|${nonce}`, `${API_BASE}/aopOrder/summary`, overviewParams, quickEnabled);
  const overviewApis = { knittingOrder: ovKnitting, dyeingOrder: ovDyeing, aopOrder: ovAop };

  const overview = useMemo(() => {
    const out = {};
    ORDER_TYPES.forEach((t) => {
      const list = overviewApis[t].data?.data;
      if (Array.isArray(list)) {
        const ps = toParties(list);
        out[t] = { parties: ps, totals: sumTotals(ps) };
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ovKnitting.data, ovDyeing.data, ovAop.data]);

  // Rows shown in each table: quarter rows (default) or one quick filter row.
  // row.period = the period object used when a quantity of that row is clicked (opens the Challan Detail for it)
  const overviewRows = useMemo(() => {
    const out = {};
    ORDER_TYPES.forEach((t) => {
      if (quickMode) {
        const o = overview[t];
        out[t] = [{ id: quickRange.key, label: quickRange.title, period: quickRange, loaded: !!o, parties: o?.parties || [], totals: o?.totals || null }];
      } else {
        out[t] = (quartersByType[t] || [])
          .map((q) => {
            const label = quarterDetails(q);
            const list = CACHE.get(summaryKey(t, q.start, nonce))?.data?.data;
            if (!Array.isArray(list)) return { id: q.key, label, period: q, loaded: false, parties: [], totals: null };
            const ps = toParties(list);
            return { id: q.key, label, period: q, loaded: true, parties: ps, totals: sumTotals(ps) };
          })
          .filter(hasQuarterData); // hide quarters that have no data
      }
    });
    return out;
  }, [quickMode, quickRange, overview, quartersByType, nonce, batch.tick]);

  const overviewReady =
    ORDER_TYPES.some((t) => (overviewRows[t] || []).length > 0) &&
    ORDER_TYPES.every((t) => (overviewRows[t] || []).every((r) => r.loaded)) &&
    (quickMode || (batch.pending === 0 && !mKnitting.loading && !mDyeing.loading && !mAop.loading));
  const overviewLoading = overviewEnabled && (quickMode
    ? ovKnitting.loading || ovDyeing.loading || ovAop.loading
    : mKnitting.loading || mDyeing.loading || mAop.loading || (batch.pending > 0 && !batch.error));
  const overviewError = overviewEnabled
    ? (quickMode ? ovKnitting.error || ovDyeing.error || ovAop.error : mKnitting.error || mDyeing.error || mAop.error || batch.error)
    : null;

  // ===================== WINDOWED DETAIL VIEW =====================
  const tableScrollRef = useRef(null);
  const rafRef = useRef(0);
  const [viewport, setViewport] = useState({ top: 0, height: 900 });

  const detailLines = useMemo(() => {
    const lines = [];
    detailParties.forEach((p) => {
      lines.push({ t: "party", key: `${p.key}|party`, p });
      lines.push({ t: "open", key: `${p.key}|open`, p });
      p.rows.forEach((r, i) => lines.push({ t: "row", key: `${p.key}|${r.rowKey}|${i}`, r, i }));
      if (p.rows.length === 0) lines.push({ t: "empty", key: `${p.key}|empty` });
      lines.push({ t: "total", key: `${p.key}|total`, p });
      lines.push({ t: "close", key: `${p.key}|close`, p });
      lines.push({ t: "gap", key: `${p.key}|gap` });
    });
    return lines;
  }, [detailParties]);

  const totalLines = detailLines.length;
  const { winStart, winEnd } = useMemo(() => {
    const first = Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN;
    const last = Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN;
    const s = Math.max(0, Math.min(first, Math.max(0, totalLines - 1)));
    const e = Math.min(totalLines, Math.max(last, s + 1));
    return { winStart: s, winEnd: e };
  }, [viewport.top, viewport.height, totalLines]);
  const windowLines = useMemo(() => detailLines.slice(winStart, winEnd), [detailLines, winStart, winEnd]);

  const handleDetailScroll = useCallback((e) => {
    const el = e.currentTarget;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const top = el.scrollTop;
      const height = el.clientHeight;
      setViewport((v) => (Math.abs(v.top - top) < ROW_HEIGHT / 2 && v.height === height ? v : { top, height }));
    });
  }, []);

  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
    setViewport((v) => ({ ...v, top: 0 }));
  }, [view, effectiveParty, activeQuarter.key, selectOrderType, activeType]);

  useLayoutEffect(() => {
    if (view !== "detail") return undefined;
    const sync = () => {
      const el = tableScrollRef.current;
      if (!el) return;
      setViewport((v) => (v.height === el.clientHeight && v.top === el.scrollTop ? v : { top: el.scrollTop, height: el.clientHeight }));
    };
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [view, totalLines > 0]);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ===================== EXPORT =====================
  // Always exports every transaction type (independent of the type filter on the screen)
  const handleExport = async () => {
    if (visibleParties.length === 0) { alert("No data to export."); return; }
    setIsExporting(true);
    try {
      let detail = cacheFresh(detailKey)?.data;
      if (!detail) {
        const res = await axiosRef.current.get(`${API_BASE}/${selectOrderType}/detail`, { params: detailParams });
        detail = res.data;
        cacheSet(detailKey, detail);
      }
      if (detail?.truncated) alert("Too many rows: the export contains only the first part. Export one party at a time or pick a quarter.");
      const exportParties = attachRows(visibleParties, detail);

      const mod = await import("exceljs");
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Garments ERP";
      wb.created = new Date();
      const periodText = `${activeQuarter.label}  (${activeQuarter.range})`;
      const summaryWs = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
      const usedNames = new Set(["summary"]);
      const colCount = EXPORT_COLUMNS.length;
      const balanceIdx = colCount - 1;
      const numericIdx = new Set(Array.from({ length: colCount - 5 }, (_, i) => i + 5));
      const blankRow = () => Array(colCount).fill("");
      const openingText = isAllTime ? "OPENING BALANCE" : isQuick ? "OPENING BALANCE (b/f from earlier dates)" : "OPENING BALANCE (b/f from previous quarter)";
      const totalText = isAllTime ? "TOTAL" : isQuick ? "PERIOD TOTAL" : "QUARTER TOTAL";
      const closingText = isAllTime ? "CLOSING BALANCE" : isQuick ? "CLOSING BALANCE" : "CLOSING BALANCE (next quarter opening)";

      exportParties.forEach((p) => {
        const ws = wb.addWorksheet(makeSheetName(p.name, usedNames), { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
        addTitleRow(ws, `${p.name}  |  ${cfg.title} Balance Confirmation  |  ${periodText}`, colCount);
        addHeaderRow(ws, EXPORT_COLUMNS.map((c) => c.header), numericIdx);

        const openVals = blankRow();
        openVals[3] = openingText;
        openVals[balanceIdx] = p.opening;
        styleSpecialRow(ws.addRow(openVals), numericIdx, XL.opening);

        p.rows.forEach((r, idx) => {
          const row = ws.addRow([
            formatShortDate(r.challanDate), r.challanNo ?? "", r.jobNo === "-" ? "" : r.jobNo,
            r.composition === "-" ? "" : r.composition, r.color === "-" ? "" : r.color,
            r.yarnDelivery, r.yarnReturn, r.greyFabricReceived,
            ...(hasFinish ? [r.finishReceived] : []), r.balance,
          ]);
          styleBodyRow(row, idx, numericIdx);
        });

        const totVals = blankRow();
        totVals[3] = totalText;
        totVals[5] = p.yarnDelivery; totVals[6] = p.yarnReturn; totVals[7] = p.greyFabricReceived;
        if (hasFinish) totVals[8] = p.finishReceived;
        styleSpecialRow(ws.addRow(totVals), numericIdx, XL.total, true);

        const closeVals = blankRow();
        closeVals[3] = closingText;
        closeVals[balanceIdx] = p.closing;
        styleSpecialRow(ws.addRow(closeVals), numericIdx, XL.closing);

        ws.addRow([]); ws.addRow([]);
        const confRow1 = ws.addRow(["Balance as per our record (kg):", "", "", "", p.closing]);
        const confRow2 = ws.addRow(["Balance confirmed by factory (kg):", "", "", "", ""]);
        const confRow3 = ws.addRow(["Difference (kg):", "", "", "", { formula: `IF(E${confRow2.number}="","",E${confRow2.number}-E${confRow1.number})` }]);
        [confRow1, confRow2, confRow3].forEach((r) => {
          r.getCell(1).font = { bold: true, size: 10, name: "Calibri" };
          r.getCell(5).numFmt = XL_NUM_FMT; r.getCell(5).border = xlBorder; r.getCell(5).alignment = { horizontal: "right" };
        });
        ws.addRow([]); ws.addRow([]);
        const signRow = ws.addRow(["Prepared by: ____________", "", "", "Factory Representative (Name / Sign / Seal): ____________________", "", "", "", "Date: ____________"]);
        signRow.font = { size: 10, name: "Calibri" };

        getXlDetailWidths(cfg).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
        ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colCount } };
        ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      });

      const sumHeaders = ["Party / Factory", "Challans", "Opening Balance", cfg.delivery, cfg.ret, cfg.received, ...(hasFinish ? [cfg.finish] : []), "Closing Balance", "Confirmed by Factory", "Difference", "Remarks"];
      const closingIdx = sumHeaders.indexOf("Closing Balance");
      const confirmedIdx = closingIdx + 1;
      const diffIdx = closingIdx + 2;
      const sumNumeric = new Set(Array.from({ length: diffIdx }, (_, i) => i + 1));
      const confL = summaryWs.getColumn(confirmedIdx + 1).letter;
      const closL = summaryWs.getColumn(closingIdx + 1).letter;

      addTitleRow(summaryWs, `${cfg.title} Party Wise Balance Summary  |  ${periodText}`, sumHeaders.length);
      addHeaderRow(summaryWs, sumHeaders, sumNumeric);

      exportParties.forEach((p, idx) => {
        const row = summaryWs.addRow([p.name, p.challans, p.opening, p.yarnDelivery, p.yarnReturn, p.greyFabricReceived, ...(hasFinish ? [p.finishReceived] : []), p.closing, "", "", ""]);
        const rn = row.number;
        row.getCell(diffIdx + 1).value = { formula: `IF(${confL}${rn}="","",${confL}${rn}-${closL}${rn})` };
        styleBodyRow(row, idx, sumNumeric);
        row.getCell(2).numFmt = "#,##0";
      });

      const gRow = summaryWs.addRow(["GRAND TOTAL", grand.challans, grand.opening, grand.yarnDelivery, grand.yarnReturn, grand.greyFabricReceived, ...(hasFinish ? [grand.finishReceived] : []), grand.closing, "", "", ""]);
      styleSpecialRow(gRow, sumNumeric, XL.total, true);
      gRow.getCell(2).numFmt = "#,##0";
      [34, 11, 17, 16, 16, 18, ...(hasFinish ? [22] : []), 17, 20, 14, 30].forEach((w, i) => { summaryWs.getColumn(i + 1).width = w; });
      summaryWs.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${cfg.filePrefix}_${activeQuarter.label.replace(/[^A-Za-z0-9]+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel export failed:", err);
      alert("Failed to export Excel file.");
    } finally {
      setIsExporting(false);
    }
  };

  // Excel export for the Summary tab (Summary sheet + party-wise details sheet per order type)
  const handleOverviewExport = async () => {
    if (!overviewReady) { alert("No data to export."); return; }
    setIsExporting(true);
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Garments ERP";
      wb.created = new Date();
      const periodText = quickMode ? `${quickRange.label}  (${quickRange.range})` : "Quarter Wise";
      const firstHeader = quickMode ? "Period (Details)" : "Quarter (Details)";

      // ---- Summary sheet: Knitting / Dyeing / AOP sections ----
      const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
      addTitleRow(ws, `Quick Summary  |  ${periodText}`, 7);
      let rowNo = 3;
      ORDER_TYPES.forEach((type) => {
        const c = ORDER_CONFIG[type];
        const fin = !!c.finish;
        const headers = [firstHeader, "Opening Balance", c.delivery, c.ret, c.received, ...(fin ? [c.finish] : []), "Party Stock"];
        const numIdx = new Set(headers.map((_, i) => i).filter((i) => i > 0));

        ws.mergeCells(rowNo, 1, rowNo, headers.length);
        const secCell = ws.getCell(rowNo, 1);
        secCell.value = c.title;
        secCell.font = { bold: true, size: 12, color: { argb: XL.text }, name: "Calibri" };
        secCell.fill = xlFill(XL.total);
        secCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        ws.getRow(rowNo).height = 24;

        addHeaderRowAt(ws, rowNo + 1, headers, numIdx);

        let r = rowNo + 2;
        overviewRows[type].forEach((row, idx) => {
          const t = row.totals;
          const dataRow = ws.getRow(r);
          [
            row.label, t.opening, t.yarnDelivery, t.yarnReturn, t.greyFabricReceived,
            ...(fin ? [t.finishReceived] : []), t.closing,
          ].forEach((v, i) => { dataRow.getCell(i + 1).value = v; });
          styleBodyRow(dataRow, idx, numIdx);
          dataRow.getCell(2).fill = xlFill(XL.opening);
          dataRow.getCell(headers.length).fill = xlFill(XL.closing);
          dataRow.getCell(headers.length).font = { bold: true, size: 10, color: { argb: XL.text }, name: "Calibri" };
          dataRow.height = 22;
          r += 1;
        });

        rowNo = r + 1;
      });
      [30, 17, 16, 16, 18, 22, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      // ---- Party-wise details sheet for each order type ----
      ORDER_TYPES.forEach((type) => {
        const c = ORDER_CONFIG[type];
        const fin = !!c.finish;
        const headers = [firstHeader, "Party / Factory", "Challans", "Opening Balance", c.delivery, c.ret, c.received, ...(fin ? [c.finish] : []), "Closing Balance"];
        const numIdx = new Set(headers.map((_, i) => i).filter((i) => i > 1));
        const pws = wb.addWorksheet(`${c.title} Details`, { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
        addTitleRow(pws, `${c.title} Party Wise Details  |  ${periodText}`, headers.length);
        addHeaderRow(pws, headers, numIdx);

        overviewRows[type].forEach((row) => {
          row.parties.forEach((p, idx) => {
            const xr = pws.addRow([row.label, p.name, p.challans, p.opening, p.yarnDelivery, p.yarnReturn, p.greyFabricReceived, ...(fin ? [p.finishReceived] : []), p.closing]);
            styleBodyRow(xr, idx, numIdx);
            xr.getCell(3).numFmt = "#,##0";
          });
          const t = row.totals;
          const tr = pws.addRow([row.label, "TOTAL", t.challans, t.opening, t.yarnDelivery, t.yarnReturn, t.greyFabricReceived, ...(fin ? [t.finishReceived] : []), t.closing]);
          styleSpecialRow(tr, numIdx, XL.total, true);
          tr.getCell(3).numFmt = "#,##0";
        });
        [26, 34, 11, 17, 16, 16, 18, ...(fin ? [22] : []), 17].forEach((w, i) => { pws.getColumn(i + 1).width = w; });
        pws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Quick_Summary_${(quickMode ? quickRange.label : "Quarter_Wise").replace(/[^A-Za-z0-9]+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Excel export failed:", err);
      alert("Failed to export Excel file.");
    } finally {
      setIsExporting(false);
    }
  };

  // ===================== HANDLERS =====================
  const handleSelectOrderType = (type) => {
    if (type === selectOrderType && view !== "overview") return;
    setSelectedQuarterKey(ALL_KEY);
    setCustomPeriod(null);
    setTypeFilter("");
    setSelectedParty("ALL");
    setSelectOrderType(type);
  };
  // click on the Knitting / Dyeing / AOP tab: leaves the Summary tab and shows that order's Party Summary
  const handleOrderTab = (type) => {
    if (view === "overview") setView("summary");
    handleSelectOrderType(type);
  };
  const handleFyChange = (value) => { setFyStartMonth(value); setSelectedQuarterKey(ALL_KEY); setCustomPeriod(null); };
  const handleQuarterChange = (value) => { setCustomPeriod(null); setSelectedQuarterKey(value); };
  const refresh = () => {
    CACHE.forEach((_, k) => { if (k.split("|")[1] === selectOrderType) CACHE.delete(k); });
    setNonce((n) => n + 1);
  };

  // Click on a quantity (or a row label) in the Summary tab -> jump to that order's tab (Knitting / Dyeing / AOP)
  // with the period, party and transaction type already filtered, showing the Challan Detail.
  const openFromOverview = (type, period, partyKey, typeKey) => {
    setSelectOrderType(type);
    setCustomPeriod(period);
    setSelectedQuarterKey(ALL_KEY);
    setSelectedParty(partyKey || "ALL");
    setTypeFilter(typeKey || "");
    setView("detail");
  };

  // ===================== RENDER =====================
  const error = summaryApi.error || (view === "detail" ? detailApi.error : null) || (monthsApi.error && !summaryApi.data ? monthsApi.error : null) || overviewError;
  const busy = summaryApi.loading || (view === "detail" && detailApi.loading) || overviewLoading;
  const negColor = (n) => (Number(n) < -0.005 ? { color: "#b91c1c" } : {});
  const summaryHeaders = ["Party / Factory", "Challans", "Opening Balance", cfg.delivery, cfg.ret, cfg.received, ...(hasFinish ? [cfg.finish] : []), "Closing Balance"];
  const zebra = (idx) => (idx % 2 === 0 ? "#fff" : "#fafbfc");
  const topSpacer = winStart * ROW_HEIGHT;
  const bottomSpacer = Math.max(0, totalLines - winEnd) * ROW_HEIGHT;
  const spacerCellStyle = { padding: 0, border: "none", height: "auto" };
  const colSpanAll = DETAIL_COLUMNS.length;
  const qtyCols = DETAIL_COLUMNS.filter((c) => c.qty);
  const detailMinWidth = DETAIL_COLUMNS.reduce((sum, c) => sum + c.width, 0);
  const detailPartyName = effectiveParty === "ALL" ? "All Parties" : (parties.find((p) => p.key === effectiveParty)?.name || "");
  const tableBoxStyle = { width: "100%", maxHeight: "30rem", overflow: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, boxShadow: theme.shadows.md, background: theme.colors.white };
  const openingLabel = isAllTime ? "Opening Balance" : isQuick ? "Opening Balance (b/f from earlier dates)" : "Opening Balance (b/f from previous quarter)";
  const totalLabel = isAllTime ? "Total" : isQuick ? "Period Total" : "Quarter Total";
  const closingLabel = isAllTime || isQuick ? "Closing Balance" : "Closing Balance (next quarter opening)";

  const renderDetailLine = (line) => {
    const numStyle = { fontVariantNumeric: "tabular-nums" };
    switch (line.t) {
      case "party":
        return (
          <tr key={line.key}>
            <td colSpan={colSpanAll} style={{ ...fixedCellStyle, textAlign: "left", background: theme.colors.bgHeader, fontWeight: 700, fontSize: "0.95rem", padding: "4px 16px" }}>
              {line.p.name}<span style={{ fontWeight: 500, fontSize: "0.8rem", marginLeft: 12 }}>{line.p.challans} challan(s)</span>
            </td>
          </tr>
        );
      case "open":
        return (
          <tr key={line.key}>
            <td colSpan={colSpanAll - 1} style={{ ...fixedCellStyle, textAlign: "right", background: "#fef9c3", fontWeight: 700 }}>{openingLabel}</td>
            <td style={{ ...fixedCellStyle, background: "#fef9c3", fontWeight: 700, ...numStyle, ...negColor(line.p.opening) }}>{fmt(line.p.opening)}</td>
          </tr>
        );
      case "row": {
        const r = line.r;
        const base = { ...fixedCellStyle, background: zebra(line.i) };
        return (
          <tr key={line.key}>
            <td style={base}><span style={{ ...numStyle, fontSize: "0.8rem" }}>{formatShortDate(r.challanDate)}</span></td>
            <td style={base}><div style={clampStyle} title={String(r.challanNo)}>{r.challanNo}</div></td>
            <td style={{ ...base, fontWeight: 500 }}><div style={clampStyle} title={String(r.jobNo)}>{r.jobNo}</div></td>
            <td style={base}><div style={clampStyle} title={String(r.composition)}>{r.composition}</div></td>
            <td style={base}>
              {r.color && r.color !== "-" ? (
                <div style={clampStyle} title={r.color}>
                  <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, background: "#f1f5f9", fontSize: "0.8rem", fontWeight: 500 }}>{r.color}</span>
                </div>
              ) : "-"}
            </td>
            {qtyCols.map((c) => (<td key={c.key} style={{ ...base, ...numStyle }}>{fmt(r[c.key])}</td>))}
            <td style={{ ...base, ...numStyle, fontWeight: 600, ...negColor(r.balance) }}>{fmt(r.balance)}</td>
          </tr>
        );
      }
      case "empty":
        return (
          <tr key={line.key}>
            <td colSpan={colSpanAll} style={{ ...fixedCellStyle, opacity: 0.6 }}>No challan in this period (opening balance only)</td>
          </tr>
        );
      case "total": {
        const tdTot = { ...fixedCellStyle, background: "#f5d8c9", fontWeight: 700, ...numStyle };
        return (
          <tr key={line.key}>
            <td colSpan={5} style={{ ...tdTot, textAlign: "right" }}>{totalLabel}</td>
            {qtyCols.map((c) => (<td key={c.key} style={tdTot}>{fmt(line.p[c.key])}</td>))}
            <td style={tdTot} />
          </tr>
        );
      }
      case "close":
        return (
          <tr key={line.key}>
            <td colSpan={colSpanAll - 1} style={{ ...fixedCellStyle, textAlign: "right", background: "#d1fae5", fontWeight: 700 }}>{closingLabel}</td>
            <td style={{ ...fixedCellStyle, background: "#d1fae5", fontWeight: 800, ...numStyle, ...negColor(line.p.closing) }}>{fmt(line.p.closing)}</td>
          </tr>
        );
      case "gap":
      default:
        return (
          <tr key={line.key}>
            <td colSpan={colSpanAll} style={{ height: ROW_HEIGHT, border: "none", background: "#fff", padding: 0, boxSizing: "border-box" }} />
          </tr>
        );
    }
  };

  const inlineLoader = (text) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 40, color: theme.colors.textMuted }}>
      <Loader size={20} className="animate-spin" /> {text}
    </div>
  );

  // one table (Knitting / Dyeing / AOP) of the Summary tab
  const renderOverviewSection = (type) => {
    const c = ORDER_CONFIG[type];
    const fin = !!c.finish;
    const rows = overviewRows[type] || [];
    const monthsLoading = !quickMode && overviewMonthsApis[type].loading;
    const num = { fontVariantNumeric: "tabular-nums" };
    const headers = [quickMode ? "Period (Details)" : "Quarter (Details)", "Opening Balance", c.delivery, c.ret, c.received, ...(fin ? [c.finish] : []), "Party Stock"];
    const partyHeaders = ["Party / Factory", "Challans", "Opening Balance", c.delivery, c.ret, c.received, ...(fin ? [c.finish] : []), "Closing Balance"];
    const qtyKeys = [
      { key: "yarnDelivery", header: c.delivery },
      { key: "yarnReturn", header: c.ret },
      { key: "greyFabricReceived", header: c.received },
      ...(fin ? [{ key: "finishReceived", header: c.finish }] : []),
    ];
    // a quantity cell; clickable when not zero -> opens the Challan Detail of that order tab, already filtered
    const qtyCell = (src, q, period, partyKey, bg) => {
      const clickable = !isZero(src[q.key]);
      return (
        <td
          key={q.key}
          onClick={clickable ? () => openFromOverview(type, period, partyKey, q.key) : undefined}
          title={clickable ? `Click to see ${c.title} - ${q.header} details` : undefined}
          style={{ ...cellStyle, ...num, background: bg, ...(clickable ? linkCellStyle : {}) }}
        >
          {fmt(src[q.key])}
        </td>
      );
    };
    return (
      <div key={type} style={{ marginBottom: 24 }}>
        <div style={{ padding: "8px 16px", marginBottom: 8, background: theme.colors.bgHeader, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, fontWeight: 700, fontSize: "0.95rem" }}>
          {c.title}
        </div>
        {monthsLoading ? inlineLoader(`Loading ${c.title} data...`) : (
          <div style={tableBoxStyle}>
            <table style={{ width: "100%", minWidth: 1000, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
              <thead>
                <tr>{headers.map((h, i) => (<th key={`${h}-${i}`} style={{ ...thStickyStyle, width: i === 0 ? 260 : 130 }}>{h}</th>))}</tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const dk = `${type}|${row.id}`;
                  const isOpen = !!openDetails[dk];
                  if (!row.loaded) {
                    return (
                      <tr key={row.id}>
                        <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, background: zebra(idx) }}>{row.label}</td>
                        <td colSpan={headers.length - 1} style={{ ...cellStyle, background: zebra(idx) }}>Loading...</td>
                      </tr>
                    );
                  }
                  const t = row.totals;
                  return (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, background: zebra(idx) }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span>{row.label}</span>
                            <button
                              type="button"
                              onClick={() => setOpenDetails((s) => ({ ...s, [dk]: !s[dk] }))}
                              style={{ background: isOpen ? theme.colors.primary : theme.colors.white, color: isOpen ? theme.colors.white : theme.colors.textMain, border: `1px solid ${theme.colors.border}`, borderRadius: 6, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, padding: "4px 10px", fontFamily: "inherit" }}
                            >
                              {isOpen ? "Hide Details" : "Details"}
                            </button>
                          </div>
                        </td>
                        <td style={{ ...cellStyle, ...num, background: "#fef9c3", ...negColor(t.opening) }}>{fmt(t.opening)}</td>
                        {qtyKeys.map((q) => qtyCell(t, q, row.period, "ALL", zebra(idx)))}
                        <td style={{ ...cellStyle, ...num, fontWeight: 700, background: "#d1fae5", ...negColor(t.closing) }}>{fmt(t.closing)}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={headers.length} style={{ padding: 12, background: "#f8fafc", borderBottom: `1px solid ${theme.colors.border}` }}>
                            <div style={{ ...tableBoxStyle, maxHeight: "20rem" }}>
                              <table style={{ width: "100%", minWidth: 900, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
                                <thead>
                                  <tr>{partyHeaders.map((h, i) => (<th key={`${h}-${i}`} style={{ ...thStickyStyle, width: i === 0 ? 260 : 130 }}>{h}</th>))}</tr>
                                </thead>
                                <tbody>
                                  {row.parties.map((p, pi) => (
                                    <tr key={p.key}>
                                      <td
                                        onClick={() => openFromOverview(type, row.period, p.key, "")}
                                        title="Click to see all details of this party"
                                        style={{ ...cellStyle, textAlign: "left", background: zebra(pi), ...linkCellStyle }}
                                      >
                                        {p.name}
                                      </td>
                                      <td style={{ ...cellStyle, background: zebra(pi) }}>{p.challans}</td>
                                      <td style={{ ...cellStyle, ...num, background: "#fef9c3", ...negColor(p.opening) }}>{fmt(p.opening)}</td>
                                      {qtyKeys.map((q) => qtyCell(p, q, row.period, p.key, zebra(pi)))}
                                      <td style={{ ...cellStyle, ...num, fontWeight: 700, background: "#d1fae5", ...negColor(p.closing) }}>{fmt(p.closing)}</td>
                                    </tr>
                                  ))}
                                  {row.parties.length === 0 && (
                                    <tr><td colSpan={partyHeaders.length} style={{ ...cellStyle, padding: 24 }}>No data found.</td></tr>
                                  )}
                                </tbody>
                                {row.parties.length > 0 && (
                                  <tfoot>
                                    <tr>
                                      <td style={{ ...tfootCellStyle, textAlign: "left", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}>Grand Total</td>
                                      <td style={tfootCellStyle}>{t.challans}</td>
                                      <td style={tfootCellStyle}>{fmt(t.opening)}</td>
                                      <td style={tfootCellStyle}>{fmt(t.yarnDelivery)}</td>
                                      <td style={tfootCellStyle}>{fmt(t.yarnReturn)}</td>
                                      <td style={tfootCellStyle}>{fmt(t.greyFabricReceived)}</td>
                                      {fin && <td style={tfootCellStyle}>{fmt(t.finishReceived)}</td>}
                                      <td style={tfootCellStyle}>{fmt(t.closing)}</td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={headers.length} style={{ ...cellStyle, padding: 40 }}>No data found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: "100%", padding: 24, fontFamily: FONT_STACK, color: theme.colors.textMain }}>
      {/* Tabs: Summary tab + Knitting / Dyeing / AOP tabs (same design as the Daily Transaction page) */}
      <div className="border-b flex gap-3 pb-2 mb-3">
        <button
          type="button"
          onClick={() => setView("overview")}
          className={`p-2 text-white cursor-pointer font-bold rounded-md ${view === "overview" ? "bg-blue-900" : "bg-slate-800"}`}
        >
          Summary
        </button>
        {ORDER_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleOrderTab(type)}
            className={`p-2 text-white cursor-pointer font-bold rounded-md ${view !== "overview" && type === selectOrderType ? "bg-blue-900" : "bg-slate-800"}`}
          >
            {ORDER_CONFIG[type]?.title || type}
          </button>
        ))}
      </div>

      {/* Toolbar (always usable) */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Calendar size={18} color={theme.colors.textMain} />
        <select value={fyStartMonth} onChange={(e) => handleFyChange(Number(e.target.value))} style={selectStyle} title="Quarter type">
          <option value={1}>Calendar Quarter (Jan-Dec)</option>
          <option value={7}>Fiscal Quarter (Jul-Jun)</option>
        </select>
        {view !== "overview" && (
          <>
            <select value={activeQuarter.key} onChange={(e) => handleQuarterChange(e.target.value)} style={{ ...selectStyle, minWidth: 230 }} title="Period">
              <option value={ALL_KEY}>{ALL_PERIOD.title}</option>
              {customPeriod && !quarterOptions.some((q) => q.key === customPeriod.key) && (
                <option value={customPeriod.key}>{customPeriod.title}</option>
              )}
              {quarterOptions.map((q) => (<option key={q.key} value={q.key}>{q.title}</option>))}
            </select>
            <select value={effectiveParty} onChange={(e) => setSelectedParty(e.target.value)} style={{ ...selectStyle, minWidth: 200 }} title="Party">
              <option value="ALL">All Parties ({parties.length})</option>
              {parties.map((p) => (<option key={p.key} value={p.key}>{p.name}</option>))}
            </select>
            {view === "detail" && (
              <select value={activeType} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...selectStyle, minWidth: 190 }} title="Transaction type">
                <option value="">All Types</option>
                {qtyOptions.map((t) => (<option key={t.key} value={t.key}>{t.header}</option>))}
              </select>
            )}
            <button style={toolbarBtn(view === "summary")} onClick={() => setView("summary")}>Party Summary</button>
            <button style={toolbarBtn(view === "detail")} onClick={() => setView("detail")}>Challan Detail</button>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button style={toolbarBtn(false, busy)} onClick={refresh} disabled={busy} title="Reload from the server">
          {busy ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
        <button
          style={toolbarBtn(false, isExporting || (view === "overview" ? !overviewReady : !summaryApi.data))}
          onClick={view === "overview" ? handleOverviewExport : handleExport}
          disabled={isExporting || (view === "overview" ? !overviewReady : !summaryApi.data)}
          title="Export Excel"
        >
          {isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} {isExporting ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: theme.radius, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <X size={16} />
          <span>{error}</span>
          <button onClick={refresh} style={{ background: theme.colors.primary, color: theme.colors.white, border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, padding: "6px 14px", fontFamily: "inherit" }}>
            Retry
          </button>
        </div>
      )}

      {view !== "overview" && summaryApi.data && (
        <div style={{ marginBottom: 12, padding: "10px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: theme.radius, display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.875rem", color: "#065f46" }}>
          <strong>{cfg.title}: {activeQuarter.title}</strong>
          <span>{visibleParties.length} part{visibleParties.length === 1 ? "y" : "ies"}</span>
          <span>
            {isAllTime
              ? "Showing all data. Pick a quarter or a party above to filter."
              : isQuick ? "Opening = auto carried from all dates before this period" : "Opening = auto carried from all previous quarters"}
          </span>
          <span>Balance = {cfg.delivery} - {cfg.ret} - {cfg.received}</span>
          {hasFinish && <span>{cfg.finish} is shown for information</span>}
        </div>
      )}

      {/* ===== SUMMARY TAB (Knitting + Dyeing + AOP, quarter wise) ===== */}
      {view === "overview" && (
        <>
          {/* Quick filter (top of the tables) */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "0.875rem" }}>Quick filter</strong>
            {QUICK_FILTERS.map((q) => (
              <button key={q.key} style={toolbarBtn(quickFilter === q.key)} onClick={() => setQuickFilter(q.key)}>{q.label}</button>
            ))}
          </div>
          <div style={{ marginBottom: 12, padding: "10px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: theme.radius, display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.875rem", color: "#065f46" }}>
            <strong>{quickMode ? quickRange.title : "Quarter Wise"}</strong>
            <span>{quickMode ? "Opening = auto carried from all dates before this period" : "Opening = auto carried from the previous quarter"}</span>
            <span>Party Stock = Opening + Delivery - Return - Received</span>
            <span>Click a quantity to see its details in the Knitting / Dyeing / AOP tab</span>
          </div>
          {ORDER_TYPES.map(renderOverviewSection)}
        </>
      )}

      {/* ===== PARTY SUMMARY VIEW ===== */}
      {view === "summary" && (
        summaryApi.loading ? inlineLoader(`Loading ${cfg.title} data...`) : (
          <div style={tableBoxStyle}>
            <table style={{ width: "100%", minWidth: 1000, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
              <thead>
                <tr>{summaryHeaders.map((h, i) => (<th key={`${h}-${i}`} style={{ ...thStickyStyle, width: i === 0 ? 260 : 130 }}>{h}</th>))}</tr>
              </thead>
              <tbody>
                {visibleParties.map((p, idx) => (
                  <tr key={p.key} style={{ cursor: "pointer" }} onClick={() => { setSelectedParty(p.key); setTypeFilter(""); setView("detail"); }} title="Click to see challan detail">
                    <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, background: zebra(idx) }}>{p.name}</td>
                    <td style={{ ...cellStyle, background: zebra(idx) }}>{p.challans}</td>
                    <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: "#fef9c3", ...negColor(p.opening) }}>{fmt(p.opening)}</td>
                    <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: zebra(idx) }}>{fmt(p.yarnDelivery)}</td>
                    <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: zebra(idx) }}>{fmt(p.yarnReturn)}</td>
                    <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: zebra(idx) }}>{fmt(p.greyFabricReceived)}</td>
                    {hasFinish && <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: zebra(idx) }}>{fmt(p.finishReceived)}</td>}
                    <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", fontWeight: 700, background: "#d1fae5", ...negColor(p.closing) }}>{fmt(p.closing)}</td>
                  </tr>
                ))}
                {visibleParties.length === 0 && (
                  <tr><td colSpan={summaryHeaders.length} style={{ ...cellStyle, padding: 40 }}>No data found.</td></tr>
                )}
              </tbody>
              {visibleParties.length > 0 && (
                <tfoot>
                  <tr>
                    <td style={{ ...tfootCellStyle, textAlign: "left", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}>Grand Total</td>
                    <td style={tfootCellStyle}>{grand.challans}</td>
                    <td style={tfootCellStyle}>{fmt(grand.opening)}</td>
                    <td style={tfootCellStyle}>{fmt(grand.yarnDelivery)}</td>
                    <td style={tfootCellStyle}>{fmt(grand.yarnReturn)}</td>
                    <td style={tfootCellStyle}>{fmt(grand.greyFabricReceived)}</td>
                    {hasFinish && <td style={tfootCellStyle}>{fmt(grand.finishReceived)}</td>}
                    <td style={tfootCellStyle}>{fmt(grand.closing)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )
      )}

      {/* ===== CHALLAN DETAIL VIEW (windowed) ===== */}
      {view === "detail" && (
        summaryApi.loading || detailApi.loading ? inlineLoader("Loading challan detail...") : (
          <>
            {activeType && (
              <div style={{ marginBottom: 12, padding: "10px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: theme.radius, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, fontSize: "0.875rem", color: "#1e3a8a" }}>
                <strong>{cfg.title} - {activeTypeHeader} details</strong>
                <span>{detailPartyName}</span>
                <span>{activeQuarter.title}</span>
                <span>Total: <strong>{fmt(grand[activeType])}</strong></span>
                <button onClick={() => setTypeFilter("")} style={{ background: theme.colors.white, color: "#1e3a8a", border: "1px solid #93c5fd", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, padding: "4px 12px", fontFamily: "inherit" }}>Show all types</button>
                <button onClick={() => setView("overview")} style={{ background: theme.colors.white, color: "#1e3a8a", border: "1px solid #93c5fd", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, padding: "4px 12px", fontFamily: "inherit" }}>Back to Summary</button>
              </div>
            )}
            {detailApi.data?.truncated && (
              <div style={{ marginBottom: 12, padding: "10px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: theme.radius, fontSize: "0.85rem", color: "#92400e", fontWeight: 600 }}>
                Too many rows to show at once. Pick a single party or a quarter to see everything.
              </div>
            )}
            <div ref={tableScrollRef} onScroll={handleDetailScroll} style={tableBoxStyle}>
              <table style={{ width: "100%", minWidth: detailMinWidth, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
                <thead>
                  <tr>{DETAIL_COLUMNS.map((c) => (<th key={c.key} style={{ ...thStickyStyle, width: c.width }}>{c.header}</th>))}</tr>
                </thead>
                <tbody>
                  {topSpacer > 0 && (<tr aria-hidden="true" style={{ height: topSpacer }}><td colSpan={colSpanAll} style={spacerCellStyle} /></tr>)}
                  {windowLines.map(renderDetailLine)}
                  {bottomSpacer > 0 && (<tr aria-hidden="true" style={{ height: bottomSpacer }}><td colSpan={colSpanAll} style={spacerCellStyle} /></tr>)}
                  {detailParties.length === 0 && (<tr><td colSpan={colSpanAll} style={{ ...cellStyle, padding: 40 }}>No data found.</td></tr>)}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default QuarterlyBalance;