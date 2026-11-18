import { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import {
    PlusCircle, RefreshCcw, Filter, X, Search,
    Loader, Download, Pen, FileText
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useFetchData } from "../../hooks/fetch";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";
import UseUserRoles from "../../hooks/all-users/UseUserRoles";
import GlanceModal from "../../components/GlanceModal";
import { generatePDFBooking } from "./generatePdfBooking";
import FilterDropDown from "./FilterDropDown";
import { handleExportExcel } from "./ExportExcell";
import { footerTotals } from "./FooterTotals";
import BreakDownCell from "./BreakDownCell";
import StyleEditModal from "./StyleEditModal";
import DashboardLayout from "../../components/DashboardLayout";
import StyleReqModal from "../../components/modals/StyleReqModal";

// ── Column definitions ────────────────────────────────────────────────────────
const COLUMNS = [
    "SALES CONTACT NO", "BUYER", "JOB NO", "STYLE", "PO NO", "COLOR", "COMPOSITION",
    "FINISH DIA", "ORDER QTY", "1st BOOKING", "PROCESS LOSS %", "FINISH REQUIRED QTY", "ADDITIONAL BOOKING",
    "REQUIRED YARN QTY", "KNITTING WORK ORDER QTY",
    "SHORT & EXCESS", "YARN DELIVERY", "SHORT & EXCESS (+/-)",
    "YARN DELIVERY FOR DYED", "YARN RECEIVED AFTER DYED",
    "PARTY STOCK (SHORT & EXCESS)", "TOTAL KNITTING (GREY)", "RETURN YARN RECEIVED",
    "BALANCE (+/-)", "GREY DELIVERY FOR DYEING", "GREY RETURN FROM DYEING",
    "GREY RECEIVED FROM DYEING",
    "FINISH RECEIVED FROM DYEING", "GREY BALANCE (+/-)",
    "FINISH DELIVERY FROM AOP", "FABRIC RETURN FROM AOP", "AFTER AOP FABRIC RCVD", "FINISH RECEIVED FROM AOP", "AOP FAB. BALANCE (+/-)",
    "AOP PROCESS LOSS (%)", "SENT FOR RE-PROCESS", "RETURN RCVD",
    "RECEIVED AFTER RE-PROCESS (GREY)", "RECEIVED AFTER RE-PROCESS (FINISH)",
    "RE-PROCESS FAB. BALANCE (+/-)", "RE-PROCESS PROCESS LOSS (%)",
];

// ── Filterable columns config ─────────────────────────────────────────────────
const FILTERABLE_COLS = {
    0: { key: "salesContact", type: "row" },
    1: { key: "buyerName", type: "row" },
    2: { key: "jobNo", type: "row" },
    3: { key: "styleNo", type: "row" },
    4: { key: "poNo", type: "row" },
    5: { key: "color", type: "subrow" },
    6: { key: "composition", type: "subrow" },
};

const KEY_TO_INDEX = Object.entries(FILTERABLE_COLS).reduce((acc, [idx, col]) => {
    acc[col.key] = Number(idx);
    return acc;
}, {});

// ─ Frozen column widths ─────────────────────────────────────────────────────
const CHECKBOX_WIDTH = 50;
const FROZEN_WIDTHS = [115, 110, 180, 110, 110, 260, 290, 100];
const FROZEN_COUNT = FROZEN_WIDTHS.length;
const UNFROZEN_WIDTH = 110;

// Calculate frozen left positions WITH checkbox offset
const FROZEN_LEFTS = FROZEN_WIDTHS.reduce((acc, width, idx) => {
    acc.push(idx === 0 ? CHECKBOX_WIDTH : acc[idx - 1] + FROZEN_WIDTHS[idx - 1]);
    return acc;
}, []);

const PERCENT_COLUMN_INDEXES = new Set([10, 34, 40]);
const NO_TOTAL_COLUMN_INDEXES = new Set([20]);

// ===== SCROLL LOADING CONFIG =====
// Jobs are loaded page by page while the user scrolls down (same idea as the AOP page).
const PAGE_LIMIT = 20;                // jobs per request while scrolling
const MAX_LOADED_ROWS = 1000;         // HARD LIMIT of jobs kept in the browser (use filters to narrow the data)
const LOAD_MORE_THRESHOLD = 400;      // start loading the next page when less than this many px are left below
const EXPORT_PAGE_LIMIT = 10000;      // export pulls everything (same as the old single request)
// ===== END SCROLL LOADING CONFIG =====

// ===== AUTO-FIT LAYOUT CONFIG =====
// The table box always fills the rest of the screen: bigger screen = taller table, smaller screen = shorter table.
const FIT_DEBUG = false;        // true = prints the measured numbers in the browser console (F12)
const MIN_TABLE_HEIGHT = 300;   // only a safety minimum - the real height is calculated from the screen
const BOTTOM_RESERVE = 60;      // space kept free under the table (page padding + the loading status line)

// The ERP has its own zoom (67% / 100% ...). With CSS zoom / scale the real screen pixels are NOT the same as the CSS
// pixels of the page, so the height must be corrected by this factor. 1 = no zoom.
// (only used as a fallback - measureFit measures the zoom factor from the table box itself)
const getZoomScale = (el) => {
    const rect = el.getBoundingClientRect();
    const w = el.offsetWidth;
    if (!w || !rect.width) return 1;
    const scale = rect.width / w;
    return scale > 0.2 && scale < 5 ? scale : 1;
};
// ===== END AUTO-FIT LAYOUT CONFIG =====

// ===== FILTER DROPDOWN POSITION =====
// The filter dropdown opens CENTERED under the column header that was clicked.
const FILTER_DROPDOWN_WIDTH = 180;
const FILTER_DROPDOWN_EST_HEIGHT = 320;

// btn = the filter button of the clicked column, el = the real dropdown element (if already on screen),
// current = the top/left that is applied to it right now.
// When the dropdown is already on screen its REAL size and the real zoom factor are measured, so it is centered
// exactly under the column whatever its width is and whatever the ERP zoom (67% / 100% ...) is.
const computeFilterDropdownPos = (btn, el, current) => {
    if (!btn) return null;
    const th = (btn.closest && btn.closest('th')) || btn;
    const rect = th.getBoundingClientRect();

    let width = FILTER_DROPDOWN_WIDTH;
    let height = FILTER_DROPDOWN_EST_HEIGHT;
    let k = 1;
    let elRect = null;
    if (el && current) {
        elRect = el.getBoundingClientRect();
        if (elRect.width > 0 && elRect.height > 0) {
            width = elRect.width;
            height = elRect.height;
            if (el.offsetWidth > 0) {
                const scale = elRect.width / el.offsetWidth;
                if (scale > 0.2 && scale < 5) k = scale;
            }
        } else {
            elRect = null;
        }
    }

    // wanted position on the real screen: horizontally the middle of the column, kept inside the screen
    let wantLeft = rect.left + rect.width / 2 - width / 2;
    wantLeft = Math.max(8, Math.min(wantLeft, window.innerWidth - width - 8));

    // vertically just under the header, or above it when there is no room below
    let wantTop = rect.bottom + 4;
    if (wantTop + height > window.innerHeight - 8) {
        const aboveTop = rect.top - height - 4;
        wantTop = aboveTop > 8 ? aboveTop : Math.max(8, window.innerHeight - height - 8);
    }

    if (!elRect) return { top: wantTop, left: wantLeft };

    // correct the applied top/left by the difference between where it really is and where it should be
    return {
        top: current.top + (wantTop - elRect.top) / k,
        left: current.left + (wantLeft - elRect.left) / k,
    };
};
// ===== END FILTER DROPDOWN POSITION =====

// ── Helper functions ─────────────────────────────────────────────────────────
const safeNum = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

const getBreakdownValue = (item, key) => {
    if (!item || item.status) return 0;
    const val = parseFloat(item[key]);
    return isNaN(val) ? 0 : val;
};

const formatNumber = (val, fallback = "_") => {
    if (val === undefined || val === null || val === "") return fallback;
    const num = parseFloat(val);
    return isNaN(num) ? fallback : num.toFixed(2);
};

// Priority: cell.processLoss > row.processLoss > 0
// 0 / 1 / null / undefined at row level means "no real row value, use each cell"
const shouldUseCellLoss = (row) => {
    const v = parseFloat(row?.processLoss);
    return !v || v === 1; // NaN and 0 are falsy
};

const getProcessLoss = (cell, row) => {
    const value = shouldUseCellLoss(row) ? cell?.processLoss : row.processLoss;
    const loss = parseFloat(value);
    return Number.isNaN(loss) ? 0 : loss;
};

// ─ Summary Page ────────────────────────────────────────────────────────────
export default function Summary() {
    const [rawData, setRawData] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();
    const scrollContainerRef = useRef(null);
    const topRef = useRef(null); // wraps the toolbar, watched for size changes
    // invisible element pinned to the screen: its bottom edge = the bottom of the visible screen
    const viewportProbeRef = useRef(null);

    const [editingJobData, setEditingJobData] = useState(null);
    const [editLoading, setEditLoading] = useState(false);
    const [selectedRows, setSelectedRows] = useState(new Set());

    const FILTER_STORAGE_KEY = "summary_active_filters";

    const [activeFilters, setActiveFilters] = useState(() => {
        try {
            const saved = sessionStorage.getItem(FILTER_STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });
    const [openFilter, setOpenFilter] = useState(null);
    const [filterOptions, setFilterOptions] = useState([]);
    const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);

    const [isLoading, setIsLoading] = useState({ refreshLoading: false });
    const [glanceReport, setGlanceReport] = useState({ isGlanceLoading: false, showGlanceModal: false, reportData: [] });
    const [editingStyleData, setStyleEditingData] = useState({ isShowStyleEditModal: false, isLoading: null, data: [] });

    const { fetchData } = useFetchData();
    const axiosPrivate = useAxiosPrivate();
    // keep the latest axios instance in a ref so the loaders never re-run because of a new instance
    const axiosRef = useRef(axiosPrivate);
    axiosRef.current = axiosPrivate;
    const { sections } = UseUserRoles();

    // ===== SCROLL LOADING STATE =====
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [loadError, setLoadError] = useState(null);   // a page failed (Retry resumes)
    const genRef = useRef(0);                           // bumped to cancel in-flight requests
    const abortRef = useRef(null);
    const pageRef = useRef(1);                          // the NEXT page to load
    const loadingRef = useRef(false);
    const hasMoreRef = useRef(false);
    const capRef = useRef(false);
    const loadErrorRef = useRef(null);
    const rawDataRef = useRef([]);
    const activeFiltersRef = useRef(activeFilters);
    activeFiltersRef.current = activeFilters;
    // ================================

    // ===== AUTO-FIT (screen size) STATE =====
    const [fit, setFit] = useState({ height: 560, width: 1400 });
    // =======================================

    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const dropdownPosRef = useRef(dropdownPos);
    dropdownPosRef.current = dropdownPos;
    const dropdownRef = useRef(null);                 // the Excel-style filter dropdown element
    const filterBtnRefs = useRef({});

    const isAnyModalOpen = showModal || glanceReport.showGlanceModal;

    // ===== PAGED LOADING =====
    const cancelLoad = useCallback(() => {
        genRef.current += 1;
        if (abortRef.current) abortRef.current.abort();
        loadingRef.current = false;
        setLoadingMore(false);
    }, []);

    // Loads ONE page. replace=true starts a new list (first page of the current filters).
    const fetchPage = useCallback(async (gen, page, replace) => {
        if (loadingRef.current && !replace) return;
        loadingRef.current = true;
        if (replace) setIsLoading(prev => ({ ...prev, refreshLoading: true }));
        else setLoadingMore(true);
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const params = { page, limit: PAGE_LIMIT, reconciliation: false, styleRequirement: true };
            const currentFilters = activeFiltersRef.current || {};
            if (Object.keys(currentFilters).length > 0) params.filters = JSON.stringify(currentFilters);
            const res = await axiosRef.current.get('/api/styles', { params, signal: controller.signal });
            if (gen !== genRef.current) return; // cancelled / replaced by a newer load

            console.log(res.data, "style  data"); // style requirement log
            const body = res.data || {};
            // the list can arrive as body.data, body.data.data, body.items ... (or the body itself)
            const pickList = (b) => {
                if (Array.isArray(b)) return b;
                if (!b || typeof b !== 'object') return [];
                for (const key of ['data', 'items', 'rows', 'result']) {
                    if (Array.isArray(b[key])) return b[key];
                }
                return [];
            };
            let items = pickList(body);
            if (items.length === 0 && body.data && typeof body.data === 'object') items = pickList(body.data);
            const meta = (body.data && typeof body.data === 'object' && !Array.isArray(body.data)) ? { ...body.data, ...body } : body;

            // jobs that are really new (the same job can arrive twice at a page border)
            let freshCount = items.length;
            setRawData(prev => {
                if (replace) return items;
                const seen = new Set();
                prev.forEach((r) => { if (r?.id !== undefined && r?.id !== null) seen.add(r.id); });
                const fresh = items.filter((it) => it?.id === undefined || it?.id === null || !seen.has(it.id));
                return prev.concat(fresh);
            });
            if (!replace) {
                const seenNow = new Set();
                rawDataRef.current.forEach((r) => { if (r?.id !== undefined && r?.id !== null) seenNow.add(r.id); });
                freshCount = items.filter((it) => it?.id === undefined || it?.id === null || !seenNow.has(it.id)).length;
            }

            // is there another page?
            let more;
            if (typeof meta.hasMore === 'boolean') more = meta.hasMore;
            else if (meta.totalPages !== undefined && meta.totalPages !== null) more = page < Number(meta.totalPages);
            else if (meta.total !== undefined && meta.total !== null) more = page * PAGE_LIMIT < Number(meta.total);
            else more = items.length >= PAGE_LIMIT;
            if (items.length === 0) more = false;
            // the server ignored the page size and sent everything / sent the same jobs again: nothing more to load
            if (items.length > PAGE_LIMIT || freshCount === 0) more = false;

            pageRef.current = page + 1;
            setHasMore(more);
        } catch (err) {
            if (gen !== genRef.current) return; // aborted on purpose
            console.error("Failed to fetch filtered data:", err);
            const message = err?.response?.status === 403
                ? "Permission denied"
                : (err?.response?.data?.message || err?.response?.data?.msg || err?.message || "Failed to load jobs");
            setHasMore(false);
            setLoadError(message);
        } finally {
            if (gen === genRef.current) {
                loadingRef.current = false;
                setLoadingMore(false);
                if (replace) setIsLoading(prev => ({ ...prev, refreshLoading: false }));
            }
        }
    }, []);

    // Load the next page when the user scrolls near the bottom (and the memory cap is not reached)
    const maybeLoadMore = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        if (!hasMoreRef.current || loadingRef.current || capRef.current || loadErrorRef.current) return;
        if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_MORE_THRESHOLD) return;
        fetchPage(genRef.current, pageRef.current, false);
    }, [fetchPage]);

    // (Re)start the list from page 1
    const fetchFilteredData = useCallback(() => {
        cancelLoad();
        const gen = genRef.current;
        pageRef.current = 1;
        setHasMore(false);
        setLoadError(null);
        loadErrorRef.current = null;
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
        fetchPage(gen, 1, true);
    }, [cancelLoad, fetchPage]);

    // restart whenever the filters change (and on first load)
    useEffect(() => {
        fetchFilteredData();
    }, [fetchFilteredData, activeFilters]);

    // stop everything when the page is left
    useEffect(() => () => cancelLoad(), [cancelLoad]);

    const retryLoad = () => {
        setLoadError(null);
        loadErrorRef.current = null;
        fetchPage(genRef.current, pageRef.current, pageRef.current === 1);
    };
    // ==========================

    const handleRedirect = (jobNumber) => navigate(`/dashboard/new-order/${jobNumber}`);

    useEffect(() => {
        try {
            sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(activeFilters));
        } catch (e) {
            console.log(e);
        }
    }, [activeFilters]);

    const filteredData = rawData;
    rawDataRef.current = rawData;

    // every loaded job is shown (the table scrolls and loads more jobs at the bottom)
    const paginatedData = filteredData;

    const capReached = hasMore && filteredData.length >= MAX_LOADED_ROWS;
    hasMoreRef.current = hasMore;
    capRef.current = capReached;
    loadErrorRef.current = loadError;

    // content shorter than the box (or after a page arrives / the screen got taller): keep loading until it is filled / capped
    useEffect(() => {
        maybeLoadMore();
    }, [filteredData.length, hasMore, loadingMore, loadError, fit.height, maybeLoadMore]);

    const totals = useMemo(
        () => footerTotals({ FROZEN_COUNT, filteredData, COLUMNS, getBreakdownValue }),
        [filteredData]
    );

    // ===== AUTO-FIT MEASURING =====
    // Table height = (bottom of the visible screen - top of the table) - space kept free under the table.
    // Nothing is hard-coded: a bigger screen gives a taller table, a smaller screen gives a shorter one.
    // Everything is measured with getBoundingClientRect (one single coordinate space), so it works the same with the
    // ERP zoom (67% / 100% / ...), browser zoom, phones and tablets.
    const measureFit = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();

        // zoom factor measured from the table box: rendered height / the CSS height we gave it
        const applied = parseFloat(el.style.height);
        let k = applied > 0 && rect.height > 0 ? rect.height / applied : getZoomScale(el);
        if (!(k > 0.2 && k < 5)) k = 1;

        // bottom of the visible screen (same coordinate space as `rect`)
        const probe = viewportProbeRef.current;
        const probeRect = probe ? probe.getBoundingClientRect() : null;
        const viewH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        const viewportBottom = probeRect && probeRect.height > 0 ? probeRect.bottom : viewH;

        // table top measured from the very top of the content, no matter how far the page / the ERP panel is scrolled
        const docTop = document.documentElement.getBoundingClientRect().top;
        let top = rect.top - docTop;
        if (document.body.scrollTop) top += document.body.scrollTop * k;
        let node = el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            if (node.scrollTop) top += node.scrollTop * k;
            node = node.parentElement;
        }

        const height = Math.max(MIN_TABLE_HEIGHT, Math.floor((viewportBottom - top) / k - BOTTOM_RESERVE));
        if (FIT_DEBUG) console.log('[Summary fit]', { viewportBottom, top, k, reserve: BOTTOM_RESERVE, height });
        const width = el.clientWidth;
        setFit((prev) => (prev.height === height && prev.width === width ? prev : { height, width }));
    }, []);

    // measure on mount, window resize, and whenever the page / the area above the table changes size
    // (filter chips appear, the ERP shell finishes loading, sidebar opens, browser zoom changes ...)
    useLayoutEffect(() => {
        measureFit();
        // the ERP shell / fonts / images can still move things after the first paint: measure again a bit later
        const t1 = setTimeout(measureFit, 100);
        const t2 = setTimeout(measureFit, 500);
        const t3 = setTimeout(measureFit, 1500);
        window.addEventListener('resize', measureFit);
        window.addEventListener('orientationchange', measureFit);
        window.addEventListener('load', measureFit);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', measureFit);
        // the ERP zoom control changes a style / class on <html> or <body> without resizing anything: catch that too
        let mo = null;
        if (typeof MutationObserver !== 'undefined') {
            mo = new MutationObserver(() => measureFit());
            mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
            mo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        }
        // safety net: cheap re-check (state only changes when the number really changes)
        const poll = setInterval(measureFit, 800);
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => measureFit());
            if (topRef.current) ro.observe(topRef.current);
            if (scrollContainerRef.current) ro.observe(scrollContainerRef.current);
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
    }, [measureFit, selectedRows.size]);
    // ==============================

    // place the dropdown centered under its column using the REAL dropdown element (runs after every render while open,
    // so it also fixes itself when the options finish loading and the dropdown changes size)
    useLayoutEffect(() => {
        if (openFilter === null) return;
        const el = dropdownRef.current;
        if (!el) return;
        const pos = computeFilterDropdownPos(filterBtnRefs.current[openFilter], el, dropdownPos);
        if (pos && (Math.abs(pos.top - dropdownPos.top) > 0.5 || Math.abs(pos.left - dropdownPos.left) > 0.5)) {
            setDropdownPos(pos);
        }
    }, [openFilter, dropdownPos, filterOptions, filterOptionsLoading]);

    // keep the filter dropdown glued to its column while the table / page scrolls or the screen is resized
    useEffect(() => {
        if (openFilter === null) return;
        const handler = (e) => {
            // scrolling the value list INSIDE the dropdown must not reposition it
            if (e && e.type === 'scroll' && dropdownRef.current && e.target instanceof Node && dropdownRef.current.contains(e.target)) return;
            const el = dropdownRef.current;
            const pos = computeFilterDropdownPos(filterBtnRefs.current[openFilter], el, dropdownPosRef.current);
            if (pos) setDropdownPos((prev) => (Math.abs(prev.top - pos.top) <= 0.5 && Math.abs(prev.left - pos.left) <= 0.5 ? prev : pos));
        };
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [openFilter]);

    const openFilterDropdown = async (colIndex, e) => {
        e.stopPropagation();
        if (openFilter === colIndex) { setOpenFilter(null); return; }

        // open centered under the clicked column
        const pos = computeFilterDropdownPos(filterBtnRefs.current[colIndex], null, null);
        if (pos) setDropdownPos(pos);
        setOpenFilter(colIndex);
        setFilterOptions([]);

        const col = FILTERABLE_COLS[colIndex];
        if (!col) return;

        setFilterOptionsLoading(true);
        try {
            const otherFilters = { ...activeFilters };
            delete otherFilters[col.key];
            const params = Object.keys(otherFilters).length > 0 ? { filters: JSON.stringify(otherFilters) } : {};
            const res = await axiosPrivate.get(`/api/glance/filter-options/${col.key}`, { params });
            setFilterOptions(res.data?.data || []);
        } catch (err) {
            console.error("Failed to fetch filter options:", err);
            setFilterOptions([]);
        } finally {
            setFilterOptionsLoading(false);
        }
    };

    const applyFilter = (colIndex, selectedSet) => {
        const col = FILTERABLE_COLS[colIndex];
        if (!col) return;
        const selectedArray = Array.from(selectedSet);
        const allOptionsSelected = selectedArray.length === filterOptions.length && filterOptions.length > 0;

        setActiveFilters(prev => {
            const next = { ...prev };
            if (selectedArray.length === 0 || allOptionsSelected) delete next[col.key];
            else next[col.key] = selectedArray;
            return next;
        });
    };

    const clearFilter = (colIndex) => {
        const col = FILTERABLE_COLS[colIndex];
        if (!col) return;
        setActiveFilters(prev => {
            const next = { ...prev };
            delete next[col.key];
            return next;
        });
    };

    const clearAllFilters = () => setActiveFilters({});
    const hasActiveFilters = Object.keys(activeFilters).length > 0;

    const HEADER_BG = "#f3ddc7";
    const BORDER_COLOR = "#14b8a6";
    const CELL_BG = "#ffffff";

    const getColBg = (index) => CELL_BG;

    const getFrozenStyle = (index) => ({
        position: 'sticky',
        left: `${FROZEN_LEFTS[index]}px`,
        width: `${FROZEN_WIDTHS[index]}px`,
        minWidth: `${FROZEN_WIDTHS[index]}px`,
        maxWidth: `${FROZEN_WIDTHS[index]}px`,
        zIndex: 20,
        backgroundColor: CELL_BG,
        borderRight: `1px solid ${BORDER_COLOR}`,
        borderBottom: `1px solid ${BORDER_COLOR}`,
        boxShadow: index === FROZEN_COUNT - 1 ? '2px 0 4px -2px rgba(0,0,0,0.1)' : 'none',
        overflow: index === FROZEN_COUNT - 1 ? 'hidden' : 'visible',
        textAlign: 'center',
    });

    const getCellStyle = (index) => ({
        backgroundColor: getColBg(index),
        borderRight: `1px solid ${BORDER_COLOR}`,
        borderBottom: `1px solid ${BORDER_COLOR}`,
        textAlign: 'center',
        width: `${UNFROZEN_WIDTH}px`,
        minWidth: `${UNFROZEN_WIDTH}px`,
        maxWidth: `${UNFROZEN_WIDTH}px`,
    });

    const getFormulaCellStyle = () => ({
        backgroundColor: CELL_BG,
        borderRight: `1px solid ${BORDER_COLOR}`,
        borderBottom: `1px solid ${BORDER_COLOR}`,
        textAlign: 'center',
        width: `${UNFROZEN_WIDTH}px`,
        minWidth: `${UNFROZEN_WIDTH}px`,
        maxWidth: `${UNFROZEN_WIDTH}px`,
    });

    const handleRefresh = () => {
        fetchFilteredData();
    }

    const openEditJobModal = async (jobNo) => {
        setStyleEditingData({ isShowStyleEditModal: true, isLoading: true, data: [] })
        const params = { page: 1, limit: 10000, reconciliation: false, styleRequirement: true };

        try {
            const req = await axiosPrivate.get(`/api/styles/${jobNo}`, { params });
            if (req.data.type === "success") {
                console.log(req.data, "style data");
                setStyleEditingData({ isShowStyleEditModal: true, isLoading: false, data: req?.data?.data })
            }
        } finally {
            setEditLoading(false);
        }
    };

    // The table only holds the jobs loaded so far, so when more jobs exist on the server the export
    // pulls the full list first (same request the page used to make), then exports exactly as before.
    const handleExportExcelFile = async () => {
        let exportData = filteredData;
        let exportTotals = totals;

        if (hasMore) {
            try {
                const params = { page: 1, limit: EXPORT_PAGE_LIMIT, reconciliation: false, styleRequirement: true };
                if (Object.keys(activeFilters).length > 0) params.filters = JSON.stringify(activeFilters);
                const res = await axiosPrivate.get('/api/styles', { params });
                if (res.data && Array.isArray(res.data.data)) {
                    exportData = res.data.data;
                    exportTotals = footerTotals({ FROZEN_COUNT, filteredData: exportData, COLUMNS, getBreakdownValue });
                }
            } catch (err) {
                console.error("Failed to fetch all data for export:", err);
            }
        }

        handleExportExcel({ filteredData: exportData, COLUMNS, getBreakdownValue, FROZEN_COUNT, footerTotals: exportTotals, NO_TOTAL_COLUMN_INDEXES, PERCENT_COLUMN_INDEXES })
    };

    const generateBooking = (rowData) => {
        generatePDFBooking(rowData)
    };

    const handleToggleRow = (rowId) => {
        const newSelected = new Set(selectedRows);
        if (newSelected.has(rowId)) {
            newSelected.delete(rowId);
        } else {
            newSelected.add(rowId);
        }
        setSelectedRows(newSelected);
    };

    const handleGenerateSelectedPDFs = () => {
        if (selectedRows.size === 0) {
            alert("Please select at least one row to generate PDF");
            return;
        }

        selectedRows.forEach(rowId => {
            const rowData = filteredData.find(r => r.id === rowId);
            if (rowData) {
                generateBooking(rowData);
            }
        });
    };

    const handleGlanceReport = () => {
        setGlanceReport({ isGlanceLoading: true });
        const params = { page: 1, limit: 10000, reconciliation: false, styleRequirement: true };
        fetchData(`/api/styles`, { params }).then(data => {
            if (data) setGlanceReport({ showGlanceModal: true, isGlanceLoading: false, reportData: data.data });
        });
    }

    return (
        <DashboardLayout>
            {/* Invisible screen-height probe (used only to measure the bottom of the visible screen) */}
            <div
                ref={viewportProbeRef}
                aria-hidden="true"
                style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 1, pointerEvents: 'none', visibility: 'hidden' }}
            />

            <div ref={topRef}>
            <div className="flex gap-2 mb-4 items-center flex-wrap">
                {
                    sections?.styleRequirements?.addJob && (
                        <button
                            onClick={() => {
                                setEditingJobData(null);
                                setShowModal(true);
                            }}
                            className="flex items-center gap-2 px-6 py-2.5 bg-slate-800/80 text-white font-medium rounded-md hover:bg-primary-600 transition-colors border border-primary-600"
                        >
                            <PlusCircle size={18} /> Add Job
                        </button>
                    )
                }
                {
                    isLoading.refreshLoading ?
                        <button className="flex items-center gap-2 px-6 py-2.5 bg-slate-800/80 text-white font-medium rounded-md hover:bg-primary-600 transition-colors border border-primary-600">
                            <span className="animate-spin"><RefreshCcw size={18} /></span>
                        </button> :
                        <button onClick={() => handleRefresh()} className="flex items-center gap-2 px-6 py-2.5 bg-slate-800/80 text-white font-medium rounded-md hover:bg-primary-600 transition-colors border border-primary-600">
                            <RefreshCcw size={18} />
                        </button>
                }

                {selectedRows.size > 0 && (
                    <button
                        onClick={handleGenerateSelectedPDFs}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-500 text-white font-medium rounded-md hover:bg-blue-600 transition-colors border border-blue-600"
                    >
                        <FileText size={18} /> Generate PDF ({selectedRows.size})
                    </button>
                )}

                {
                    glanceReport.showGlanceModal && (
                        <GlanceModal
                            glanceReport={glanceReport}
                            setGlanceReport={setGlanceReport}
                            handleGlanceReport={handleGlanceReport}
                        />
                    )
                }

                <div className="h-8 w-px bg-gray-300 mx-2 hidden sm:block"></div>

                <div className="flex items-center gap-1">
                    <button onClick={() => handleExportExcelFile()} className="flex items-center justify-center h-9 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm p-2" title="Export">
                        <Download size={18} className="text-gray-600" />
                        Export
                    </button>
                    {
                        sections.styleRequirements?.reconciliation && (
                            glanceReport.isGlanceLoading ?
                                <button className="flex items-center justify-center h-9 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm p-2" title="See MAKE YOUR RECONCIALATION">
                                    <span className="animate-spin"><RefreshCcw size={18} className="text-gray-600" /></span>
                                </button> :
                                <Link to={"/dashboard/style/reconciliation"}>
                                    <button className="flex font-semibold items-center justify-center h-9 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors shadow-sm p-2" title="RECONCIALATION">
                                        <Pen size={20} className="text-gray-600" />
                                        MAKE YOUR RECONCIALATION
                                    </button>
                                </Link>
                        )
                    }
                </div>

                {hasActiveFilters && (
                    <>
                        <div className="h-8 w-px bg-gray-300 mx-2 hidden sm:block"></div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <Filter size={14} className="text-teal-600" />
                            {Object.entries(activeFilters).map(([colKey, values]) => {
                                const colIndex = KEY_TO_INDEX[colKey];
                                return (
                                    <span
                                        key={colKey}
                                        className="flex items-center gap-1 px-2 py-1 bg-teal-50 border border-[#14b8a6] text-teal-700 text-xs rounded-full font-medium"
                                    >
                                        {colIndex !== undefined ? COLUMNS[colIndex] : colKey}
                                        <span className="bg-teal-200 text-teal-800 rounded-full px-1 text-xs">{values.length}</span>
                                        <button onClick={() => colIndex !== undefined && clearFilter(colIndex)} className="ml-0.5 text-teal-400 hover:text-teal-700">
                                            <X size={11} />
                                        </button>
                                    </span>
                                );
                            })}
                            <button
                                onClick={clearAllFilters}
                                className="text-xs text-gray-500 hover:text-red-500 underline ml-1"
                            >
                                Clear all
                            </button>
                        </div>
                    </>
                )}

                <span className="ml-auto text-xs text-gray-400">
                    {filteredData.length} rows
                </span>
            </div>
            </div>

            {showModal && (
                <StyleReqModal
                    setRawData={setRawData}
                    setShowModal={setShowModal}
                    editData={editingJobData}
                    onSaved={() => {
                        fetchFilteredData();
                        setShowModal(false);
                        setEditingJobData(null);
                    }}
                />
            )}

            {
                editingStyleData.isShowStyleEditModal === true && (
                    <StyleEditModal
                        editingStyleData={editingStyleData.data}
                        isLoading={editingStyleData.isLoading}
                        setStyleEditingData={setStyleEditingData}
                    />
                )
            }

            {openFilter !== null && (
                <FilterDropDown
                    key={openFilter}
                    colIndex={openFilter}
                    colLabel={COLUMNS[openFilter]}
                    allValues={filterOptions}
                    isLoading={filterOptionsLoading}
                    activeValues={activeFilters[FILTERABLE_COLS[openFilter]?.key] ? Array.from(activeFilters[FILTERABLE_COLS[openFilter]?.key]) : null}
                    onApply={(set) => applyFilter(openFilter, set)}
                    onClear={() => clearFilter(openFilter)}
                    onClose={() => setOpenFilter(null)}
                    anchorRef={{ current: filterBtnRefs.current[openFilter] }}
                    dropdownRef={dropdownRef}
                    width={FILTER_DROPDOWN_WIDTH}
                    maxHeight={FILTER_DROPDOWN_EST_HEIGHT}
                    style={{ top: dropdownPos.top, left: dropdownPos.left }}
                />
            )}

            <style>{`
                .filter-dropdown {
                    top: ${dropdownPos.top}px !important;
                    left: ${dropdownPos.left}px !important;
                }
                .subrow-cell {
                    min-height: 42px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                }
            `}</style>

            {/* The box height is calculated from the screen: it fills everything under the toolbar */}
            <div
                ref={scrollContainerRef}
                onScroll={maybeLoadMore}
                className="relative overflow-auto shadow-xs"
                style={{ height: fit.height, boxSizing: 'border-box', border: `1px solid ${BORDER_COLOR}`, borderRadius: '14px' }}
            >
                <table
                    className="w-full text-sm text-left rtl:text-right text-body"
                    style={{ borderCollapse: 'separate', borderSpacing: 0 }}
                >
                    <thead className="sticky top-0 z-30 text-sm text-body">
                        <tr>
                            <th
                                scope="col"
                                className="px-3 py-3 font-medium"
                                style={{
                                    backgroundColor: HEADER_BG,
                                    position: 'sticky',
                                    left: '0px',
                                    width: `${CHECKBOX_WIDTH}px`,
                                    minWidth: `${CHECKBOX_WIDTH}px`,
                                    maxWidth: `${CHECKBOX_WIDTH}px`,
                                    zIndex: 50,
                                    borderRight: `1px solid ${BORDER_COLOR}`,
                                    borderBottom: `2px solid ${BORDER_COLOR}`,
                                    borderTopLeftRadius: '14px',
                                    textAlign: 'center',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            const allIds = new Set(paginatedData.map(r => r.id));
                                            setSelectedRows(allIds);
                                        } else {
                                            setSelectedRows(new Set());
                                        }
                                    }}
                                    checked={paginatedData.length > 0 && paginatedData.every(r => selectedRows.has(r.id))}
                                    className="rounded text-teal-600"
                                />
                            </th>
                            {COLUMNS.map((col, index) => {
                                const isFilterable = index in FILTERABLE_COLS;
                                const hasFilter = isFilterable && !!activeFilters[FILTERABLE_COLS[index].key];
                                const isFrozen = index < FROZEN_COUNT;

                                return (
                                    <th
                                        key={index}
                                        scope="col"
                                        className="px-3 py-3 font-medium whitespace-normal wrap-break-words"
                                        style={{
                                            backgroundColor: HEADER_BG,
                                            position: 'sticky',
                                            left: isFrozen ? `${FROZEN_LEFTS[index]}px` : 'auto',
                                            width: isFrozen ? `${FROZEN_WIDTHS[index]}px` : `${UNFROZEN_WIDTH}px`,
                                            minWidth: isFrozen ? `${FROZEN_WIDTHS[index]}px` : `${UNFROZEN_WIDTH}px`,
                                            maxWidth: isFrozen ? `${FROZEN_WIDTHS[index]}px` : `${UNFROZEN_WIDTH}px`,
                                            zIndex: isFrozen ? 45 : 35,
                                            borderRight: `1px solid ${BORDER_COLOR}`,
                                            borderBottom: `2px solid ${BORDER_COLOR}`,
                                            borderTopRightRadius: index === COLUMNS.length - 1 ? '14px' : 0,
                                            boxShadow: index === FROZEN_COUNT - 1 ? '2px 0 4px -2px rgba(0,0,0,0.15)' : 'none',
                                            overflow: index === FROZEN_COUNT - 1 ? 'hidden' : 'visible',
                                            textAlign: 'center',
                                        }}
                                    >
                                        <div className="flex items-center gap-1 justify-center flex-wrap">
                                            <span className="flex-1 text-center wrap-break-words">{col}</span>
                                            {isFilterable && (
                                                <button
                                                    ref={el => filterBtnRefs.current[index] = el}
                                                    data-filter-btn="true"
                                                    onClick={(e) => openFilterDropdown(index, e)}
                                                    title={hasFilter ? "Filter active" : "Filter"}
                                                    className={`shrink-0 flex items-center justify-center w-5 h-5 rounded transition-colors ${hasFilter
                                                        ? 'bg-teal-600 text-white'
                                                        : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                                                        }`}
                                                >
                                                    <Filter size={11} />
                                                </button>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        {isLoading.refreshLoading && paginatedData.length === 0 && (
                            <tr>
                                <td colSpan={COLUMNS.length + 1} className="px-4 py-20 text-center align-middle">
                                    <div className="flex flex-col items-center justify-center gap-3" style={{ position: 'sticky', left: 0, width: fit.width }}>
                                        <RefreshCcw size={24} className="animate-spin text-teal-600" />
                                        <span className="text-sm font-medium text-gray-500">Loading summary data...</span>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {!isLoading.refreshLoading && paginatedData.map((row, i) => {
                            const compBreakdown = row.compBreakdown || row.rows.map(() => ({}));
                            const isSelected = selectedRows.has(row.id);

                            return (
                                <tr key={row.id || i} className={`group ${isSelected ? 'bg-blue-50' : ''}`}>
                                    <td
                                        className="px-3 py-2 align-middle"
                                        style={{
                                            position: 'sticky',
                                            left: '0px',
                                            width: `${CHECKBOX_WIDTH}px`,
                                            minWidth: `${CHECKBOX_WIDTH}px`,
                                            maxWidth: `${CHECKBOX_WIDTH}px`,
                                            zIndex: 25,
                                            backgroundColor: isSelected ? '#eff6ff' : CELL_BG,
                                            borderRight: `1px solid ${BORDER_COLOR}`,
                                            borderBottom: `1px solid ${BORDER_COLOR}`,
                                            textAlign: 'center',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleRow(row.id)}
                                            className="rounded text-teal-600"
                                        />
                                    </td>

                                    <td className={`px-3 py-2 align-middle group-hover:bg-teal-50/40`} style={getFrozenStyle(0)}>
                                        {row.salesContact}
                                    </td>

                                    <td className={`px-3 py-2 align-middle group-hover:bg-teal-50/40`} style={getFrozenStyle(1)}>
                                        {row.buyerName}
                                    </td>

                                    <td className={`px-3 py-2 align-middle group-hover:bg-teal-50/40`} style={getFrozenStyle(2)}>
                                        <div className="flex items-center justify-center gap-2">
                                            <span
                                                onDoubleClick={() => handleRedirect(row.jobNo)}
                                                className="cursor-pointer hover:text-teal-700 flex-1 text-center wrap-break-words"
                                            >
                                                {row.jobNo}
                                            </span>
                                            {
                                                sections?.styleRequirements?.infoEdit && (
                                                    <button
                                                        disabled={editLoading}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openEditJobModal(row.jobNo);
                                                        }}
                                                        className="p-1.5 text-teal-600 hover:bg-teal-100 rounded-md transition-colors shrink-0 disabled:opacity-50"
                                                        title="Edit Job Details"
                                                    >
                                                        {editLoading ? <Loader size={16} className="animate-spin" /> : <Pen size={16} />}
                                                    </button>
                                                )
                                            }
                                        </div>
                                    </td>

                                    <td className={`px-3 py-2 align-middle group-hover:bg-teal-50/40`} style={getFrozenStyle(3)}>
                                        {row.styleNo}
                                    </td>

                                    <td className={`px-3 py-2 align-middle group-hover:bg-teal-50/40`} style={getFrozenStyle(4)}>
                                        {row.poNo}
                                    </td>

                                    <td className="p-0 align-top group-hover:bg-teal-50/40" style={getFrozenStyle(5)}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => (
                                                <div key={j} className={`px-3 py-2 subrow-cell`}>
                                                    <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium border border-teal-200">
                                                        {cell.color}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top group-hover:bg-teal-50/40" style={getFrozenStyle(6)}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => (
                                                <div key={j} className={`px-3 py-2 subrow-cell`} title={cell.composition}>
                                                    <span className="block w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                                                        {cell.composition}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top group-hover:bg-teal-50/40" style={getFrozenStyle(7)}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => (
                                                <div key={j} className={`px-3 py-2 subrow-cell`}>
                                                    {cell.finishDia}
                                                </div>
                                            ))}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top group-hover:bg-teal-50/40" style={getCellStyle(8)}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => (
                                                <div key={j} className={`px-3 py-2 subrow-cell`}>
                                                    {cell.orderQty !== undefined && cell.orderQty !== null && cell.orderQty !== "" ? cell.orderQty : "_"}
                                                </div>
                                            ))}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => {
                                                const loss = getProcessLoss(cell, row);
                                                const finishReq = safeNum(cell.finishRequiredQty);
                                                const additional = safeNum(cell.additional);
                                                const val = (finishReq * (1 + loss / 100) + additional);
                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell`}>
                                                        {isNaN(val) ? "0.00" : val.toFixed(2)}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    <td className="p-0 align-top" style={getCellStyle(10)}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {shouldUseCellLoss(row) ? (
                                                row.rows.map((cell, j) => {
                                                    const loss = getProcessLoss(cell, row);

                                                    return (
                                                        <div key={j} className="px-3 py-2 subrow-cell">
                                                            {loss.toFixed(2)}%
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="px-3 py-2 subrow-cell">
                                                    {Number(row.processLoss || 0).toFixed(2)}%
                                                </div>
                                            )}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => {
                                                const loss = getProcessLoss(cell, row);
                                                const additional = safeNum(cell.additional);
                                                const lossQty = additional * (loss / 100);
                                                const netAdditional = additional ;

                                                const finishReq = safeNum(cell.finishRequiredQty);
                                                const inCreaseFinishQty = finishReq + netAdditional;

                                                return (
                                                    <div key={j} className="px-3 py-2 subrow-cell">
                                                        {Number.isNaN(inCreaseFinishQty) ? "0.00" : inCreaseFinishQty.toFixed(2)}
                                                        
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top" style={getCellStyle(12)}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => (
                                                <div key={j} className={`px-3 py-2 subrow-cell`}>
                                                    {formatNumber(cell.additional, cell.additional || "-")}
                                                </div>
                                            ))}
                                        </div>
                                    </td>

                                    {/* REQUIRED YARN QTY = (Finish Required + Additional) × (1 + Process Loss %) */}
                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => {
                                                const loss = getProcessLoss(cell, row);
                                                const finishReq = safeNum(cell.finishRequiredQty);
                                                const additional = safeNum(cell.additional);
                                                const yarnReqQty = (finishReq + additional) * (1 + loss / 100);
                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell`}>
                                                        {isNaN(yarnReqQty) ? "0.00" : yarnReqQty.toFixed(2)}
                                                        
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'knittingOrder_workOrderQty', num: 14 })}

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => {
                                                const cb = compBreakdown[j] || {};
                                                if (cb.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;
                                                const loss = getProcessLoss(cell, row);
                                                const finishRequiredQty = safeNum(cell.finishRequiredQty);
                                                const additional = safeNum(cell.additional);
                                                 const yarnReqQty = (finishRequiredQty + additional) * (1 + loss / 100);
                                                const knittingWorkOrderQty = getBreakdownValue(cb, 'knittingOrder_workOrderQty');
                                                const diff0 =  yarnReqQty - knittingWorkOrderQty;
                                                const isExceeded0 = diff0 > 0;
                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell ${isExceeded0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}`}>
                                                        {isNaN(diff0) ? "0.00" : (isExceeded0 ? `(${diff0.toFixed(2)})` : Math.abs(diff0).toFixed(2))}
                                                    
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'knittingOrder_Yarn_Delivery', num: 16 })}

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((cell, j) => {
                                                const cb = compBreakdown[j] || {};
                                                if (cb.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;

                                                const delivered = getBreakdownValue(cb, 'knittingOrder_Yarn_Delivery');
                                                const workOrderQty = getBreakdownValue(cb, 'knittingOrder_workOrderQty');

                                                const diff1 = workOrderQty - delivered;
                                                const isExcess = diff1 > 0;

                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell ${isExcess ? "text-green-600 font-bold" : "text-red-600 font-bold"}`}>
                                                        {delivered === 0 && workOrderQty === 0 ? "_" : (isNaN(diff1) ? "0.00" : (isExcess ? `(${diff1.toFixed(2)})` : Math.abs(diff1).toFixed(2)))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'yarnDyeingOrder_Yarn_Delivery_For_Yarn_Dye', num: 18 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'yarnDyeingOrder_Yarn_Received_From_Yarn_Dye', num: 19 })}

                                    <td className="p-0 align-top" style={getCellStyle(20)}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {row.rows.map((_, j) => <div key={j} className={`px-3 py-2 subrow-cell`}>-</div>)}
                                        </div>
                                    </td>

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'knittingOrder_Grey_Fabric_Received', num: 21 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'knittingOrder_Yarn_Return', num: 22 })}

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {compBreakdown.map((cb, j) => {
                                                if (cb?.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;
                                                const yarnDelivery = getBreakdownValue(cb, 'knittingOrder_Yarn_Delivery');
                                                const yarnReturn = getBreakdownValue(cb, 'knittingOrder_Yarn_Return');
                                                const greyReceived = getBreakdownValue(cb, 'knittingOrder_Grey_Fabric_Received');
                                                const balance = (greyReceived + yarnReturn) - yarnDelivery;
                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                        {balance === 0 || isNaN(balance) ? "_" : balance.toFixed(2)}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'dyeingOrder_Grey_Delivery', num: 24 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'dyeingOrder_Grey_Return', num: 25 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'dyeingOrder_Grey_Received', num: 26 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'dyeingOrder_Finish_Received', num: 27 })}

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {compBreakdown.map((cb, j) => {
                                                if (cb?.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;
                                                const diff = getBreakdownValue(cb, 'dyeingOrder_Grey_Delivery') - getBreakdownValue(cb, 'dyeingOrder_Grey_Received') -
                                                    getBreakdownValue(cb, 'dyeingOrder_Grey_Return_Received');
                                                const isExceeded = diff > 0;
                                                const hasAnyData = getBreakdownValue(cb, 'dyeingOrder_Grey_Return_Received') ||
                                                    getBreakdownValue(cb, 'dyeingOrder_Grey_Received_From_Dyeing') ||
                                                    getBreakdownValue(cb, 'dyeingOrder_Grey_Delivery');
                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell ${isExceeded ? "text-green-600 font-bold" : "font-bold text-red-600"}`}>
                                                        {!hasAnyData || isNaN(diff) ? "_" : (isExceeded ? `(${diff.toFixed(2)})` : Math.abs(diff).toFixed(2))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'aopOrder_Sent_For_Aop', num: 29 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'aopOrder_Fabric_Return', num: 30 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'aopOrder_After_Aop_Fabric_Rcvd', num: 31 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'aopOrder_Received_From_Aop', num: 32 })}

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {compBreakdown.map((cb, j) => {
                                                if (cb?.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;
                                                const sent = getBreakdownValue(cb, 'aopOrder_Sent_For_Aop');
                                                const received = getBreakdownValue(cb, 'aopOrder_Received_From_Aop');
                                                const diff = received - sent;
                                                const isExceeded = diff > 0;
                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell ${isExceeded ? "text-green-600 font-bold" : "font-bold text-red-600"}`}>
                                                        {(sent === 0 && received === 0) || isNaN(diff) ? "_" : (isExceeded ? `(${Math.abs(diff).toFixed(2)})` : Math.abs(diff).toFixed(2))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {compBreakdown.map((cb, j) => {
                                                if (cb?.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;
                                                const sent = getBreakdownValue(cb, 'aopOrder_Sent_For_Aop');
                                                const received = getBreakdownValue(cb, 'aopOrder_Received_From_Aop');
                                                const loss = sent > 0 ? (((sent - received) / sent) * 100) : 0;
                                                return <div key={j} className={`px-3 py-2 subrow-cell`}>{sent === 0 || isNaN(loss) ? "_" : `${loss.toFixed(2)}%`}</div>;
                                            })}
                                        </div>
                                    </td>

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'reProcessOrder_Sent_for_Re_Process', num: 35 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'reProcessOrder_Return_Received', num: 36 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'reProcessOrder_Received_After_Re_Process_Grey', num: 37 })}

                                    {BreakDownCell({ compBreakdown, CELL_BG: CELL_BG, BORDER_COLOR: BORDER_COLOR, UNFROZEN_WIDTH: UNFROZEN_WIDTH, formatNumber: formatNumber, key: 'reProcessOrder_Received_After_Re_Process_Finish', num: 38 })}

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {compBreakdown.map((cb, j) => {
                                                if (cb?.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;
                                                const sent = getBreakdownValue(cb, 'reProcessOrder_Sent_for_Re_Process');
                                                const receivedGrey = getBreakdownValue(cb, 'reProcessOrder_Received_After_Re_Process_Grey');
                                                const receivedFinish = getBreakdownValue(cb, 'reProcessOrder_Received_After_Re_Process_Finish');
                                                const diff = (receivedGrey + receivedFinish) - sent;
                                                const isExceeded = diff > 0;
                                                return (
                                                    <div key={j} className={`px-3 py-2 subrow-cell ${isExceeded ? "text-green-600 font-bold" : "font-bold text-red-600"}`}>
                                                        {(sent === 0 && receivedGrey === 0 && receivedFinish === 0) || isNaN(diff) ? "_" : (isExceeded ? `(${diff.toFixed(2)})` : Math.abs(diff).toFixed(2))}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>

                                    <td className="p-0 align-top" style={getFormulaCellStyle()}>
                                        <div className="divide-y divide-[#14b8a6]">
                                            {compBreakdown.map((cb, j) => {
                                                if (cb?.status) return <div key={j} className={`px-3 py-2 subrow-cell text-gray-400`}>_</div>;
                                                const sent = getBreakdownValue(cb, 'reProcessOrder_Sent_for_Re_Process');
                                                const receivedGrey = getBreakdownValue(cb, 'reProcessOrder_Received_After_Re_Process_Grey');
                                                const receivedFinish = getBreakdownValue(cb, 'reProcessOrder_Received_After_Re_Process_Finish');
                                                const loss = sent > 0 ? (((sent - (receivedGrey + receivedFinish)) / sent) * 100) : 0;
                                                return <div key={j} className={`px-3 py-2 subrow-cell`}>{sent === 0 || isNaN(loss) ? "_" : `${loss.toFixed(2)}%`}</div>;
                                            })}
                                        </div>
                                    </td>

                                </tr>
                            );
                        })}

                        {!isLoading.refreshLoading && paginatedData.length === 0 && (
                            <tr>
                                <td colSpan={COLUMNS.length + 1} className="px-6 py-12 text-center text-gray-400 text-sm">
                                    {/* sticky: the message stays in the visible part of the table (the table is very wide) */}
                                    <div style={{ position: 'sticky', left: 0, width: fit.width }}>
                                        {loadError ? (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#b91c1c' }}>
                                                {loadError}
                                                <button
                                                    onClick={retryLoad}
                                                    style={{ background: '#0d9488', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '5px 12px' }}
                                                >
                                                    Retry
                                                </button>
                                            </span>
                                        ) : "No rows match the active filters."}
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>

                    {!isLoading.refreshLoading && filteredData.length > 0 && !isAnyModalOpen && (
                        <tfoot>
                            <tr>
                                <td
                                    colSpan={FROZEN_COUNT + 1}
                                    style={{
                                        position: 'sticky',
                                        bottom: 0,
                                        left: '0px',
                                        backgroundColor: HEADER_BG,
                                        color: '#1f2937',
                                        borderRight: `1px solid ${BORDER_COLOR}`,
                                        borderTop: `2px solid ${BORDER_COLOR}`,
                                        borderBottom: `1px solid ${BORDER_COLOR}`,
                                        borderBottomLeftRadius: '14px',
                                        zIndex: 65,
                                        textAlign: 'center',
                                        fontWeight: 700,
                                        fontSize: '0.8rem',
                                        whiteSpace: 'nowrap',
                                        padding: '10px 8px',
                                    }}
                                >
                                    TOTAL
                                </td>
                                {COLUMNS.slice(FROZEN_COUNT).map((_, idx) => {
                                    const colIndex = idx + FROZEN_COUNT;
                                    let displayValue = "";

                                    if (!NO_TOTAL_COLUMN_INDEXES.has(colIndex)) {
                                        const sum = formatNumber(totals[colIndex]);
                                        displayValue = (sum !== "_" && PERCENT_COLUMN_INDEXES.has(colIndex)) ? `${sum}%` : sum;
                                    }

                                    return (
                                        <td
                                            key={`footer-${colIndex}`}
                                            style={{
                                                position: 'sticky',
                                                bottom: 0,
                                                backgroundColor: HEADER_BG,
                                                color: '#1f2937',
                                                borderRight: `1px solid ${BORDER_COLOR}`,
                                                borderTop: `2px solid ${BORDER_COLOR}`,
                                                borderBottom: `1px solid ${BORDER_COLOR}`,
                                                borderBottomRightRadius: colIndex === COLUMNS.length - 1 ? '14px' : 0,
                                                zIndex: 55,
                                                textAlign: 'center',
                                                fontWeight: 700,
                                                fontSize: '0.8rem',
                                                whiteSpace: 'nowrap',
                                                padding: '10px 8px',
                                                width: `${UNFROZEN_WIDTH}px`,
                                                minWidth: `${UNFROZEN_WIDTH}px`,
                                                maxWidth: `${UNFROZEN_WIDTH}px`,
                                            }}
                                        >
                                            {displayValue}
                                        </td>
                                    );
                                })}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Scroll loading status (replaces the old page buttons) */}
            {!isLoading.refreshLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, minHeight: 24, fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', flexWrap: 'wrap' }}>
                    {loadingMore && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#0d9488', fontWeight: 600 }}>
                            <Loader size={16} className="animate-spin" /> Loading more jobs...
                        </span>
                    )}
                    {!loadingMore && loadError && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#b91c1c' }}>
                            {loadError}
                            <button
                                onClick={retryLoad}
                                style={{ background: '#0d9488', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '5px 12px' }}
                            >
                                Retry
                            </button>
                        </span>
                    )}
                    {!loadingMore && !loadError && capReached && (
                        <span style={{ color: '#b45309', fontWeight: 800 }}>
                            Showing the first {filteredData.length} jobs. More data exists: use the column filters to narrow it down.
                        </span>
                    )}
                    {!loadingMore && !loadError && !capReached && hasMore && (
                        <span style={{ opacity: 0.7 }}>
                            {filteredData.length} jobs loaded. Scroll down to load more.
                        </span>
                    )}
                    {!loadingMore && !loadError && !hasMore && filteredData.length > 0 && (
                        <span style={{ opacity: 0.7 }}>
                            All {filteredData.length} jobs loaded
                        </span>
                    )}
                </div>
            )}
        </DashboardLayout>
    );
}