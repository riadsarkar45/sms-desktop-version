import React, { useEffect, useMemo, useState } from "react";
import { Loader, Download, RefreshCw, Calendar } from "lucide-react";
import { useFetchData } from "../../hooks/fetch";

// ===================== CONFIG =====================
const FINISH_IN_BALANCE = false;

const ORDER_CONFIG = {
  knittingOrder: {
    title: "Knitting",
    delivery: "Yarn Delivery",
    ret: "Yarn Return",
    received: "Greige Received",
    finish: null,
    filePrefix: "Knitting_Daily_Transaction",
  },
  dyeingOrder: {
    title: "Dyeing",
    delivery: "Grey Delivery",
    ret: "Grey Return",
    received: "Grey Received",
    finish: "Finish Received",
    filePrefix: "Dyeing_Daily_Transaction",
  },
  aopOrder: {
    title: "AOP",
    delivery: "Sent For AOP",
    ret: "AOP Return",
    received: "Received From AOP",
    finish: "AOP Finish Fabric Rcvd",
    filePrefix: "AOP_Daily_Transaction",
  },
};

const getDetailColumns = (cfg) => [
  { header: "Date", key: "challanDate", width: 110 },
  { header: "Challan No", key: "challanNo", width: 120 },
  { header: "Party / Factory", key: "party", width: 220 },
  { header: "Job No", key: "jobNo", width: 140 },
  { header: "Composition", key: "composition", width: 260 },
  { header: "Color", key: "color", width: 170 },
  { header: cfg.delivery, key: "yarnDelivery", width: 120 },
  { header: cfg.ret, key: "yarnReturn", width: 120 },
  { header: cfg.received, key: "greyFabricReceived", width: 130 },
  ...(cfg.finish ? [{ header: cfg.finish, key: "finishReceived", width: 140 }] : []),
  { header: "Net Movement", key: "net", width: 130 },
];

const getXlDetailWidths = (cfg) => [
  13, 14, 30, 18, 34, 22, 15, 15, 17, ...(cfg.finish ? [20] : []), 16,
];

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
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
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

const toolbarBtn = (active, disabled) => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  background: active ? theme.colors.primary : theme.colors.white,
  color: active ? theme.colors.white : theme.colors.textMain,
  padding: "10px 16px", borderRadius: theme.radius, border: `1px solid ${theme.colors.border}`,
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.7 : 1,
  fontSize: "0.875rem", fontWeight: 500, fontFamily: "inherit",
});
const selectStyle = {
  padding: "10px 12px", borderRadius: theme.radius, border: `1px solid ${theme.colors.border}`,
  fontSize: "0.875rem", fontFamily: "inherit", background: theme.colors.white,
  color: theme.colors.textMain, outline: "none", cursor: "pointer",
};

// ===================== LOGIC HELPERS =====================
const balanceOf = (r) =>
  (Number(r.yarnDelivery) || 0) -
  (Number(r.yarnReturn) || 0) -
  (Number(r.greyFabricReceived) || 0) -
  (FINISH_IN_BALANCE ? Number(r.finishReceived) || 0 : 0);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const isZero = (n) => Math.abs(Number(n) || 0) < 0.005;
const fmt = (n) => (isZero(n) ? "-" : Number(n).toFixed(2));

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");

const normalizeDate = (val) => {
  if (!val) return "";
  if (val instanceof Date) return isNaN(val.getTime()) ? "" : val.toISOString();
  const str = String(val);
  const matches = str.match(ISO_DATE_RE);
  if (!matches || matches.length === 0) return str;
  return [...matches].sort()[0];
};
const formatShortDate = (val) => {
  const normalized = normalizeDate(val);
  if (!normalized) return "-";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "-";
  return `${d.getUTCDate()}-${MONTH_SHORT[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
};
const getDayKey = (val) => {
  const normalized = normalizeDate(val);
  if (!normalized) return "";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};
const localDayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const pickChallanDate = (source, parent) => {
  const primary = source?.deliveryDate || source?.challanDate || parent?.deliveryDate || parent?.challanDate;
  if (primary) return { date: normalizeDate(primary), fallback: false };
  const last = source?.date || parent?.date || source?.challanDate || parent?.challanDate;
  if (last) return { date: normalizeDate(last), fallback: true };
  return { date: "", fallback: false };
};

const cleanFactoryName = (name) => String(name || "").replace(/\s+/g, " ").trim();
const factoryKey = (name) => String(name || "Unknown").replace(/\s+/g, " ").trim().toLowerCase();
const extractFactoryName = (item) => cleanFactoryName(item?.workOrder?.factoryName || item?.factoryName || "");

const rowPairKey = (r) => [r.challanNo, r.jobNo, r.composition, r.color].map((v) => String(v ?? "").trim().toLowerCase()).join("|");

const buildReturnIndex = (rows) => {
  const set = new Set();
  rows.forEach((r) => {
    if ((Number(r.yarnReturn) || 0) > 0) {
      set.add(`${rowPairKey(r)}|${factoryKey(r.fromFactory)}|${factoryKey(r.toFactory)}`);
    }
  });
  return set;
};

const isTransferDelivery = (row, returnIndex) =>
  !!returnIndex && returnIndex.has(`${rowPairKey(row)}|${factoryKey(row.toFactory)}|${factoryKey(row.fromFactory)}`);

const splitRowByParty = (row, returnIndex) => {
  if (row.factoryName) return [{ party: row.factoryName, row, usedFallback: false }];
  const transfer = isTransferDelivery(row, returnIndex);
  const deliveryParty = cleanFactoryName(transfer ? row.fromFactory : row.toFactory) || "Unknown";
  const backParty = cleanFactoryName(row.fromFactory) || "Unknown";
  const delivery = Number(row.yarnDelivery) || 0;
  const yarnRet = Number(row.yarnReturn) || 0;
  const greige = Number(row.greyFabricReceived) || 0;
  const finish = Number(row.finishReceived) || 0;
  const hasDelivery = delivery > 0;
  const hasBack = yarnRet > 0 || greige > 0 || finish > 0;

  if (hasDelivery && hasBack) {
    if (deliveryParty.toLowerCase() === backParty.toLowerCase()) return [{ party: deliveryParty, row, usedFallback: true }];
    return [
      { party: deliveryParty, row: { ...row, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0 }, usedFallback: true },
      { party: backParty, row: { ...row, yarnDelivery: 0 }, usedFallback: true },
    ];
  }
  if (hasDelivery) return [{ party: deliveryParty, row, usedFallback: true }];
  if (hasBack) return [{ party: backParty, row, usedFallback: true }];
  return [{ party: cleanFactoryName(row.toFactory) || cleanFactoryName(row.fromFactory) || "Unknown", row, usedFallback: true }];
};

const sumRows = (rows) => {
  const t = { yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0, net: 0 };
  rows.forEach((r) => {
    t.yarnDelivery += Number(r.yarnDelivery) || 0;
    t.yarnReturn += Number(r.yarnReturn) || 0;
    t.greyFabricReceived += Number(r.greyFabricReceived) || 0;
    t.finishReceived += Number(r.finishReceived) || 0;
    t.net += balanceOf(r);
  });
  Object.keys(t).forEach((k) => { t[k] = round2(t[k]); });
  return t;
};

// ===================== EXCEL HELPERS =====================
const XL = { title: "FF1E293B", header: "FF657582", zebra: "FFF8FAFC", total: "FFF5D8C9", opening: "FFFEF9C3", closing: "FFD1FAE5", line: "FFCBD5E1", white: "FFFFFFFF", text: "FF0F172A" };
const XL_NUM_FMT = '#,##0.00;[Red]-#,##0.00;"-"';
const xlThin = { style: "thin", color: { argb: XL.line } };
const xlBorder = { top: xlThin, left: xlThin, bottom: xlThin, right: xlThin };
const xlFill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

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

// ===================== COMPONENT =====================
const DailyTransaction = () => {
  const [movements, setMovements] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Empty string = "auto" (latest date that has data)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedParty, setSelectedParty] = useState("ALL");
  const [view, setView] = useState("summary");
  const [isExporting, setIsExporting] = useState(false);
  const [fetchAll, setFetchAll] = useState(false);

  // DEFAULT TO KNITTING ORDER
  const [selectOrderType, setSelectOrderType] = useState("knittingOrder");

  const { fetchData, loading } = useFetchData();

  const cfg = ORDER_CONFIG[selectOrderType] || ORDER_CONFIG.knittingOrder;
  const hasFinish = !!cfg.finish;
  const DETAIL_COLUMNS = useMemo(() => getDetailColumns(cfg), [cfg]);

  // ===================== SINGLE FETCH EFFECT =====================
  useEffect(() => {
    setFetchError(null);
    setMovements([]);

    const queryParams = new URLSearchParams();
    if (fetchAll) queryParams.append("fetchAll", "true");
    const queryString = queryParams.toString();

    const url = `/api/challan-movement/${selectOrderType}${queryString ? "?" + queryString : ""}`;

    fetchData(url)
      .then((res) => {
        let payload = [];
        if (Array.isArray(res)) payload = res;
        else if (res?.data && Array.isArray(res.data)) payload = res.data;
        else if (res?.data?.data && Array.isArray(res.data.data)) payload = res.data.data;
        else if (Array.isArray(res?.rows)) payload = res.rows;
        else if (Array.isArray(res?.items)) payload = res.items;
        else if (res?.data?.rows && Array.isArray(res.data.rows)) payload = res.data.rows;

        setMovements(payload);
      })
      .catch((err) => {
        console.error("Fetch Error:", err);
        if (err?.response?.status === 403) setFetchError("Permission denied");
        else setFetchError(err?.response?.data?.message || err?.message || "Failed to load data");
      });
  }, [fetchData, selectOrderType, fetchAll, refreshKey]);

  // ===================== DATA PROCESSING =====================
  const extractQty = (dv) => {
    if (dv?.deliveryQty !== undefined && dv?.deliveryQty !== null) {
      const num = Number(dv.deliveryQty);
      if (!isNaN(num)) return num;
    }
    const fallbacks = ["totalQty", "qty", "quantity", "weight", "kg", "amount"];
    for (const f of fallbacks) {
      if (dv[f] !== undefined && dv[f] !== null) {
        const num = Number(dv[f]);
        if (!isNaN(num)) return num;
      }
    }
    return 0;
  };

  const applyDelivery = (row, dv) => {
    const qty = extractQty(dv);
    const type = String(dv?.deliveryType || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

    if (type.includes("finish")) row.finishReceived += qty;
    else if (type === "yarndelivery" || type === "greydelivery" || type === "sentforaop" || type.includes("sentfor") || (type.includes("delivery") && !type.includes("received"))) {
      row.yarnDelivery += qty;
    } else if (type === "yarnreturn" || type === "greyreturn" || type === "aopreturn" || type.includes("return")) {
      row.yarnReturn += qty;
    } else if (type === "greyfabricreceived" || type === "greigereceived" || type === "greyreceived" || type === "receivedfromaop" || type.includes("received") || type.includes("rcvd")) {
      row.greyFabricReceived += qty;
    } else {
      row.greyFabricReceived += qty;
    }

    if (!row.toFactory && dv?.toFactory) row.toFactory = dv.toFactory;
    if (!row.fromFactory && dv?.fromFactory) row.fromFactory = dv.fromFactory;
    if (!row.challanDate && dv?.deliveryDate) row.challanDate = normalizeDate(dv.deliveryDate);
  };

  const allRows = useMemo(() => {
    if (!Array.isArray(movements)) return [];
    const rows = [];
    const extractJobNo = (item) => item?.workOrder?.jobNo || (typeof item?.workOrder === "string" ? item.workOrder : null);

    const makeRow = (challanNo, jobNo, comp, color, source, parent, mvId, deliveryId, factoryName) => {
      const stableId = deliveryId ?? mvId ?? source?.id ?? null;
      const { date, fallback } = pickChallanDate(source, parent);
      return {
        rowKey: `${challanNo}|${jobNo}|${comp}|${color}|${stableId ?? ""}`,
        challanNo, jobNo, composition: comp || "-", color: color || "-",
        challanDate: date, dateFallback: fallback, factoryName,
        toFactory: source?.toFactory || parent?.toFactory || "",
        fromFactory: source?.fromFactory || parent?.fromFactory || "",
        yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0,
      };
    };

    movements.forEach((item) => {
      if (!item) return;
      const jobNo = extractJobNo(item) || "-";
      const factoryName = extractFactoryName(item);

      if (Array.isArray(item.deliveries) && item.deliveries.length > 0) {
        item.deliveries.forEach((dv) => {
          const challanNo = dv?.challanNo;
          if (challanNo === undefined || challanNo === null) return;
          const comp = dv?.composition || item?.composition || "-";
          const color = dv?.color || item?.color || "-";
          const row = makeRow(challanNo, jobNo, comp, color, dv, item, item.id, dv.id, factoryName);
          applyDelivery(row, dv);
          rows.push(row);
        });
      } else if (item.challanNo !== undefined && item.challanNo !== null) {
        const row = makeRow(item.challanNo, jobNo, item.composition, item.color, item, null, item.id, item.id, factoryName);
        applyDelivery(row, item);
        rows.push(row);
      }
    });
    return rows;
  }, [movements]);

  const { entries, undatedCount, fallbackDateCount, noFactoryNameCount } = useMemo(() => {
    const returnIndex = buildReturnIndex(allRows);
    const list = [];
    let undated = 0, fallbackDates = 0, noFactoryName = 0;
    allRows.forEach((r) => {
      splitRowByParty(r, returnIndex).forEach((part) => {
        const day = getDayKey(part.row.challanDate);
        if (!day) { undated += 1; return; }
        if (part.row.dateFallback) fallbackDates += 1;
        if (part.usedFallback) noFactoryName += 1;
        list.push({ party: part.party, partyKey: factoryKey(part.party), day, row: part.row });
      });
    });
    return { entries: list, undatedCount: undated, fallbackDateCount: fallbackDates, noFactoryNameCount: noFactoryName };
  }, [allRows]);

  // ---------- Date range (auto = latest date that has data) ----------
  const latestDay = useMemo(() => entries.reduce((m, e) => (e.day > m ? e.day : m), ""), [entries]);

  const { rangeFrom, rangeTo } = useMemo(() => {
    let f = dateFrom || dateTo || latestDay;
    let t = dateTo || dateFrom || latestDay;
    if (f && t && f > t) [f, t] = [t, f];
    return { rangeFrom: f, rangeTo: t };
  }, [dateFrom, dateTo, latestDay]);

  const periodText = !rangeFrom
    ? "-"
    : rangeFrom === rangeTo
      ? formatShortDate(rangeFrom)
      : `${formatShortDate(rangeFrom)} to ${formatShortDate(rangeTo)}`;

  const rangeEntries = useMemo(() => {
    if (!rangeFrom) return [];
    return entries.filter((e) => e.day >= rangeFrom && e.day <= rangeTo);
  }, [entries, rangeFrom, rangeTo]);

  const partyOptions = useMemo(() => {
    const map = new Map();
    rangeEntries.forEach((e) => { if (!map.has(e.partyKey)) map.set(e.partyKey, cleanFactoryName(e.party) || "Unknown"); });
    return [...map.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rangeEntries]);

  const activePartyValid = selectedParty === "ALL" || partyOptions.some((p) => p.key === selectedParty);
  const visibleEntries = useMemo(
    () => (selectedParty === "ALL" || !activePartyValid ? rangeEntries : rangeEntries.filter((e) => e.partyKey === selectedParty)),
    [rangeEntries, selectedParty, activePartyValid]
  );

  // ---------- Summary (party wise) ----------
  const visibleParties = useMemo(() => {
    const groups = new Map();
    visibleEntries.forEach((e) => {
      if (!groups.has(e.partyKey)) groups.set(e.partyKey, { key: e.partyKey, name: cleanFactoryName(e.party) || "Unknown", rows: [] });
      groups.get(e.partyKey).rows.push(e.row);
    });
    const result = [];
    groups.forEach((g) => {
      const t = sumRows(g.rows);
      result.push({ ...g, ...t, challans: new Set(g.rows.map((r) => String(r.challanNo))).size });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleEntries]);

  // ---------- Details (date wise) ----------
  const dayGroups = useMemo(() => {
    const map = new Map();
    visibleEntries.forEach((e) => {
      if (!map.has(e.day)) map.set(e.day, []);
      map.get(e.day).push({ ...e.row, party: cleanFactoryName(e.party) || "Unknown", dayKey: e.day });
    });
    return [...map.keys()].sort().map((day) => {
      const rows = map.get(day).sort((a, b) => {
        const pc = a.party.localeCompare(b.party);
        if (pc !== 0) return pc;
        return String(a.challanNo).localeCompare(String(b.challanNo), undefined, { numeric: true });
      }).map((r) => ({ ...r, net: round2(balanceOf(r)) }));
      return { day, rows, ...sumRows(rows), challans: new Set(rows.map((r) => String(r.challanNo))).size };
    });
  }, [visibleEntries]);

  const grand = useMemo(() => {
    const t = sumRows(visibleEntries.map((e) => e.row));
    const challans = new Set(visibleEntries.map((e) => `${e.day}|${e.row.challanNo}`)).size;
    return { ...t, challans };
  }, [visibleEntries]);

  // ===================== EXPORT =====================
  const handleExport = async () => {
    if (!rangeFrom || visibleParties.length === 0) { alert("No data to export."); return; }
    setIsExporting(true);
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Garments ERP";
      wb.created = new Date();

      // ---------- Summary Sheet ----------
      const summaryWs = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
      const sumHeaders = ["Party / Factory", "Challans", cfg.delivery, cfg.ret, cfg.received, ...(hasFinish ? [cfg.finish] : []), "Net Movement"];
      const sumNumeric = new Set(Array.from({ length: sumHeaders.length - 1 }, (_, i) => i + 1));

      addTitleRow(summaryWs, `${cfg.title} Daily Transaction Summary  |  ${periodText}`, sumHeaders.length);
      addHeaderRow(summaryWs, sumHeaders, sumNumeric);

      visibleParties.forEach((p, idx) => {
        const row = summaryWs.addRow([p.name, p.challans, p.yarnDelivery, p.yarnReturn, p.greyFabricReceived, ...(hasFinish ? [p.finishReceived] : []), p.net]);
        styleBodyRow(row, idx, sumNumeric);
        row.getCell(2).numFmt = "#,##0";
      });

      const gRow = summaryWs.addRow(["GRAND TOTAL", grand.challans, grand.yarnDelivery, grand.yarnReturn, grand.greyFabricReceived, ...(hasFinish ? [grand.finishReceived] : []), grand.net]);
      styleSpecialRow(gRow, sumNumeric, XL.total, true);
      gRow.getCell(2).numFmt = "#,##0";
      [34, 11, 16, 16, 18, ...(hasFinish ? [22] : []), 17].forEach((w, i) => { summaryWs.getColumn(i + 1).width = w; });
      summaryWs.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      // ---------- Daily Details Sheet ----------
      const ws = wb.addWorksheet("Daily Details", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
      const colCount = DETAIL_COLUMNS.length;
      const netIdx = colCount - 1;
      const numericIdx = new Set(Array.from({ length: colCount - 6 }, (_, i) => i + 6));
      const blankRow = () => Array(colCount).fill("");

      addTitleRow(ws, `${cfg.title} Daily Transaction Details  |  ${periodText}`, colCount);
      addHeaderRow(ws, DETAIL_COLUMNS.map((c) => c.header), numericIdx);

      dayGroups.forEach((d) => {
        const dayVals = blankRow();
        dayVals[0] = `${formatShortDate(d.day)}   (${d.challans} challan${d.challans === 1 ? "" : "s"})`;
        styleSpecialRow(ws.addRow(dayVals), numericIdx, XL.opening);

        d.rows.forEach((r, idx) => {
          const row = ws.addRow([
            formatShortDate(r.challanDate), r.challanNo ?? "", r.party,
            r.jobNo === "-" ? "" : r.jobNo, r.composition === "-" ? "" : r.composition, r.color === "-" ? "" : r.color,
            Number(r.yarnDelivery) || 0, Number(r.yarnReturn) || 0, Number(r.greyFabricReceived) || 0,
            ...(hasFinish ? [Number(r.finishReceived) || 0] : []), r.net,
          ]);
          styleBodyRow(row, idx, numericIdx);
        });

        const totVals = blankRow();
        totVals[4] = "DAY TOTAL";
        totVals[6] = d.yarnDelivery; totVals[7] = d.yarnReturn; totVals[8] = d.greyFabricReceived;
        if (hasFinish) totVals[9] = d.finishReceived;
        totVals[netIdx] = d.net;
        styleSpecialRow(ws.addRow(totVals), numericIdx, XL.total, true);
        ws.addRow([]);
      });

      const grandVals = blankRow();
      grandVals[4] = "GRAND TOTAL";
      grandVals[6] = grand.yarnDelivery; grandVals[7] = grand.yarnReturn; grandVals[8] = grand.greyFabricReceived;
      if (hasFinish) grandVals[9] = grand.finishReceived;
      grandVals[netIdx] = grand.net;
      styleSpecialRow(ws.addRow(grandVals), numericIdx, XL.closing, true);

      getXlDetailWidths(cfg).forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateTag = rangeFrom === rangeTo ? rangeFrom : `${rangeFrom}_to_${rangeTo}`;
      link.setAttribute("download", `${cfg.filePrefix}_${dateTag}.xlsx`);
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

  const handleSelectOrderType = (type) => {
    setSelectOrderType(type);
    setSelectedParty("ALL");
  };

  const setQuickDate = (d) => { setDateFrom(d); setDateTo(d); setSelectedParty("ALL"); };
  const goToday = () => setQuickDate(localDayKey(new Date()));
  const goYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); setQuickDate(localDayKey(d)); };
  const goLatest = () => { setDateFrom(""); setDateTo(""); setSelectedParty("ALL"); };

  if (loading && movements.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: theme.colors.textMuted, fontFamily: FONT_STACK }}>
        <Loader size={24} className="animate-spin" style={{ marginRight: 10 }} /> Loading {cfg.title} Data...
      </div>
    );
  }
  if (fetchError) {
    return (
      <div style={{ padding: "12px 16px", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: theme.radius, margin: 20, fontFamily: FONT_STACK }}>
        {fetchError}
      </div>
    );
  }

  const orderTypes = ["knittingOrder", "dyeingOrder", "aopOrder"];
  const negColor = (n) => (Number(n) < -0.005 ? { color: "#b91c1c" } : {});
  const summaryHeaders = ["Party / Factory", "Challans", cfg.delivery, cfg.ret, cfg.received, ...(hasFinish ? [cfg.finish] : []), "Net Movement"];
  const labelSpan = 6; // Date, Challan, Party, Job, Composition, Color

  return (
    <div style={{ width: "100%", padding: 24, fontFamily: FONT_STACK, color: theme.colors.textMain }}>
      <div className="border-b flex gap-3 pb-2 mb-3">
        {orderTypes?.map((items, i) => (
          <div className={`p-2 text-white cursor-pointer font-bold rounded-md ${items === selectOrderType ? "bg-blue-900" : "bg-slate-800 "}`} key={i}>
            <span onClick={() => handleSelectOrderType(items)}>{ORDER_CONFIG[items]?.title || items}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Calendar size={18} color={theme.colors.textMain} />
        <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>From</label>
        <input type="date" value={rangeFrom || ""} onChange={(e) => { setDateFrom(e.target.value); setSelectedParty("ALL"); }} style={selectStyle} title="From challan date" />
        <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>To</label>
        <input type="date" value={rangeTo || ""} onChange={(e) => { setDateTo(e.target.value); setSelectedParty("ALL"); }} style={selectStyle} title="To challan date" />
        <button style={toolbarBtn(false)} onClick={goToday} title="Show today's challans">Today</button>
        <button style={toolbarBtn(false)} onClick={goYesterday} title="Show yesterday's challans">Yesterday</button>
        <button style={toolbarBtn(false)} onClick={goLatest} title="Jump to the latest date that has data">Latest</button>
        <select value={activePartyValid ? selectedParty : "ALL"} onChange={(e) => setSelectedParty(e.target.value)} style={{ ...selectStyle, minWidth: 200 }} title="Party">
          <option value="ALL">All Parties ({partyOptions.length})</option>
          {partyOptions.map((p) => (<option key={p.key} value={p.key}>{p.name}</option>))}
        </select>
        <button style={toolbarBtn(view === "summary")} onClick={() => setView("summary")}>Summary</button>
        <button style={toolbarBtn(view === "detail")} onClick={() => setView("detail")}>Details</button>
        <div style={{ flex: 1 }} />
        <button style={toolbarBtn(false, loading)} onClick={() => setRefreshKey((k) => k + 1)} disabled={loading} title="Reload data">
          {loading ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
        <button style={toolbarBtn(false, isExporting)} onClick={handleExport} disabled={isExporting} title="Export Excel">
          {isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} {isExporting ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {rangeFrom && (
        <div style={{ marginBottom: 12, padding: "10px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: theme.radius, display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.875rem", color: "#065f46" }}>
          <strong>{cfg.title} Daily Transaction: {periodText}</strong>
          <span>{visibleParties.length} part{visibleParties.length === 1 ? "y" : "ies"}</span>
          <span>{dayGroups.length} day{dayGroups.length === 1 ? "" : "s"} with challans</span>
          <span>Net Movement = {cfg.delivery} - {cfg.ret} - {cfg.received}</span>
          {hasFinish && !FINISH_IN_BALANCE && <span>{cfg.finish} is shown for information</span>}
        </div>
      )}

      <div style={{ marginBottom: 16, padding: "8px 16px", background: "#f8fafc", border: `1px solid ${theme.colors.borderDark}`, borderRadius: theme.radius, display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.8rem", color: "#334155" }}>
        <span><strong>Data loaded:</strong> {movements.length} API records</span>
        <span>{allRows.length} challan rows</span>
        <span>{entries.length} party entries</span>
        {noFactoryNameCount > 0 && <span style={{ color: "#b45309" }}>{noFactoryNameCount} entr{noFactoryNameCount === 1 ? "y has" : "ies have"} no factoryName</span>}
        {fallbackDateCount > 0 && <span style={{ color: "#b45309" }}>{fallbackDateCount} entr{fallbackDateCount === 1 ? "y uses" : "ies use"} created date</span>}
        {undatedCount > 0 && <span style={{ color: "#b91c1c" }}>{undatedCount} entr{undatedCount === 1 ? "y has" : "ies have"} no date</span>}
      </div>

      {view === "summary" && (
        <div style={{ width: "100%", maxHeight: "calc(100vh - 300px)", overflow: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, boxShadow: theme.shadows.md, background: theme.colors.white }}>
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <thead>
              <tr>{summaryHeaders.map((h, i) => (<th key={`${h}-${i}`} style={{ ...thStickyStyle, width: i === 0 ? 260 : 130 }}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {visibleParties.map((p, idx) => (
                <tr key={p.key} style={{ cursor: "pointer" }} onClick={() => { setSelectedParty(p.key); setView("detail"); }} title="Click to see details">
                  <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{p.name}</td>
                  <td style={{ ...cellStyle, background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{p.challans}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.yarnDelivery)}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.yarnReturn)}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.greyFabricReceived)}</td>
                  {hasFinish && <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.finishReceived)}</td>}
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", fontWeight: 700, background: "#d1fae5", ...negColor(p.net) }}>{fmt(p.net)}</td>
                </tr>
              ))}
              {visibleParties.length === 0 && <tr><td colSpan={summaryHeaders.length} style={{ ...cellStyle, padding: 40 }}>No transaction for this date.</td></tr>}
            </tbody>
            {visibleParties.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...tfootCellStyle, textAlign: "left", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}>Grand Total</td>
                  <td style={tfootCellStyle}>{grand.challans}</td>
                  <td style={tfootCellStyle}>{fmt(grand.yarnDelivery)}</td>
                  <td style={tfootCellStyle}>{fmt(grand.yarnReturn)}</td>
                  <td style={tfootCellStyle}>{fmt(grand.greyFabricReceived)}</td>
                  {hasFinish && <td style={tfootCellStyle}>{fmt(grand.finishReceived)}</td>}
                  <td style={tfootCellStyle}>{fmt(grand.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {view === "detail" && (
        <div style={{ width: "100%", maxHeight: "calc(100vh - 300px)", overflow: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, boxShadow: theme.shadows.md, background: theme.colors.white }}>
          <table style={{ width: "100%", minWidth: 1500, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <thead>
              <tr>{DETAIL_COLUMNS.map((c) => (<th key={c.key} style={{ ...thStickyStyle, width: c.width }}>{c.header}</th>))}</tr>
            </thead>
            <tbody>
              {dayGroups.map((d) => (
                <React.Fragment key={d.day}>
                  <tr>
                    <td colSpan={DETAIL_COLUMNS.length} style={{ ...cellStyle, textAlign: "left", background: theme.colors.bgHeader, fontWeight: 700, fontSize: "0.95rem", padding: "12px 16px" }}>
                      {formatShortDate(d.day)}<span style={{ fontWeight: 500, fontSize: "0.8rem", marginLeft: 12 }}>{d.challans} challan(s)</span>
                    </td>
                  </tr>
                  {d.rows.map((r, idx) => {
                    const bg = idx % 2 === 0 ? theme.colors.white : "#fafbfc";
                    const base = { ...cellStyle, background: bg };
                    return (
                      <tr key={`${d.day}-${r.rowKey}-${idx}`}>
                        <td style={base}><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "0.8rem" }}>{formatShortDate(r.challanDate)}</span></td>
                        <td style={base}>{r.challanNo}</td>
                        <td style={{ ...base, textAlign: "left", fontWeight: 600 }}>{r.party}</td>
                        <td style={{ ...base, fontWeight: 500 }}>{r.jobNo}</td>
                        <td style={base}>{r.composition}</td>
                        <td style={base}>{r.color && r.color !== "-" ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, background: "#f1f5f9", fontSize: "0.8rem", fontWeight: 500 }}>{r.color}</span> : "-"}</td>
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.yarnDelivery)}</td>
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.yarnReturn)}</td>
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.greyFabricReceived)}</td>
                        {hasFinish && <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.finishReceived)}</td>}
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums", fontWeight: 600, ...negColor(r.net) }}>{fmt(r.net)}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={labelSpan} style={{ ...cellStyle, textAlign: "right", background: "#f5d8c9", fontWeight: 700 }}>Day Total</td>
                    <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(d.yarnDelivery)}</td>
                    <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(d.yarnReturn)}</td>
                    <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(d.greyFabricReceived)}</td>
                    {hasFinish && <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(d.finishReceived)}</td>}
                    <td style={{ ...cellStyle, background: "#d1fae5", fontWeight: 800, fontVariantNumeric: "tabular-nums", ...negColor(d.net) }}>{fmt(d.net)}</td>
                  </tr>
                  <tr><td colSpan={DETAIL_COLUMNS.length} style={{ height: 14, border: "none", background: "#fff" }} /></tr>
                </React.Fragment>
              ))}
              {dayGroups.length === 0 && <tr><td colSpan={DETAIL_COLUMNS.length} style={{ ...cellStyle, padding: 40 }}>No transaction for this date.</td></tr>}
            </tbody>
            {dayGroups.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={labelSpan} style={{ ...tfootCellStyle, textAlign: "right", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}>Grand Total</td>
                  <td style={tfootCellStyle}>{fmt(grand.yarnDelivery)}</td>
                  <td style={tfootCellStyle}>{fmt(grand.yarnReturn)}</td>
                  <td style={tfootCellStyle}>{fmt(grand.greyFabricReceived)}</td>
                  {hasFinish && <td style={tfootCellStyle}>{fmt(grand.finishReceived)}</td>}
                  <td style={tfootCellStyle}>{fmt(grand.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
};

export default DailyTransaction;