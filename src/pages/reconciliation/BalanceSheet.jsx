import { useEffect, useMemo, useState } from "react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

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

// --- Column Definitions ---
const COLUMNS = [
    { id: "jobNo", label: "Job No", width: 120, group: "yarn" },
    { id: "yarnFactory", label: "Factory Name", width: 150, group: "yarn" },
    { id: "yarnReq", label: "Yarn Req", width: 90, group: "yarn" },
    { id: "yarnIssue", label: "Yarn Issue", width: 90, group: "yarn" },
    { id: "knittingGrey", label: "Knitting Grey", width: 100, group: "yarn" },
    { id: "yarnReturn", label: "Yarn Return", width: 95, group: "yarn" },
    { id: "yarnBalance", label: "Balance", width: 85, group: "yarn" },

    { id: "dyeingFactory", label: "Dyeing Factory", width: 130, group: "dyeing" },
    { id: "greyDelivery", label: "Grey Delivery", width: 90, group: "dyeing" },
    { id: "greyReturn", label: "Grey Return", width: 90, group: "dyeing" },
    { id: "greyRcvd", label: "Grey Rcvd", width: 85, group: "dyeing" },
    { id: "finishRcvd", label: "Finish Rcvd", width: 90, group: "dyeing" },
    { id: "dyeBalance", label: "Balance", width: 85, group: "dyeing" },
    { id: "processLoss", label: "Process Loss", width: 85, group: "dyeing" },

    { id: "aopFactory", label: "AOP Factory", width: 130, group: "aop" },
    { id: "sentForAop", label: "Sent For AOP", width: 90, group: "aop" },
    { id: "receivedFromAop", label: "Rcvd From AOP", width: 90, group: "aop" },
    { id: "aopFinishRcvd", label: "AOP Finish Rcvd", width: 90, group: "aop" },
    { id: "aopBalance", label: "Balance", width: 85, group: "aop" },
    { id: "aopProcessLoss", label: "Process Loss", width: 85, group: "aop" },

    { id: "remarks", label: "Remarks", width: 140, group: "remarks" },
];

const FROZEN_IDS = ["jobNo", "yarnFactory", "yarnReq", "yarnIssue", "knittingGrey", "yarnReturn", "yarnBalance"];

let acc = 0;
const COL_LEFT = {};
COLUMNS.forEach((c) => {
    COL_LEFT[c.id] = acc;
    acc += c.width;
});
const TOTAL_WIDTH = acc;

const GROUP_HEADER_ROW_HEIGHT = 33;

// Reinforced divider between the frozen "Yarn" block and the rest of the table.
// Rendered as an inset box-shadow (instead of relying purely on border-right) so it
// stays visually intact while the column is sticky and the table scrolls horizontally —
// a plain border on a sticky cell can get painted over by neighboring cells in some
// browsers, box-shadow does not.
const FROZEN_DIVIDER_SHADOW = "inset -1px 0 0 0 #64748b";

// --- Lazy ExcelJS loader from CDN (avoids Vite resolution + npm install) ---
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

// --- Filter Component ---
const ExcelFilter = ({ colId, allJobs, excluded, setExcluded, openCol, setOpenCol, align = "left", valueGetter }) => {
    const isOpen = openCol === colId;
    const isActive = excluded.size > 0;

    const uniqueValues = useMemo(() => {
        const set = new Set();
        allJobs.forEach((j) => {
            const values = valueGetter ? valueGetter(j) : [];
            values.forEach((v) => { if (v !== "" && v != null) set.add(String(v)); });
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }, [allJobs, colId, valueGetter]);

    const toggleValue = (val) => {
        const next = new Set(excluded);
        next.has(val) ? next.delete(val) : next.add(val);
        setExcluded(colId, next);
    };

    const toggleAll = () => setExcluded(colId, excluded.size > 0 ? new Set() : new Set(uniqueValues));

    return (
        <span className="relative inline-block">
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpenCol(isOpen ? null : colId); }}
                className={`ml-1 inline-flex items-center justify-center w-4 h-4 rounded shrink-0 transition-colors ${isActive ? "bg-amber-400 text-[#dfebf0]" : "bg-white/20 text-white hover:bg-white/30"}`}
                title="Filter this column"
            >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                    <path d="M2 3.5A.5.5 0 012.5 3h15a.5.5 0 01.4.8l-5.9 7.4v4.3a.5.5 0 01-.7.46l-3-1.2a.5.5 0 01-.3-.46v-3.1L2.1 3.8A.5.5 0 012 3.5z" />
                </svg>
            </button>

            {isOpen && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute z-50 top-6 ${align === "right" ? "right-0" : "left-0"} w-48 bg-white border border-slate-300 rounded-md shadow-lg p-2 normal-case font-normal text-slate-700`}
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
                </div>
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
    const [jobs, setJobs] = useState([]);
    const [search, setSearch] = useState("");
    const [colFilters, setColFilters] = useState({});
    const [openCol, setOpenCol] = useState(null);
    const [hasUnsavedRemarks, setHasUnsavedRemarks] = useState(false);
    const [wrapText, setWrapText] = useState(false);
    const [editingCell, setEditingCell] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);

    const axiosSecure = useAxiosPrivate();
    const ITEMS_PER_PAGE = 15;

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

    const hasFilters = search || Object.values(colFilters).some((s) => s && s.size > 0);

    const filteredJobs = useMemo(() => {
        return jobs.map((job, jobIdx) => {
            const matchesSearch = !search ||
                job.jobNo.toLowerCase().includes(search.toLowerCase()) ||
                job.yarnRows.some((r) => r.factory?.toLowerCase().includes(search.toLowerCase())) ||
                job.dyeingRows.some((r) => r.factoryName?.toLowerCase().includes(search.toLowerCase())) ||
                job.aopRows.some((r) => r.factoryName?.toLowerCase().includes(search.toLowerCase()));

            if (!matchesSearch) return null;

            const filteredYarnRows = job.yarnRows.filter((row) => {
                const yarnColIds = ['yarnFactory', 'yarnReq', 'yarnIssue', 'knittingGrey', 'yarnReturn', 'yarnBalance'];
                for (const colId of yarnColIds) {
                    const excluded = colFilters[colId];
                    if (excluded && excluded.size > 0) {
                        let val = "";
                        if (colId === 'yarnFactory') val = row.factory;
                        else if (colId === 'yarnReq') val = String(row.req ?? "");
                        else if (colId === 'yarnIssue') val = String(row.issue ?? "");
                        else if (colId === 'knittingGrey') val = String(row.knittingGrey ?? "");
                        else if (colId === 'yarnReturn') val = String(row.yarnReturn ?? "");
                        else if (colId === 'yarnBalance') val = String(yarnBalance(row) ?? "");
                        if (excluded.has(val)) return false;
                    }
                }
                return true;
            });

            const filteredDyeingRows = job.dyeingRows.filter((row) => {
                const dyeingColIds = ['dyeingFactory', 'greyDelivery', 'greyReturn', 'greyRcvd', 'dyeBalance', 'finishRcvd', 'processLoss'];
                for (const colId of dyeingColIds) {
                    const excluded = colFilters[colId];
                    if (excluded && excluded.size > 0) {
                        let val = "";
                        if (colId === 'dyeingFactory') val = row.factoryName;
                        else if (colId === 'greyDelivery') val = String(row.greyDelivery ?? "");
                        else if (colId === 'greyReturn') val = String(row.greyReturn ?? "");
                        else if (colId === 'greyRcvd') val = String(row.greyRcvd ?? "");
                        else if (colId === 'dyeBalance') val = String(dyeBalance(row) ?? "");
                        else if (colId === 'finishRcvd') val = String(row.finishRcvd ?? "");
                        else if (colId === 'processLoss') val = String(dyeProcessLoss(row) ?? "");
                        if (excluded.has(val)) return false;
                    }
                }
                return true;
            });

            const filteredAopRows = job.aopRows.filter((row) => {
                const aopColIds = ['aopFactory', 'sentForAop', 'receivedFromAop', 'aopFinishRcvd', 'aopBalance', 'aopProcessLoss'];
                for (const colId of aopColIds) {
                    const excluded = colFilters[colId];
                    if (excluded && excluded.size > 0) {
                        let val = "";
                        if (colId === 'aopFactory') val = row.factoryName;
                        else if (colId === 'sentForAop') val = String(row.sentForAop ?? "");
                        else if (colId === 'receivedFromAop') val = String(row.receivedFromAop ?? "");
                        else if (colId === 'aopFinishRcvd') val = String(row.aopFinishRcvd ?? "");
                        else if (colId === 'aopBalance') val = String(aopBalance(row) ?? "");
                        else if (colId === 'aopProcessLoss') val = String(aopProcessLoss(row) ?? "");
                        if (excluded.has(val)) return false;
                    }
                }
                return true;
            });

            return {
                job: { ...job, yarnRows: filteredYarnRows, dyeingRows: filteredDyeingRows, aopRows: filteredAopRows },
                idx: jobIdx
            };
        }).filter(Boolean);
    }, [jobs, search, colFilters]);

    const displayedJobs = useMemo(() => {
        if (hasFilters) return filteredJobs;
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredJobs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredJobs, currentPage, hasFilters]);

    const totalPages = Math.ceil(filteredJobs.length / ITEMS_PER_PAGE) || 1;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredJobs.length);

    useEffect(() => { setCurrentPage(1); }, [search, colFilters]);

    const totals = useMemo(() => {
        const t = {
            req: 0, issue: 0, knittingGrey: 0, yarnReturn: 0, yarnBal: 0,
            greyDelivery: 0, greyReturn: 0, greyRcvd: 0, dyeBal: 0, finishRcvd: 0,
            sentForAop: 0, receivedFromAop: 0, aopFinishRcvd: 0, aopBal: 0
        };
        filteredJobs.forEach(({ job }) => {
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
                t.receivedFromAop += row.receivedFromAop || 0;
                t.aopFinishRcvd += row.aopFinishRcvd || 0;
                t.aopBal += aopBalance(row);
            });
        });
        return t;
    }, [filteredJobs]);

    const clearAll = () => {
        setSearch("");
        setColFilters({});
        setOpenCol(null);
        setCurrentPage(1);
    };

    // ---------- EXCEL EXPORT (borders + merges via CDN-loaded ExcelJS) ----------
    const exportExcel = async () => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            const ExcelJS = await loadExcelJS();

            const wb = new ExcelJS.Workbook();
            wb.creator = "Balance Sheet";
            wb.created = new Date();

            const ws = wb.addWorksheet("Balance Sheet", {
                views: [{
                    state: "frozen",
                    xSplit: FROZEN_IDS.length,
                    ySplit: 2,
                    activeCell: "H3"
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

            // Column widths
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

            // Row 1 — Group headers
            const groupHeaderRow = ws.addRow([
                "YARN / KNITTING", "", "", "", "", "", "",
                "DYEING", "", "", "", "", "", "",
                "AOP", "", "", "", "", "",
                "REMARKS"
            ]);
            groupHeaderRow.height = 22;
            ws.mergeCells(1, 1, 1, 7);
            ws.mergeCells(1, 8, 1, 14);
            ws.mergeCells(1, 15, 1, 20);

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
            filteredJobs.forEach(({ job }) => {
                const maxRows = Math.max(job.yarnRows.length, job.dyeingRows.length, job.aopRows.length, 1);
                const jobStartRow = ws.rowCount + 1;

                for (let i = 0; i < maxRows; i++) {
                    const yRow = job.yarnRows[i];
                    const dRow = job.dyeingRows[i];
                    const aRow = job.aopRows[i];

                    const cells = [
                        i === 0 ? (job.jobNo ?? "") : "",
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

                // Merge Job No column across this job's rows
                if (jobEndRow > jobStartRow) {
                    ws.mergeCells(jobStartRow, 1, jobEndRow, 1);
                    ws.mergeCells(jobStartRow, COLUMNS.length, jobEndRow, COLUMNS.length);
                }

                const jobNoCell = ws.getCell(jobStartRow, 1);
                jobNoCell.font = { bold: true, color: { argb: "FF0F2544" } };
                jobNoCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                jobNoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

                const remarksCell = ws.getCell(jobStartRow, COLUMNS.length);
                remarksCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
            });

            // Subtotal row
            // FIX: dyeing process loss must use Grey Received (greyRcvd) as the base,
            // matching the per-row formula dyeProcessLoss() — not Grey Delivery.
            const dyeLossTotal = totals.greyRcvd
                ? (totals.greyRcvd - totals.finishRcvd) / totals.greyRcvd : null;
            const aopLossTotal = totals.receivedFromAop
                ? (totals.receivedFromAop - totals.aopFinishRcvd) / totals.receivedFromAop : null;

            const subtotalRow = ws.addRow([
                "Subtotal", "",
                totals.req, totals.issue, totals.knittingGrey, totals.yarnReturn, totals.yarnBal,
                "",
                totals.greyDelivery, totals.greyReturn, totals.greyRcvd, totals.finishRcvd,
                totals.dyeBal, dyeLossTotal,
                "",
                totals.sentForAop, totals.receivedFromAop, totals.aopFinishRcvd, totals.aopBal,
                aopLossTotal,
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
            alert("Excel export failed. Please check your internet connection (ExcelJS is loaded from CDN on first export).");
        } finally {
            setIsExporting(false);
        }
    };

    const getColWidth = (id) => COLUMNS.find((c) => c.id === id)?.width || 100;
    const getColLeft = (id) => COL_LEFT[id] || 0;
    const isFrozen = (id) => FROZEN_IDS.includes(id);

    const getColValueGetter = (colId) => {
        if (colId === 'yarnFactory') return (j) => j.yarnRows.map((r) => r.factory);
        if (colId === 'yarnReq') return (j) => j.yarnRows.map((r) => String(r.req));
        if (colId === 'yarnIssue') return (j) => j.yarnRows.map((r) => String(r.issue));
        if (colId === 'knittingGrey') return (j) => j.yarnRows.map((r) => String(r.knittingGrey));
        if (colId === 'yarnReturn') return (j) => j.yarnRows.map((r) => String(r.yarnReturn));
        if (colId === 'yarnBalance') return (j) => j.yarnRows.map((r) => String(yarnBalance(r)));

        if (colId === 'dyeingFactory') return (j) => j.dyeingRows.map((r) => r.factoryName);
        if (colId === 'greyDelivery') return (j) => j.dyeingRows.map((r) => String(r.greyDelivery));
        if (colId === 'greyReturn') return (j) => j.dyeingRows.map((r) => String(r.greyReturn));
        if (colId === 'greyRcvd') return (j) => j.dyeingRows.map((r) => String(r.greyRcvd));
        if (colId === 'finishRcvd') return (j) => j.dyeingRows.map((r) => String(r.finishRcvd));
        if (colId === 'dyeBalance') return (j) => j.dyeingRows.map((r) => String(dyeBalance(r)));
        if (colId === 'processLoss') return (j) => j.dyeingRows.map((r) => String(dyeProcessLoss(r)));

        if (colId === 'aopFactory') return (j) => j.aopRows.map((r) => r.factoryName);
        if (colId === 'sentForAop') return (j) => j.aopRows.map((r) => String(r.sentForAop));
        if (colId === 'receivedFromAop') return (j) => j.aopRows.map((r) => String(r.receivedFromAop));
        if (colId === 'aopFinishRcvd') return (j) => j.aopRows.map((r) => String(r.aopFinishRcvd));
        if (colId === 'aopBalance') return (j) => j.aopRows.map((r) => String(aopBalance(r)));
        if (colId === 'aopProcessLoss') return (j) => j.aopRows.map((r) => String(aopProcessLoss(r)));

        if (colId === 'remarks') return (j) => [j.remarks].filter(Boolean);
        return () => [];
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

    // Sticky footer (Subtotal row): pinned to the bottom of the scroll container.
    // Frozen columns get BOTH left and bottom offsets so their bottom-left corner
    // stays pinned while the table scrolls in either direction.
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

    useEffect(() => {
        const fetchBalanceSheetData = async () => {
            setIsLoading(true);
            try {
                const response = await axiosSecure.get("/api/balance/sheet");
                const rawData = response.data.jobs || response.data || [];

                const transformed = rawData.map(job => {
                    const yarnRows = [];
                    const dyeingRows = [];
                    const aopRows = [];

                    (job.dyeingRows || []).forEach(row => {
                        const dt = row.deliveryTypeTotals || {};
                        const hasYarn = dt["Yarn Delivery"] || dt["Yarn Return"] || dt["Grey Fabric Received"];
                        const hasDyeing = dt["Grey Delivery"] || dt["Grey Received"] || dt["Finish Received"] || dt["Grey Return"] || dt["Received From Compacting"] || dt["Received From Reprocess"] || dt["Received From HEAT Set"];
                        const hasAop = dt["Sent For Aop"] || dt["Received From Aop"] || dt["AOP Finish Fabric Rcvd"] || dt["Return From Aop"];

                        if (hasYarn) {
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
                        yarnRows.push({ factory: "N/A", req: job.totalWorkOrderQty || 0, issue: 0, knittingGrey: 0, yarnReturn: 0 });
                    }

                    return { ...job, yarnRows, dyeingRows, aopRows, remarks: job.remarks || "" };
                });

                setJobs(transformed);
            } catch (error) {
                console.error("Failed to fetch balance sheet data:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchBalanceSheetData();
    }, [axiosSecure]);

    return (
        <div className="p-5 bg-slate-50 h-screen flex flex-col overflow-hidden" onClick={() => setOpenCol(null)}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3 flex-shrink-0">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">Yarn, Dyeing &amp; AOP Balance Sheet</h2>
                    <p className="text-xs text-slate-500 mt-1">Figures in kg unless noted · <span className="font-semibold text-slate-700">{filteredJobs.length}</span> of <span className="font-semibold text-slate-700">{jobs.length}</span> jobs shown</p>
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

                    <button
                        onClick={(e) => { e.stopPropagation(); exportExcel(); }}
                        disabled={isExporting || filteredJobs.length === 0}
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

            {hasUnsavedRemarks && (
                <div className="mb-3 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 shadow-sm flex-shrink-0">
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

            <div className="overflow-auto border border-[#b4bcc2] rounded-2xl shadow-sm bg-white relative flex-1 min-h-0">
                {isLoading && (
                    <div className="absolute inset-0 bg-white/80 z-50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-6 h-6 border-2 border-[#dfebf0] border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-medium text-slate-500">Loading data...</span>
                        </div>
                    </div>
                )}

                <table className="border-separate border-spacing-0 tabular-nums text-[11px] border border-[#b4bcc2]" style={{ width: '100%', minWidth: TOTAL_WIDTH }}>
                    <thead>
                        <tr>
                            <th
                                colSpan={7}
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
                            <th colSpan={6} style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#475569' }} className="px-0 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white border-r border-b border-[#b4bcc2]">
                                AOP
                            </th>
                            <th
                                className="px-0 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-white border-r border-b border-[#b4bcc2]"
                                style={{ position: 'sticky', top: 0, zIndex: 20, width: getColWidth('remarks'), backgroundColor: '#475569' }}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    REMARKS
                                    <ExcelFilter colId="remarks" allJobs={jobs} excluded={colFilters.remarks || new Set()} setExcluded={setExcludedFor} openCol={openCol} setOpenCol={setOpenCol} align="right" valueGetter={getColValueGetter('remarks')} />
                                </div>
                            </th>
                        </tr>
                        <tr>
                            {COLUMNS.map((col) => {
                                const isLastFrozen = col.id === 'yarnBalance';
                                return (
                                    <th
                                        key={col.id}
                                        style={headerCellStyle(col.id, {
                                            boxShadow: isLastFrozen ? FROZEN_DIVIDER_SHADOW : undefined
                                        })}
                                        className={`px-1 py-2 text-[10px] font-semibold uppercase border-r border-b border-[#b4bcc2] text-white ${col.id === 'jobNo' || col.id === 'yarnFactory' || col.id === 'dyeingFactory' || col.id === 'aopFactory' ? 'text-left' : 'text-right'}`}
                                    >
                                        <div className={`flex items-center ${col.id === 'jobNo' || col.id === 'yarnFactory' || col.id === 'dyeingFactory' || col.id === 'aopFactory' ? "" : "justify-end"} gap-1`}>
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

                        {displayedJobs.map(({ job, idx: jobIdx }) => {
                            const maxRows = Math.max(job.yarnRows.length, job.dyeingRows.length, job.aopRows.length, 1);

                            return Array.from({ length: maxRows }).map((_, rowIdx) => {
                                const yRow = job.yarnRows[rowIdx];
                                const dRow = job.dyeingRows[rowIdx];
                                const aRow = job.aopRows[rowIdx];
                                // Zebra-stripe by job group (matches the reference design) instead of
                                // per-group tint colors — applied as an inline override so it also
                                // works correctly on the sticky frozen columns.
                                const stripeBg = jobIdx % 2 === 0 ? '#ffffff' : '#f3f8f5';

                                return (
                                    <tr key={`${jobIdx}-${rowIdx}`} className="border-b border-slate-200 hover:bg-amber-50/40 transition-colors">
                                        {rowIdx === 0 && (
                                            <td rowSpan={maxRows} style={cellStyle("jobNo", { backgroundColor: stripeBg })} className="px-2 py-2 border-r border-b border-[#b4bcc2] align-middle text-center font-bold text-slate-800">{job.jobNo}</td>
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
                                <td style={footerCellStyle("jobNo", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569] text-center uppercase tracking-wide">Subtotal</td>
                                <td style={footerCellStyle("yarnFactory", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                                <td style={footerCellStyle("yarnReq", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.req.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("yarnIssue", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.issue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("knittingGrey", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.knittingGrey.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("yarnReturn", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.yarnReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("yarnBalance", { borderTop: '1px solid #b4bcc2', boxShadow: FROZEN_DIVIDER_SHADOW })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.yarnBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>

                                <td style={footerCellStyle("dyeingFactory", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                                <td style={footerCellStyle("greyDelivery", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.greyDelivery.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("greyReturn", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.greyReturn.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("greyRcvd", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.greyRcvd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("finishRcvd", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.finishRcvd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("dyeBalance", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.dyeBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("processLoss", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{(() => { const l = totals.greyRcvd ? (totals.greyRcvd - totals.finishRcvd) / totals.greyRcvd : null; return l === null ? "—" : `${(l * 100).toFixed(2)}%`; })()}</td>

                                <td style={footerCellStyle("aopFactory", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                                <td style={footerCellStyle("sentForAop", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.sentForAop.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("receivedFromAop", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.receivedFromAop.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("aopFinishRcvd", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.aopFinishRcvd.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("aopBalance", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{totals.aopBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td style={footerCellStyle("aopProcessLoss", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] text-right bg-[#475569]">{(() => { const l = totals.receivedFromAop ? (totals.receivedFromAop - totals.aopFinishRcvd) / totals.receivedFromAop : null; return l === null ? "—" : `${(l * 100).toFixed(2)}%`; })()}</td>

                                <td style={footerCellStyle("remarks", { borderTop: '1px solid #b4bcc2' })} className="px-2 py-3 border-r border-b border-[#b4bcc2] bg-[#475569]"></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {!hasFilters && filteredJobs.length > 0 && (
                <div className="flex items-center justify-between mt-4 px-1 flex-shrink-0">
                    <div className="text-xs text-slate-500">
                        Showing <span className="font-semibold text-slate-700">{startIndex + 1}</span> to <span className="font-semibold text-slate-700">{endIndex}</span> of <span className="font-semibold text-slate-700">{filteredJobs.length}</span> jobs
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">« First</button>
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">‹ Prev</button>
                        <span className="text-xs font-medium text-slate-700 px-3 py-1.5 bg-slate-100 rounded-md border border-slate-200">Page {currentPage} of {totalPages}</span>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Next ›</button>
                        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Last »</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BalanceSheet;