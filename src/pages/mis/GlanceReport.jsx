import { Loader2, Filter, Search, FunnelX } from "lucide-react";
import { useEffect, useState, useMemo, useRef } from "react";
// import { useFetchData } from "../../../hooks/fetch";
import AopGlance from "./AopGlance";
import DyeingGlance from "./DyeingGlance";
import KnittingGlance from "./KnittingGlance";
import JobModal from "./JobModal";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";
import UseUserRoles from "../../hooks/all-users/UseUserRoles";
// import UseUserRoles from "../users/allUsers/UserRoles";

const BORDER_COLOR = "#aeb7c2";
const PAGE_SIZE = 30;

// ── Excel-style filter dropdown (inline, same file) ─────────────────────────
const ExcelFilterDropdown = ({ allValues, selectedValues, onApply }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [draft, setDraft] = useState(selectedValues);
    const containerRef = useRef(null);

    useEffect(() => {
        setDraft(selectedValues);
    }, [selectedValues, open]);

    useEffect(() => {
        const handleClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const filteredValues = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return allValues;
        return allValues.filter((v) => v.toLowerCase().includes(term));
    }, [allValues, search]);

    const allFilteredSelected =
        filteredValues.length > 0 && filteredValues.every((v) => draft.includes(v));

    const toggleValue = (value) => {
        setDraft((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
        );
    };

    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            setDraft((prev) => prev.filter((v) => !filteredValues.includes(v)));
        } else {
            setDraft((prev) => Array.from(new Set([...prev, ...filteredValues])));
        }
    };

    const handleApply = () => {
        onApply(draft);
        setOpen(false);
    };

    const handleClear = () => {
        setDraft([]);
        onApply([]);
        setOpen(false);
    };

    const isActive = selectedValues.length > 0;

    return (
        <div className="relative inline-block" ref={containerRef}>
            <button
                onClick={() => setOpen((o) => !o)}
                className={`ml-1 p-0.5 rounded hover:bg-gray-300 ${isActive ? "text-blue-600" : "text-gray-500"}`}
                title="Filter"
            >
                {isActive ? <span onClick={handleClear}><FunnelX /></span> : <Filter size={13} fill={isActive ? "currentColor" : "none"} />}
            </button>
            {open && (
                <div
                    className="absolute z-50 top-full left-0 mt-1 w-56 bg-white border border-gray-300 rounded shadow-lg text-left"
                    style={{ fontWeight: 400, fontSize: "12px" }}
                >
                    <div className="p-2 border-b border-gray-200">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-6 pr-2 py-1 border border-gray-300 rounded text-xs"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="max-h-48 overflow-y-auto p-2">
                        <label className="flex items-center gap-2 py-1 cursor-pointer font-semibold border-b border-gray-100 mb-1">
                            <input
                                type="checkbox"
                                checked={allFilteredSelected}
                                onChange={toggleSelectAll}
                            />
                            (Select All)
                        </label>
                        {filteredValues.length === 0 && (
                            <div className="text-gray-400 py-2 text-center">No matches</div>
                        )}
                        {filteredValues.map((value) => (
                            <label key={value} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-gray-50">
                                <input
                                    type="checkbox"
                                    checked={draft.includes(value)}
                                    onChange={() => toggleValue(value)}
                                />
                                <span className="truncate">{value}</span>
                            </label>
                        ))}
                    </div>

                    <div className="flex justify-between gap-2 p-2 border-t border-gray-200">
                        <button
                            onClick={handleClear}
                            className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded"
                        >
                            Clear
                        </button>
                        <button
                            onClick={handleApply}
                            className="px-3 py-1 text-xs bg-blue-800 text-white rounded hover:bg-blue-900"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main Component ──────────────────────────────────────────────────────────
const GlanceReport = () => {
    const { fetchData, error, loading } = useFetchData();

    const [selectOrderType, setSelectOrderType] = useState("knittingOrder");
    const [data, setData] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const [allJobNumbers, setAllJobNumbers] = useState([]);
    const [selectedJobNos, setSelectedJobNos] = useState([]);

    // isShowGlanceModal -> controls JobModal's `isOpen`
    // isLoading         -> controls JobModal's `loading`
    const [modalState, setModalState] = useState({ isLoading: false, isShowGlanceModal: false });
    const axiosPrivate = useAxiosPrivate();
    const [jobDetails, setJobDetails] = useState([]);
    const { sections } = UseUserRoles();

    // const partyViews = ["knittingOrder", "dyeingOrder", "aopOrder"];
    const partyViews = [
        { label: "knittingOrder", permission: "knittingOrder" },
        { label: "dyeingOrder", permission: "dyeingOrder" },
        { label: "aopOrder", permission: "aopOrder" }
    ];
    let COLUMNS = [];
    if (selectOrderType === "knittingOrder") {
        COLUMNS.push(
            { header: "JOB NO.", width: 120, filterable: true },
            { header: "KNITTING WORK ORDER QTY", width: 220 },
            { header: "YARN DELIVERY", width: 140 },
            { header: "SHORT & EXCESS", width: 140 },
            { header: "YARN DEL. (%)", width: 140 },
            { header: "GREY RECEIVED", width: 140 },
            { header: "YARN RETURN", width: 140 },
            { header: "PARTY STOCK", width: 140 },
            { header: "RECEIVED (%)", width: 140 },
            { header: "FOLLOW-UP NOTE", width: 140 },
        );
    }
    if (selectOrderType === "dyeingOrder") {
        COLUMNS.push(
            { header: "JOB NO.", width: 120, filterable: true },
            { header: "DYEING WORK ORDER QTY", width: 220 },
            { header: "GREY DELIVERY", width: 140 },
            { header: "GREY DEV SHORT & EXCESS", width: 140 },
            { header: "DELIVERY (%)", width: 140 },
            { header: "GREY RETURN", width: 140 },
            { header: "GREY RECEIVE", width: 140 },
            { header: "FINISH RECEIVE", width: 140 },
            { header: "PROCESS LOSS", width: 140 },
            { header: "PARTY STOCK", width: 180 },
            { header: "RECEIVED (%)", width: 140 },
            { header: "FOLLOW-UP NOTE", width: 140 },

        );
    }
    if (selectOrderType === "aopOrder") {
        COLUMNS.push(
            { header: "JOB NO.", width: 120, filterable: true },
            { header: "AOP WORK ORDER QTY", width: 220 },
            { header: "SENT FOR AOP", width: 140 },
            { header: "DEL.SHORT & EXCESS", width: 140 },
            { header: "DELIVERY (%)", width: 140 },
            { header: "RECEIVE FROM AOP", width: 140 },
            { header: "FINISH RECEIVED FROM AOP", width: 140 },
            { header: "RETURN FROM AOP", width: 140 },
            { header: "PROCESS LOSS", width: 180 },
            { header: "PARTY STOCK", width: 140 },
            { header: "RECEIVED (%)", width: 140 },
            { header: "FOLLOW-UP NOTE", width: 140 },

        );
    }

    useEffect(() => {
        fetchData(`/api/management-view/job-numbers`)
            .then((res) => setAllJobNumbers(res?.jobNumbers || []))
            .catch((e) => console.error(e));
    }, [fetchData]);

    useEffect(() => {
        const params = new URLSearchParams();
        if (selectedJobNos.length > 0) {
            params.set("jobNo", selectedJobNos.join(","));
        } else {
            params.set("page", String(page));
            params.set("limit", String(PAGE_SIZE));
        }

        fetchData(`/api/management-view/${selectOrderType}?${params.toString()}`)
            .then((res) => {
                const rows = res?.data || [];
                setHasMore(!!res?.hasMore);
                setData((prev) =>
                    selectedJobNos.length > 0 || page === 1 ? rows : [...prev, ...rows]
                );
            })
            .catch((e) => console.error(e));
    }, [selectOrderType, page, selectedJobNos, fetchData]);

    const handleOrderType = (orderType) => {
        setSelectOrderType(orderType);
        setPage(1);
    };

    const handleLoadMore = () => {
        if (selectedJobNos.length === 0) setPage((p) => p + 1);
    };

    const handleFilterApply = (values) => {
        setSelectedJobNos(values);
        setPage(1);
    };

    const handleGetMisDetail = async (jobNo) => {
        setModalState({ isLoading: true, isShowGlanceModal: true });
        try {
            const res = await axiosPrivate.get(`/api/job-wise-mis-view/${jobNo}/${selectOrderType}`);
            setJobDetails(res?.data?.data);
            console.log(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setModalState((prev) => ({ ...prev, isLoading: false }));
        }
    };

    const handleCloseModal = () => {
        setModalState({ isLoading: false, isShowGlanceModal: false });
    };



    return (
        <div>
            {/* Job detail modal */}
            <JobModal
                isOpen={modalState.isShowGlanceModal}
                loading={modalState.isLoading}
                jobDetails={jobDetails}
                onClose={handleCloseModal}
            />

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-300 pb-2 mb-4">
                {partyViews
                .filter(item => sections.mis?.[item.permission] === true)
                .map((v, i) => (
                    <button
                        key={i}
                        onClick={() => handleOrderType(v.label)}
                        className={`px-4 py-2 text-sm uppercase font-medium transition-colors ${selectOrderType === v.label
                            ? "bg-blue-800 text-white"
                            : "bg-blue-100 text-blue-900 hover:bg-blue-200"
                            }`}
                    >
                        {v.label}
                    </button>
                ))}
                {loading && (
                    <button className="animate-spin text-blue-800">
                        <Loader2 />
                    </button>
                )}


                {
                    error && (
                        <div className="p-4 bg-red-100 text-red-700 rounded">{error.message || error.msg || "Something Went Wrong"}</div>
                    )
                }

                {selectedJobNos.length > 0 && (
                    <span className="ml-2 self-center text-xs text-gray-500">
                        Filtered: {selectedJobNos.length} job{selectedJobNos.length > 1 ? "s" : ""} selected
                    </span>
                )}
            </div>


            {/* ERP Table */}
            <div style={{ border: `2px solid ${BORDER_COLOR}`, background: "#fff", borderRadius: "4px" }}>
                <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "80vh" }}>
                    <table style={{ width: "100%", minWidth: "1500px", tableLayout: "fixed", borderCollapse: "collapse", borderSpacing: 0, background: "#fff" }}>
                        <colgroup>
                            {COLUMNS.map((col, i) => (
                                <col key={i} style={{ width: `${col.width}px` }} />
                            ))}
                        </colgroup>

                        <thead>
                            <tr>
                                {COLUMNS.map((col, index) => (
                                    <th
                                        key={index}
                                        style={{
                                            position: "sticky", top: 0, zIndex: 5,
                                            border: `1px solid ${BORDER_COLOR}`, borderBottom: `2px solid ${BORDER_COLOR}`,
                                            backgroundColor: "#f3f4f6", padding: "10px 8px", textAlign: "center",
                                            fontSize: "12px", fontWeight: 600, color: "#374151",
                                        }}
                                    >
                                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", gap: "6px" }}>
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {col.header}
                                            </span>
                                            {col.filterable && (
                                                <ExcelFilterDropdown
                                                    allValues={allJobNumbers}
                                                    selectedValues={selectedJobNos}
                                                    onApply={handleFilterApply}
                                                />
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        {selectOrderType === "knittingOrder" && <KnittingGlance
                            detailView={data}
                            handleGetMisDetail={handleGetMisDetail}
                        />}
                        {selectOrderType === "dyeingOrder" && <DyeingGlance
                            detailView={data}
                            handleGetMisDetail={handleGetMisDetail}
                        />}
                        {selectOrderType === "aopOrder" && <AopGlance
                            detailView={data}
                            handleGetMisDetail={handleGetMisDetail}
                        />}
                    </table>
                </div>
            </div>

            {selectedJobNos.length === 0 && hasMore && (
                <div className="flex justify-center mt-4">
                    <button
                        onClick={handleLoadMore}
                        disabled={loading}
                        className="px-4 py-2 text-sm bg-blue-800 text-white rounded hover:bg-blue-900 disabled:opacity-50"
                    >
                        {loading ? "Loading..." : "Load More"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default GlanceReport;