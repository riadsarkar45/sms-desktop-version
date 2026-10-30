import React, { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFetchData } from '../../../hooks/fetch';
import { useTableFilters } from './UseFilter';
import { Loader, Search, Download, Filter, X, Calendar, ChevronDown } from 'lucide-react';
import useAxiosPrivate from '../../../hooks/UseAxiosPrivate';
import UseDeliveryMonths from './delivery-months/UseDeliveryMonths';
import ChallanEditModal from '../../components/modals/ChallanEditModal';

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

// Rows per page (only used after a search)
const SEARCH_PAGE_SIZE = 30;

const cellStyle = {
    padding: "12px 16px",
    borderBottom: `1px solid ${theme.colors.border}`,
    borderRight: `1px solid ${theme.colors.border}`,
    fontSize: "0.875rem",
    color: theme.colors.textMain,
    verticalAlign: "middle",
    textAlign: "center",
    transition: "background-color 0.15s ease",
    whiteSpace: "normal",
    wordWrap: "break-word",
    wordBreak: "break-word",
    lineHeight: "1.2",
    backgroundClip: "padding-box",
};

const thStickyStyle = {
    ...cellStyle,
    position: "sticky", top: 0, zIndex: 30,
    background: "#657582",
    fontWeight: 600, fontSize: "0.80rem",
    textTransform: "uppercase", letterSpacing: "0.05em",
    color: "white",
    borderBottom: `3px solid ${theme.colors.borderDark}`,
    boxShadow: theme.shadows.sm,
    whiteSpace: "normal", wordWrap: "break-word", wordBreak: "break-word",
    verticalAlign: "middle", textAlign: "center",
    backgroundClip: "padding-box",
};

const tfootCellStyle = {
    ...cellStyle,
    position: "sticky", bottom: 0, zIndex: 30,
    background: "#657582", fontWeight: 700,
    borderTop: `2px solid ${theme.colors.borderDark}`, borderBottom: "none",
    color: "white", textAlign: "center",
    backgroundClip: "padding-box",
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
    { header: "Challan No", width: "120px", key: "challanNo" },
    { header: "Job No", width: "140px", key: "jobNo" },
    { header: "Composition", width: "270px", key: "composition" },
    { header: "Color", width: "200px", key: "color" },
    { header: "From Factory", width: "160px", key: "fromFactory" },
    { header: "To Factory", width: "160px", key: "toFactory" },
    { header: "Yarn Del", width: "110px", key: "yarnDelivery" },
    { header: "Yarn Ret", width: "110px", key: "yarnReturn" },
    { header: "Greige Rec", width: "120px", key: "greyFabricReceived" },
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
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;

const normalizeDate = (val) => {
    if (!val) return "";
    if (val instanceof Date) return isNaN(val.getTime()) ? "" : val.toISOString();
    const str = String(val);
    const matches = str.match(ISO_DATE_RE);
    if (!matches || matches.length === 0) return str;
    return [...matches].sort()[0];
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatShortDate = (val) => {
    const normalized = normalizeDate(val);
    if (!normalized) return "-";
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return "-";
    return `${d.getUTCDate()}-${MONTH_SHORT[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(-2)}`;
};

const getDateFilterValue = (dateVal) => {
    const normalized = normalizeDate(dateVal);
    if (!normalized) return "";
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return String(normalized);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// "2026-09" key used for filtering/sorting
const getMonthKey = (dateVal) => {
    const day = getDateFilterValue(dateVal);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : "";
};

// "2026-09"  ->  "Sep'26"
const formatMonthLabel = (key) => {
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return key;
    const [y, m] = key.split('-');
    return `${MONTH_SHORT[Number(m) - 1]}'${y.slice(-2)}`;
};

const getFilterDisplay = (key, val) => {
    if (key !== 'challanDate' || !val) return val;
    const str = String(val);
    if (/^\d{4}-\d{2}$/.test(str)) return formatMonthLabel(str);
    if (ISO_DATE_RE.test(str)) {
        ISO_DATE_RE.lastIndex = 0;
        return formatShortDate(str);
    }
    ISO_DATE_RE.lastIndex = 0;
    return val;
};
// ===== END DATE HELPERS =====

// ===== DELIVERY MONTH PARSING =====
const MONTH_NUMBERS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MIN_VALID_YEAR = 2000;
const MAX_VALID_YEAR = 2100;

const parseDeliveryMonth = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.trim().match(/^([A-Za-z]+)(?:\s+(\d{4}))?$/);
    if (!match) return null;
    const name = match[1].toLowerCase();
    const monthNumber = MONTH_NUMBERS[name];
    if (!monthNumber) return null;
    const year = match[2] ? Number(match[2]) : null;
    if (year !== null && (year < MIN_VALID_YEAR || year > MAX_VALID_YEAR)) return null;
    const shortName = MONTH_SHORT[monthNumber - 1];
    return {
        value: raw,
        name,
        // Month'Year  ->  Sep'26   (or just "Sep" if the source has no year)
        label: year ? `${shortName}'${String(year).slice(-2)}` : shortName,
        sortKey: year ? `${year}-${String(monthNumber).padStart(2, '0')}` : String(monthNumber).padStart(2, '0'),
    };
};
// ===== END DELIVERY MONTH PARSING =====

// ===== EXCEL EXPORT CONFIG =====
// The knitting factory (party) a row belongs to.
//  - Yarn Delivery  : yarn goes OUT to the knitting factory  -> party = toFactory
//  - Yarn Return / Grey (Greige) Received : goods come BACK from the knitting factory -> party = fromFactory
// This way delivery + return + received of the same factory always land in ONE sheet.
const getPartyFactory = (row) => {
    const to = String(row.toFactory || '').trim();
    const from = String(row.fromFactory || '').trim();
    const isDelivery = Number(row.yarnDelivery) > 0;
    const isBack = Number(row.yarnReturn) > 0 || Number(row.greyFabricReceived) > 0;
    let party;
    if (isDelivery && !isBack) party = to || from;
    else if (isBack && !isDelivery) party = from || to;
    else party = to || from; // mixed / no qty
    return party || 'Unknown';
};
// Same factory typed with different spacing/casing is treated as one factory
const factoryKey = (name) => String(name || 'Unknown').replace(/\s+/g, ' ').trim().toLowerCase();

const EXPORT_COLUMNS = [
    { header: 'Date', key: 'challanDate', width: 13, type: 'date' },
    { header: "Month'Year", key: 'monthLabel', width: 12, type: 'text' },
    { header: 'Challan No', key: 'challanNo', width: 14, type: 'text' },
    { header: 'Job No', key: 'jobNo', width: 18, type: 'text' },
    { header: 'Composition', key: 'composition', width: 34, type: 'text' },
    { header: 'Color', key: 'color', width: 22, type: 'text' },
    { header: 'From Factory', key: 'fromFactory', width: 22, type: 'text' },
    { header: 'To Factory', key: 'toFactory', width: 22, type: 'text' },
    { header: 'Yarn Delivery', key: 'yarnDelivery', width: 15, type: 'number' },
    { header: 'Yarn Return', key: 'yarnReturn', width: 15, type: 'number' },
    { header: 'Greige Received', key: 'greyFabricReceived', width: 17, type: 'number' },
    { header: 'Price/KG', key: 'unitePrice', width: 12, type: 'number' },
    { header: 'Billing', key: 'billingAmount', width: 16, type: 'number' },
];
const EXPORT_TOTAL_KEYS = ['yarnDelivery', 'yarnReturn', 'greyFabricReceived', 'billingAmount'];

const XL = {
    title: 'FF1E293B',
    header: 'FF657582',
    zebra: 'FFF8FAFC',
    total: 'FFF5D8C9',
    line: 'FFCBD5E1',
    white: 'FFFFFFFF',
    text: 'FF0F172A',
};
const XL_NUM_FMT = '#,##0.00;-#,##0.00;"-"';
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

const addHeaderRow = (ws, headers, numericIdx) => {
    const row = ws.getRow(3);
    headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 11, color: { argb: XL.white }, name: 'Calibri' };
        cell.fill = xlFill(XL.header);
        cell.border = xlBorder;
        cell.alignment = { vertical: 'middle', horizontal: numericIdx.has(i) ? 'right' : 'center', wrapText: true };
    });
    row.height = 26;
};

const styleBodyRow = (row, idx, numericIdx) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const isNum = numericIdx.has(colNumber - 1);
        cell.border = xlBorder;
        cell.font = { size: 10, color: { argb: XL.text }, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: isNum ? 'right' : 'left', wrapText: !isNum };
        if (isNum) cell.numFmt = XL_NUM_FMT;
        if (idx % 2 === 1) cell.fill = xlFill(XL.zebra);
    });
};

const styleTotalRow = (row, numericIdx) => {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const isNum = numericIdx.has(colNumber - 1);
        cell.font = { bold: true, size: 11, color: { argb: XL.text }, name: 'Calibri' };
        cell.fill = xlFill(XL.total);
        cell.border = { top: { style: 'medium', color: { argb: XL.title } }, left: xlThin, right: xlThin, bottom: xlThin };
        cell.alignment = { vertical: 'middle', horizontal: isNum ? 'right' : 'left' };
        if (isNum) cell.numFmt = XL_NUM_FMT;
    });
    row.height = 24;
};
// ===== END EXCEL EXPORT CONFIG =====

const FILTER_DROPDOWN_WIDTH = 270;

const Knitting = () => {
    // --- ALL STATE AT TOP LEVEL ---
    const [movements, setMovements] = useState([]);
    const [fetchError, setFetchError] = useState(null);
    const [selectedRows, setSelectedRows] = useState(new Set());

    const [fetchAll, setFetchAll] = useState(false);
    const [search, setSearch] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Search results mode + pagination
    const [searchActive, setSearchActive] = useState(false);
    const [searchPage, setSearchPage] = useState(1);
    const tableScrollRef = useRef(null);

    // Search tracking (Found vs Not Found for BOTH Challan No and Job No)
    const [foundSearchItems, setFoundSearchItems] = useState([]);
    const [notFoundSearchItems, setNotFoundSearchItems] = useState([]);

    const [isFetchingAll, setIsFetchingAll] = useState(false);
    const [pendingFilterKey, setPendingFilterKey] = useState(null);

    // Challan-date month filter (client-side) - labels shown as Month'Year (e.g. Sep'26)
    const [selectedMonths, setSelectedMonths] = useState(new Set());
    const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
    const [monthDraftSelected, setMonthDraftSelected] = useState(new Set());
    const [monthSearch, setMonthSearch] = useState("");
    const monthDropdownRef = useRef(null);

    // ===== DELIVERY MONTHS MULTI-SELECT STATES =====
    const [isDeliveryMonthDropdownOpen, setIsDeliveryMonthDropdownOpen] = useState(false);
    const [selectedDeliveryMonths, setSelectedDeliveryMonths] = useState([]);
    const [appliedMonthNames, setAppliedMonthNames] = useState([]);
    const deliveryMonthDropdownRef = useRef(null);
    // ===============================================

    const [hoveredRow, setHoveredRow] = useState(null);
    const [isBillGenerating, setIsBillGenerating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Portal refs & state for the column filter dropdown
    const filterButtonRefs = useRef({});
    const [dropdownPos, setDropdownPos] = useState(null);

    const [isChallanEditing, setIsChallanEditing] = useState(false);
    const [challanToEditData, setChallanToEditData] = useState({});
    const [isChallanDataLoading, setIsChallanDataLoading] = useState(false);

    const { fetchData, loading } = useFetchData();
    const { deliveryMonths, isMonthLoading: deliveryMonthLoading } = UseDeliveryMonths();
    const axiosPrivate = useAxiosPrivate();

    const appliedMonthsKey = appliedMonthNames.join(',');

    const allRows = useMemo(() => {
        if (!movements || !Array.isArray(movements)) return [];
        const rows = [];
        const extractJobNo = (item) => item?.workOrder?.jobNo || (typeof item?.workOrder === 'string' ? item.workOrder : null);

        const makeRow = (challanNo, jobNo, comp, color, source, mvId, deliveryId) => {
            const stableId = deliveryId ?? mvId ?? source?.id ?? null;
            const rowKey = `${challanNo}|${jobNo}|${comp}|${color}|${stableId ?? ''}`;
            return {
                rowKey,
                mvId: mvId ?? challanNo,
                deliveryId: deliveryId ?? source?.id ?? null,
                chId: source?.id || challanNo,
                challanNo,
                jobNo,
                composition: comp || "-",
                color: color || "-",
                challanDate: normalizeDate(source?.deliveryDate || source?.challanDate),
                toFactory: source?.toFactory || "",
                fromFactory: source?.fromFactory || "",
                yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, deliveryQty: 0,
                unitePrice: Number(source?.unitePrice) || 0,
                paidBillingAmount: Number(source?.paidBillingAmount) || 0,
            };
        };

        const applyDelivery = (row, dv, source) => {
            const qty = Number(dv?.deliveryQty ?? dv?.totalQty) || 0;
            row.deliveryQty += qty;
            const type = String(dv?.deliveryType || "").toLowerCase().replace(/[\s_-]+/g, "");
            if (type.includes("yarndelivery")) row.yarnDelivery += qty;
            else if (type.includes("yarnreturn")) row.yarnReturn += qty;
            else if (type.includes("greyfabric") || type.includes("greigereceived") || type.includes("yarnreceived") || type.includes("greyreceived")) row.greyFabricReceived += qty;

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
                    facets.push({
                        comp: c?.composition || item?.composition || "-",
                        color: c?.color || item?.color || "-",
                        qty: qtyNum,
                    });
                });
            } else if (typeof item?.color === "string" && item.color.includes(", ")) {
                item.color.split(", ").map((s) => s.trim()).filter(Boolean).forEach((colorPart) => {
                    facets.push({ comp: item?.composition || "-", color: colorPart, qty: null });
                });
            }
            if (facets.length === 0) {
                facets.push({ comp: item?.composition || "-", color: item?.color || "-", qty: null });
            }
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
                    const row = makeRow(challanNo, jobNo, comp, color, dv, item.id, dv.id);
                    if (item.unitePrice && !row.unitePrice) row.unitePrice = Number(item.unitePrice);
                    applyDelivery(row, dv, item);
                    rows.push(row);
                });
            } else if (item.challanNo !== undefined && item.challanNo !== null) {
                const facets = getFacets(item);
                const hasFacetQty = facets.some((f) => f.qty !== null);

                facets.forEach((f) => {
                    const row = makeRow(item.challanNo, jobNo, f.comp, f.color, item, item.id, item.id);
                    if (hasFacetQty) {
                        if (f.qty !== null) applyDelivery(row, { ...item, deliveryQty: f.qty }, item);
                    } else if (facets.length === 1) {
                        applyDelivery(row, item, item);
                    }
                    rows.push(row);
                });
            }
        });

        return rows.map((row) => ({
            ...row,
            billingAmount: row.greyFabricReceived * row.unitePrice,
        }));
    }, [movements]);

    const {
        filters, openFilterKey, draftSelected, filterSearch, dropdownRef,
        filterOptions, filteredRows: hookFilteredRows, setFilterSearch, openFilter,
        toggleDraftValue, toggleSelectAllDraft, applyFilter, clearFilter,
    } = useTableFilters(allRows, tableHeader);

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

    // Month options for challan-date filter (newest first). Key = "YYYY-MM", label = Month'Year
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

    const filteredRows = useMemo(() => {
        let rows = hookFilteredRows;
        if (selectedMonths.size > 0) {
            rows = rows.filter((row) => {
                const rowMonth = getMonthKey(row.challanDate);
                return rowMonth && selectedMonths.has(rowMonth);
            });
        }
        return rows;
    }, [hookFilteredRows, selectedMonths]);

    const filtersString = JSON.stringify(filters || {});
    const selectedMonthsKey = [...selectedMonths].sort().join(',');

    const totalSearchPages = Math.max(1, Math.ceil(filteredRows.length / SEARCH_PAGE_SIZE));

    useEffect(() => {
        setSearchPage(1);
    }, [filtersString, selectedMonthsKey]);

    useEffect(() => {
        if (searchPage > totalSearchPages) setSearchPage(totalSearchPages);
    }, [searchPage, totalSearchPages]);

    const visibleRows = useMemo(() => {
        if (!searchActive) return filteredRows;
        const start = (searchPage - 1) * SEARCH_PAGE_SIZE;
        return filteredRows.slice(start, start + SEARCH_PAGE_SIZE);
    }, [filteredRows, searchActive, searchPage]);

    const searchPageNumbers = useMemo(() => {
        const nums = [];
        for (let p = 1; p <= totalSearchPages; p++) {
            if (p === 1 || p === totalSearchPages || Math.abs(p - searchPage) <= 1) nums.push(p);
            else if (nums[nums.length - 1] !== "...") nums.push("...");
        }
        return nums;
    }, [totalSearchPages, searchPage]);

    const goToSearchPage = (p) => {
        if (p < 1 || p > totalSearchPages) return;
        setSearchPage(p);
        if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
    };

    const rangeStart = filteredRows.length === 0 ? 0 : (searchPage - 1) * SEARCH_PAGE_SIZE + 1;
    const rangeEnd = Math.min(searchPage * SEARCH_PAGE_SIZE, filteredRows.length);

    const totals = useMemo(() => {
        const t = { yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, billingAmount: 0 };
        filteredRows.forEach((row) => {
            t.yarnDelivery += Number(row.yarnDelivery) || 0;
            t.yarnReturn += Number(row.yarnReturn) || 0;
            t.greyFabricReceived += Number(row.greyFabricReceived) || 0;
            t.billingAmount += Number(row.billingAmount) || 0;
        });
        return t;
    }, [filteredRows]);

    const toggleRow = (rowKey) => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            if (next.has(rowKey)) next.delete(rowKey);
            else next.add(rowKey);
            return next;
        });
    };

    const toggleSelectAllVisible = (checked) => {
        setSelectedRows((prev) => {
            const next = new Set(prev);
            visibleRows.forEach((r) => {
                if (checked) next.add(r.rowKey);
                else next.delete(r.rowKey);
            });
            return next;
        });
    };

    const challanIds = useMemo(() => {
        const ids = new Set();
        allRows.forEach((row) => {
            if (selectedRows.has(row.rowKey) && row.chId !== null && row.chId !== undefined) {
                ids.add(row.chId);
            }
        });
        return Array.from(ids);
    }, [allRows, selectedRows]);

    const handleGenerateBill = async () => {
        if (challanIds.length === 0) { alert("Please select at least one challan to generate the bill."); return; }
        setIsBillGenerating(true);
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
        } finally {
            setIsBillGenerating(false);
        }
    };

    useEffect(() => {
        if (search || appliedMonthsKey) return;
        setSearchActive(false);
        setFetchError(null);
        const queryParams = new URLSearchParams();
        if (fetchAll) {
            queryParams.append("fetchAll", "true");
            setIsFetchingAll(true);
        }
        if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
                if (value && Array.isArray(value) && value.length > 0) {
                    queryParams.append(key, value.join(","));
                } else if (value && typeof value === "string" && value.length > 0) {
                    queryParams.append(key, value);
                }
            });
        }
        const queryString = queryParams.toString();
        const url = `/api/challan-movement/knittingOrder${queryString ? "?" + queryString : ""}`;

        fetchData(url)
            .then((res) => {
                if (!res) {
                    setFetchError("Permission denied");
                    return;
                }
                let payload = [];
                if (Array.isArray(res)) payload = res;
                else if (Array.isArray(res?.data)) payload = res.data;
                else if (Array.isArray(res?.data?.data)) payload = res.data.data;
                setMovements(payload);
            })
            .catch((err) => {
                console.error("Failed to load Knitting deliveries:", err);
                if (err?.response?.status === 403) {
                    setFetchError("Permission denied");
                } else {
                    setFetchError(err?.response?.data?.message || err?.response?.data?.msg || err?.message || err?.msg || "Failed to load Knitting deliveries");
                }
                setPendingFilterKey(null);
            })
            .finally(() => {
                if (fetchAll) setIsFetchingAll(false);
            });
    }, [fetchData, filtersString, fetchAll, refreshKey, search, appliedMonthsKey]);

    useEffect(() => {
        if (fetchError && pendingFilterKey) { setPendingFilterKey(null); return; }
        if (pendingFilterKey && fetchAll && !isFetchingAll && !fetchError) { openFilter(pendingFilterKey); setPendingFilterKey(null); }
    }, [pendingFilterKey, fetchAll, isFetchingAll, fetchError, openFilter]);

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

    const handleOpenFilter = (key) => {
        if (!fetchAll) { if (!pendingFilterKey) setPendingFilterKey(key); setFetchAll(true); return; }
        openFilter(key);
    };

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
        // none or all selected == no month filter
        if (monthDraftSelected.size === 0 || monthDraftSelected.size === monthOptions.length) {
            setSelectedMonths(new Set());
        } else {
            setSelectedMonths(new Set(monthDraftSelected));
        }
        setMonthDropdownOpen(false);
        setMonthSearch("");
    };

    const clearMonthFilter = () => {
        setSelectedMonths(new Set());
        setMonthDraftSelected(new Set(monthOptions));
        setMonthDropdownOpen(false);
        setMonthSearch("");
    };

    // ===== CHALLAN / JOB SEARCH WITH FOUND/NOT FOUND TRACKING =====
    const handleChallanSearch = async () => {
        if (!search.trim()) { alert("Please enter at least one challan number or job number."); return; }
        setSearchLoading(true);
        setSearchError(null);
        setSearchActive(true);
        setSearchPage(1);

        // Reset tracking states
        setFoundSearchItems([]);
        setNotFoundSearchItems([]);

        // A challan/job search replaces any month search
        setAppliedMonthNames([]);
        setSelectedDeliveryMonths([]);

        const searchArray = search.split(/[\s,]+/).filter(Boolean);

        try {
            const res = await axiosPrivate.get("/api/knittingOrder/challan/search", {
                params: { challans: searchArray.join(","), context: "knittingOrder" }
            });
            let searchData = [];
            if (Array.isArray(res.data)) searchData = res.data;
            else if (Array.isArray(res.data?.data)) searchData = res.data.data;

            setMovements(searchData);

            // Extract all found Challan Nos AND Job Nos from the response
            const foundSearchTermsSet = new Set();
            searchData.forEach(item => {
                if (item?.challanNo) {
                    foundSearchTermsSet.add(String(item.challanNo).trim().toLowerCase());
                }
                const jobNo = item?.workOrder?.jobNo || (typeof item?.workOrder === 'string' ? item.workOrder : null);
                if (jobNo) {
                    foundSearchTermsSet.add(String(jobNo).trim().toLowerCase());
                }
                if (Array.isArray(item?.deliveries)) {
                    item.deliveries.forEach(dv => {
                        if (dv?.challanNo) {
                            foundSearchTermsSet.add(String(dv.challanNo).trim().toLowerCase());
                        }
                    });
                }
            });

            const found = [];
            const notFound = [];
            searchArray.forEach(term => {
                const normalized = term.trim().toLowerCase();
                if (foundSearchTermsSet.has(normalized)) found.push(term);
                else notFound.push(term);
            });

            setFoundSearchItems(found);
            setNotFoundSearchItems(notFound);

        } catch (err) {
            console.error("Search failed:", err);
            setSearchError("Failed to search.");
            setMovements([]);
            setFoundSearchItems([]);
            setNotFoundSearchItems(searchArray);
        } finally {
            setSearchLoading(false);
        }
    };

    const handleDeliveryMonthSearch = async () => {
        if (selectedDeliveryMonths.length === 0) return;
        const nameByValue = new Map(deliveryMonthOptions.map((o) => [o.value, o.name]));
        const monthNames = [];
        selectedDeliveryMonths.forEach((val) => {
            const name = nameByValue.get(val);
            if (name && !monthNames.includes(name)) monthNames.push(name);
        });

        setSearch("");
        setSearchActive(true);
        setSearchPage(1);
        setSearchLoading(true);
        setSearchError(null);
        setIsDeliveryMonthDropdownOpen(false);
        setAppliedMonthNames(monthNames);
        setFoundSearchItems([]);
        setNotFoundSearchItems([]);

        try {
            const res = await axiosPrivate.get("/api/knittingOrder/challan/search", {
                params: { months: monthNames, context: "knittingOrder" },
            });
            let searchData = [];
            if (Array.isArray(res.data)) searchData = res.data;
            else if (Array.isArray(res.data?.data)) searchData = res.data.data;
            setMovements(searchData);
        } catch (err) {
            console.error("Month search failed:", err);
            setSearchError("Failed to search by month.");
            setMovements([]);
        } finally {
            setSearchLoading(false);
        }
    };

    const hasActiveFilters =
        Object.keys(filters || {}).length > 0 ||
        (selectedMonths && selectedMonths.size > 0) ||
        !!search ||
        selectedDeliveryMonths.length > 0 ||
        appliedMonthNames.length > 0;

    const handleClearAllFilters = () => {
        const hadSearchMode = !!search || appliedMonthNames.length > 0 || searchActive;

        Object.keys(filters || {}).forEach((key) => clearFilter(key));
        setFilterSearch("");

        setSelectedMonths(new Set());
        setMonthDraftSelected(new Set());
        setMonthDropdownOpen(false);
        setMonthSearch("");

        setSelectedDeliveryMonths([]);
        setAppliedMonthNames([]);
        setIsDeliveryMonthDropdownOpen(false);

        setSearch("");
        setSearchError(null);
        setSearchActive(false);
        setSearchPage(1);

        setFoundSearchItems([]);
        setNotFoundSearchItems([]);

        if (hadSearchMode) setRefreshKey(prev => prev + 1);
    };

    const getCellBaseStyle = (row, idx) => {
        const isHovered = hoveredRow === row.rowKey;
        let bg = isHovered ? theme.colors.bgHover : (idx % 2 === 0 ? theme.colors.white : '#fafbfc');
        return { ...cellStyle, backgroundColor: bg };
    };

    // ===== EXCEL EXPORT: one sheet per factory + Summary sheet =====
    const handleExport = async () => {
        if (filteredRows.length === 0) { alert("No data to export."); return; }
        setIsExporting(true);
        try {
            const mod = await import('exceljs');
            const ExcelJS = mod.default || mod;

            // Period text (Month'Year) for titles & file name
            const sortedMonthKeys = [...selectedMonths].sort();
            const periodLabel = sortedMonthKeys.length > 0
                ? sortedMonthKeys.map(formatMonthLabel).join(', ')
                : (appliedMonthNames.length > 0
                    ? `Delivery: ${appliedMonthNames.map(n => n.charAt(0).toUpperCase() + n.slice(1, 3)).join(', ')}`
                    : 'All Months');
            const filePeriod = sortedMonthKeys.length > 0
                ? sortedMonthKeys.map(formatMonthLabel).join('_').replace(/'/g, '-')
                : 'AllMonths';

            // Prepare rows (sorted by date, then challan)
            const exportRows = filteredRows
                .map((r) => ({
                    ...r,
                    monthLabel: formatMonthLabel(getMonthKey(r.challanDate)),
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

            // Group by factory: delivery / return / received of the same factory => ONE sheet
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
            const numericIdx = new Set(
                EXPORT_COLUMNS.map((c, i) => (c.type === 'number' ? i : -1)).filter((i) => i >= 0)
            );

            // Summary sheet is created first so it is the first tab
            const summaryWs = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
            const usedNames = new Set(['summary']);
            const summaryData = [];

            factories.forEach(({ name: factory, rows }) => {
                const ws = wb.addWorksheet(makeSheetName(factory, usedNames), {
                    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
                });

                addTitleRow(ws, `${factory}  |  Knitting Delivery & Received  |  ${periodLabel}`, colCount);
                addHeaderRow(ws, EXPORT_COLUMNS.map((c) => c.header), numericIdx);

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
                    styleBodyRow(row, idx, numericIdx);
                });

                const totalValues = EXPORT_COLUMNS.map((c, i) => {
                    if (i === 0) return 'TOTAL';
                    if (EXPORT_TOTAL_KEYS.includes(c.key)) return sums[c.key];
                    return '';
                });
                styleTotalRow(ws.addRow(totalValues), numericIdx);

                EXPORT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
                ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: colCount } };
                ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

                summaryData.push({
                    factory,
                    challans: new Set(rows.map((r) => String(r.challanNo))).size,
                    ...sums,
                });
            });

            // ----- Summary sheet -----
            const sumHeaders = ['Factory', 'Challans', 'Yarn Delivery', 'Yarn Return', 'Greige Received', 'Billing'];
            const sumKeys = [null, 'challans', 'yarnDelivery', 'yarnReturn', 'greyFabricReceived', 'billingAmount'];
            const sumNumeric = new Set([1, 2, 3, 4, 5]);

            addTitleRow(summaryWs, `Factory Wise Summary  |  ${periodLabel}`, sumHeaders.length);
            addHeaderRow(summaryWs, sumHeaders, sumNumeric);

            const grand = { challans: 0, yarnDelivery: 0, yarnReturn: 0, greyFabricReceived: 0, billingAmount: 0 };
            summaryData.forEach((s, idx) => {
                Object.keys(grand).forEach((k) => { grand[k] += Number(s[k]) || 0; });
                const row = summaryWs.addRow(sumKeys.map((k) => (k === null ? s.factory : Number(s[k]) || 0)));
                styleBodyRow(row, idx, sumNumeric);
                row.getCell(2).numFmt = '#,##0'; // challan count
            });
            const grandRow = summaryWs.addRow(sumKeys.map((k, i) => (i === 0 ? 'GRAND TOTAL' : grand[k])));
            styleTotalRow(grandRow, sumNumeric);
            grandRow.getCell(2).numFmt = '#,##0';

            [36, 12, 16, 16, 18, 18].forEach((w, i) => { summaryWs.getColumn(i + 1).width = w; });

            // ----- Download .xlsx -----
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Knitting_Report_${filePeriod}_${new Date().toISOString().split('T')[0]}.xlsx`);
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
                    position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width,
                    zIndex: 99999, background: theme.colors.white, border: `1px solid ${theme.colors.borderDark}`,
                    borderRadius: theme.radius, boxShadow: theme.shadows.xl, display: 'flex', flexDirection: 'column',
                    maxHeight: availableHeight, overflow: 'hidden', fontFamily: FONT_STACK, textAlign: 'left',
                    textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, fontSize: '0.875rem', color: theme.colors.textMain,
                }}
            >
                <div style={{ padding: '10px 12px', borderBottom: `1px solid #e2e8f0`, background: theme.colors.bgHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.colors.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Filter: {th.header}
                    </span>
                    <button onClick={() => openFilter(openFilterKey)} title="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, borderRadius: '50%', color: theme.colors.textMain, flexShrink: 0 }}>
                        <X size={14} />
                    </button>
                </div>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid #e2e8f0` }}>
                    <input type="text" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Filter values..." autoFocus style={{ width: "100%", padding: "8px 10px", border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_STACK, color: theme.colors.textMain }} />
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", minHeight: 0 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 8, fontSize: '0.8rem', color: theme.colors.textMain, cursor: 'pointer' }}>
                        <input type="checkbox" checked={allSelected} onChange={() => toggleSelectAllDraft(options)} style={{ accentColor: theme.colors.primary, width: 15, height: 15 }} />
                        Select All ({options.length})
                    </label>
                    <div style={{ borderTop: `1px solid #e2e8f0`, paddingTop: 6 }}>
                        {visibleOptions.length === 0 && (
                            <div style={{ padding: '12px 0', fontSize: '0.8rem', color: theme.colors.textMain, textAlign: 'center', opacity: 0.6 }}>No values found</div>
                        )}
                        {visibleOptions.map((val) => {
                            const displayVal = getFilterDisplay(openFilterKey, val);
                            const isChecked = draftSelected.has(val);
                            return (
                                <label key={val} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", padding: "5px 0", cursor: 'pointer', borderRadius: '4px' }}>
                                    <input type="checkbox" checked={isChecked} onChange={() => toggleDraftValue(val)} style={{ accentColor: theme.colors.primary, width: 15, height: 15, flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayVal === "" ? "(blank)" : displayVal}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "10px 12px", borderTop: `1px solid #e2e8f0`, background: theme.colors.bgHeader }}>
                    <button onClick={() => clearFilter(openFilterKey)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: theme.colors.white, color: theme.colors.textMain, border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, padding: '7px 0', fontFamily: FONT_STACK }}>Clear</button>
                    <button onClick={() => applyFilter(openFilterKey, options)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: theme.colors.primary, color: theme.colors.white, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '7px 0', fontFamily: FONT_STACK }}>Apply</button>
                </div>
            </div>,
            document.body
        );
    };

    if (loading && movements.length === 0 && !searchLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: theme.colors.textMuted, fontFamily: FONT_STACK }}>
                <Loader size={24} className="animate-spin" style={{ marginRight: 10 }} /> Loading data...
            </div>
        );
    }

    if (fetchError && !search && !searchActive) {
        return (
            <div style={{ padding: "12px 16px", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: theme.radius, margin: 20, fontFamily: FONT_STACK }}>
                {fetchError}
            </div>
        );
    }

    const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(r => selectedRows.has(r.rowKey));

    const handlePrepareChallanEdit = async (challanNo, jobNo) => {
        if (!challanNo) return;
        setIsChallanDataLoading(true);
        setIsChallanEditing(true);
        try {
            const res = await axiosPrivate.get(`/api/detail-challan-view/knittingOrder/${challanNo}/${jobNo}`);
            console.log(res.data, "challan movement data");
            setChallanToEditData(res.data);
        } catch (error) {
            console.error("Error preparing challan edit:", error);
        } finally {
            setIsChallanDataLoading(false);
        }
    };

    const visibleMonthOptions = monthOptions.filter((key) =>
        formatMonthLabel(key).toLowerCase().includes(monthSearch.toLowerCase())
    );
    const allMonthsDraftSelected = monthOptions.length > 0 && monthDraftSelected.size === monthOptions.length;

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
                        style={{ width: '100%', border: `1px solid ${theme.colors.border}`, padding: "10px 12px 10px 36px", borderRadius: theme.radius, outline: "none", fontSize: '0.875rem', transition: 'border-color 0.2s', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        placeholder="Search Challan or Job No..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !searchLoading) handleChallanSearch(); }}
                        onFocus={(e) => e.target.style.borderColor = theme.colors.primary}
                        onBlur={(e) => e.target.style.borderColor = theme.colors.border}
                    />
                </div>

                <button
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.colors.primary, color: theme.colors.white, padding: "10px 20px", borderRadius: theme.radius, border: "none", cursor: searchLoading ? "not-allowed" : "pointer", fontSize: '0.875rem', fontWeight: 500, opacity: searchLoading ? 0.7 : 1, transition: 'background 0.2s', fontFamily: 'inherit' }}
                    onClick={handleChallanSearch} disabled={searchLoading}
                >
                    {searchLoading ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
                    {searchLoading ? "Searching..." : "Search"}
                </button>

                {search && (
                    <button
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.colors.white, color: theme.colors.textMuted, padding: "10px 20px", borderRadius: theme.radius, border: `1px solid ${theme.colors.border}`, cursor: "pointer", fontSize: '0.875rem', fontFamily: 'inherit' }}
                        onClick={() => {
                            setSearch("");
                            setSearchError(null);
                            setSearchActive(false);
                            setSearchPage(1);
                            setFoundSearchItems([]);
                            setNotFoundSearchItems([]);
                            setRefreshKey(prev => prev + 1);
                        }}
                    >
                        <X size={16} /> Clear
                    </button>
                )}

                {/* ===== CHALLAN DATE MONTH FILTER (Month'Year) ===== */}
                <div ref={monthDropdownRef} style={{ position: 'relative' }}>
                    <button
                        onClick={openMonthFilter}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: monthDropdownOpen || selectedMonths.size > 0 ? theme.colors.primary : theme.colors.white,
                            color: monthDropdownOpen || selectedMonths.size > 0 ? theme.colors.white : theme.colors.textMain,
                            padding: "10px 16px", borderRadius: theme.radius,
                            border: `1px solid ${theme.colors.border}`, cursor: "pointer",
                            fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.2s ease'
                        }}
                    >
                        <Calendar size={16} />
                        {selectedMonths.size === 0
                            ? "Month'Year"
                            : selectedMonths.size === 1
                                ? formatMonthLabel([...selectedMonths][0])
                                : `${selectedMonths.size} Months Selected`}
                        <ChevronDown size={16} style={{ transform: monthDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                    </button>

                    {monthDropdownOpen && (
                        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 260, zIndex: 60, background: theme.colors.white, border: `1px solid ${theme.colors.borderDark}`, borderRadius: theme.radius, boxShadow: theme.shadows.xl, display: 'flex', flexDirection: 'column', maxHeight: 400, overflow: 'hidden', fontFamily: FONT_STACK }}>
                            <div style={{ padding: '12px', borderBottom: `1px solid #e2e8f0`, background: '#657582', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'white' }}>Filter by Month'Year</span>
                                <button onClick={() => { setMonthDropdownOpen(false); setMonthSearch(""); }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'white', display: 'flex' }}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{ padding: '10px 12px', borderBottom: `1px solid #e2e8f0` }}>
                                <input
                                    type="text" value={monthSearch} onChange={(e) => setMonthSearch(e.target.value)}
                                    placeholder="Search month..." autoFocus
                                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_STACK, color: theme.colors.textMain }}
                                />
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', minHeight: 0 }}>
                                {monthOptions.length === 0 ? (
                                    <div style={{ padding: '12px 0', fontSize: '0.8rem', textAlign: 'center', opacity: 0.6 }}>No dates found</div>
                                ) : (
                                    <>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 8, fontSize: '0.8rem', cursor: 'pointer', color: theme.colors.textMain }}>
                                            <input type="checkbox" checked={allMonthsDraftSelected} onChange={toggleSelectAllMonths} style={{ accentColor: theme.colors.primary, width: 15, height: 15 }} />
                                            Select All ({monthOptions.length})
                                        </label>
                                        <div style={{ borderTop: `1px solid #e2e8f0`, paddingTop: 8 }}>
                                            {visibleMonthOptions.length === 0 && (
                                                <div style={{ padding: '8px 0', fontSize: '0.8rem', textAlign: 'center', opacity: 0.6 }}>No months match</div>
                                            )}
                                            {visibleMonthOptions.map((key) => (
                                                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', padding: '6px 0', cursor: 'pointer', color: theme.colors.textMain }}>
                                                    <input type="checkbox" checked={monthDraftSelected.has(key)} onChange={() => toggleMonthDraftValue(key)} style={{ accentColor: theme.colors.primary, width: 15, height: 15, flexShrink: 0 }} />
                                                    <span>{formatMonthLabel(key)}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderTop: `1px solid #e2e8f0`, background: theme.colors.bgHeader }}>
                                <button onClick={clearMonthFilter} style={{ flex: 1, background: theme.colors.white, color: theme.colors.textMain, border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, padding: '7px 0', fontFamily: FONT_STACK }}>Clear</button>
                                <button onClick={applyMonthFilter} style={{ flex: 1, background: theme.colors.primary, color: theme.colors.white, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '7px 0', fontFamily: FONT_STACK }}>Apply</button>
                            </div>
                        </div>
                    )}
                </div>

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
                                fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit', transition: 'all 0.2s ease'
                            }}
                        >
                            <Calendar size={16} />
                            {selectedDeliveryMonths.length > 0 ? `${selectedDeliveryMonths.length} Month(s) Selected` : 'Delivery Months'}
                            <ChevronDown size={16} style={{ transform: isDeliveryMonthDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                        </button>

                        {isDeliveryMonthDropdownOpen && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 280, zIndex: 60, background: theme.colors.white, border: `1px solid ${theme.colors.borderDark}`, borderRadius: theme.radius, boxShadow: theme.shadows.xl, display: 'flex', flexDirection: 'column', maxHeight: 400, overflow: 'hidden', fontFamily: FONT_STACK }}>
                                <div style={{ padding: '12px', borderBottom: `1px solid #e2e8f0`, background: '#657582', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'white' }}>Delivery Months</span>
                                    <button onClick={() => setIsDeliveryMonthDropdownOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'white', display: 'flex' }}>
                                        <X size={14} />
                                    </button>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                                    {deliveryMonthOptions.length === 0 ? (
                                        <div style={{ padding: '12px 0', fontSize: '0.8rem', textAlign: 'center', opacity: 0.6 }}>No delivery months found</div>
                                    ) : (
                                        <>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, marginBottom: 8, fontSize: '0.8rem', cursor: 'pointer', color: theme.colors.textMain }}>
                                                <input type="checkbox" checked={allDeliveryMonthsSelected} onChange={toggleAllDeliveryMonths} style={{ accentColor: theme.colors.primary, width: 15, height: 15 }} />
                                                Select All ({deliveryMonthOptions.length})
                                            </label>
                                            <div style={{ borderTop: `1px solid #e2e8f0`, paddingTop: 8 }}>
                                                {deliveryMonthOptions.map((opt) => (
                                                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', padding: '6px 0', cursor: 'pointer', borderRadius: '4px', color: theme.colors.textMain }}>
                                                        <input type="checkbox" checked={selectedDeliveryMonths.includes(opt.value)} onChange={() => toggleDeliveryMonth(opt.value)} style={{ accentColor: theme.colors.primary, width: 15, height: 15, flexShrink: 0 }} />
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

                {selectedDeliveryMonths.length > 0 && (
                    <button onClick={handleDeliveryMonthSearch} disabled={searchLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.colors.success, color: theme.colors.white, padding: "10px 20px", borderRadius: theme.radius, border: "none", cursor: searchLoading ? "not-allowed" : "pointer", opacity: searchLoading ? 0.7 : 1, fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', boxShadow: theme.shadows.md }}>
                        {searchLoading ? <Loader size={16} className="animate-spin" /> : <Search size={16} />}
                        Search Month Wise
                    </button>
                )}

                {hasActiveFilters && (
                    <button onClick={handleClearAllFilters} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef2f2', color: '#b91c1c', padding: "10px 16px", borderRadius: theme.radius, border: '1px solid #fecaca', cursor: "pointer", fontSize: '0.875rem', fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.15s ease', boxShadow: theme.shadows.sm }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#fef2f2'; }}
                        title="Clear all active filters"
                    >
                        <X size={16} /> Clear All Filters
                    </button>
                )}

                <div style={{ flex: 1 }} />

                <button
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: theme.colors.white, color: theme.colors.textMain, padding: "10px 20px", borderRadius: theme.radius, border: `1px solid ${theme.colors.border}`, cursor: isExporting ? "not-allowed" : "pointer", opacity: isExporting ? 0.7 : 1, fontSize: '0.875rem', fontWeight: 500, fontFamily: 'inherit' }}
                    onClick={handleExport}
                    disabled={isExporting}
                    title="Export factory-wise Excel (one sheet per factory)"
                >
                    {isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />}
                    {isExporting ? "Exporting..." : "Export Excel"}
                </button>
            </div>

            {/* Error Banner */}
            {searchError && (
                <div style={{ padding: "12px 16px", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: theme.radius, marginBottom: "16px", fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    <X size={16} /> {searchError}
                </div>
            )}

            {/* ===== FOUND / NOT FOUND SEARCH SUMMARY BANNER ===== */}
            {searchActive && !searchLoading && !searchError && (foundSearchItems.length > 0 || notFoundSearchItems.length > 0) && (
                <div style={{
                    marginBottom: "16px", padding: "16px", background: theme.colors.white,
                    border: "1px solid #e2e8f0", borderRadius: theme.radius,
                    display: 'flex', flexDirection: 'column', gap: 12, fontFamily: 'inherit',
                    fontSize: '0.875rem', boxShadow: theme.shadows.sm
                }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, color: theme.colors.textMain }}>Search Results Summary:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        {foundSearchItems.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: theme.colors.success, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    ✓ Found ({foundSearchItems.length}):
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {foundSearchItems.map((item, i) => (
                                        <span key={`found-${i}`} style={{
                                            background: '#ecfdf5', color: '#047857',
                                            padding: '4px 10px', borderRadius: '6px',
                                            border: '1px solid #a7f3d0', fontWeight: 600, fontSize: '0.8rem'
                                        }}>{item}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {notFoundSearchItems.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: theme.colors.danger, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    ✗ Not Found ({notFoundSearchItems.length}):
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {notFoundSearchItems.map((item, i) => (
                                        <span key={`notfound-${i}`} style={{
                                            background: '#fef2f2', color: '#b91c1c',
                                            padding: '4px 10px', borderRadius: '6px',
                                            border: '1px solid #fecaca', fontWeight: 600, fontSize: '0.8rem'
                                        }}>{item}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* ===== END SUMMARY BANNER ===== */}

            {/* Results count (search results only) */}
            {searchActive && !searchLoading && !searchError && (
                <div style={{
                    marginBottom: "16px", padding: "10px 16px", background: "#ecfdf5",
                    border: "1px solid #a7f3d0", borderRadius: theme.radius,
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontFamily: 'inherit',
                    fontSize: '0.875rem', color: '#065f46'
                }}>
                    <strong>{filteredRows.length} record{filteredRows.length === 1 ? '' : 's'} found</strong>
                    {allRows.length !== filteredRows.length && (
                        <span>(of {allRows.length} before filters)</span>
                    )}
                    {filteredRows.length > 0 && (
                        <span>
                            Showing {rangeStart}–{rangeEnd}
                            {totalSearchPages > 1 ? ` · Page ${searchPage} of ${totalSearchPages}` : ''}
                        </span>
                    )}
                </div>
            )}

            {/* ===== BILLING BAR ===== */}
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
                        disabled={isBillGenerating}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#1e40af', color: theme.colors.white,
                            padding: "8px 16px", borderRadius: '6px', border: "none",
                            cursor: isBillGenerating ? "not-allowed" : "pointer",
                            opacity: isBillGenerating ? 0.7 : 1,
                            fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit'
                        }}
                    >
                        {isBillGenerating ? "Generating..." : "Generate Bill PDF"}
                    </button>
                </div>
            )}

            {/* Fetch-all loading overlay */}
            {isFetchingAll && pendingFilterKey && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(255, 255, 255, 0.70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div style={{ background: theme.colors.white, border: `1px solid ${theme.colors.primary}`, borderRadius: theme.radius, padding: "16px 24px", color: theme.colors.primary, fontWeight: 700, boxShadow: theme.shadows.lg, fontFamily: 'inherit' }}>
                        Loading all challans for filtering...
                    </div>
                </div>
            )}

            {/* Table wrapper */}
            <div style={{ position: 'relative' }}>
                {searchLoading && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255, 255, 255, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: theme.colors.white, border: `1px solid ${theme.colors.primary}`, borderRadius: theme.radius, padding: '14px 22px', color: theme.colors.primary, fontWeight: 600, boxShadow: theme.shadows.lg, fontFamily: 'inherit' }}>
                            <Loader size={20} className="animate-spin" /> Searching...
                        </div>
                    </div>
                )}

                <div ref={tableScrollRef} style={{ width: "100%", maxHeight: "calc(100vh - 220px)", overflow: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, boxShadow: theme.shadows.md, background: theme.colors.white, position: 'relative', minHeight: searchLoading ? 160 : undefined }}>
                    <table style={{ width: "100%", minWidth: "1600px", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
                        <thead>
                            <tr>
                                {tableHeader.map((th) => {
                                    const frozen = getFrozenStyle(th.key, 'header');
                                    if (th.noFilter) {
                                        return (
                                            <th key={th.key} style={{ ...thStickyStyle, width: th.width, ...frozen }}>
                                                {th.key === 'select' ? (
                                                    <input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleSelectAllVisible(e.target.checked)} style={{ accentColor: theme.colors.primary, cursor: 'pointer', width: 16, height: 16 }} />
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
                                                <button ref={(el) => { filterButtonRefs.current[th.key] = el; }} onMouseDown={(e) => e.stopPropagation()} onClick={() => handleOpenFilter(th.key)} style={{ border: "none", background: (isActive || isOpen) ? theme.colors.primary : "transparent", color: theme.colors.white, cursor: "pointer", padding: "2px 4px", borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'all 0.15s', flexShrink: 0 }}>
                                                    <Filter size={12} />
                                                </button>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleRows.map((row, idx) => (
                                <tr key={row.rowKey} onMouseEnter={() => setHoveredRow(row.rowKey)} onMouseLeave={() => setHoveredRow(null)}>
                                    {tableHeader.map((th) => {
                                        const frozen = getFrozenStyle(th.key, 'body');
                                        const baseStyle = { ...getCellBaseStyle(row, idx), ...frozen };

                                        if (th.key === 'select') {
                                            return (
                                                <td key={th.key} style={baseStyle}>
                                                    <input type="checkbox" checked={selectedRows.has(row.rowKey)} onChange={() => toggleRow(row.rowKey)} style={{ accentColor: theme.colors.primary, cursor: 'pointer', width: 16, height: 16 }} />
                                                </td>
                                            );
                                        }

                                        if (th.key === 'challanDate') {
                                            return (
                                                <td key={th.key} style={baseStyle}>
                                                    <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem', whiteSpace: 'normal', wordBreak: 'break-word' }}>{formatShortDate(row.challanDate)}</span>
                                                </td>
                                            );
                                        }

                                        if (th.key === 'color') {
                                            return (
                                                <td key={th.key} style={baseStyle}>
                                                    {row.color && row.color !== "-" ? (
                                                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'normal', wordBreak: 'break-word' }}>{row.color}</span>
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
                                                    <span onClick={th.key === 'jobNo' ? () => handlePrepareChallanEdit(row.challanNo, row[th.key]) : undefined} style={{ fontWeight: th.key === 'jobNo' ? 500 : 400, cursor: th.key === 'jobNo' ? 'pointer' : 'default', whiteSpace: 'normal', wordBreak: 'break-word' }}>{row[th.key]}</span>
                                                </td>
                                            );
                                        }

                                        const isNumber = ['yarnDelivery', 'yarnReturn', 'greyFabricReceived'].includes(th.key);
                                        const currentValue = row[th.key];

                                        return (
                                            <td key={th.key} style={{ ...baseStyle, fontVariantNumeric: isNumber ? 'tabular-nums' : 'normal' }}>
                                                <div style={{ minHeight: '20px', textAlign: 'center', opacity: currentValue ? 1 : 0.5, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                                    {isNumber ? (Number(currentValue) > 0 ? Number(currentValue).toFixed(2) : "-") : (currentValue || "-")}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {visibleRows.length === 0 && (
                                <tr>
                                    <td style={{ ...cellStyle, padding: 40, color: theme.colors.textMuted, whiteSpace: 'normal' }} colSpan={tableHeader.length}>
                                        {searchLoading ? "Searching..." : movements.length === 0 && !loading ? "No records found." : "No rows match the current filters."}
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
                                        if (['yarnDelivery', 'yarnReturn', 'greyFabricReceived', 'billingAmount'].includes(th.key)) {
                                            return (
                                                <td key={th.key} style={{ ...tfootCellStyle, fontVariantNumeric: 'tabular-nums', fontWeight: th.key === 'billingAmount' ? 800 : 700, ...frozen }}>
                                                    {totals[th.key] > 0 ? totals[th.key].toFixed(2) : "-"}
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
            </div>

            {/* Pagination */}
            {searchActive && !searchLoading && totalSearchPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: 'center', marginTop: 20, gap: 4, fontFamily: 'inherit' }}>
                    <button style={{ ...pageButtonStyle(false), opacity: searchPage === 1 ? 0.4 : 1, cursor: searchPage === 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }} onClick={() => goToSearchPage(searchPage - 1)} disabled={searchPage === 1}>Prev</button>
                    {searchPageNumbers.map((p, i) =>
                        p === "..." ? <span key={`e-${i}`} style={{ margin: "0 6px", color: theme.colors.textMuted, letterSpacing: 2 }}>...</span> : <button key={p} style={pageButtonStyle(p === searchPage)} onClick={() => goToSearchPage(p)}>{p}</button>
                    )}
                    <button style={{ ...pageButtonStyle(false), opacity: searchPage === totalSearchPages ? 0.4 : 1, cursor: searchPage === totalSearchPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }} onClick={() => goToSearchPage(searchPage + 1)} disabled={searchPage === totalSearchPages}>Next</button>
                </div>
            )}

            {/* PORTALED COLUMN FILTER DROPDOWN */}
            {renderColumnFilterDropdown()}
        </div>
    );
};

export default Knitting;