import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
    PlusCircle, RefreshCcw, ChevronLeft, ChevronRight, Filter, X, Search,
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
    const { sections } = UseUserRoles();

    const ITEMS_PER_PAGE = 20;
    const [currentPage, setCurrentPage] = useState(1);

    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const filterBtnRefs = useRef({});

    const isAnyModalOpen = showModal || glanceReport.showGlanceModal;

    const fetchFilteredData = useCallback(async () => {
        setIsLoading(prev => ({ ...prev, refreshLoading: true }));
        try {
            const params = { page: 1, limit: 10000, reconciliation: false, styleRequirement: true };
            if (Object.keys(activeFilters).length > 0) params.filters = JSON.stringify(activeFilters);
            const res = await axiosPrivate.get('/api/styles', { params });
            if (res.data && res.data.data) setRawData(res.data.data);
            console.log(res.data, "style  data"); // style requirement log
        } catch (err) {
            console.error("Failed to fetch filtered data:", err);
        } finally {
            setIsLoading(prev => ({ ...prev, refreshLoading: false }));
        }
    }, [activeFilters, axiosPrivate]);

    useEffect(() => {
        fetchFilteredData();
    }, [fetchFilteredData]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilters]);

    const handleRedirect = (jobNumber) => navigate(`/dashboard/new-order/${jobNumber}`);

    useEffect(() => {
        try {
            sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(activeFilters));
        } catch (e) {
            console.log(e);
        }
    }, [activeFilters]);

    const filteredData = rawData;

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredData.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredData, currentPage]);

    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredData.length);

    const totals = useMemo(
        () => footerTotals({ FROZEN_COUNT, filteredData, COLUMNS, getBreakdownValue }),
        [filteredData]
    );

    const getPageNumbers = () => {
        const pages = [];
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        return pages;
    };

    const openFilterDropdown = async (colIndex, e) => {
        e.stopPropagation();
        if (openFilter === colIndex) { setOpenFilter(null); return; }

        const btn = filterBtnRefs.current[colIndex];
        if (btn) {
            const rect = btn.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + 4,
                left: Math.min(rect.left, window.innerWidth - 290),
            });
        }
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

    const handleExportExcelFile = () => {
        handleExportExcel({ filteredData, COLUMNS, getBreakdownValue, FROZEN_COUNT, footerTotals: totals, NO_TOTAL_COLUMN_INDEXES, PERCENT_COLUMN_INDEXES })
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
                    colIndex={openFilter}
                    colLabel={COLUMNS[openFilter]}
                    allValues={filterOptions}
                    isLoading={filterOptionsLoading}
                    activeValues={activeFilters[FILTERABLE_COLS[openFilter]?.key] ? Array.from(activeFilters[FILTERABLE_COLS[openFilter]?.key]) : null}
                    onApply={(set) => applyFilter(openFilter, set)}
                    onClear={() => clearFilter(openFilter)}
                    onClose={() => setOpenFilter(null)}
                    anchorRef={{ current: filterBtnRefs.current[openFilter] }}
                    style={{ top: dropdownPos.top, left: dropdownPos.left, position: "fixed" }}
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

            <div
                ref={scrollContainerRef}
                className="relative overflow-auto shadow-xs"
                style={{ maxHeight: 'calc(100vh - 250px)', border: `1px solid ${BORDER_COLOR}`, borderRadius: '14px' }}
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
                                    <div className="flex flex-col items-center justify-center gap-3">
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
                                    No rows match the active filters.
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

            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white border border-t-0 shadow-xs" style={{ borderColor: BORDER_COLOR, borderRadius: '0 0 14px 14px' }}>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm text-gray-700">
                                Showing <span className="font-medium">{startIndex + 1}</span> to <span className="font-medium">{endIndex}</span> of <span className="font-medium">{filteredData.length}</span> results
                            </p>
                        </div>
                        <div>
                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="relative inline-flex items-center px-3 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <ChevronLeft size={16} className="mr-1" /> Prev
                                </button>

                                {getPageNumbers().map(page => (
                                    <button
                                        key={page}
                                        onClick={() => setCurrentPage(page)}
                                        className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium ${currentPage === page
                                            ? 'bg-teal-600 text-white z-10'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                            }`}
                                    >
                                        {page}
                                    </button>
                                ))}

                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="relative inline-flex items-center px-3 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next <ChevronRight size={16} className="ml-1" />
                                </button>
                            </nav>
                        </div>
                    </div>

                    <div className="flex justify-between sm:hidden w-full">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-gray-700 self-center">
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}