import { useEffect, useState, useMemo, useCallback } from "react";
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

const defaultYarnColor = () => ({
    color: "",
    qty: "",
    price: "",
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
        unitPrice: row.unitPrice || "",
        compBreakdown: row.compBreakdown || [],
        workOrderQty: "",
        stichLength: "",
        machineDia: "",
        lotNo: "",
        yarnCount: "",
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
            workOrderQty: "",
            stichLength: "",
            machineDia: "",
            lotNo: "",
            yarnCount: "",
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

    const [isSubmitting, setIsSubmitting] = useState(false);
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
        stichLength: "",
        lotNo: "",
        unitPrice: "",
        yarnCount: "",
        processLoss: "",
    });

    // Currently loaded Job No (loaded style first, URL as fallback)
    const activeJobNo = styleData?.jobNo || jobNumber || "";

    const showNotification = useCallback((message, type = "success") => {
        setToastMessage(message);
        setToastType(type);
        setToastId((prev) => prev + 1);
        setShowToast(true);
    }, []);

    // ---------------------------------------------------------
    // Apply selected style data to the form
    // ---------------------------------------------------------
    const applyStyleData = useCallback((style) => {
        if (!style) return;

        setStyleData(style);
        setFormError("");

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
            stichLength: "",
            lotNo: "",
            unitPrice: "",
            yarnCount: "",
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
    // (initial load, job picked from search, or after saving).
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
    // Job No search
    //
    // API is called 1 second after the user stops typing.
    // Every new keystroke cancels the previous timer AND any
    // in-flight request, so stale responses can never overwrite
    // newer results.
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
    // Select a Job No from search results.
    //
    // We only change the URL here. The style-fetch effect above
    // reacts to the new :jobNumber param and loads the data, so the
    // URL, the page and every dependent request stay in sync.
    // ---------------------------------------------------------
    const handleSelectSearchJob = (selectedJob) => {
        if (!selectedJob?.jobNo) return;

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

        let totalOrderQty = 0;
        let totalFinishRequiredQty = 0;
        let totalAdditional = 0;

        sourceRows.forEach((row) => {
            totalOrderQty += Number(row.orderQty) || 0;
            totalFinishRequiredQty += Number(row.finishRequiredQty) || 0;
            totalAdditional += Number(row.additional) || 0;
        });

        return {
            totalOrderQty,
            totalFinishRequiredQty,
            processLoss: Number(styleData?.processLoss) || 0,
            totalAdditional,
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
                const qty = Number(row.workOrderQty) || 0;
                const price = Number(row.unitPrice) || 0;

                if (qty > 0) compositionsWithWorkOrder += 1;

                totalWorkOrderQty += qty;
                totalAmount += qty * price;
            }
        });

        return {
            totalWorkOrderQty,
            totalAmount,
            totalRows: rows.length,
            compositionsWithWorkOrder,
        };
    }, [rows, orderType]);

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
    // Uses the currently loaded Job No.
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
                            row.yarnColors ?? [defaultYarnColor()],
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
    const handleRowChange = (index, field, value) => {
        setFormError("");

        setRows((prev) =>
            prev.map((row, i) =>
                i === index ? { ...row, [field]: value } : row
            )
        );
    };

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

    // ---------------------------------------------------------
    // Yarn color handlers
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

        setRows((prev) =>
            prev.map((row, i) =>
                i === rowIndex
                    ? {
                        ...row,
                        yarnColors: (
                            row.yarnColors ?? [defaultYarnColor()]
                        ).map((color, ci) =>
                            ci === colorIndex
                                ? { ...color, [field]: value }
                                : color
                        ),
                    }
                    : row
            )
        );
    };

    const handleRemoveYarnColor = (rowIndex, colorIndex) => {
        setRows((prev) =>
            prev.map((row, i) =>
                i === rowIndex
                    ? {
                        ...row,
                        yarnColors: (row.yarnColors ?? []).filter(
                            (_, ci) => ci !== colorIndex
                        ),
                    }
                    : row
            )
        );
    };

    // ---------------------------------------------------------
    // Form validation
    // Every failure shows a toast AND an inline message in the
    // footer, so the user always sees why Create Order did nothing.
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

        if (!formData.workOrderNo) {
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

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            if (!row.composition || !row.color) {
                return fail(
                    `Composition and Color are required for Composition ${i + 1}`
                );
            }

            if (orderType !== "yarnDyeingOrder") {
                if (!row.unitPrice) {
                    return fail(
                        `Price Per Kg is required for Composition ${i + 1}`
                    );
                }

                if (!row.workOrderQty) {
                    return fail(
                        `Work Order Qty is required for Composition ${i + 1}`
                    );
                }

                if (rules.yarnCount && !row.yarnCount) {
                    return fail(
                        `Yarn Count is required for Composition ${i + 1}`
                    );
                }

                if (rules.lotNo && !row.lotNo) {
                    return fail(
                        `Lot No is required for Composition ${i + 1}`
                    );
                }

                if (rules.machineDia && !row.machineDia) {
                    return fail(
                        `Machine Dia is required for Composition ${i + 1}`
                    );
                }

                if (rules.stichLength && !row.stichLength) {
                    return fail(
                        `Stich Length is required for Composition ${i + 1}`
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

                    if (!yarnColor.color) {
                        return fail(
                            `Yarn color is required for Composition ${i + 1}, Color ${j + 1}`
                        );
                    }

                    if (!yarnColor.qty) {
                        return fail(
                            `Qty is required for Composition ${i + 1}, Color ${j + 1}`
                        );
                    }

                    if (!yarnColor.price) {
                        return fail(
                            `Price is required for Composition ${i + 1}, Color ${j + 1}`
                        );
                    }
                }
            }
        }

        setFormError("");
        return true;
    };

    // ---------------------------------------------------------
    // Submit work order
    // ---------------------------------------------------------
    const handleSubmit = async () => {
        if (isSubmitting) return;
        if (!validateForm()) return;

        if (!styleData) {
            setFormError("Style data not loaded");
            showNotification("Style data not loaded", "error");
            return;
        }

        setIsSubmitting(true);

        try {
            const payload = {
                workOrderPlaceDate: formData.workOrderPlaceDate,
                workOrderNo: formData.workOrderNo,
                month: formData.month,
                jobNo: formData.jobNo,
                factoryName: formData.factoryName.trim(),
                orderType: formData.orderType,
                styleNo: styleData.styleNo,

                compositions: rows.map((row) => ({
                    composition: row.composition,
                    color: row.color,
                    orderQty: row.orderQty,
                    workOrderQty: row.workOrderQty,
                    unitPrice: row.unitPrice,
                    machineDia: row.machineDia,
                    yarnCount: row.yarnCount,
                    stichLength: row.stichLength,
                    lotNo: row.lotNo,

                    ...(orderType === "yarnDyeingOrder"
                        ? { yarnColors: row.yarnColors }
                        : {}),
                })),
            };

            const response = await axiosPrivate.post(
                "/api/create-job",
                payload
            );

            // Any 2xx response counts as success unless the backend
            // explicitly says otherwise through `type`.
            const responseType = response.data?.type;
            const isSuccess = responseType
                ? responseType === "success"
                : true;

            if (isSuccess) {
                showNotification(
                    response.data?.message || "Order created successfully",
                    "success"
                );

                if (autoRedirect) {
                    setTimeout(() => {
                        navigate("/dashboard/style-requirement");
                    }, 1500);
                } else {
                    setIsSubmitting(false);
                    // Reload the style so "Previous Work Order Qty"
                    // reflects the order that was just created.
                    setReloadKey((prev) => prev + 1);
                }
            } else {
                const message =
                    response.data?.message || "Failed to create order";

                setFormError(message);
                showNotification(message, "error");
                setIsSubmitting(false);
            }
        } catch (error) {
            console.error("Submit error:", error);

            const message =
                error?.response?.data?.message ||
                "Failed to create order. Please try again.";

            setFormError(message);
            showNotification(message, "error");

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

    const totalRequireQty = (
        Number(styleTotals.totalFinishRequiredQty) *
        (1 + Number(styleTotals.processLoss) / 100) +
        Number(styleTotals.totalAdditional)
    ).toFixed(2);

    const toNum = (value) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    };

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
                            title="Restore original compositions"
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                            <RefreshCw size={13} />
                            Refresh Items
                        </button>

                        <button
                            type="button"
                            onClick={() => setAutoRedirect((prev) => !prev)}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${autoRedirect
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
                    {/* Main Content */}
                    <div className="space-y-6">
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

                                    const requireQty = (
                                        toNum(styleRow.finishRequiredQty) *
                                        (1 + toNum(styleRow.processLoss) / 100) +
                                        toNum(styleRow.additional)
                                    ).toFixed(2);

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
                                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

                                                    {!isYarnDyeing && (
                                                        <>
                                                            <Input
                                                                label="Price Per Kg"
                                                                value={styleRow.unitPrice}
                                                                onChange={(e) =>
                                                                    handleRowChange(
                                                                        index,
                                                                        "unitPrice",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                required
                                                                isShowOutLabel
                                                                placeholder="Unit Price"
                                                            />

                                                            <Input
                                                                label="Work Order Qty"
                                                                value={styleRow.workOrderQty}
                                                                onChange={(e) =>
                                                                    handleRowChange(
                                                                        index,
                                                                        "workOrderQty",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                required
                                                                isShowOutLabel
                                                                placeholder="Work Order Qty"
                                                            />
                                                        </>
                                                    )}

                                                    {currentRules.stichLength && (
                                                        <Input
                                                            label="Stich Length"
                                                            value={styleRow.stichLength}
                                                            onChange={(e) =>
                                                                handleRowChange(
                                                                    index,
                                                                    "stichLength",
                                                                    e.target.value
                                                                )
                                                            }
                                                            required
                                                            isShowOutLabel
                                                            placeholder="Stich Length"
                                                        />
                                                    )}

                                                    {currentRules.machineDia && (
                                                        <Input
                                                            label="Machine Dia"
                                                            value={styleRow.machineDia}
                                                            onChange={(e) =>
                                                                handleRowChange(
                                                                    index,
                                                                    "machineDia",
                                                                    e.target.value
                                                                )
                                                            }
                                                            required
                                                            isShowOutLabel
                                                            placeholder="Machine Dia"
                                                        />
                                                    )}

                                                    {currentRules.lotNo && (
                                                        <Input
                                                            label="Lot No"
                                                            value={styleRow.lotNo}
                                                            onChange={(e) =>
                                                                handleRowChange(
                                                                    index,
                                                                    "lotNo",
                                                                    e.target.value
                                                                )
                                                            }
                                                            required
                                                            isShowOutLabel
                                                            placeholder="Lot No"
                                                        />
                                                    )}

                                                    {currentRules.yarnCount && (
                                                        <Input
                                                            label="Yarn Count"
                                                            value={styleRow.yarnCount}
                                                            onChange={(e) =>
                                                                handleRowChange(
                                                                    index,
                                                                    "yarnCount",
                                                                    e.target.value
                                                                )
                                                            }
                                                            required
                                                            isShowOutLabel
                                                            placeholder="Yarn Count"
                                                        />
                                                    )}
                                                </div>

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
                                                                        key={colorIndex}
                                                                        className="grid grid-cols-1 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                                                                    >
                                                                        <Input
                                                                            label={colorIndex === 0 ? "Booking Color" : ""}
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
                                                                            isShowOutLabel
                                                                        />

                                                                        <Input
                                                                            label={colorIndex === 0 ? "Qty (KG)" : ""}
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
                                                                            isShowOutLabel
                                                                        />

                                                                        <Input
                                                                            label={colorIndex === 0 ? "Price Per Kg" : ""}
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
                                                                            isShowOutLabel
                                                                            required
                                                                        />

                                                                        <div className="flex justify-end">
                                                                            {(styleRow.yarnColors ?? []).length > 1 && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        handleRemoveYarnColor(
                                                                                            index,
                                                                                            colorIndex
                                                                                        )
                                                                                    }
                                                                                    className="flex h-[42px] w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                                                >
                                                                                    <X size={14} />
                                                                                </button>
                                                                            )}
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
                        <div className="relative mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
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
                                            onClick={() => handleSelectFactory(factoryName)}
                                            title={`Use ${factoryName}`}
                                            className="flex w-full items-center gap-2 px-5 py-3 text-left hover:bg-slate-50"
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

            {/* Fixed Action Bar
                z-30 keeps it BELOW floating widgets (chat bubble), and pr-24
                leaves room on the right so nothing sits under the bubble. */}
            <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 pr-24 shadow-[0_-4px_12px_rgba(15,23,42,0.05)] backdrop-blur">
                <div className="flex items-center justify-between gap-4">
                    {/* Info / validation error */}
                    <div className="min-w-0 flex-1">
                        {formError ? (
                            <p
                                role="alert"
                                className="flex items-center gap-1.5 text-xs font-medium text-red-600"
                            >
                                <AlertCircle size={14} className="shrink-0" />
                                <span className="truncate">{formError}</span>
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
                            disabled={isSubmitting || isLoading}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isSubmitting ? (
                                <Loader2 size={15} className="animate-spin" />
                            ) : (
                                <Save size={15} />
                            )}

                            {isSubmitting ? "Saving..." : "Create Order"}
                        </button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default NewOrder;