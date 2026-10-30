import { Loader2, Search, X, Filter } from "lucide-react";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import KnittingDetail from "./KnittingDetail";
import DyeingDetail from "./DyeingDetail";
import AopDetail from "./AopDetail";
import { useFetchData } from "../../hooks/fetch";

// ---- Table color tokens (matches the DailyCutting table design) ----
const HEADER_BG = "#334155";      // slate-700
const HEADER_BORDER = "#475569";  // slate-600
const CARD_BORDER = "#e5e7eb";    // gray-200

const getDeliveryBreakdownByType = (styles) => {
    return styles.map((s) => {
        const workOrders = s.workOrders ?? [];
        const deliveryTotals = {};

        workOrders.forEach((w) => {
            w.compositions?.forEach((c) => {
                (c.deliveries ?? []).forEach((d) => {
                    const type = d.deliveryType?.trim().replace(/\s+/g, "") || "Unknown";
                    if (!deliveryTotals[type]) {
                        deliveryTotals[type] = [];
                    }
                    deliveryTotals[type].push(d.deliveryQty || 0);
                });
            });
        });

        return { ...s, deliveryTotals };
    });
};

// ── Filterable columns mapping for each order type ──────────────────────────
const FILTERABLE_COLS_MAP = {
    knittingOrder: {
        1: { key: "jobNo", label: "JOB NO.", type: "row" },
        2: { key: "composition", label: "COMPOSITION", type: "subrow" },
    },
    dyeingOrder: {
        1: { key: "jobNo", label: "JOB NO.", type: "row" },
        2: { key: "composition", label: "COMPOSITION", type: "subrow" },
    },
    aopOrder: {
        1: { key: "jobNo", label: "JOB NO.", type: "row" },
        2: { key: "composition", label: "COMPOSITION", type: "subrow" },
    }
};

// ── Deep Filter Logic (Excel-style) ─────────────────────────────────────────
const applyDeepFilters = (data, activeFilters, orderType) => {
    if (!data || Object.keys(activeFilters).length === 0) return data;
    
    const filterConfig = FILTERABLE_COLS_MAP[orderType];
    if (!filterConfig) return data;

    return data.reduce((acc, row) => {
        // 1. Check top-level (row) filters (e.g. Job No)
        for (const [ci, selectedSet] of Object.entries(activeFilters)) {
            if (!selectedSet || selectedSet.size === 0) continue;
            const col = filterConfig[Number(ci)];
            if (!col || col.type === "subrow") continue;

            if (!selectedSet.has(String(row[col.key] ?? ""))) {
                return acc; 
            }
        }

        // 2. Clone row and filter sub-rows (e.g. Composition)
        const clonedRow = { ...row };
        const subRows = clonedRow.rows || [];

        const hasSubFilters = Object.entries(activeFilters).some(([ci]) => {
            const col = filterConfig[Number(ci)];
            return col && col.type === "subrow";
        });

        if (hasSubFilters) {
            const filteredSubRows = [];

            for (let j = 0; j < subRows.length; j++) {
                const sr = subRows[j];
                let srValid = true;

                for (const [ci, selectedSet] of Object.entries(activeFilters)) {
                    if (!selectedSet || selectedSet.size === 0) continue;
                    const col = filterConfig[Number(ci)];
                    if (!col || col.type !== "subrow") continue;

                    if (!selectedSet.has(String(sr[col.key] ?? ""))) {
                        srValid = false;
                        break;
                    }
                }

                if (srValid) {
                    filteredSubRows.push(sr);
                }
            }

            clonedRow.rows = filteredSubRows;
        }

        if (clonedRow.rows && clonedRow.rows.length > 0) {
            acc.push(clonedRow);
        }

        return acc;
    }, []);
};

// ── Filter Dropdown Component (unchanged — already Excel-style: search, select all, Apply/Clear) ──
function FilterDropdown({ colLabel, allValues, activeValues, onApply, onClear, onClose, anchorRef, style }) {
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(
        activeValues !== null ? new Set(activeValues) : new Set(allValues)
    );
    const dropRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (dropRef.current && !dropRef.current.contains(e.target) &&
                anchorRef.current && !anchorRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose, anchorRef]);

    const filtered = allValues.filter(v => String(v).toLowerCase().includes(search.toLowerCase()));
    const allChecked = filtered.length > 0 && filtered.every(v => selected.has(v));

    const toggleAll = () => {
        const next = new Set(selected);
        if (allChecked) filtered.forEach(v => next.delete(v));
        else filtered.forEach(v => next.add(v));
        setSelected(next);
    };

    const toggle = (val) => {
        const next = new Set(selected);
        next.has(val) ? next.delete(val) : next.add(val);
        setSelected(next);
    };

    return (
        <div
            ref={dropRef}
            style={{
                ...style,
                position: "fixed",
                zIndex: 9999,
                background: "#fff",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                minWidth: 220,
                maxWidth: 280,
            }}
        >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide truncate">{colLabel}</span>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0">
                    <X size={13} />
                </button>
            </div>

            <div className="px-2 py-2 border-b border-gray-100">
                <div className="flex items-center gap-1.5 bg-gray-100 rounded px-2 py-1">
                    <Search size={12} className="text-gray-400 flex-shrink-0" />
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="bg-transparent text-xs outline-none w-full text-gray-700 placeholder-gray-400"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                            <X size={11} />
                        </button>
                    )}
                </div>
            </div>

            <div className="px-3 py-1.5 border-b border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="rounded text-blue-500" />
                    <span className="text-xs font-medium text-gray-600">Select All</span>
                    <span className="ml-auto text-xs text-gray-400">{selected.size}/{allValues.length}</span>
                </label>
            </div>

            <div style={{ maxHeight: 200, overflowY: "auto" }} className="py-1">
                {filtered.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-400 text-center">No matches</div>
                ) : (
                    filtered.map(val => (
                        <label key={val} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-blue-50 select-none">
                            <input type="checkbox" checked={selected.has(val)} onChange={() => toggle(val)} className="rounded text-blue-500" />
                            <span className="text-xs text-gray-700 truncate" title={val}>{val || "(Blank)"}</span>
                        </label>
                    ))
                )}
            </div>

            <div className="flex gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50">
                <button onClick={() => { onApply(selected); onClose(); }} className="flex-1 text-xs bg-blue-500 text-white rounded px-3 py-1.5 font-medium hover:bg-blue-600 transition-colors">
                    Apply
                </button>
                <button onClick={() => { onClear(); onClose(); }} className="flex-1 text-xs bg-white border border-gray-300 text-gray-600 rounded px-3 py-1.5 font-medium hover:bg-gray-50 transition-colors">
                    Clear
                </button>
            </div>
        </div>
    );
}

// ── Main Component ──────────────────────────────────────────────────────────
const PartyWiseView = () => {
    const { fetchData, loading, error } = useFetchData();

    const [factories, setFactories] = useState([]);
    const [selectOrderType, setSelectOrderType] = useState("knittingOrder");
    const [detailView, setDetailView] = useState([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedFactoryName, setFactoryName] = useState("");
    const [hideFactories, setHideFactories] = useState(false);

    // Filter States
    const [activeFilters, setActiveFilters] = useState({});
    const [openFilter, setOpenFilter] = useState(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const filterBtnRefs = useRef({});

    const filteredFactories = factories.filter((f) =>
        f.toLowerCase().includes(searchTerm.trim().toLowerCase())
    );

    useEffect(() => {
        fetchData(`/api/party-view-report/knittingOrder`)
            .then((data) => {
                setFactories(data.factoryNames || []);
            })
            .catch((e) => console.error(e));
    }, [fetchData]);

    const partyViews = ["knittingOrder", "dyeingOrder", "aopOrder"];

    let COLUMNS = [];
    if (selectOrderType === "knittingOrder") {
        COLUMNS.push(
            { header: "KNITTING FACTORY NAME", width: 220 },
            { header: "JOB NO.", width: 120 },
            { header: "COMPOSITION", width: 320 },
            { header: "KNITTING WORK ORDER QTY", width: 220 },
            { header: "YARN DELIVERY", width: 140 },
            { header: "DEL. SHORT & EXCESS", width: 140 },
            { header: "GREY RECEIVED", width: 140 },
            { header: "YARN RETURN", width: 140 },
            { header: "party stock", width: 140 },
            { header: "PRICE PER KG", width: 120 },
            { header: "PAYABLE AMOUNT", width: 180 },
        );
    }
    if (selectOrderType === "dyeingOrder") {
        COLUMNS.push(
            { header: "DYEING FACTORY NAME", width: 220 },
            { header: "JOB NO.", width: 120 },
            { header: "COMPOSITION", width: 320 },
            { header: "DYEING WORK ORDER QTY", width: 220 },
            { header: "GREY DELIVERY", width: 140 },
            { header: "GREY DEV SHORT & EXCESS", width: 140 },
            { header: "GREY RETURN RCVD", width: 140 },   
            { header: "GREY RECEIVE", width: 140 },            
            { header: "FINISH RECEIVE", width: 140 },
            { header: "FINISH RCV SHORT & EXCESS", width: 140 },
            { header: "PRICE PER KG", width: 120 },
            { header: "PAYABLE AMOUNT", width: 180 },
        );
    }
    if (selectOrderType === "aopOrder") {
        COLUMNS.push(
            { header: "AOP FACTORY NAME", width: 220 },
            { header: "JOB NO.", width: 120 },
            { header: "COMPOSITION", width: 320 },
            { header: "AOP WORK ORDER QTY", width: 220 },
            { header: "SENT FOR AOP", width: 140 },
            { header: "DEL. SHORT & EXCESS", width: 140 },
            { header: "RETURN FROM AOP", width: 140 },
            { header: "RECEIVE FROM AOP", width: 140 },            
            { header: "FINISH RECEIVED FROM AOP", width: 140 },
            { header: "SHORT & EXCESS", width: 140 },
            { header: "PRICE PER KG", width: 120 },
            { header: "PAYABLE AMOUNT", width: 180 },
        );
    }

    const handleOrderType = (orderType) => {
        setSelectOrderType(orderType);
        setDetailView([]);
        setSearchTerm("");
        setFactoryName("");
        setActiveFilters({}); // Clear filters on tab change

        fetchData(`/api/party-view-report/${orderType}`)
            .then((data) => {
                setFactories(data.factoryNames || []);
            })
            .catch((e) => console.error(e));
    };

    const handleFetchDetail = (factoryName) => {
        setFactoryName(factoryName);
        setActiveFilters({}); // Clear filters on factory change
        
        fetchData(`/api/detail-party-report/${factoryName}/${selectOrderType}`)
            .then((data) => {
                const styles = data.data || [];
                setDetailView(getDeliveryBreakdownByType(styles));
            })
            .catch((e) => console.error(e));
    };

    const toggleFactories = () => {
        setHideFactories(prev => !prev);
    };

    // ── Filter Logic ────────────────────────────────────────────────────────
    const getColValues = useCallback((colIndex) => {
        const filterConfig = FILTERABLE_COLS_MAP[selectOrderType];
        const col = filterConfig[colIndex];
        if (!col) return [];

        const tempFilters = { ...activeFilters };
        delete tempFilters[colIndex];

        const tempFilteredData = applyDeepFilters(detailView, tempFilters, selectOrderType);

        if (col.type === "row") {
            const set = new Set(tempFilteredData.map(row => String(row[col.key] ?? "")));
            return Array.from(set).sort();
        }

        const set = new Set();
        tempFilteredData.forEach(row => {
            (row.rows || []).forEach(sr => set.add(String(sr[col.key] ?? "")));
        });
        return Array.from(set).sort();
    }, [detailView, activeFilters, selectOrderType]);

    const filteredDetailView = useMemo(() => {
        return applyDeepFilters(detailView, activeFilters, selectOrderType);
    }, [detailView, activeFilters, selectOrderType]);

    const openFilterDropdown = (colIndex, e) => {
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
    };

    const applyFilter = (colIndex, selectedSet) => {
        setActiveFilters(prev => {
            const next = { ...prev };
            if (selectedSet.size === 0) {
                delete next[colIndex];
            } else {
                next[colIndex] = selectedSet;
            }
            return next;
        });
    };

    const clearFilter = (colIndex) => {
        setActiveFilters(prev => {
            const next = { ...prev };
            delete next[colIndex];
            return next;
        });
    };

    const hasActiveFilters = Object.keys(activeFilters).length > 0;

    return (
        <div>
            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-300 pb-2 mb-4">
                {partyViews.map((v, i) => (
                    <button
                        key={i}
                        onClick={() => handleOrderType(v)}
                        className={`px-4 py-2 text-sm uppercase font-medium transition-colors ${
                            selectOrderType === v
                                ? "bg-blue-800 text-white"
                                : "bg-blue-100 text-blue-900 hover:bg-blue-200"
                        }`}
                    >
                        {v}
                    </button>
                ))}
                {loading && (
                    <button className="animate-spin text-blue-800">
                        <Loader2 />
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="mb-4">
                <div className="flex gap-2 items-center">
                    <div className="relative max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search Factory"
                            className="w-full border border-gray-300 outline-none pl-10 pr-4 py-2 text-sm bg-white rounded"
                        />
                    </div>

                    <button 
                        onClick={toggleFactories} 
                        className="bg-blue-100 text-blue-900 px-4 py-2 text-sm font-medium hover:bg-blue-200 transition-colors rounded"
                    >
                        {hideFactories ? "Show Factories" : "Hide Factories"}
                    </button>
                </div>
            </div>

            {/* Factory List */}
            <div className={`${hideFactories ? "hidden" : ""} grid grid-cols-10 gap-2 border-b border-gray-300 pb-3 mb-5 max-h-48 overflow-y-auto`}>
                {filteredFactories.length === 0 ? (
                    <div className="col-span-10 text-sm text-gray-500 py-2">
                        No factories match "{searchTerm}".
                    </div>
                ) : (
                    filteredFactories.map((f, i) => (
                        <button
                            key={i}
                            onClick={() => handleFetchDetail(f)}
                            className={`${
                                selectedFactoryName === f 
                                    ? "bg-yellow-100 border-yellow-400 text-yellow-900" 
                                    : "bg-blue-50 border border-blue-200 text-blue-900 hover:bg-blue-100"
                            } p-2 text-sm font-semibold transition-colors text-left truncate rounded`}
                        >
                            {f}
                        </button>
                    ))
                )}
            </div>

            {/* Active Filters Chips */}
            {hasActiveFilters && (
                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    <Filter size={14} className="text-blue-500" />
                    {Object.entries(activeFilters).map(([colIndex, valSet]) => {
                        const filterConfig = FILTERABLE_COLS_MAP[selectOrderType];
                        const colLabel = filterConfig[Number(colIndex)]?.label || COLUMNS[Number(colIndex)]?.header;
                        return (
                            <span key={colIndex} className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full font-medium">
                                {colLabel}
                                <span className="bg-blue-200 text-blue-800 rounded-full px-1.5 text-xs">{valSet.size}</span>
                                <button onClick={() => clearFilter(Number(colIndex))} className="ml-0.5 text-blue-400 hover:text-blue-700">
                                    <X size={11} />
                                </button>
                            </span>
                        );
                    })}
                    <button onClick={() => setActiveFilters({})} className="text-xs text-gray-500 hover:text-red-500 underline ml-1">
                        Clear all
                    </button>
                </div>
            )}

            {/* ERP Table — styled to match the DailyCutting table design (dark slate header, card wrapper) */}
            <div
                className="rounded-lg shadow-sm bg-white"
                style={{ border: `1px solid ${CARD_BORDER}` }}
            >
                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "80vh" }}>
                    <table
                        style={{
                            width: "100%",
                            minWidth: "1900px",
                            tableLayout: "fixed",
                            borderCollapse: "collapse",
                            borderSpacing: 0,
                            background: "#fff",
                        }}
                    >
                        <colgroup>
                            {COLUMNS.map((col, i) => (
                                <col key={i} style={{ width: `${col.width}px` }} />
                            ))}
                        </colgroup>

                        <thead>
                            <tr>
                                {COLUMNS.map((col, index) => {
                                    const filterConfig = FILTERABLE_COLS_MAP[selectOrderType];
                                    const isFilterable = filterConfig && filterConfig[index];
                                    const hasFilter = !!activeFilters[index];

                                    return (
                                        <th
                                            key={index}
                                            style={{
                                                position: "sticky",
                                                top: 0,
                                                zIndex: 5,
                                                border: `1px solid ${HEADER_BORDER}`,
                                                backgroundColor: HEADER_BG,
                                                padding: "10px 8px",
                                                textAlign: "center",
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                color: "#ffffff",
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", gap: "4px" }}>
                                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {col.header}
                                                </span>
                                                {isFilterable && (
                                                    <button
                                                        ref={el => filterBtnRefs.current[index] = el}
                                                        onClick={(e) => openFilterDropdown(index, e)}
                                                        title={hasFilter ? "Filter active" : "Filter"}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            width: "16px",
                                                            height: "16px",
                                                            padding: 0,
                                                            background: "transparent",
                                                            color: hasFilter ? "#fbbf24" : "#cbd5e1", // amber-400 active / slate-300 idle
                                                            border: "none",
                                                            cursor: "pointer",
                                                            transition: "color 0.15s",
                                                            flexShrink: 0,
                                                        }}
                                                        onMouseEnter={(e) => { if (!hasFilter) e.currentTarget.style.color = "#ffffff"; }}
                                                        onMouseLeave={(e) => { if (!hasFilter) e.currentTarget.style.color = "#cbd5e1"; }}
                                                    >
                                                        <Filter size={12} fill={hasFilter ? "currentColor" : "none"} />
                                                    </button>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        
                        {/* Pass filteredDetailView instead of detailView */}
                        {selectOrderType === "knittingOrder" && <KnittingDetail detailView={filteredDetailView} />}
                        {selectOrderType === "dyeingOrder" && <DyeingDetail detailView={filteredDetailView} />}
                        {selectOrderType === "aopOrder" && <AopDetail detailView={filteredDetailView} />}
                    </table>
                </div>
            </div>

            {/* Render Dropdown outside the table container so it doesn't get clipped */}
            {openFilter !== null && (
                <FilterDropdown
                    colLabel={FILTERABLE_COLS_MAP[selectOrderType][openFilter]?.label || COLUMNS[openFilter]?.header}
                    allValues={getColValues(openFilter)}
                    activeValues={activeFilters[openFilter] ? Array.from(activeFilters[openFilter]) : null}
                    onApply={(set) => applyFilter(openFilter, set)}
                    onClear={() => clearFilter(openFilter)}
                    onClose={() => setOpenFilter(null)}
                    anchorRef={{ current: filterBtnRefs.current[openFilter] }}
                    style={{ top: dropdownPos.top, left: dropdownPos.left }}
                />
            )}
        </div>
    );
};

export default PartyWiseView;