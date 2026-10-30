import React, { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import {
    Search,
    FileSpreadsheet,
    CheckCircle2,
    LayoutGrid,
    Table as TableIcon,
    X,
    Loader,
    Plus,
    Trash2,
    Maximize2,
    Minimize2,
} from "lucide-react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

// ================= CONSTANTS & DEFAULTS =================
const DEFAULT_DEDUCTION_RATE = 0.03; // 3% deducted from the gross bill
const TOTAL_COLS = 14;

// Default rate per dozen (Taka/Doz) by process operation
const DEFAULT_RATES = {
    "Body Hem": 45,
    "Neck Joint": 60,
    "Shoulder to Shoulder": 40,
    "Sleeve Hem": 35,
    "Sleeve Join": 55,
    "Cuff Join": 50,
    "Side Seam": 65,
};

// ================= HELPERS =================
const pad = (n) => String(n).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toYM = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const monthToRange = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${ym}-01`, to: `${ym}-${pad(lastDay)}` };
};

// Convert any record date to a LOCAL yyyy-mm-dd string (fixes UTC vs local mismatch)
const getRecordDay = (raw) => {
    if (!raw) return "";
    const s = String(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // plain date, use as is
    const d = new Date(raw);
    return isNaN(d.getTime()) ? s.slice(0, 10) : toYMD(d);
};

// Date range for the Quick buttons (days = 1 means Today)
const getDayRange = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    return { from: toYMD(start), to: toYMD(end) };
};

const formatTk = (amount) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(amount || 0));

const getCompositionName = (comp) => {
    if (!comp) return "";
    if (typeof comp === "string") return comp;
    return comp.name || comp.title || comp.label || "";
};

// Style name of a record — updated to deeply check styleRequirement based on your API structure
const getStyleName = (r) => {
    const raw =
        r?.jobs?.styleNo ??
        r?.jobs?.style ??
        r?.jobs?.styleName ??
        r?.styleReqRows?.styleRequirement?.styleNo ?? // <-- ADDED FOR YOUR API STRUCTURE
        r?.styleReqRows?.styleRequirement?.style ??   // <-- ADDED FALLBACK
        r?.styleReqRows?.styleNo ??
        r?.styleReqRows?.style ??
        r?.styleReqRows?.styleName ??
        r?.styleNo ??
        r?.style ??
        r?.styleName ??
        "";
    
    if (raw && typeof raw === "object") {
        return raw.name || raw.styleNo || raw.title || "";
    }
    return String(raw || "");
};

// Short / Excess = Total Production - Order Qty
const getVariance = (totalProd, orderQty) => {
    if (!(orderQty > 0)) return null;
    return totalProd - orderQty;
};

const EMPTY_FILTERS = {
    search: "",
    process: "",
    month: "",
    fromDate: "",
    toDate: "",
};

// ================= MAIN COMPONENT =================
const ContractBilling = () => {
    const axiosPrivate = useAxiosPrivate    ();

    // Data states
    const [records, setRecords] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [lastFetchedAt, setLastFetchedAt] = useState(null);
    const [now, setNow] = useState(() => new Date());

    // Configurable rates & policy
    const [rates, setRates] = useState(DEFAULT_RATES);
    const [deductionRate, setDeductionRate] = useState(DEFAULT_DEDUCTION_RATE);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [viewMode, setViewMode] = useState("table");
    const [isExporting, setIsExporting] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    // Add Process Modal States
    const [showAddProcessModal, setShowAddProcessModal] = useState(false);
    const [currentProcess, setCurrentProcess] = useState({ type: "", price: "" });
    const [processInputs, setProcessInputs] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Keep time fresh
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    // Track browser fullscreen state (also handles pressing Esc)
    useEffect(() => {
        const onChange = () => setIsFullScreen(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullScreen = async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
            } else {
                await document.exitFullscreen();
            }
        } catch (err) {
            console.error("Fullscreen failed:", err);
        }
    };

    // Fetch summary data from your API
    const fetchSummary = useCallback(
        async (isManual = false) => {
            if (isManual) setIsRefreshing(true);
            else setIsLoading(true);
            setError("");

            try {
                const { data } = await axiosPrivate.get("/api/get-contractual-job-summary");
                setRecords(Array.isArray(data) ? data : data ? [data] : []);
                setLastFetchedAt(new Date());
                console.log(data, "summary data");
            } catch (e) {
                console.error("Failed to load billing data:", e);
                setError("Could not load billing data. Please try again.");
            } finally {
                setIsLoading(false);
                setIsRefreshing(false);
            }
        },
        [axiosPrivate]
    );

    useEffect(() => {
        fetchSummary();
    }, [fetchSummary]);

    // Records inside the selected period (used for the "Showing X of Y" counter)
    const filteredRecords = useMemo(() => {
        const term = filters.search.trim().toLowerCase();
        return records.filter((r) => {
            if (term && !(r.jobs?.jobNo || "").toLowerCase().includes(term)) return false;
            if (filters.process && r.processType !== filters.process) return false;
            const day = getRecordDay(r.date);
            if (filters.fromDate && (!day || day < filters.fromDate)) return false;
            if (filters.toDate && (!day || day > filters.toDate)) return false;
            return true;
        });
    }, [records, filters]);

    // Search + process filter, everything up to "To Date".
    // Before "From Date" = PREVIOUS production, inside the range = RUNNING production.
    const scopedRecords = useMemo(() => {
        const term = filters.search.trim().toLowerCase();
        return records.filter((r) => {
            if (term && !(r.jobs?.jobNo || "").toLowerCase().includes(term)) return false;
            if (filters.process && r.processType !== filters.process) return false;
            const day = getRecordDay(r.date);
            if ((filters.fromDate || filters.toDate) && !day) return false;
            if (filters.toDate && day > filters.toDate) return false;
            return true;
        });
    }, [records, filters]);

    // Process list for dropdown
    const processOptions = useMemo(() => {
        const set = new Set(Object.keys(rates));
        records.forEach((r) => r.processType && set.add(r.processType));
        return Array.from(set).sort();
    }, [records, rates]);

    // Grouped structure: Job No -> Composition / Order Qty -> Process Rows
    const jobGroups = useMemo(() => {
        const hasDateFilter = Boolean(filters.fromDate || filters.toDate);
        const jobs = new Map();
        const styleByJob = new Map();

        scopedRecords.forEach((r) => {
            const jobNo = r.jobs?.jobNo || "—";
            const process = r.processType || "—";
            const qty = Number(r.output) || 0;
            const orderQty = Number(r.styleReqRows?.orderQty) || 0;
            const compKey = r.styleReqRows?.id ?? r.styleReqRowsId ?? `qty-${orderQty}`;
            const day = getRecordDay(r.date);
            const isPrevious = Boolean(filters.fromDate && day && day < filters.fromDate);

            // Remember the first style name found for this job
            if (!styleByJob.get(jobNo)) {
                const styleName = getStyleName(r);
                if (styleName) styleByJob.set(jobNo, styleName);
            }

            if (!jobs.has(jobNo)) jobs.set(jobNo, new Map());
            const comps = jobs.get(jobNo);

            if (!comps.has(compKey)) {
                comps.set(compKey, {
                    key: compKey,
                    orderQty,
                    label: getCompositionName(r.styleReqRows?.composition),
                    rowsByProcess: new Map(),
                });
            }
            const comp = comps.get(compKey);

            if (!comp.rowsByProcess.has(process)) {
                // FIX: Check r.processRate as well as r.rate, safely handling "NULL" strings
                const rawRate = r.rate ?? r.processRate ?? rates[process] ?? 0;
                const rate = Number(rawRate) || 0;
                
                comp.rowsByProcess.set(process, {
                    jobNo,
                    process,
                    prevQty: 0,
                    pcQty: 0, // running production (billed)
                    rate,
                });
            }
            const row = comp.rowsByProcess.get(process);
            if (isPrevious) row.prevQty += qty;
            else row.pcQty += qty;
        });

        // Build groups. With a date filter (Today, Last 7 Days, month...) keep only
        // rows that were actually produced inside the selected period.
        const groups = Array.from(jobs.entries())
            .map(([jobNo, comps]) => {
                const compList = Array.from(comps.values())
                    .map((comp) => ({
                        key: comp.key,
                        orderQty: comp.orderQty,
                        label: comp.label,
                        rows: Array.from(comp.rowsByProcess.values())
                            .filter((row) => !hasDateFilter || row.pcQty > 0)
                            .map((row) => ({ ...row, totalQty: row.prevQty + row.pcQty })),
                    }))
                    .filter((comp) => comp.rows.length > 0);
                return { jobNo, style: styleByJob.get(jobNo) || "", comps: compList };
            })
            .filter((g) => g.comps.length > 0);

        // Serial numbers + row counts after filtering
        let sl = 0;
        return groups.map((g) => {
            const comps = g.comps.map((c) => ({
                ...c,
                rows: c.rows.map((row) => ({ ...row, sl: ++sl })),
            }));
            return {
                jobNo: g.jobNo,
                style: g.style,
                comps,
                rowCount: comps.reduce((sum, c) => sum + c.rows.length, 0),
            };
        });
    }, [scopedRecords, rates, filters.fromDate, filters.toDate]);

    const uniqueRows = useMemo(
        () => jobGroups.flatMap((g) => g.comps.flatMap((c) => c.rows)),
        [jobGroups]
    );

    const totalOrderQty = useMemo(
        () => jobGroups.reduce((sum, g) => sum + g.comps.reduce((s, c) => s + c.orderQty, 0), 0),
        [jobGroups]
    );

    // Billing aggregates: Payable = Gross Bill - 3% deduction
    const {
        totalPrevPcs,
        totalBillingPcs,
        totalProductionPcs,
        totalDozens,
        totalBillAmount,
        deductionAmount,
        netBillAmountTk,
    } = useMemo(() => {
        const prevPcs = uniqueRows.reduce((sum, r) => sum + (r.prevQty || 0), 0);
        const totalPcs = uniqueRows.reduce((sum, r) => sum + (r.pcQty || 0), 0);
        const totalDoz = totalPcs / 12;

        const billTotal = uniqueRows.reduce((sum, r) => {
            if (!(r.pcQty > 0)) return sum;
            const dozen = r.pcQty / 12;
            return sum + Math.round(dozen * (r.rate || 0));
        }, 0);

        const deduction = Math.round(billTotal * deductionRate);
        const net = billTotal - deduction;

        return {
            totalPrevPcs: prevPcs,
            totalBillingPcs: totalPcs,
            totalProductionPcs: prevPcs + totalPcs,
            totalDozens: totalDoz,
            totalBillAmount: billTotal,
            deductionAmount: deduction,
            netBillAmountTk: net,
        };
    }, [uniqueRows, deductionRate]);

    const deductionPercentLabel = `${(deductionRate * 100).toFixed(0)}%`;

    const hasActiveFilters = Boolean(
        filters.search || filters.process || filters.fromDate || filters.toDate || filters.month
    );

    // ================= EXCEL EXPORT =================
    const handleExportExcel = async () => {
        if (uniqueRows.length === 0) return;
        setIsExporting(true);

        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet("Contract Bill", {
                views: [{ state: "frozen", ySplit: 4 }],
                pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            });

            const thin = { style: "thin", color: { argb: "FFCBD5E1" } };
            const border = { top: thin, left: thin, bottom: thin, right: thin };

            ws.columns = [
                { width: 6 },   // SL
                { width: 18 },  // Job
                { width: 18 },  // Style
                { width: 24 },  // Process
                { width: 12 },  // Order Qty
                { width: 14 },  // Previous
                { width: 14 },  // Running
                { width: 14 },  // Total
                { width: 16 },  // Short / Excess
                { width: 12 },  // Billed Pcs
                { width: 14 },  // Less ded
                { width: 11 },  // Doz
                { width: 13 },  // Rate
                { width: 16 },  // Total Taka
            ];

            // Title
            ws.mergeCells(1, 1, 1, TOTAL_COLS);
            const titleCell = ws.getCell(1, 1);
            titleCell.value = "Sewing Contract Bill Statement";
            titleCell.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
            titleCell.alignment = { horizontal: "center", vertical: "middle" };
            titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF047857" } };
            ws.getRow(1).height = 28;

            // Sub title (filters)
            const periodText =
                filters.fromDate || filters.toDate
                    ? `Period: ${filters.fromDate || "Start"} to ${filters.toDate || "Today"}`
                    : "Period: All Dates";
            const extra = [
                filters.process ? `Process: ${filters.process}` : "",
                filters.search ? `Job: ${filters.search}` : "",
            ]
                .filter(Boolean)
                .join("   |   ");
            ws.mergeCells(2, 1, 2, TOTAL_COLS);
            const subCell = ws.getCell(2, 1);
            subCell.value = [periodText, extra, `Generated: ${now.toLocaleDateString("en-GB")}`]
                .filter(Boolean)
                .join("   |   ");
            subCell.font = { italic: true, size: 10, color: { argb: "FF475569" } };
            subCell.alignment = { horizontal: "center", vertical: "middle" };

            // Header
            const headers = [
                "SL",
                "Job Number",
                "Style",
                "Process Operation",
                "Order Qty",
                "Previous Production",
                "Running Production",
                "Total Production",
                "Short / Excess",
                "Billed Pcs",
                `Less ${deductionPercentLabel} Ded.`,
                "Doz. Qty",
                "Rate (Tk/Doz)",
                "Total Taka",
            ];
            const headerRow = ws.getRow(4);
            headerRow.values = headers;
            headerRow.height = 34;
            headerRow.eachCell((cell) => {
                cell.font = { bold: true, size: 10, color: { argb: "FF0F172A" } };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
                cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                cell.border = border;
            });

            // Data rows
            let rowIdx = 5;
            const firstDataRow = rowIdx;

            jobGroups.forEach((group) => {
                const jobStart = rowIdx;

                group.comps.forEach((comp) => {
                    const compStart = rowIdx;

                    comp.rows.forEach((item) => {
                        const hasQty = item.pcQty > 0;
                        const dozen = hasQty ? item.pcQty / 12 : 0;
                        const line = hasQty ? Math.round(dozen * (item.rate || 0)) : 0;
                        const variance = getVariance(item.totalQty, comp.orderQty);

                        ws.getRow(rowIdx).values = [
                            item.sl,
                            group.jobNo,
                            group.style || "",
                            item.process,
                            comp.orderQty > 0 ? comp.orderQty : "",
                            item.prevQty || 0,
                            item.pcQty || 0,
                            item.totalQty || 0,
                            variance === null ? "" : variance,
                            hasQty ? item.pcQty : 0,
                            hasQty ? Math.round(item.pcQty * deductionRate) : 0,
                            Number(dozen.toFixed(2)),
                            Number(item.rate) || 0,
                            line,
                        ];
                        rowIdx++;
                    });

                    if (comp.rows.length > 1) ws.mergeCells(compStart, 5, rowIdx - 1, 5);
                });

                if (group.rowCount > 1) {
                    ws.mergeCells(jobStart, 2, rowIdx - 1, 2);
                    ws.mergeCells(jobStart, 3, rowIdx - 1, 3);
                }
            });

            const lastDataRow = rowIdx - 1;

            // Style data rows
            for (let r = firstDataRow; r <= lastDataRow; r++) {
                const row = ws.getRow(r);
                for (let c = 1; c <= TOTAL_COLS; c++) {
                    const cell = row.getCell(c);
                    cell.border = border;
                    cell.font = { size: 10 };
                    cell.alignment = {
                        vertical: "middle",
                        horizontal: c === 1 || c === 2 || c === 3 ? "center" : c === 4 ? "left" : "right",
                        wrapText: c === 3,
                    };

                    if ([5, 6, 7, 8, 10, 11].includes(c)) cell.numFmt = "#,##0";
                    if (c === 9) cell.numFmt = "+#,##0;-#,##0;0";
                    if (c === 12) cell.numFmt = "0.00";
                    if (c === 13) cell.numFmt = "0.00";
                    if (c === 14) cell.numFmt = "#,##0";

                    if (c === 2) cell.font = { size: 10, bold: true, color: { argb: "FF3730A3" } };
                    if (c === 7 || c === 8 || c === 10 || c === 14) cell.font = { size: 10, bold: true };
                    if (c === 9 && typeof cell.value === "number") {
                        cell.font = {
                            size: 10,
                            bold: true,
                            color: { argb: cell.value < 0 ? "FFDC2626" : cell.value > 0 ? "FF059669" : "FF475569" },
                        };
                    }
                }
            }

            // Footer: statement total (gross)
            const totalRowNum = lastDataRow + 1;
            const totalRow = ws.getRow(totalRowNum);
            ws.mergeCells(totalRowNum, 1, totalRowNum, 4);
            totalRow.getCell(1).value = "STATEMENT TOTAL";
            totalRow.getCell(5).value = totalOrderQty > 0 ? totalOrderQty : "";
            totalRow.getCell(6).value = totalPrevPcs;
            totalRow.getCell(7).value = totalBillingPcs;
            totalRow.getCell(8).value = totalProductionPcs;
            totalRow.getCell(9).value = "";
            totalRow.getCell(10).value = totalBillingPcs;
            totalRow.getCell(11).value = "";
            totalRow.getCell(12).value = Number(totalDozens.toFixed(2));
            totalRow.getCell(13).value = "Gross Total";
            totalRow.getCell(14).value = totalBillAmount;

            for (let c = 1; c <= TOTAL_COLS; c++) {
                const cell = totalRow.getCell(c);
                cell.font = { bold: true, size: 10 };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
                cell.border = {
                    top: { style: "medium", color: { argb: "FF94A3B8" } },
                    left: thin,
                    bottom: thin,
                    right: thin,
                };
                cell.alignment = { vertical: "middle", horizontal: c === 1 ? "center" : "right" };
                if ([5, 6, 7, 8, 10, 14].includes(c)) cell.numFmt = "#,##0";
                if (c === 12) cell.numFmt = "0.00";
            }
            totalRow.height = 22;

            // Footer: deduction + payable amount
            const addSummaryRow = (rowNum, label, value, color, bold = false, fillArgb = null) => {
                const row = ws.getRow(rowNum);
                ws.mergeCells(rowNum, 1, rowNum, 13);
                row.getCell(1).value = label;
                row.getCell(14).value = value;
                for (let c = 1; c <= TOTAL_COLS; c++) {
                    const cell = row.getCell(c);
                    cell.border = border;
                    cell.font = { bold, size: bold ? 11 : 10, color: { argb: color } };
                    cell.alignment = { vertical: "middle", horizontal: "right" };
                    if (fillArgb) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
                }
                row.getCell(14).numFmt = "#,##0;-#,##0;0";
                row.height = bold ? 24 : 20;
            };

            addSummaryRow(
                totalRowNum + 1,
                `Less: ${deductionPercentLabel} deduction`,
                -deductionAmount,
                "FFDC2626"
            );
            addSummaryRow(
                totalRowNum + 2,
                `PAYABLE AMOUNT AFTER ${deductionPercentLabel} DEDUCTION (Tk.)`,
                netBillAmountTk,
                "FF064E3B",
                true,
                "FFD1FAE5"
            );

            // Signature lines
            const sigRow = totalRowNum + 5;
            const sigs = [
                { col: 1, to: 3, label: "Prepared By" },
                { col: 4, to: 6, label: "Floor Supervisor" },
                { col: 7, to: 9, label: "Accounts / Audit" },
                { col: 10, to: 14, label: "Contractor Signature" },
            ];
            sigs.forEach(({ col, to, label }) => {
                ws.mergeCells(sigRow, col, sigRow, to);
                const cell = ws.getCell(sigRow, col);
                cell.value = label;
                cell.font = { size: 10, bold: true, color: { argb: "FF334155" } };
                cell.alignment = { horizontal: "center" };
                cell.border = { top: { style: "thin", color: { argb: "FF64748B" } } };
            });

            // Download
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Contract_Bill_${toYMD(new Date())}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Excel export failed:", err);
            alert("Failed to export Excel file. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    // ================= ADD PROCESS HANDLERS =================
    const handleAddProcessInput = () => {
        if (!currentProcess.type.trim() || !currentProcess.price) return;

        setProcessInputs((prev) => [
            ...prev,
            { processType: currentProcess.type.trim(), price: Number(currentProcess.price) },
        ]);
        setCurrentProcess({ type: "", price: "" });
    };

    const handleRemoveProcessInput = (index) => {
        setProcessInputs((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmitProcesses = async () => {
        if (processInputs.length === 0) return;

        setIsSubmitting(true);
        try {
            await axiosPrivate.post("/api/add-process-types", processInputs);

            setProcessInputs([]);
            setCurrentProcess({ type: "", price: "" });
            setShowAddProcessModal(false);

            fetchSummary(true);
        } catch (err) {
            console.error("Failed to save processes:", err);
            alert("Failed to save processes. Please check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetAddProcessModal = () => {
        setShowAddProcessModal(false);
        setProcessInputs([]);
        setCurrentProcess({ type: "", price: "" });
    };

    // Renders the Short / Excess cell content
    const renderVariance = (totalProd, orderQty) => {
        const v = getVariance(totalProd, orderQty);
        if (v === null) return <span className="text-slate-400">—</span>;
        if (v < 0)
            return (
                <span className="text-rose-600 font-bold">
                    Short {Math.abs(v).toLocaleString()}
                </span>
            );
        if (v > 0)
            return (
                <span className="text-emerald-600 font-bold">
                    Excess {v.toLocaleString()}
                </span>
            );
        return <span className="text-slate-500 font-semibold">0</span>;
    };

    return (
        <div className="min-h-screen w-full bg-slate-50/70 p-2 md:p-4 font-sans text-slate-800 print:bg-white print:p-0">
            <div className="w-full space-y-3">

                {/* ================= FILTERS & TOOLBAR ================= */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3 print:hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">Filter Records</span>
                            {hasActiveFilters && (
                                <button
                                    type="button"
                                    onClick={() => setFilters(EMPTY_FILTERS)}
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                                >
                                    <X size={12} /> Clear all
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* View Mode Toggle */}
                            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl text-xs font-medium">
                                <button
                                    type="button"
                                    onClick={() => setViewMode("table")}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${viewMode === "table"
                                            ? "bg-white text-slate-900 shadow-xs font-semibold"
                                            : "text-slate-600 hover:text-slate-900"
                                        }`}
                                >
                                    <TableIcon size={14} /> Table View
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode("cards")}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${viewMode === "cards"
                                            ? "bg-white text-slate-900 shadow-xs font-semibold"
                                            : "text-slate-600 hover:text-slate-900"
                                        }`}
                                >
                                    <LayoutGrid size={14} /> Job Cards
                                </button>
                            </div>

                            {/* Full Screen */}
                            <button
                                type="button"
                                onClick={toggleFullScreen}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 shadow-sm transition-all"
                            >
                                {isFullScreen ? (
                                    <>
                                        <Minimize2 size={14} /> Exit Full Screen
                                    </>
                                ) : (
                                    <>
                                        <Maximize2 size={14} /> Full Screen
                                    </>
                                )}
                            </button>

                            {/* Export Bill Excel */}
                            <button
                                type="button"
                                onClick={handleExportExcel}
                                disabled={isExporting || isLoading || uniqueRows.length === 0}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-emerald-600 text-emerald-700 text-xs font-semibold hover:bg-emerald-50 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExporting ? (
                                    <>
                                        <Loader size={14} className="animate-spin" /> Exporting...
                                    </>
                                ) : (
                                    <>
                                        <FileSpreadsheet size={14} /> Export Bill Excel
                                    </>
                                )}
                            </button>

                            {/* Add Process Primary Button */}
                            <button
                                type="button"
                                onClick={() => setShowAddProcessModal(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-sm hover:shadow-md transition-all"
                            >
                                <Plus size={14} /> Add Process
                            </button>
                        </div>
                    </div>

                    {/* Filter Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-3.5 text-slate-400" />
                            <input
                                type="text"
                                value={filters.search}
                                onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
                                placeholder="Search Job No..."
                                className="w-full text-xs pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <select
                                value={filters.process}
                                onChange={(e) => setFilters((p) => ({ ...p, process: e.target.value }))}
                                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                            >
                                <option value="">All Process Operations</option>
                                {processOptions.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <input
                                type="month"
                                value={filters.month}
                                onChange={(e) => {
                                    const ym = e.target.value;
                                    if (!ym) {
                                        setFilters((p) => ({ ...p, month: "", fromDate: "", toDate: "" }));
                                    } else {
                                        const { from, to } = monthToRange(ym);
                                        setFilters((p) => ({ ...p, month: ym, fromDate: from, toDate: to }));
                                    }
                                }}
                                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <input
                                type="date"
                                value={filters.fromDate}
                                max={filters.toDate || undefined}
                                onChange={(e) => setFilters((p) => ({ ...p, month: "", fromDate: e.target.value }))}
                                placeholder="From Date"
                                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <input
                                type="date"
                                value={filters.toDate}
                                min={filters.fromDate || undefined}
                                onChange={(e) => setFilters((p) => ({ ...p, month: "", toDate: e.target.value }))}
                                placeholder="To Date"
                                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                            />
                        </div>
                    </div>

                    {/* Quick Date Shortcuts */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
                                Quick:
                            </span>

                            {[
                                { label: "Today", days: 1 },
                                { label: "Last 7 Days", days: 7 },
                                { label: "Last 30 Days", days: 30 },
                            ].map(({ label, days }) => {
                                const { from, to } = getDayRange(days);
                                const isActive = filters.fromDate === from && filters.toDate === to;

                                return (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() =>
                                            setFilters((p) => ({
                                                ...p,
                                                month: "",
                                                fromDate: from,
                                                toDate: to,
                                            }))
                                        }
                                        className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${isActive
                                                ? "bg-emerald-600 border-emerald-600 text-white font-semibold"
                                                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                                            }`}
                                    >
                                        {label}
                                    </button>
                                );
                            })}

                            {[
                                { label: "This Month", offset: 0 },
                                { label: "Last Month", offset: -1 },
                            ].map(({ label, offset }) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => {
                                        const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
                                        const ym = toYM(target);
                                        const { from, to } = monthToRange(ym);
                                        setFilters((p) => ({ ...p, month: ym, fromDate: from, toDate: to }));
                                    }}
                                    className="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        <div className="text-xs text-slate-500">
                            Showing <strong className="text-slate-800">{filteredRecords.length}</strong> of{" "}
                            <strong className="text-slate-800">{records.length}</strong> entries
                        </div>
                    </div>
                </div>

                {/* ================= MAIN CONTENT ================= */}
                {viewMode === "table" ? (
                    /* TABLE VIEW — fills the remaining screen, scrolls inside */
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden w-full">
                        <div
                            className="overflow-auto w-full print:!max-h-none print:overflow-visible"
                            style={{ maxHeight: "calc(100vh - 250px)", minHeight: "320px" }}
                        >
                            <table className="w-full min-w-[1250px] text-left border-collapse text-xs">
                                <thead className="sticky top-0 z-20 bg-slate-100 shadow-[0_1px_0_0_rgb(203,213,225)]">
                                    <tr className="text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                                        <th className="py-3 px-3 text-center w-12 border-r border-slate-200/70">SL</th>
                                        <th className="py-3 px-4 border-r border-slate-200/70">Job Number</th>
                                        <th className="py-3 px-4 border-r border-slate-200/70">Style</th>
                                        <th className="py-3 px-4 border-r border-slate-200/70">Process Operation</th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70">Order Qty</th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70 bg-sky-50 text-sky-800">
                                            Previous Prod.
                                        </th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70 bg-sky-50 text-sky-800">
                                            Running Prod.
                                        </th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70 bg-sky-100 text-sky-900 font-bold">
                                            Total Prod.
                                        </th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70 bg-amber-50 text-amber-800">
                                            Short / Excess
                                        </th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70 font-bold text-slate-900">
                                            Billed Pcs
                                        </th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70 text-slate-400">
                                            Less {deductionPercentLabel} Ded.
                                        </th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70">Doz. Qty</th>
                                        <th className="py-3 px-4 text-right border-r border-slate-200/70">Rate (৳/Doz)</th>
                                        <th className="py-3 px-4 text-right font-bold text-slate-900">Total Taka (৳)</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={TOTAL_COLS} className="py-14 text-center text-slate-400">
                                                <Loader size={24} className="animate-spin inline-block text-emerald-600" />
                                                <span className="block mt-2 text-xs font-medium">Loading billing statements...</span>
                                            </td>
                                        </tr>
                                    ) : error ? (
                                        <tr>
                                            <td colSpan={TOTAL_COLS} className="py-12 text-center text-rose-600 font-medium">
                                                {error}
                                            </td>
                                        </tr>
                                    ) : jobGroups.length === 0 ? (
                                        <tr>
                                            <td colSpan={TOTAL_COLS} className="py-14 text-center text-slate-400">
                                                No billing records found matching your active filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        jobGroups.flatMap((group, gIdx) =>
                                            group.comps.flatMap((comp, cIdx) =>
                                                comp.rows.map((item, rIdx) => {
                                                    const isFirstOfJob = cIdx === 0 && rIdx === 0;
                                                    const isFirstOfComp = rIdx === 0;
                                                    const hasQty = item.pcQty > 0;
                                                    const deductionPcs = hasQty ? item.pcQty * deductionRate : 0;
                                                    const dozenQty = hasQty ? item.pcQty / 12 : 0;
                                                    const lineTotal = dozenQty * (item.rate || 0);

                                                    return (
                                                        <tr
                                                            key={`${group.jobNo}-${comp.key}-${item.process}`}
                                                            className={`hover:bg-emerald-50/30 transition-colors ${gIdx % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                                                                }`}
                                                        >
                                                            {/* Serial */}
                                                            <td className="py-3 px-3 text-center font-bold text-slate-700 border-r border-slate-200/70">
                                                                {item.sl}
                                                            </td>

                                                            {/* Job No (Rowspan) */}
                                                            {isFirstOfJob && (
                                                                <td
                                                                    rowSpan={group.rowCount}
                                                                    className="py-3 px-4 font-bold text-slate-900 align-top border-r border-slate-200/70 bg-indigo-50/20"
                                                                >
                                                                    <div className="sticky top-12">
                                                                        <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-100/80 text-indigo-800 font-mono text-xs">
                                                                            {group.jobNo}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                            )}

                                                            {/* Style (Rowspan) */}
                                                            {isFirstOfJob && (
                                                                <td
                                                                    rowSpan={group.rowCount}
                                                                    className="py-3 px-4 font-semibold text-slate-800 align-top border-r border-slate-200/70 bg-indigo-50/10"
                                                                >
                                                                    <div className="sticky top-12">
                                                                        {group.style || <span className="text-slate-400">—</span>}
                                                                    </div>
                                                                </td>
                                                            )}

                                                            {/* Process */}
                                                            <td className="py-3 px-4 font-medium text-slate-800 border-r border-slate-200/70">
                                                                {item.process}
                                                            </td>

                                                            {/* Order Qty (Rowspan) */}
                                                            {isFirstOfComp && (
                                                                <td
                                                                    rowSpan={comp.rows.length}
                                                                    className="py-3 px-4 text-right align-top border-r border-slate-200/70 bg-slate-50/60"
                                                                >
                                                                    <span className="font-bold text-slate-800">
                                                                        {comp.orderQty > 0 ? comp.orderQty.toLocaleString() : "—"}
                                                                    </span>
                                                                    {comp.label && (
                                                                        <span className="block text-[10px] text-slate-400 font-normal truncate max-w-[130px] ml-auto">
                                                                            {comp.label}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            )}

                                                            {/* Previous Production */}
                                                            <td className="py-3 px-4 text-right font-mono text-slate-700 border-r border-slate-200/70 bg-sky-50/30">
                                                                {item.prevQty > 0 ? item.prevQty.toLocaleString() : "0"}
                                                            </td>

                                                            {/* Running Production */}
                                                            <td className="py-3 px-4 text-right font-mono text-slate-700 border-r border-slate-200/70 bg-sky-50/30">
                                                                {item.pcQty > 0 ? item.pcQty.toLocaleString() : "0"}
                                                            </td>

                                                            {/* Total Production */}
                                                            <td className="py-3 px-4 text-right font-mono font-bold text-sky-900 border-r border-slate-200/70 bg-sky-50/50">
                                                                {item.totalQty.toLocaleString()}
                                                            </td>

                                                            {/* Short / Excess */}
                                                            <td className="py-3 px-4 text-right font-mono border-r border-slate-200/70 bg-amber-50/30">
                                                                {renderVariance(item.totalQty, comp.orderQty)}
                                                            </td>

                                                            {/* Billed Pcs */}
                                                            <td className="py-3 px-4 text-right font-bold text-slate-900 border-r border-slate-200/70">
                                                                {hasQty ? item.pcQty.toLocaleString() : "—"}
                                                            </td>

                                                            {/* Deduction pcs */}
                                                            <td className="py-3 px-4 text-right text-slate-400 border-r border-slate-200/70">
                                                                {hasQty ? Math.round(deductionPcs).toLocaleString() : "—"}
                                                            </td>

                                                            {/* Dozen Qty */}
                                                            <td className="py-3 px-4 text-right font-mono text-slate-700 border-r border-slate-200/70">
                                                                {hasQty ? dozenQty.toFixed(2) : "0.00"}
                                                            </td>

                                                            {/* Rate */}
                                                            <td className="py-3 px-4 text-right font-mono text-slate-800 border-r border-slate-200/70">
                                                                ৳{Number(item.rate).toFixed(2)}
                                                            </td>

                                                            {/* Line Total */}
                                                            <td className="py-3 px-4 text-right font-bold font-mono text-slate-900">
                                                                ৳{hasQty ? formatTk(lineTotal) : "—"}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )
                                        )
                                    )}
                                </tbody>

                                {/* Bill Summary Footer */}
                                <tfoot>
                                    {/* Gross total */}
                                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                                        <td colSpan={4} className="py-3 px-4 text-center uppercase tracking-wider text-slate-600 border-r border-slate-200/70">
                                            Statement Total
                                        </td>
                                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 border-r border-slate-200/70">
                                            {totalOrderQty > 0 ? totalOrderQty.toLocaleString() : "—"}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 border-r border-slate-200/70">
                                            {totalPrevPcs.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 border-r border-slate-200/70">
                                            {totalBillingPcs.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono font-extrabold text-sky-900 border-r border-slate-200/70">
                                            {totalProductionPcs.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-center text-slate-400 border-r border-slate-200/70">
                                            —
                                        </td>
                                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 border-r border-slate-200/70">
                                            {totalBillingPcs.toLocaleString()}
                                        </td>
                                        <td className="py-3 px-4 text-center text-slate-400 border-r border-slate-200/70">
                                            —
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 border-r border-slate-200/70">
                                            {totalDozens.toFixed(2)}
                                        </td>
                                        <td className="py-3 px-4 text-right text-slate-600 font-semibold border-r border-slate-200/70">
                                            Gross Total
                                        </td>
                                        <td className="py-3 px-4 text-right font-mono text-sm font-extrabold text-slate-900">
                                            ৳{formatTk(totalBillAmount)}
                                        </td>
                                    </tr>

                                    {/* Deduction row */}
                                    <tr className="border-t border-slate-200 bg-white text-slate-700">
                                        <td colSpan={TOTAL_COLS - 2} className="border-r border-slate-200/70"></td>
                                        <td className="py-2.5 px-4 text-right text-slate-500 font-medium italic border-r border-slate-200/70">
                                            Less: {deductionPercentLabel} deduction
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-rose-600">
                                            - ৳{formatTk(deductionAmount)}
                                        </td>
                                    </tr>

                                    {/* Payable amount after deduction */}
                                    <tr className="border-t-2 border-emerald-500 bg-emerald-50/80 text-emerald-950 font-extrabold text-sm">
                                        <td colSpan={TOTAL_COLS - 2} className="border-r border-emerald-200/60"></td>
                                        <td className="py-3.5 px-4 text-right uppercase tracking-wider text-xs border-r border-emerald-200/60 text-emerald-900">
                                            Payable Amount (After {deductionPercentLabel} Deduction)
                                        </td>
                                        <td className="py-3.5 px-4 text-right font-mono text-base text-emerald-700 font-black">
                                            ৳ {formatTk(netBillAmountTk)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* JOB CARDS VIEW — responsive grid that uses the whole width */
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                        {jobGroups.map((group) => {
                            const jobTotalPcs = group.comps.flatMap((c) => c.rows).reduce((sum, r) => sum + r.pcQty, 0);
                            const jobTotalDoz = jobTotalPcs / 12;
                            const jobBillAmount = group.comps
                                .flatMap((c) => c.rows)
                                .reduce((sum, r) => sum + Math.round((r.pcQty / 12) * (r.rate || 0)), 0);
                            const jobDeduction = Math.round(jobBillAmount * deductionRate);
                            const jobPayable = jobBillAmount - jobDeduction;

                            return (
                                <div
                                    key={group.jobNo}
                                    className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4 hover:border-emerald-300 transition-colors"
                                >
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <div>
                                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                                                Job Order
                                            </span>
                                            <h3 className="text-base font-bold text-slate-900 font-mono">
                                                {group.jobNo}
                                            </h3>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-slate-400">Gross Bill</span>
                                            <div className="text-sm font-extrabold font-mono text-slate-800">
                                                ৳{formatTk(jobBillAmount)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Compositions and processes */}
                                    {group.comps.map((comp) => (
                                        <div key={comp.key} className="space-y-2">
                                            <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg text-slate-600">
                                                <span>{comp.label || "Composition"}</span>
                                                <span className="font-bold">Target: {comp.orderQty.toLocaleString()} pcs</span>
                                            </div>

                                            <div className="divide-y divide-slate-100 text-xs">
                                                {comp.rows.map((row) => (
                                                    <div key={row.process} className="py-2 flex items-center justify-between">
                                                        <div>
                                                            <span className="font-medium text-slate-800">{row.process}</span>
                                                            <span className="text-slate-400 text-[11px] block">
                                                                @ ৳{row.rate}/doz
                                                            </span>
                                                            <span className="text-slate-400 text-[11px] block">
                                                                Prev {row.prevQty.toLocaleString()} • Total{" "}
                                                                {row.totalQty.toLocaleString()} •{" "}
                                                                {renderVariance(row.totalQty, comp.orderQty)}
                                                            </span>
                                                        </div>
                                                        <div className="text-right font-mono">
                                                            <span className="font-semibold text-slate-900 block">
                                                                {row.pcQty.toLocaleString()} pcs ({(row.pcQty / 12).toFixed(1)} dz)
                                                            </span>
                                                            <span className="text-[11px] text-slate-500">
                                                                ৳{formatTk((row.pcQty / 12) * row.rate)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs font-medium">
                                        <div className="flex items-center justify-between text-slate-500">
                                            <span>Total Job Volume:</span>
                                            <span className="font-bold text-slate-800">
                                                {jobTotalPcs.toLocaleString()} pcs ({jobTotalDoz.toFixed(1)} doz)
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-slate-500">
                                            <span>Less {deductionPercentLabel} deduction:</span>
                                            <span className="font-mono font-semibold text-rose-600">
                                                - ৳{formatTk(jobDeduction)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-emerald-800">
                                            <span className="font-bold">Payable Amount:</span>
                                            <span className="font-mono font-extrabold text-emerald-700">
                                                ৳{formatTk(jobPayable)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ================= PRINT VOUCHER SIGNATURES ================= */}
                <div className="hidden print:block pt-14 space-y-12">
                    <div className="grid grid-cols-4 gap-6 text-center text-xs text-slate-800">
                        <div className="border-t border-slate-400 pt-2 font-medium">Prepared By</div>
                        <div className="border-t border-slate-400 pt-2 font-medium">Floor Supervisor</div>
                        <div className="border-t border-slate-400 pt-2 font-medium">Accounts / Audit</div>
                        <div className="border-t border-slate-400 pt-2 font-medium">Contractor Signature</div>
                    </div>
                    <p className="text-[10px] text-center text-slate-400">
                        Generated via Sewing Contract Billing Management System • {new Date().toLocaleDateString("en-GB")}
                    </p>
                </div>
            </div>

            {/* ================= ADD PROCESS MODAL ================= */}
            {showAddProcessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Add Contract Processes</h3>
                                <p className="text-xs text-slate-500">Add multiple process types and their rates to be saved.</p>
                            </div>
                            <button
                                type="button"
                                onClick={resetAddProcessModal}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Input Area */}
                        <div className="flex flex-col sm:flex-row gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                            <div className="flex-1">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Process Type</label>
                                <input
                                    type="text"
                                    value={currentProcess.type}
                                    onChange={(e) => setCurrentProcess({ ...currentProcess, type: e.target.value })}
                                    placeholder="e.g., Body Hem"
                                    className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    onKeyDown={(e) => e.key === "Enter" && handleAddProcessInput()}
                                />
                            </div>
                            <div className="w-full sm:w-32">
                                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Price (৳/Doz)</label>
                                <input
                                    type="number"
                                    value={currentProcess.price}
                                    onChange={(e) => setCurrentProcess({ ...currentProcess, price: e.target.value })}
                                    placeholder="0.00"
                                    className="w-full text-xs px-3 py-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                                    onKeyDown={(e) => e.key === "Enter" && handleAddProcessInput()}
                                />
                            </div>
                            <div className="flex items-end">
                                <button
                                    type="button"
                                    onClick={handleAddProcessInput}
                                    disabled={!currentProcess.type.trim() || !currentProcess.price}
                                    className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        </div>

                        {/* List Area */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">
                                    Items to Submit ({processInputs.length})
                                </label>
                                {processInputs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setProcessInputs([])}
                                        className="text-[11px] text-rose-600 hover:text-rose-700 font-medium hover:underline"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>

                            {processInputs.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                                    No processes added yet. Use the form above to add items.
                                </div>
                            ) : (
                                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white">
                                    {processInputs.map((item, index) => (
                                        <div key={index} className="py-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                                    {index + 1}
                                                </span>
                                                <div>
                                                    <span className="text-sm font-semibold text-slate-800 block">{item.processType}</span>
                                                    <span className="text-[11px] text-slate-500">Rate: ৳{Number(item.price).toFixed(2)} / Doz</span>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveProcessInput(index)}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                                title="Remove"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={resetAddProcessModal}
                                disabled={isSubmitting}
                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitProcesses}
                                disabled={processInputs.length === 0 || isSubmitting}
                                className="px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader size={14} className="animate-spin" /> Saving...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={14} /> Save Processes
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ================= RATES & POLICY MODAL ================= */}
            {showSettingsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Contract Rates & Deductions</h3>
                                <p className="text-xs text-slate-500">Configure Taka per dozen rates and the bill deduction rate.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSettingsModal(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Deduction */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Deduction Rate (%)
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.5"
                                    value={deductionRate * 100}
                                    onChange={(e) => setDeductionRate(Number(e.target.value) / 100)}
                                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white"
                                />
                                <span className="absolute right-2.5 top-2 text-xs text-slate-400">%</span>
                            </div>
                        </div>

                        {/* Rates Table */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold text-slate-700">
                                Process Rates (৳ per Dozen)
                            </label>
                            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl px-3">
                                {Object.keys(rates).map((proc) => (
                                    <div key={proc} className="py-2 flex items-center justify-between text-xs">
                                        <span className="font-medium text-slate-700">{proc}</span>
                                        <div className="flex items-center gap-1.5 w-28">
                                            <span className="text-slate-400 font-mono">৳</span>
                                            <input
                                                type="number"
                                                value={rates[proc]}
                                                onChange={(e) =>
                                                    setRates((prev) => ({
                                                        ...prev,
                                                        [proc]: Number(e.target.value),
                                                    }))
                                                }
                                                className="w-full text-right text-xs px-2 py-1 rounded-md border border-slate-200 font-mono"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setShowSettingsModal(false)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                            >
                                Apply Rates
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContractBilling;