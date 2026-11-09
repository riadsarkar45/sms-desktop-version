import React, { useEffect, useMemo, useState } from "react";
import { Loader, Download, RefreshCw, Calendar } from "lucide-react";
import { useFetchData } from "../../../hooks/fetch";

// ===================== CONFIG =====================
const FINISH_IN_BALANCE = false;

// Backend (challanMovement) paging: max 100 per page. We loop until hasMore = false.
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

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

// The quantity columns (= transaction types) of the selected order type.
// key = the field on every row that holds the quantity.
const getQtyTypes = (cfg) => [
  { key: "yarnDelivery", header: cfg.delivery },
  { key: "yarnReturn", header: cfg.ret },
  { key: "greyFabricReceived", header: cfg.received },
  ...(cfg.finish ? [{ key: "finishReceived", header: cfg.finish }] : []),
];

// Columns of the Details table / Excel "Daily Details" sheet.
// typeKey = "" -> all transaction types
// typeKey = "yarnDelivery" (etc.) -> only that transaction type's quantity column
const getDetailColumns = (cfg, typeKey) => [
  { header: "Date", key: "challanDate", width: 110, xlWidth: 13 },
  { header: "Challan No", key: "challanNo", width: 110, xlWidth: 14 },
  { header: "Party / Factory", key: "party", width: 210, xlWidth: 30 },
  { header: "From Factory", key: "fromFactory", width: 200, xlWidth: 28 },
  { header: "To Factory", key: "toFactory", width: 200, xlWidth: 28 },
  { header: "Job No", key: "jobNo", width: 130, xlWidth: 18 },
  // Composition & Color are hidden for now. To bring them back: un-comment these two lines, the two cases in
  // renderDetailCell (Details table) and the two cases in xlValue (Excel export).
  // { header: "Composition", key: "composition", width: 260, xlWidth: 34 },
  // { header: "Color", key: "color", width: 170, xlWidth: 22 },
  ...getQtyTypes(cfg)
    .filter((t) => !typeKey || t.key === typeKey)
    .map((t) => ({ header: t.header, key: t.key, width: 140, xlWidth: 17, numeric: true })),
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
// a quantity that can be clicked to open its details
const linkCellStyle = { color: "#1d4ed8", textDecoration: "underline", cursor: "pointer", fontWeight: 600 };

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

// The backend filters by month only: ?challanMonths=2026-09,2026-10 (max 60 months).
// The exact From / To days are applied in the browser on top of that.
const MAX_MONTHS = 60;
// "2026-09-05" .. "2026-11-20" -> ["2026-09","2026-10","2026-11"]
const buildMonthList = (fromDay, toDay) => {
  let [y, m] = String(fromDay).slice(0, 7).split("-").map(Number);
  const [ey, em] = String(toDay).slice(0, 7).split("-").map(Number);
  const out = [];
  if (!y || !m || !ey || !em) return out;
  while ((y < ey || (y === ey && m <= em)) && out.length <= MAX_MONTHS) {
    out.push(`${y}-${pad2(m)}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};

// Reads the backend body { msg, type, data: [...], nextCursor, hasMore }
// (works whether fetchData returns the body itself or an axios-style response)
const unwrapResponse = (res) => {
  let body = res;
  if (body && !Array.isArray(body) && body.data && !Array.isArray(body.data) && typeof body.data === "object") body = body.data;
  const items = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
  return { items, hasMore: !!body?.hasMore, nextCursor: body?.nextCursor ?? null };
};

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

// Which factory a transaction counts for (uses the challan's toFactory / fromFactory from the backend):
//   delivery  (Yarn Delivery / Grey Delivery / Sent For Aop)                      -> toFactory   (goods go TO that factory)
//   return / received / finish (Yarn Return, Grey Received, Return From Aop, ...)  -> fromFactory (goods come FROM that factory)
// Only if that factory is empty, the work order's factory name is used instead.
const resolveParty = (row) => {
  const primary = cleanFactoryName(row.kind === "yarnDelivery" ? row.toFactory : row.fromFactory);
  if (primary) return { party: primary, usedFallback: false };
  return { party: cleanFactoryName(row.factoryName) || "Unknown", usedFallback: true };
};

const sumRows = (rows) => {
  const t = { yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, finishReceived: 0 };
  rows.forEach((r) => {
    t.yarnDelivery += Number(r.yarnDelivery) || 0;
    t.yarnReturn += Number(r.yarnReturn) || 0;
    t.greyFabricReceived += Number(r.greyFabricReceived) || 0;
    t.finishReceived += Number(r.finishReceived) || 0;
  });
  Object.keys(t).forEach((k) => { t[k] = round2(t[k]); });
  return t;
};

// entries -> [{ day, rows, ...totals, challans }] sorted by date; rows sorted by party then challan no
const buildDayGroups = (entries) => {
  const map = new Map();
  entries.forEach((e) => {
    if (!map.has(e.day)) map.set(e.day, []);
    map.get(e.day).push({ ...e.row, party: cleanFactoryName(e.party) || "Unknown", dayKey: e.day });
  });
  return [...map.keys()].sort().map((day) => {
    const rows = map.get(day).sort((a, b) => {
      const pc = a.party.localeCompare(b.party);
      if (pc !== 0) return pc;
      return String(a.challanNo).localeCompare(String(b.challanNo), undefined, { numeric: true });
    }).map((r) => ({ ...r }));
    return { day, rows, ...sumRows(rows), challans: new Set(rows.map((r) => String(r.challanNo))).size };
  });
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

// value of one Excel cell of the "Daily Details" sheet
const xlValue = (c, r) => {
  switch (c.key) {
    case "challanDate": return formatShortDate(r.challanDate);
    case "challanNo": return r.challanNo ?? "";
    case "party": return r.party;
    case "fromFactory": return cleanFactoryName(r.fromFactory);
    case "toFactory": return cleanFactoryName(r.toFactory);
    case "jobNo": return r.jobNo === "-" ? "" : r.jobNo;
    // case "composition": return r.composition === "-" ? "" : r.composition;   // Composition (hidden for now)
    // case "color": return r.color === "-" ? "" : r.color;                     // Color (hidden for now)
    default: return Number(r[c.key]) || 0; // quantity columns
  }
};

// ===================== COMPONENT =====================
const DailyTransaction = () => {
  const [movements, setMovements] = useState([]);
  const [fetchError, setFetchError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [pagesLoaded, setPagesLoaded] = useState(0);

  // Empty until the user picks a date (nothing is loaded before that)
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedParty, setSelectedParty] = useState("ALL");
  // "" = all transaction types; otherwise the quantity key whose details are shown (set by clicking a quantity)
  const [typeFilter, setTypeFilter] = useState("");
  const [view, setView] = useState("summary");
  const [isExporting, setIsExporting] = useState(false);

  // DEFAULT TO KNITTING ORDER
  const [selectOrderType, setSelectOrderType] = useState("knittingOrder");

  const { fetchData } = useFetchData();

  const cfg = ORDER_CONFIG[selectOrderType] || ORDER_CONFIG.knittingOrder;
  const hasFinish = !!cfg.finish;
  const qtyTypes = useMemo(() => getQtyTypes(cfg), [cfg]);
  const activeType = qtyTypes.some((t) => t.key === typeFilter) ? typeFilter : "";
  const activeTypeHeader = qtyTypes.find((t) => t.key === activeType)?.header || "";
  const DETAIL_COLUMNS = useMemo(() => getDetailColumns(cfg, activeType), [cfg, activeType]);
  const EXPORT_COLUMNS = useMemo(() => getDetailColumns(cfg, ""), [cfg]);

  // Date range picked by the user. The backend filters by month only (?challanMonths), so the months
  // covering this range are requested and the exact days are filtered in the browser (rangeEntries below).
  // No default dates: nothing is loaded until the user picks From and/or To.
  // If only one date is picked, that single day is shown.
  const fetchRange = useMemo(() => {
    if (!dateFrom && !dateTo) return { from: "", to: "" };
    let f = dateFrom || dateTo;
    let t = dateTo || dateFrom;
    if (f > t) [f, t] = [t, f];
    return { from: f, to: t };
  }, [dateFrom, dateTo]);

  // ===================== PAGED FETCH EFFECT =====================
  useEffect(() => {
    let cancelled = false;

    if (!fetchRange.from) {
      setFetchError(null);
      setMovements([]);
      setPagesLoaded(0);
      setIsFetching(false);
      return undefined;
    }

    const monthList = buildMonthList(fetchRange.from, fetchRange.to);

    const load = async () => {
      setFetchError(null);
      setMovements([]);
      setPagesLoaded(0);
      setIsFetching(true);
      try {
        let all = [];
        let cursor = null;
        let pages = 0;
        do {
          const qp = new URLSearchParams();
          qp.append("limit", String(PAGE_SIZE));
          if (cursor !== null && cursor !== undefined) qp.append("cursor", String(cursor));
          if (monthList.length > 0 && monthList.length <= MAX_MONTHS) qp.append("challanMonths", monthList.join(","));

          const res = await fetchData(`/api/challan-movement/${selectOrderType}?${qp.toString()}`);
          if (cancelled) return;

          const { items, hasMore, nextCursor } = unwrapResponse(res);
          all = all.concat(items);
          pages += 1;
          cursor = hasMore && nextCursor !== null && nextCursor !== undefined ? nextCursor : null;
          setPagesLoaded(pages);
        } while (cursor !== null && pages < MAX_PAGES);

        if (!cancelled) setMovements(all);
      } catch (err) {
        if (cancelled) return;
        console.error("Fetch Error:", err);
        if (err?.response?.status === 403) setFetchError("Permission denied");
        else setFetchError(err?.response?.data?.message || err?.response?.data?.msg || err?.message || "Failed to load data");
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [fetchData, selectOrderType, fetchRange.from, fetchRange.to, refreshKey]);

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

  // Backend deliveryType values:
  //  knitting: Yarn Delivery | Yarn Return | Grey Received | Grey Fabric Received | Finish Received
  //  dyeing:   Grey Delivery | Grey Return | Grey Received | Finish Received
  //  aop:      Sent For Aop | Received From Aop | AOP Finish Fabric Rcvd | Return From Aop
  // row.kind = the quantity field this delivery belongs to (used for the click-through details)
  const applyDelivery = (row, dv) => {
    const qty = extractQty(dv);
    const type = String(dv?.deliveryType || "").trim().toLowerCase().replace(/[\s_-]+/g, "");

    if (type.includes("finish")) {
      row.finishReceived += qty;
      row.kind = "finishReceived";
    } else if (type === "yarndelivery" || type === "greydelivery" || type === "sentforaop" || type.includes("sentfor") || (type.includes("delivery") && !type.includes("received"))) {
      row.yarnDelivery += qty;
      row.kind = "yarnDelivery";
    } else if (type === "yarnreturn" || type === "greyreturn" || type === "aopreturn" || type.includes("return")) {
      row.yarnReturn += qty;
      row.kind = "yarnReturn";
    } else if (type === "greyfabricreceived" || type === "greigereceived" || type === "greyreceived" || type === "receivedfromaop" || type.includes("received") || type.includes("rcvd")) {
      row.greyFabricReceived += qty;
      row.kind = "greyFabricReceived";
    } else {
      row.greyFabricReceived += qty;
      row.kind = "greyFabricReceived";
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
        kind: "greyFabricReceived", // overwritten by applyDelivery
      };
    };

    // Knitting has no Finish column: a "Finish Received" delivery would show as an empty row, so skip it
    const isEmptyFinishOnly = (row) => !hasFinish && row.kind === "finishReceived";

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
          if (isEmptyFinishOnly(row)) return;
          rows.push(row);
        });
      } else if (item.challanNo !== undefined && item.challanNo !== null) {
        const row = makeRow(item.challanNo, jobNo, item.composition, item.color, item, null, item.id, item.id, factoryName);
        applyDelivery(row, item);
        if (isEmptyFinishOnly(row)) return;
        rows.push(row);
      }
    });
    return rows;
  }, [movements, hasFinish]);

  const { entries, undatedCount, fallbackDateCount, noFactoryNameCount } = useMemo(() => {
    const list = [];
    let undated = 0, fallbackDates = 0, noFactoryName = 0;
    allRows.forEach((r) => {
      const day = getDayKey(r.challanDate);
      if (!day) { undated += 1; return; }
      if (r.dateFallback) fallbackDates += 1;
      const { party, usedFallback } = resolveParty(r);
      if (usedFallback) noFactoryName += 1;
      list.push({ party, partyKey: factoryKey(party), day, row: r });
    });
    return { entries: list, undatedCount: undated, fallbackDateCount: fallbackDates, noFactoryNameCount: noFactoryName };
  }, [allRows]);

  // ---------- Date range (picked by the user) ----------
  const rangeFrom = fetchRange.from;
  const rangeTo = fetchRange.to;

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

  // ---------- Summary (party wise, all transaction types) ----------
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

  const grand = useMemo(() => {
    const t = sumRows(visibleEntries.map((e) => e.row));
    const challans = new Set(visibleEntries.map((e) => `${e.day}|${e.row.challanNo}`)).size;
    return { ...t, challans };
  }, [visibleEntries]);

  // ---------- Details (date wise; only the clicked transaction type when a quantity was clicked) ----------
  const detailEntries = useMemo(
    () => (activeType ? visibleEntries.filter((e) => e.row.kind === activeType) : visibleEntries),
    [visibleEntries, activeType]
  );
  const dayGroups = useMemo(() => buildDayGroups(detailEntries), [detailEntries]);
  const detailGrand = useMemo(() => {
    const t = sumRows(detailEntries.map((e) => e.row));
    const challans = new Set(detailEntries.map((e) => `${e.day}|${e.row.challanNo}`)).size;
    return { ...t, challans, rows: detailEntries.length };
  }, [detailEntries]);

  // ===================== EXPORT =====================
  // Summary sheet = the party summary. "Daily Details" sheet = every transaction type (From / To factory wise)
  // for the selected dates and party, independent of the type filter on the screen.
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
      const sumHeaders = ["Party / Factory", "Challans", ...qtyTypes.map((t) => t.header)];
      const sumNumeric = new Set(Array.from({ length: sumHeaders.length - 1 }, (_, i) => i + 1));

      addTitleRow(summaryWs, `${cfg.title} Daily Transaction Summary  |  ${periodText}`, sumHeaders.length);
      addHeaderRow(summaryWs, sumHeaders, sumNumeric);

      visibleParties.forEach((p, idx) => {
        const row = summaryWs.addRow([p.name, p.challans, ...qtyTypes.map((t) => p[t.key])]);
        styleBodyRow(row, idx, sumNumeric);
        row.getCell(2).numFmt = "#,##0";
      });

      const gRow = summaryWs.addRow(["GRAND TOTAL", grand.challans, ...qtyTypes.map((t) => grand[t.key])]);
      styleSpecialRow(gRow, sumNumeric, XL.total, true);
      gRow.getCell(2).numFmt = "#,##0";
      [34, 11, 16, 16, 18, ...(hasFinish ? [22] : [])].forEach((w, i) => { summaryWs.getColumn(i + 1).width = w; });
      summaryWs.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

      // ---------- Daily Details Sheet ----------
      const exportDayGroups = buildDayGroups(visibleEntries);
      const ws = wb.addWorksheet("Daily Details", { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
      const colCount = EXPORT_COLUMNS.length;
      const numericIdx = new Set(EXPORT_COLUMNS.map((c, i) => (c.numeric ? i : -1)).filter((i) => i >= 0));
      const labelIdx = EXPORT_COLUMNS.findIndex((c) => c.numeric) - 1; // column just before the first quantity
      const blankRow = () => Array(colCount).fill("");
      const totalsRow = (label, t) => {
        const vals = blankRow();
        vals[labelIdx] = label;
        EXPORT_COLUMNS.forEach((c, i) => { if (c.numeric) vals[i] = t[c.key]; });
        return vals;
      };

      addTitleRow(ws, `${cfg.title} Daily Transaction Details  |  ${periodText}`, colCount);
      addHeaderRow(ws, EXPORT_COLUMNS.map((c) => c.header), numericIdx);

      exportDayGroups.forEach((d) => {
        const dayVals = blankRow();
        dayVals[0] = `${formatShortDate(d.day)}   (${d.challans} challan${d.challans === 1 ? "" : "s"})`;
        styleSpecialRow(ws.addRow(dayVals), numericIdx, XL.opening);

        d.rows.forEach((r, idx) => {
          const row = ws.addRow(EXPORT_COLUMNS.map((c) => xlValue(c, r)));
          styleBodyRow(row, idx, numericIdx);
        });

        styleSpecialRow(ws.addRow(totalsRow("DAY TOTAL", d)), numericIdx, XL.total, true);
        ws.addRow([]);
      });

      styleSpecialRow(ws.addRow(totalsRow("GRAND TOTAL", grand)), numericIdx, XL.closing, true);

      EXPORT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.xlWidth; });
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
    setTypeFilter("");
  };

  // Click on a quantity (or a party row) in the Summary -> open the Details for it.
  //  partyKey = null keeps the current party filter (Grand Total click);  typeKey = "" shows every transaction type
  const openDetails = (partyKey, typeKey) => {
    if (partyKey) setSelectedParty(partyKey);
    setTypeFilter(typeKey || "");
    setView("detail");
  };

  const setQuickDate = (d) => { setDateFrom(d); setDateTo(d); setSelectedParty("ALL"); };
  const goToday = () => setQuickDate(localDayKey(new Date()));
  const goYesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); setQuickDate(localDayKey(d)); };
  const goClear = () => { setDateFrom(""); setDateTo(""); setSelectedParty("ALL"); };

  if (fetchError) {
    return (
      <div style={{ padding: "12px 16px", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: theme.radius, margin: 20, fontFamily: FONT_STACK }}>
        {fetchError}
      </div>
    );
  }

  const orderTypes = ["knittingOrder", "dyeingOrder", "aopOrder"];
  const negColor = (n) => (Number(n) < -0.005 ? { color: "#b91c1c" } : {});
  const summaryHeaders = ["Party / Factory", "Challans", ...qtyTypes.map((t) => t.header)];
  const numericCols = DETAIL_COLUMNS.filter((c) => c.numeric);
  const labelSpan = DETAIL_COLUMNS.length - numericCols.length; // all text columns before the quantities
  const detailMinWidth = DETAIL_COLUMNS.reduce((sum, c) => sum + c.width, 0);
  const detailPartyName = selectedParty === "ALL" || !activePartyValid ? "All Parties" : (partyOptions.find((p) => p.key === selectedParty)?.name || "");
  const emptyText = !rangeFrom
    ? "Select From and To date to view transactions."
    : isFetching ? `Loading ${cfg.title} data...` : "No transaction for this date.";

  // one cell of the Details table
  const renderDetailCell = (c, r, base) => {
    switch (c.key) {
      case "challanDate":
        return <td key={c.key} style={base}><span style={{ fontVariantNumeric: "tabular-nums", fontSize: "0.8rem" }}>{formatShortDate(r.challanDate)}</span></td>;
      case "challanNo":
        return <td key={c.key} style={base}>{r.challanNo}</td>;
      case "party":
        return <td key={c.key} style={{ ...base, textAlign: "left", fontWeight: 600 }}>{r.party}</td>;
      case "fromFactory":
        return <td key={c.key} style={{ ...base, textAlign: "left" }}>{cleanFactoryName(r.fromFactory) || "-"}</td>;
      case "toFactory":
        return <td key={c.key} style={{ ...base, textAlign: "left" }}>{cleanFactoryName(r.toFactory) || "-"}</td>;
      case "jobNo":
        return <td key={c.key} style={{ ...base, fontWeight: 500 }}>{r.jobNo}</td>;
      // Composition & Color are hidden for now (also un-comment their columns in getDetailColumns and the Excel cases in xlValue)
      // case "composition":
      //   return <td key={c.key} style={base}>{r.composition}</td>;
      // case "color":
      //   return <td key={c.key} style={base}>{r.color && r.color !== "-" ? <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12, background: "#f1f5f9", fontSize: "0.8rem", fontWeight: 500 }}>{r.color}</span> : "-"}</td>;
      default:
        return <td key={c.key} style={{ ...base, fontVariantNumeric: "tabular-nums" }}>{fmt(r[c.key])}</td>;
    }
  };

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
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setSelectedParty("ALL"); }} style={selectStyle} title="From challan date" />
        <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>To</label>
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setSelectedParty("ALL"); }} style={selectStyle} title="To challan date" />
        <button style={toolbarBtn(false)} onClick={goToday} title="Show today's challans">Today</button>
        <button style={toolbarBtn(false)} onClick={goYesterday} title="Show yesterday's challans">Yesterday</button>
        <button style={toolbarBtn(false)} onClick={goClear} title="Clear the dates">Clear</button>
        <select value={activePartyValid ? selectedParty : "ALL"} onChange={(e) => setSelectedParty(e.target.value)} style={{ ...selectStyle, minWidth: 200 }} title="Party">
          <option value="ALL">All Parties ({partyOptions.length})</option>
          {partyOptions.map((p) => (<option key={p.key} value={p.key}>{p.name}</option>))}
        </select>
        {view === "detail" && (
          <select value={activeType} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...selectStyle, minWidth: 190 }} title="Transaction type">
            <option value="">All Types</option>
            {qtyTypes.map((t) => (<option key={t.key} value={t.key}>{t.header}</option>))}
          </select>
        )}
        <button style={toolbarBtn(view === "summary")} onClick={() => setView("summary")}>Summary</button>
        <button style={toolbarBtn(view === "detail")} onClick={() => setView("detail")}>Details</button>
        <div style={{ flex: 1 }} />
        <button style={toolbarBtn(false, isFetching)} onClick={() => setRefreshKey((k) => k + 1)} disabled={isFetching} title="Reload data">
          {isFetching ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />} Refresh
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
          {/* <span>Net Movement = {cfg.delivery} - {cfg.ret} - {cfg.received}</span> */}
          {hasFinish && !FINISH_IN_BALANCE && <span>{cfg.finish} is shown for information</span>}
          {view === "summary" && <span>Click a quantity to see its From / To factory details</span>}
        </div>
      )}

      <div style={{ marginBottom: 16, padding: "8px 16px", background: "#f8fafc", border: `1px solid ${theme.colors.borderDark}`, borderRadius: theme.radius, display: "flex", flexWrap: "wrap", gap: 16, fontSize: "0.8rem", color: "#334155" }}>
        <span><strong>Data loaded:</strong> {movements.length} API records {rangeFrom ? `(${periodText})` : ""}</span>
        {isFetching && <span style={{ color: "#1d4ed8" }}>Loading page {pagesLoaded + 1}...</span>}
        <span>{allRows.length} challan rows</span>
        <span>{entries.length} party entries</span>
        {noFactoryNameCount > 0 && <span style={{ color: "#b45309" }}>{noFactoryNameCount} entr{noFactoryNameCount === 1 ? "y has" : "ies have"} no From/To factory (work order factory used)</span>}
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
              {visibleParties.map((p, idx) => {
                const rowBg = idx % 2 === 0 ? "#fff" : "#fafbfc";
                return (
                  <tr key={p.key} style={{ cursor: "pointer" }} onClick={() => openDetails(p.key, "")} title="Click to see all details of this party">
                    <td style={{ ...cellStyle, textAlign: "left", fontWeight: 600, background: rowBg }}>{p.name}</td>
                    <td style={{ ...cellStyle, background: rowBg }}>{p.challans}</td>
                    {qtyTypes.map((t) => {
                      const clickable = !isZero(p[t.key]);
                      return (
                        <td
                          key={t.key}
                          onClick={clickable ? (e) => { e.stopPropagation(); openDetails(p.key, t.key); } : undefined}
                          title={clickable ? `Click to see ${t.header} details (From / To factory wise)` : undefined}
                          style={{ ...cellStyle, fontVariantNumeric: "tabular-nums", background: rowBg, ...(clickable ? linkCellStyle : {}) }}
                        >
                          {fmt(p[t.key])}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {visibleParties.length === 0 && <tr><td colSpan={summaryHeaders.length} style={{ ...cellStyle, padding: 40 }}>{emptyText}</td></tr>}
            </tbody>
            {visibleParties.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ ...tfootCellStyle, textAlign: "left", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}>Grand Total</td>
                  <td style={tfootCellStyle}>{grand.challans}</td>
                  {qtyTypes.map((t) => {
                    const clickable = !isZero(grand[t.key]);
                    return (
                      <td
                        key={t.key}
                        onClick={clickable ? () => openDetails(null, t.key) : undefined}
                        title={clickable ? `Click to see ${t.header} details of ${selectedParty === "ALL" || !activePartyValid ? "all parties" : "this party"}` : undefined}
                        style={{ ...tfootCellStyle, ...(clickable ? { textDecoration: "underline", cursor: "pointer" } : {}) }}
                      >
                        {fmt(grand[t.key])}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {view === "detail" && (
        <>
          {activeType && (
            <div style={{ marginBottom: 12, padding: "10px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: theme.radius, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, fontSize: "0.875rem", color: "#1e3a8a" }}>
              <strong>{activeTypeHeader} details</strong>
              <span>{detailPartyName}</span>
              <span>{detailGrand.rows} transaction{detailGrand.rows === 1 ? "" : "s"} in {detailGrand.challans} challan{detailGrand.challans === 1 ? "" : "s"}</span>
              <span>Total: <strong>{fmt(detailGrand[activeType])}</strong></span>
              <button onClick={() => setTypeFilter("")} style={{ background: theme.colors.white, color: "#1e3a8a", border: "1px solid #93c5fd", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, padding: "4px 12px", fontFamily: "inherit" }}>Show all types</button>
              <button onClick={() => setView("summary")} style={{ background: theme.colors.white, color: "#1e3a8a", border: "1px solid #93c5fd", borderRadius: 6, cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, padding: "4px 12px", fontFamily: "inherit" }}>Back to Summary</button>
            </div>
          )}

          <div style={{ width: "100%", maxHeight: "calc(100vh - 300px)", overflow: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, boxShadow: theme.shadows.md, background: theme.colors.white }}>
            <table style={{ width: "100%", minWidth: detailMinWidth, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
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
                          {DETAIL_COLUMNS.map((c) => renderDetailCell(c, r, base))}
                        </tr>
                      );
                    })}
                    <tr>
                      <td colSpan={labelSpan} style={{ ...cellStyle, textAlign: "right", background: "#f5d8c9", fontWeight: 700 }}>Day Total</td>
                      {numericCols.map((c) => (
                        <td key={c.key} style={{ ...cellStyle, background: "#f5d8c9", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(d[c.key])}</td>
                      ))}
                    </tr>
                    <tr><td colSpan={DETAIL_COLUMNS.length} style={{ height: 14, border: "none", background: "#fff" }} /></tr>
                  </React.Fragment>
                ))}
                {dayGroups.length === 0 && <tr><td colSpan={DETAIL_COLUMNS.length} style={{ ...cellStyle, padding: 40 }}>{emptyText}</td></tr>}
              </tbody>
              {dayGroups.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={labelSpan} style={{ ...tfootCellStyle, textAlign: "right", textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.05em" }}>Grand Total</td>
                    {numericCols.map((c) => (
                      <td key={c.key} style={tfootCellStyle}>{fmt(detailGrand[c.key])}</td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default DailyTransaction;