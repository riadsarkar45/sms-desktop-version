import React, { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

import { Loader, Search, Download, Filter, X, Calendar, ChevronDown } from 'lucide-react';
import UseDeliveryMonths from './delivery-months/UseDeliveryMonths';
import ChallanEditModal from '../../components/modals/ChallanEditModal';
import { useFetchData } from '../../hooks/fetch';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

// --- Modern Design System & Styles ---
const theme = {
    colors: {
        primary: '#3b82f6', primaryHover: '#2563eb', success: '#10b981', successHover: '#059669',
        danger: '#ef4444', warning: '#fef08a', bgPage: '#ffffff', bgHeader: '#f5d8c9',
        bgFooter: '#f5d8c9', bgHover: '#f1f5f9', border: '#10b981', borderDark: '#cbd5e1',
        textMain: '#0f172a', textMuted: '#0f172a', white: '#ffffff',
    },
    shadows: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        xl: '0 20px 25px -5px rgb(0 0 0 / 0.18), 0 8px 10px -6px rgb(0 0 0 / 0.12)',
    },
    radius: '8px',
};

const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const cellStyle = {
    padding: "12px 16px", borderBottom: `1px solid ${theme.colors.border}`,
    borderRight: `1px solid ${theme.colors.border}`, fontSize: "0.875rem",
    color: theme.colors.textMain, verticalAlign: "middle", textAlign: "center",
    transition: "background-color 0.15s ease", whiteSpace: "normal",
    wordWrap: "break-word", wordBreak: "break-word", lineHeight: "1.2",
    backgroundClip: "padding-box",
};

const thStickyStyle = {
    ...cellStyle, position: "sticky", top: 0, zIndex: 30,
    background: "#657582", fontWeight: 600, fontSize: "0.80rem",
    textTransform: "uppercase", letterSpacing: "0.05em", color: "white",
    borderBottom: `3px solid ${theme.colors.borderDark}`, boxShadow: theme.shadows.sm,
    whiteSpace: "normal", wordWrap: "break-word", wordBreak: "break-word",
    verticalAlign: "middle", textAlign: "center", backgroundClip: "padding-box",
};

const tfootCellStyle = {
    ...cellStyle, position: "sticky", bottom: 0, zIndex: 30,
    background: "#657582",
    fontWeight: 700,
    borderTop: `2px solid ${theme.colors.borderDark}`, borderBottom: "none",
    color: "white", textAlign: "center", backgroundClip: "padding-box",
};

const pageButtonStyle = (active) => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    minWidth: "36px", height: "36px", padding: "0 12px", margin: "0 2px",
    borderRadius: "6px", border: `1px solid ${active ? theme.colors.primary : theme.colors.border}`,
    background: active ? theme.colors.primary : theme.colors.white,
    color: active ? theme.colors.white : theme.colors.textMain,
    cursor: "pointer", fontSize: "0.875rem", fontWeight: active ? 600 : 400,
    transition: "all 0.2s ease", boxShadow: active ? theme.shadows.sm : "none",
});

const tableHeader = [
    { header: "", width: "50px", key: "select", noFilter: true },
    { header: "Date", width: "110px", key: "challanDate" },
    { header: "Challan No", width: "110px", key: "challanNo" },
    { header: "Job No", width: "160px", key: "jobNo" },
    { header: "Composition", width: "280px", key: "composition" },
    { header: "Color", width: "220px", key: "color" },
    { header: "From Factory", width: "200px", key: "fromFactory" },
    { header: "To Factory", width: "190px", key: "toFactory" },
    { header: "Grey Del", width: "110px", key: "greyDelivery" },
    { header: "Grey Ret", width: "110px", key: "greyReturn" },
    { header: "Grey Rec", width: "110px", key: "greyReceive" },
    { header: "Finish Rec", width: "120px", key: "finishReceive" },
    { header: "Process Loss %", width: "110px", key: "processLoss" },
    { header: "Price/KG", width: "100px", key: "unitePrice" },
    { header: "Billing", width: "120px", key: "billingAmount" },
];

// ===== FROZEN COLUMNS =====
const FROZEN_COLUMN_KEYS = ['select', 'challanDate', 'challanNo', 'jobNo', 'composition'];
const FROZEN_LAST_KEY = FROZEN_COLUMN_KEYS[FROZEN_COLUMN_KEYS.length - 1];

const FROZEN_LEFT_OFFSETS = (() => {
    const offsets = {};
    let cumulative = 0;
    tableHeader.forEach((th) => {
        if (FROZEN_COLUMN_KEYS.includes(th.key)) {
            offsets[th.key] = cumulative;
            cumulative += parseInt(th.width, 10) || 0;
        }
    });
    return offsets;
})();

const getFrozenStyle = (key, area = 'body') => {
    if (!FROZEN_COLUMN_KEYS.includes(key)) return {};
    const left = FROZEN_LEFT_OFFSETS[key] ?? 0;
    const isLast = key === FROZEN_LAST_KEY;
    const zIndex = (area === 'header' || area === 'footer') ? 40 : 5;
    const style = {
        position: 'sticky',
        left: `${left}px`,
        zIndex,
        backgroundClip: 'padding-box',
    };
    if (isLast) {
        style.borderRight = `3px solid ${theme.colors.borderDark}`;
        style.boxShadow = '6px 0 8px -4px rgba(15, 23, 42, 0.18)';
    }
    return style;
};
// ===== END FROZEN COLUMNS =====

// ===== DATE HELPERS =====
// Matches ISO dates like 2025-12-06 or 2025-12-06T00:00:00.000Z
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;

// Handles clean dates AND glued strings like "2025-12-06T...Z2025-12-07T...Z"
// If several dates are found, the earliest one is used.
const normalizeDate = (val) => {
    if (!val) return "";
    if (val instanceof Date) return isNaN(val.getTime()) ? "" : val.toISOString();
    const str = String(val);
    const matches = str.match(ISO_DATE_RE);
    if (!matches || matches.length === 0) return str;
    return [...matches].sort()[0];
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2025-12-01T00:00:00.000Z" -> "1-Dec-25"
const formatShortDate = (val) => {
    const normalized = normalizeDate(val);
    if (!normalized) return "-";
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return "-";
    return `${d.getUTCDate()}-${MONTH_SHORT[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
};

// Column filter value for the date column: "2026-01-17" (one key per day)
const getDateFilterValue = (dateVal) => {
    const normalized = normalizeDate(dateVal);
    if (!normalized) return "";
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return String(normalized);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// What the filter dropdown shows for a stored filter value: "2026-01-17" -> "17-Jan-26"
const getFilterDisplay = (key, val) => {
    if (key === 'challanDate' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return formatShortDate(val);
    return val;
};

// Month key "2026-01" used by the "All Months" dropdown
const getMonthKey = (dateVal) => {
    const day = getDateFilterValue(dateVal);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : "";
};

// "2026-01" -> "Jan 2026"  (used by the on-screen month dropdown)
const formatMonthLabel = (key) => {
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return key;
    const [y, m] = key.split('-');
    return `${MONTH_SHORT[Number(m) - 1]} ${y}`;
};

// "2026-01" -> "Jan'26"  (used by the Excel export)
const formatMonthShort = (key) => {
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || "";
    const [y, m] = key.split('-');
    return `${MONTH_SHORT[Number(m) - 1]}'${y.slice(-2)}`;
};
// ===== END DATE HELPERS =====

// ===== DELIVERY MONTH PARSING (real data only) =====
const MONTH_NUMBERS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MIN_VALID_YEAR = 2000;
const MAX_VALID_YEAR = 2100;

// Accepts "August" or "August 2025". Junk like "August 0002", "N/A" -> null
const parseDeliveryMonth = (raw) => {
    if (!raw || typeof raw !== 'string') return null;

    const match = raw.trim().match(/^([A-Za-z]+)(?:\s+(\d{4}))?$/);
    if (!match) return null;

    const name = match[1].toLowerCase();
    const monthNumber = MONTH_NUMBERS[name];
    if (!monthNumber) return null;

    const year = match[2] ? Number(match[2]) : null;
    if (year !== null && (year < MIN_VALID_YEAR || year > MAX_VALID_YEAR)) return null;

    const niceName = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    return {
        value: raw,
        name,
        label: year ? `${niceName} ${year}` : niceName,
        sortKey: year
            ? `${year}-${String(monthNumber).padStart(2, '0')}`
            : String(monthNumber).padStart(2, '0'),
    };
};
// ===== END DELIVERY MONTH PARSING =====

// ===== EXCEL EXPORT CONFIG =====
// The dyeing factory (party) a row belongs to.
//  - Grey Delivery : grey fabric goes OUT to the dyeing factory -> party = toFactory
//  - Grey Return / Grey Receive / Finish Receive : goods come BACK from the dyeing factory -> party = fromFactory
// This way delivery + return + receive of the same factory always land in ONE sheet.
const getPartyFactory = (row) => {
    const to = String(row.toFactory || '').trim();
    const from = String(row.fromFactory || '').trim();
    const isDelivery = Number(row.greyDelivery) > 0;
    const isBack = Number(row.greyReturn) > 0 || Number(row.greyReceive) > 0 || Number(row.finishReceive) > 0;
    let party;
    if (isDelivery && !isBack) party = to || from;
    else if (isBack && !isDelivery) party = from || to;
    else party = to || from; // mixed / no qty
    return party || 'Unknown';
};
// Same factory typed with different spacing/casing is treated as one factory
const factoryKey = (name) => String(name || 'Unknown').replace(/\s+/g, ' ').trim().toLowerCase();

const XL_NUM_FMT = '#,##0.00;-#,##0.00;"-"';
const XL_INT_FMT = '#,##0;-#,##0;"-"';
const XL_PCT_FMT = '0.00"%";-0.00"%";"-"';

const EXPORT_COLUMNS = [
    { header: 'Date', key: 'challanDate', width: 13, type: 'date' },
    { header: "Month'Year", key: 'monthLabel', width: 12, type: 'text' },
    { header: 'Challan No', key: 'challanNo', width: 14, type: 'text' },
    { header: 'Job No', key: 'jobNo', width: 18, type: 'text' },
    { header: 'Composition', key: 'composition', width: 34, type: 'text' },
    { header: 'Color', key: 'color', width: 22, type: 'text' },
    { header: 'From Factory', key: 'fromFactory', width: 22, type: 'text' },
    { header: 'To Factory', key: 'toFactory', width: 22, type: 'text' },
    { header: 'Grey Delivery', key: 'greyDelivery', width: 15, type: 'number' },
    { header: 'Grey Return', key: 'greyReturn', width: 15, type: 'number' },
    { header: 'Grey Received', key: 'greyReceive', width: 16, type: 'number' },
    { header: 'Finish Received', key: 'finishReceive', width: 16, type: 'number' },
    { header: 'Process Loss %', key: 'processLoss', width: 15, type: 'number', fmt: XL_PCT_FMT },
    { header: 'Price/KG', key: 'unitePrice', width: 12, type: 'number' },
    { header: 'Billing', key: 'billingAmount', width: 16, type: 'number' },
];
// Columns that are summed in TOTAL rows (Process Loss % is recalculated from the sums)
const EXPORT_TOTAL_KEYS = ['greyDelivery', 'greyReturn', 'greyReceive', 'finishReceive', 'billingAmount'];

const SUMMARY_COLUMNS = [
    { header: 'Factory', type: 'text', width: 36 },
    { header: 'Challans', key: 'challans', type: 'number', fmt: XL_INT_FMT, width: 12 },
    { header: 'Grey Delivery', key: 'greyDelivery', type: 'number', width: 16 },
    { header: 'Grey Return', key: 'greyReturn', type: 'number', width: 16 },
    { header: 'Grey Received', key: 'greyReceive', type: 'number', width: 16 },
    { header: 'Finish Received', key: 'finishReceive', type: 'number', width: 16 },
    { header: 'Process Loss %', key: 'processLoss', type: 'number', fmt: XL_PCT_FMT, width: 16 },
    { header: 'Billing', key: 'billingAmount', type: 'number', width: 18 },
];

const calcProcessLoss = (receive, finish) => (receive > 0 ? ((receive - finish) / receive) * 100 : 0);

const XL = {
    title: 'FF1E293B',
    header: 'FF657582',
    zebra: 'FFF8FAFC',
    total: 'FFF5D8C9',
    line: 'FFCBD5E1',
    white: 'FFFFFFFF',
    text: 'FF0F172A',
};
const xlThin = { style: 'thin', color: { argb: XL.line } };
const xlBorder = { top: xlThin, left: xlThin, bottom: xlThin, right: xlThin };
const xlFill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// Excel sheet names: max 31 chars, no \ / ? * [ ] :, must be unique (case-insensitive)
const makeSheetName = (name, used) => {
    const base = String(name || 'Unknown').replace(/[\\/?*[\]:]/g, '-').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Unknown';
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
    cell.font = { bold: true, size: 14, color: { argb: XL.white }, name: 'Calibri' };
    cell.fill = xlFill(XL.title);
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 30;
    ws.getRow(2).height = 6;
};

const addHeaderRow = (ws, cols) => {
    const row = ws.getRow(3);
    cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true, size: 11, color: { argb: XL.white }, name: 'Calibri' };
        cell.fill = xlFill(XL.header);
        cell.border = xlBorder;
        cell.alignment = { vertical: 'middle', horizontal: c.type === 'number' ? 'right' : 'center', wrapText: true };
    });
    row.height = 26;
};

const styleBodyRow = (row, idx, cols) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const col = cols[colNumber - 1] || {};
        const isNum = col.type === 'number';
        cell.border = xlBorder;
        cell.font = { size: 10, color: { argb: XL.text }, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: isNum ? 'right' : 'left', wrapText: !isNum };
        if (isNum) cell.numFmt = col.fmt || XL_NUM_FMT;
        if (idx % 2 === 1) cell.fill = xlFill(XL.zebra);
    });
};

const styleTotalRow = (row, cols) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const col = cols[colNumber - 1] || {};
        const isNum = col.type === 'number';
        cell.font = { bold: true, size: 11, color: { argb: XL.text }, name: 'Calibri' };
        cell.fill = xlFill(XL.total);
        cell.border = { top: { style: 'medium', color: { argb: XL.title } }, left: xlThin, right: xlThin, bottom: xlThin };
        cell.alignment = { vertical: 'middle', horizontal: isNum ? 'right' : 'left' };
        if (isNum) cell.numFmt = col.fmt || XL_NUM_FMT;
    });
    row.height = 24;
};
// ===== END EXCEL EXPORT CONFIG =====

// Dropdown width used for portal positioning
const FILTER_DROPDOWN_WIDTH = 270;

const Dyeing = () => {
    const [movements, setMovements] = useState([]);
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState({});
    const [openFilterKey, setOpenFilterKey] = useState(null);
    const [draftSelected, setDraftSelected] = useState(new Set());
    const [filterSearch, setFilterSearch] = useState("");
    const [selectedRows, setSelectedRows] = useState(new Set());
    const dropdownRef = useRef(null);
    const filterButtonRefs = useRef({});
    const [dropdownPos, setDropdownPos] = useState(null);
    const monthDropdownRef = useRef(null);
    const [totalPages, setTotalPages] = useState(1);
    const [challanIds, setChallanIds] = useState([]);

    const [search, setSearch] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Excel-like challan date month filter (client-side)
    const [selectedMonths, setSelectedMonths] = useState(new Set());
    const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
    const [monthDraftSelected, setMonthDraftSelected] = useState(new Set());
    const [monthSearch, setMonthSearch] = useState("");

    // ===== DELIVERY MONTHS MULTI-SELECT STATES =====
    const [isDeliveryMonthDropdownOpen, setIsDeliveryMonthDropdownOpen] = useState(false);
    // Raw values ticked in the dropdown, e.g. ["August", "September"]
    const [selectedDeliveryMonths, setSelectedDeliveryMonths] = useState([]);
    // Month names actually searched, e.g. ["august", "september"]
    const [appliedMonthNames, setAppliedMonthNames] = useState([]);
    const deliveryMonthDropdownRef = useRef(null);
    // ===============================================

    const [hoveredRow, setHoveredRow] = useState(null);

    const [isBillGenerating, setIsBillGenerating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isChallanEditing, setIsChallanEditing] = useState(false);
    const [challanToEditData, setChallanToEditData] = useState({});
    const [isChallanDataLoading, setIsChallanDataLoading] = useState(false);

    const { fetchData, loading } = useFetchData();
    const { deliveryMonths, isMonthLoading: deliveryMonthLoading } = UseDeliveryMonths();
    const axiosPrivate = useAxiosPrivate();

    // Stable string of applied months (effect dependency + "month search active" flag)
    const appliedMonthsKey = appliedMonthNames.join(',');

    useEffect(() => {
        // Skip paged loading while a challan search or a month search is showing
        if (search || appliedMonthsKey) return;
        fetchData(`/api/challan-movement/dyeingOrder?page=${page}&limit=10`)
            .then(data => {
                if (data) {
                    const payload = Array.isArray(data) ? data : (data.data || []);
                    setMovements(payload);
                    setTotalPages(data.pagination?.totalPages || 1);
                }
            });
    }, [fetchData, page, refreshKey, search, appliedMonthsKey]);

    // ===== Column filter dropdown: position helper (portal) =====
    const updateDropdownPosition = useCallback(() => {
        if (!openFilterKey) return;
        const btn = filterButtonRefs.current[openFilterKey];
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const width = FILTER_DROPDOWN_WIDTH;

        let left = rect.right - width;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));

        const estimatedHeight = 360;
        let top = rect.bottom + 8;

        if (top + estimatedHeight > window.innerHeight - 8) {
            const aboveTop = rect.top - estimatedHeight - 8;
            top = aboveTop > 8 ? aboveTop : Math.max(8, window.innerHeight - estimatedHeight - 8);
        }

        setDropdownPos({ top, left, width });
    }, [openFilterKey]);

    useLayoutEffect(() => {
        if (!openFilterKey) { setDropdownPos(null); return; }
        updateDropdownPosition();
        const handler = () => updateDropdownPosition();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [openFilterKey, updateDropdownPosition]);

    // Outside click + Escape for column filter dropdown (portal aware)
    useEffect(() => {
        if (!openFilterKey) return;
        const handleClick = (e) => {
            if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
            const btn = filterButtonRefs.current[openFilterKey];
            if (btn && btn.contains(e.target)) return;
            setOpenFilterKey(null);
            setDropdownPos(null);
        };
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                setOpenFilterKey(null);
                setDropdownPos(null);
            }
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [openFilterKey]);

    useEffect(() => {
        if (!monthDropdownOpen) return;
        const handleClick = (e) => {
            if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target)) {
                setMonthDropdownOpen(false);
                setMonthSearch("");
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [monthDropdownOpen]);

    // Delivery month dropdown: click outside closes it
    useEffect(() => {
        if (!isDeliveryMonthDropdownOpen) return;
        const handleClick = (e) => {
            if (deliveryMonthDropdownRef.current && !deliveryMonthDropdownRef.current.contains(e.target)) {
                setIsDeliveryMonthDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [isDeliveryMonthDropdownOpen]);

    const allRows = useMemo(() => {
        if (!movements || !Array.isArray(movements)) return [];
        const rowMap = new Map();
        const order = [];
        const extractJobNo = (item) => item?.workOrder?.jobNo || (typeof item?.workOrder === 'string' ? item.workOrder : null);
        const makeKey = (challanNo, jobNo, comp, color) => `${challanNo}|${jobNo}|${comp}|${color}`;

        const getOrCreateRow = (challanNo, jobNo, comp, color, source) => {
            const key = makeKey(challanNo, jobNo, comp, color);
            let row = rowMap.get(key);
            if (!row) {
                row = {
                    rowKey: key,
                    deliveryId: source?.id || null,
                    chId: source?.id || challanNo,
                    challanNo,
                    jobNo,
                    composition: comp || "-",
                    color: color || "-",
                    challanDate: normalizeDate(source?.deliveryDate || source?.challanDate),
                    toFactory: source?.toFactory || "",
                    fromFactory: source?.fromFactory || "",
                    greyDelivery: 0,
                    greyReturn: 0,
                    greyReceive: 0,
                    finishReceive: 0,
                    deliveryQty: 0,
                    unitePrice: Number(source?.unitePrice) || 0,
                    paidBillingAmount: Number(source?.paidBillingAmount) || 0,
                };
                rowMap.set(key, row);
                order.push(key);
            }
            return row;
        };

        const applyDelivery = (row, dv, source) => {
            const qty = Number(dv?.deliveryQty ?? dv?.totalQty) || 0;
            row.deliveryQty += qty;
            const type = String(dv?.deliveryType || "").toLowerCase().replace(/[\s_-]+/g, "");
            if (type.includes("greydelivery")) row.greyDelivery += qty;
            else if (type.includes("greyreceived") || type.includes("greyreceive") || type.includes("greyfabricreceived")) row.greyReceive += qty;
            else if (type.includes("greyreturn")) row.greyReturn += qty;
            else if (type.includes("finishreceived") || type.includes("finishreceive")) row.finishReceive += qty;

            const price = Number(dv?.unitePrice || source?.unitePrice) || 0;
            if (price && !row.unitePrice) row.unitePrice = price;
            if (!row.toFactory && dv?.toFactory) row.toFactory = dv.toFactory;
            if (!row.fromFactory && dv?.fromFactory) row.fromFactory = dv.fromFactory;
            if (dv?.deliveryDate && !row.challanDate) row.challanDate = normalizeDate(dv.deliveryDate);
        };

        const getFacets = (item) => {
            const facets = [];
            if (Array.isArray(item?.compositions) && item.compositions.length > 0) {
                item.compositions.forEach((c) => {
                    if (!c) return;
                    const qtyRaw = c?.qty ?? c?.quantity ?? c?.deliveryQty ?? c?.totalQty ?? c?.weight ?? c?.kg ?? null;
                    const qtyNum = (qtyRaw !== null && qtyRaw !== "" && !isNaN(Number(qtyRaw))) ? Number(qtyRaw) : null;
                    facets.push({ comp: c?.composition || item?.composition || "-", color: c?.color || item?.color || "-", qty: qtyNum });
                });
            } else if (typeof item?.color === "string" && item.color.includes(", ")) {
                item.color.split(", ").map((s) => s.trim()).filter(Boolean).forEach((colorPart) => {
                    facets.push({ comp: item?.composition || "-", color: colorPart, qty: null });
                });
            }
            if (facets.length === 0) facets.push({ comp: item?.composition || "-", color: item?.color || "-", qty: null });
            return facets;
        };

        movements.forEach((item) => {
            if (!item) return;
            const jobNo = extractJobNo(item) || "-";
            if (Array.isArray(item.deliveries) && item.deliveries.length > 0) {
                item.deliveries.forEach((dv) => {
                    const challanNo = dv?.challanNo;
                    if (challanNo === undefined || challanNo === null) return;
                    const comp = dv?.composition || item?.composition || "-";
                    const color = dv?.color || item?.color || "-";
                    const row = getOrCreateRow(challanNo, jobNo, comp, color, dv);
                    if (item.unitePrice && !row.unitePrice) row.unitePrice = Number(item.unitePrice);
                    applyDelivery(row, dv, item);
                });
            } else if (item.challanNo !== undefined && item.challanNo !== null) {
                const facets = getFacets(item);
                const hasFacetQty = facets.some((f) => f.qty !== null);
                facets.forEach((f) => {
                    const row = getOrCreateRow(item.challanNo, jobNo, f.comp, f.color, item);
                    if (hasFacetQty) {
                        if (f.qty !== null) applyDelivery(row, { ...item, deliveryQty: f.qty }, item);
                    } else if (facets.length === 1) {
                        applyDelivery(row, item, item);
                    }
                });
            }
        });

        return order.map((key) => {
            const row = rowMap.get(key);
            const processLoss = calcProcessLoss(row.greyReceive, row.finishReceive);
            return { ...row, billingAmount: row.greyReceive * row.unitePrice, processLoss };
        });
    }, [movements]);

    // ===== DELIVERY MONTH OPTIONS (valid real months only, backend order) =====
    const deliveryMonthOptions = useMemo(() => {
        if (!Array.isArray(deliveryMonths)) return [];
        const seen = new Set();
        const list = [];
        deliveryMonths.forEach((item) => {
            const raw = typeof item === 'string' ? item : item?.deliveryMonth;
            const parsed = parseDeliveryMonth(raw);
            if (!parsed || seen.has(parsed.value)) return;
            seen.add(parsed.value);
            list.push(parsed);
        });
        return list;
    }, [deliveryMonths]);

    const allDeliveryMonthsSelected =
        deliveryMonthOptions.length > 0 &&
        selectedDeliveryMonths.length === deliveryMonthOptions.length;

    const toggleDeliveryMonth = (value) => {
        setSelectedDeliveryMonths((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
        );
    };

    const toggleAllDeliveryMonths = () => {
        setSelectedDeliveryMonths(allDeliveryMonthsSelected ? [] : deliveryMonthOptions.map((o) => o.value));
    };
    // ========================================================================

    const monthOptions = useMemo(() => {
        const set = new Set();
        allRows.forEach((row) => {
            const key = getMonthKey(row.challanDate);
            if (key) set.add(key);
        });
        return Array.from(set).sort((a, b) => b.localeCompare(a));
    }, [allRows]);

    useEffect(() => {
        if (selectedMonths.size > 0) {
            const validMonths = new Set(monthOptions);
            const filtered = new Set([...selectedMonths].filter(m => validMonths.has(m)));
            if (filtered.size !== selectedMonths.size) {
                setSelectedMonths(filtered);
            }
        }
    }, [monthOptions, selectedMonths]);

    const filteredMonthOptions = useMemo(() => {
        if (!monthSearch.trim()) return monthOptions;
        const q = monthSearch.toLowerCase();
        return monthOptions.filter((m) => {
            const label = formatMonthLabel(m).toLowerCase();
            return label.includes(q) || m.includes(q);
        });
    }, [monthOptions, monthSearch]);

    const filterOptions = useMemo(() => {
        const opts = {};
        tableHeader.forEach((col) => {
            if (col.noFilter) return;
            const set = new Set();
            allRows.forEach((row) => {
                if (col.key === 'challanDate') set.add(getDateFilterValue(row.challanDate));
                else set.add(String(row[col.key] ?? ""));
            });
            opts[col.key] = col.key === 'challanDate'
                ? Array.from(set).sort((a, b) => b.localeCompare(a))
                : Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        });
        return opts;
    }, [allRows]);

    const filteredRows = useMemo(() => allRows.filter((row) => {
        if (selectedMonths.size > 0) {
            const rowMonth = getMonthKey(row.challanDate);
            if (!rowMonth || !selectedMonths.has(rowMonth)) return false;
        }

        return tableHeader.every((col) => {
            if (col.noFilter) return true;
            const selected = filters[col.key];
            if (!selected) return true;
            if (col.key === 'challanDate') {
                return selected.has(getDateFilterValue(row.challanDate));
            }
            return selected.has(String(row[col.key] ?? ""));
        });
    }), [allRows, filters, selectedMonths]);

    const totals = useMemo(() => {
        const t = { greyDelivery: 0, greyReturn: 0, greyReceive: 0, finishReceive: 0, billingAmount: 0 };
        filteredRows.forEach((row) => {
            t.greyDelivery += Number(row.greyDelivery) || 0;
            t.greyReturn += Number(row.greyReturn) || 0;
            t.greyReceive += Number(row.greyReceive) || 0;
            t.finishReceive += Number(row.finishReceive) || 0;
            t.billingAmount += Number(row.billingAmount) || 0;
        });
        t.processLoss = calcProcessLoss(t.greyReceive, t.finishReceive);
        return t;
    }, [filteredRows]);

    const goToPage = (p) => { if (p < 1 || p > totalPages) return; setPage(p); };
    const pageNumbers = useMemo(() => {
        const nums = [];
        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) nums.push(p);
            else if (nums[nums.length - 1] !== "...") nums.push("...");
        }
        return nums;
    }, [totalPages, page]);

    const closeFilterDropdown = () => {
        setOpenFilterKey(null);
        setDropdownPos(null);
        setFilterSearch("");
    };

    const openFilter = (key) => {
        if (openFilterKey === key) { closeFilterDropdown(); return; }
        const options = filterOptions[key] || [];
        const current = filters[key];
        setDraftSelected(current ? new Set(current) : new Set(options));
        setFilterSearch("");
        setDropdownPos(null);
        setOpenFilterKey(key);
    };

    const toggleDraftValue = (val) => setDraftSelected((prev) => { const next = new Set(prev); if (next.has(val)) next.delete(val); else next.add(val); return next; });
    const toggleSelectAllDraft = (options) => setDraftSelected((prev) => (prev.size === options.length ? new Set() : new Set(options)));

    const applyFilter = (key, options) => {
        setFilters((prev) => {
            const next = { ...prev };
            if (draftSelected.size === options.length) delete next[key];
            else next[key] = new Set(draftSelected);
            return next;
        });
        closeFilterDropdown();
    };

    const clearFilter = (key) => {
        setFilters((prev) => { const next = { ...prev }; delete next[key]; return next; });
        closeFilterDropdown();
    };

    // ===== MONTH FILTER (challan date, client-side) =====
    const openMonthFilter = () => {
        if (monthDropdownOpen) {
            setMonthDropdownOpen(false);
            setMonthSearch("");
            return;
        }
        if (selectedMonths.size > 0) {
            setMonthDraftSelected(new Set(selectedMonths));
        } else {
            setMonthDraftSelected(new Set(monthOptions));
        }
        setMonthSearch("");
        setMonthDropdownOpen(true);
    };

    const toggleMonthDraftValue = (val) => {
        setMonthDraftSelected(prev => {
            const next = new Set(prev);
            if (next.has(val)) next.delete(val);
            else next.add(val);
            return next;
        });
    };

    const toggleSelectAllMonths = () => {
        setMonthDraftSelected(prev => (prev.size === monthOptions.length ? new Set() : new Set(monthOptions)));
    };

    const applyMonthFilter = () => {
        setSelectedMonths(new Set(monthDraftSelected));
        setMonthDropdownOpen(false);
        setMonthSearch("");
    };

    const clearMonthFilter = () => {
        setSelectedMonths(new Set());
        setMonthDropdownOpen(false);
        setMonthSearch("");
    };

    // ===== SEARCH MONTH WISE HANDLER =====
    const handleDeliveryMonthSearch = async () => {
        if (selectedDeliveryMonths.length === 0) return;

        // "August 2025" or "August" -> "august" (unique lowercase names)
        const nameByValue = new Map(deliveryMonthOptions.map((o) => [o.value, o.name]));
        const monthNames = [];
        selectedDeliveryMonths.forEach((val) => {
            const name = nameByValue.get(val);
            if (name && !monthNames.includes(name)) monthNames.push(name);
        });

        setSearch("");
        setPage(1);
        setSearchLoading(true);
        setSearchError(null);
        setIsDeliveryMonthDropdownOpen(false);
        setAppliedMonthNames(monthNames);

        try {
            const res = await axiosPrivate.get("/api/dyeingOrder/challan/search", {
                params: { months: monthNames, context: "dyeingOrder" },
            });
            let searchData = [];
            if (Array.isArray(res.data)) searchData = res.data;
            else if (Array.isArray(res.data?.data)) searchData = res.data.data;
            setMovements(searchData);
            setTotalPages(1);
        } catch (err) {
            console.error("Month search failed:", err);
            setSearchError("Failed to search by month.");
            setMovements([]);
        } finally {
            setSearchLoading(false);
        }
    };
    // ==============================================

    const handleBillPreparation = (challanId) => {
        if (challanIds.includes(challanId)) setChallanIds((prev) => prev.filter(id => id !== challanId));
        else setChallanIds((prev) => [...prev, challanId]);
    };

    const handleGenerateBill = async () => {
        if (challanIds.length === 0) { alert("Please select at least one challan to generate the bill."); return; }
        try {
            const response = await axiosPrivate.post("/api/generate-bill", { challanIds }, { responseType: "blob" });
            const blob = new Blob([response.data], { type: "application/pdf" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `bill-${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Bill generation failed:", error);
            alert("Failed to generate bill. Please try again.");
        }
    };

    const handleChallanSearch = async () => {
        if (!search.trim()) { alert("Please enter at least one challan number or job number."); return; }
        setSearchLoading(true); setSearchError(null); setPage(1);
        // A challan search replaces any month search
        setAppliedMonthNames([]);
        setSelectedDeliveryMonths([]);
        const searchArray = search.split(/[\s,]+/).filter(Boolean);
        try {
            const res = await axiosPrivate.get("/api/dyeingOrder/challan/search", { params: { challans: searchArray.join(","), context: "dyeingOrder" } });
            let searchData = [];
            if (Array.isArray(res.data)) searchData = res.data;
            else if (Array.isArray(res.data?.data)) searchData = res.data.data;
            setMovements(searchData); setTotalPages(1);
        } catch (err) { setSearchError("Failed to search."); setMovements([]); }
        finally { setSearchLoading(false); }
    };

    // ===== EXCEL EXPORT: one sheet per dyeing factory + Summary sheet =====
    const handleExport = async () => {
        if (filteredRows.length === 0) { alert("No data to export."); return; }
        setIsExporting(true);
        try {
            const mod = await import('exceljs');
            const ExcelJS = mod.default || mod;

            // Period text (Month'Year) for titles & file name
            const sortedMonthKeys = [...selectedMonths].sort();
            const deliveryShort = appliedMonthNames.map((n) => n.charAt(0).toUpperCase() + n.slice(1, 3));
            const periodLabel = sortedMonthKeys.length > 0
                ? sortedMonthKeys.map(formatMonthShort).join(', ')
                : (deliveryShort.length > 0 ? `Delivery: ${deliveryShort.join(', ')}` : 'All Months');
            const filePeriod = sortedMonthKeys.length > 0
                ? sortedMonthKeys.map(formatMonthShort).join('_').replace(/'/g, '-')
                : (deliveryShort.length > 0 ? deliveryShort.join('_') : 'AllMonths');

            // Prepare rows (sorted by job, then date, then challan)
            const exportRows = filteredRows
                .map((r) => ({
                    ...r,
                    monthLabel: formatMonthShort(getMonthKey(r.challanDate)),
                }))
                .sort((a, b) => {
                    const ja = String(a.jobNo ?? '');
                    const jb = String(b.jobNo ?? '');
                    if (ja !== jb) return ja.localeCompare(jb, undefined, { numeric: true });
                    const da = normalizeDate(a.challanDate);
                    const db = normalizeDate(b.challanDate);
                    if (da !== db) return da < db ? -1 : 1;
                    return String(a.challanNo).localeCompare(String(b.challanNo), undefined, { numeric: true });
                });

            // Group by factory: delivery / return / receive of the same factory => ONE sheet
            const groups = new Map(); // key -> { name, rows }
            exportRows.forEach((r) => {
                const name = getPartyFactory(r);
                const key = factoryKey(name);
                if (!groups.has(key)) groups.set(key, { name, rows: [] });
                groups.get(key).rows.push(r);
            });
            const factories = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

            const wb = new ExcelJS.Workbook();
            wb.creator = 'Garments ERP';
            wb.created = new Date();

            const colCount = EXPORT_COLUMNS.length;

            // Summary sheet is created first so it is the first tab
            const summaryWs = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
            const usedNames = new Set(['summary']);
            const summaryData = [];

            factories.forEach(({ name: factory, rows }) => {
                const ws = wb.addWorksheet(makeSheetName(factory, usedNames), {
                    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
                });

                addTitleRow(ws, `${factory}  |  Dyeing Delivery & Received  |  ${periodLabel}`, colCount);
                addHeaderRow(ws, EXPORT_COLUMNS);

                const sums = {};
                EXPORT_TOTAL_KEYS.forEach((k) => { sums[k] = 0; });

                rows.forEach((r, idx) => {
                    const values = EXPORT_COLUMNS.map((c) => {
                        const v = r[c.key];
                        if (c.type === 'date') return v ? formatShortDate(v) : '';
                        if (c.type === 'number') {
                            const n = Number(v) || 0;
                            if (EXPORT_TOTAL_KEYS.includes(c.key)) sums[c.key] += n;
                            return n;
                        }
                        if (v === null || v === undefined || v === '-') return '';
                        return v;
                    });
                    const row = ws.addRow(values);
                    styleBodyRow(row, idx, EXPORT_COLUMNS);
                });

                const factoryLoss = calcProcessLoss(sums.greyReceive, sums.finishReceive);
                const totalValues = EXPORT_COLUMNS.map((c, i) => {
                    if (i === 0) return 'TOTAL';
                    if (c.key === 'processLoss') return factoryLoss;
                    if (EXPORT_TOTAL_KEYS.includes(c.key)) return sums[c.key];
                    return '';
                });
                styleTotalRow(ws.addRow(totalValues), EXPORT_COLUMNS);

                EXPORT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
                ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colCount } };
                ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

                summaryData.push({
                    factory,
                    challans: new Set(rows.map((r) => String(r.challanNo))).size,
                    processLoss: factoryLoss,
                    ...sums,
                });
            });

            // ----- Summary sheet -----
            addTitleRow(summaryWs, `Factory Wise Summary  |  Dyeing  |  ${periodLabel}`, SUMMARY_COLUMNS.length);
            addHeaderRow(summaryWs, SUMMARY_COLUMNS);

            const grand = { challans: 0, greyDelivery: 0, greyReturn: 0, greyReceive: 0, finishReceive: 0, billingAmount: 0 };
            summaryData.forEach((s, idx) => {
                Object.keys(grand).forEach((k) => { grand[k] += Number(s[k]) || 0; });
                const row = summaryWs.addRow(
                    SUMMARY_COLUMNS.map((c, i) => (i === 0 ? s.factory : Number(s[c.key]) || 0))
                );
                styleBodyRow(row, idx, SUMMARY_COLUMNS);
            });
            const grandLoss = calcProcessLoss(grand.greyReceive, grand.finishReceive);
            const grandRow = summaryWs.addRow(
                SUMMARY_COLUMNS.map((c, i) => {
                    if (i === 0) return 'GRAND TOTAL';
                    if (c.key === 'processLoss') return grandLoss;
                    return grand[c.key];
                })
            );
            styleTotalRow(grandRow, SUMMARY_COLUMNS);

            SUMMARY_COLUMNS.forEach((c, i) => { summaryWs.getColumn(i + 1).width = c.width; });

            // ----- Download .xlsx -----
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Dyeing_Report_${filePeriod}_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Excel export failed:', err);
            alert('Failed to export Excel file. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };
    // ===== END EXCEL EXPORT =====

    const hasActiveFilters =
        Object.keys(filters || {}).length > 0 ||
        (selectedMonths && selectedMonths.size > 0) ||
        !!search ||
        selectedDeliveryMonths.length > 0 ||
        appliedMonthNames.length > 0;

    const handleClearAllFilters = () => {
        const hadMonthSearch = appliedMonthNames.length > 0;

        setFilters({});
        closeFilterDropdown();
        setDraftSelected(new Set());

        setSelectedMonths(new Set());
        setMonthDraftSelected(new Set());
        setMonthDropdownOpen(false);
        setMonthSearch("");

        setSelectedDeliveryMonths([]);
        setAppliedMonthNames([]);
        setIsDeliveryMonthDropdownOpen(false);

        if (search || hadMonthSearch) {
            setSearch("");
            setSearchError(null);
            setPage(1);
            setRefreshKey(prev => prev + 1);
        }
    };

    const getCellBaseStyle = (row, idx) => {
        const isHovered = hoveredRow === row.rowKey;
        let bg = isHovered ? theme.colors.bgHover : (idx % 2 === 0 ? theme.colors.white : '#fafbfc');
        return { ...cellStyle, backgroundColor: bg };
    };

    // ===== PORTALED COLUMN FILTER DROPDOWN =====
    const renderColumnFilterDropdown = () => {
        if (!openFilterKey || !dropdownPos) return null;
        const th = tableHeader.find(h => h.key === openFilterKey);
        if (!th) return null;

        const options = filterOptions[openFilterKey] || [];
        const visibleOptions = options.filter((val) => {
            const displayVal = getFilterDisplay(openFilterKey, val);
            return String(displayVal).toLowerCase().includes(filterSearch.toLowerCase());
        });

        const allSelected = draftSelected.size === options.length && options.length > 0;
        const availableHeight = Math.max(220, Math.min(380, window.innerHeight - dropdownPos.top - 16));

        return createPortal(
            <div
                ref={dropdownRef}
                style={{
                    position: 'fixed',
                    top: dropdownPos.top,
                    left: dropdownPos.left,
                    width: dropdownPos.width,
                    zIndex: 99999,
                    background: theme.colors.white,
                    border: `1px solid ${theme.colors.borderDark}`,
                    borderRadius: theme.radius,
                    boxShadow: theme.shadows.xl,
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: availableHeight,
                    overflow: 'hidden',
                    fontFamily: FONT_STACK,
                    textAlign: 'left',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    fontWeight: 400,
                    fontSize: '0.875rem',
                    color: theme.colors.textMain,
                }}
            >
                <div style={{
                    padding: '10px 12px', borderBottom: `1px solid #e2e8f0`,
                    background: theme.colors.bgHeader, display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                    <span style={{
                        fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', color: theme.colors.textMain,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        Filter: {th.header}
                    </span>
                    <button
                        onClick={closeFilterDropdown}
                        title="Close"
                        style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 2, borderRadius: '50%', color: theme.colors.textMain, flexShrink: 0,
                        }}
                    >
                        <X size={14} />
                    </button>
                </div>

                <div style={{ padding: "10px 12px", borderBottom: `1px solid #e2e8f0` }}>
                    <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="Filter values..."
                        autoFocus
                        style={{
                            width: "100%", padding: "8px 10px",
                            border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px',
                            fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
                            fontFamily: FONT_STACK, color: theme.colors.textMain,
                        }}
                    />
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", minHeight: 0 }}>
                    <label style={{
                        display: "flex", alignItems: "center", gap: 8,
                        fontWeight: 600, marginBottom: 8, fontSize: '0.8rem',
                        color: theme.colors.textMain, cursor: 'pointer'
                    }}>
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleSelectAllDraft(options)}
                            style={{ accentColor: theme.colors.primary, width: 15, height: 15 }}
                        />
                        Select All ({options.length})
                    </label>
                    <div style={{ borderTop: `1px solid #e2e8f0`, paddingTop: 6 }}>
                        {visibleOptions.length === 0 && (
                            <div style={{ padding: '12px 0', fontSize: '0.8rem', color: theme.colors.textMain, textAlign: 'center', opacity: 0.6 }}>
                                No values found
                            </div>
                        )}
                        {visibleOptions.map((val) => {
                            const displayVal = getFilterDisplay(openFilterKey, val);
                            const isChecked = draftSelected.has(val);
                            return (
                                <label key={val} style={{
                                    display: "flex", alignItems: "center", gap: 8,
                                    fontSize: "0.8rem", padding: "5px 0", cursor: 'pointer',
                                    borderRadius: '4px'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleDraftValue(val)}
                                        style={{ accentColor: theme.colors.primary, width: 15, height: 15, flexShrink: 0 }}
                                    />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {displayVal === "" ? "(blank)" : displayVal}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                <div style={{
                    display: "flex", justifyContent: "space-between", gap: 8,
                    padding: "10px 12px", borderTop: `1px solid #e2e8f0`,
                    background: theme.colors.bgHeader,
                }}>
                    <button
                        onClick={() => clearFilter(openFilterKey)}
                        style={{
                            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            background: theme.colors.white, color: theme.colors.textMain,
                            border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px',
                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                            padding: '7px 0', fontFamily: FONT_STACK,
                        }}
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => applyFilter(openFilterKey, options)}
                        style={{
                            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            background: theme.colors.primary, color: theme.colors.white,
                            border: 'none', borderRadius: '6px',
                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                            padding: '7px 0', fontFamily: FONT_STACK,
                        }}
                    >
                        Apply
                    </button>
                </div>
            </div>,
            document.body
        );
    };
    // ===== END PORTALED FILTER DROPDOWN =====

    if (loading && movements.length === 0 && !searchLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: theme.colors.textMuted, fontFamily: FONT_STACK }}>
                <Loader size={24} className="animate-spin" style={{ marginRight: 10 }} /> Loading data...
            </div>
        );
    }

    const allVisibleSelected = filteredRows.length > 0 && filteredRows.every(r => selectedRows.has(r.rowKey));

    const handlePrepareChallanEdit = async (challanNo, jobNo) => {
        if (!challanNo) return;
        setIsChallanDataLoading(true);
        setIsChallanEditing(true);
        try {
            const res = await axiosPrivate.get(`/api/detail-challan-view/dyeingOrder/${challanNo}/${jobNo}`);
            setChallanToEditData(res.data);
        } catch (error) {
            console.error("Error preparing challan edit:", error);
        } finally {
            setIsChallanDataLoading(false);
        }
    };

    return (
        <div style={{ width: "100%", padding: "24px", fontFamily: FONT_STACK, color: theme.colors.textMain }}>

            {isChallanEditing && (
                <ChallanEditModal
                    setIsChallanEditing={setIsChallanEditing}
                    challanToEditData={challanToEditData}
                    isChallanDataLoading={isChallanDataLoading}
                />
            )}

            {/* Toolbar */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ position: 'relative', flex: '0 1 320px' }}>
                    <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                        style={{
                            width: '100%', border: `1px solid ${theme.colors.border}`, padding: "10px 12px 10px 36px",
                            borderRadius: theme.radius, outline: "none", fontSize: '0.875rem', transition: 'border-color 0.2s',
                            boxSizing: 'border-box', fontFamily: 'inherit'
                        }}
                        placeholder="Search Challan or Job No..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleChallanSearch(); }}
                        onFocus={(e) => e.target.style.borderColor = theme.colors.primary}
                        onBlur={(e) => e.target.style.borderColor = theme.colors.border}
                    />
                </div>

                <button
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: theme.colors.primary, color: theme.colors.white,
                        padding: "10px 20px", borderRadius: theme.radius, border: "none",
                        cursor: searchLoading ? "not-allowed" : "pointer", fontSize: '0.875rem', fontWeight: 500,
                        opacity: searchLoading ? 0.7 : 1, transition: 'background 0.2s', fontFamily: 'inherit'
                    }}
                    onClick={handleChallanSearch} disabled={searchLoading}
                >
                    {searchLoading ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
                    {searchLoading ? "Searching..." : "Search"}
                </button>

                {search && (
                    <button
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: theme.colors.white, color: theme.colors.textMuted,
                            padding: "10px 20px", borderRadius: theme.radius,
                            border: `1px solid ${theme.colors.border}`, cursor: "pointer", fontSize: '0.875rem', fontFamily: 'inherit'
                        }}
                        onClick={() => { setSearch(""); setSearchError(null); setPage(1); setRefreshKey(prev => prev + 1); }}
                    >
                        <X size={16} /> Clear
                    </button>
                )}

                {/* ===== DELIVERY MONTH MULTI-SELECT ===== */}
                {deliveryMonthLoading ? (
                    <span style={{ fontSize: '0.875rem', color: theme.colors.textMuted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Loader size={14} className="animate-spin" /> Loading months...
                    </span>
                ) : (
                    <div ref={deliveryMonthDropdownRef} style={{ position: 'relative' }}>
                        <button
                            onClick={() => setIsDeliveryMonthDropdownOpen((prev) => !prev)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                background: isDeliveryMonthDropdownOpen || selectedDeliveryMonths.length > 0 ? theme.colors.primary : theme.colors.white,
                                color: isDeliveryMonthDropdownOpen || selectedDeliveryMonths.length > 0 ? theme.colors.white : theme.colors.textMain,
                                padding: "10px 16px", borderRadius: theme.radius,
                                border: `1px solid ${theme.colors.border}`, cursor: "pointer",
                                fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <Calendar size={16} />
                            {selectedDeliveryMonths.length > 0 ? `${selectedDeliveryMonths.length} Month(s) Selected` : 'Delivery Months'}
                            <ChevronDown size={16} style={{
                                transform: isDeliveryMonthDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s'
                            }} />
                        </button>

                        {isDeliveryMonthDropdownOpen && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 6px)',
                                    left: 0,
                                    width: 280,
                                    zIndex: 60,
                                    background: theme.colors.white,
                                    border: `1px solid ${theme.colors.borderDark}`,
                                    borderRadius: theme.radius,
                                    boxShadow: theme.shadows.xl,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    maxHeight: 400,
                                    overflow: 'hidden',
                                    fontFamily: FONT_STACK,
                                }}
                            >
                                <div style={{
                                    padding: '12px',
                                    borderBottom: `1px solid #e2e8f0`,
                                    background: '#657582',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        color: 'white',
                                    }}>
                                        Delivery Months
                                    </span>
                                    <button
                                        onClick={() => setIsDeliveryMonthDropdownOpen(false)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'white', display: 'flex' }}
                                    >
                                        <X size={14} />
                                    </button>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                                    {deliveryMonthOptions.length === 0 ? (
                                        <div style={{ padding: '12px 0', fontSize: '0.8rem', textAlign: 'center', opacity: 0.6 }}>
                                            No delivery months found
                                        </div>
                                    ) : (
                                        <>
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: 8,
                                                fontWeight: 600, marginBottom: 8, fontSize: '0.8rem', cursor: 'pointer', color: theme.colors.textMain
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={allDeliveryMonthsSelected}
                                                    onChange={toggleAllDeliveryMonths}
                                                    style={{ accentColor: theme.colors.primary, width: 15, height: 15 }}
                                                />
                                                Select All ({deliveryMonthOptions.length})
                                            </label>
                                            <div style={{ borderTop: `1px solid #e2e8f0`, paddingTop: 8 }}>
                                                {deliveryMonthOptions.map((opt) => (
                                                    <label key={opt.value} style={{
                                                        display: 'flex', alignItems: 'center', gap: 8,
                                                        fontSize: '0.8rem', padding: '6px 0', cursor: 'pointer',
                                                        borderRadius: '4px', color: theme.colors.textMain
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedDeliveryMonths.includes(opt.value)}
                                                            onChange={() => toggleDeliveryMonth(opt.value)}
                                                            style={{ accentColor: theme.colors.primary, width: 15, height: 15, flexShrink: 0 }}
                                                        />
                                                        <span>{opt.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Appears as soon as one or more months are selected */}
                {selectedDeliveryMonths.length > 0 && (
                    <button
                        onClick={handleDeliveryMonthSearch}
                        disabled={searchLoading}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: theme.colors.success, color: theme.colors.white,
                            padding: "10px 20px", borderRadius: theme.radius, border: "none",
                            cursor: searchLoading ? "not-allowed" : "pointer",
                            opacity: searchLoading ? 0.7 : 1,
                            fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit',
                            boxShadow: theme.shadows.md,
                        }}
                    >
                        {searchLoading ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
                        Search Month Wise
                    </button>
                )}
                {/* ===== END DELIVERY MONTH MULTI-SELECT ===== */}

                {monthOptions.length > 0 && (
                    <div ref={monthDropdownRef} style={{ position: 'relative' }}>
                        <button
                            onClick={openMonthFilter}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                background: theme.colors.white,
                                color: selectedMonths.size > 0 ? theme.colors.primary : theme.colors.textMain,
                                padding: "10px 16px",
                                borderRadius: theme.radius,
                                border: `1px solid ${selectedMonths.size > 0 ? theme.colors.primary : theme.colors.border}`,
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                fontFamily: 'inherit',
                                minWidth: 200,
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease'
                            }}
                            title="Filter by challan date month"
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <Calendar size={16} />
                                {selectedMonths.size === 0 ? "All Months" :
                                    selectedMonths.size === 1 ? formatMonthLabel([...selectedMonths][0]) :
                                        `${selectedMonths.size} Months Selected`}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {selectedMonths.size > 0 && (
                                    <span
                                        role="button"
                                        onClick={(e) => { e.stopPropagation(); clearMonthFilter(); }}
                                        style={{
                                            background: 'transparent',
                                            color: theme.colors.primary, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', padding: 2,
                                            borderRadius: '50%', transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#eff6ff'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        title="Clear month filter"
                                    >
                                        <X size={14} />
                                    </span>
                                )}
                                <ChevronDown
                                    size={16}
                                    style={{
                                        transition: 'transform 0.2s ease',
                                        transform: monthDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)'
                                    }}
                                />
                            </div>
                        </button>

                        {monthDropdownOpen && (
                            <div
                                style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0,
                                    zIndex: 60, background: theme.colors.white,
                                    border: `1px solid ${theme.colors.border}`,
                                    borderRadius: theme.radius, width: 260, maxHeight: 360,
                                    boxShadow: theme.shadows.lg, display: 'flex',
                                    flexDirection: 'column', fontFamily: 'inherit', overflow: 'hidden'
                                }}
                            >
                                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${theme.colors.border}` }}>
                                    <input
                                        type="text"
                                        value={monthSearch}
                                        onChange={(e) => setMonthSearch(e.target.value)}
                                        placeholder="Search months..."
                                        autoFocus
                                        style={{
                                            width: "100%", padding: "8px 10px",
                                            border: `1px solid ${theme.colors.border}`, borderRadius: '6px',
                                            fontSize: '0.8rem', outline: 'none',
                                            boxSizing: 'border-box', fontFamily: 'inherit'
                                        }}
                                    />
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                                    <label style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        fontWeight: 600, marginBottom: 8, fontSize: '0.8rem',
                                        color: theme.colors.textMuted, cursor: 'pointer'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={monthDraftSelected.size === monthOptions.length && monthOptions.length > 0}
                                            onChange={toggleSelectAllMonths}
                                            style={{ accentColor: theme.colors.primary, width: 16, height: 16 }}
                                        />
                                        Select All ({monthOptions.length})
                                    </label>
                                    <div style={{ borderTop: `1px solid ${theme.colors.border}`, paddingTop: 6 }}>
                                        {filteredMonthOptions.length === 0 && (
                                            <div style={{ padding: '12px 0', fontSize: '0.8rem', color: theme.colors.textMuted, textAlign: 'center' }}>
                                                No months found
                                            </div>
                                        )}
                                        {filteredMonthOptions.map((m) => {
                                            const isChecked = monthDraftSelected.has(m);
                                            return (
                                                <label key={m} style={{
                                                    display: "flex", alignItems: "center", gap: 8,
                                                    fontSize: "0.85rem", padding: "6px 0", cursor: 'pointer',
                                                    borderRadius: '4px'
                                                }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleMonthDraftValue(m)}
                                                        style={{ accentColor: theme.colors.primary, width: 16, height: 16 }}
                                                    />
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {formatMonthLabel(m)}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div style={{
                                    display: "flex", justifyContent: "space-between", gap: 8,
                                    padding: "10px 12px", borderTop: `1px solid ${theme.colors.border}`,
                                    background: theme.colors.bgHeader
                                }}>
                                    <button
                                        onClick={clearMonthFilter}
                                        style={{
                                            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            background: theme.colors.white, color: theme.colors.textMain,
                                            border: `1px solid ${theme.colors.border}`, borderRadius: '6px',
                                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, padding: '6px 0', fontFamily: 'inherit'
                                        }}
                                    >
                                        Clear
                                    </button>
                                    <button
                                        onClick={applyMonthFilter}
                                        style={{
                                            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                            background: theme.colors.primary, color: theme.colors.white,
                                            border: 'none', borderRadius: '6px',
                                            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '6px 0', fontFamily: 'inherit'
                                        }}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {hasActiveFilters && (
                    <button
                        onClick={handleClearAllFilters}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#fef2f2', color: '#b91c1c',
                            padding: "10px 16px", borderRadius: theme.radius,
                            border: '1px solid #fecaca', cursor: "pointer",
                            fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit',
                            transition: 'all 0.15s ease', boxShadow: theme.shadows.sm
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
                        title="Clear all active filters"
                    >
                        <X size={16} /> Clear All Filters
                    </button>
                )}

                <div style={{ flex: 1 }} />

                <button
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: theme.colors.white, color: theme.colors.textMain,
                        padding: "10px 20px", borderRadius: theme.radius,
                        border: `1px solid ${theme.colors.border}`,
                        cursor: isExporting ? "not-allowed" : "pointer",
                        opacity: isExporting ? 0.7 : 1,
                        fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit'
                    }}
                    onClick={handleExport}
                    disabled={isExporting}
                    title="Export factory-wise Excel (one sheet per factory)"
                >
                    {isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />}
                    {isExporting ? "Exporting..." : "Export Excel"}
                </button>
            </div>

            {searchError && (
                <div style={{
                    padding: "12px 16px", color: "#991b1b", background: "#fef2f2",
                    border: "1px solid #fecaca", borderRadius: theme.radius, marginBottom: "16px",
                    fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit'
                }}>
                    <X size={16} /> {searchError}
                </div>
            )}

            {challanIds.length > 0 && (
                <div style={{
                    marginBottom: "16px", padding: "12px 16px", background: "#eff6ff",
                    border: "1px solid #bfdbfe", borderRadius: theme.radius,
                    display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit'
                }}>
                    <span style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: 500 }}>
                        {challanIds.length} challan{challanIds.length > 1 ? 's' : ''} selected
                    </span>
                    <button
                        onClick={handleGenerateBill}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#1e40af', color: theme.colors.white,
                            padding: "8px 16px", borderRadius: '6px', border: "none",
                            cursor: "pointer", fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit'
                        }}
                    >
                        Generate Bill PDF
                    </button>
                </div>
            )}

            {/* Table Container */}
            <div style={{
                width: "100%", maxHeight: "calc(100vh - 220px)", overflow: "auto",
                border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius,
                boxShadow: theme.shadows.md, background: theme.colors.white,
                position: 'relative',
            }}>
                <table style={{ width: "100%", minWidth: "1600px", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
                    <thead>
                        <tr>
                            {tableHeader.map((th) => {
                                const frozen = getFrozenStyle(th.key, 'header');
                                if (th.noFilter) {
                                    return (
                                        <th key={th.key} style={{ ...thStickyStyle, width: th.width, ...frozen }}>
                                            {th.key === 'select' ? (
                                                <input
                                                    type="checkbox"
                                                    checked={allVisibleSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) setSelectedRows(new Set(filteredRows.map(r => r.rowKey)));
                                                        else setSelectedRows(new Set());
                                                    }}
                                                    style={{ accentColor: theme.colors.primary, cursor: 'pointer', width: 16, height: 16 }}
                                                />
                                            ) : th.header}
                                        </th>
                                    );
                                }
                                const isActive = !!filters[th.key];
                                const isOpen = openFilterKey === th.key;
                                return (
                                    <th key={th.key} style={{ ...thStickyStyle, width: th.width, ...frozen }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                            <span style={{ whiteSpace: "normal", wordBreak: "break-word", textAlign: "center", flex: 1 }}>{th.header}</span>
                                            <button
                                                ref={(el) => { filterButtonRefs.current[th.key] = el; }}
                                                onClick={() => openFilter(th.key)}
                                                style={{
                                                    border: "none",
                                                    background: (isActive || isOpen) ? theme.colors.primary : "transparent",
                                                    color: theme.colors.white,
                                                    cursor: "pointer", padding: "2px 4px", borderRadius: '4px',
                                                    display: 'flex', alignItems: 'center', transition: 'all 0.15s', flexShrink: 0
                                                }}
                                            >
                                                <Filter size={12} />
                                            </button>
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row, idx) => (
                            <tr
                                key={row.rowKey}
                                onMouseEnter={() => setHoveredRow(row.rowKey)}
                                onMouseLeave={() => setHoveredRow(null)}
                            >
                                {tableHeader.map((th) => {
                                    const frozen = getFrozenStyle(th.key, 'body');
                                    const baseStyle = { ...getCellBaseStyle(row, idx), ...frozen };

                                    if (th.key === 'select') {
                                        return (
                                            <td key={th.key} style={baseStyle}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRows.has(row.rowKey)}
                                                    onChange={(e) => {
                                                        const next = new Set(selectedRows);
                                                        if (e.target.checked) next.add(row.rowKey); else next.delete(row.rowKey);
                                                        setSelectedRows(next);
                                                    }}
                                                    onClick={() => handleBillPreparation(row.chId)}
                                                    style={{ accentColor: theme.colors.primary, cursor: 'pointer', width: 16, height: 16 }}
                                                />
                                            </td>
                                        );
                                    }

                                    if (th.key === 'challanDate') {
                                        return (
                                            <td key={th.key} style={baseStyle}>
                                                <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                                    {formatShortDate(row.challanDate)}
                                                </span>
                                            </td>
                                        );
                                    }

                                    if (th.key === 'color') {
                                        return (
                                            <td key={th.key} style={baseStyle}>
                                                {row.color && row.color !== "-" ? (
                                                    <span style={{
                                                        display: 'inline-block', padding: '2px 10px', borderRadius: '12px',
                                                        background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word'
                                                    }}>{row.color}</span>
                                                ) : "-"}
                                            </td>
                                        );
                                    }

                                    if (th.key === 'processLoss') {
                                        return (
                                            <td key={th.key} style={baseStyle}>
                                                {row.greyReceive > 0 ? (
                                                    <span style={{
                                                        color: Number(row.processLoss) > 5 ? '#dc2626' : theme.colors.textMain,
                                                        fontWeight: Number(row.processLoss) > 5 ? 600 : 400,
                                                        fontVariantNumeric: 'tabular-nums', whiteSpace: 'normal', wordBreak: 'break-word'
                                                    }}>
                                                        {Number(row.processLoss).toFixed(2)}%
                                                    </span>
                                                ) : "-"}
                                            </td>
                                        );
                                    }

                                    if (th.key === 'unitePrice' || th.key === 'billingAmount') {
                                        return (
                                            <td key={th.key} style={{ ...baseStyle, fontVariantNumeric: 'tabular-nums', fontWeight: th.key === 'billingAmount' ? 600 : 400 }}>
                                                {row[th.key] > 0 ? Number(row[th.key]).toFixed(2) : "-"}
                                            </td>
                                        );
                                    }

                                    if (th.key === 'jobNo' || th.key === 'composition') {
                                        return (
                                            <td key={th.key} style={baseStyle}>
                                                <span
                                                    onClick={th.key === 'jobNo' ? () => handlePrepareChallanEdit(row.challanNo, row[th.key]) : undefined}
                                                    style={{
                                                        fontWeight: th.key === 'jobNo' ? 500 : 400,
                                                        cursor: th.key === 'jobNo' ? 'pointer' : 'default',
                                                        whiteSpace: 'normal', wordBreak: 'break-word'
                                                    }}>{row[th.key]}</span>
                                            </td>
                                        );
                                    }

                                    const isNumber = ['greyDelivery', 'greyReturn', 'greyReceive', 'finishReceive'].includes(th.key);
                                    const currentValue = row[th.key];

                                    return (
                                        <td key={th.key} style={{ ...baseStyle, fontVariantNumeric: isNumber ? 'tabular-nums' : 'normal' }}>
                                            <div
                                                style={{
                                                    minHeight: '20px', textAlign: 'center',
                                                    opacity: currentValue ? 1 : 0.5,
                                                    whiteSpace: 'normal',
                                                    wordBreak: 'break-word',
                                                }}>
                                                {isNumber
                                                    ? (Number(currentValue) > 0 ? Number(currentValue).toFixed(2) : "-")
                                                    : (currentValue || "-")
                                                }
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        {filteredRows.length === 0 && (
                            <tr>
                                <td style={{ ...cellStyle, padding: 40, color: theme.colors.textMuted, whiteSpace: 'normal' }} colSpan={tableHeader.length}>
                                    {movements.length === 0
                                        ? "No records found."
                                        : "No rows match the current filters."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                    {filteredRows.length > 0 && (
                        <tfoot>
                            <tr>
                                {tableHeader.map((th) => {
                                    const frozen = getFrozenStyle(th.key, 'footer');
                                    if (th.key === 'composition') {
                                        return <td key={th.key} style={{ ...tfootCellStyle, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', ...frozen }}>Total</td>;
                                    }
                                    if (['greyDelivery', 'greyReturn', 'greyReceive', 'finishReceive', 'billingAmount'].includes(th.key)) {
                                        return (
                                            <td key={th.key} style={{ ...tfootCellStyle, fontVariantNumeric: 'tabular-nums', fontWeight: th.key === 'billingAmount' ? 800 : 700, ...frozen }}>
                                                {totals[th.key] > 0 ? totals[th.key].toFixed(2) : "-"}
                                            </td>
                                        );
                                    }
                                    if (th.key === 'processLoss') {
                                        return (
                                            <td key={th.key} style={{ ...tfootCellStyle, fontVariantNumeric: 'tabular-nums', ...frozen }}>
                                                {totals.greyReceive > 0 ? totals.processLoss.toFixed(2) + "%" : "-"}
                                            </td>
                                        );
                                    }
                                    return <td key={th.key} style={{ ...tfootCellStyle, ...frozen }}></td>;
                                })}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {!search && appliedMonthNames.length === 0 && totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: 'center', marginTop: 20, gap: 4, fontFamily: 'inherit' }}>
                    <button
                        style={{ ...pageButtonStyle(false), opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                        onClick={() => goToPage(page - 1)} disabled={page === 1}
                    >
                        Prev
                    </button>
                    {pageNumbers.map((p, i) =>
                        p === "..."
                            ? <span key={`e-${i}`} style={{ margin: "0 6px", color: theme.colors.textMuted, letterSpacing: 2 }}>...</span>
                            : <button key={p} style={pageButtonStyle(p === page)} onClick={() => goToPage(p)}>{p}</button>
                    )}
                    <button
                        style={{ ...pageButtonStyle(false), opacity: page === totalPages ? 0.4 : 1, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                        onClick={() => goToPage(page + 1)} disabled={page === totalPages}
                    >
                        Next
                    </button>
                </div>
            )}

            {/* PORTALED COLUMN FILTER DROPDOWN */}
            {renderColumnFilterDropdown()}
        </div>
    );
};

export default Dyeing;