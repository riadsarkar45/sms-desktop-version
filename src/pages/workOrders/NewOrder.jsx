import { useEffect, useState, useMemo, useCallback } from "react";
import { Loader2, Save, X, Plus, Package, FileText, ClipboardList, Factory, Layers, RefreshCw, ToggleLeft, ToggleRight, Building2, Building } from "lucide-react";
import DashboardLayout from "../../components/DashboardLayout";
import Input from "../../components/InputText/Input";
import Toast from "../../components/tost/Tost";
import { useNavigate, useParams } from "react-router-dom";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

const defaultYarnColor = () => ({ color: "", qty: "", price: "" });

const ORDER_TYPE_RULES = {
    knittingOrder: { lotNo: true, yarnCount: true, stichLength: true, machineDia: true },
    aopOrder: { lotNo: true, yarnCount: true, stichLength: false, machineDia: false },
    dyeingOrder: { lotNo: true, yarnCount: true, stichLength: true, machineDia: false },
    yarnDyeingOrder: { lotNo: false, yarnCount: false, stichLength: false, machineDia: false },
};

const getRules = (orderType) => ORDER_TYPE_RULES[orderType] || {};

const buildRowsFromStyle = (style) => {
    const initialRows = (style?.rows || []).map((row, index) => ({
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

    return initialRows.length > 0
        ? initialRows
        : [
            {
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
            },
        ];
};

const SectionCard = ({ icon: Icon, title, description, children, aside }) => (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <header className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600">
                    <Icon size={16} />
                </span>
                <div>
                    <h3 className="text-sm font-semibold text-slate-800 tracking-tight">{title}</h3>
                    {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
                </div>
            </div>
            {aside}
        </header>
        <div className="p-5 sm:p-6">{children}</div>
    </section>
);

const NewOrder = () => {
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [toastType, setToastType] = useState("success");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { jobNumber } = useParams();
    const navigate = useNavigate();

    const [styleData, setStyleData] = useState(null);
    const [rows, setRows] = useState([]);
    const [orderType, setOrderType] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [factoryData, setFactoryData] = useState([]);
    const [isFactoryDataLoading, setFactoryLoading] = useState(false);
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

    const axiosPrivate = useAxiosPrivate();

    const alreadyBookedTotal = useMemo(() => {
        if (!styleData?.compBreakdown || !orderType) return 0;
        return styleData.compBreakdown.reduce(
            (sum, b) => sum + (parseFloat(b[`${orderType}_workOrderQty`]) || 0),
            0
        );
    }, [styleData, orderType]);

    const styleTotals = useMemo(() => {
        const sourceRows = styleData?.rows || [];
        const sourceData = styleData || [];
        const processLoss = sourceData.processLoss;
        let totalOrderQty = 0;
        let totalFinishRequiredQty = 0;
        let totalAdditional = 0;
        let compositionId = 0;
        sourceRows.forEach((row) => {
            totalOrderQty += parseFloat(row.orderQty) || 0;
            totalFinishRequiredQty += parseFloat(row.finishRequiredQty) || 0;
            totalAdditional += row.additional;
            compositionId = row.id;
        });
        return { totalOrderQty, totalFinishRequiredQty, processLoss, totalAdditional, compositionId };
    }, [styleData]);

    const totals = useMemo(() => {
        let totalWorkOrderQty = 0;
        let totalAmount = 0;
        const totalRows = rows.length;
        let compositionsWithWorkOrder = 0;

        rows.forEach((row) => {
            if (orderType === "yarnDyeingOrder") {
                const hasEntry = (row.yarnColors || []).some(
                    (yc) => parseFloat(yc.qty) > 0
                );
                if (hasEntry) compositionsWithWorkOrder += 1;

                (row.yarnColors || []).forEach((yc) => {
                    const qty = parseFloat(yc.qty) || 0;
                    const price = parseFloat(yc.price) || 0;
                    totalWorkOrderQty += qty;
                    totalAmount += qty * price;
                });
            } else {
                const qty = parseFloat(row.workOrderQty) || 0;
                const price = parseFloat(row.unitPrice) || 0;
                if (qty > 0) compositionsWithWorkOrder += 1;
                totalWorkOrderQty += qty;
                totalAmount += qty * price;
            }
        });

        return { totalWorkOrderQty, totalAmount, totalRows, compositionsWithWorkOrder };
    }, [rows, orderType]);

    useEffect(() => {
        const fetchStyleData = async () => {
            if (!jobNumber) return;
            setIsLoading(true);
            const params = { reconciliation: false, styleRequirement: true };
            try {
                const req = await axiosPrivate.get(`/api/styles/${jobNumber}`, { params });
                const data = req.data.data;
                const style = Array.isArray(data) ? data[0] : data;

                if (!style) {
                    showNotification("Style not found", "error");
                    setIsLoading(false);
                    return;
                }

                setStyleData(style);
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
                    processLoss: style.processLoss || "",
                });

                setRows(buildRowsFromStyle(style));
            } catch (error) {
                console.error("Failed to fetch style data:", error);
                showNotification("Failed to load style data", "error");
            } finally {
                setIsLoading(false);
            }
        };

        fetchStyleData();
    }, [jobNumber, axiosPrivate]);

    const handleChange = (e) => {
        const { name, value } = e.target;

        if (name === "orderType") {
            setOrderType(value);
            if (value === "yarnDyeingOrder") {
                setRows((prev) =>
                    prev.map((row) => ({ ...row, yarnColors: row.yarnColors ?? [defaultYarnColor()] }))
                );
            }
        }

        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleRowChange = (index, field, value) => {
        setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    };

    const handleRemoveRow = (index) => {
        if (rows.length <= 1) {
            showNotification("At least one composition is required", "error");
            return;
        }
        setRows((prev) => prev.filter((_, i) => i !== index));
    };

    const handleRefreshRows = useCallback(() => {
        if (!styleData) return;
        setRows(buildRowsFromStyle(styleData));
        showNotification("Compositions restored", "success");
    }, [styleData]);

    const handleAddYarnColor = (rowIndex) => {
        setRows((prev) =>
            prev.map((row, i) =>
                i === rowIndex
                    ? { ...row, yarnColors: [...(row.yarnColors ?? [defaultYarnColor()]), defaultYarnColor()] }
                    : row
            )
        );
    };

    const handleYarnColorChange = (rowIndex, colorIndex, field, value) => {
        setRows((prev) =>
            prev.map((row, i) =>
                i === rowIndex
                    ? {
                        ...row,
                        yarnColors: (row.yarnColors ?? [defaultYarnColor()]).map((c, ci) =>
                            ci === colorIndex ? { ...c, [field]: value } : c
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
                        yarnColors: (row.yarnColors ?? [defaultYarnColor()]).filter((_, ci) => ci !== colorIndex),
                    }
                    : row
            )
        );
    };

    const showNotification = (message, type = "success") => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
    };

    const validateForm = () => {
        if (!formData.workOrderPlaceDate) {
            showNotification("Work Order Place Date is required", "error");
            return false;
        }
        if (!formData.workOrderNo) {
            showNotification("Work Order No is required", "error");
            return false;
        }
        if (!formData.orderType) {
            showNotification("Order Type is required", "error");
            return false;
        }
        if (!formData.factoryName) {
            showNotification("Factory Name is required", "error");
            return false;
        }

        const rules = getRules(orderType);

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            if (!row.composition || !row.color) {
                showNotification(`Composition and Color are required for Composition ${i + 1}`, "error");
                return false;
            }

            if (orderType !== "yarnDyeingOrder") {
                if (!row.unitPrice) {
                    showNotification(`Price Per Kg is required for Composition ${i + 1}`, "error");
                    return false;
                }
                if (!row.workOrderQty) {
                    showNotification(`Work Order Qty is required for Composition ${i + 1}`, "error");
                    return false;
                }
                if (rules.yarnCount && !row.yarnCount) {
                    showNotification(`Yarn Count is required for Composition ${i + 1}`, "error");
                    return false;
                }
                if (rules.lotNo && !row.lotNo) {
                    showNotification(`Lot No is required for Composition ${i + 1}`, "error");
                    return false;
                }
                if (rules.machineDia && !row.machineDia) {
                    showNotification(`Machine Dia is required for Composition ${i + 1}`, "error");
                    return false;
                }
                if (rules.stichLength && !row.stichLength) {
                    showNotification(`Stich Length is required for Composition ${i + 1}`, "error");
                    return false;
                }
            } else {
                if (!row.yarnColors || row.yarnColors.length === 0) {
                    showNotification(`At least one yarn color is required for Composition ${i + 1}`, "error");
                    return false;
                }
                for (let j = 0; j < row.yarnColors.length; j++) {
                    const yc = row.yarnColors[j];
                    if (!yc.color) {
                        showNotification(`Yarn color is required for Composition ${i + 1}, Color ${j + 1}`, "error");
                        return false;
                    }
                    if (!yc.qty) {
                        showNotification(`Qty is required for Composition ${i + 1}, Color ${j + 1}`, "error");
                        return false;
                    }
                    if (!yc.price) {
                        showNotification(`Price is required for Composition ${i + 1}, Color ${j + 1}`, "error");
                        return false;
                    }
                }
            }
        }

        return true;
    };

    // FIXED: Improved submit handler with better error handling
    const handleSubmit = async () => {
        // Prevent double submission
        if (isSubmitting) {
            return;
        }

        if (!validateForm()) {
            return;
        }

        if (!styleData) {
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
                factoryName: formData.factoryName,
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
                    ...(orderType === "yarnDyeingOrder" ? { yarnColors: row.yarnColors } : {}),
                })),
            };

            const res = await axiosPrivate.post("/api/create-job", payload);
            
            if (res.data.type === "success") {
                showNotification("Order created successfully", "success");
                if (autoRedirect) {
                    setTimeout(() => navigate("/dashboard/style-requirement"), 1500);
                } else {
                    // Reset form if not redirecting
                    setIsSubmitting(false);
                }
            } else {
                showNotification(res.data.message || "Failed to create order", "error");
                setIsSubmitting(false);
            }
        } catch (error) {
            console.error("Submit error:", error);
            showNotification(
                error?.response?.data?.message || "Failed to create order. Please try again.",
                "error"
            );
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => navigate(-1);

    const dyeingOrderType = ["knittingOrder", "aopOrder", "dyeingOrder", "yarnDyeingOrder"];
    const totalRequireQty = (Number(styleTotals.totalFinishRequiredQty) * (1 + Number(styleTotals.processLoss) / 100) + Number(styleTotals.totalAdditional)).toFixed(2);

    useEffect(() => {
        if (!orderType || !jobNumber) return;

        const fetchFactoryWiseWorkOrderTotal = async () => {
            setFactoryLoading(true);
            try {
                const response = await axiosPrivate.get(
                    `/api/factories/workOrder/totals/${jobNumber}/${orderType}`
                );
                setFactoryData(response.data);
            } catch (error) {
                console.error("Failed to fetch factory totals:", error);
            } finally {
                setFactoryLoading(false);
            }
        };

        fetchFactoryWiseWorkOrderTotal();
    }, [axiosPrivate, jobNumber, orderType]);

    const toNum = (v) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    const compBreakdownObj = useMemo(
        () =>
            Object.fromEntries(
                (styleData?.compBreakdown ?? []).map((item) => [item.styleRequirementRowId, item])
            ),
        [styleData?.compBreakdown]
    );

    if (isLoading) {
        return (
            <DashboardLayout title="Add New Order">
                <div className="flex items-center justify-center min-h-[400px]">
                    <Loader2 size={32} className="animate-spin text-primary-500" />
                    <span className="ml-3 text-slate-600">Loading style data...</span>
                </div>
            </DashboardLayout>
        );
    }

    if (!styleData) {
        return (
            <DashboardLayout title="Add New Order">
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <p className="text-slate-600 mb-4">No style data found</p>
                    <button
                        onClick={() => navigate(-1)}
                        className="px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600"
                    >
                        Go Back
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    const currentRules = getRules(orderType);
    const isYarnDyeing = orderType === "yarnDyeingOrder";

    return (
        <DashboardLayout title="Add New Order">
            {showToast && (
                <Toast
                    message={toastMessage}
                    type={toastType}
                    onClose={() => setShowToast(false)}
                    duration={3000}
                />
            )}

            <div className="pb-32">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="text-sm text-slate-500 mt-1">
                            Job <span className="font-medium text-slate-700">{formData.jobNo || "—"}</span>
                            <span className="mx-2 text-slate-300">/</span>
                            Style <span className="font-medium text-slate-700">{formData.style || "—"}</span>
                            <span className="mx-2 text-slate-300">/</span>
                            Buyer <span className="font-medium text-slate-700">{formData.buyer || "—"}</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        {orderType && (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                                {orderType.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                            </span>
                        )}

                        <button
                            type="button"
                            onClick={handleRefreshRows}
                            title="Restore any removed compositions back to the original list"
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                            <RefreshCw size={13} />
                            Refresh Items
                        </button>

                        <button
                            type="button"
                            onClick={() => setAutoRedirect((prev) => !prev)}
                            title={
                                autoRedirect
                                    ? "On: you'll be redirected to Style Requirement after a successful save"
                                    : "Off: you'll stay on this page after a successful save"
                            }
                            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${autoRedirect
                                ? "border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                }`}
                        >
                            {autoRedirect ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                            Redirect after save: {autoRedirect ? "On" : "Off"}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px] gap-6 items-start">
                    <div className="space-y-6">
                        <SectionCard
                            icon={ClipboardList}
                            title="Work Order Details"
                            description="Basic identification for this work order"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                <Input
                                    label="Work Order Place Date"
                                    name="workOrderPlaceDate"
                                    type="date"
                                    value={formData.workOrderPlaceDate}
                                    onChange={handleChange}
                                    required
                                    isShowOutLabel={true}
                                />
                                <Input
                                    label="Work Order No"
                                    name="workOrderNo"
                                    type="text"
                                    value={formData.workOrderNo}
                                    onChange={handleChange}
                                    placeholder="Enter work order number"
                                    isShowOutLabel={true}
                                    required
                                />
                                <Input
                                    label="Month"
                                    name="month"
                                    type="text"
                                    value={formData.month}
                                    onChange={handleChange}
                                    placeholder="Select Month"
                                    isShowOutLabel={true}
                                    required
                                />
                                <Input label="Job No" isShowOutLabel={true} name="jobNo" readOnly value={formData.jobNo} placeholder="e.g., SM26-3429/JAN" />
                                <Input
                                    label="Process Loss (%)"
                                    name="processLoss"
                                    value={formData.processLoss}
                                    readOnly
                                    placeholder="Wastage %"
                                    isShowOutLabel={true}
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
                                    isShowOutLabel={true}
                                />
                            </div>
                        </SectionCard>

                        <SectionCard
                            icon={Layers}
                            title="Compositions"
                            description="Quantities and process parameters per composition"
                            aside={
                                <span className="shrink-0 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500 tracking-wide">
                                    {totals.totalRows} {totals.totalRows === 1 ? "ITEM" : "ITEMS"}
                                </span>
                            }
                        >
                            <div className="space-y-4">
                                {rows.map((styleRow, index) => {
                                    const comp = compBreakdownObj[styleRow.styleRequirementRowId ?? styleRow.id];
                                    const dyeingQty = comp?.dyeingOrder_workOrderQty ?? 0;
                                    const knittingQty = comp?.knittingOrder_workOrderQty ?? 0;
                                    const aopQty = comp?.aopOrder_workOrderQty ?? 0;
                                    const requireQty = (toNum(styleRow.finishRequiredQty) * (1 + toNum(styleRow.processLoss) / 100) + toNum(styleRow.additional)).toFixed(2);
                                    return (
                                        <div
                                            key={styleRow.id || index}
                                            className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden transition-colors hover:border-slate-300"
                                        >
                                            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-slate-50/70 border-b border-slate-100">
                                                <div className="flex items-start gap-3 min-w-0">
                                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white shadow-sm">
                                                        {index + 1}
                                                    </span>

                                                    <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <h3 className="truncate text-sm font-semibold text-slate-800">
                                                                {styleRow.composition || "Composition"}
                                                            </h3>
                                                            {styleRow.color && (
                                                                <span className="shrink-0 text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                                    {styleRow.color}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            {toNum(styleRow.finishRequiredQty) > 0 && (
                                                                <span className="inline-flex items-center text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md border border-blue-200">
                                                                    Yarn Req: {requireQty}
                                                                </span>
                                                            )}

                                                            {styleRow.finishDia ? (
                                                                <span className="inline-flex items-center text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md border border-indigo-200">
                                                                    Dia: {styleRow.finishDia}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[11px] text-slate-400 italic">No finish dia</span>
                                                            )}

                                                            {styleRow.additional && (
                                                                <span className="inline-flex items-center text-[11px] font-semibold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">
                                                                    + {styleRow.additional}
                                                                </span>
                                                            )}

                                                            {
                                                                orderType === "aopOrder" && aopQty > 0 && (
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="inline-flex items-center text-[11px] font-semibold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">
                                                                            AOP Work Order: {aopQty}
                                                                        </span>
                                                                        <span className={`inline-flex items-center text-[11px] font-semibold ${Number(aopQty) - Number(requireQty) < 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-rose-50 text-rose-700 border-rose-200"} px-2 py-0.5 rounded-md border`}>
                                                                            Remaining Work Order: {(Number(aopQty) - Number(requireQty)).toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            }
                                                            {
                                                                orderType === "dyeingOrder" && dyeingQty > 0 && (
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="inline-flex items-center text-[11px] font-semibold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">
                                                                            Dyeing Work Order: {dyeingQty}
                                                                        </span>
                                                                        <span className={`inline-flex items-center text-[11px] font-semibold ${Number(dyeingQty) - Number(requireQty) < 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-rose-50 text-rose-700 border-rose-200"} px-2 py-0.5 rounded-md border`}>
                                                                            Remaining Work Order: {(Number(dyeingQty).toFixed(2) - Number(requireQty)).toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            }
                                                            {
                                                                orderType === "knittingOrder" && knittingQty > 0 && (
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="inline-flex items-center text-[11px] font-semibold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-md border border-rose-200">
                                                                            Knitting Work Order: {knittingQty}
                                                                        </span>
                                                                        <span className={`inline-flex items-center text-[11px] font-semibold ${Number(knittingQty) - Number(requireQty) < 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-rose-50 text-rose-700 border-rose-200"} px-2 py-0.5 rounded-md border`}>
                                                                            Remaining Work Order: {(Number(knittingQty).toFixed(2) - Number(requireQty)).toFixed(2)}
                                                                        </span>
                                                                    </div>
                                                                )
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveRow(index)}
                                                    title="Remove composition"
                                                    className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>

                                            <div className="p-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                                    <Input isShowOutLabel={true} label="Composition" readOnly value={styleRow.composition} />
                                                    <Input isShowOutLabel={true} label="Color" readOnly value={styleRow.color} />
                                                    <Input isShowOutLabel={true} label="Order Qty (KG)" readOnly value={styleRow.orderQty} />

                                                    {!isYarnDyeing && (
                                                        <Input
                                                            label="Price Per Kg"
                                                            value={styleRow.unitPrice}
                                                            onChange={(e) => handleRowChange(index, "unitPrice", e.target.value)}
                                                            required
                                                            isShowOutLabel={true}
                                                            placeholder="Unit Price"
                                                        />
                                                    )}
                                                    {!isYarnDyeing && (
                                                        <Input
                                                            label="Work Order Qty"
                                                            value={styleRow.workOrderQty}
                                                            onChange={(e) => handleRowChange(index, "workOrderQty", e.target.value)}
                                                            required
                                                            isShowOutLabel={true}
                                                            placeholder="Work Order Qty"
                                                        />
                                                    )}
                                                    {currentRules.stichLength && (
                                                        <Input
                                                            label="Stich Length"
                                                            value={styleRow.stichLength}
                                                            onChange={(e) => handleRowChange(index, "stichLength", e.target.value)}
                                                            required
                                                            isShowOutLabel={true}
                                                            placeholder="Stich Length"
                                                        />
                                                    )}
                                                    {currentRules.machineDia && (
                                                        <Input
                                                            label="Machine Dia"
                                                            value={styleRow.machineDia}
                                                            onChange={(e) => handleRowChange(index, "machineDia", e.target.value)}
                                                            required
                                                            isShowOutLabel={true}
                                                            placeholder="Machine Dia"
                                                        />
                                                    )}
                                                    {currentRules.lotNo && (
                                                        <Input
                                                            label="Lot No"
                                                            value={styleRow.lotNo}
                                                            onChange={(e) => handleRowChange(index, "lotNo", e.target.value)}
                                                            required
                                                            isShowOutLabel={true}
                                                            placeholder="Lot No"
                                                        />
                                                    )}
                                                    {currentRules.yarnCount && (
                                                        <Input
                                                            label="Yarn Count"
                                                            value={styleRow.yarnCount}
                                                            onChange={(e) => handleRowChange(index, "yarnCount", e.target.value)}
                                                            required
                                                            isShowOutLabel={true}
                                                            placeholder="Yarn Count"
                                                        />
                                                    )}
                                                </div>

                                                {isYarnDyeing && (
                                                    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                                                        <div className="mb-3 flex items-center justify-between">
                                                            <h5 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                                                Yarn Booking Colors
                                                            </h5>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAddYarnColor(index)}
                                                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
                                                            >
                                                                <Plus size={13} />
                                                                Add Color
                                                            </button>
                                                        </div>

                                                        <div className="space-y-3">
                                                            {(styleRow.yarnColors ?? [defaultYarnColor()]).map((yarnItem, ci) => (
                                                                <div
                                                                    key={ci}
                                                                    className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end rounded-lg border border-slate-200 bg-white p-3"
                                                                >
                                                                    <Input
                                                                        isShowOutLabel={true}
                                                                        label={ci === 0 ? "Booking Color" : ""}
                                                                        placeholder="Yarn booking color"
                                                                        value={yarnItem.color}
                                                                        onChange={(e) => handleYarnColorChange(index, ci, "color", e.target.value)}
                                                                    />
                                                                    <Input
                                                                        label={ci === 0 ? "Qty (KG)" : ""}
                                                                        isShowOutLabel={true}
                                                                        placeholder="Qty"
                                                                        value={yarnItem.qty}
                                                                        onChange={(e) => handleYarnColorChange(index, ci, "qty", e.target.value)}
                                                                    />
                                                                    <Input
                                                                        label={ci === 0 ? "Price Per Kg" : ""}
                                                                        value={yarnItem.price}
                                                                        onChange={(e) => handleYarnColorChange(index, ci, "price", e.target.value)}
                                                                        isShowOutLabel={true}
                                                                        required
                                                                        placeholder="Unit Price"
                                                                    />
                                                                    <div className="flex justify-end">
                                                                        {(styleRow.yarnColors ?? []).length > 1 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRemoveYarnColor(index, ci)}
                                                                                className="flex h-[42px] w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                                                            >
                                                                                <X size={14} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </SectionCard>

                        <SectionCard icon={Factory} title="Factory" description="Where this work order will be produced">
                            <div className="max-w-md">
                                <Input
                                    label="Factory Name"
                                    name="factoryName"
                                    value={formData.factoryName}
                                    onChange={handleChange}
                                    placeholder="Factory Name"
                                    required
                                />
                            </div>
                        </SectionCard>
                    </div>

                    <aside className="xl:sticky xl:top-6">
                        <div className="rounded-xl border mb-8 border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                                <FileText size={15} className="text-slate-500" />
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                    Order Summary
                                </h4>
                            </div>

                            <div className="px-5 py-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" /> Total Order Qty
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                                        {styleTotals.totalOrderQty.toLocaleString()}
                                        <span className="ml-1 text-xs text-slate-400">PCS</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" /> Finish Required Qty
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                                        {totalRequireQty}
                                        <span className="ml-1 text-xs text-slate-400">KG</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" /> Previous Work Order Qty
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                                        {alreadyBookedTotal.toLocaleString()}
                                        <span className="ml-1 text-xs text-slate-400">KG</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-sm text-slate-600">
                                        <Package size={14} className="text-slate-400" /> New Work Order Qty
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 tabular-nums">
                                        {totals.totalWorkOrderQty.toLocaleString()}
                                        <span className="ml-1 text-xs text-slate-400">KG</span>
                                    </span>
                                </div>

                                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                    <span className="text-xs text-slate-500">
                                        Work Short & Excess
                                    </span>
                                    <span
                                        className={`text-xs font-semibold tabular-nums ${(
                                            (alreadyBookedTotal ?? 0) -
                                            (totalRequireQty ?? 0) +
                                            (totals.totalWorkOrderQty ?? 0)
                                        ) < 0
                                            ? "text-green-600"
                                            : "text-red-600"
                                            }`}
                                    >
                                        {Math.abs(
                                            (alreadyBookedTotal ?? 0) -
                                            (totalRequireQty ?? 0) +
                                            (totals.totalWorkOrderQty ?? 0)
                                        ).toFixed(2)}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                    <span className="text-xs text-slate-500">
                                        Work Orders Created
                                    </span>
                                    <span className="text-xs font-semibold text-slate-700 tabular-nums">
                                        {totals.compositionsWithWorkOrder} / {totals.totalRows} compositions
                                    </span>
                                </div>
                            </div>

                            <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                                    Estimated Total
                                </p>
                                <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                                    {totals.totalAmount.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                    <span className="ml-1.5 text-xs font-medium text-slate-400">BDT</span>
                                </p>
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                                <Building2 size={15} className="text-slate-500" />
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                    Factory wise total work order qty
                                </h4>
                            </div>

                            {isFactoryDataLoading ? (
                                <div className="px-5 py-4 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="flex items-center justify-between animate-pulse">
                                            <div className="flex items-center gap-2">
                                                <div className="h-3.5 w-3.5 rounded bg-slate-200" />
                                                <div
                                                    className="h-3.5 rounded bg-slate-200"
                                                    style={{ width: 90 + (i % 3) * 20 }}
                                                />
                                            </div>
                                            <div className="h-3.5 w-16 rounded bg-slate-200" />
                                        </div>
                                    ))}
                                </div>
                            ) : factoryData?.length ? (
                                factoryData.map((fact) => (
                                    <div key={fact.factoryName} className="px-5 py-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="flex items-center gap-2 text-sm text-slate-600">
                                                <Building size={14} className="text-slate-400" /> {fact.factoryName}
                                            </span>
                                            <span className="text-sm font-medium text-slate-900 tabular-nums">
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
                    </aside>
                </div>
            </div>

            {/* Fixed action bar */}
            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/90 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/70 lg:left-64">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between max-w-[1400px] mx-auto">
                    <p className="text-xs text-slate-500">
                        {totals.totalRows} composition{totals.totalRows === 1 ? "" : "s"} · review before submitting
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <X size={16} />
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900/50 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {isSubmitting ? "Saving..." : "Create Order"}
                        </button>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
};

export default NewOrder;