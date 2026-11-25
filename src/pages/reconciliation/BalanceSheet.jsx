import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";
import { useSocket } from "../../hooks/socketProvider/SocketContext";

// --- Helpers ---
const yarnBalance = (row) => (row.knittingGrey || 0) + (row.yarnReturn || 0) - (row.issue || 0);
const dyeBalance = (d) => (d.greyRcvd || 0) + (d.greyReturn || 0) - (d.greyDelivery || 0);
const dyeProcessLoss = (d) => {
    const received = d.greyRcvd || 0;
    if (!received) return null;
    return (received - (d.finishRcvd || 0)) / received;
};

const aopBalance = (a) => (a.receivedFromAop || 0) + (a.returnFromAop || 0) - (a.sentForAop || 0);
const aopProcessLoss = (a) => {
    const received = a.receivedFromAop || 0;
    if (!received) return null;
    return (received - (a.aopFinishRcvd || 0)) / received;
};

const fmtNum = (n) => {
    if (n === null || n === undefined) return <span className="text-slate-300">—</span>;
    if (n === 0) return <span className="text-slate-300">0</span>;
    const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n < 0) return <span className="text-rose-600 font-medium">({abs})</span>;
    return abs;
};

const fmtPct = (n) => (n === null || n === undefined ? <span className="text-slate-300">—</span> : `${(n * 100).toFixed(2)}%`);
const fmtT = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });
const lossText = (received, finish) => (received ? `${(((received - finish) / received) * 100).toFixed(2)}%` : "—");

// --- Column Definitions ---
const COLUMNS = [
    { id: "jobNo", label: "Job No", width: 120, group: "yarn" },
    { id: "bookingQty", label: "Yarn Booking Qty", width: 100, group: "yarn" },
    { id: "yarnFactory", label: "Factory Name", width: 150, group: "yarn" },
    { id: "yarnReq", label: "Work Order Qty", width: 90, group: "yarn" },
    { id: "yarnIssue", label: "Yarn Issue", width: 90, group: "yarn" },
    { id: "knittingGrey", label: "Knitting Greige", width: 100, group: "yarn" },
    { id: "yarnReturn", label: "Yarn Return", width: 95, group: "yarn" },
    { id: "yarnBalance", label: "Balance", width: 85, group: "yarn" },

    { id: "dyeingFactory", label: "Dyeing Factory", width: 130, group: "dyeing" },
    { id: "greyDelivery", label: "Greige Delivery", width: 90, group: "dyeing" },
    { id: "greyReturn", label: "Greige Return", width: 90, group: "dyeing" },
    { id: "greyRcvd", label: "Greige Rcvd", width: 85, group: "dyeing" },
    { id: "finishRcvd", label: "Finish Rcvd", width: 90, group: "dyeing" },
    { id: "dyeBalance", label: "Balance", width: 85, group: "dyeing" },
    { id: "processLoss", label: "Process Loss", width: 85, group: "dyeing" },

    { id: "aopFactory", label: "AOP Factory", width: 130, group: "aop" },
    { id: "sentForAop", label: "Sent For AOP", width: 90, group: "aop" },
    { id: "returnFromAop", label: "Return From AOP", width: 95, group: "aop" },
    { id: "receivedFromAop", label: "Rcvd From AOP", width: 90, group: "aop" },
    { id: "aopFinishRcvd", label: "AOP Finish Rcvd", width: 90, group: "aop" },
    { id: "aopBalance", label: "Balance", width: 85, group: "aop" },
    { id: "aopProcessLoss", label: "Process Loss", width: 85, group: "aop" },

    { id: "remarks", label: "Remarks", width: 140, group: "remarks" },
];

const FROZEN_IDS = ["jobNo", "bookingQty", "yarnFactory", "yarnReq", "yarnIssue", "knittingGrey", "yarnReturn", "yarnBalance"];

let acc = 0;
const COL_LEFT = {};
COLUMNS.forEach((c) => {
    COL_LEFT[c.id] = acc;
    acc += c.width;
});
const TOTAL_WIDTH = acc;

const GROUP_HEADER_ROW_HEIGHT = 33;
const FROZEN_DIVIDER_SHADOW = "inset -1px 0 0 0 #64748b";

/* ===== SERVER PAGING + AUTO-FIT CONFIG ===== */
const PAGE_SIZE = 30;                 // jobs loaded from the server per request
const EXPORT_PAGE_SIZE = 100;         // jobs per request while exporting (backend max is 100)
const SEARCH_DEBOUNCE_MS = 400;       // wait after typing before the database search is sent
const LOAD_MORE_DISTANCE = 400;       // start loading when less than this many px are left below
const MIN_TABLE_HEIGHT = 300;
const BOTTOM_RESERVE = 60;
const FIT_DEBUG = false;
const FILTER_POPUP_WIDTH = 192;
const FILTER_POPUP_GAP = 6;
const FILTER_POPUP_MARGIN = 8;

const getZoomScale = (el) => {
    if (!el) return 1;
    const rect = el.getBoundingClientRect();
    const w = el.offsetWidth;
    if (!w || !rect.width) return 1;
    const scale = rect.width / w;
    return scale > 0.2 && scale < 5 ? scale : 1;
};

const positionPopupUnderButton = (btn, pop) => {
    if (!btn || !pop) return;
    for (let i = 0; i < 5; i++) {
        const b = btn.getBoundingClientRect();
        const p = pop.getBoundingClientRect();
        if (!p.width || !p.height) return;

        const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
        const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;

        let wantLeft = b.left + b.width / 2 - p.width / 2;
        wantLeft = Math.max(FILTER_POPUP_MARGIN, Math.min(wantLeft, vw - p.width - FILTER_POPUP_MARGIN));

        let wantTop = b.bottom + FILTER_POPUP_GAP;
        if (wantTop + p.height > vh - FILTER_POPUP_MARGIN) {
            const above = b.top - p.height - FILTER_POPUP_GAP;
            wantTop = above > FILTER_POPUP_MARGIN ? above : Math.max(FILTER_POPUP_MARGIN, vh - p.height - FILTER_POPUP_MARGIN);
        }

        const dx = wantLeft - p.left;
        const dy = wantTop - p.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;

        const ratio = pop.offsetWidth ? p.width / pop.offsetWidth : 1;
        const s = ratio > 0.2 && ratio < 5 ? ratio : 1;
        const curLeft = parseFloat(pop.style.left) || 0;
        const curTop = parseFloat(pop.style.top) || 0;
        pop.style.left = `${curLeft + dx / s}px`;
        pop.style.top = `${curTop + dy / s}px`;
    }
    pop.style.visibility = "visible";
};
/* ===== END CONFIG ===== */

// --- Lazy ExcelJS loader from CDN ---
const EXCELJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
let excelJsPromise = null;
const loadExcelJS = () => {
    if (typeof window !== "undefined" && window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (excelJsPromise) return excelJsPromise;
    excelJsPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = EXCELJS_CDN;
        s.async = true;
        s.onload = () => {
            if (window.ExcelJS) resolve(window.ExcelJS);
            else reject(new Error("ExcelJS failed to attach to window"));
        };
        s.onerror = () => reject(new Error("Failed to load ExcelJS from CDN"));
        document.head.appendChild(s);
    });
    return excelJsPromise;
};

/* ===== DATA: server response -> table rows ===== */

// One job from the API (dyeingRows + deliveryTypeTotals) -> yarnRows / dyeingRows / aopRows
const transformJob = (job) => {
    const yarnRows = [];
    const dyeingRows = [];
    const aopRows = [];

    (job.dyeingRows || []).forEach((row) => {
        const dt = row.deliveryTypeTotals || {};

        const hasYarn = dt["Yarn Delivery"] || dt["Yarn Return"] || dt["Grey Fabric Received"];

        const hasDyeing =
            dt["Grey Delivery"] ||
            dt["Grey Received"] ||
            dt["Finish Received"] ||
            dt["Grey Return"] ||
            dt["Received From Compacting"] ||
            dt["Received From Reprocess"] ||
            dt["Received From HEAT Set"];

        const hasAop =
            dt["Sent For Aop"] ||
            dt["Received From Aop"] ||
            dt["AOP Finish Fabric Rcvd"] ||
            dt["Return From Aop"];

        // A factory with a work order but no deliveries yet is kept in the Yarn table
        const hasNothing = !hasYarn && !hasDyeing && !hasAop;

        if (hasYarn || hasNothing) {
            yarnRows.push({
                factory: row.factoryName,
                req: row.workOrderQty || 0,
                issue: dt["Yarn Delivery"] || 0,
                knittingGrey: dt["Grey Fabric Received"] || 0,
                yarnReturn: dt["Yarn Return"] || 0,
            });
        }

        if (hasDyeing) {
            dyeingRows.push({
                factoryName: row.factoryName,
                greyDelivery: dt["Grey Delivery"] || 0,
                greyRcvd: dt["Grey Received"] || 0,
                finishRcvd: dt["Finish Received"] || 0,
                greyReturn: dt["Grey Return"] || 0,
                receivedFromCompacting: dt["Received From Compacting"] || 0,
                receivedFromReprocess: dt["Received From Reprocess"] || 0,
                receivedFromHeatSet: dt["Received From HEAT Set"] || 0,
            });
        }

        if (hasAop) {
            aopRows.push({
                factoryName: row.factoryName,
                sentForAop: dt["Sent For Aop"] || 0,
                receivedFromAop: dt["Received From Aop"] || 0,
                aopFinishRcvd: dt["AOP Finish Fabric Rcvd"] || 0,
                returnFromAop: dt["Return From Aop"] || 0,
            });
        }
    });

    if (yarnRows.length === 0 && dyeingRows.length === 0 && aopRows.length === 0) {
        yarnRows.push({
            factory: "N/A",
            req: job.totalWorkOrderQty || 0,
            issue: 0,
            knittingGrey: 0,
            yarnReturn: 0,
        });
    }

    return {
        ...job,
        bookingQty: job.bookingQty || 0,
        yarnRows,
        dyeingRows,
        aopRows,
        remarks: job.remarks || "",
    };
};

// Column filters (the Excel-like filter popups). They filter the jobs that are already loaded.
const ROW_FILTERS = {
    yarnRows: {
        yarnFactory: (r) => String(r.factory ?? ""),
        yarnReq: (r) => String(r.req ?? ""),
        yarnIssue: (r) => String(r.issue ?? ""),
        knittingGrey: (r) => String(r.knittingGrey ?? ""),
        yarnReturn: (r) => String(r.yarnReturn ?? ""),
        yarnBalance: (r) => String(yarnBalance(r) ?? ""),
    },
    dyeingRows: {
        dyeingFactory: (r) => String(r.factoryName ?? ""),
        greyDelivery: (r) => String(r.greyDelivery ?? ""),
        greyReturn: (r) => String(r.greyReturn ?? ""),
        greyRcvd: (r) => String(r.greyRcvd ?? ""),
        finishRcvd: (r) => String(r.finishRcvd ?? ""),
        dyeBalance: (r) => String(dyeBalance(r) ?? ""),
        processLoss: (r) => String(dyeProcessLoss(r) ?? ""),
    },
    aopRows: {
        aopFactory: (r) => String(r.factoryName ?? ""),
        sentForAop: (r) => String(r.sentForAop ?? ""),
        returnFromAop: (r) => String(r.returnFromAop ?? ""),
        receivedFromAop: (r) => String(r.receivedFromAop ?? ""),
        aopFinishRcvd: (r) => String(r.aopFinishRcvd ?? ""),
        aopBalance: (r) => String(aopBalance(r) ?? ""),
        aopProcessLoss: (r) => String(aopProcessLoss(r) ?? ""),
    },
};

const COL_TO_GROUP = {};
Object.entries(ROW_FILTERS).forEach(([group, getters]) => {
    Object.keys(getters).forEach((colId) => { COL_TO_GROUP[colId] = group; });
});

const filterRows = (rows, group, colFilters) =>
    rows.filter((row) => {
        for (const [colId, get] of Object.entries(ROW_FILTERS[group])) {
            const excluded = colFilters[colId];
            if (excluded && excluded.size > 0 && excluded.has(get(row))) return false;
        }
        return true;
    });

// returns the job with column filters applied, or null if the job is hidden by a job-level filter (Booking Qty / Remarks)
const prepareJob = (job, colFilters) => {
    const remarksEx = colFilters.remarks;
    if (remarksEx && remarksEx.size > 0 && remarksEx.has(job.remarks || "")) return null;
    const bookingEx = colFilters.bookingQty;
    if (bookingEx && bookingEx.size > 0 && bookingEx.has(String(job.bookingQty ?? 0))) return null;
    const hasAny = Object.values(colFilters).some((s) => s && s.size > 0);
    if (!hasAny) return job;
    return {
        ...job,
        yarnRows: filterRows(job.yarnRows, "yarnRows", colFilters),
        dyeingRows: filterRows(job.dyeingRows, "dyeingRows", colFilters),
        aopRows: filterRows(job.aopRows, "aopRows", colFilters),
    };
};

const computeTotals = (jobList) => {
    const t = {
        booking: 0,
        req: 0, issue: 0, knittingGrey: 0, yarnReturn: 0, yarnBal: 0,
        greyDelivery: 0, greyReturn: 0, greyRcvd: 0, dyeBal: 0, finishRcvd: 0,
        sentForAop: 0, returnFromAop: 0, receivedFromAop: 0, aopFinishRcvd: 0, aopBal: 0,
    };
    jobList.forEach((job) => {
        t.booking += job.bookingQty || 0;
        job.yarnRows.forEach((row) => {
            t.req += row.req || 0;
            t.issue += row.issue || 0;
            t.knittingGrey += row.knittingGrey || 0;
            t.yarnReturn += row.yarnReturn || 0;
            t.yarnBal += yarnBalance(row);
        });
        job.dyeingRows.forEach((row) => {
            t.greyDelivery += row.greyDelivery || 0;
            t.greyReturn += row.greyReturn || 0;
            t.greyRcvd += row.greyRcvd || 0;
            t.dyeBal += dyeBalance(row);
            t.finishRcvd += row.finishRcvd || 0;
        });
        job.aopRows.forEach((row) => {
            t.sentForAop += row.sentForAop || 0;
            t.returnFromAop += row.returnFromAop || 0;
            t.receivedFromAop += row.receivedFromAop || 0;
            t.aopFinishRcvd += row.aopFinishRcvd || 0;
            t.aopBal += aopBalance(row);
        });
    });
    return t;
};

// One API call = one page of jobs from the database (search is done by the backend)
const fetchJobsPage = (axiosSecure, { search, page, limit, requestId, signal }) =>
    axiosSecure.get("/api/balance/sheet", {
        params: { search, page, limit, ...(requestId ? { requestId } : {}) },
        signal,
    });

const isCanceled = (err) => err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError";

// --- Filter Component ---
const ExcelFilter = ({ colId, allJobs, excluded, setExcluded, openCol, setOpenCol, valueGetter }) => {
    const isOpen = openCol === colId;
    const isActive = excluded.size > 0;

    const btnRef = useRef(null);
    const popRef = useRef(null);

    const uniqueValues = useMemo(() => {
        if (!isOpen) return [];
        const set = new Set();
        allJobs.forEach((j) => {
            const values = valueGetter ? valueGetter(j) : [];
            values.forEach((v) => { if (v !== "" && v != null) set.add(String(v)); });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [isOpen, allJobs, valueGetter]);

    const place = useCallback(() => {
        positionPopupUnderButton(btnRef.current, popRef.current);
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) return;
        place();
    }, [isOpen, uniqueValues, place]);

    useLayoutEffect(() => {
        if (!isOpen) return;
        window.addEventListener("scroll", place, true);
        window.addEventListener("resize", place);
        return () => {
            window.removeEventListener("scroll", place, true);
            window.removeEventListener("resize", place);
        };
    }, [isOpen, place]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => { if (e.key === "Escape") setOpenCol(null); };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen, setOpenCol]);

    const toggleValue = (val) => {
        const next = new Set(excluded);
        next.has(val) ? next.delete(val) : next.add(val);
        setExcluded(colId, next);
    };

    const toggleAll = () => setExcluded(colId, excluded.size > 0 ? new Set() : new Set(uniqueValues));

    return (
        <span className="relative inline-block">
            <button
                ref={btnRef}
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpenCol(isOpen ? null : colId); }}
                className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded shrink-0 transition-colors ${isActive ? "bg-amber-400 text-[#dfebf0]" : "bg-white/20 text-white hover:bg-white/30"}`}
                title="Filter this column"
            >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                    <path d="M2 3.5A.5.5 0 012.5 3h15a.5.5 0 01.4.8l-5.9 7.4v4.3a.5.5 0 01-.7.46l-3-1.2a.5.5 0 01-.3-.46v-3.1L2.1 3.8A.5.5 0 012 3.5z" />
                </svg>
            </button>

            {isOpen && createPortal(
                <div
                    ref={popRef}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white border border-slate-300 rounded-md shadow-lg p-2 normal-case font-normal text-slate-700"
                    style={{
                        position: "fixed",
                        left: 0,
                        top: 0,
                        width: FILTER_POPUP_WIDTH,
                        zIndex: 99999,
                        visibility: "hidden",
                    }}
                >
                    <label className="flex items-center gap-2 px-1 py-1 text-xs font-medium border-b border-slate-200 mb-1 cursor-pointer hover:bg-slate-50 rounded">
                        <input type="checkbox" checked={excluded.size === 0} onChange={toggleAll} className="rounded border-slate-300 text-[#dfebf0] focus:ring-[#dfebf0]" />
                        Select All
                    </label>
                    <div className="max-h-44 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                        {uniqueValues.map((val) => (
                            <label key={val} className="flex items-center gap-2 px-1 py-1 text-xs cursor-pointer hover:bg-slate-50 rounded">
                                <input type="checkbox" checked={!excluded.has(val)} onChange={() => toggleValue(val)} className="rounded border-slate-300 text-[#dfebf0] focus:ring-[#dfebf0]" />
                                <span className="truncate">{val}</span>
                            </label>
                        ))}
                        {uniqueValues.length === 0 && <div className="px-1 py-2 text-xs text-slate-400 text-center">No values</div>}
                    </div>
                    <div className="flex justify-between mt-2 pt-2 border-t border-slate-200">
                        <button onClick={() => setExcluded(colId, new Set())} className="text-[11px] text-slate-500 hover:text-slate-800 font-medium">Clear</button>
                        <button onClick={() => setOpenCol(null)} className="text-[11px] font-bold text-[#dfebf0] hover:underline">OK</button>
                    </div>
                </div>,
                document.body
            )}
        </span>
    );
};

// --- Excel border presets (ExcelJS) ---
const EXCEL_THIN_BORDER = {
    top: { style: "thin", color: { argb: "FF94A3B8" } },
    left: { style: "thin", color: { argb: "FF94A3B8" } },
    bottom: { style: "thin", color: { argb: "FF94A3B8" } },
    right: { style: "thin", color: { argb: "FF94A3B8" } },
};
const EXCEL_YARN_SEPARATOR_BORDER = {
    ...EXCEL_THIN_BORDER,
    right: { style: "medium", color: { argb: "FF64748B" } },
};

// --- Main Component ---
const BalanceSheet = () => {
    const [jobs, setJobs] = useState([]);                 // jobs loaded from the server so far
    const [search, setSearch] = useState("");             // what the user types
    const [appliedSearch, setAppliedSearch] = useState(""); // debounced value that is sent to the database
    const [colFilters, setColFilters] = useState({});
    const [openCol, setOpenCol] = useState(null);
    const [hasUnsavedRemarks, setHasUnsavedRemarks] = useState(false);
    const [wrapText, setWrapText] = useState(false);
    const [editingCell, setEditingCell] = useState(null);
    const [isLoading, setIsLoading] = useState(true);     // first page / new search / refresh
    const [isExporting, setIsExporting] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // --- Server paging state ---
    const [hasMore, setHasMore] = useState(false);
    const [totalJobs, setTotalJobs] = useState(0);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [loadMoreError, setLoadMoreError] = useState(false);
    const pageRef = useRef(0);                 // last page loaded
    const hasMoreRef = useRef(false);
    const loadingMoreRef = useRef(false);
    const isLoadingRef = useRef(true);
    const generationRef = useRef(0);           // changes on every new search / refresh, so old responses are ignored
    const searchRef = useRef("");

    // --- Loading progress state ---
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState("Initializing...");

    /* ===== AUTO-FIT STATE ===== */
    const scrollRef = useRef(null);
    const topRef = useRef(null);
    const [fit, setFit] = useState({ height: 560 });
    /* ========================== */

    const socket = useSocket();
    const axiosSecure = useAxiosPrivate();

    const setExcludedFor = (colId, set) => setColFilters((prev) => ({ ...prev, [colId]: set }));

    const updateRemarks = (jobIdx, text) => {
        setJobs((prev) => prev.map((j, i) => (i === jobIdx ? { ...j, remarks: text } : j)));
        setHasUnsavedRemarks(true);
    };

    const handleSaveRemarks = () => {
        setHasUnsavedRemarks(false);
        setEditingCell(null);
    };

    const handleDoubleClick = (jobIdx) => {
        setEditingCell(jobIdx);
    };

    // Refresh = load again from the server ONLY the current search (page 1). Column filters stay.
    const handleRefresh = () => {
        if (isLoading) return;
        setHasUnsavedRemarks(false);
        setEditingCell(null);
        setOpenCol(null);
        setRefreshKey((k) => k + 1);
    };

    const hasFilters = search || Object.values(colFilters).some((s) => s && s.size > 0);

    // Search box -> database search after the user stops typing
    useEffect(() => {
        const t = setTimeout(() => setAppliedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        searchRef.current = appliedSearch;
    }, [appliedSearch]);

    // Search is done by the server. Here only the column filters (Excel-like popups) are applied to the loaded jobs.
    const filteredJobs = useMemo(() => {
        return jobs
            .map((job, idx) => {
                const prepared = prepareJob(job, colFilters);
                return prepared ? { job: prepared, idx } : null;
            })
            .filter(Boolean);
    }, [jobs, colFilters]);

    /* ===== LAZY LOADING FROM THE SERVER ===== */
    const loadMoreFromServer = useCallback(async () => {
        if (loadingMoreRef.current || isLoadingRef.current || !hasMoreRef.current) return;

        loadingMoreRef.current = true;
        setLoadingMore(true);
        setLoadMoreError(false);

        const generation = generationRef.current;
        const nextPage = pageRef.current + 1;

        try {
            const { data } = await fetchJobsPage(axiosSecure, {
                search: searchRef.current,
                page: nextPage,
                limit: PAGE_SIZE,
            });

            if (generation !== generationRef.current) return; // a new search / refresh started meanwhile

            const newJobs = (data.jobs || []).map(transformJob);
            setJobs((prev) => {
                const seen = new Set(prev.map((j) => j.jobNo));
                return [...prev, ...newJobs.filter((j) => !seen.has(j.jobNo))];
            });

            pageRef.current = nextPage;
            const more = !!data.pagination?.hasMore;
            hasMoreRef.current = more;
            setHasMore(more);
        } catch (error) {
            if (isCanceled(error) || generation !== generationRef.current) return;
            console.error("[BalanceSheet] Load more failed:", error);
            hasMoreRef.current = false; // stop the auto loading, the user can press Retry
            setLoadMoreError(true);
        } finally {
            if (generation === generationRef.current) {
                loadingMoreRef.current = false;
                setLoadingMore(false);
            }
        }
    }, [axiosSecure]);

    const maybeLoadMore = useCallback(() => {
        const el = scrollRef.current;
        if (!el || loadingMoreRef.current || isLoadingRef.current || !hasMoreRef.current) return;
        // load the next page when less than ~LOAD_MORE_DISTANCE px are left below the visible area
        if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_MORE_DISTANCE) return;
        loadMoreFromServer();
    }, [loadMoreFromServer]);

    const handleRetryLoadMore = () => {
        hasMoreRef.current = true;
        setLoadMoreError(false);
        loadMoreFromServer();
    };

    // content shorter than the box (big screen, column filter hides rows ...): keep loading until it is filled
    useEffect(() => {
        maybeLoadMore();
    }, [jobs.length, filteredJobs.length, fit.height, isLoading, hasMore, loadingMore, maybeLoadMore]);

    // column filter changed: back to the top of the table
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [colFilters]);
    /* ======================================== */

    /* ===== AUTO-FIT MEASURING ===== */
    const measureFit = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const viewH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        const scale = getZoomScale(el);
        const rect = el.getBoundingClientRect();

        let scrolled = window.scrollY || 0;
        let node = el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            if (node.scrollTop) scrolled += node.scrollTop * scale;
            node = node.parentElement;
        }
        const visualTop = rect.top + scrolled;

        const height = Math.max(MIN_TABLE_HEIGHT, Math.floor((viewH - visualTop) / scale - BOTTOM_RESERVE));
        if (FIT_DEBUG) console.log('[BalanceSheet fit]', { viewH, scale, visualTop, reserve: BOTTOM_RESERVE, height });
        setFit((prev) => (prev.height === height ? prev : { height }));
    }, []);

    useLayoutEffect(() => {
        measureFit();
        const t1 = setTimeout(measureFit, 100);
        const t2 = setTimeout(measureFit, 500);
        const t3 = setTimeout(measureFit, 1500);
        window.addEventListener('resize', measureFit);
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
            if (scrollRef.current) ro.observe(scrollRef.current);
            ro.observe(document.documentElement);
            ro.observe(document.body);
        }
        return () => {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
            clearInterval(poll);
            if (mo) mo.disconnect();
            window.removeEventListener('resize', measureFit);
            window.removeEventListener('load', measureFit);
            if (window.visualViewport) window.visualViewport.removeEventListener('resize', measureFit);
            if (ro) ro.disconnect();
        };
    }, [measureFit]);
    /* =============================== */

    // Subtotal of the jobs that are loaded and visible
    const totals = useMemo(() => computeTotals(filteredJobs.map((f) => f.job)), [filteredJobs]);

    const clearAll = () => {
        setSearch("");
        setAppliedSearch("");
        setColFilters({});
        setOpenCol(null);
    };

    // Export needs ALL jobs of the current search, not only the loaded ones: read every page from the server
    const fetchAllJobsForExport = async () => {
        const all = [];
        let page = 1;
        let more = true;
        while (more && page <= 500) {
            const { data } = await fetchJobsPage(axiosSecure, { search: appliedSearch, page, limit: EXPORT_PAGE_SIZE });
            all.push(...(data.jobs || []).map(transformJob));
            more = !!data.pagination?.hasMore;
            page += 1;
        }
        return all;
    };

    // ---------- EXCEL EXPORT ----------
    const exportExcel = async () => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            const ExcelJS = await loadExcelJS();

            // all jobs of the current search + the column filters + the remarks typed on screen
            const remarksMap = new Map(jobs.map((j) => [j.jobNo, j.remarks]));
            const allJobs = await fetchAllJobsForExport();
            const exportJobs = allJobs
                .map((j) => prepareJob({ ...j, remarks: remarksMap.get(j.jobNo) ?? j.remarks ?? "" }, colFilters))
                .filter(Boolean);
            const exportTotals = computeTotals(exportJobs);

            const wb = new ExcelJS.Workbook();
            wb.creator = "Balance Sheet";
            wb.created = new Date();

            const ws = wb.addWorksheet("Balance Sheet", {
                views: [{
                    state: "frozen",
                    xSplit: FROZEN_IDS.length,
                    ySplit: 2,
                    activeCell: "I3"
                }],
                pageSetup: {
                    orientation: "landscape",
                    fitToPage: true,
                    fitToWidth: 1,
                    fitToHeight: 0,
                    paperSize: 9,
                    margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 }
                }
            });

            COLUMNS.forEach((col, i) => {
                ws.getColumn(i + 1).width = Math.max(9, Math.round(col.width / 7));
            });

            const isTextCol = (id) =>
                id === "jobNo" || id === "yarnFactory" || id === "dyeingFactory" ||
                id === "aopFactory" || id === "remarks";

            const groupFillFor = (group) => {
                if (group === "dyeing") return "FFF0FDFA";
                if (group === "aop") return "FFF5F3FF";
                return "FFFFFFFF";
            };

            const BOOKING_COL = COLUMNS.findIndex((c) => c.id === "bookingQty") + 1; // 2
            const REMARKS_COL = COLUMNS.length;                                     // 23

            // Row 1 — Group headers: YARN = columns 1-8, DYEING = 9-15, AOP = 16-22, REMARKS = 23
            const groupHeaderRow = ws.addRow([
                "YARN / KNITTING", "", "", "", "", "", "", "",
                "DYEING", "", "", "", "", "", "",
                "AOP", "", "", "", "", "", "",
                
            ]);
            groupHeaderRow.height = 22;
            ws.mergeCells(1, 1, 1, 8);
            ws.mergeCells(1, 9, 1, 15);
            ws.mergeCells(1, 16, 1, 22);

            groupHeaderRow.eachCell({ includeEmpty: true }, (cell) => {
                cell.font = { bold: true, size: 11, color: { argb: "FF0F2544" } };
                cell.alignment = { horizontal: "center", vertical: "middle" };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
                cell.border = EXCEL_THIN_BORDER;
            });

            // Row 2 — Column headers
            const headerRow = ws.addRow(COLUMNS.map((c) => c.label));
            headerRow.height = 26;
            headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const col = COLUMNS[colNumber - 1];
                const textLeft = isTextCol(col.id);
                cell.font = { bold: true, size: 10, color: { argb: "FF0F2544" } };
                cell.alignment = { horizontal: textLeft ? "left" : "right", vertical: "middle", wrapText: true };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
                cell.border = EXCEL_THIN_BORDER;
            });

            // Data rows
            exportJobs.forEach((job) => {
                const maxRows = Math.max(job.yarnRows.length, job.dyeingRows.length, job.aopRows.length, 1);
                const jobStartRow = ws.rowCount + 1;

                for (let i = 0; i < maxRows; i++) {
                    const yRow = job.yarnRows[i];
                    const dRow = job.dyeingRows[i];
                    const aRow = job.aopRows[i];

                    // Same order as COLUMNS
                    const cells = [
                        i === 0 ? (job.jobNo ?? "") : "",
                        i === 0 ? (job.bookingQty ?? 0) : "",
                        yRow ? (yRow.factory ?? "") : "",
                        yRow ? (yRow.req ?? 0) : "",
                        yRow ? (yRow.issue ?? 0) : "",
                        yRow ? (yRow.knittingGrey ?? 0) : "",
                        yRow ? (yRow.yarnReturn ?? 0) : "",
                        yRow ? yarnBalance(yRow) : "",

                        dRow ? (dRow.factoryName ?? "") : "",
                        dRow ? (dRow.greyDelivery ?? 0) : "",
                        dRow ? (dRow.greyReturn ?? 0) : "",
                        dRow ? (dRow.greyRcvd ?? 0) : "",
                        dRow ? (dRow.finishRcvd ?? 0) : "",
                        dRow ? dyeBalance(dRow) : "",
                        dRow ? (dyeProcessLoss(dRow) ?? "") : "",

                        aRow ? (aRow.factoryName ?? "") : "",
                        aRow ? (aRow.sentForAop ?? 0) : "",
                        aRow ? (aRow.returnFromAop ?? 0) : "",
                        aRow ? (aRow.receivedFromAop ?? 0) : "",
                        aRow ? (aRow.aopFinishRcvd ?? 0) : "",
                        aRow ? aopBalance(aRow) : "",
                        aRow ? (aopProcessLoss(aRow) ?? "") : "",

                        i === 0 ? (job.remarks ?? "") : ""
                    ];

                    const row = ws.addRow(cells);
                    row.height = 20;

                    COLUMNS.forEach((col, idx) => {
                        const cell = row.getCell(idx + 1);
                        const textLeft = isTextCol(col.id);
                        const isPct = col.id === "processLoss" || col.id === "aopProcessLoss";

                        cell.border = col.id === "yarnBalance" ? EXCEL_YARN_SEPARATOR_BORDER : EXCEL_THIN_BORDER;
                        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: groupFillFor(col.group) } };

                        if (isPct) {
                            cell.numFmt = "0.00%";
                            cell.alignment = { horizontal: "right", vertical: "middle" };
                        } else if (textLeft) {
                            cell.alignment = {
                                horizontal: col.id === "jobNo" ? "center" : "left",
                                vertical: "middle",
                                wrapText: col.id === "remarks"
                            };
                        } else {
                            cell.numFmt = "#,##0.00";
                            cell.alignment = { horizontal: "right", vertical: "middle" };
                        }
                    });
                }

                const jobEndRow = ws.rowCount;

                // Merge Job No, Booking Qty and Remarks across this job's rows
                if (jobEndRow > jobStartRow) {
                    ws.mergeCells(jobStartRow, 1, jobEndRow, 1);
                    ws.mergeCells(jobStartRow, BOOKING_COL, jobEndRow, BOOKING_COL);
                    ws.mergeCells(jobStartRow, REMARKS_COL, jobEndRow, REMARKS_COL);
                }

                const jobNoCell = ws.getCell(jobStartRow, 1);
                jobNoCell.font = { bold: true, color: { argb: "FF0F2544" } };
                jobNoCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                jobNoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

                const bookingCell = ws.getCell(jobStartRow, BOOKING_COL);
                bookingCell.numFmt = "#,##0.00";
                bookingCell.alignment = { horizontal: "right", vertical: "middle" };

                const remarksCell = ws.getCell(jobStartRow, REMARKS_COL);
                remarksCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
            });

            // Subtotal row (of ALL exported jobs) — same order as COLUMNS
            const dyeLossTotal = exportTotals.greyRcvd
                ? (exportTotals.greyRcvd - exportTotals.finishRcvd) / exportTotals.greyRcvd : null;
            const aopLossTotal = exportTotals.receivedFromAop
                ? (exportTotals.receivedFromAop - exportTotals.aopFinishRcvd) / exportTotals.receivedFromAop : null;

            const subtotalRow = ws.addRow([
                "Subtotal",
                exportTotals.booking,
                "",
                exportTotals.req, exportTotals.issue, exportTotals.knittingGrey, exportTotals.yarnReturn, exportTotals.yarnBal,
                "",
                exportTotals.greyDelivery, exportTotals.greyReturn, exportTotals.greyRcvd, exportTotals.finishRcvd,
                exportTotals.dyeBal, dyeLossTotal,
                "",
                exportTotals.sentForAop, exportTotals.returnFromAop, exportTotals.receivedFromAop, exportTotals.aopFinishRcvd,
                exportTotals.aopBal, aopLossTotal,
                ""
            ]);
            subtotalRow.height = 24;

            subtotalRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const col = COLUMNS[colNumber - 1];
                const textLeft = isTextCol(col.id);
                const isPct = col.id === "processLoss" || col.id === "aopProcessLoss";

                cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2544" } };
                cell.border = col.id === "yarnBalance" ? EXCEL_YARN_SEPARATOR_BORDER : EXCEL_THIN_BORDER;

                if (isPct) {
                    cell.numFmt = "0.00%";
                    cell.alignment = { horizontal: "right", vertical: "middle" };
                } else if (textLeft) {
                    cell.alignment = { horizontal: col.id === "jobNo" ? "center" : "left", vertical: "middle" };
                } else {
                    cell.numFmt = "#,##0.00";
                    cell.alignment = { horizontal: "right", vertical: "middle" };
                }
            });

            // Download
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `balance-sheet-${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Excel export failed:", err);
            alert("Excel export failed. Please check your connection and try again (ExcelJS is loaded from CDN on first export).");
        } finally {
            setIsExporting(false);
        }
    };

    const getColWidth = (id) => COLUMNS.find((c) => c.id === id)?.width || 100;
    const getColLeft = (id) => COL_LEFT[id] || 0;
    const isFrozen = (id) => FROZEN_IDS.includes(id);

    const getColValueGetter = (colId) => {
        if (colId === "remarks") return (j) => [j.remarks].filter(Boolean);
        if (colId === "bookingQty") return (j) => [String(j.bookingQty ?? 0)];
        const group = COL_TO_GROUP[colId];
        if (!group) return () => [];
        const get = ROW_FILTERS[group][colId];
        return (j) => j[group].map(get);
    };

    const cellStyle = (colId, extra = {}) => {
        const w = getColWidth(colId);
        if (isFrozen(colId)) return { position: "sticky", left: getColLeft(colId), width: w, minWidth: w, maxWidth: w, zIndex: 10, ...extra };
        return { width: w, minWidth: w, maxWidth: w, ...extra };
    };

    const headerCellStyle = (colId, extra = {}) => {
        const w = getColWidth(colId);
        const isFrozenCol = isFrozen(colId);
        return {
            position: "sticky",
            top: GROUP_HEADER_ROW_HEIGHT,
            left: isFrozenCol ? getColLeft(colId) : undefined,
            width: w, minWidth: w, maxWidth: w,
            zIndex: isFrozenCol ? 30 : 20,
            backgroundColor: '#475569',
            ...extra
        };
    };

    const footerCellStyle = (colId, extra = {}) => {
        const w = getColWidth(colId);
        const isFrozenCol = isFrozen(colId);
        return {
            position: "sticky",
            bottom: 0,
            left: isFrozenCol ? getColLeft(colId) : undefined,
            width: w, minWidth: w, maxWidth: w,
            zIndex: isFrozenCol ? 35 : 25,
            ...extra
        };
    };

    // --- FIRST PAGE: runs on the first load, on every new (debounced) search, and when Refresh is pressed ---
    useEffect(() => {
        if (!socket) {
            console.error("[BalanceSheet] Socket is not available.");
            setIsLoading(false);
            isLoadingRef.current = false;
            return;
        }

        let isActive = true;
        let joinedRoom = false;

        // new generation: any older "load more" response is ignored from now on
        generationRef.current += 1;
        pageRef.current = 0;
        hasMoreRef.current = false;
        loadingMoreRef.current = false;
        isLoadingRef.current = true;
        setLoadingMore(false);
        setLoadMoreError(false);
        setHasMore(false);

        const controller = new AbortController();
        const requestId = `balance_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        const handleProgress = (data) => {
            if (!isActive || !data) return;
            const percentage = Number(data.percentage);
            if (Number.isFinite(percentage)) {
                setLoadingProgress(Math.min(100, Math.max(0, percentage)));
            }
            if (data.message) setLoadingMessage(data.message);
        };

        // Register the listener BEFORE joining the room and BEFORE the API request
        socket.on("reportProgress", handleProgress);

        const fetchFirstPage = async () => {
            setIsLoading(true);
            setLoadError("");
            setLoadingProgress(0);
            setLoadingMessage(appliedSearch ? `Searching "${appliedSearch}"...` : "Connecting to report server...");

            try {
                if (!socket.connected) {
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            cleanup();
                            reject(new Error("Socket connection timeout"));
                        }, 10000);
                        const onConnect = () => { cleanup(); resolve(); };
                        const onConnectError = (error) => { cleanup(); reject(error); };
                        const cleanup = () => {
                            clearTimeout(timeout);
                            socket.off("connect", onConnect);
                            socket.off("connect_error", onConnectError);
                        };
                        socket.once("connect", onConnect);
                        socket.once("connect_error", onConnectError);
                    });
                }

                if (!isActive) return;

                await new Promise((resolve, reject) => {
                    socket.timeout(7000).emit("joinRoom", requestId, (error, response) => {
                        if (error) {
                            reject(new Error("Server did not acknowledge joinRoom"));
                            return;
                        }
                        if (!response?.success) {
                            reject(new Error(response?.message || "Failed to join report room"));
                            return;
                        }
                        joinedRoom = true;
                        resolve(response);
                    });
                });

                if (!isActive) return;

                setLoadingMessage("Preparing balance sheet report...");

                const response = await fetchJobsPage(axiosSecure, {
                    search: appliedSearch,
                    page: 1,
                    limit: PAGE_SIZE,
                    requestId,
                    signal: controller.signal,
                });

                if (!isActive) return;

                const transformed = (response.data.jobs || []).map(transformJob);
                const pg = response.data.pagination || {};

                setJobs(transformed);
                pageRef.current = 1;
                hasMoreRef.current = !!pg.hasMore;
                setHasMore(!!pg.hasMore);
                setTotalJobs(pg.totalJobs ?? transformed.length);
                setLoadingProgress(100);
                setLoadingMessage("Balance sheet loaded successfully.");
                if (scrollRef.current) scrollRef.current.scrollTop = 0;
            } catch (error) {
                if (isCanceled(error)) return;
                console.error("[BalanceSheet] Report loading failed:", error);
                if (isActive) {
                    setLoadError(error.message || "Failed to load balance sheet.");
                    setLoadingMessage(error.message || "Failed to load balance sheet.");
                }
            } finally {
                if (isActive) {
                    isLoadingRef.current = false;
                    setIsLoading(false);
                }
                socket.off("reportProgress", handleProgress);
                if (joinedRoom && socket.connected) {
                    socket.emit("leaveRoom", requestId);
                }
            }
        };

        fetchFirstPage();

        return () => {
            isActive = false;
            controller.abort();
            socket.off("reportProgress", handleProgress);
            if (joinedRoom && socket.connected) {
                socket.emit("leaveRoom", requestId);
            }
        };
    }, [axiosSecure, socket, appliedSearch, refreshKey]);

    return (
        <div className="p-5 bg-slate-50 w-full" onClick={() => setOpenCol(null)}>
            <div ref={topRef}>
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">Yarn, Dyeing &amp; AOP Balance Sheet</h2>
                        <p className="text-xs text-slate-500 mt-1">
                            Figures in kg unless noted · <span className="font-semibold text-slate-700">{jobs.length}</span> of <span className="font-semibold text-slate-700">{totalJobs}</span> jobs loaded
                            {appliedSearch ? <> for "<span className="font-semibold text-slate-700">{appliedSearch}</span>"</> : null}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                            </svg>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") setAppliedSearch(search.trim()); }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Search job no. or factory..."
                                className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-md w-64 outline-none focus:border-[#dfebf0] focus:ring-1 focus:ring-[#dfebf0]/20 bg-white transition-all"
                            />
                        </div>

                        <button
                            onClick={() => setWrapText(!wrapText)}
                            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${wrapText ? "bg-slate-700 text-white border-slate-700 shadow-sm" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
                            </svg>
                            Wrap Text
                        </button>

                        {hasFilters && (
                            <button onClick={(e) => { e.stopPropagation(); clearAll(); }} className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-md transition-colors">
                                Clear Filters
                            </button>
                        )}

                        {/* Refresh: reloads only the current search (page 1), column filters are kept */}
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                            disabled={isLoading}
                            title="Reload the current filter from the server"
                            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-md shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <svg className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); exportExcel(); }}
                            disabled={isExporting || jobs.length === 0}
                            title="Exports all jobs of the current search"
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isExporting ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Exporting...
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                                    </svg>
                                    Export Excel
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {loadError && !isLoading && (
                    <div className="mb-3 flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5 shadow-sm">
                        <span className="text-sm font-medium text-rose-700">{loadError}</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
                            className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-md transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {hasUnsavedRemarks && (
                    <div className="mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 shadow-sm">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span className="text-sm font-medium text-amber-800">You have unsaved changes in the remarks.</span>
                        </div>
                        <button
                            onClick={handleSaveRemarks}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-md transition-colors shadow-sm"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Save Changes
                        </button>
                    </div>
                )}
            </div>

            <div
                ref={scrollRef}
                onScroll={maybeLoadMore}
                className="overflow-auto border border-[#b4bcc2] rounded-2xl shadow-sm bg-white relative"
                style={{ height: fit.height, boxSizing: 'border-box' }}
            >
                {/* Loading overlay with real-time progress bar */}
                {isLoading && (
                    <div className="absolute inset-0 bg-white/90 z-50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3 w-64">
                            <div
                                className="w-full h-2.5 rounded-full overflow-hidden"
                                style={{ backgroundColor: "#e2e8f0" }}
                                role="progressbar"
                                aria-valuenow={loadingProgress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            >
                                <div
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        backgroundColor: "#0f2544",
                                        transform: `scaleX(${Math.min(100, Math.max(0, Number(loadingProgress) || 0)) / 100})`,
                                        transformOrigin: "left center",
                                        transition: "transform 300ms ease-in-out",
                                    }}
                                />
                            </div>
                            <span className="text-xs font-medium text-slate-600 text-center">
                                {loadingMessage} ({loadingProgress}%)
                            </span>
                        </div>
                    </div>
                )}

                <table className="border-separate border-spacing-0 tabular-nums text-[11px] border border-[#b4bcc2]" style={{ width: '100%', minWidth: TOTAL_WIDTH }}>
                    <thead>
                        <tr>
                            <th
                                colSpan={8}
                                style={{
                                    position: 'sticky', top: 0, left: 0, zIndex: 40,
                                    width: getColLeft('yarnBalance') + getColWidth('yarnBalance'),
                                    backgroundColor: '#475569'
                                }}
                                className="px-0 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white border-r border-b border-[#b4bcc2]"
                            >
                                YARN / KNITTING
                            </th>
                            <th colSpan={7} style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#475569' }} className="px-0 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white border-r border-b border-[#b4bcc2]">
                                DYEING
                            </th>
                            <th colSpan={7} style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#475569' }} className="px-0 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white border-r border-b border-[#b4bcc2]">
                                AOP
                            </th>
                            <th
                                className="px-0 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white border-r border-b border-[#b4bcc2]"
                                style={{ position: 'sticky', top: 0, zIndex: 20, width: getColWidth('remarks'), backgroundColor: '#475569' }}
                            >
                                
                            </th>
                        </tr>
                        <tr>
                            {COLUMNS.map((col) => {
                                const isLastFrozen = col.id === 'yarnBalance';
                                const leftAligned = col.id === 'jobNo' || col.id === 'yarnFactory' || col.id === 'dyeingFactory' || col.id === 'aopFactory';
                                return (
                                    <th
                                        key={col.id}
                                        style={headerCellStyle(col.id, {
                                            boxShadow: isLastFrozen ? FROZEN_DIVIDER_SHADOW : undefined
                                        })}
                                        className={`px-1 py-2 text-[10px] font-semibold uppercase border-r border-b border-[#b4bcc2] text-white ${leftAligned ? 'text-left' : 'text-right'}`}
                                    >
                                        <div className={`flex items-center ${leftAligned ? "" : "justify-end"} gap-1`}>
                                            {col.label}
                                            <ExcelFilter colId={col.id} allJobs={jobs} excluded={colFilters[col.id] || new Set()} setExcluded={setExcludedFor} openCol={openCol} setOpenCol={setOpenCol} valueGetter={getColValueGetter(col.id)} />
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    <tbody>
                        {filteredJobs.length === 0 && !isLoading && (
                            <tr>
                                <td colSpan={COLUMNS.length} className="px-3 py-16 text-center text-sm text-slate-400">
                                    <div className="flex flex-col items-center gap-2">
                                        <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <span>No jobs match the current filters.</span>
                                    </div>
                                </td>
                            </tr>
                        )}

                        {filteredJobs.map(({ job, idx: jobIdx }) => {
                            const maxRows = Math.max(job.yarnRows.length, job.dyeingRows.length, job.aopRows.length, 1);

                            return Array.from({ length: maxRows }).map((_, rowIdx) => {
                                const yRow = job.yarnRows[rowIdx];
                                const dRow = job.dyeingRows[rowIdx];
                                const aRow = job.aopRows[rowIdx];
                                const stripeBg = jobIdx % 2 === 0 ? '#ffffff' : '#f3f8f5';

                                return (
                                    <tr key={`${job.jobNo}-${rowIdx}`} className="border-b border-slate-200 hover:bg-amber-50/40 transition-colors">
                                        {rowIdx === 0 && (
                                            <td rowSpan={maxRows} style={cellStyle("jobNo", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-center font-bold text-slate-800">{job.jobNo}</td>
                                        )}
                                        {rowIdx === 0 && (
                                            <td rowSpan={maxRows} style={cellStyle("bookingQty", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{fmtNum(job.bookingQty)}</td>
                                        )}

                                        <td style={cellStyle("yarnFactory", { backgroundColor: stripeBg })} className={`px-2 py-2 border-r border-b border-[#b4bcc2] text-slate-600 text-left ${wrapText ? 'whitespace-normal' : 'whitespace-nowrap overflow-hidden text-ellipsis'}`}>{yRow?.factory ?? ""}</td>
                                        <td style={cellStyle("yarnReq", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] text-right">{yRow ? fmtNum(yRow.req) : ""}</td>
                                        <td style={cellStyle("yarnIssue", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] text-right">{yRow ? fmtNum(yRow.issue) : ""}</td>
                                        <td style={cellStyle("knittingGrey", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] text-right">{yRow ? fmtNum(yRow.knittingGrey) : ""}</td>
                                        <td style={cellStyle("yarnReturn", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] text-right">{yRow ? fmtNum(yRow.yarnReturn) : ""}</td>
                                        <td style={cellStyle("yarnBalance", { boxShadow: FROZEN_DIVIDER_SHADOW, backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] text-right font-medium">{yRow ? fmtNum(yarnBalance(yRow)) : ""}</td>

                                        <td style={cellStyle("dyeingFactory", { backgroundColor: stripeBg })} className={`px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-center ${wrapText ? 'whitespace-normal' : 'whitespace-nowrap overflow-hidden text-ellipsis'}`}>{dRow?.factoryName ?? ""}</td>
                                        <td style={cellStyle("greyDelivery", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{dRow ? fmtNum(dRow.greyDelivery) : ""}</td>
                                        <td style={cellStyle("greyReturn", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{dRow ? fmtNum(dRow.greyReturn) : ""}</td>
                                        <td style={cellStyle("greyRcvd", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{dRow ? fmtNum(dRow.greyRcvd) : ""}</td>
                                        <td style={cellStyle("finishRcvd", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{dRow ? fmtNum(dRow.finishRcvd) : ""}</td>
                                        <td style={cellStyle("dyeBalance", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{dRow ? fmtNum(dyeBalance(dRow)) : ""}</td>
                                        <td style={cellStyle("processLoss", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{dRow ? fmtPct(dyeProcessLoss(dRow)) : ""}</td>

                                        <td style={cellStyle("aopFactory", { backgroundColor: stripeBg })} className={`px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-center ${wrapText ? 'whitespace-normal' : 'whitespace-nowrap overflow-hidden text-ellipsis'}`}>{aRow?.factoryName ?? ""}</td>
                                        <td style={cellStyle("sentForAop", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{aRow ? fmtNum(aRow.sentForAop) : ""}</td>
                                        <td style={cellStyle("returnFromAop", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{aRow ? fmtNum(aRow.returnFromAop) : ""}</td>
                                        <td style={cellStyle("receivedFromAop", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{aRow ? fmtNum(aRow.receivedFromAop) : ""}</td>
                                        <td style={cellStyle("aopFinishRcvd", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{aRow ? fmtNum(aRow.aopFinishRcvd) : ""}</td>
                                        <td style={cellStyle("aopBalance", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{aRow ? fmtNum(aopBalance(aRow)) : ""}</td>
                                        <td style={cellStyle("aopProcessLoss", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-right font-medium">{aRow ? fmtPct(aopProcessLoss(aRow)) : ""}</td>

                                        {rowIdx === 0 && (
                                            <td rowSpan={maxRows} style={cellStyle("remarks", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-center">
                                                {editingCell === jobIdx ? (
                                                    <input
                                                        type="text"
                                                        value={job.remarks || ""}
                                                        onChange={(e) => updateRemarks(jobIdx, e.target.value)}
                                                        onBlur={handleSaveRemarks}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRemarks()}
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                        className="w-full px-2 py-1 text-xs text-slate-700 border border-[#dfebf0] rounded focus:ring-1 focus:ring-[#dfebf0]/20 outline-none text-center"
                                                    />
                                                ) : (
                                                    <div
                                                        onDoubleClick={() => handleDoubleClick(jobIdx)}
                                                        className={`cursor-pointer px-2 py-1 text-xs text-slate-700 rounded hover:bg-slate-100 transition-colors ${wrapText ? 'whitespace-normal' : 'whitespace-nowrap overflow-hidden text-ellipsis'}`}
                                                        title="Double-click to edit"
                                                    >
                                                        {job.remarks || <span className="text-slate-400 italic text-[10px]">Double-click to edit</span>}
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            });
                        })}
                    </tbody>

                    {filteredJobs.length > 0 && (
                        <tfoot>
                            <tr className="bg-[#475569] text-white font-bold text-[11px]">
                                <td
                                    style={footerCellStyle("jobNo", { borderTop: '1px solid #b4bcc2' })}
                                    title={hasMore ? "Subtotal of the jobs loaded so far. Scroll down to load more." : "Subtotal"}
                                    className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569] text-center uppercase tracking-wide text-[10px] whitespace-nowrap overflow-hidden"
                                >
                                    {hasMore ? "Loaded Subtotal" : "Subtotal"}
                                </td>
                                <td style={footerCellStyle("bookingQty", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.booking)}</td>
                                <td style={footerCellStyle("yarnFactory", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                                <td style={footerCellStyle("yarnReq", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.req)}</td>
                                <td style={footerCellStyle("yarnIssue", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.issue)}</td>
                                <td style={footerCellStyle("knittingGrey", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.knittingGrey)}</td>
                                <td style={footerCellStyle("yarnReturn", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.yarnReturn)}</td>
                                <td style={footerCellStyle("yarnBalance", { borderTop: '1px solid #b4bcc2', boxShadow: FROZEN_DIVIDER_SHADOW })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.yarnBal)}</td>

                                <td style={footerCellStyle("dyeingFactory", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                                <td style={footerCellStyle("greyDelivery", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.greyDelivery)}</td>
                                <td style={footerCellStyle("greyReturn", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.greyReturn)}</td>
                                <td style={footerCellStyle("greyRcvd", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.greyRcvd)}</td>
                                <td style={footerCellStyle("finishRcvd", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.finishRcvd)}</td>
                                <td style={footerCellStyle("dyeBalance", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.dyeBal)}</td>
                                <td style={footerCellStyle("processLoss", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{lossText(totals.greyRcvd, totals.finishRcvd)}</td>

                                <td style={footerCellStyle("aopFactory", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                                <td style={footerCellStyle("sentForAop", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.sentForAop)}</td>
                                <td style={footerCellStyle("returnFromAop", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.returnFromAop)}</td>
                                <td style={footerCellStyle("receivedFromAop", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.receivedFromAop)}</td>
                                <td style={footerCellStyle("aopFinishRcvd", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.aopFinishRcvd)}</td>
                                <td style={footerCellStyle("aopBalance", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{fmtT(totals.aopBal)}</td>
                                <td style={footerCellStyle("aopProcessLoss", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{lossText(totals.receivedFromAop, totals.aopFinishRcvd)}</td>

                                <td style={footerCellStyle("remarks", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {/* Lazy loading status */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2 min-h-6 text-xs text-slate-500 text-center">
                {!isLoading && loadingMore && (
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                        <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin"></div>
                        Loading more...
                    </span>
                )}
                {!isLoading && loadMoreError && (
                    <span className="inline-flex items-center gap-2 text-rose-600 font-medium">
                        Could not load more jobs.
                        <button onClick={handleRetryLoadMore} className="underline font-semibold">Retry</button>
                    </span>
                )}
                {!isLoading && !loadingMore && !loadMoreError && hasMore && (
                    <span className="opacity-70">
                        {jobs.length} of {totalJobs} jobs loaded. Scroll down to load more.
                    </span>
                )}
                {!isLoading && !loadingMore && !loadMoreError && !hasMore && jobs.length > 0 && (
                    <span className="opacity-70">All {jobs.length} jobs loaded</span>
                )}
            </div>
        </div>
    );
};

export default BalanceSheet;