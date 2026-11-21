import React, { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader, Search, Download, Filter, X, Calendar, ChevronDown } from 'lucide-react';
import UseDeliveryMonths from './delivery-months/UseDeliveryMonths';
import ChallanEditModal from '../../components/modals/ChallanEditModal';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

// --- Modern Design System & Styles (same as Dyeing) ---
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

// ===== YARN DYEING ENDPOINTS =====
const ORDER_TYPE = "yarnDyeingOrder";
const LIST_URL = "/api/challan-movement/yarnDyeingOrder";
// Challan / Job / Delivery-month search. If your backend has a separate yarn dyeing search route, change these 2 lines.
const SEARCH_URL = "/api/dyeingOrder/challan/search";
const SEARCH_CONTEXT = "yarnDyeingOrder";
// Challan detail (edit modal)
const detailUrl = (challanNo, jobNo) => `/api/detail-challan-view/${ORDER_TYPE}/${challanNo}/${jobNo}`;

// ===== MEMORY-SAFE LOADING CONFIG =====
// Records per request while scrolling
const PAGE_LIMIT = 25;
// HARD LIMIT of table rows kept in the browser. When reached, loading stops and the user is asked
// to narrow the data with filters / month / search. This is what keeps RAM bounded.
const MAX_LOADED_ROWS = 5000;
// Excel export pulls the data in bigger chunks (not kept in React state) up to this many rows
const EXPORT_PAGE_LIMIT = 100;
const EXPORT_MAX_ROWS = 60000;

// ===== AUTO-FIT LAYOUT CONFIG =====
const FIT_DEBUG = false;
const MIN_TABLE_HEIGHT = 300;
const FROZEN_MIN_WIDTH = 800;
const HEADER_H = 50;
const FOOTER_H = 45;
const ROW_HEIGHT = 50;
const OVERSCAN = 8;
// ===== END AUTO-FIT LAYOUT CONFIG =====

const getZoomScale = (el) => {
    const rect = el.getBoundingClientRect();
    const w = el.offsetWidth;
    if (!w || !rect.width) return 1;
    const scale = rect.width / w;
    return scale > 0.2 && scale < 5 ? scale : 1;
};

// Accepts either the axios response, or the response body, and returns { items, nextCursor, hasMore }
const unwrapPage = (res) => {
    if (Array.isArray(res)) return { items: res, nextCursor: null, hasMore: false };
    if (Array.isArray(res?.data)) {
        return { items: res.data, nextCursor: res.nextCursor ?? null, hasMore: !!res.hasMore };
    }
    if (Array.isArray(res?.data?.data)) {
        return { items: res.data.data, nextCursor: res.data.nextCursor ?? null, hasMore: !!res.data.hasMore };
    }
    return { items: [], nextCursor: null, hasMore: false };
};

const buildListParams = (cursor, filtersKey, monthsKey, limit = PAGE_LIMIT) => {
    const params = { limit };
    if (cursor !== null && cursor !== undefined) params.cursor = cursor;
    if (filtersKey && filtersKey !== '{}') params.filters = filtersKey;
    if (monthsKey) params.challanMonths = monthsKey;
    return params;
};
// ===== END CONFIG =====

// ===== OK QTY / BILLING CONFIG =====
// Backend deliveryType values of the yarnDyeingOrder:
//   Yarn Delivery For Yarn Dye | Yarn Return From Yarn Dye | Yarn Received From Yarn Dye | Finish Received | Finish Return
// Ok Yarn Qty   : read from `okYarnQty` (or `okGreyQty` / `okQty`) - ONLY for Yarn Received rows
// Ok Finish Qty : read from `okFinishQty` (or `okQty`)             - ONLY for Finish Received rows
// Billing = Ok Yarn Qty x Price/KG  (change BILL_ON to 'okFinishQty' to bill on the finish quantity)
// Yarn Delivery / Yarn Return / Finish Return rows are NEVER part of Ok Qty or Billing.
// If a received row has no Ok Qty saved yet: true => its received qty is used as Ok Qty, false => Ok Qty stays 0.
const OK_QTY_FALLBACK_TO_QTY = true;
const BILL_ON = 'okYarnQty';
// ===== END OK QTY / BILLING CONFIG =====

const clampStyle = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'break-word',
    lineHeight: 1.2,
};

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
    background: "#657582", fontWeight: 600, fontSize: "0.75rem",
    textTransform: "uppercase", letterSpacing: "0.04em", color: "white",
    borderBottom: `3px solid ${theme.colors.borderDark}`, boxShadow: theme.shadows.sm,
    whiteSpace: "normal", wordWrap: "break-word", wordBreak: "break-word",
    verticalAlign: "middle", textAlign: "center", backgroundClip: "padding-box",
    height: HEADER_H, padding: "4px 8px", boxSizing: "border-box",
};

const tfootCellStyle = {
    ...cellStyle, position: "sticky", bottom: 0, zIndex: 30,
    background: "#657582",
    fontWeight: 700,
    borderTop: `2px solid ${theme.colors.borderDark}`, borderBottom: "none",
    color: "white", textAlign: "center", backgroundClip: "padding-box",
    height: FOOTER_H, padding: "4px 8px", boxSizing: "border-box",
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

// noFilter: true  => no header filter button.
// Column filters run in the BROWSER on the loaded rows (list rows AND search results).
// `width` is the BASE width in px. On wide screens every column is scaled up so the table fills the whole screen.
const tableHeader = [
    { header: "", width: "50px", key: "select", noFilter: true },
    { header: "Date", width: "110px", key: "challanDate" },
    { header: "Challan No", width: "110px", key: "challanNo" },
    { header: "Job No", width: "160px", key: "jobNo" },
    { header: "Composition", width: "260px", key: "composition" },
    { header: "Color", width: "200px", key: "color" },
    { header: "From Factory", width: "200px", key: "fromFactory" },
    { header: "To Factory", width: "190px", key: "toFactory" },
    { header: "Yarn Del", width: "115px", key: "yarnDelivery" },
    { header: "Yarn Ret", width: "115px", key: "yarnReturn" },
    { header: "Yarn Rec", width: "115px", key: "yarnReceive" },
    { header: "Balance", width: "110px", key: "balance", noFilter: true },
    { header: "Finish Rec", width: "115px", key: "finishReceive" },
    { header: "Finish Ret", width: "115px", key: "finishReturn" },
    { header: "Ok Yarn Qty", width: "115px", key: "okYarnQty" },
    { header: "Ok Finish Qty", width: "120px", key: "okFinishQty" },
    { header: "Price/KG", width: "100px", key: "unitePrice", noFilter: true },
    { header: "Billing", width: "120px", key: "billingAmount", noFilter: true },
];

// Columns that show a quantity (shown as "-" when 0)
const QTY_KEYS = ['yarnDelivery', 'yarnReturn', 'yarnReceive', 'finishReceive', 'finishReturn', 'okYarnQty', 'okFinishQty'];
// Columns that are summed in the TOTAL row
const TOTAL_KEYS = ['yarnDelivery', 'yarnReturn', 'yarnReceive', 'balance', 'finishReceive', 'finishReturn', 'okYarnQty', 'okFinishQty', 'billingAmount'];

// ===== COLUMN WIDTHS + FROZEN COLUMNS (scale aware) =====
const FROZEN_COLUMN_KEYS = ['select', 'challanDate', 'challanNo', 'jobNo', 'composition'];
const FROZEN_LAST_KEY = FROZEN_COLUMN_KEYS[FROZEN_COLUMN_KEYS.length - 1];
const BASE_TOTAL_WIDTH = tableHeader.reduce((sum, th) => sum + (parseInt(th.width, 10) || 0), 0);

const buildColumnLayout = (scale) => {
    const widths = {};
    const offsets = {};
    let total = 0;
    let frozenCumulative = 0;
    tableHeader.forEach((th) => {
        const w = Math.floor((parseInt(th.width, 10) || 0) * scale);
        widths[th.key] = w;
        total += w;
        if (FROZEN_COLUMN_KEYS.includes(th.key)) {
            offsets[th.key] = frozenCumulative;
            frozenCumulative += w;
        }
    });
    return { widths, offsets, total };
};

const getFrozenStyle = (key, area, offsets, enabled) => {
    if (!enabled || !FROZEN_COLUMN_KEYS.includes(key)) return {};
    const left = offsets[key] ?? 0;
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
// ===== END COLUMN WIDTHS + FROZEN COLUMNS =====

// ===== DATE HELPERS =====
const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;

// Handles clean dates AND glued strings like "2025-12-06T...Z2025-12-07T...Z" (earliest date is used)
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

// "2026-09" key used for filtering/sorting
const getMonthKey = (dateVal) => {
    const day = getDateFilterValue(dateVal);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 7) : "";
};

// "2026-09"  ->  "Sep'26"
const formatMonthLabel = (key) => {
    if (!key || !/^\d{4}-\d{2}$/.test(key)) return key || "";
    const [y, m] = key.split('-');
    return `${MONTH_SHORT[Number(m) - 1]}'${y.slice(-2)}`;
};

// Month'Year choices for the challan-date filter: current month + the previous 35 (newest first)
const RECENT_MONTH_KEYS = (() => {
    const now = new Date();
    const keys = [];
    for (let i = 0; i < 36; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return keys;
})();
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
    const shortName = MONTH_SHORT[monthNumber - 1];
    return {
        value: raw,
        name,
        label: year ? `${shortName}'${String(year).slice(-2)}` : shortName,
        sortKey: year ? `${year}-${String(monthNumber).padStart(2, '0')}` : String(monthNumber).padStart(2, '0'),
    };
};
// "November 2026" -> "2026-11-01" (used only when a delivery has no real date)
const monthTextToDate = (txt) => {
    const m = String(txt || '').match(/([A-Za-z]{3,})\W*(\d{4})/);
    if (!m) return '';
    const idx = MONTH_SHORT.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
    return idx < 0 ? '' : `${m[2]}-${String(idx + 1).padStart(2, '0')}-01`;
};
// ===== END DELIVERY MONTH PARSING =====

// ===== ROW BUILDING (raw yarn dyeing records -> table rows) =====
// Rows with the same challan / job / composition / color are merged into ONE row.
// Runs over ALL loaded records, so a row that is split over two pages is still merged correctly.

// deliveryType -> which quantity column it belongs to
const KIND_BY_TYPE = {
    yarndeliveryforyarndye: 'yarnDelivery',
    yarnreturnfromyarndye: 'yarnReturn',
    yarnreceivedfromyarndye: 'yarnReceive',
    finishreceived: 'finishReceive',
    finishreturn: 'finishReturn',
};
const classifyType = (rawType) => {
    const type = String(rawType || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (KIND_BY_TYPE[type]) return KIND_BY_TYPE[type];
    // fallbacks for slightly different spellings
    if (type.includes('finish') && type.includes('return')) return 'finishReturn';
    if (type.includes('finish')) return 'finishReceive';
    if (type.includes('return')) return 'yarnReturn';
    if (type.includes('received') || type.includes('receive') || type.includes('rcvd')) return 'yarnReceive';
    if (type.includes('delivery') || type.includes('sentfor')) return 'yarnDelivery';
    return null;
};

const calcBalance = (r) => (Number(r.yarnDelivery) || 0) - (Number(r.yarnReturn) || 0) - (Number(r.yarnReceive) || 0);

const buildRows = (movements) => {
    if (!movements || !Array.isArray(movements)) return [];
    const rowMap = new Map();
    const order = [];
    const extractJobNo = (item) => item?.workOrder?.jobNo || (typeof item?.workOrder === 'string' ? item.workOrder : null);
    const makeKey = (challanNo, jobNo, comp, color) => `${challanNo}|${jobNo}|${comp}|${color}`;
    const toNumOrNull = (v) => (v === undefined || v === null || v === '' || isNaN(Number(v)) ? null : Number(v));
    // yarn dyeing records can keep the color in yarnColors[]
    const colorOf = (dv, item) => {
        if (dv?.color) return dv.color;
        if (item?.color) return item.color;
        if (Array.isArray(item?.yarnColors) && item.yarnColors.length > 0) {
            const list = item.yarnColors.map((y) => y?.color).filter(Boolean);
            if (list.length > 0) return [...new Set(list)].join(', ');
        }
        return '-';
    };
    const dateOf = (source, parent) => {
        const real = source?.deliveryDate || source?.challanDate || parent?.deliveryDate;
        if (real) return normalizeDate(real);
        const fb = source?.createdAt || parent?.createdAt || monthTextToDate(source?.deliveryMonth || parent?.deliveryMonth);
        return fb ? normalizeDate(fb) : '';
    };

    const getOrCreateRow = (challanNo, jobNo, comp, color, source, parent) => {
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
                challanDate: dateOf(source, parent),
                toFactory: source?.toFactory || parent?.toFactory || "",
                fromFactory: source?.fromFactory || parent?.fromFactory || "",
                yarnDelivery: 0,
                yarnReturn: 0,
                yarnReceive: 0,
                finishReceive: 0,
                finishReturn: 0,
                okYarnQty: 0,
                okFinishQty: 0,
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
        const kind = classifyType(dv?.deliveryType);
        if (kind) row[kind] += qty;

        // ===== OK YARN QTY / OK FINISH QTY (received rows only, never delivery / return rows) =====
        const okYarnRaw = toNumOrNull(dv?.okYarnQty) ?? toNumOrNull(dv?.okGreyQty);
        const okFinishRaw = toNumOrNull(dv?.okFinishQty);
        const okGenericRaw = toNumOrNull(dv?.okQty);
        const fallbackQty = OK_QTY_FALLBACK_TO_QTY ? qty : 0;
        if (kind === 'yarnReceive') row.okYarnQty += okYarnRaw ?? okGenericRaw ?? fallbackQty;
        if (kind === 'finishReceive') row.okFinishQty += okFinishRaw ?? okGenericRaw ?? fallbackQty;
        // =========================================================================================

        const price = Number(dv?.unitePrice || source?.unitePrice) || 0;
        if (price && !row.unitePrice) row.unitePrice = price;
        if (!row.toFactory && dv?.toFactory) row.toFactory = dv.toFactory;
        if (!row.fromFactory && dv?.fromFactory) row.fromFactory = dv.fromFactory;
        if (!row.challanDate) {
            const d = dateOf(dv, source);
            if (d) row.challanDate = d;
        }
    };

    movements.forEach((item) => {
        if (!item) return;
        const jobNo = extractJobNo(item) || "-";
        if (Array.isArray(item.deliveries) && item.deliveries.length > 0) {
            item.deliveries.forEach((dv) => {
                const challanNo = dv?.challanNo;
                if (challanNo === undefined || challanNo === null) return;
                const comp = dv?.composition || item?.composition || "-";
                const color = colorOf(dv, item);
                const row = getOrCreateRow(challanNo, jobNo, comp, color, dv, item);
                if (item.unitePrice && !row.unitePrice) row.unitePrice = Number(item.unitePrice);
                applyDelivery(row, dv, item);
            });
        } else if (item.challanNo !== undefined && item.challanNo !== null) {
            const row = getOrCreateRow(item.challanNo, jobNo, item?.composition || "-", colorOf(item, item), item, null);
            applyDelivery(row, item, item);
        }
    });

    return order.map((key) => {
        const row = rowMap.get(key);
        // Billing = Ok Qty (BILL_ON) x Price/KG. Delivery / Return rows are never billed.
        return { ...row, balance: calcBalance(row), billingAmount: (Number(row[BILL_ON]) || 0) * row.unitePrice };
    });
};
// ===== END ROW BUILDING =====

// ===== FRONTEND COLUMN FILTER HELPERS =====
const cellFilterValue = (row, key) => {
    if (key === 'challanDate') return getDateFilterValue(row?.challanDate);
    const v = row?.[key];
    return v === null || v === undefined ? '' : String(v);
};

const applyColumnFilters = (rows, filters, ignoreKey = null) => {
    const keys = Object.keys(filters || {}).filter((k) => k !== ignoreKey && Array.isArray(filters[k]) && filters[k].length > 0);
    if (keys.length === 0) return rows;
    const sets = keys.map((k) => [k, new Set(filters[k])]);
    return rows.filter((row) => sets.every(([k, set]) => set.has(cellFilterValue(row, k))));
};

// Month'Year filter applied in the browser (used on search results, where the server list is not re-queried)
const applyMonthFilter = (rows, monthSet) => {
    if (!monthSet || monthSet.size === 0) return rows;
    return rows.filter((row) => monthSet.has(getMonthKey(row.challanDate)));
};

const MAX_FILTER_OPTIONS_SHOWN = 200;
// ===== END FRONTEND COLUMN FILTER HELPERS =====

// ===== COLUMN FILTER STATE (frontend) =====
const useColumnFilters = () => {
    const [filters, setFilters] = useState({});
    const [openFilterKey, setOpenFilterKey] = useState(null);
    const [draftSelected, setDraftSelected] = useState(new Set());
    const [pinnedValues, setPinnedValues] = useState([]);
    const [filterSearch, setFilterSearch] = useState("");

    const dropdownRef = useRef(null);
    const openKeyRef = useRef(null);
    openKeyRef.current = openFilterKey;

    const closeFilter = useCallback(() => {
        setOpenFilterKey(null);
        setFilterSearch("");
        setPinnedValues([]);
    }, []);

    const openFilter = useCallback((key) => {
        if (openKeyRef.current === key) { closeFilter(); return; }
        const applied = (filters[key] || []).map(String);
        setOpenFilterKey(key);
        setDraftSelected(new Set(applied));
        setPinnedValues(applied);
        setFilterSearch("");
    }, [filters, closeFilter]);

    const toggleDraftValue = useCallback((val) => {
        setDraftSelected((prev) => {
            const next = new Set(prev);
            if (next.has(val)) next.delete(val);
            else next.add(val);
            return next;
        });
    }, []);

    const applyFilter = useCallback((key) => {
        setFilters((prev) => {
            const next = { ...prev };
            if (draftSelected.size > 0) next[key] = [...draftSelected];
            else delete next[key];
            return next;
        });
        closeFilter();
    }, [draftSelected, closeFilter]);

    const clearFilter = useCallback((key) => {
        setFilters((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
        if (openKeyRef.current === key) closeFilter();
    }, [closeFilter]);

    const clearAllFilters = useCallback(() => {
        setFilters({});
        closeFilter();
    }, [closeFilter]);

    useEffect(() => {
        if (!openFilterKey) return;
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) closeFilter();
        };
        const handleKey = (e) => { if (e.key === 'Escape') closeFilter(); };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [openFilterKey, closeFilter]);

    return {
        filters, openFilterKey, draftSelected, pinnedValues, filterSearch, dropdownRef,
        setFilterSearch, openFilter,
        toggleDraftValue, applyFilter, clearFilter, clearAllFilters,
    };
};
// ===== END COLUMN FILTER STATE =====

// ===== EXCEL EXPORT CONFIG =====
// The yarn dyeing factory (party) a row belongs to.
//  - Yarn Delivery : yarn goes OUT to the dyeing factory -> party = toFactory
//  - Yarn Return / Yarn Receive / Finish Receive / Finish Return : goods come BACK from the factory -> party = fromFactory
// This way delivery + return + receive of the same factory always land in ONE sheet.
const getPartyFactory = (row) => {
    const to = String(row.toFactory || '').trim();
    const from = String(row.fromFactory || '').trim();
    const isDelivery = Number(row.yarnDelivery) > 0;
    const isBack = Number(row.yarnReturn) > 0 || Number(row.yarnReceive) > 0 || Number(row.finishReceive) > 0 || Number(row.finishReturn) > 0;
    let party;
    if (isDelivery && !isBack) party = to || from;
    else if (isBack && !isDelivery) party = from || to;
    else party = to || from;
    return party || 'Unknown';
};
const factoryKey = (name) => String(name || 'Unknown').replace(/\s+/g, ' ').trim().toLowerCase();

const XL_NUM_FMT = '#,##0.00;-#,##0.00;"-"';
const XL_INT_FMT = '#,##0;-#,##0;"-"';

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
    { header: 'Yarn Received', key: 'yarnReceive', width: 16, type: 'number' },
    { header: 'Balance', key: 'balance', width: 14, type: 'number' },
    { header: 'Finish Received', key: 'finishReceive', width: 16, type: 'number' },
    { header: 'Finish Return', key: 'finishReturn', width: 15, type: 'number' },
    { header: 'Ok Yarn Qty', key: 'okYarnQty', width: 15, type: 'number' },
    { header: 'Ok Finish Qty', key: 'okFinishQty', width: 15, type: 'number' },
    { header: 'Price/KG', key: 'unitePrice', width: 12, type: 'number' },
    { header: 'Billing', key: 'billingAmount', width: 16, type: 'number' },
];
const EXPORT_TOTAL_KEYS = ['yarnDelivery', 'yarnReturn', 'yarnReceive', 'balance', 'finishReceive', 'finishReturn', 'okYarnQty', 'okFinishQty', 'billingAmount'];

const SUMMARY_COLUMNS = [
    { header: 'Factory', type: 'text', width: 36 },
    { header: 'Challans', key: 'challans', type: 'number', fmt: XL_INT_FMT, width: 12 },
    { header: 'Yarn Delivery', key: 'yarnDelivery', type: 'number', width: 16 },
    { header: 'Yarn Return', key: 'yarnReturn', type: 'number', width: 16 },
    { header: 'Yarn Received', key: 'yarnReceive', type: 'number', width: 16 },
    { header: 'Balance', key: 'balance', type: 'number', width: 14 },
    { header: 'Finish Received', key: 'finishReceive', type: 'number', width: 16 },
    { header: 'Finish Return', key: 'finishReturn', type: 'number', width: 16 },
    { header: 'Ok Yarn Qty', key: 'okYarnQty', type: 'number', width: 16 },
    { header: 'Ok Finish Qty', key: 'okFinishQty', type: 'number', width: 16 },
    { header: 'Billing', key: 'billingAmount', type: 'number', width: 18 },
];

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

// compact filter dropdown size
const FILTER_DROPDOWN_WIDTH = 230;
const FILTER_DROPDOWN_MAX_HEIGHT = 280;

const YarnDyeing = () => {
    // --- ALL STATE AT TOP LEVEL ---
    const [movements, setMovements] = useState([]);
    const [fetchError, setFetchError] = useState(null);
    const [selectedRows, setSelectedRows] = useState(new Set());

    const [search, setSearch] = useState("");
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    // Search results mode + pagination
    const [searchActive, setSearchActive] = useState(false);
    const [searchPage, setSearchPage] = useState(1);
    const tableScrollRef = useRef(null);
    const topRef = useRef(null);
    const viewportProbeRef = useRef(null);

    // ===== PAGED LOADING STATE =====
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const genRef = useRef(0);
    const abortRef = useRef(null);
    const cursorRef = useRef(null);
    const loadingRef = useRef(false);
    const hasMoreRef = useRef(false);
    const capRef = useRef(false);
    const searchActiveRef = useRef(false);
    const loadErrorRef = useRef(null);
    const queryRef = useRef({ filtersKey: '{}', monthsKey: '' });
    // ===============================

    // ===== WINDOWED RENDERING STATE =====
    const [viewport, setViewport] = useState({ top: 0, height: 800 });
    const rafRef = useRef(0);
    // ====================================

    // ===== AUTO-FIT (screen size) STATE =====
    const [fit, setFit] = useState({ height: 560, width: 1400 });
    const bottomReserveRef = useRef(60);

    const colLayout = useMemo(() => {
        const scale = Math.max(1, fit.width / BASE_TOTAL_WIDTH);
        return buildColumnLayout(scale);
    }, [fit.width]);
    const frozenEnabled = fit.width >= FROZEN_MIN_WIDTH;
    // =======================================

    // Search tracking (Found vs Not Found for BOTH Challan No and Job No)
    const [foundSearchItems, setFoundSearchItems] = useState([]);
    const [notFoundSearchItems, setNotFoundSearchItems] = useState([]);

    // Challan-date month filter (Month'Year)
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
    const [exportProgress, setExportProgress] = useState(0);

    // Portal refs & state for the column filter dropdown
    const filterButtonRefs = useRef({});
    const [dropdownPos, setDropdownPos] = useState(null);

    const [isChallanEditing, setIsChallanEditing] = useState(false);
    const [challanToEditData, setChallanToEditData] = useState({});
    const [isChallanDataLoading, setIsChallanDataLoading] = useState(false);

    const { deliveryMonths, isMonthLoading: deliveryMonthLoading } = UseDeliveryMonths();
    const axiosPrivate = useAxiosPrivate();
    const axiosRef = useRef(axiosPrivate);
    axiosRef.current = axiosPrivate;

    const {
        filters, openFilterKey, draftSelected, pinnedValues, filterSearch, dropdownRef,
        setFilterSearch, openFilter,
        toggleDraftValue, applyFilter, clearFilter, clearAllFilters,
    } = useColumnFilters();

    const appliedMonthsKey = appliedMonthNames.join(',');
    // normal list mode = no challan/job text and no delivery-month search applied
    const listMode = !search && !appliedMonthsKey;

    const filtersKey = JSON.stringify(filters || {});
    const selectedMonthsKey = [...selectedMonths].sort().join(',');
    // column filters are applied in the browser, so they are NOT sent to the server
    queryRef.current = { filtersKey: '{}', monthsKey: selectedMonthsKey };

    // Rows built from the loaded records (bounded by MAX_LOADED_ROWS)
    const allRows = useMemo(() => buildRows(movements), [movements]);

    const filteredRows = useMemo(() => {
        let rows = applyColumnFilters(allRows, filters);
        if (searchActive) rows = applyMonthFilter(rows, selectedMonths);
        return rows;
    }, [allRows, filters, searchActive, selectedMonths]);

    const capReached = hasMore && allRows.length >= MAX_LOADED_ROWS;
    hasMoreRef.current = hasMore;
    capRef.current = capReached;
    searchActiveRef.current = searchActive;
    loadErrorRef.current = loadError;

    // Selected challans (for the bill)
    const challanIds = useMemo(() => {
        const ids = new Set();
        allRows.forEach((row) => {
            if (selectedRows.has(row.rowKey) && row.chId !== null && row.chId !== undefined) {
                ids.add(row.chId);
            }
        });
        return Array.from(ids);
    }, [allRows, selectedRows]);

    // Values of the open column filter, taken from the loaded rows (and the other active filters)
    const columnOptions = useMemo(() => {
        if (!openFilterKey) return [];
        let base = applyColumnFilters(allRows, filters, openFilterKey);
        if (searchActive) base = applyMonthFilter(base, selectedMonths);
        const seen = new Set();
        base.forEach((row) => { seen.add(cellFilterValue(row, openFilterKey)); });
        const list = [...seen];
        if (openFilterKey === 'challanDate') return list.sort((a, b) => b.localeCompare(a));
        return list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }, [openFilterKey, allRows, filters, searchActive, selectedMonths]);

    const updateDropdownPosition = useCallback(() => {
        if (!openFilterKey) return;
        const btn = filterButtonRefs.current[openFilterKey];
        if (!btn) return;
        const rect = btn.getBoundingClientRect();
        const width = FILTER_DROPDOWN_WIDTH;
        let left = rect.right - width;
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
        const estimatedHeight = 260;
        let top = rect.bottom + 6;
        if (top + estimatedHeight > window.innerHeight - 8) {
            const aboveTop = rect.top - estimatedHeight - 6;
            top = aboveTop > 8 ? aboveTop : Math.max(8, window.innerHeight - estimatedHeight - 8);
        }
        setDropdownPos((prev) => (
            prev && prev.top === top && prev.left === left && prev.width === width
                ? prev
                : { top, left, width }
        ));
    }, [openFilterKey]);

    useLayoutEffect(() => {
        if (!openFilterKey) { setDropdownPos(null); return; }
        updateDropdownPosition();
        const handler = (e) => {
            if (e && e.type === 'scroll' && dropdownRef.current && e.target instanceof Node && dropdownRef.current.contains(e.target)) return;
            updateDropdownPosition();
        };
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [openFilterKey, updateDropdownPosition, dropdownRef]);

    const monthOptions = RECENT_MONTH_KEYS;

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

    const totalSearchPages = Math.max(1, Math.ceil(filteredRows.length / SEARCH_PAGE_SIZE));

    // ===== AUTO-FIT MEASURING =====
    const bottomReserve = searchActive ? (totalSearchPages > 1 ? 80 : 28) : 60;
    bottomReserveRef.current = bottomReserve;

    const measureFit = useCallback(() => {
        const el = tableScrollRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();

        const applied = parseFloat(el.style.height);
        let k = applied > 0 && rect.height > 0 ? rect.height / applied : getZoomScale(el);
        if (!(k > 0.2 && k < 5)) k = 1;

        const probe = viewportProbeRef.current;
        const probeRect = probe ? probe.getBoundingClientRect() : null;
        const viewH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        const viewportBottom = probeRect && probeRect.height > 0 ? probeRect.bottom : viewH;

        const docTop = document.documentElement.getBoundingClientRect().top;
        let top = rect.top - docTop;
        if (document.body.scrollTop) top += document.body.scrollTop * k;
        let node = el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            if (node.scrollTop) top += node.scrollTop * k;
            node = node.parentElement;
        }

        const height = Math.max(MIN_TABLE_HEIGHT, Math.floor((viewportBottom - top) / k - bottomReserveRef.current));
        const width = el.clientWidth;
        if (FIT_DEBUG) console.log('[YarnDyeing fit]', { viewportBottom, top, k, reserve: bottomReserveRef.current, height, width });
        setFit((prev) => (prev.height === height && prev.width === width ? prev : { height, width }));
    }, []);

    useLayoutEffect(() => {
        measureFit();
        const t1 = setTimeout(measureFit, 100);
        const t2 = setTimeout(measureFit, 500);
        const t3 = setTimeout(measureFit, 1500);
        window.addEventListener('resize', measureFit);
        window.addEventListener('orientationchange', measureFit);
        window.addEventListener('load', measureFit);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', measureFit);
        let mo = null;
        if (typeof MutationObserver !== 'undefined') {
            mo = new MutationObserver(() => measureFit());
            mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
            mo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        }
        const poll = setInterval(measureFit, 800);
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => measureFit());
            if (topRef.current) ro.observe(topRef.current);
            if (tableScrollRef.current) ro.observe(tableScrollRef.current);
            ro.observe(document.documentElement);
            ro.observe(document.body);
        }
        return () => {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
            clearInterval(poll);
            if (mo) mo.disconnect();
            window.removeEventListener('resize', measureFit);
            window.removeEventListener('orientationchange', measureFit);
            window.removeEventListener('load', measureFit);
            if (window.visualViewport) window.visualViewport.removeEventListener('resize', measureFit);
            if (ro) ro.disconnect();
        };
    }, [measureFit, initialLoading, fetchError, searchActive, bottomReserve, challanIds.length, searchError]);
    // ==============================

    useEffect(() => {
        if (searchPage > totalSearchPages) setSearchPage(totalSearchPages);
    }, [searchPage, totalSearchPages]);

    useEffect(() => {
        if (searchActive) setSearchPage(1);
    }, [filtersKey, selectedMonthsKey, searchActive]);

    const visibleRows = useMemo(() => {
        if (!searchActive) return filteredRows;
        const start = (searchPage - 1) * SEARCH_PAGE_SIZE;
        return filteredRows.slice(start, start + SEARCH_PAGE_SIZE);
    }, [filteredRows, searchActive, searchPage]);

    // ===== PAGED LOADING =====
    const cancelLoad = useCallback(() => {
        genRef.current += 1;
        if (abortRef.current) abortRef.current.abort();
        loadingRef.current = false;
        setLoadingMore(false);
    }, []);

    // Loads ONE page. replace=true starts a new list (first page of the current query).
    const fetchPage = useCallback(async (gen, cursor, replace) => {
        if (loadingRef.current && !replace) return;
        loadingRef.current = true;
        setLoadingMore(true);
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const { filtersKey: fk, monthsKey: mk } = queryRef.current;
            const res = await axiosRef.current.get(LIST_URL, {
                params: buildListParams(cursor, fk, mk),
                signal: controller.signal,
            });
            if (gen !== genRef.current) return;

            const page = unwrapPage(res);
            setMovements((prev) => {
                if (replace) return page.items;
                const seen = new Set();
                prev.forEach((m) => { if (m?.id !== undefined && m?.id !== null) seen.add(m.id); });
                const fresh = page.items.filter((it) => it?.id === undefined || it?.id === null || !seen.has(it.id));
                return prev.concat(fresh);
            });
            if (replace) {
                setInitialLoading(false);
                if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
                setViewport((v) => ({ ...v, top: 0 }));
            }
            cursorRef.current = page.nextCursor;
            setHasMore(!!page.hasMore && page.nextCursor !== null && page.nextCursor !== undefined);
        } catch (err) {
            if (gen !== genRef.current) return;
            console.error("Failed to load Yarn Dyeing deliveries:", err);
            const message = err?.response?.status === 403
                ? "Permission denied"
                : (err?.response?.data?.message || err?.response?.data?.msg || err?.message || "Failed to load Yarn Dyeing deliveries");
            setInitialLoading(false);
            setHasMore(false);
            if (replace) setFetchError(message);
            else setLoadError(message);
        } finally {
            if (gen === genRef.current) {
                loadingRef.current = false;
                setLoadingMore(false);
            }
        }
    }, []);

    const maybeLoadMore = useCallback(() => {
        const el = tableScrollRef.current;
        if (!el || searchActiveRef.current) return;
        if (!hasMoreRef.current || loadingRef.current || capRef.current || loadErrorRef.current) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight > ROW_HEIGHT * 20) return;
        fetchPage(genRef.current, cursorRef.current, false);
    }, [fetchPage]);

    // (Re)start the list whenever the server-side query changes (column filters are frontend only)
    useEffect(() => {
        if (!listMode) return;
        cancelLoad();
        const gen = genRef.current;
        cursorRef.current = null;
        setHasMore(false);
        setSearchActive(false);
        setFetchError(null);
        setLoadError(null);
        setInitialLoading(true);
        fetchPage(gen, null, true);
    }, [listMode, refreshKey, selectedMonthsKey, cancelLoad, fetchPage]);

    useEffect(() => () => cancelLoad(), [cancelLoad]);

    useEffect(() => {
        maybeLoadMore();
    }, [allRows.length, filteredRows.length, hasMore, loadingMore, loadError, fit.height, maybeLoadMore]);

    useEffect(() => {
        if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
        setViewport((v) => (v.top === 0 ? v : { ...v, top: 0 }));
    }, [filtersKey]);

    const retryLoad = () => {
        setLoadError(null);
        loadErrorRef.current = null;
        fetchPage(genRef.current, cursorRef.current, false);
    };
    // ==========================

    // ===== WINDOWED RENDERING: only the rows near the viewport are rendered =====
    const totalVisible = visibleRows.length;

    const { winStart, winEnd } = useMemo(() => {
        const first = Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN;
        const last = Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN;
        const s = Math.max(0, Math.min(first, Math.max(0, totalVisible - 1)));
        const e = Math.min(totalVisible, Math.max(last, s + 1));
        return { winStart: s, winEnd: e };
    }, [viewport.top, viewport.height, totalVisible]);

    const windowRows = useMemo(() => visibleRows.slice(winStart, winEnd), [visibleRows, winStart, winEnd]);

    const handleTableScroll = useCallback((e) => {
        const el = e.currentTarget;
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0;
            const top = el.scrollTop;
            const height = el.clientHeight;
            setViewport((v) => (Math.abs(v.top - top) < ROW_HEIGHT / 2 && v.height === height ? v : { top, height }));
            maybeLoadMore();
        });
    }, [maybeLoadMore]);

    useLayoutEffect(() => {
        const sync = () => {
            const el = tableScrollRef.current;
            if (!el) return;
            setViewport((v) => (v.height === el.clientHeight && v.top === el.scrollTop ? v : { top: el.scrollTop, height: el.clientHeight }));
        };
        sync();
        window.addEventListener('resize', sync);
        return () => window.removeEventListener('resize', sync);
    }, [totalVisible > 0, initialLoading, fit.height]);

    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
    // =============================================================================

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

    // Totals of the rows currently loaded in the table
    const totals = useMemo(() => {
        const t = { yarnDelivery: 0, yarnReturn: 0, yarnReceive: 0, balance: 0, finishReceive: 0, finishReturn: 0, okYarnQty: 0, okFinishQty: 0, billingAmount: 0 };
        filteredRows.forEach((row) => {
            Object.keys(t).forEach((k) => { t[k] += Number(row[k]) || 0; });
        });
        return t;
    }, [filteredRows]);

    const allVisibleSelected = useMemo(
        () => visibleRows.length > 0 && visibleRows.every((r) => selectedRows.has(r.rowKey)),
        [visibleRows, selectedRows]
    );

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

    const applyMonthFilterSelection = () => {
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

        cancelLoad();
        setInitialLoading(false);
        setLoadError(null);
        setHasMore(false);

        setSearchLoading(true);
        setSearchError(null);
        setSearchActive(true);
        setSearchPage(1);

        setFoundSearchItems([]);
        setNotFoundSearchItems([]);

        // A challan/job search replaces any month search
        setAppliedMonthNames([]);
        setSelectedDeliveryMonths([]);

        const searchArray = search.split(/[\s,]+/).filter(Boolean);

        try {
            const res = await axiosPrivate.get(SEARCH_URL, {
                params: { challans: searchArray.join(","), context: SEARCH_CONTEXT }
            });
            let searchData = [];
            if (Array.isArray(res.data)) searchData = res.data;
            else if (Array.isArray(res.data?.data)) searchData = res.data.data;

            setMovements(searchData);

            const foundSearchTermsSet = new Set();
            searchData.forEach(item => {
                if (item?.challanNo) foundSearchTermsSet.add(String(item.challanNo).trim().toLowerCase());
                const jobNo = item?.workOrder?.jobNo || (typeof item?.workOrder === 'string' ? item.workOrder : null);
                if (jobNo) foundSearchTermsSet.add(String(jobNo).trim().toLowerCase());
                if (Array.isArray(item?.deliveries)) {
                    item.deliveries.forEach(dv => {
                        if (dv?.challanNo) foundSearchTermsSet.add(String(dv.challanNo).trim().toLowerCase());
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

    // ===== SEARCH MONTH WISE HANDLER =====
    const handleDeliveryMonthSearch = async () => {
        if (selectedDeliveryMonths.length === 0) return;

        const nameByValue = new Map(deliveryMonthOptions.map((o) => [o.value, o.name]));
        const monthNames = [];
        selectedDeliveryMonths.forEach((val) => {
            const name = nameByValue.get(val);
            if (name && !monthNames.includes(name)) monthNames.push(name);
        });

        cancelLoad();
        setInitialLoading(false);
        setLoadError(null);
        setHasMore(false);

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
            const res = await axiosPrivate.get(SEARCH_URL, {
                params: { months: monthNames, context: SEARCH_CONTEXT },
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

        clearAllFilters();

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
        const bg = isHovered ? theme.colors.bgHover : (idx % 2 === 0 ? theme.colors.white : '#fafbfc');
        return { ...cellStyle, backgroundColor: bg, height: ROW_HEIGHT, padding: '6px 12px', boxSizing: 'border-box', overflow: 'hidden' };
    };

    // ===== EXCEL EXPORT: one sheet per yarn dyeing factory + Summary sheet =====
    const handleExport = async () => {
        setIsExporting(true);
        setExportProgress(0);
        try {
            let exportMovements = movements;
            if (!searchActive) {
                exportMovements = [];
                let cursor = null;
                let rowCount = 0;
                while (true) {
                    const res = await axiosPrivate.get(LIST_URL, {
                        params: buildListParams(cursor, '{}', selectedMonthsKey, EXPORT_PAGE_LIMIT),
                    });
                    const page = unwrapPage(res);
                    page.items.forEach((it) => {
                        exportMovements.push(it);
                        rowCount += Array.isArray(it?.deliveries) ? it.deliveries.length : 1;
                    });
                    setExportProgress(rowCount);
                    if (rowCount > EXPORT_MAX_ROWS) {
                        alert(`Too many rows to export at once (more than ${EXPORT_MAX_ROWS}). Please narrow the data with Month'Year and try again.`);
                        return;
                    }
                    if (!page.hasMore || page.nextCursor === null || page.nextCursor === undefined) break;
                    cursor = page.nextCursor;
                }
            }

            let baseRows = buildRows(exportMovements);
            baseRows = applyColumnFilters(baseRows, filters);
            if (searchActive) baseRows = applyMonthFilter(baseRows, selectedMonths);
            if (baseRows.length === 0) { alert("No data to export."); return; }

            const mod = await import('exceljs');
            const ExcelJS = mod.default || mod;

            const sortedMonthKeys = [...selectedMonths].sort();
            const deliveryShort = appliedMonthNames.map((n) => n.charAt(0).toUpperCase() + n.slice(1, 3));
            const periodLabel = sortedMonthKeys.length > 0
                ? sortedMonthKeys.map(formatMonthLabel).join(', ')
                : (deliveryShort.length > 0 ? `Delivery: ${deliveryShort.join(', ')}` : 'All Months');
            const filePeriod = sortedMonthKeys.length > 0
                ? sortedMonthKeys.map(formatMonthLabel).join('_').replace(/'/g, '-')
                : (deliveryShort.length > 0 ? deliveryShort.join('_') : 'AllMonths');

            const exportRows = baseRows
                .map((r) => ({ ...r, monthLabel: formatMonthLabel(getMonthKey(r.challanDate)) }))
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
            const groups = new Map();
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

            const summaryWs = wb.addWorksheet('Summary', { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
            const usedNames = new Set(['summary']);
            const summaryData = [];

            factories.forEach(({ name: factory, rows }) => {
                const ws = wb.addWorksheet(makeSheetName(factory, usedNames), {
                    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
                });

                addTitleRow(ws, `${factory}  |  Yarn Dyeing Delivery & Received  |  ${periodLabel}`, colCount);
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

                const totalValues = EXPORT_COLUMNS.map((c, i) => {
                    if (i === 0) return 'TOTAL';
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
                    ...sums,
                });
            });

            // ----- Summary sheet -----
            addTitleRow(summaryWs, `Factory Wise Summary  |  Yarn Dyeing  |  ${periodLabel}`, SUMMARY_COLUMNS.length);
            addHeaderRow(summaryWs, SUMMARY_COLUMNS);

            const grand = { challans: 0, yarnDelivery: 0, yarnReturn: 0, yarnReceive: 0, balance: 0, finishReceive: 0, finishReturn: 0, okYarnQty: 0, okFinishQty: 0, billingAmount: 0 };
            summaryData.forEach((s, idx) => {
                Object.keys(grand).forEach((k) => { grand[k] += Number(s[k]) || 0; });
                const row = summaryWs.addRow(
                    SUMMARY_COLUMNS.map((c, i) => (i === 0 ? s.factory : Number(s[c.key]) || 0))
                );
                styleBodyRow(row, idx, SUMMARY_COLUMNS);
            });
            const grandRow = summaryWs.addRow(
                SUMMARY_COLUMNS.map((c, i) => (i === 0 ? 'GRAND TOTAL' : grand[c.key]))
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
            link.setAttribute('download', `Yarn_Dyeing_Report_${filePeriod}_${new Date().toISOString().split('T')[0]}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Excel export failed:', err);
            alert('Failed to export Excel file. Please try again.');
        } finally {
            setIsExporting(false);
            setExportProgress(0);
        }
    };
    // ===== END EXCEL EXPORT =====

    // ===== PORTALED COLUMN FILTER DROPDOWN =====
    const renderColumnFilterDropdown = () => {
        if (!openFilterKey || !dropdownPos) return null;
        const th = tableHeader.find(h => h.key === openFilterKey);
        if (!th) return null;

        const searchQuery = filterSearch.trim().toLowerCase();
        const matchesSearch = (v) => !searchQuery || String(getFilterDisplay(openFilterKey, v)).toLowerCase().includes(searchQuery);
        const pinned = pinnedValues.filter(matchesSearch);
        const pinnedSet = new Set(pinned);
        const rest = columnOptions.filter((v) => matchesSearch(v) && !pinnedSet.has(v));
        const options = [...pinned, ...rest.slice(0, MAX_FILTER_OPTIONS_SHOWN)];
        const hiddenCount = Math.max(0, rest.length - MAX_FILTER_OPTIONS_SHOWN);

        const availableHeight = Math.max(180, Math.min(FILTER_DROPDOWN_MAX_HEIGHT, window.innerHeight - dropdownPos.top - 16));

        return createPortal(
            <div
                ref={dropdownRef}
                style={{
                    position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width,
                    zIndex: 99999, background: theme.colors.white, border: `1px solid ${theme.colors.borderDark}`,
                    borderRadius: theme.radius, boxShadow: theme.shadows.xl, display: 'flex', flexDirection: 'column',
                    maxHeight: availableHeight, overflow: 'hidden', fontFamily: FONT_STACK, textAlign: 'left',
                    textTransform: 'none', letterSpacing: 'normal', fontWeight: 400, fontSize: '0.8rem', color: theme.colors.textMain,
                }}
            >
                <div style={{ padding: '6px 10px', borderBottom: `1px solid #e2e8f0`, background: theme.colors.bgHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: theme.colors.textMain, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Filter: {th.header}
                    </span>
                    <button onClick={() => openFilter(openFilterKey)} title="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, borderRadius: '50%', color: theme.colors.textMain, flexShrink: 0 }}>
                        <X size={13} />
                    </button>
                </div>
                <div style={{ padding: "6px 10px", borderBottom: `1px solid #e2e8f0` }}>
                    <input type="text" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Type to search values..." autoFocus style={{ width: "100%", padding: "5px 8px", border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box', fontFamily: FONT_STACK, color: theme.colors.textMain }} />
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px", minHeight: 0 }}>
                    {options.length === 0 && (
                        <div style={{ padding: '10px 0', fontSize: '0.75rem', color: theme.colors.textMain, textAlign: 'center', opacity: 0.6 }}>No values found</div>
                    )}
                    {options.map((val) => {
                        const isChecked = draftSelected.has(val);
                        const displayVal = getFilterDisplay(openFilterKey, val);
                        return (
                            <label key={val} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", padding: "3px 0", cursor: 'pointer', borderRadius: '4px' }}>
                                <input type="checkbox" checked={isChecked} onChange={() => toggleDraftValue(val)} style={{ accentColor: theme.colors.primary, width: 14, height: 14, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={displayVal}>{displayVal === "" ? "(blank)" : displayVal}</span>
                            </label>
                        );
                    })}
                    {hiddenCount > 0 && (
                        <div style={{ padding: '6px 0 2px', fontSize: '0.68rem', opacity: 0.6 }}>{hiddenCount} more values not shown. Type to narrow the list.</div>
                    )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "6px 10px", borderTop: `1px solid #e2e8f0`, background: theme.colors.bgHeader }}>
                    <button onClick={() => clearFilter(openFilterKey)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: theme.colors.white, color: theme.colors.textMain, border: `1px solid ${theme.colors.borderDark}`, borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500, padding: '5px 0', fontFamily: FONT_STACK }}>Clear</button>
                    <button onClick={() => applyFilter(openFilterKey)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: theme.colors.primary, color: theme.colors.white, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: '5px 0', fontFamily: FONT_STACK }}>Apply</button>
                </div>
            </div>,
            document.body
        );
    };
    // ===== END PORTALED FILTER DROPDOWN =====

    if (initialLoading && movements.length === 0 && !searchLoading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: theme.colors.textMuted, fontFamily: FONT_STACK }}>
                <Loader size={24} className="animate-spin" style={{ marginRight: 10 }} /> Loading data...
            </div>
        );
    }

    if (fetchError && !search && !searchActive) {
        return (
            <div style={{ padding: "12px 16px", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: theme.radius, margin: 20, fontFamily: FONT_STACK, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span>{fetchError}</span>
                <button
                    onClick={() => setRefreshKey((k) => k + 1)}
                    style={{ background: theme.colors.primary, color: theme.colors.white, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '6px 14px', fontFamily: 'inherit' }}
                >
                    Retry
                </button>
                {hasActiveFilters && (
                    <button
                        onClick={handleClearAllFilters}
                        style={{ background: theme.colors.white, color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '6px 14px', fontFamily: 'inherit' }}
                    >
                        Clear all filters
                    </button>
                )}
            </div>
        );
    }

    const handlePrepareChallanEdit = async (challanNo, jobNo) => {
        if (!challanNo) return;
        setIsChallanDataLoading(true);
        setIsChallanEditing(true);
        try {
            const res = await axiosPrivate.get(detailUrl(challanNo, jobNo));
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

    const topSpacerHeight = winStart * ROW_HEIGHT;
    const bottomSpacerHeight = Math.max(0, totalVisible - winEnd) * ROW_HEIGHT;
    const spacerCellStyle = { padding: 0, border: 'none', height: 'auto' };

    const showTableOverlay = searchLoading || (initialLoading && movements.length > 0);

    return (
        <div style={{ width: "100%", padding: "16px 20px", fontFamily: FONT_STACK, color: theme.colors.textMain, boxSizing: 'border-box' }}>

            {/* Invisible screen-height probe (used only to measure the bottom of the visible screen) */}
            <div
                ref={viewportProbeRef}
                aria-hidden="true"
                style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 1, pointerEvents: 'none', visibility: 'hidden' }}
            />

            {isChallanEditing && (
                <ChallanEditModal
                    setIsChallanEditing={setIsChallanEditing}
                    challanToEditData={challanToEditData}
                    isChallanDataLoading={isChallanDataLoading}
                />
            )}

            {/* Everything above the table: watched for size changes so the table box always re-fits the screen */}
            <div ref={topRef}>
            {/* Toolbar */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "12px", alignItems: "center", flexWrap: "wrap" }}>
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
                                <button onClick={applyMonthFilterSelection} style={{ flex: 1, background: theme.colors.primary, color: theme.colors.white, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '7px 0', fontFamily: FONT_STACK }}>Apply</button>
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
                    title="Export the filtered data as factory-wise Excel (one sheet per factory)"
                >
                    {isExporting ? <Loader size={16} className="animate-spin" /> : <Download size={16} />}
                    {isExporting ? (exportProgress > 0 ? `Exporting... ${exportProgress} rows` : "Exporting...") : "Export Excel"}
                </button>
            </div>

            {/* Error Banner */}
            {searchError && (
                <div style={{ padding: "12px 16px", color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: theme.radius, marginBottom: "12px", fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}>
                    <X size={16} /> {searchError}
                </div>
            )}

            {/* ===== FOUND / NOT FOUND SEARCH SUMMARY BANNER ===== */}
            {searchActive && !searchLoading && !searchError && (foundSearchItems.length > 0 || notFoundSearchItems.length > 0) && (
                <div style={{
                    marginBottom: "12px", padding: "12px 16px", background: theme.colors.white,
                    border: "1px solid #e2e8f0", borderRadius: theme.radius,
                    display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'inherit',
                    fontSize: '0.875rem', boxShadow: theme.shadows.sm
                }}>
                    <div style={{ fontWeight: 600, color: theme.colors.textMain }}>Search Results Summary:</div>
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

            {/* Results count (search results only) */}
            {searchActive && !searchLoading && !searchError && (
                <div style={{
                    marginBottom: "12px", padding: "8px 16px", background: "#ecfdf5",
                    border: "1px solid #a7f3d0", borderRadius: theme.radius,
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontFamily: 'inherit',
                    fontSize: '0.875rem', color: '#065f46'
                }}>
                    <strong>{filteredRows.length} record{filteredRows.length === 1 ? '' : 's'} found</strong>
                    {filteredRows.length !== allRows.length && (
                        <span>(filtered from {allRows.length})</span>
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
                    marginBottom: "12px", padding: "10px 16px", background: "#eff6ff",
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
            </div>
            {/* end of the area above the table */}

            {/* Table wrapper */}
            <div style={{ position: 'relative' }}>
                {showTableOverlay && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(255, 255, 255, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: theme.colors.white, border: `1px solid ${theme.colors.primary}`, borderRadius: theme.radius, padding: '14px 22px', color: theme.colors.primary, fontWeight: 600, boxShadow: theme.shadows.lg, fontFamily: 'inherit' }}>
                            <Loader size={20} className="animate-spin" /> {searchLoading ? "Searching..." : "Loading..."}
                        </div>
                    </div>
                )}

                {/* The box height is calculated from the screen: it fills everything under the toolbar */}
                <div ref={tableScrollRef} onScroll={handleTableScroll} style={{ width: "100%", height: fit.height, overflow: "auto", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius, boxShadow: theme.shadows.md, background: theme.colors.white, position: 'relative', boxSizing: 'border-box' }}>
                    <table style={{ width: colLayout.total, borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
                        <thead>
                            <tr>
                                {tableHeader.map((th) => {
                                    const frozen = getFrozenStyle(th.key, 'header', colLayout.offsets, frozenEnabled);
                                    const colWidth = colLayout.widths[th.key];
                                    if (th.noFilter) {
                                        return (
                                            <th key={th.key} style={{ ...thStickyStyle, width: colWidth, ...frozen }}>
                                                {th.key === 'select' ? (
                                                    <input type="checkbox" checked={allVisibleSelected} onChange={(e) => toggleSelectAllVisible(e.target.checked)} style={{ accentColor: theme.colors.primary, cursor: 'pointer', width: 16, height: 16 }} />
                                                ) : th.header}
                                            </th>
                                        );
                                    }
                                    const isActive = !!filters[th.key];
                                    const isOpen = openFilterKey === th.key;
                                    return (
                                        <th key={th.key} style={{ ...thStickyStyle, width: colWidth, ...frozen }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                                <span style={{ whiteSpace: "normal", wordBreak: "break-word", textAlign: "center", flex: 1, lineHeight: 1.15 }}>{th.header}</span>
                                                <button
                                                    ref={(el) => { filterButtonRefs.current[th.key] = el; }}
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onClick={() => handleOpenFilter(th.key)}
                                                    style={{ border: "none", background: (isActive || isOpen) ? theme.colors.primary : "transparent", color: theme.colors.white, cursor: "pointer", padding: "2px 4px", borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'all 0.15s', flexShrink: 0 }}
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
                            {/* spacer = all the rows above the rendered window */}
                            {topSpacerHeight > 0 && (
                                <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
                                    <td colSpan={tableHeader.length} style={spacerCellStyle} />
                                </tr>
                            )}

                            {windowRows.map((row, i) => {
                                const idx = winStart + i;
                                return (
                                    <tr key={row.rowKey} onMouseEnter={() => setHoveredRow(row.rowKey)} onMouseLeave={() => setHoveredRow(null)}>
                                        {tableHeader.map((th) => {
                                            const frozen = getFrozenStyle(th.key, 'body', colLayout.offsets, frozenEnabled);
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
                                                            <div style={clampStyle} title={row.color}>
                                                                <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', background: '#f1f5f9', fontSize: '0.8rem', fontWeight: 500, wordBreak: 'break-word' }}>{row.color}</span>
                                                            </div>
                                                        ) : "-"}
                                                    </td>
                                                );
                                            }

                                            if (th.key === 'balance') {
                                                const b = Number(row.balance) || 0;
                                                return (
                                                    <td key={th.key} style={{ ...baseStyle, fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: b < -0.005 ? '#dc2626' : theme.colors.textMain }}>
                                                        {Math.abs(b) > 0.005 ? b.toFixed(2) : "-"}
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
                                                        <div style={clampStyle} title={String(row[th.key])}>
                                                            <span onClick={th.key === 'jobNo' ? () => handlePrepareChallanEdit(row.challanNo, row[th.key]) : undefined} style={{ fontWeight: th.key === 'jobNo' ? 500 : 400, cursor: th.key === 'jobNo' ? 'pointer' : 'default' }}>{row[th.key]}</span>
                                                        </div>
                                                    </td>
                                                );
                                            }

                                            const isNumber = QTY_KEYS.includes(th.key);
                                            const currentValue = row[th.key];

                                            return (
                                                <td key={th.key} style={{ ...baseStyle, fontVariantNumeric: isNumber ? 'tabular-nums' : 'normal' }}>
                                                    <div title={isNumber ? undefined : String(currentValue || "")} style={{ ...clampStyle, textAlign: 'center', opacity: currentValue ? 1 : 0.5 }}>
                                                        {isNumber ? (Number(currentValue) > 0 ? Number(currentValue).toFixed(2) : "-") : (currentValue || "-")}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}

                            {/* spacer = all the rows below the rendered window */}
                            {bottomSpacerHeight > 0 && (
                                <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
                                    <td colSpan={tableHeader.length} style={spacerCellStyle} />
                                </tr>
                            )}

                            {visibleRows.length === 0 && (
                                <tr>
                                    <td style={{ ...cellStyle, padding: 40, color: theme.colors.textMuted, whiteSpace: 'normal' }} colSpan={tableHeader.length}>
                                        {searchLoading
                                            ? "Searching..."
                                            : (initialLoading || loadingMore)
                                                ? "Loading..."
                                                : (movements.length > 0 ? "No rows match the current filters." : "No records found.")}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        {filteredRows.length > 0 && (
                            <tfoot>
                                <tr>
                                    {tableHeader.map((th) => {
                                        const frozen = getFrozenStyle(th.key, 'footer', colLayout.offsets, frozenEnabled);
                                        if (th.key === 'composition') {
                                            return <td key={th.key} style={{ ...tfootCellStyle, fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', ...frozen }}>{searchActive || !hasMore ? 'Total' : 'Total (loaded)'}</td>;
                                        }
                                        if (TOTAL_KEYS.includes(th.key)) {
                                            return (
                                                <td key={th.key} style={{ ...tfootCellStyle, fontVariantNumeric: 'tabular-nums', fontWeight: th.key === 'billingAmount' ? 800 : 700, ...frozen }}>
                                                    {Math.abs(totals[th.key]) > 0.005 ? totals[th.key].toFixed(2) : "-"}
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

            {/* Paged loading status (normal list mode) */}
            {!searchActive && !initialLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, minHeight: 24, fontSize: '0.8rem', color: theme.colors.textMuted, fontFamily: 'inherit', textAlign: 'center', flexWrap: 'wrap' }}>
                    {loadingMore && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: theme.colors.primary, fontWeight: 600 }}>
                            <Loader size={16} className="animate-spin" /> Loading more...
                        </span>
                    )}
                    {!loadingMore && loadError && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#b91c1c' }}>
                            {loadError}
                            <button
                                onClick={retryLoad}
                                style={{ background: theme.colors.primary, color: theme.colors.white, border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '5px 12px', fontFamily: 'inherit' }}
                            >
                                Retry
                            </button>
                        </span>
                    )}
                    {!loadingMore && !loadError && capReached && (
                        <span style={{ color: '#b45309', fontWeight: 600 }}>
                            Showing the first {allRows.length} rows. More data exists: use the column filters, Month'Year or search to narrow it down.
                        </span>
                    )}
                    {!loadingMore && !loadError && !capReached && hasMore && (
                        <span style={{ opacity: 0.7 }}>
                            {filteredRows.length === allRows.length
                                ? `${allRows.length} rows loaded. Scroll down to load more.`
                                : `${filteredRows.length} of ${allRows.length} loaded rows match the filters. Scroll down to load more.`}
                        </span>
                    )}
                    {!loadingMore && !loadError && !hasMore && (
                        <span style={{ opacity: 0.7 }}>
                            {filteredRows.length === allRows.length
                                ? `All ${allRows.length} rows loaded`
                                : `All ${allRows.length} rows loaded, ${filteredRows.length} match the filters`}
                        </span>
                    )}
                </div>
            )}

            {/* Pagination (search results only) */}
            {searchActive && !searchLoading && totalSearchPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", alignItems: 'center', marginTop: 12, gap: 4, fontFamily: 'inherit' }}>
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

export default YarnDyeing;