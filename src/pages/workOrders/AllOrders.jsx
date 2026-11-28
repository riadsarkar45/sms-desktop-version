import { useEffect, useState, useCallback, useMemo, useContext, useRef, useLayoutEffect } from "react";
import { DownloadCloudIcon, FunnelX, Loader, Loader2, Save, Search, X, Filter, RefreshCw } from "lucide-react"; // NEW: RefreshCw added
// import FilterDropdown from "../helpers/filtering/FilterDropdown";
import { useNavigate } from "react-router-dom";
import { useFetchData } from "../../hooks/fetch";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";
import { AuthContext } from "../../auth/AuthContext";
import Modal from "../../components/modals/Modal";
import InlineEdit from "../../components/inlineEdit/InlineEdit";
import KnittingOrder from "./KnittingOrders";
import DyeingOrder from "./DyeingOrder";
import AopOrder from "./AopOrders";
import YarnDyeOrders from "./YarnDyeingOrders";
import Toast from '../../components/tost/Tost';
import WorkOrderCancelModal from "../../components/modals/WorkOrderCancellModal";
import YarnDeliveryModal from "../../components/modals/YarnDeliveryModal";
import WorkOrderPreviewModal from "./WorkOrderPreviewModal";
import WorkOrderEditModal from "../../components/modals/WorkOrderEditModal";

// WORK ORDER DATE (new) + the 8 old frozen columns
export const FROZEN_COUNT = 9;

const FILTERABLE_COLUMNS = new Set([
    "jobNo",
    "factoryName",
    "workOrderNo",
    "styleNo",
    "month",
    "buyerName",
    "composition",
    "color",
    "orderQty",
    "workOrderQty",
    "unitePrice",
    "bookingColor",
]);

const getSavedFilters = (type) => {
    try {
        const saved = sessionStorage.getItem(`workOrderFilters_${type}`);
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        console.error("Error loading filters:", e);
        return {};
    }
};

// ---- revision helpers (REVISED stamp) ----
const getSavedRevisions = (type) => {
    try {
        const saved = localStorage.getItem(`workOrderRevisions_${type}`);
        return saved ? JSON.parse(saved) : {};
    } catch (e) {
        return {};
    }
};

// ===== AUTO-FIT LAYOUT CONFIG (same idea as the Summary page) =====
// The table box always fills the rest of the screen: bigger screen = taller table, smaller screen = shorter table.
const FIT_DEBUG = false;        // true = prints the measured numbers in the browser console (F12)
const MIN_TABLE_HEIGHT = 300;   // only a safety minimum - the real height is calculated from the screen
const BOTTOM_RESERVE = 60;      // space kept free under the table

// The ERP has its own zoom (67% / 100% ...). With CSS zoom / scale the real screen pixels are NOT the same as the CSS
// pixels of the page, so the height must be corrected by this factor. 1 = no zoom.
const getZoomScale = (el) => {
    const rect = el.getBoundingClientRect();
    const w = el.offsetWidth;
    if (!w || !rect.width) return 1;
    const scale = rect.width / w;
    return scale > 0.2 && scale < 5 ? scale : 1;
};
// ===== END AUTO-FIT LAYOUT CONFIG =====

// ===== FILTER DROPDOWN POSITION (same idea as the Summary page) =====
// The filter dropdown opens CENTERED under the column header that was clicked.
const FILTER_DROPDOWN_WIDTH = 280;
const FILTER_DROPDOWN_EST_HEIGHT = 340;

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

const AllOrders = ({ orderType }) => {
    const axiosPrivate = useAxiosPrivate();
    const [jobId, setJobId] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [orders, setOrders] = useState([]);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
    const [changedField, setChangedField] = useState({});
    const [deliveries, setDeliveries] = useState({});
    const [workOrderId, setWorkOrderId] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingDeliveries, setLoadingDeliveries] = useState(false);

    const [appliedSearchTerm, setAppliedSearchTerm] = useState("");

    const [filters, setFilters] = useState(() => getSavedFilters(orderType));
    const [filterOptions, setFilterOptions] = useState({});
    const [filterOptionsLoading, setFilterOptionsLoading] = useState({});

    const [duplicateChallan, setDuplicateChallan] = useState([]);
    const [challanIssue, setChallanIssue] = useState([]);
    const [deliveryIssue, setDeliveryIssue] = useState([]);
    const [page, setPage] = useState(1);
    const [prepareForChallan, setPrepareChallan] = useState([]);
    const [isChallanDowloading, setIsChallanDownloading] = useState({ isLoading: false, isError: null });
    const [workOrderReviseModal, setWorkOrderReviseModal] = useState({ isShowModal: false })
    const [workOrderReviseData, setWorkOrderReviseData] = useState([])
    const [limit] = useState(10);
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

    // NEW: refresh button state
    const [isRefreshing, setIsRefreshing] = useState(false);

    const { handleInlineEdit, changedField: updatedFields, toastType, toastMessage, setShowToast, showToast, isInlineEditingLoading, handleOnChange, isEdit, isUpdated, handleEditedSubmit } = InlineEdit();
    const { fetchData, error, loading } = useFetchData();
    const { fetchData: fetchFilterOptions } = useFetchData();
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();

    const tableRef = useRef(null);

    const [openFilter, setOpenFilter] = useState(null);
    const [filterSearch, setFilterSearch] = useState("");
    const [filterTempSelected, setFilterTempSelected] = useState([]);
    const [dataForCancellation, setDataForCancellation] = useState([]);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
    const filterDropdownRef = useRef(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
    const dropdownPosRef = useRef(dropdownPosition);
    dropdownPosRef.current = dropdownPosition;
    const filterBtnRefs = useRef({}); // filter button of every column (used to center the dropdown under it)

    // ===== AUTO-FIT (screen size) refs / state =====
    const scrollContainerRef = useRef(null);   // the scrolling table box
    const topRef = useRef(null);               // wraps the toolbar / filter chips, watched for size changes
    const viewportProbeRef = useRef(null);     // invisible element pinned to the screen: its bottom = bottom of the visible screen
    const [fit, setFit] = useState({ height: 560, width: 1400 });
    // ==============================================

    // ---------- work order preview + REVISED ----------
    const [previewData, setPreviewData] = useState(null); // { job, wo }
    const [revisions, setRevisions] = useState(() => getSavedRevisions(orderType));
    const [isYarnDyeSelected, setIsYarnDyeSelected] = useState("")

    useEffect(() => {
        setRevisions(getSavedRevisions(orderType));
    }, [orderType]);

    const handlePreview = useCallback((data) => setPreviewData(data), []);
    const closePreview = useCallback(() => setPreviewData(null), []);

    // Backend value first (revisionNo / revisionCount / isRevised), local fallback second
    const getRevisionCount = useCallback((wo) => {
        if (!wo) return 0;
        const fromServer =
            Number(wo.revisionNo ?? wo.revisionCount ?? 0) || (wo.isRevised ? 1 : 0);
        const fromLocal = Number(revisions?.[wo.id] ?? 0);
        return Math.max(fromServer, fromLocal);
    }, [revisions]);

    const markRevised = useCallback((wo) => {
        if (!wo?.id) return;
        setRevisions(prev => {
            const next = { ...prev, [wo.id]: (Number(prev[wo.id]) || 0) + 1 };
            try {
                localStorage.setItem(`workOrderRevisions_${orderType}`, JSON.stringify(next));
            } catch (e) { /* ignore */ }
            return next;
        });
    }, [orderType]);

    // find the work order from a composition id or a work order id
    const findWorkOrder = useCallback((compId, woId) => {
        const all = (orders || []).flatMap(j => (j.workOrders || []).map(w => ({ job: j, wo: w })));
        if (compId) {
            const byComp = all.find(({ wo }) => (wo.compositions || []).some(c => String(c.id) === String(compId)));
            if (byComp) return byComp.wo;
        }
        if (woId) {
            const byWo = all.find(({ wo }) => String(wo.id) === String(woId));
            if (byWo) return byWo.wo;
            const byCompAsWo = all.find(({ wo }) => (wo.compositions || []).some(c => String(c.id) === String(woId)));
            if (byCompAsWo) return byCompAsWo.wo;
        }
        return null;
    }, [orders]);


    const COLUMNS = useMemo(() => {
        const cols = [
            { header: "ACTION", width: 140, inputName: "workOrderDate" },
            { header: "WORK ORDER DATE", width: 140, inputName: "workOrderDate" }
        ];
        if (orderType === "knittingOrder") {
            cols.push(
                { header: "MONTH", width: 120, inputName: "month" },
                { header: "FACTORY NAME", width: 180, inputName: "factoryName" },
                { header: "WORK ORDER NO", width: 100, inputName: "workOrderNo" },
                { header: "BUYER NAME", width: 120, inputName: "buyerName" },
                { header: "JOB NO.", width: 150, inputName: "jobNo" },
                { header: "STYLE", width: 130, inputName: "styleNo" },
                { header: "COLOR", width: 200, inputName: "color" },
                { header: "COMPOSITION", width: 280, inputName: "composition" },
                { header: "FINISH DIA", width: 120, inputName: "finishdia" },
                { header: "YARN COUNT", width: 80, inputName: "yarnCount" },
                { header: "YARN LOT", width: 80, inputName: "yarnLot" },
                { header: "STITCH LENGHT", width: 80, inputName: "stitchLength" },
                { header: "M/C DIA", width: 80, inputName: "m/cDia" },
                { header: "WORK ORDER QTY", width: 80, inputName: "workOrderQty", isNumeric: true },
                { header: "YARN DELIVERY", width: 80, inputName: "totalYarnDelivery", isNumeric: true },
                { header: "DEL. SHORT & EXCESS", width: 80, inputName: "delShortExcess", isNumeric: true },
                { header: "YARN RETURN RECEIVED", width: 80, inputName: "yarnReturnReceived", isNumeric: true },
                { header: "GREY RECEIVED", width: 80, inputName: "greyReceived", isNumeric: true },
                { header: "RCVD SHORT & EXCESS", width: 80, inputName: "rcvdShortExcess", isNumeric: true },
                { header: "PRICE PER KG", width: 80, inputName: "unitePrice", isNumeric: true },
                { header: "PAYABLE AMOUNT", width: 80, inputName: "payableAmount", isNumeric: true },
                { header: "PAID BILLING AMOUNT", width: 80, inputName: "paidBillingAmount", isNumeric: true },
                { header: "PENDING BILLING AMOUNT", width: 80, inputName: "pendingBillingAmount", isNumeric: true },
            );
        } else if (orderType === "dyeingOrder") {
            cols.push(
                { header: "MONTH", width: 130, inputName: "month" },
                { header: "FACTORY NAME", width: 180, inputName: "factoryName" },
                { header: "WORK ORDER NO", width: 100, inputName: "workOrderNo" },
                { header: "BUYER NAME", width: 120, inputName: "buyerName" },
                { header: "JOB NO.", width: 150, inputName: "jobNo" },
                { header: "STYLE", width: 145, inputName: "styleNo" },
                { header: "COLOR", width: 180, inputName: "bookingColor" },
                { header: "COMPOSITION", width: 280, inputName: "composition" },
                { header: "FINISH DIA", width: 120, inputName: "finishdia" },
                { header: "YARN COUNT", width: 80, inputName: "yarncount" },
                { header: "YARN LOT", width: 80, inputName: "yarnlot" },
                { header: "STICH LENGHT", width: 80, inputName: "stichLenght" },
                { header: "MACHINE DIA", width: 80, inputName: "machineDia" },
                { header: "SHADE %", width: 80, inputName: "shade%" },
                { header: "DYEING WORK ORDER QTY", width: 80, inputName: "workOrderQty", isNumeric: true },
                { header: "GREY DELIVERY", width: 80, inputName: "greyReceived", isNumeric: true },
                { header: "DELIVERY SHORT & EXCESS", width: 80, inputName: "greyReceived", isNumeric: true },
                { header: "GREY RETURN RECEIVE", width: 80, inputName: "greyReturn", isNumeric: true },
                { header: "GREY RECEIVED FROM DYEING", width: 80, inputName: "greyReturn", isNumeric: true },
                { header: "FINISH FABRIC RECEIVED", width: 80, inputName: "greyReturn", isNumeric: true },
                { header: "BALANCE", width: 80, inputName: "greyReturn", isNumeric: true },
                { header: "PRICE PER KG", width: 80, inputName: "unitePrice", isNumeric: true },
                { header: "TOTAL SENT FOR COMPACTING", width: 80, inputName: "sentForCompacting", isNumeric: true },
                { header: "TOTAL RECEIVED FROM COMPACTING", width: 80, inputName: "receivedFromCompacting", isNumeric: true },
                { header: "TOTAL BILLING AMOUNT", width: 80, inputName: "unitePrice", isNumeric: true },
                { header: "PAYABLE AMOUNT", width: 80, inputName: "unitePrice", isNumeric: true },
                { header: "PENDING BILLING AMOUNT", width: 80, inputName: "unitePrice", isNumeric: true },
            );
        } else if (orderType === "yarnDyeingOrder") {
            cols.push(
                { header: "MONTH", width: 125, inputName: "month" },
                { header: "FACTORY NAME", width: 200, inputName: "factoryName" },
                { header: "WORK ORDER NO", width: 80, inputName: "workOrderNo" },
                { header: "BUYER NAME", width: 180, inputName: "buyerName" },
                { header: "JOB NO.", width: 200, inputName: "jobNo" },
                { header: "STYLE", width: 150, inputName: "styleNo" },
                { header: "BOOKING COLOR", width: 200, inputName: "bookingColor" },
                { header: "COMPOSITION", width: 200, inputName: "composition" },
                { header: "FINISH DIA", width: 80, inputName: "finishDia" },
                { header: "SHADE (%)", width: 80, inputName: "shade(%)" },
                { header: "Y/D COLOR NAME", width: 80, inputName: "y/dColorName" },
                { header: "COLOR WISE ORDER QTY", width: 80, inputName: "orderColor", isNumeric: true },
                { header: "PRICE PER KG", width: 80, inputName: "unitePrice", isNumeric: true },
                { header: "YARN DELIVERY FOR Y/D", width: 80, inputName: "yarnDeliveryForYd", isNumeric: true },
                { header: "DEL.SHORT & EXCESS", width: 80, inputName: "delShortExcess", isNumeric: true },
                { header: "YARN RETURN RECEIVED", width: 80, inputName: "yarnReturnReceived", isNumeric: true },
                { header: "YARN RECEIVED FROM Y/D", width: 80, inputName: "greyReceivedFromYd", isNumeric: true },
                { header: "FINISH YARN RECEIVED", width: 80, inputName: "finishReceived", isNumeric: true },
                { header: "FINISH RETURN", width: 80, inputName: "finishReturn", isNumeric: true },
                { header: "YARN STOCK", width: 80, inputName: "yarnStock", isNumeric: true },
            );
        } else if (orderType === "aopOrder") {
            cols.push(
                { header: "MONTH", width: 125, inputName: "month" },
                { header: "FACTORY NAME", width: 180, inputName: "factoryName" },
                { header: "WORK ORDER NO", width: 100, inputName: "workOrderNo" },
                { header: "BUYER NAME", width: 120, inputName: "buyerName" },
                { header: "JOB NO.", width: 180, inputName: "jobNo" },
                { header: "STYLE", width: 120, inputName: "styleNo" },
                { header: "COLOR", width: 180, inputName: "color" },
                { header: "COMPOSITION", width: 280, inputName: "composition" },
                { header: "FINISH DIA", width: 80, inputName: "finishDia" },
                { header: "WORK ORDER QTY", width: 80, inputName: "workOrderQty", isNumeric: true },
                { header: "SENT FOR AOP", width: 80, inputName: "totalYarnDelivery", isNumeric: true },
                { header: "DEL. SHORT & EXCESS", width: 80, inputName: "delShortExcess", isNumeric: true },
                { header: "RETURN FROM AOP", width: 80, inputName: "returnFromAop", isNumeric: true },
                { header: "RECEIVED FROM AOP", width: 80, inputName: "receivedFromAop", isNumeric: true },
                { header: "FINISH AFTER AOP", width: 80, inputName: "finishAfterAop", isNumeric: true },
                { header: "PARTY BALANCE", width: 80, inputName: "partyBalance", isNumeric: true },
                { header: "PRICE PER KG", width: 80, inputName: "unitePrice", isNumeric: true },
                { header: "PAYABLE AMOUNT", width: 80, inputName: "payableAmount", isNumeric: true },
                { header: "PAID BILLING AMOUNT", width: 80, inputName: "paidBillingAmount", isNumeric: true },
                { header: "PENDING BILLING AMOUNT", width: 80, inputName: "pendingBillingAmount", isNumeric: true },
            );
        }
        return cols;
    }, [orderType]);

    // Fixed widths: frozen columns keep their exact width, the rest get at least 170px
    const columnWidths = useMemo(
        () => COLUMNS.map((c, i) => {
            const w = c.width || 150;
            return i < FROZEN_COUNT ? w : Math.max(w, 170);
        }),
        [COLUMNS]
    );

    const totalTableWidth = useMemo(
        () => columnWidths.reduce((sum, w) => sum + w, 0),
        [columnWidths]
    );

    // Because the table now uses table-layout: fixed, the frozen widths/lefts
    // are known exactly -> no DOM measuring, so they can never drift while scrolling.
    const safeFrozenWidths = useMemo(() => columnWidths.slice(0, FROZEN_COUNT), [columnWidths]);
    const safeFrozenLefts = useMemo(() => {
        const lefts = [];
        let acc = 0;
        for (let i = 0; i < FROZEN_COUNT; i++) {
            lefts.push(acc);
            acc += safeFrozenWidths[i] || 0;
        }
        return lefts;
    }, [safeFrozenWidths]);

    const handleRedirect = (jobNumber) => navigate(`/dashboard/new-order/${jobNumber}`);

    useEffect(() => {
        try {
            sessionStorage.setItem(`workOrderFilters_${orderType}`, JSON.stringify(filters));
        } catch (e) {
            console.error("Error saving filters:", e);
        }
    }, [filters, orderType]);

    useEffect(() => {
        setFilters(getSavedFilters(orderType));
        setFilterOptions({});
    }, [orderType]);

    useEffect(() => {
        setPage(1);
        setHasLoadedOnce(false);
    }, [orderType]);

    useEffect(() => {
        setPage(1);
    }, [filters]);

    const filtersParam = useMemo(
        () => (Object.keys(filters).length ? JSON.stringify(filters) : undefined),
        [filters]
    );

    useEffect(() => {
        const prepareToGenerateChallans = async () => {
            try {
                const res = await axiosPrivate.get(`/api/prepare-to-download/${Number(user?.id)}`);
                setPrepareChallan(res.data);
            } catch (err) {
                console.error("Failed to fetch challan prep data:", err);
            }
        };
        if (user?.id) {
            prepareToGenerateChallans();
        }
    }, [axiosPrivate, user?.id]);

    useEffect(() => {
        fetchData(`/api/work-order/${orderType}`, {
            params: { page, limit, filters: filtersParam }
        })
            .then(res => {
                if (res) {
                    setOrders(res.data ?? []);
                    console.log(res.data, "work order log");
                    if (res.pagination) setPagination(res.pagination);
                }
            })
            .finally(() => {
                setHasLoadedOnce(true);
            });
    }, [orderType, isUpdated, page, limit, filtersParam]);

    const loadFilterOptions = useCallback((columnName) => {
        if (!FILTERABLE_COLUMNS.has(columnName)) return;

        const otherFilters = { ...filters };
        delete otherFilters[columnName];
        const otherFiltersParam = Object.keys(otherFilters).length ? JSON.stringify(otherFilters) : undefined;

        setFilterOptionsLoading(prev => ({ ...prev, [columnName]: true }));

        fetchFilterOptions(`/api/work-order/${orderType}/filter-options/${columnName}`, {
            params: { filters: otherFiltersParam }
        })
            .then(res => {
                if (res) setFilterOptions(prev => ({ ...prev, [columnName]: res.data ?? [] }));
            })
            .finally(() => {
                setFilterOptionsLoading(prev => ({ ...prev, [columnName]: false }));
            });
    }, [orderType, filters, fetchFilterOptions]);

    const handleReviseWorkOrder = async (workOrderId) => {
        setWorkOrderReviseModal({ isShowModal: true })
        console.log(workOrderId);
        const res = await axiosPrivate.get(`/api/update-work-order/${workOrderId}/${orderType}`)
        console.log(res.data);
        if (res.data.type === "success") {
            console.log("record found");
            setWorkOrderReviseData(res.data)
        }
    }

    useEffect(() => {
        Object.keys(filters).forEach(columnName => {
            if (FILTERABLE_COLUMNS.has(columnName) && !filterOptions[columnName]) {
                loadFilterOptions(columnName);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtersParam, orderType]);

    const handleFilterApply = (columnName, selectedValues) => {
        setFilters(prev => {
            const newFilters = { ...prev };
            const allOptions = filterOptions[columnName] || [];
            if (!selectedValues || selectedValues.length === 0 || selectedValues.length === allOptions.length) {
                delete newFilters[columnName];
            } else {
                newFilters[columnName] = selectedValues;
            }
            return newFilters;
        });
    };

    // work order cancellation handler
    const getDataForCancellation = async ({ jobNo, isOpen }) => {

        if (!jobNo || !orderType) return null;

        setIsCancelModalOpen(true)
        console.log("clicked");
        try {

            const response = await axiosPrivate.get(`/api/work-order-for-cancellation/${jobNo}/${orderType}`)

            console.log(response?.data?.workOrder, "cancellation data");
            setDataForCancellation(response?.data?.workOrder);

        } catch (error) {
            console.log(error);
        }

    }

    const handleRemoveFilter = (columnName) => {
        setFilters(prev => {
            const newFilters = { ...prev };
            delete newFilters[columnName];
            return newFilters;
        });
    };

    const openFilterDropdown = (columnName, btnElement) => {
        // clicking the same filter button again closes the dropdown
        if (openFilter === columnName) {
            closeFilterDropdown();
            return;
        }

        if (!filterOptions[columnName]) {
            loadFilterOptions(columnName);
        }
        const currentSelected = filters[columnName] || [];
        const allOptions = filterOptions[columnName] || [];
        const isAllSelected = currentSelected.length === allOptions.length || currentSelected.length === 0;
        setFilterTempSelected(isAllSelected ? [...allOptions] : [...currentSelected]);
        setFilterSearch("");
        setOpenFilter(columnName);

        // open centered under the clicked column header
        const pos = computeFilterDropdownPos(btnElement || filterBtnRefs.current[columnName], null, null);
        if (pos) setDropdownPosition(pos);
    };

    const closeFilterDropdown = () => {
        setOpenFilter(null);
        setFilterSearch("");
        setFilterTempSelected([]);
    };

    const toggleFilterItem = (item) => {
        setFilterTempSelected(prev => {
            if (prev.includes(item)) {
                return prev.filter(v => v !== item);
            }
            return [...prev, item];
        });
    };

    const toggleSelectAll = () => {
        const allOptions = filterOptions[openFilter] || [];
        const allSelected = filterTempSelected.length === allOptions.length;
        if (allSelected) {
            setFilterTempSelected([]);
        } else {
            setFilterTempSelected([...allOptions]);
        }
    };

    const applyFilter = () => {
        if (openFilter) {
            handleFilterApply(openFilter, filterTempSelected);
        }
        closeFilterDropdown();
    };

    const cancelFilter = () => {
        closeFilterDropdown();
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            // a click on a filter button is handled by that button (open / close / switch column)
            if (e.target && e.target.closest && e.target.closest('[data-filter-btn="true"]')) return;
            if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target)) {
                closeFilterDropdown();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

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
        if (FIT_DEBUG) console.log('[AllOrders fit]', { viewportBottom, top, k, reserve: BOTTOM_RESERVE, height });
        const width = el.clientWidth;
        setFit((prev) => (prev.height === height && prev.width === width ? prev : { height, width }));
    }, []);

    // The table box is only on the screen after the first load (and not while there is an error),
    // so the measuring is started again when that changes.
    const isInitialLoading = loading && !hasLoadedOnce;
    const hasError = !!error;

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
    }, [measureFit, isInitialLoading, hasError]);
    // ==============================

    // place the dropdown centered under its column using the REAL dropdown element (runs after every render while open,
    // so it also fixes itself when the options finish loading and the dropdown changes size)
    useLayoutEffect(() => {
        if (openFilter === null) return;
        const el = filterDropdownRef.current;
        if (!el) return;
        const pos = computeFilterDropdownPos(filterBtnRefs.current[openFilter], el, dropdownPosition);
        if (pos && (Math.abs(pos.top - dropdownPosition.top) > 0.5 || Math.abs(pos.left - dropdownPosition.left) > 0.5)) {
            setDropdownPosition(pos);
        }
    }, [openFilter, dropdownPosition, filterOptions, filterOptionsLoading]);

    // keep the filter dropdown glued to its column while the table / page scrolls or the screen is resized
    useEffect(() => {
        if (openFilter === null) return;
        const handler = (e) => {
            // scrolling the value list INSIDE the dropdown must not reposition it
            if (e && e.type === 'scroll' && filterDropdownRef.current && e.target instanceof Node && filterDropdownRef.current.contains(e.target)) return;
            const el = filterDropdownRef.current;
            const pos = computeFilterDropdownPos(filterBtnRefs.current[openFilter], el, dropdownPosRef.current);
            if (pos) setDropdownPosition((prev) => (Math.abs(prev.top - pos.top) <= 0.5 && Math.abs(prev.left - pos.left) <= 0.5 ? prev : pos));
        };
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [openFilter]);

    console.log(error);

    if (error) return <div className="p-4 bg-red-100 text-red-700 rounded">{error.message || error.msg || "Something Went Wrong"}</div>;

    if (loading && !hasLoadedOnce) {
        return (
            <div className="flex items-center justify-center h-full py-10">
                <Loader2 className="h-14 w-14 animate-spin text-gray-500" />
            </div>
        );
    }
    const isRefetching = loading && hasLoadedOnce;

    // Inline edit save -> mark the edited work order as REVISED
    const handleEditedSubmitWithRevision = async () => {
        const target = findWorkOrder(isEdit?.compId, isEdit?.rowId);
        try {
            await Promise.resolve(handleEditedSubmit());
        } finally {
            if (target) markRevised(target);
        }
    };

    // ---------- NEW: REFRESH (reloads the work orders again from the server, keeps page + filters) ----------
    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await Promise.all([
                // 1) work orders of the current page with the current filters
                fetchData(`/api/work-order/${orderType}`, {
                    params: { page, limit, filters: filtersParam }
                })
                    .then((res) => {
                        if (res) {
                            setOrders(res.data ?? []);
                            if (res.pagination) setPagination(res.pagination);
                        }
                    })
                    .catch((err) => {
                        console.error("Refresh failed:", err);
                    }),

                // 2) the "Download Challan (n)" count
                (async () => {
                    if (!user?.id) return;
                    try {
                        const res = await axiosPrivate.get(`/api/prepare-to-download/${Number(user?.id)}`);
                        setPrepareChallan(res.data);
                    } catch (err) {
                        console.error("Failed to refresh challan prep data:", err);
                    }
                })(),
            ]);

            // 3) filter dropdown values may be old now -> clear them and reload the ones of the active filters
            setFilterOptions({});
            Object.keys(filters).forEach((columnName) => {
                if (FILTERABLE_COLUMNS.has(columnName)) loadFilterOptions(columnName);
            });
        } finally {
            setIsRefreshing(false);
        }
    };
    // ---------- END REFRESH ----------

    const handleEditRowData = async (id, orderTypeForYarnDye) => {
        const singleWorkOrderId = Array.isArray(id) ? id[0] : id;
        setLoadingDeliveries(true);
        setIsEditing(true);
        setJobId(singleWorkOrderId);
        setChangedField({});
        setDuplicateChallan([]);
        setChallanIssue([]);

        setIsYarnDyeSelected(orderTypeForYarnDye)
        console.log(orderTypeForYarnDye, "orderType");

        fetchData(`/api/deliveries/${orderType}`, {
            params: { workOrderIds: singleWorkOrderId }
        })
            .then(data => {
                if (data) {
                    setDeliveries(data);
                    setWorkOrderId(singleWorkOrderId);
                    console.log(data, "deliveries line 485");
                }
            })
            .catch(error => {
                console.error("Fetch error:", error);
            })
            .finally(() => {
                setLoadingDeliveries(false);
            });
    };

    const FACTORY_OPTIONAL_DELIVERY_TYPES = new Set([
        "Received From Compacting",
        "Received From Reprocess",
        "Received From HEAT Set",
    ]);

    const isFactoryOptional = (deliveryType) =>
        FACTORY_OPTIONAL_DELIVERY_TYPES.has(deliveryType);

    const handleEditOnChange = (yarnId, e) => {
        const { name, value } = e.target;
        setIsEditing(true);

        setChangedField(prev => {
            const rowPrev = prev[yarnId] || {};
            const updatedRow = { ...rowPrev, [name]: value };

            if (name !== "date" && updatedRow.date === undefined) {
                updatedRow.date = new Date().toISOString().split("T")[0];
            }

            if (name === "deliveryType") {
                delete updatedRow.toFactory;
                delete updatedRow.fromFactory;
                updatedRow.factoryOptional = isFactoryOptional(value);
            }

            const isAopGreyReceived = updatedRow.deliveryType === "Received From Aop";

            const deliveries = [
                { deliveryType: updatedRow.deliveryType, qty: updatedRow.deliveryQty },
                ...(updatedRow.finishReceivedQty ? [{
                    deliveryType: isAopGreyReceived ? "AOP Finish Fabric Rcvd" : "Finish Received",
                    qty: updatedRow.finishReceivedQty
                }] : []),
            ];

            return { ...prev, [yarnId]: { ...updatedRow, deliveries } };
        });
    };

    const handleSubmit = async (yarnId, workOrderId, overridePayload = null) => {
        setIsLoading(true);
        setChallanIssue([]);
        setDeliveryIssue([]);

        const rawPayload = overridePayload || changedField[yarnId] || {};
        // `linkedDeliveries` is for the frontend only -> never send it inside the main payload
        const { linkedDeliveries, ...mainPayload } = rawPayload;
        const singleWorkOrderId = Array.isArray(workOrderId) ? workOrderId[0] : workOrderId;

        // Batch No: only yarn dye orders need it (required for Finish Received).
        // Knitting / Dyeing / AOP never need it and never send it.
        const isYarnDye = orderType === "yarnDyeingOrder";

        // Grey Received aggregates multiple matching Work Order compositions into
        // one UI action. The backend validates and creates all allocations atomically.
        if (mainPayload.greyReceivedBatch === true) {
            const workOrderIds = [...new Set((mainPayload.allocations || []).map((item) => Number(item.workOrderId)))];
            let batchSaved = false;
            try {
                const response = await axiosPrivate.post("/api/grey-received-batch", mainPayload);
                batchSaved = true;
                (mainPayload.allocations || []).forEach((allocation) => {
                    const revisedWo = findWorkOrder(allocation.yarnId, allocation.workOrderId);
                    if (revisedWo) markRevised(revisedWo);
                });

                setChallanIssue([{
                    message: response.data?.message || "Grey Received batch saved successfully.",
                    type: "success",
                }]);
                setChangedField((prev) => {
                    const next = { ...prev };
                    delete next[yarnId];
                    return next;
                });

                await Promise.all([
                    fetchData(`/api/work-order/${orderType}`, {
                        params: { page, limit, filters: filtersParam }
                    }).then((res) => {
                        if (res) {
                            setOrders(res.data ?? []);
                            if (res.pagination) setPagination(res.pagination);
                            setIsEditing(false);
                        }
                    }),
                    Promise.all(workOrderIds.map((id) =>
                        fetchData(`/api/deliveries/${orderType}`, {
                            params: { workOrderIds: id }
                        })
                    )).then((results) => {
                        setDeliveries(results.flatMap((result) => Array.isArray(result) ? result : []));
                    }),
                ]);
            } catch (error) {
                const errorPayload = error.response?.data;
                setDeliveryIssue([{
                    message: batchSaved
                        ? "Grey Received was saved successfully, but the screen could not refresh. Reopen the delivery modal to verify the saved quantities."
                        : (errorPayload?.message || error.message || "Grey Received batch failed. No allocations were confirmed."),
                    type: "error",
                }]);
            } finally {
                setIsLoading(false);
            }
            return;
        }

        const isFinishReceived = (p) =>
            Array.isArray(p?.deliveries) &&
            p.deliveries.some((d) => d.deliveryType === "Finish Received");

        const mainIsFinishReceived =
            mainPayload.deliveryType === "Finish Received" || isFinishReceived(mainPayload);

        if (isYarnDye && mainIsFinishReceived) {
            const cleanBatch = String(mainPayload.batchNo ?? "").trim();
            if (!cleanBatch) {
                setDeliveryIssue([
                    {
                        title: `Finish Received (ID ${yarnId})`,
                        message: "Please enter Batch No",
                        type: "error",
                    },
                ]);
                setIsLoading(false);
                return;
            }
            mainPayload.batchNo = cleanBatch;
        } else {
            delete mainPayload.batchNo;
        }

        // Linked deliveries (e.g. Grey Delivery for the dyeing composition) go FIRST,
        // so if they fail nothing is saved and the user can fix it.
        const linkedSteps = Array.isArray(linkedDeliveries)
            ? linkedDeliveries.map((l) => ({
                yarnId: l.yarnId,
                workOrderId: Array.isArray(l.workOrderId) ? l.workOrderId[0] : l.workOrderId,
                payload: l.payload,
                label: l.payload?.deliveryType || "Linked delivery",
                isMain: false,
            }))
            : [];

        const steps = [
            ...linkedSteps,
            {
                yarnId,
                workOrderId: singleWorkOrderId,
                payload: mainPayload,
                label: mainPayload.deliveryType || "Delivery",
                isMain: true,
            },
        ];

        const completed = [];
        let failure = null;

        try {
            for (const step of steps) {
                try {
                    await axiosPrivate.patch(
                        `/api/update-order`,
                        step.payload,
                        { params: { yarnId: step.yarnId, workOrderId: step.workOrderId } }
                    );
                    console.log(step.payload);
                    completed.push(step);
                } catch (e) {
                    console.log(`${step.label} failed:`, e.response?.data ?? e.message ?? e);
                    const errorPayload = e.response?.data;
                    const issues = Array.isArray(errorPayload)
                        ? errorPayload
                        : [{
                            message: errorPayload?.message ?? "Something went wrong. Please try again.",
                            type: "error",
                        }];

                    failure = {
                        step,
                        issues: steps.length > 1
                            ? issues.map((i) => ({
                                ...i,
                                title: i.title
                                    ? `${step.label} (ID ${step.yarnId}): ${i.title}`
                                    : `${step.label} (ID ${step.yarnId}) failed`,
                            }))
                            : issues,
                    };
                    break; // stop at the first failure
                }
            }

            if (completed.length > 0) {
                // a saved change => mark this work order as REVISED
                const revisedWo = findWorkOrder(yarnId, singleWorkOrderId);
                if (revisedWo) markRevised(revisedWo);

                setChallanIssue(
                    completed.map((s) => ({
                        message: s.isMain
                            ? "Delivery Added"
                            : `${s.label} added for composition ID ${s.yarnId}`,
                        type: "success",
                    }))
                );

                await Promise.all([
                    fetchData(`/api/work-order/${orderType}`, {
                        params: { page, limit, filters: filtersParam }
                    })
                        .then((res) => {
                            if (res) {
                                setOrders(res.data ?? []);
                                console.log(res.data);
                                if (res.pagination) setPagination(res.pagination);
                                // close the modal only when everything succeeded,
                                // so any error stays visible
                                if (!failure) setIsEditing(false);
                            }
                        })
                        .catch((err) => {
                            console.log("Failed to refresh orders:", err);
                            setChallanIssue(prev => [
                                ...prev,
                                { message: "Order list refresh failed", type: "error" }
                            ]);
                        }),

                    fetchData(`/api/deliveries/${orderType}`, {
                        params: { workOrderIds: singleWorkOrderId }
                    })
                        .then((dev) => {
                            setDeliveries(dev);
                        })
                        .catch((err) => {
                            console.log("Failed to refresh deliveries:", err);
                            setChallanIssue(prev => [
                                ...prev,
                                { message: "Deliveries refresh failed", type: "error" }
                            ]);
                        }),
                ]);

                // main delivery saved -> clear this row's inputs
                if (completed.some((s) => s.isMain)) {
                    setChangedField(prev => {
                        const next = { ...prev };
                        delete next[yarnId];
                        return next;
                    });
                }
            }

            if (failure) {
                setDeliveryIssue(failure.issues);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // called by YarnDeliveryModal after a successful save
    const handleYarnDyeSaved = async ({ savedYarnIds = [], workOrderIds = [] }) => {
        // mark the work orders as REVISED
        workOrderIds.forEach((woId) => {
            const wo = findWorkOrder(null, woId);
            if (wo) markRevised(wo);
        });

        // clear the typed inputs of the saved colors
        setChangedField((prev) => {
            const next = { ...prev };
            savedYarnIds.forEach((id) => delete next[id]);
            return next;
        });

        // reload the table (and the deliveries, in case the modal is reopened)
        await Promise.all([
            fetchData(`/api/work-order/${orderType}`, {
                params: { page, limit, filters: filtersParam }
            }).then((res) => {
                if (res) {
                    setOrders(res.data ?? []);
                    if (res.pagination) setPagination(res.pagination);
                }
            }).catch((err) => console.log("Failed to refresh orders:", err)),

            workOrderId
                ? fetchData(`/api/deliveries/${orderType}`, {
                    params: { workOrderIds: workOrderId }
                }).then((dev) => setDeliveries(dev))
                    .catch((err) => console.log("Failed to refresh deliveries:", err))
                : Promise.resolve(),
        ]);
    };

    const handleClearFilters = () => {
        setFilters({});
        setFilterOptions({});
    };

    const handlePDFchallanDownload = async () => {
        try {
            setIsChallanDownloading({ isLoading: true, isError: false });
            const response = await axiosPrivate.get(`/api/challan/download/${user?.id}`, {
                responseType: "blob",
            });

            const disposition = response.headers["content-disposition"];
            const match = disposition?.match(/filename="?([^"]+)"?/);
            const filename = match?.[1] ?? `challans-${Date.now()}.pdf`;

            const blob = new Blob([response.data], { type: "application/pdf" });
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setIsChallanDownloading({ isLoading: false, isError: false });
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            if (error?.response?.data instanceof Blob) {
                const text = await error.response.data.text();
                console.error("Challan download failed:", JSON.parse(text)?.message ?? text);
                setIsChallanDownloading({ isLoading: false, isError: true });
            } else {
                console.error("Challan download failed:", error);
            }
        }
    };


    const filterHeaderStyle = {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        padding: "12px 16px",
        backgroundColor: "#F8FAFC",
        borderBottom: "2px solid #CBD5E1",
        alignItems: "center",
        minHeight: "56px",
    };

    const filterTagStyle = {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 14px",
        backgroundColor: "#0F172A",
        color: "#FFFFFF",
        borderRadius: "6px",
        fontSize: "13px",
        fontWeight: "700",
        boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
        border: "1px solid #334155"
    };

    const filterTagLabelStyle = {
        fontWeight: "800",
        opacity: 1.0,
        letterSpacing: "0.5px",
    };

    const filterTagValueStyle = {
        maxWidth: "200px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontWeight: "500",
    };

    const removeFilterButtonStyle = {
        background: "rgba(255,255,255,0.2)",
        border: "none",
        borderRadius: "50%",
        width: "20px",
        height: "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: "#FFFFFF",
        padding: "0",
        lineHeight: "1",
        transition: "background 0.2s",
    };

    const filterIconStyle = {
        color: "#271294",
        marginRight: "4px",
    };

    const activeFiltersContainerStyle = {
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flex: 1,
        flexWrap: "wrap",
    };

    const allFilterOptions = openFilter ? (filterOptions[openFilter] || []) : [];
    const filteredOptions = allFilterOptions.filter(opt =>
        String(opt).toLowerCase().includes(filterSearch.toLowerCase())
    );
    const isAllSelected = filterTempSelected.length === allFilterOptions.length && allFilterOptions.length > 0;

    return (
        <div>
            {/* Invisible screen-height probe (used only to measure the bottom of the visible screen) */}
            <div
                ref={viewportProbeRef}
                aria-hidden="true"
                style={{ position: 'fixed', top: 0, bottom: 0, left: 0, width: 1, pointerEvents: 'none', visibility: 'hidden' }}
            />

            {showToast && (
                <Toast message={toastMessage} type={toastType} onClose={() => setShowToast(false)} duration={3000} />
            )}

            {/* everything above the table box (watched for size changes) */}
            <div ref={topRef}>
                <div className="flex gap-2 mb-0.5">
                    {/* NEW: REFRESH button */}
                    <button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        title="Refresh"
                        className={`bg-gray-700 text-white rounded-md p-2 text-lg flex items-center gap-2 ${isRefreshing ? "opacity-70 cursor-wait" : "hover:bg-gray-800"}`}
                    >
                        <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
                        {isRefreshing ? "Refreshing..." : "Refresh"}
                    </button>
                    {isEdit?.isEditing && (
                        <button onClick={() => handleEditedSubmitWithRevision()} title="Save Changes" className="bg-blue-700 text-white rounded-md p-2 text-lg">
                            <Save />
                        </button>
                    )}
                    {isInlineEditingLoading && (
                        <button title="Saving..." className="bg-blue-700 text-white rounded-md p-2 text-lg cursor-wait">
                            <Loader />
                        </button>
                    )}
                    {Object.keys(filters).length > 0 && (
                        <button onClick={() => handleClearFilters()} title="Clear Filter" className="bg-red-600 text-white rounded-md p-2 text-lg flex items-center gap-2">
                            <FunnelX /> Clear Filters
                        </button>
                    )}
                    {isChallanDowloading.isLoading === false && prepareForChallan?.length > 0 && (
                        <button onClick={() => handlePDFchallanDownload()} title="Download Challan" className="bg-blue-700 text-white rounded-md p-2 text-lg flex gap-2 items-center">
                            <DownloadCloudIcon /> Download Challan ({prepareForChallan?.length})
                        </button>
                    )}
                    {(isChallanDowloading.isLoading || isChallanDowloading.isError !== null) && (
                        <button
                            title="Download Status"
                            className={`${isChallanDowloading.isError ? "bg-red-400 text-red-700" : "bg-blue-700 text-white"} rounded-md p-2 text-lg flex gap-2 items-center`}
                        >
                            {isChallanDowloading.isLoading && <span className="animate-spin"><Loader /></span>}
                            {isChallanDowloading.isLoading === true ? "Downloading..." : isChallanDowloading.isError === true && "Download Failed"}
                        </button>
                    )}
                </div>

                {Object.keys(filters).length > 0 && (
                    <div style={filterHeaderStyle}>
                        <div style={activeFiltersContainerStyle}>
                            <Filter size={18} style={filterIconStyle} />
                            <span style={{ fontWeight: "700", color: "#0F172A", fontSize: "14px" }}>
                                Active Filters:
                            </span>
                            {Object.entries(filters).map(([columnName, values]) => {
                                const column = COLUMNS.find(c => c.inputName === columnName);
                                const columnHeader = column ? column.header : columnName;
                                const displayValues = Array.isArray(values) ? values : [values];

                                return (
                                    <div key={columnName} style={filterTagStyle}>
                                        <span style={filterTagLabelStyle}>{columnHeader}:</span>
                                        <span style={filterTagValueStyle}>
                                            {displayValues.length > 2
                                                ? `${displayValues.slice(0, 2).join(", ")} +${displayValues.length - 2}`
                                                : displayValues.join(", ")
                                            }
                                        </span>
                                        <button
                                            onClick={() => handleRemoveFilter(columnName)}
                                            style={removeFilterButtonStyle}
                                            title={`Remove ${columnHeader} filter`}
                                            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.4)"}
                                            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                                        >
                                            <X size={14} strokeWidth={3} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="mb-5 p-2 rounded-sm" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {(!orders || orders.length < 1) && !isRefetching && <div className="text-gray-600 font-medium">No order found</div>}
                    {isRefetching && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 13 }}>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Updating...</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200" style={{ borderTop: "3px solid #217346", overflow: "hidden" }}>
                {/* The box height is calculated from the screen: it fills everything under the toolbar */}
                <div
                    ref={scrollContainerRef}
                    className="order-table-wrapper"
                    style={{ position: "relative", overflowX: "auto", overflowY: "auto", height: fit.height, boxSizing: "border-box" }}
                >
                    <style>{`
                        .filter-icon-btn {
                            cursor: pointer;
                            padding: 2px 4px;
                            border-radius: 3px;
                            transition: all 0.2s;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            background: transparent;
                            border: none;
                            color: rgba(255, 255, 255, 0.8);
                            margin-left: 4px;
                            flex-shrink: 0;
                        }
                        .filter-icon-btn:hover {
                            background: rgba(255, 255, 255, 0.25);
                            color: rgba(255, 255, 255, 1);
                        }
                        .filter-icon-btn.active {
                            color: rgba(255, 255, 255, 1);
                            background: rgba(255, 255, 255, 0.3);
                        }
                        .filter-dropdown-excel {
                            position: fixed;
                            z-index: 100000;
                            background: #ffffff;
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            box-shadow: 0 8px 24px rgba(0,0,0,0.18);
                            min-width: 260px;
                            max-width: 320px;
                            padding: 8px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        }
                        .filter-dropdown-excel .filter-search-input {
                            width: 100%;
                            padding: 8px 10px;
                            border: 1px solid #d1d5db;
                            border-radius: 4px;
                            font-size: 13px;
                            outline: none;
                            box-sizing: border-box;
                            margin-bottom: 6px;
                            color: #1f2937;
                        }
                        .filter-dropdown-excel .filter-search-input:focus {
                            border-color: #3b82f6;
                            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
                        }
                        .filter-dropdown-excel .filter-search-input::placeholder {
                            color: #9ca3af;
                        }
                        .filter-dropdown-excel .filter-list {
                            max-height: 220px;
                            overflow-y: auto;
                            border: 1px solid #e5e7eb;
                            border-radius: 4px;
                            margin-bottom: 8px;
                        }
                        .filter-dropdown-excel .filter-item {
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            padding: 6px 10px;
                            cursor: pointer;
                            font-size: 13px;
                            color: #1f2937;
                            border-bottom: 1px solid #f3f4f6;
                            transition: background 0.15s;
                        }
                        .filter-dropdown-excel .filter-item:last-child {
                            border-bottom: none;
                        }
                        .filter-dropdown-excel .filter-item:hover {
                            background: #f0f9ff;
                        }
                        .filter-dropdown-excel .filter-item input[type="checkbox"] {
                            width: 15px;
                            height: 15px;
                            accent-color: #2563eb;
                            cursor: pointer;
                            flex-shrink: 0;
                        }
                        .filter-dropdown-excel .filter-item label {
                            cursor: pointer;
                            flex: 1;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            white-space: nowrap;
                            user-select: none;
                        }
                        .filter-dropdown-excel .filter-select-all {
                            font-weight: 600;
                            background: #f9fafb;
                            border-bottom: 1px solid #e5e7eb;
                        }
                        .filter-dropdown-excel .filter-buttons {
                            display: flex;
                            justify-content: flex-end;
                            gap: 8px;
                        }
                        .filter-dropdown-excel .filter-btn {
                            padding: 6px 16px;
                            border-radius: 4px;
                            font-size: 13px;
                            font-weight: 600;
                            cursor: pointer;
                            border: 1px solid #d1d5db;
                            transition: all 0.15s;
                        }
                        .filter-dropdown-excel .filter-btn-cancel {
                            background: #ffffff;
                            color: #374151;
                        }
                        .filter-dropdown-excel .filter-btn-cancel:hover {
                            background: #f3f4f6;
                        }
                        .filter-dropdown-excel .filter-btn-apply {
                            background: #2563eb;
                            color: #ffffff;
                            border-color: #2563eb;
                        }
                        .filter-dropdown-excel .filter-btn-apply:hover {
                            background: #1d4ed8;
                        }
                        /* FIXED layout: columns never resize, so frozen columns stay exactly where they are */
                        .order-table-wrapper table {
                            width: ${totalTableWidth}px !important;
                            min-width: ${totalTableWidth}px !important;
                            table-layout: fixed !important;
                            border-collapse: separate !important;
                            border-spacing: 0 !important;
                            background: #ffffff !important;
                        }
                        .order-table-wrapper th, .order-table-wrapper td {
                            text-align: center !important;
                            vertical-align: middle !important;
                            padding: 7px 10px !important;
                            box-sizing: border-box !important;
                            border-bottom: 1px solid #D9DEE5 !important;
                            border-right: 1px solid #D9DEE5 !important;
                            font-size: 13px !important;
                            color: #1F2937 !important;
                            font-variant-numeric: tabular-nums !important;
                        }
                        .order-table-wrapper th:nth-child(-n+${FROZEN_COUNT}),
                        .order-table-wrapper td:nth-child(-n+${FROZEN_COUNT}) {
                            white-space: normal !important;
                            word-break: break-word !important;
                            overflow-wrap: break-word !important;
                            overflow: visible !important;
                            text-overflow: clip !important;
                        }
                        
                        /* Z-Index Stacking Context */
                        .order-table-wrapper thead th {
                            background: #6b7280 !important;
                            color: #ffffff !important;
                            font-weight: 700 !important;
                            font-size: 12px !important;
                            letter-spacing: .45px !important;
                            text-transform: uppercase !important;
                            border-right: 1px solid #1B5E3B !important;
                            border-bottom: 2px solid #14532D !important;
                            padding: 9px 10px !important;
                            text-shadow: 0 1px 1px rgba(0,0,0,.25);
                            white-space: normal !important;
                            word-break: break-word !important;
                            vertical-align: middle !important;
                            position: sticky !important;
                            top: 0 !important;
                            z-index: 25 !important;
                        }
                        .order-table-wrapper thead th:nth-child(-n+${FROZEN_COUNT}) {
                            z-index: 35 !important;
                        }
                        .order-table-wrapper tbody td:nth-child(-n+${FROZEN_COUNT}) {
                            background-color: #ffffff !important;
                            z-index: 15 !important;
                        }
                        .order-table-wrapper thead th button,
                        .order-table-wrapper thead th svg {
                            color: #EAF6EE !important;
                        }

                        .order-table-wrapper tbody tr:nth-child(even) td {
                            background-color: #F2F7F4 !important;
                        }
                        .order-table-wrapper tbody tr:nth-child(even) td:nth-child(-n+${FROZEN_COUNT}) {
                            background-color: #F2F7F4 !important;
                        }

                        .order-table-wrapper tbody tr {
                            transition: background-color 0.12s ease;
                        }
                        .order-table-wrapper tbody tr:hover td {
                            background-color: #DCEFD9 !important;
                        }

                        .se-badge {
                            display: inline-block;
                            min-width: 86px;
                            padding: 4px 14px;
                            border-radius: 9px;
                            border: 1px solid transparent;
                            font-family: "Consolas", "SF Mono", "Menlo", "Courier New", monospace;
                            font-weight: 700;
                            font-size: 13px;
                            letter-spacing: .6px;
                            line-height: 1.2;
                            text-align: center;
                            white-space: nowrap;
                            box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
                        }
                        .se-neg  { background: #FCEDEF; border-color: #E5A9B4; color: #8C1D2F; }
                        .se-pos  { background: #E9F7EE; border-color: #A3D9B4; color: #17663A; }
                        .se-zero { background: #F3F4F6; border-color: #D6DAE1; color: #6B7280; }
                    `}</style>

                    {(
                        orderType === "knittingOrder" ||
                        orderType === "dyeingOrder" ||
                        orderType === "aopOrder"
                    ) && isEditing && (
                            <Modal
                                workOrderId={workOrderId}
                                isLoading={isLoading}
                                deliveriesLoading={loadingDeliveries}
                                deliveries={deliveries}
                                duplicateChallan={duplicateChallan}
                                setIsEditing={setIsEditing}
                                handleSubmit={handleSubmit}
                                handleEditOnChange={handleEditOnChange}
                                orderId={jobId}
                                orders={orders}
                                setJobId={setJobId}
                                orderType={orderType}
                                changedField={changedField}
                                challanIssue={challanIssue}
                                deliveryIssue={deliveryIssue}

                            />
                        )}


                    {orderType === "yarnDyeingOrder" && isEditing && (
                        <YarnDeliveryModal
                            isOpen={true}
                            onClose={() => {
                                setIsEditing(false);
                                setIsYarnDyeSelected("");
                            }}
                            deliveries={deliveries}
                            changedField={changedField}
                            handleEditOnChange={handleEditOnChange}
                            isFetching={loadingDeliveries}
                            onSaved={handleYarnDyeSaved}
                        />
                    )}

                    {
                        // workOrderEditModal, setWorkOrderModal

                        workOrderReviseModal.isShowModal && (
                            <WorkOrderEditModal
                                setWorkOrderModal={setWorkOrderReviseModal}
                                workOrderReviseData={workOrderReviseData}
                                orderType={orderType}
                            />
                        )
                    }


                    {
                        isCancelModalOpen && (
                            <WorkOrderCancelModal
                                dataForCancellation={dataForCancellation}
                                setIsCancelModalOpen={setIsCancelModalOpen}
                                orderType={orderType}

                            />
                        )
                    }

                    <table ref={tableRef}>
                        <colgroup>
                            {COLUMNS.map((col, i) => (
                                <col key={i} style={{
                                    width: `${columnWidths[i]}px`,
                                    minWidth: `${columnWidths[i]}px`,
                                }} />
                            ))}
                        </colgroup>

                        <thead>
                            <tr>
                                {COLUMNS.map((col, i) => {
                                    const isFilterable = col.inputName && FILTERABLE_COLUMNS.has(col.inputName);
                                    const isFrozen = i < FROZEN_COUNT;
                                    const hasActiveFilter = filters[col.inputName];

                                    return (
                                        <th
                                            key={i}
                                            style={{
                                                position: "sticky",
                                                top: 0,
                                                left: isFrozen ? `${safeFrozenLefts[i]}px` : "auto",
                                                boxShadow: i === FROZEN_COUNT - 1 ? "3px 0 6px -1px rgba(0,0,0,0.30)" : "none",
                                                backgroundColor: hasActiveFilter ? "#166534" : "#6b7280",
                                            }}
                                        >
                                            <div style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                width: "100%",
                                                gap: "4px"
                                            }}>
                                                <span style={{
                                                    textAlign: "center",
                                                    flex: 1,
                                                    fontWeight: 700,
                                                    fontSize: "11.5px",
                                                    minWidth: 0,
                                                    whiteSpace: "normal",
                                                    wordBreak: "break-word",
                                                    lineHeight: "1.3",
                                                    padding: "2px 0"
                                                }}>
                                                    {col.header}
                                                </span>
                                                {isFilterable && (
                                                    <button
                                                        ref={(el) => { filterBtnRefs.current[col.inputName] = el; }}
                                                        data-filter-btn="true"
                                                        className={`filter-icon-btn ${hasActiveFilter ? 'active' : ''}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openFilterDropdown(col.inputName, e.currentTarget);
                                                        }}
                                                        title={`Filter by ${col.header}`}
                                                    >
                                                        <Filter size={14} strokeWidth={2} />
                                                    </button>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        {orderType === "yarnDyeingOrder" && <YarnDyeOrders
                            orders={orders}
                            searchTerm={appliedSearchTerm}
                            handleEditRowData={handleEditRowData}
                            FROZEN_COUNT={FROZEN_COUNT}
                            currentFrozenWidths={safeFrozenWidths}
                            currentFrozenLefts={safeFrozenLefts}
                            isEdit={isEdit}
                            updatedFields={updatedFields}
                            handleOnChange={handleOnChange}
                            handleInlineEdit={handleInlineEdit}
                            handleRedirect={handleRedirect}
                            columnWidths={columnWidths}
                            getDataForCancellation={getDataForCancellation}
                            handlePreview={handlePreview}
                            getRevisionCount={getRevisionCount}
                            setWorkOrderReviseModal={setWorkOrderReviseModal}
                            handleReviseWorkOrder={handleReviseWorkOrder}

                        />}
                        {orderType === "knittingOrder" && <KnittingOrder
                            orders={orders}
                            searchTerm={appliedSearchTerm}
                            setJobId={setJobId}
                            handleEditRowData={handleEditRowData}
                            FROZEN_COUNT={FROZEN_COUNT}
                            currentFrozenWidths={safeFrozenWidths}
                            currentFrozenLefts={safeFrozenLefts}
                            isEdit={isEdit}
                            updatedFields={updatedFields}
                            handleOnChange={handleOnChange}
                            handleInlineEdit={handleInlineEdit}
                            handleRedirect={handleRedirect}
                            columnWidths={columnWidths}
                            getDataForCancellation={getDataForCancellation}
                            handlePreview={handlePreview}
                            getRevisionCount={getRevisionCount}
                            setWorkOrderReviseModal={setWorkOrderReviseModal}
                            handleReviseWorkOrder={handleReviseWorkOrder}
                        />}
                        {orderType === "dyeingOrder" && <DyeingOrder
                            orders={orders}
                            searchTerm={appliedSearchTerm}
                            handleEditRowData={handleEditRowData}
                            updatedFields={updatedFields}
                            isEdit={isEdit}
                            handleOnChange={handleOnChange}
                            handleInlineEdit={handleInlineEdit}
                            FROZEN_COUNT={FROZEN_COUNT}
                            currentFrozenWidths={safeFrozenWidths}
                            currentFrozenLefts={safeFrozenLefts}
                            handleRedirect={handleRedirect}
                            columnWidths={columnWidths}
                            getDataForCancellation={getDataForCancellation}
                            handlePreview={handlePreview}
                            getRevisionCount={getRevisionCount}
                            setWorkOrderReviseModal={setWorkOrderReviseModal}
                            handleReviseWorkOrder={handleReviseWorkOrder}
                        />}
                        {orderType === "aopOrder" && <AopOrder
                            orders={orders}
                            searchTerm={appliedSearchTerm}
                            handleEditRowData={handleEditRowData}
                            setJobId={setJobId}
                            FROZEN_COUNT={FROZEN_COUNT}
                            currentFrozenWidths={safeFrozenWidths}
                            currentFrozenLefts={safeFrozenLefts}
                            updatedFields={updatedFields}
                            handleOnChange={handleOnChange}
                            isEdit={isEdit}
                            handleInlineEdit={handleInlineEdit}
                            handleRedirect={handleRedirect}
                            columnWidths={columnWidths}
                            getDataForCancellation={getDataForCancellation}
                            handlePreview={handlePreview}
                            getRevisionCount={getRevisionCount}
                            setWorkOrderReviseModal={setWorkOrderReviseModal}
                            handleReviseWorkOrder={handleReviseWorkOrder}
                        />}
                    </table>
                </div>
            </div>

            {openFilter && (
                <div
                    ref={filterDropdownRef}
                    className="filter-dropdown-excel"
                    style={{
                        position: "fixed",
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        zIndex: 100000,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        type="text"
                        className="filter-search-input"
                        placeholder="Search items..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                    />

                    <div className="filter-list">
                        <div className="filter-item filter-select-all">
                            <input
                                type="checkbox"
                                id="filter-select-all"
                                checked={isAllSelected}
                                onChange={toggleSelectAll}
                            />
                            <label htmlFor="filter-select-all">(Select All)</label>
                        </div>
                        {filteredOptions.map((opt, idx) => {
                            const isChecked = filterTempSelected.includes(opt);
                            const itemId = `filter-item-${openFilter}-${idx}`;
                            return (
                                <div key={idx} className="filter-item">
                                    <input
                                        type="checkbox"
                                        id={itemId}
                                        checked={isChecked}
                                        onChange={() => toggleFilterItem(opt)}
                                    />
                                    <label htmlFor={itemId}>{String(opt)}</label>
                                </div>
                            );
                        })}
                        {filteredOptions.length === 0 && (
                            <div style={{ padding: "10px", textAlign: "center", color: "#9ca3af", fontSize: "13px" }}>
                                No items found
                            </div>
                        )}
                    </div>

                    <div className="filter-buttons">
                        <button className="filter-btn filter-btn-cancel" onClick={cancelFilter}>
                            Cancel
                        </button>
                        <button className="filter-btn filter-btn-apply" onClick={applyFilter}>
                            APPLY
                        </button>
                    </div>
                </div>
            )}

            {/* WORK ORDER PREVIEW / PRINT (A4 landscape) */}
            {previewData && (
                <WorkOrderPreviewModal
                    data={previewData}
                    orderType={orderType}
                    revisionCount={getRevisionCount(previewData.wo)}
                    onClose={closePreview}
                />
            )}
        </div>
    );
};

export default AllOrders;