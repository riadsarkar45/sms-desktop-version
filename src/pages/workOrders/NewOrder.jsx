import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
    Loader2,
    Save,
    X,
    Plus,
    Package,
    FileText,
    ClipboardList,
    Factory,
    Layers,
    RefreshCw,
    ToggleLeft,
    ToggleRight,
    Building2,
    Building,
    Search,
    CheckCircle2,
    AlertCircle,
} from "lucide-react";

import DashboardLayout from "../../components/DashboardLayout";
import Input from "../../components/InputText/Input";
import Toast from "../../components/tost/Tost";
import { useNavigate, useParams } from "react-router-dom";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
const toNum = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

// Keeps only digits and a single decimal point
const sanitizeDecimal = (value) =>
    String(value ?? "")
        .replace(/[^\d.]/g, "")
        .replace(/(\..*)\./g, "$1");

// Fields in a yarn color row that must be numeric
const NUMERIC_YARN_FIELDS = new Set(["qty", "price"]);
// Fields in a work order line that must be numeric
const NUMERIC_LOT_FIELDS = new Set(["workOrderQty"]);
// Composition-level fields (shared by all lines) that must be numeric
const NUMERIC_ROW_FIELDS = new Set(["unitPrice"]);
// Fields driven by the PI / Lot / Count inventory
const INVENTORY_FIELDS = new Set(["lotNo", "yarnCount", "piNo"]);

// Stable ids so React keys stay correct when yarn colors are removed
let yarnColorCounter = 0;
const defaultYarnColor = () => ({
    uid: ++yarnColorCounter,
    color: "",
    qty: "",
    price: "",
    lotNo: "",
    yarnCount: "",
    piNo: "",
});

// Stable ids so React keys stay correct when work order lines are removed.
// A line holds ONLY: qty, lot, yarn count and PI.
// Price / stich length / machine dia live on the composition row.
let lotCounter = 0;
const defaultLot = (init = {}) => ({
    uid: ++lotCounter,
    workOrderQty: "",
    lotNo: "",
    yarnCount: "",
    piNo: "",
    ...init,
});

const getFactoryName = (factory) => {
    if (typeof factory === "string") return factory;

    return (
        factory?.factoryName ||
        factory?.name ||
        factory?.factory ||
        ""
    );
};

// ---------------------------------------------------------
// Yarn inventory helpers (one entry = PI + Lot No + Yarn Count)
// ---------------------------------------------------------
const uniqSorted = (values) => [...new Set(values)].sort();

const inventoryKey = (piNo, lotNo, yarnCount) =>
    JSON.stringify([piNo, lotNo, yarnCount]);

const getAllLots = (inventory) =>
    uniqSorted(inventory.map((entry) => entry.lotNo));

const getAllCounts = (inventory) =>
    uniqSorted(inventory.map((entry) => entry.yarnCount));

const getCountsForLot = (inventory, lotNo) =>
    uniqSorted(
        inventory
            .filter((entry) => entry.lotNo === lotNo)
            .map((entry) => entry.yarnCount)
    );

const getLotsForCount = (inventory, yarnCount) =>
    uniqSorted(
        inventory
            .filter((entry) => entry.yarnCount === yarnCount)
            .map((entry) => entry.lotNo)
    );

const getPisForPair = (inventory, lotNo, yarnCount) =>
    inventory
        .filter(
            (entry) => entry.lotNo === lotNo && entry.yarnCount === yarnCount
        )
        .sort((a, b) => a.piNo.localeCompare(b.piNo));

const getAvailableQty = (inventory, piNo, lotNo, yarnCount) =>
    inventory.find(
        (entry) =>
            entry.piNo === piNo &&
            entry.lotNo === lotNo &&
            entry.yarnCount === yarnCount
    )?.totalQuantity ?? 0;

// Applies a Lot / Count / PI change to a line or yarn color and keeps the
// three fields consistent (auto-fills a value when only one choice exists).
const applyInventoryChange = (inventory, item, field, value) => {
    const next = { ...item, [field]: value };

    if (field === "lotNo") {
        const counts = getCountsForLot(inventory, value);
        if (!counts.includes(next.yarnCount)) {
            next.yarnCount = counts.length === 1 ? counts[0] : "";
        }
    } else if (field === "yarnCount") {
        const lots = getLotsForCount(inventory, value);
        if (!lots.includes(next.lotNo)) {
            next.lotNo = lots.length === 1 ? lots[0] : "";
        }
    }

    if (field !== "piNo") {
        const pis = getPisForPair(inventory, next.lotNo, next.yarnCount).map(
            (entry) => entry.piNo
        );

        if (!pis.includes(next.piNo)) {
            next.piNo = pis.length === 1 ? pis[0] : "";
        }
    }

    return next;
};

// Yarn requirement for one composition.
// Uses the row's own process loss, falling back to the style's.
const calcRequireQty = (row, fallbackLoss) => {
    const hasOwnLoss =
        row.processLoss !== "" &&
        row.processLoss !== null &&
        row.processLoss !== undefined;

    const loss = hasOwnLoss ? toNum(row.processLoss) : toNum(fallbackLoss);

    return (
        toNum(row.finishRequiredQty) * (1 + loss / 100) +
        toNum(row.additional)
    );
};

// Sum of all work order qty lines of one composition
const sumLotQty = (row) =>
    (row.lots || []).reduce((sum, lot) => sum + toNum(lot.workOrderQty), 0);

// Amount of one composition = total line qty x the composition's price
const sumLotAmount = (row) => sumLotQty(row) * toNum(row.unitPrice);

const ORDER_TYPE_RULES = {
    knittingOrder: {
        lotNo: true,
        yarnCount: true,
        stichLength: true,
        machineDia: true,
    },
    aopOrder: {
        lotNo: true,
        yarnCount: true,
        stichLength: false,
        machineDia: false,
    },
    dyeingOrder: {
        lotNo: true,
        yarnCount: true,
        stichLength: true,
        machineDia: false,
    },
    yarnDyeingOrder: {
        lotNo: false,
        yarnCount: false,
        stichLength: false,
        machineDia: false,
    },
};

const getRules = (orderType) =>
    ORDER_TYPE_RULES[orderType] || {};

const buildRowsFromStyle = (style) => {
    const initialRows = (style?.rows || []).map((row, index) => ({
        ...row,
        id: row.id || Date.now() + index,
        composition: row.composition || "",
        color: row.color || "",
        orderQty: row.orderQty || "",
        finishRequiredQty: row.finishRequiredQty || "",
        finishDia: row.finishDia || "",
        processLoss: row.processLoss || "",
        additional: row.additional || "",
        compBreakdown: row.compBreakdown || [],
        // Shared by every line of this composition
        unitPrice: row.unitPrice || "",
        stichLength: "",
        machineDia: "",
        lots: [defaultLot()],
        yarnColors: [defaultYarnColor()],
    }));

    return initialRows.length
        ? initialRows
        : [{
            id: Date.now(),
            composition: "",
            color: "",
            orderQty: "",
            finishRequiredQty: "",
            finishDia: "",
            processLoss: "",
            additional: "",
            unitPrice: "",
            stichLength: "",
            machineDia: "",
            lots: [defaultLot()],
            yarnColors: [defaultYarnColor()],
        }];
};

const SectionCard = ({
    icon: Icon,
    title,
    description,
    children,
    aside,
}) => (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                    <Icon size={16} />
                </span>

                <div>
                    <h3 className="text-sm font-semibold tracking-tight text-slate-800">
                        {title}
                    </h3>

                    {description && (
                        <p className="mt-0.5 text-xs text-slate-500">
                            {description}
                        </p>
                    )}
                </div>
            </div>

            {aside}
        </header>

        <div className="p-5 sm:p-6">{children}</div>
    </section>
);

const SELECT_CLASS =
    "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100";

// Lot No + Yarn Count + PI No selects.
// Renders three grid cells, so put it directly inside a grid container.
// Used by work order lines AND yarn dyeing colors.
const LotCountPiFields = ({ item, onChange, inventory, loading }) => {
    const lotOptions = item.yarnCount
        ? getLotsForCount(inventory, item.yarnCount)
        : getAllLots(inventory);

    const countOptions = item.lotNo
        ? getCountsForLot(inventory, item.lotNo)
        : getAllCounts(inventory);

    const piOptions =
        item.lotNo && item.yarnCount
            ? getPisForPair(inventory, item.lotNo, item.yarnCount)
            : [];

    const availableQty =
        item.piNo && item.lotNo && item.yarnCount
            ? getAvailableQty(inventory, item.piNo, item.lotNo, item.yarnCount)
            : null;

    const noStock = !loading && inventory.length === 0;

    return (
        <>
            <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    Lot No <span className="text-red-500">*</span>
                </label>
                <select
                    value={item.lotNo}
                    disabled={loading || noStock}
                    onChange={(e) => onChange("lotNo", e.target.value)}
                    className={SELECT_CLASS}
                >
                    <option value="">
                        {loading ? "Loading lots..." : "Select Lot No"}
                    </option>
                    {lotOptions.map((lotNo) => (
                        <option key={lotNo} value={lotNo}>
                            {lotNo}
                        </option>
                    ))}
                </select>
            </div>

            <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    Yarn Count <span className="text-red-500">*</span>
                </label>
                <select
                    value={item.yarnCount}
                    disabled={loading || noStock}
                    onChange={(e) => onChange("yarnCount", e.target.value)}
                    className={SELECT_CLASS}
                >
                    <option value="">
                        {loading ? "Loading counts..." : "Select Yarn Count"}
                    </option>
                    {countOptions.map((count) => (
                        <option key={count} value={count}>
                            {count}
                        </option>
                    ))}
                </select>
            </div>

            <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    PI No <span className="text-red-500">*</span>
                </label>
                <select
                    value={item.piNo}
                    disabled={loading || piOptions.length === 0}
                    onChange={(e) => onChange("piNo", e.target.value)}
                    className={SELECT_CLASS}
                >
                    <option value="">
                        {item.lotNo && item.yarnCount
                            ? "Select PI No"
                            : "Select Lot & Count first"}
                    </option>
                    {piOptions.map((entry) => (
                        <option key={entry.piNo} value={entry.piNo}>
                            {entry.piNo} — {entry.totalQuantity.toLocaleString()} KG
                        </option>
                    ))}
                </select>

                {availableQty !== null && (
                    <p className="mt-1 text-[11px] text-slate-500">
                        Available in this PI: {availableQty.toLocaleString()} KG
                    </p>
                )}
            </div>
        </>
    );
};

const NewOrder = () => {
    // The URL is the single source of truth for the active Job No.
    const { jobNumber } = useParams();
    const navigate = useNavigate();
    const axiosPrivate = useAxiosPrivate();

    // Toast
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastType, setToastType] = useState("success");
    // Changing key forces the Toast to remount on every notification,
    // so repeated/identical messages are always shown again.
    const [toastId, setToastId] = useState(0);

    // Inline validation error (shown in the footer next to the buttons)
    const [formError, setFormError] = useState("");

    // True ONLY while the create-order request is in flight.
    const [isSubmitting, setIsSubmitting] = useState(false);

    // True after a successful save while we wait to redirect.
    const [isSaved, setIsSaved] = useState(false);

    const [isLoading, setIsLoading] = useState(true);

    const [styleData, setStyleData] = useState(null);
    const [rows, setRows] = useState([]);
    const [orderType, setOrderType] = useState("");

    // Bump this to re-fetch the current style (e.g. after saving an order)
    const [reloadKey, setReloadKey] = useState(0);

    // Job search states
    const [searchJobNo, setSearchJobNo] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [isSearchingJobs, setIsSearchingJobs] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // Factory states
    const [factoryData, setFactoryData] = useState([]);
    const [factories, setFactories] = useState([]);
    const [isFactoryDataLoading, setFactoryLoading] = useState(false);
    const [isFactoriesLoading, setIsFactoriesLoading] = useState(false);

    const [autoRedirect, setAutoRedirect] = useState(true);

    // Yarn inventory from /api/lots-work-orders:
    // one entry per PI + Lot No + Yarn Count with its remaining balance.
    const [lotsAndCounts, setLotsAndCounts] = useState([]);
    const [isLotsAndCountsLoading, setIsLotsAndCountsLoading] = useState(false);
    const [lotQtyAlert, setLotQtyAlert] = useState("");

    // Refs
    const redirectTimerRef = useRef(null);
    // Synchronous lock against fast double clicks
    const submitLockRef = useRef(false);
    const searchBoxRef = useRef(null);

    const [formData, setFormData] = useState({
        workOrderPlaceDate: "",
        workOrderNo: "",
        month: "",
        salesContractNo: "",
        buyer: "",
        jobNo: "",
        poNo: "",
        style: "",
        orderType: "",
        factoryName: "",
        processLoss: "",
    });

    // Currently loaded Job No (loaded style first, URL as fallback)
    const activeJobNo = styleData?.jobNo || jobNumber || "";

    // Form is read-only while saving / waiting to redirect
    const isBusy = isSubmitting || isSaved;

    // Clear any pending redirect timer when leaving the page
    useEffect(() => {
        return () => {
            if (redirectTimerRef.current) {
                clearTimeout(redirectTimerRef.current);
            }
        };
    }, []);

    // Close the job-search dropdown when clicking outside of it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                searchBoxRef.current &&
                !searchBoxRef.current.contains(event.target)
            ) {
                setShowSearchResults(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const showNotification = useCallback((message, type = "success") => {
        setToastMessage(message);
        setToastType(type);
        setToastId((prev) => prev + 1);
        setShowToast(true);
    }, []);

    // Load the yarn inventory (PI + Lot + Yarn Count + remaining balance).
    // Reloaded after a successful save so the balances stay current.
    useEffect(() => {
        let isMounted = true;
        const controller = new AbortController();

        const fetchLotsAndCounts = async () => {
            setIsLotsAndCountsLoading(true);

            try {
                const response = await axiosPrivate.get("/api/lots-work-orders", {
                    signal: controller.signal,
                });

                const responseData = response.data?.data ?? response.data;
                const records = Array.isArray(responseData) ? responseData : [];

                if (isMounted) {
                    setLotsAndCounts(
                        records
                            .map((item) => ({
                                piNo: String(item?.piNo ?? "").trim(),
                                lotNo: String(item?.lotNo ?? "").trim(),
                                yarnCount: String(item?.yarnCount ?? "").trim(),
                                totalQuantity: toNum(item?.totalQuantity),
                            }))
                            .filter(
                                (item) =>
                                    item.piNo &&
                                    item.lotNo &&
                                    item.yarnCount &&
                                    item.totalQuantity > 0
                            )
                    );
                }
            } catch (error) {
                if (controller.signal.aborted || error?.code === "ERR_CANCELED") return;

                console.error("Failed to fetch available lots and yarn counts:", error);
                if (isMounted) {
                    setLotsAndCounts([]);
                    showNotification(
                        error?.response?.data?.message || "Failed to load available lots and yarn counts",
                        "error"
                    );
                }
            } finally {
                if (isMounted) setIsLotsAndCountsLoading(false);
            }
        };

        fetchLotsAndCounts();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [axiosPrivate, showNotification, reloadKey]);

    // ---------------------------------------------------------
    // Apply selected style data to the form
    // ---------------------------------------------------------
    const applyStyleData = useCallback((style) => {
        if (!style) return;

        setStyleData(style);
        setFormError("");
        setIsSaved(false);

        setFormData({
            workOrderPlaceDate: "",
            workOrderNo: "",
            month: "",
            salesContractNo: style.salesContractNo || "",
            buyer: style.buyerName || "",
            jobNo: style.jobNo || "",
            poNo: style.poNo || "",
            style: style.styleNo || "",
            orderType: "",
            factoryName: "",
            processLoss: style.processLoss ?? "",
        });

        // Reset order-type-specific information when switching jobs.
        setOrderType("");
        setFactories([]);
        setFactoryData([]);
        setRows(buildRowsFromStyle(style));
    }, []);

    // ---------------------------------------------------------
    // Style fetch — runs whenever the URL param changes
    // ---------------------------------------------------------
    useEffect(() => {
        let isMounted = true;

        const fetchStyleData = async () => {
            if (!jobNumber) {
                setStyleData(null);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const response = await axiosPrivate.get(
                    `/api/styles/${encodeURIComponent(jobNumber)}`,
                    {
                        params: {
                            reconciliation: false,
                            styleRequirement: true,
                        },
                    }
                );

                if (!isMounted) return;

                const data = response.data?.data;
                const style = Array.isArray(data) ? data[0] : data;

                if (!style) {
                    showNotification("Style not found", "error");
                    setStyleData(null);
                    return;
                }

                applyStyleData(style);
            } catch (error) {
                if (!isMounted) return;

                console.error("Failed to fetch style data:", error);
                showNotification(
                    error?.response?.data?.message || "Failed to load style data",
                    "error"
                );
                setStyleData(null);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchStyleData();

        return () => {
            isMounted = false;
        };
    }, [jobNumber, reloadKey, axiosPrivate, applyStyleData, showNotification]);

    // ---------------------------------------------------------
    // Job No search (debounced 1s, cancels stale requests)
    // ---------------------------------------------------------
    useEffect(() => {
        const searchValue = searchJobNo.trim();

        if (!searchValue) {
            setSearchResults([]);
            setIsSearchingJobs(false);
            setShowSearchResults(false);
            return undefined;
        }

        setShowSearchResults(true);
        setIsSearchingJobs(true);

        const controller = new AbortController();

        const timer = setTimeout(async () => {
            try {
                const response = await axiosPrivate.get(
                    "/api/search-job-for-work-order",
                    {
                        params: { jobNo: searchValue },
                        signal: controller.signal,
                    }
                );

                if (controller.signal.aborted) return;

                const results = response.data?.data;

                setSearchResults(Array.isArray(results) ? results : []);
            } catch (error) {
                if (
                    controller.signal.aborted ||
                    error?.code === "ERR_CANCELED" ||
                    error?.name === "CanceledError"
                ) {
                    return;
                }

                console.error("Job search failed:", error);
                setSearchResults([]);
                showNotification(
                    error?.response?.data?.message || "Job search failed",
                    "error"
                );
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearchingJobs(false);
                }
            }
        }, 1000);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [searchJobNo, axiosPrivate, showNotification]);

    // ---------------------------------------------------------
    // Select a Job No from search results (only changes the URL)
    // ---------------------------------------------------------
    const handleSelectSearchJob = (selectedJob) => {
        if (!selectedJob?.jobNo || isBusy) return;

        setShowSearchResults(false);
        setSearchJobNo("");
        setSearchResults([]);

        if (selectedJob.jobNo === (jobNumber || "")) {
            showNotification(`Job ${selectedJob.jobNo} is already loaded`, "success");
            return;
        }

        navigate(
            `/dashboard/new-order/${encodeURIComponent(selectedJob.jobNo)}`
        );
    };

    // ---------------------------------------------------------
    // Factory filtering
    // ---------------------------------------------------------
    const filteredFactories = useMemo(() => {
        const search = formData.factoryName.trim().toLowerCase();

        const uniqueFactories = [
            ...new Set(
                factories
                    .map(getFactoryName)
                    .map((name) => name.trim())
                    .filter(Boolean)
            ),
        ];

        if (!search) return uniqueFactories;

        return uniqueFactories.filter((name) =>
            name.toLowerCase().includes(search)
        );
    }, [factories, formData.factoryName]);

    // ---------------------------------------------------------
    // Already booked quantity
    // ---------------------------------------------------------
    const alreadyBookedTotal = useMemo(() => {
        if (!styleData?.compBreakdown || !orderType) return 0;

        return styleData.compBreakdown.reduce(
            (sum, item) =>
                sum +
                (parseFloat(
                    item[`${orderType}_workOrderQty`]
                ) || 0),
            0
        );
    }, [styleData, orderType]);

    // ---------------------------------------------------------
    // Style totals
    // ---------------------------------------------------------
    const styleTotals = useMemo(() => {
        const sourceRows = styleData?.rows || [];
        const styleLoss = Number(styleData?.processLoss) || 0;

        let totalOrderQty = 0;
        let totalRequireQty = 0;

        sourceRows.forEach((row) => {
            totalOrderQty += Number(row.orderQty) || 0;
            totalRequireQty += calcRequireQty(row, styleLoss);
        });

        return {
            totalOrderQty,
            totalRequireQty,
            processLoss: styleLoss,
        };
    }, [styleData]);

    // ---------------------------------------------------------
    // Current order totals
    // ---------------------------------------------------------
    const totals = useMemo(() => {
        let totalWorkOrderQty = 0;
        let totalAmount = 0;
        let compositionsWithWorkOrder = 0;

        rows.forEach((row) => {
            if (orderType === "yarnDyeingOrder") {
                const yarnColors = row.yarnColors || [];

                if (yarnColors.some((item) => Number(item.qty) > 0)) {
                    compositionsWithWorkOrder += 1;
                }

                yarnColors.forEach((item) => {
                    const qty = Number(item.qty) || 0;
                    const price = Number(item.price) || 0;

                    totalWorkOrderQty += qty;
                    totalAmount += qty * price;
                });
            } else {
                const qty = sumLotQty(row);

                if (qty > 0) compositionsWithWorkOrder += 1;

                totalWorkOrderQty += qty;
                totalAmount += sumLotAmount(row);
            }
        });

        return {
            totalWorkOrderQty,
            totalAmount,
            totalRows: rows.length,
            compositionsWithWorkOrder,
        };
    }, [rows, orderType]);

    const compBreakdownObj = useMemo(
        () =>
            Object.fromEntries(
                (styleData?.compBreakdown ?? []).map((item) => [
                    item.styleRequirementRowId,
                    item,
                ])
            ),
        [styleData?.compBreakdown]
    );

    // ---------------------------------------------------------
    // Fetch factory names based on selected order type
    // ---------------------------------------------------------
    useEffect(() => {
        let isMounted = true;

        const fetchFactories = async () => {
            if (!orderType) {
                setFactories([]);
                setIsFactoriesLoading(false);
                return;
            }

            setIsFactoriesLoading(true);

            try {
                const response = await axiosPrivate.get(
                    `/api/party-view-report/${orderType}`
                );

                if (!isMounted) return;

                const responseData =
                    response.data?.data ?? response.data;

                const factoryNames = responseData?.factoryNames || [];

                setFactories(
                    Array.isArray(factoryNames) ? factoryNames : []
                );
            } catch (error) {
                if (!isMounted) return;

                console.error("Failed to fetch factory names:", error);
                setFactories([]);

                showNotification("Failed to load factory names", "error");
            } finally {
                if (isMounted) setIsFactoriesLoading(false);
            }
        };

        fetchFactories();

        return () => {
            isMounted = false;
        };
    }, [orderType, axiosPrivate, showNotification]);

    // ---------------------------------------------------------
    // Fetch factory-wise work order totals
    // ---------------------------------------------------------
    useEffect(() => {
        let isMounted = true;

        if (!orderType || !activeJobNo) {
            setFactoryData([]);
            setFactoryLoading(false);
            return undefined;
        }

        const fetchFactoryWiseWorkOrderTotal = async () => {
            setFactoryLoading(true);

            try {
                const response = await axiosPrivate.get(
                    `/api/factories/workOrder/totals/${encodeURIComponent(activeJobNo)}/${orderType}`
                );

                if (isMounted) {
                    setFactoryData(
                        Array.isArray(response.data)
                            ? response.data
                            : response.data?.data || []
                    );
                }
            } catch (error) {
                if (isMounted) {
                    console.error("Failed to fetch factory totals:", error);
                    setFactoryData([]);
                }
            } finally {
                if (isMounted) setFactoryLoading(false);
            }
        };

        fetchFactoryWiseWorkOrderTotal();

        return () => {
            isMounted = false;
        };
    }, [axiosPrivate, activeJobNo, orderType]);

    // ---------------------------------------------------------
    // General form changes
    // ---------------------------------------------------------
    const handleChange = (e) => {
        const { name, value } = e.target;

        setFormError("");

        if (name === "orderType") {
            setOrderType(value);
            setFactories([]);
            setFactoryData([]);

            setFormData((prev) => ({
                ...prev,
                orderType: value,
                factoryName: "",
            }));

            if (value === "yarnDyeingOrder") {
                setRows((prev) =>
                    prev.map((row) => ({
                        ...row,
                        yarnColors:
                            row.yarnColors?.length
                                ? row.yarnColors
                                : [defaultYarnColor()],
                    }))
                );
            }

            return;
        }

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSelectFactory = (factoryName) => {
        setFormError("");

        setFormData((prev) => ({
            ...prev,
            factoryName,
        }));
    };

    // ---------------------------------------------------------
    // Composition changes
    // ---------------------------------------------------------
    const handleRemoveRow = (index) => {
        if (rows.length <= 1) {
            showNotification(
                "At least one composition is required",
                "error"
            );
            return;
        }

        setRows((prev) => prev.filter((_, i) => i !== index));
    };

    const handleRefreshRows = useCallback(() => {
        if (!styleData) return;

        setRows(buildRowsFromStyle(styleData));
        setFormError("");

        showNotification("Compositions restored", "success");
    }, [styleData, showNotification]);

    // Composition-level fields shared by ALL lines of that composition:
    // Price Per Kg, Stich Length, Machine Dia
    const handleRowFieldChange = (rowIndex, field, value) => {
        setFormError("");

        setRows((prev) =>
            prev.map((row, i) =>
                i === rowIndex
                    ? {
                        ...row,
                        [field]: NUMERIC_ROW_FIELDS.has(field)
                            ? sanitizeDecimal(value)
                            : value,
                    }
                    : row
            )
        );
    };

    // ---------------------------------------------------------
    // Work order line handlers
    // Each line = Qty + Lot No + Yarn Count + PI No ONLY
    // ---------------------------------------------------------
    const handleAddLot = (rowIndex) => {
        setRows((prev) =>
            prev.map((row, i) =>
                i === rowIndex
                    ? { ...row, lots: [...(row.lots ?? []), defaultLot()] }
                    : row
            )
        );
    };

    const handleLotChange = (rowIndex, lotIndex, field, value) => {
        setFormError("");
        setLotQtyAlert("");

        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                return {
                    ...row,
                    lots: (row.lots ?? [defaultLot()]).map((lot, li) => {
                        if (li !== lotIndex) return lot;

                        if (INVENTORY_FIELDS.has(field)) {
                            return applyInventoryChange(lotsAndCounts, lot, field, value);
                        }

                        return {
                            ...lot,
                            [field]: NUMERIC_LOT_FIELDS.has(field)
                                ? sanitizeDecimal(value)
                                : value,
                        };
                    }),
                };
            })
        );
    };

    const handleRemoveLot = (rowIndex, lotIndex) => {
        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                const current = row.lots ?? [];

                // Always keep at least one line
                if (current.length <= 1) return row;

                return {
                    ...row,
                    lots: current.filter((_, li) => li !== lotIndex),
                };
            })
        );
    };

    // ---------------------------------------------------------
    // Yarn color handlers (yarn dyeing)
    // Each color = Color + Qty + Price + Lot No + Yarn Count + PI No
    // ---------------------------------------------------------
    const handleAddYarnColor = (rowIndex) => {
        setRows((prev) =>
            prev.map((row, i) =>
                i === rowIndex
                    ? {
                        ...row,
                        yarnColors: [
                            ...(row.yarnColors ?? [defaultYarnColor()]),
                            defaultYarnColor(),
                        ],
                    }
                    : row
            )
        );
    };

    const handleYarnColorChange = (
        rowIndex,
        colorIndex,
        field,
        value
    ) => {
        setFormError("");
        setLotQtyAlert("");

        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                return {
                    ...row,
                    yarnColors: (row.yarnColors ?? [defaultYarnColor()]).map(
                        (color, ci) => {
                            if (ci !== colorIndex) return color;

                            if (INVENTORY_FIELDS.has(field)) {
                                return applyInventoryChange(lotsAndCounts, color, field, value);
                            }

                            return {
                                ...color,
                                [field]: NUMERIC_YARN_FIELDS.has(field)
                                    ? sanitizeDecimal(value)
                                    : value,
                            };
                        }
                    ),
                };
            })
        );
    };

    const handleRemoveYarnColor = (rowIndex, colorIndex) => {
        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                const current = row.yarnColors ?? [];

                // Always keep at least one yarn color row
                if (current.length <= 1) return row;

                return {
                    ...row,
                    yarnColors: current.filter((_, ci) => ci !== colorIndex),
                };
            })
        );
    };

    // ---------------------------------------------------------
    // Form validation
    // ---------------------------------------------------------
    const validateForm = () => {
        const fail = (message) => {
            setFormError(message);
            showNotification(message, "error");
            return false;
        };

        if (!formData.workOrderPlaceDate) {
            return fail("Work Order Place Date is required");
        }

        if (!formData.workOrderNo.trim()) {
            return fail("Work Order No is required");
        }

        if (!formData.orderType) {
            return fail("Order Type is required");
        }

        if (!formData.factoryName.trim()) {
            return fail("Factory Name is required");
        }

        if (!rows.length) {
            return fail("At least one composition is required");
        }

        const rules = getRules(orderType);
        const isYD = orderType === "yarnDyeingOrder";

        // Requested qty per PI + Lot + Count (summed over ALL lines / colors)
        const requestedByBucket = new Map();

        const addRequested = (piNo, lotNo, yarnCount, qty) => {
            const key = inventoryKey(piNo, lotNo, yarnCount);
            const current = requestedByBucket.get(key) ?? {
                piNo,
                lotNo,
                yarnCount,
                requestedQty: 0,
            };

            current.requestedQty += qty;
            requestedByBucket.set(key, current);
        };

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            if (!row.composition || !row.color) {
                return fail(
                    `Composition and Color are required for Composition ${i + 1}`
                );
            }

            if (!isYD) {
                // Composition-level (shared) fields are validated once
                if (!(toNum(row.unitPrice) > 0)) {
                    return fail(
                        `Price Per Kg must be greater than 0 for Composition ${i + 1}`
                    );
                }

                if (rules.stichLength && !String(row.stichLength).trim()) {
                    return fail(`Stich Length is required for Composition ${i + 1}`);
                }

                if (rules.machineDia && !String(row.machineDia).trim()) {
                    return fail(`Machine Dia is required for Composition ${i + 1}`);
                }

                if (!row.lots?.length) {
                    return fail(
                        `At least one Work Order Qty line is required for Composition ${i + 1}`
                    );
                }

                for (let j = 0; j < row.lots.length; j++) {
                    const lot = row.lots[j];
                    const where = `Composition ${i + 1}, Line ${j + 1}`;

                    if (!(toNum(lot.workOrderQty) > 0)) {
                        return fail(`Work Order Qty must be greater than 0 for ${where}`);
                    }

                    if (rules.lotNo && !String(lot.lotNo).trim()) {
                        return fail(`Lot No is required for ${where}`);
                    }

                    if (rules.yarnCount && !String(lot.yarnCount).trim()) {
                        return fail(`Yarn Count is required for ${where}`);
                    }

                    if (!String(lot.piNo).trim()) {
                        return fail(`PI No is required for ${where}`);
                    }

                    addRequested(
                        String(lot.piNo).trim(),
                        String(lot.lotNo).trim(),
                        String(lot.yarnCount).trim(),
                        toNum(lot.workOrderQty)
                    );
                }
            } else {
                if (!row.yarnColors?.length) {
                    return fail(
                        `At least one yarn color is required for Composition ${i + 1}`
                    );
                }

                for (let j = 0; j < row.yarnColors.length; j++) {
                    const yarnColor = row.yarnColors[j];
                    const where = `Composition ${i + 1}, Color ${j + 1}`;

                    if (!String(yarnColor.color).trim()) {
                        return fail(`Yarn color is required for ${where}`);
                    }

                    if (!(toNum(yarnColor.qty) > 0)) {
                        return fail(`Qty must be greater than 0 for ${where}`);
                    }

                    if (!(toNum(yarnColor.price) > 0)) {
                        return fail(`Price must be greater than 0 for ${where}`);
                    }

                    if (!String(yarnColor.lotNo).trim()) {
                        return fail(`Lot No is required for ${where}`);
                    }

                    if (!String(yarnColor.yarnCount).trim()) {
                        return fail(`Yarn Count is required for ${where}`);
                    }

                    if (!String(yarnColor.piNo).trim()) {
                        return fail(`PI No is required for ${where}`);
                    }

                    addRequested(
                        String(yarnColor.piNo).trim(),
                        String(yarnColor.lotNo).trim(),
                        String(yarnColor.yarnCount).trim(),
                        toNum(yarnColor.qty)
                    );
                }
            }
        }

        // Combined requested qty of every line / color must fit inside the
        // remaining balance of that exact PI + Lot + Count.
        if (isLotsAndCountsLoading) {
            return fail("Available lot quantities are still loading. Please wait and try again.");
        }

        for (const requested of requestedByBucket.values()) {
            const label = `PI ${requested.piNo} / Lot ${requested.lotNo} / Yarn Count ${requested.yarnCount}`;

            const availableQty = getAvailableQty(
                lotsAndCounts,
                requested.piNo,
                requested.lotNo,
                requested.yarnCount
            );

            if (availableQty <= 0) {
                const message = `No available quantity found for ${label}.`;
                setLotQtyAlert(message);
                return fail(message);
            }

            if (requested.requestedQty > availableQty) {
                const message =
                    `Insufficient quantity for ${label}. ` +
                    `Available: ${availableQty.toLocaleString()} KG, ` +
                    `Requested: ${requested.requestedQty.toLocaleString()} KG.`;
                setLotQtyAlert(message);
                return fail(message);
            }
        }

        setFormError("");
        setLotQtyAlert("");
        return true;
    };

    // ---------------------------------------------------------
    // Submit work order
    // ---------------------------------------------------------
    const handleSubmit = async () => {
        // Ref lock blocks double clicks instantly (state is async)
        if (submitLockRef.current || isSaved) return;
        if (!validateForm()) return;

        if (!styleData) {
            setFormError("Style data not loaded");
            showNotification("Style data not loaded", "error");
            return;
        }

        submitLockRef.current = true;
        setIsSubmitting(true);

        try {
            // Common fields for one composition
            const baseComposition = (row) => ({
                composition: row.composition,
                color: row.color,
                orderQty: row.orderQty,
            });

            const compositions = rows.flatMap((row) => {
                if (orderType === "yarnDyeingOrder") {
                    const yarnColors = (row.yarnColors ?? []).map((yc) => ({
                        color: String(yc.color).trim(),
                        qty: yc.qty,
                        price: yc.price,
                        lotNo: String(yc.lotNo).trim(),
                        yarnCount: String(yc.yarnCount).trim(),
                        piNo: String(yc.piNo).trim(),
                    }));

                    return [
                        {
                            ...baseComposition(row),
                            workOrderQty: "",
                            unitPrice: "",
                            lotNo: "",
                            yarnCount: "",
                            stichLength: "",
                            machineDia: "",
                            // composition-level PI = PI of the first color
                            piNo: yarnColors[0]?.piNo ?? "",
                            yarnColors,
                        },
                    ];
                }

                // One payload entry per Work Order line. Each line has its own
                // qty, lot, yarn count and PI; price / stich length / machine
                // dia are shared from the composition.
                return (row.lots ?? []).map((lot) => ({
                    ...baseComposition(row),
                    workOrderQty: lot.workOrderQty,
                    unitPrice: row.unitPrice,
                    lotNo: String(lot.lotNo).trim(),
                    yarnCount: String(lot.yarnCount).trim(),
                    piNo: String(lot.piNo).trim(),
                    stichLength: String(row.stichLength ?? "").trim(),
                    machineDia: String(row.machineDia ?? "").trim(),
                }));
            });

            const payload = {
                workOrderPlaceDate: formData.workOrderPlaceDate,
                workOrderNo: formData.workOrderNo.trim(),
                month: formData.month,
                jobNo: formData.jobNo,
                factoryName: formData.factoryName.trim(),
                orderType: formData.orderType,
                styleNo: styleData.styleNo,
                compositions,
            };

            // 30s timeout so a hanging server can never leave the UI stuck
            const response = await axiosPrivate.post(
                "/api/create-job",
                payload,
                { timeout: 30000 }
            );

            const responseType = response.data?.type;
            const isSuccess = responseType
                ? responseType === "success"
                : true;

            if (isSuccess) {
                setFormError("");

                showNotification(
                    response.data?.message || "Order created successfully",
                    "success"
                );

                if (autoRedirect) {
                    setIsSaved(true);

                    redirectTimerRef.current = setTimeout(() => {
                        navigate("/dashboard/style-requirement");
                    }, 1500);
                } else {
                    // Stay on the page and reload the style + inventory so
                    // previous work order qty and PI balances are current.
                    setReloadKey((prev) => prev + 1);
                }
            } else {
                const message =
                    response.data?.message || "Failed to create order";

                setFormError(message);
                showNotification(message, "error");
            }
        } catch (error) {
            console.error("Submit error:", error);

            const message =
                error?.code === "ECONNABORTED"
                    ? "Request timed out. Please check the order list before trying again."
                    : error?.response?.data?.message ||
                      "Failed to create order. Please try again.";

            setFormError(message);
            showNotification(message, "error");
        } finally {
            submitLockRef.current = false;
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => navigate(-1);

    const dyeingOrderType = [
        "knittingOrder",
        "aopOrder",
        "dyeingOrder",
        "yarnDyeingOrder",
    ];

    const currentRules = getRules(orderType);
    const isYarnDyeing = orderType === "yarnDyeingOrder";

    const totalRequireQty = styleTotals.totalRequireQty.toFixed(2);

    const toastElement = showToast ? (
        <Toast
            key={toastId}
            message={toastMessage}
            type={toastType}
            onClose={() => setShowToast(false)}
            duration={3000}
        />
    ) : null;

    // ---------------------------------------------------------
    // Loading screen
    // ---------------------------------------------------------
    if (isLoading) {
        return (
            <DashboardLayout title="Add New Order">
                {toastElement}

                <div className="flex min-h-[400px] items-center justify-center">
                    <Loader2
                        size={32}
                        className="animate-spin text-primary-500"
                    />
                    <span className="ml-3 text-slate-600">
                        Loading style data...
                    </span>
                </div>
            </DashboardLayout>
        );
    }

    if (!styleData) {
        return (
            <DashboardLayout title="Add New Order">
                {toastElement}

                <div className="flex min-h-[400px] flex-col items-center justify-center">
                    <p className="mb-4 text-slate-600">
                        No style data found
                    </p>

                    <button
                        onClick={() => navigate(-1)}
                        className="rounded-md bg-primary-500 px-4 py-2 text-white hover:bg-primary-600"
                    >
                        Go Back
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title="Add New Order">
            {toastElement}

            <div className="pb-24">
                {/* Page Header */}
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="mt-1 text-sm text-slate-500">
                            Job{" "}
                            <span className="font-medium text-slate-700">
                                {formData.jobNo || "—"}
                            </span>

                            <span className="mx-2 text-slate-300">/</span>

                            Style{" "}
                            <span className="font-medium text-slate-700">
                                {formData.style || "—"}
                            </span>

                            <span className="mx-2 text-slate-300">/</span>

                            Buyer{" "}
                            <span className="font-medium text-slate-700">
                                {formData.buyer || "—"}
                            </span>
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {orderType && (
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                {orderType
                                    .replace(/([A-Z])/g, " $1")
                                    .replace(/^./, (c) => c.toUpperCase())}
                            </span>
                        )}

                        <button
                            type="button"
                            onClick={handleRefreshRows}
                            disabled={isBusy}
                            title="Restore original compositions"
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RefreshCw size={13} />
                            Refresh Items
                        </button>

                        <button
                            type="button"
                            onClick={() => setAutoRedirect((prev) => !prev)}
                            disabled={isBusy}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${autoRedirect
                                ? "border-primary-200 bg-primary-50 text-primary-700"
                                : "border-slate-200 bg-white text-slate-500"
                                }`}
                        >
                            {autoRedirect
                                ? <ToggleRight size={15} />
                                : <ToggleLeft size={15} />}

                            Redirect after save: {autoRedirect ? "On" : "Off"}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
                    {/* Main Content (locked while saving) */}
                    <div
                        className={`space-y-6 ${isBusy ? "pointer-events-none opacity-70" : ""}`}
                        aria-busy={isBusy}
                    >
                        {/* Work Order Details */}
                        <SectionCard
                            icon={ClipboardList}
                            title="Work Order Details"
                            description="Basic identification for this work order"
                        >
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                                <Input
                                    label="Work Order Place Date"
                                    name="workOrderPlaceDate"
                                    type="date"
                                    value={formData.workOrderPlaceDate}
                                    onChange={handleChange}
                                    required
                                    isShowOutLabel
                                />

                                <Input
                                    label="Work Order No"
                                    name="workOrderNo"
                                    type="text"
                                    value={formData.workOrderNo}
                                    onChange={handleChange}
                                    placeholder="Enter work order number"
                                    isShowOutLabel
                                    required
                                />

                                <Input
                                    label="Month"
                                    name="month"
                                    type="text"
                                    value={formData.month}
                                    onChange={handleChange}
                                    placeholder="Select Month"
                                    isShowOutLabel
                                    required
                                />

                                <Input
                                    label="Job No"
                                    name="jobNo"
                                    readOnly
                                    value={formData.jobNo}
                                    placeholder="e.g. SM26-3429/JAN"
                                    isShowOutLabel
                                />

                                <Input
                                    label="Process Loss (%)"
                                    name="processLoss"
                                    value={formData.processLoss}
                                    readOnly
                                    placeholder="Wastage %"
                                    isShowOutLabel
                                />

                                <Input
                                    label="Order Type"
                                    name="orderType"
                                    value={formData.orderType}
                                    type="select"
                                    onChange={handleChange}
                                    required
                                    placeholder="Order Type"
                                    options={dyeingOrderType}
                                    isShowOutLabel
                                />
                            </div>
                        </SectionCard>

                        {/* Compositions */}
                        <SectionCard
                            icon={Layers}
                            title="Compositions"
                            description="Quantities and process parameters per composition"
                            aside={
                                <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-500">
                                    {totals.totalRows}{" "}
                                    {totals.totalRows === 1 ? "ITEM" : "ITEMS"}
                                </span>
                            }
                        >
                            <div className="space-y-4">
                                {rows.map((styleRow, index) => {
                                    const comp =
                                        compBreakdownObj[
                                        styleRow.styleRequirementRowId ??
                                        styleRow.id
                                        ];

                                    const dyeingQty =
                                        comp?.dyeingOrder_workOrderQty ?? 0;

                                    const knittingQty =
                                        comp?.knittingOrder_workOrderQty ?? 0;

                                    const aopQty =
                                        comp?.aopOrder_workOrderQty ?? 0;

                                    const requireQty = calcRequireQty(
                                        styleRow,
                                        styleTotals.processLoss
                                    ).toFixed(2);

                                    const lotList = styleRow.lots ?? [defaultLot()];
                                    const lotsTotal = sumLotQty(styleRow);
                                    const lotsAmount = sumLotAmount(styleRow);

                                    const renderRemaining = (qty) => {
                                        const remaining =
                                            Number(qty) - Number(requireQty);

                                        return (
                                            <span
                                                className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${remaining < 0
                                                    ? "border-green-200 bg-green-50 text-green-700"
                                                    : "border-rose-200 bg-rose-50 text-rose-700"
                                                    }`}
                                            >
                                                Remaining Work Order:{" "}
                                                {remaining.toFixed(2)}
                                            </span>
                                        );
                                    };

                                    return (
                                        <div
                                            key={styleRow.id || index}
                                            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300"
                                        >
                                            {/* Composition Header */}
                                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                                                <div className="flex min-w-0 items-start gap-3">
                                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">
                                                        {index + 1}
                                                    </span>

                                                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            <h3 className="truncate text-sm font-semibold text-slate-800">
                                                                {styleRow.composition || "Composition"}
                                                            </h3>

                                                            {styleRow.color && (
                                                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                                                    {styleRow.color}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {toNum(styleRow.finishRequiredQty) > 0 && (
                                                                <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                                                                    Yarn Req: {requireQty}
                                                                </span>
                                                            )}

                                                            {styleRow.finishDia ? (
                                                                <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                                                    Dia: {styleRow.finishDia}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[11px] italic text-slate-400">
                                                                    No finish dia
                                                                </span>
                                                            )}

                                                            {styleRow.additional && (
                                                                <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                                                    + {styleRow.additional}
                                                                </span>
                                                            )}

                                                            {orderType === "aopOrder" && aopQty > 0 && (
                                                                <>
                                                                    <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                                                        AOP Work Order: {aopQty}
                                                                    </span>
                                                                    {renderRemaining(aopQty)}
                                                                </>
                                                            )}

                                                            {orderType === "dyeingOrder" && dyeingQty > 0 && (
                                                                <>
                                                                    <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                                                        Dyeing Work Order: {dyeingQty}
                                                                    </span>
                                                                    {renderRemaining(dyeingQty)}
                                                                </>
                                                            )}

                                                            {orderType === "knittingOrder" && knittingQty > 0 && (
                                                                <>
                                                                    <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                                                                        Knitting Work Order: {knittingQty}
                                                                    </span>
                                                                    {renderRemaining(knittingQty)}
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveRow(index)}
                                                    title="Remove composition"
                                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>

                                            {/* Composition Inputs */}
                                            <div className="p-4">
                                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                                    <Input
                                                        label="Composition"
                                                        readOnly
                                                        value={styleRow.composition}
                                                        isShowOutLabel
                                                    />

                                                    <Input
                                                        label="Color"
                                                        readOnly
                                                        value={styleRow.color}
                                                        isShowOutLabel
                                                    />

                                                    <Input
                                                        label="Order Qty (KG)"
                                                        readOnly
                                                        value={styleRow.orderQty}
                                                        isShowOutLabel
                                                    />
                                                </div>

                                                {/* Common details (shared by ALL lines) + Work Order Lines */}
                                                {!isYarnDyeing && (
                                                    <>
                                                        {/* Common Details — entered once, not repeated per line */}
                                                        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                                            <div className="mb-3">
                                                                <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                                                    Common Details
                                                                </h5>
                                                                <p className="mt-0.5 text-[11px] text-slate-400">
                                                                    Applies to every line of this composition
                                                                </p>
                                                            </div>

                                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                                <Input
                                                                    label="Price Per Kg"
                                                                    placeholder="Unit Price"
                                                                    value={styleRow.unitPrice}
                                                                    onChange={(e) =>
                                                                        handleRowFieldChange(
                                                                            index,
                                                                            "unitPrice",
                                                                            e.target.value
                                                                        )
                                                                    }
                                                                    required
                                                                    isShowOutLabel
                                                                />

                                                                {currentRules.stichLength && (
                                                                    <Input
                                                                        label="Stich Length"
                                                                        placeholder="Stich Length"
                                                                        value={styleRow.stichLength}
                                                                        onChange={(e) =>
                                                                            handleRowFieldChange(
                                                                                index,
                                                                                "stichLength",
                                                                                e.target.value
                                                                            )
                                                                        }
                                                                        required
                                                                        isShowOutLabel
                                                                    />
                                                                )}

                                                                {currentRules.machineDia && (
                                                                    <Input
                                                                        label="Machine Dia"
                                                                        placeholder="Machine Dia"
                                                                        value={styleRow.machineDia}
                                                                        onChange={(e) =>
                                                                            handleRowFieldChange(
                                                                                index,
                                                                                "machineDia",
                                                                                e.target.value
                                                                            )
                                                                        }
                                                                        required
                                                                        isShowOutLabel
                                                                    />
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Work Order Lines */}
                                                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                                <div className="flex items-center gap-2">
                                                                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                                                        Work Order Lines
                                                                    </h5>

                                                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                                                        {lotList.length}{" "}
                                                                        {lotList.length === 1 ? "LINE" : "LINES"}
                                                                    </span>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddLot(index)}
                                                                    title="Add another line"
                                                                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                                                >
                                                                    <Plus size={13} />
                                                                    Add Line
                                                                </button>
                                                            </div>

                                                            <div className="space-y-3">
                                                                {lotList.map((lot, lotIndex) => (
                                                                    <div
                                                                        key={lot.uid ?? lotIndex}
                                                                        className="rounded-lg border border-slate-200 bg-white p-3"
                                                                    >
                                                                        {/* Line header */}
                                                                        <div className="mb-3 flex items-center justify-between gap-2">
                                                                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                                                                Line {lotIndex + 1}
                                                                            </span>

                                                                            <div className="flex items-center gap-2">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleAddLot(index)}
                                                                                    title="Add another line"
                                                                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800"
                                                                                >
                                                                                    <Plus size={14} />
                                                                                </button>

                                                                                {lotList.length > 1 && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            handleRemoveLot(index, lotIndex)
                                                                                        }
                                                                                        title="Remove this line"
                                                                                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                                                    >
                                                                                        <X size={14} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Line fields: Qty + Lot No + Yarn Count + PI No */}
                                                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                                            <Input
                                                                                label="Work Order Qty"
                                                                                placeholder="Work Order Qty"
                                                                                value={lot.workOrderQty}
                                                                                onChange={(e) =>
                                                                                    handleLotChange(
                                                                                        index,
                                                                                        lotIndex,
                                                                                        "workOrderQty",
                                                                                        e.target.value
                                                                                    )
                                                                                }
                                                                                required
                                                                                isShowOutLabel
                                                                            />

                                                                            {(currentRules.lotNo || currentRules.yarnCount) && (
                                                                                <LotCountPiFields
                                                                                    item={lot}
                                                                                    inventory={lotsAndCounts}
                                                                                    loading={isLotsAndCountsLoading}
                                                                                    onChange={(field, value) =>
                                                                                        handleLotChange(index, lotIndex, field, value)
                                                                                    }
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-xs text-slate-500">
                                                                <span>
                                                                    Composition Work Order Total:{" "}
                                                                    <span className="font-semibold tabular-nums text-slate-800">
                                                                        {lotsTotal.toLocaleString(undefined, {
                                                                            maximumFractionDigits: 2,
                                                                        })}{" "}
                                                                        KG
                                                                    </span>
                                                                </span>

                                                                <span>
                                                                    Amount:{" "}
                                                                    <span className="font-semibold tabular-nums text-slate-800">
                                                                        {lotsAmount.toLocaleString(undefined, {
                                                                            minimumFractionDigits: 2,
                                                                            maximumFractionDigits: 2,
                                                                        })}{" "}
                                                                        BDT
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {/* Yarn Dyeing Colors */}
                                                {isYarnDyeing && (
                                                    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                                        <div className="mb-3 flex items-center justify-between">
                                                            <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                                                Yarn Booking Colors
                                                            </h5>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleAddYarnColor(index)}
                                                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                                            >
                                                                <Plus size={13} />
                                                                Add Color
                                                            </button>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {(styleRow.yarnColors ?? [defaultYarnColor()]).map(
                                                                (yarnItem, colorIndex) => (
                                                                    <div
                                                                        key={yarnItem.uid ?? colorIndex}
                                                                        className="rounded-lg border border-slate-200 bg-white p-3"
                                                                    >
                                                                        <div className="mb-3 flex items-center justify-between gap-2">
                                                                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                                                                Color {colorIndex + 1}
                                                                            </span>

                                                                            {(styleRow.yarnColors ?? []).length > 1 && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        handleRemoveYarnColor(
                                                                                            index,
                                                                                            colorIndex
                                                                                        )
                                                                                    }
                                                                                    title="Remove this color"
                                                                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                                                >
                                                                                    <X size={14} />
                                                                                </button>
                                                                            )}
                                                                        </div>

                                                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                                            <Input
                                                                                label="Booking Color"
                                                                                placeholder="Yarn booking color"
                                                                                value={yarnItem.color}
                                                                                onChange={(e) =>
                                                                                    handleYarnColorChange(
                                                                                        index,
                                                                                        colorIndex,
                                                                                        "color",
                                                                                        e.target.value
                                                                                    )
                                                                                }
                                                                                required
                                                                                isShowOutLabel
                                                                            />

                                                                            <Input
                                                                                label="Qty (KG)"
                                                                                placeholder="Qty"
                                                                                value={yarnItem.qty}
                                                                                onChange={(e) =>
                                                                                    handleYarnColorChange(
                                                                                        index,
                                                                                        colorIndex,
                                                                                        "qty",
                                                                                        e.target.value
                                                                                    )
                                                                                }
                                                                                required
                                                                                isShowOutLabel
                                                                            />

                                                                            <Input
                                                                                label="Price Per Kg"
                                                                                placeholder="Unit Price"
                                                                                value={yarnItem.price}
                                                                                onChange={(e) =>
                                                                                    handleYarnColorChange(
                                                                                        index,
                                                                                        colorIndex,
                                                                                        "price",
                                                                                        e.target.value
                                                                                    )
                                                                                }
                                                                                required
                                                                                isShowOutLabel
                                                                            />

                                                                            <LotCountPiFields
                                                                                item={yarnItem}
                                                                                inventory={lotsAndCounts}
                                                                                loading={isLotsAndCountsLoading}
                                                                                onChange={(field, value) =>
                                                                                    handleYarnColorChange(
                                                                                        index,
                                                                                        colorIndex,
                                                                                        field,
                                                                                        value
                                                                                    )
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        {/* Factory Input */}
                        <SectionCard
                            icon={Factory}
                            title="Factory"
                            description="Where this work order will be produced"
                        >
                            <div className="max-w-md">
                                <Input
                                    label="Factory Name"
                                    name="factoryName"
                                    value={formData.factoryName}
                                    onChange={handleChange}
                                    placeholder="Type factory name..."
                                    required
                                    isShowOutLabel
                                />
                            </div>
                        </SectionCard>
                    </div>

                    {/* Sidebar */}
                    <aside className="xl:sticky xl:top-6">
                        {/* Job Search */}
                        <div
                            ref={searchBoxRef}
                            className="relative mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                            <div className="mb-3 flex items-center gap-2">
                                <Search size={16} className="text-slate-500" />
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                                    Search Job
                                </h4>
                            </div>

                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchJobNo}
                                    disabled={isBusy}
                                    onChange={(e) => {
                                        setSearchJobNo(e.target.value);
                                        setShowSearchResults(true);
                                    }}
                                    onFocus={() => {
                                        if (searchJobNo.trim()) {
                                            setShowSearchResults(true);
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                            setShowSearchResults(false);
                                        }
                                    }}
                                    placeholder="Type Job No..."
                                    autoComplete="off"
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                />

                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    {isSearchingJobs ? (
                                        <Loader2 size={17} className="animate-spin" />
                                    ) : (
                                        <Search size={17} />
                                    )}
                                </span>
                            </div>

                            <p className="mt-2 text-[11px] text-slate-400">
                                Search by Job No only. Results load 1 second after typing stops.
                            </p>

                            {showSearchResults && searchJobNo.trim() && (
                                <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                                    {isSearchingJobs ? (
                                        <div className="flex items-center justify-center gap-2 px-4 py-5 text-xs text-slate-500">
                                            <Loader2 size={16} className="animate-spin" />
                                            Searching Job No...
                                        </div>
                                    ) : searchResults.length > 0 ? (
                                        <div className="max-h-80 overflow-y-auto">
                                            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                                    {searchResults.length} matching job(s)
                                                </p>
                                            </div>

                                            {searchResults.map((job, index) => (
                                                <button
                                                    key={job.id || `${job.jobNo}-${index}`}
                                                    type="button"
                                                    onClick={() => handleSelectSearchJob(job)}
                                                    className="flex w-full items-start justify-between gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-semibold text-slate-800">
                                                            {job.jobNo}
                                                        </p>

                                                        <p className="mt-1 truncate text-xs text-slate-500">
                                                            Buyer: {job.buyerName || "—"}
                                                        </p>

                                                        <p className="mt-0.5 truncate text-xs text-slate-400">
                                                            Style: {job.styleNo || "—"}
                                                        </p>
                                                    </div>

                                                    <span className="mt-1 shrink-0 text-slate-400">
                                                        <CheckCircle2 size={16} />
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-4 py-6 text-center">
                                            <Search
                                                size={22}
                                                className="mx-auto mb-2 text-slate-300"
                                            />
                                            <p className="text-xs font-medium text-slate-600">
                                                No matching Job No found
                                            </p>
                                            <p className="mt-1 text-[11px] text-slate-400">
                                                Try another Job No.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                                    Currently selected
                                </p>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                                    {activeJobNo || "No Job selected"}
                                </p>
                            </div>
                        </div>

                        {/* Order Summary */}
                        <div className="mb-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                                <FileText size={15} className="text-slate-500" />
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                    Order Summary
                                </h4>
                            </div>

                            <div className="space-y-3 px-5 py-4">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" />
                                        Total Order Qty
                                    </span>

                                    <span className="text-sm font-medium tabular-nums text-slate-900">
                                        {styleTotals.totalOrderQty.toLocaleString()}
                                        <span className="ml-1 text-xs text-slate-400">PCS</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" />
                                        Finish Required Qty
                                    </span>

                                    <span className="text-sm font-medium tabular-nums text-slate-900">
                                        {totalRequireQty}
                                        <span className="ml-1 text-xs text-slate-400">KG</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" />
                                        Previous Work Order Qty
                                    </span>

                                    <span className="text-sm font-medium tabular-nums text-slate-900">
                                        {alreadyBookedTotal.toLocaleString()}
                                        <span className="ml-1 text-xs text-slate-400">KG</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" />
                                        New Work Order Qty
                                    </span>

                                    <span className="text-sm font-medium tabular-nums text-slate-900">
                                        {totals.totalWorkOrderQty.toLocaleString()}
                                        <span className="ml-1 text-xs text-slate-400">KG</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                                    <span className="text-xs text-slate-500">
                                        Work Short &amp; Excess
                                    </span>

                                    <span
                                        className={`text-xs font-semibold tabular-nums ${alreadyBookedTotal -
                                            Number(totalRequireQty) +
                                            totals.totalWorkOrderQty < 0
                                            ? "text-green-600"
                                            : "text-red-600"
                                            }`}
                                    >
                                        {Math.abs(
                                            alreadyBookedTotal -
                                            Number(totalRequireQty) +
                                            totals.totalWorkOrderQty
                                        ).toFixed(2)}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                                    <span className="text-xs text-slate-500">
                                        Work Orders Created
                                    </span>

                                    <span className="text-xs font-semibold tabular-nums text-slate-700">
                                        {totals.compositionsWithWorkOrder} / {totals.totalRows} compositions
                                    </span>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                                    Estimated Total
                                </p>

                                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                                    {totals.totalAmount.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                    <span className="ml-1.5 text-xs font-medium text-slate-400">
                                        BDT
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Factory Wise Total */}
                        <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                                <Building2 size={15} className="text-slate-500" />
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                    Factory wise total work order qty
                                </h4>
                            </div>

                            {isFactoryDataLoading ? (
                                <div className="space-y-4 px-5 py-4">
                                    {[...Array(3)].map((_, index) => (
                                        <div
                                            key={index}
                                            className="flex animate-pulse items-center justify-between"
                                        >
                                            <div className="h-3.5 w-28 rounded bg-slate-200" />
                                            <div className="h-3.5 w-16 rounded bg-slate-200" />
                                        </div>
                                    ))}
                                </div>
                            ) : factoryData.length ? (
                                factoryData.map((fact, index) => (
                                    <div
                                        key={fact.factoryName || index}
                                        className="px-5 py-4"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-sm text-slate-600">
                                                <Building size={14} className="text-slate-400" />
                                                {fact.factoryName}
                                            </span>

                                            <span className="text-sm font-medium tabular-nums text-slate-900">
                                                {Number(fact.workOrderQty).toFixed(2)}
                                                <span className="ml-1 text-xs text-slate-400">KG</span>
                                            </span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="px-5 py-6 text-center text-xs text-slate-400">
                                    No factory data available
                                </div>
                            )}
                        </div>

                        {/* Factory Names */}
                        <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                                <div className="flex items-center gap-2">
                                    <Building2 size={15} className="text-slate-500" />
                                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                        Factory Names
                                    </h4>
                                </div>

                                <span className="text-[11px] font-semibold tabular-nums text-slate-400">
                                    {filteredFactories.length}
                                    {formData.factoryName.trim()
                                        ? ` / ${factories.length}`
                                        : ""}
                                </span>
                            </div>

                            {isFactoriesLoading ? (
                                <div className="space-y-4 px-5 py-4">
                                    {[...Array(3)].map((_, index) => (
                                        <div
                                            key={index}
                                            className="h-3.5 w-32 animate-pulse rounded bg-slate-200"
                                        />
                                    ))}
                                </div>
                            ) : filteredFactories.length > 0 ? (
                                <div className="max-h-72 divide-y divide-slate-50 overflow-y-auto">
                                    {filteredFactories.map((factoryName, index) => (
                                        <button
                                            key={`${factoryName}-${index}`}
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => handleSelectFactory(factoryName)}
                                            title={`Use ${factoryName}`}
                                            className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <Building size={14} className="shrink-0 text-slate-400" />
                                            <span className="truncate text-xs text-slate-600">
                                                {factoryName}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="px-5 py-6 text-center">
                                    <Building2 size={22} className="mx-auto mb-2 text-slate-300" />
                                    <p className="text-xs text-slate-400">
                                        {!orderType
                                            ? "Select an order type to load factories"
                                            : formData.factoryName.trim()
                                                ? "No matching factory found"
                                                : "No factory names available"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </aside>
                </div>
            </div>

            {/* Fixed Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 pr-24 shadow-[0_-4px_12px_rgba(15,23,42,0.05)] backdrop-blur">
                <div className="flex items-center justify-between gap-4">
                    {/* Info / validation error / saved message */}
                    <div className="min-w-0 flex-1">
                        {formError ? (
                            <p
                                role="alert"
                                className="flex items-center gap-1.5 text-xs font-medium text-red-600"
                            >
                                <AlertCircle size={14} className="shrink-0" />
                                <span className="truncate">{formError}</span>
                            </p>
                        ) : isSaved ? (
                            <p className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                                <CheckCircle2 size={14} className="shrink-0" />
                                <span className="truncate">
                                    Order saved successfully. Redirecting...
                                </span>
                            </p>
                        ) : (
                            <p className="truncate text-xs text-slate-500">
                                {totals.totalRows} composition
                                {totals.totalRows === 1 ? "" : "s"}
                                {" · "}review before submitting
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isSubmitting}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <X size={15} />
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || isSaved || isLoading}
                            aria-busy={isSubmitting}
                            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 ${isSaved
                                ? "bg-green-600 hover:bg-green-600"
                                : "bg-slate-900 hover:bg-slate-800"
                                }`}
                        >
                            {isSubmitting ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : isSaved ? (
                                <CheckCircle2 size={15} />
                            ) : (
                                <Save size={15} />
                            )}

                            {isSubmitting
                                ? "Saving..."
                                : isSaved
                                    ? "Saved"
                                    : "Create Order"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom quantity alert - intentionally not window.alert() */}
            {lotQtyAlert && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setLotQtyAlert("");
                    }}
                >
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="lot-quantity-alert-title"
                        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
                    >
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                                <AlertCircle size={21} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h3 id="lot-quantity-alert-title" className="text-base font-semibold text-slate-900">
                                    Lot quantity unavailable
                                </h3>
                                <p className="mt-2 text-sm leading-6 text-slate-600">
                                    {lotQtyAlert}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setLotQtyAlert("")}
                                aria-label="Close alert"
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="mt-5 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setLotQtyAlert("")}
                                className="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
                            >
                                Okay
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default NewOrder;