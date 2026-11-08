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
    filePrefix: "Knitting_Quarterly_Balance",
  },
  dyeingOrder: {
    title: "Dyeing",
    delivery: "Grey Delivery",
    ret: "Grey Return",
    received: "Grey Received",
    finish: "Finish Received",
    filePrefix: "Dyeing_Quarterly_Balance",
  },
  aopOrder: {
    title: "AOP",
    delivery: "Sent For AOP",
    ret: "AOP Return",
    received: "Received From AOP",
    finish: "AOP Finish Fabric Rcvd",
    filePrefix: "AOP_Quarterly_Balance",
  },
};

const getDetailColumns = (cfg) => [
  { header: "Date", key: "challanDate", width: 110 },
  { header: "Challan No", key: "challanNo", width: 120 },
  { header: "Job No", key: "jobNo", width: 140 },
  { header: "Composition", key: "composition", width: 270 },
  { header: "Color", key: "color", width: 180 },
  { header: cfg.delivery, key: "yarnDelivery", width: 120 },
  { header: cfg.ret, key: "yarnReturn", width: 120 },
  { header: cfg.received, key: "greyFabricReceived", width: 130 },
  ...(cfg.finish ? [{ header: cfg.finish, key: "finishReceived", width: 140 }] : []),
  { header: "Balance", key: "balance", width: 130 },
];

const getXlDetailWidths = (cfg) => [
  13, 14, 18, 34, 22, 15, 15, 17, ...(cfg.finish ? [20] : []), 16,
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

const pickChallanDate = (source, parent) => {
  const primary = source?.deliveryDate || source?.challanDate || parent?.deliveryDate || parent?.challanDate;
  if (primary) return { date: normalizeDate(primary), fallback: false };
  const last = source?.date || parent?.date || source?.challanDate || parent?.challanDate;
  if (last) return { date: normalizeDate(last), fallback: true };
  return { date: "", fallback: false };
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

const getQuarterOf = (dayKey, fyStartMonth) => {
  const y = Number(dayKey.slice(0, 4));
  const m = Number(dayKey.slice(5, 7));
  const qIdx = Math.floor(((m - fyStartMonth + 12) % 12) / 3);
  const startMonth = ((fyStartMonth - 1 + qIdx * 3) % 12) + 1;
  const startYear = startMonth > m ? y - 1 : y;
  return buildQuarter(startYear, startMonth, fyStartMonth);
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

// ===================== COMPONENT =====================
const QuarterlyBalance = () => {
  const [movements, setMovements] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  const [fyStartMonth, setFyStartMonth] = useState(1);
  const [selectedQuarterKey, setSelectedQuarterKey] = useState("");
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
  // This runs on Mount (because selectOrderType is initialized) AND when dependencies change
  useEffect(() => {
    setFetchError(null);
    setMovements([]); // Clear previous data immediately
    
    const queryParams = new URLSearchParams();
    if (fetchAll) queryParams.append("fetchAll", "true");
    const queryString = queryParams.toString();
    
    const url = `/api/challan-movement/${selectOrderType}${queryString ? "?" + queryString : ""}`;
    
    console.log(`Fetching data for: ${selectOrderType} from ${url}`);

    fetchData(url)
      .then((res) => {
        console.log("API Response:", res);
        
        // Robust extraction
        let payload = [];
        if (Array.isArray(res)) payload = res;
        else if (res?.data && Array.isArray(res.data)) payload = res.data;
        else if (res?.data?.data && Array.isArray(res.data.data)) payload = res.data.data;
        else if (Array.isArray(res?.rows)) payload = res.rows;
        else if (Array.isArray(res?.items)) payload = res.items;
        else if (res?.data?.rows && Array.isArray(res.data.rows)) payload = res.data.rows;
        
        console.log(`Loaded ${payload.length} records.`);
        if (payload.length > 0) {
           console.log("Sample Record:", payload[0]);
        }
        
        setMovements(payload);
      })
      .catch((err) => {
        console.error("Fetch Error:", err);
        if (err?.response?.status === 403) setFetchError("Permission denied");
        else setFetchError(err?.response?.data?.message || err?.message || "Failed to load data");
      });
      
  }, [fetchData, selectOrderType, fetchAll, refreshKey]); 
  // ^ Dependencies ensure it fires on mount (selectOrderType exists) and on changes

  // ===================== DATA PROCESSING =====================
  const extractQty = (dv) => {
    if (dv?.deliveryQty !== undefined && dv?.deliveryQty !== null) {
      const num = Number(dv.deliveryQty);
      if (!isNaN(num)) return num;
    }
    const fallbacks = ['totalQty', 'qty', 'quantity', 'weight', 'kg', 'amount'];
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
      // Default fallback
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
         // Handle items without nested deliveries array if necessary
         // Assuming standard structure based on previous prompts, this block might be less used 
         // but kept for safety
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

  const quarterOptions = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      const q = getQuarterOf(e.day, fyStartMonth);
      if (!map.has(q.key)) map.set(q.key, q);
    });
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [entries, fyStartMonth]);

  const activeQuarter = useMemo(() => quarterOptions.find((q) => q.key === selectedQuarterKey) || quarterOptions[0] || null, [quarterOptions, selectedQuarterKey]);

  const parties = useMemo(() => {
    if (!activeQuarter) return [];
    const groups = new Map();
    entries.forEach((e) => {
      if (e.day >= activeQuarter.next) return;
      if (!groups.has(e.partyKey)) groups.set(e.partyKey, { key: e.partyKey, name: e.party, opening: 0, rows: [] });
      const g = groups.get(e.partyKey);
      if (e.day < activeQuarter.start) g.opening += balanceOf(e.row);
      else g.rows.push({ ...e.row, dayKey: e.day });
    });

    const result = [];
    groups.forEach((g) => {
      const opening = round2(g.opening);
      if (g.rows.length === 0 && isZero(opening)) return;
      g.rows.sort((a, b) => {
        if (a.dayKey !== b.dayKey) return a.dayKey < b.dayKey ? -1 : 1;
        return String(a.challanNo).localeCompare(String(b.challanNo), undefined, { numeric: true });
      });
      let running = opening;
      const tot = { yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0 };
      const rows = g.rows.map((r) => {
        running = round2(running + balanceOf(r));
        tot.yarnDelivery += Number(r.yarnDelivery) || 0;
        tot.yarnReturn += Number(r.yarnReturn) || 0;
        tot.greyFabricReceived += Number(r.greyFabricReceived) || 0;
        tot.finishReceived += Number(r.finishReceived) || 0;
        return { ...r, balance: running };
      });
      result.push({
        key: g.key, name: cleanFactoryName(g.name) || "Unknown", opening, rows,
        yarnDelivery: round2(tot.yarnDelivery), yarnReturn: round2(tot.yarnReturn),
        greyFabricReceived: round2(tot.greyFabricReceived), finishReceived: round2(tot.finishReceived),
        closing: running, challans: new Set(rows.map((r) => String(r.challanNo))).size,
      });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, activeQuarter]);

  const visibleParties = useMemo(() => selectedParty === "ALL" ? parties : parties.filter((p) => p.key === selectedParty), [parties, selectedParty]);
  const activePartyValid = selectedParty === "ALL" || parties.some((p) => p.key === selectedParty);

  const grand = useMemo(() => {
    const t = { opening: 0, yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0, closing: 0, challans: 0 };
    visibleParties.forEach((p) => Object.keys(t).forEach((k) => { t[k] += Number(p[k]) || 0; }));
    Object.keys(t).forEach((k) => { t[k] = round2(t[k]); });
    return t;
  }, [visibleParties]);

  const handleExport = async () => {
    if (!activeQuarter || visibleParties.length === 0) { alert("No data to export."); return; }
    setIsExporting(true);
    try {
      const mod = await import("exceljs");
      const ExcelJS = mod.default || mod;
      const wb = new ExcelJS.Workbook();
      wb.creator = "Garments ERP";
      wb.created = new Date();
      const periodText = `${activeQuarter.label}  (${activeQuarter.range})`;
      const summaryWs = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
      const usedNames = new Set(["summary"]);
      const colCount = DETAIL_COLUMNS.length;
      const balanceIdx = colCount - 1;
      const numericIdx = new Set(Array.from({ length: colCount - 5 }, (_, i) => i + 5));
      const blankRow = () => Array(colCount).fill("");

      visibleParties.forEach((p) => {
        const ws = wb.addWorksheet(makeSheetName(p.name, usedNames), { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
        addTitleRow(ws, `${p.name}  |  ${cfg.title} Quarterly Balance Confirmation  |  ${periodText}`, colCount);
        addHeaderRow(ws, DETAIL_COLUMNS.map((c) => c.header), numericIdx);
        const openVals = blankRow();
        openVals[3] = "OPENING BALANCE (b/f from previous quarter)";
        openVals[balanceIdx] = p.opening;
        styleSpecialRow(ws.addRow(openVals), numericIdx, XL.opening);
        p.rows.forEach((r, idx) => {
          const row = ws.addRow([formatShortDate(r.challanDate), r.challanNo ?? "", r.jobNo === "-" ? "" : r.jobNo, r.composition === "-" ? "" : r.composition, r.color === "-" ? "" : r.color, Number(r.yarnDelivery) || 0, Number(r.yarnReturn) || 0, Number(r.greyFabricReceived) || 0, ...(hasFinish ? [Number(r.finishReceived) || 0] : []), r.balance]);
          styleBodyRow(row, idx, numericIdx);
        });
        const totVals = blankRow();
        totVals[3] = "QUARTER TOTAL";
        totVals[5] = p.yarnDelivery; totVals[6] = p.yarnReturn; totVals[7] = p.greyFabricReceived;
        if (hasFinish) totVals[8] = p.finishReceived;
        styleSpecialRow(ws.addRow(totVals), numericIdx, XL.total, true);
        const closeVals = blankRow();
        closeVals[3] = "CLOSING BALANCE (next quarter opening)";
        closeVals[balanceIdx] = p.closing;
        styleSpecialRow(ws.addRow(closeVals), numericIdx, XL.closing);
        
        // Signatures
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

      // Summary Sheet
      const sumHeaders = ["Party / Factory", "Challans", "Opening Balance", cfg.delivery, cfg.ret, cfg.received, ...(hasFinish ? [cfg.finish] : []), "Closing Balance", "Confirmed by Factory", "Difference", "Remarks"];
      const closingIdx = sumHeaders.indexOf("Closing Balance");
      const confirmedIdx = closingIdx + 1;
      const diffIdx = closingIdx + 2;
      const sumNumeric = new Set(Array.from({ length: diffIdx }, (_, i) => i + 1));
      const confL = summaryWs.getColumn(confirmedIdx + 1).letter;
      const closL = summaryWs.getColumn(closingIdx + 1).letter;
      
      addTitleRow(summaryWs, `${cfg.title} Party Wise Quarterly Balance Summary  |  ${periodText}`, sumHeaders.length);
      addHeaderRow(summaryWs, sumHeaders, sumNumeric);
      
      visibleParties.forEach((p, idx) => {
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

  const handleSelectOrderType = (type) => {
    setSelectOrderType(type);
    // Reset view specific states if needed, but fetching is handled by useEffect
  };

  if (loading && movements.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: theme.colors.textMuted, fontFamily: FONT_STACK }}>
        <Loader size={24} className="animate-spin" style={{ marginRight: 10 }} /> Loading Knitting Data...
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
  const summaryHeaders = ["Party / Factory", "Challans", "Opening Balance", cfg.delivery, cfg.ret, cfg.received, ...(hasFinish ? [cfg.finish] : []), "Closing Balance"];

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
        <select value={fyStartMonth} onChange={(e) => setFyStartMonth(Number(e.target.value))} style={selectStyle} title="Quarter type">
          <option value={1}>Calendar Quarter (Jan-Dec)</option>
          <option value={7}>Fiscal Quarter (Jul-Jun)</option>
        </select>
        <select value={activeQuarter?.key || ""} onChange={(e) => setSelectedQuarterKey(e.target.value)} style={{ ...selectStyle, minWidth: 230 }} title="Quarter">
          {quarterOptions.length === 0 && <option value="">No quarters</option>}
          {quarterOptions.map((q) => (<option key={q.key} value={q.key}>{q.title}</option>))}
        </select>
        <select value={activePartyValid ? selectedParty : "ALL"} onChange={(e) => setSelectedParty(e.target.value)} style={{ ...selectStyle, minWidth: 200 }} title="Party">
          <option value="ALL">All Parties ({parties.length})</option>
          {parties.map((p) => (<option key={p.key} value={p.key}>{p.name}</option>))}
        </select>
        <button style={toolbarBtn(view === "summary")} onClick={() => setView("summary")}>Party Summary</button>
        <button style={toolbarBtn(view === "detail")} onClick={() => setView("detail")}>Challan Detail</button>
        <div style={{ flex: 1 }} />
        <button style={toolbarBtn(false, loading)} onClick={() => setRefreshKey((k) => k + 1)} disabled={loading} title="Reload data">
          {loading ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
        </button>
        <button style={toolbarBtn(false, isExporting)} onClick={handleExport} disabled={isExporting} title="Export Excel">
          {isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />} {isExporting ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {activeQuarter && (
        <div style={{ marginBottom: 12, padding: "10px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: theme.radius, display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.875rem", color: "#065f46" }}>
          <strong>{activeQuarter.title}</strong>
          <span>{visibleParties.length} part{visibleParties.length === 1 ? "y" : "ies"}</span>
          <span>Opening = auto carried from all previous quarters</span>
          <span>Balance = {cfg.delivery} - {cfg.ret} - {cfg.received}</span>
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
          <table style={{ width: "100%", minWidth: 1000, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <thead>
              <tr>{summaryHeaders.map((h, i) => (<th key={`${h}-${i}`} style={{ ...thStickyStyle, width: i === 0 ? 260 : 130 }}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {visibleParties.map((p, idx) => (
                <tr key={p.key} style={{ cursor: "pointer" }} onClick={() => { setSelectedParty(p.key); setView("detail"); }} title="Click to see challan detail">
                  <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{p.name}</td>
                  <td style={{ ...cellStyle, background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{p.challans}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: "#fef9c3", ...negColor(p.opening) }}>{fmt(p.opening)}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.yarnDelivery)}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.yarnReturn)}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.greyFabricReceived)}</td>
                  {hasFinish && <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: idx % 2 === 0 ? "#fff" : "#fafbfc" }}>{fmt(p.finishReceived)}</td>}
                  <td style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", fontWeight: 700, background: "#d1fae5", ...negColor(p.closing) }}>{fmt(p.closing)}</td>
                </tr>
              ))}
              {visibleParties.length === 0 && <tr><td colSpan={summaryHeaders.length} style={{ ...cellStyle, padding: 40 }}>No data for this quarter.</td></tr>}
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
      )}

      {view === "detail" && (
        <div style={{ width: "100%", maxHeight: "calc(100vh - 300px)", overflow: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, boxShadow: theme.shadows.md, background: theme.colors.white }}>
          <table style={{ width: "100%", minWidth: 1400, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
            <thead>
              <tr>{DETAIL_COLUMNS.map((c) => (<th key={c.key} style={{ ...thStickyStyle, width: c.width }}>{c.header}</th>))}</tr>
            </thead>
            <tbody>
              {visibleParties.map((p) => (
                <React.Fragment key={p.key}>
                  <tr>
                    <td colSpan={DETAIL_COLUMNS.length} style={{ ...cellStyle, textAlign: "left", background: theme.colors.bgHeader, fontWeight: 700, fontSize: "0.95rem", padding: "12px 16px" }}>
                      {p.name}<span style={{ fontWeight: 500, fontSize: "0.8rem", marginLeft: 12 }}>{p.challans} challan(s)</span>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={DETAIL_COLUMNS.length - 1} style={{ ...cellStyle, textAlign: "right", background: "#fef9c3", fontWeight: 700 }}>Opening Balance (b/f from previous quarter)</td>
                    <td style={{ ...cellStyle, background: "#fef9c3", fontWeight: 700, fontVariantNumeric: "tabular-nums", ...negColor(p.opening) }}>{fmt(p.opening)}</td>
                  </tr>
                  {p.rows.map((r, idx) => {
                    const bg = idx % 2 === 0 ? theme.colors.white : "#fafbfc";
                    const base = { ...cellStyle, background: bg };
                    return (
                      <tr key={`${p.key}-${r.rowKey}-${idx}`}>
                        <td style={base}><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "0.8rem" }}>{formatShortDate(r.challanDate)}</span></td>
                        <td style={base}>{r.challanNo}</td>
                        <td style={{ ...base, fontWeight: 500 }}>{r.jobNo}</td>
                        <td style={base}>{r.composition}</td>
                        <td style={base}>{r.color && r.color !== "-" ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, background: "#f1f5f9", fontSize: "0.8rem", fontWeight: 500 }}>{r.color}</span> : "-"}</td>
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.yarnDelivery)}</td>
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.yarnReturn)}</td>
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.greyFabricReceived)}</td>
                        {hasFinish && <td style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r.finishReceived)}</td>}
                        <td style={{ ...base, fontVariantNumeric: "tabular-nums", fontWeight: 600, ...negColor(r.balance) }}>{fmt(r.balance)}</td>
                      </tr>
                    );
                  })}
                  {p.rows.length === 0 && <tr><td colSpan={DETAIL_COLUMNS.length} style={{ ...cellStyle, opacity: 0.6 }}>No challan in this quarter (opening balance only)</td></tr>}
                  <tr>
                    <td colSpan={5} style={{ ...cellStyle, textAlign: "right", background: "#f5d8c9", fontWeight: 700 }}>Quarter Total</td>
                    <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(p.yarnDelivery)}</td>
                    <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(p.yarnReturn)}</td>
                    <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(p.greyFabricReceived)}</td>
                    {hasFinish && <td style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(p.finishReceived)}</td>}
                    <td style={{ ...cellStyle, background: "#f5d8c9" }} />
                  </tr>
                  <tr>
                    <td colSpan={DETAIL_COLUMNS.length - 1} style={{ ...cellStyle, textAlign: "right", background: "#d1fae5", fontWeight: 700 }}>Closing Balance (next quarter opening)</td>
                    <td style={{ ...cellStyle, background: "#d1fae5", fontWeight: 800, fontVariantNumeric: "tabular-nums", ...negColor(p.closing) }}>{fmt(p.closing)}</td>
                  </tr>
                  <tr><td colSpan={DETAIL_COLUMNS.length} style={{ height: 14, border: "none", background: "#fff" }} /></tr>
                </React.Fragment>
              ))}
              {visibleParties.length === 0 && <tr><td colSpan={DETAIL_COLUMNS.length} style={{ ...cellStyle, padding: 40 }}>No data for this quarter.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default QuarterlyBalance;