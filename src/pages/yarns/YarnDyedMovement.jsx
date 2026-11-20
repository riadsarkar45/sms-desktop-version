
import React, {
    useState,
    useMemo,
    useEffect,
    useCallback,
    useRef,
} from "react";
import {
    Search,
    RefreshCw,
    Filter,
    X,
    Loader2,
    Package,
    Truck,
    RotateCcw,
    CheckCircle2,
    Download,
} from "lucide-react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

const API_URL = "/api/challan-movement/yarnDyeingOrder";

const DELIVERY_TYPES = [
    "Yarn Delivery For Yarn Dye",
    "Yarn Return From Yarn Dye",
    "Yarn Received From Yarn Dye",
    "Finish Received",
    "Finish Return",
];

const formatNumber = (value) => {
    const number = Number(value);

    return Number.isFinite(number)
        ? number.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          })
        : "0.00";
};

const formatDate = (value) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const getMonthKey = (value) => {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
    )}`;
};

const safeString = (value) => {
    if (value === null || value === undefined) return "";
    return String(value);
};

const getStatusClass = (status) => {
    const normalized = safeString(status).toLowerCase();

    if (["completed", "received"].includes(normalized)) {
        return "bg-green-100 text-green-700";
    }

    if (["intransit", "in transit"].includes(normalized)) {
        return "bg-blue-100 text-blue-700";
    }

    if (normalized === "pending") {
        return "bg-amber-100 text-amber-700";
    }

    if (["cancelled", "rejected"].includes(normalized)) {
        return "bg-red-100 text-red-700";
    }

    return "bg-gray-100 text-gray-700";
};

/**
 * One table row per delivery.
 *
 * Booking-level fields:
 * piId, yarnColors, yarnCount, lotNo, workOrderQty,
 * unitePrice, workOrder.
 *
 * Delivery-level fields:
 * deliveryDate, challanNo, deliveryType, deliveryQty,
 * fromFactory, toFactory, deliveryStatus.
 */
const mapApiData = (apiData) => {
    if (!Array.isArray(apiData)) return [];

    return apiData.flatMap((booking) => {
        const deliveries = Array.isArray(booking.deliveries)
            ? booking.deliveries
            : [];

        const yarnColors = Array.isArray(booking.yarnColors)
            ? booking.yarnColors
                  .map((item) => item?.color)
                  .filter(Boolean)
            : [];

        const uniqueYarnColors = [...new Set(yarnColors)];

        const yarnColorLabel = uniqueYarnColors.length
            ? uniqueYarnColors.join(", ")
            : "-";

        return deliveries.map((delivery) => ({
            id: delivery.id,
            rowKey: `${booking.id}-${delivery.id}`,

            // Booking information
            bookingId: booking.id,
            piId: booking.piId ?? "",
            yarnColors: yarnColorLabel,
            yarnCount: booking.yarnCount ?? "",
            lotNo: booking.lotNo ?? "",
            workOrderQty: Number(booking.workOrderQty) || 0,
            unitePrice: Number(booking.unitePrice) || 0,

            // Work order information
            jobNumber: booking.workOrder?.jobNo ?? "",
            factoryName: booking.workOrder?.factoryName ?? "",

            // Delivery information
            date: delivery.deliveryDate ?? null,
            challanNo: delivery.challanNo ?? "",
            deliveryType: delivery.deliveryType ?? "",
            deliveryQty: Number(delivery.deliveryQty) || 0,

            fromFactory: delivery.fromFactory ?? "",
            toFactory: delivery.toFactory ?? "",

            deliveryStatus: delivery.deliveryStatus ?? "",
        }));
    });
};

const YarnDyedMovement = () => {
    const axiosPrivate = useAxiosPrivate();

    const loadingRef = useRef(false);
    const cursorRef = useRef(null);
    const hasMoreRef = useRef(false);

    const [rows, setRows] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState("");

    // Filters
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedMonth, setSelectedMonth] = useState("all");
    const [selectedDeliveryType, setSelectedDeliveryType] =
        useState("all");
    const [selectedStatus, setSelectedStatus] = useState("all");

    const [columnFilters, setColumnFilters] = useState({
        piId: "",
        yarnColors: "",
        jobNumber: "",
        factoryName: "",
        challanNo: "",
        yarnCount: "",
        lotNo: "",
        fromFactory: "",
        toFactory: "",
    });

    const [showFilters, setShowFilters] = useState(false);

    // Fetch cursor-paginated data
    const fetchMovements = useCallback(
        async (cursor = null, initial = false) => {
            if (loadingRef.current) return;

            loadingRef.current = true;

            if (initial) {
                setIsLoading(true);
                setError("");
            } else {
                setIsLoadingMore(true);
            }

            try {
                const config = cursor
                    ? {
                          params: {
                              cursor,
                          },
                      }
                    : {};

                const response = await axiosPrivate.get(API_URL, config);
                const result = response?.data ?? {};

                const newRows = mapApiData(result.data);

                setRows((previousRows) => {
                    if (initial) return newRows;

                    const existingIds = new Set(
                        previousRows.map((row) => row.rowKey)
                    );

                    return [
                        ...previousRows,
                        ...newRows.filter(
                            (row) => !existingIds.has(row.rowKey)
                        ),
                    ];
                });

                const newCursor = result.nextCursor ?? null;
                const moreAvailable = Boolean(result.hasMore);

                cursorRef.current = newCursor;
                hasMoreRef.current = moreAvailable;

                setHasMore(moreAvailable);
            } catch (err) {
                console.error("Yarn dyeing movement error:", err);

                setError(
                    err?.response?.data?.msg ||
                        err?.message ||
                        "Failed to load movement records."
                );
            } finally {
                loadingRef.current = false;
                setIsLoading(false);
                setIsLoadingMore(false);
            }
        },
        [axiosPrivate]
    );

    useEffect(() => {
        fetchMovements(null, true);
    }, [fetchMovements]);

    const loadMore = useCallback(() => {
        if (
            loadingRef.current ||
            !hasMoreRef.current ||
            cursorRef.current === null ||
            cursorRef.current === undefined
        ) {
            return;
        }

        fetchMovements(cursorRef.current, false);
    }, [fetchMovements]);

    const handleScroll = (event) => {
        const element = event.currentTarget;

        const distanceFromBottom =
            element.scrollHeight -
            element.scrollTop -
            element.clientHeight;

        if (distanceFromBottom < 180) {
            loadMore();
        }
    };

    const handleRefresh = () => {
        cursorRef.current = null;
        hasMoreRef.current = false;

        setRows([]);
        setHasMore(false);

        fetchMovements(null, true);
    };

    const monthOptions = useMemo(() => {
        return [
            ...new Set(
                rows
                    .map((row) => getMonthKey(row.date))
                    .filter(Boolean)
            ),
        ].sort((a, b) => b.localeCompare(a));
    }, [rows]);

    const columnUniqueValues = useMemo(() => {
        const fields = Object.keys(columnFilters);
        const result = {};

        fields.forEach((field) => {
            result[field] = [
                ...new Set(
                    rows
                        .map((row) => safeString(row[field]))
                        .filter(Boolean)
                ),
            ].sort((a, b) => a.localeCompare(b));
        });

        return result;
    }, [rows, columnFilters]);

    const filteredRows = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();

        return rows.filter((row) => {
            const searchableFields = [
                row.piId,
                row.yarnColors,
                row.jobNumber,
                row.factoryName,
                row.challanNo,
                row.yarnCount,
                row.lotNo,
                row.deliveryType,
                row.fromFactory,
                row.toFactory,
                row.deliveryStatus,
            ];

            const matchesSearch =
                !search ||
                searchableFields.some((value) =>
                    safeString(value).toLowerCase().includes(search)
                );

            const matchesMonth =
                selectedMonth === "all" ||
                getMonthKey(row.date) === selectedMonth;

            const matchesType =
                selectedDeliveryType === "all" ||
                row.deliveryType === selectedDeliveryType;

            const matchesStatus =
                selectedStatus === "all" ||
                row.deliveryStatus === selectedStatus;

            const matchesColumns = Object.entries(columnFilters).every(
                ([field, value]) =>
                    !value || safeString(row[field]) === value
            );

            return (
                matchesSearch &&
                matchesMonth &&
                matchesType &&
                matchesStatus &&
                matchesColumns
            );
        });
    }, [
        rows,
        searchTerm,
        selectedMonth,
        selectedDeliveryType,
        selectedStatus,
        columnFilters,
    ]);

    const totals = useMemo(() => {
        const result = {
            yarnDelivery: 0,
            yarnReturn: 0,
            yarnReceived: 0,
            finishReceived: 0,
            finishReturn: 0,
        };

        filteredRows.forEach((row) => {
            const qty = Number(row.deliveryQty) || 0;

            switch (row.deliveryType) {
                case DELIVERY_TYPES[0]:
                    result.yarnDelivery += qty;
                    break;
                case DELIVERY_TYPES[1]:
                    result.yarnReturn += qty;
                    break;
                case DELIVERY_TYPES[2]:
                    result.yarnReceived += qty;
                    break;
                case DELIVERY_TYPES[3]:
                    result.finishReceived += qty;
                    break;
                case DELIVERY_TYPES[4]:
                    result.finishReturn += qty;
                    break;
                default:
                    break;
            }
        });

        return result;
    }, [filteredRows]);

    const clearFilters = () => {
        setSearchTerm("");
        setSelectedMonth("all");
        setSelectedDeliveryType("all");
        setSelectedStatus("all");

        setColumnFilters({
            piId: "",
            yarnColors: "",
            jobNumber: "",
            factoryName: "",
            challanNo: "",
            yarnCount: "",
            lotNo: "",
            fromFactory: "",
            toFactory: "",
        });
    };

    const updateColumnFilter = (field, value) => {
        setColumnFilters((previous) => ({
            ...previous,
            [field]: value,
        }));
    };

    const exportToCSV = () => {
        const headers = [
            "Date",
            "PI ID",
            "Challan No",
            "Job Number",
            "Factory",
            "Yarn Color",
            "Yarn Count",
            "Lot No",
            "Work Order Qty",
            "Delivery Type",
            "Delivery Qty",
            "From Factory",
            "To Factory",
            "Delivery Status",
        ];

        const csvRows = filteredRows.map((row) => [
            formatDate(row.date),
            row.piId,
            row.challanNo,
            row.jobNumber,
            row.factoryName,
            row.yarnColors,
            row.yarnCount,
            row.lotNo,
            row.workOrderQty,
            row.deliveryType,
            row.deliveryQty,
            row.fromFactory,
            row.toFactory,
            row.deliveryStatus,
        ]);

        const escapeCSV = (value) =>
            `"${safeString(value).replace(/"/g, '""')}"`;

        const csvContent = [
            headers.map(escapeCSV).join(","),
            ...csvRows.map((row) => row.map(escapeCSV).join(",")),
        ].join("\n");

        const blob = new Blob(["\uFEFF" + csvContent], {
            type: "text/csv;charset=utf-8;",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "yarn-dyed-movement.csv";
        link.click();

        URL.revokeObjectURL(url);
    };

    const summaryCards = [
        {
            label: "Yarn Delivered",
            value: totals.yarnDelivery,
            icon: Truck,
            color: "blue",
        },
        {
            label: "Yarn Returned",
            value: totals.yarnReturn,
            icon: RotateCcw,
            color: "orange",
        },
        {
            label: "Grey Yarn Received",
            value: totals.yarnReceived,
            icon: Package,
            color: "purple",
        },
        {
            label: "Finish Received",
            value: totals.finishReceived,
            icon: CheckCircle2,
            color: "green",
        },
        {
            label: "Finish Returned",
            value: totals.finishReturn,
            icon: RotateCcw,
            color: "rose",
        },
    ];

    const colorClasses = {
        blue: "bg-blue-50 text-blue-600",
        orange: "bg-orange-50 text-orange-600",
        purple: "bg-purple-50 text-purple-600",
        green: "bg-green-50 text-green-600",
        rose: "bg-rose-50 text-rose-600",
    };

    const filterFields = [
        ["piId", "PI ID"],
        ["yarnColors", "Yarn Color"],
        ["jobNumber", "Job Number"],
        ["factoryName", "Factory"],
        ["challanNo", "Challan No"],
        ["yarnCount", "Yarn Count"],
        ["lotNo", "Lot No"],
        ["fromFactory", "From Factory"],
        ["toFactory", "To Factory"],
    ];

    return (
        <div className="w-full space-y-5 p-3 md:p-5">
            {/* Header */}
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                    <h1 className="text-xl font-bold text-slate-800">
                        Yarn Dyed Movement
                    </h1>

                    <p className="mt-1 text-sm text-slate-500">
                        Yarn delivery, return and receiving movement report
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={exportToCSV}
                        disabled={!filteredRows.length}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        <Download size={16} />
                        Export CSV
                    </button>

                    <button
                        onClick={handleRefresh}
                        disabled={isLoading || isLoadingMore}
                        className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                        <RefreshCw
                            size={16}
                            className={isLoading ? "animate-spin" : ""}
                        />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {summaryCards.map((card) => {
                    const Icon = card.icon;

                    return (
                        <div
                            key={card.label}
                            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-medium text-slate-500">
                                        {card.label}
                                    </p>

                                    <p className="mt-2 text-xl font-bold text-slate-800">
                                        {formatNumber(card.value)}
                                    </p>
                                </div>

                                <div
                                    className={`rounded-lg p-3 ${colorClasses[card.color]}`}
                                >
                                    <Icon size={20} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Search and filters */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="relative flex-1">
                        <Search
                            size={18}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />

                        <input
                            value={searchTerm}
                            onChange={(event) =>
                                setSearchTerm(event.target.value)
                            }
                            placeholder="Search PI, yarn color, job, challan, factory..."
                            className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                    </div>

                    <select
                        value={selectedMonth}
                        onChange={(event) =>
                            setSelectedMonth(event.target.value)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                        <option value="all">All Months</option>

                        {monthOptions.map((month) => (
                            <option key={month} value={month}>
                                {new Date(
                                    Number(month.slice(0, 4)),
                                    Number(month.slice(5, 7)) - 1
                                ).toLocaleDateString("en-US", {
                                    month: "long",
                                    year: "numeric",
                                })}
                            </option>
                        ))}
                    </select>

                    <select
                        value={selectedDeliveryType}
                        onChange={(event) =>
                            setSelectedDeliveryType(event.target.value)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                        <option value="all">All Delivery Types</option>

                        {DELIVERY_TYPES.map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </select>

                    <select
                        value={selectedStatus}
                        onChange={(event) =>
                            setSelectedStatus(event.target.value)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    >
                        <option value="all">All Statuses</option>

                        {[
                            ...new Set(
                                rows
                                    .map((row) => row.deliveryStatus)
                                    .filter(Boolean)
                            ),
                        ].map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>

                    <button
                        onClick={() => setShowFilters((previous) => !previous)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                    >
                        <Filter size={16} />
                        Column Filters
                    </button>

                    <button
                        onClick={clearFilters}
                        className="flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-100"
                    >
                        <X size={16} />
                        Clear
                    </button>
                </div>

                {showFilters && (
                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {filterFields.map(([field, label]) => (
                            <div key={field}>
                                <label className="mb-1 block text-xs font-medium text-slate-500">
                                    {label}
                                </label>

                                <select
                                    value={columnFilters[field]}
                                    onChange={(event) =>
                                        updateColumnFilter(
                                            field,
                                            event.target.value
                                        )
                                    }
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                                >
                                    <option value="">All</option>

                                    {(columnUniqueValues[field] || []).map(
                                        (value) => (
                                            <option key={value} value={value}>
                                                {value}
                                            </option>
                                        )
                                    )}
                                </select>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <span>{error}</span>

                    <button
                        onClick={handleRefresh}
                        className="font-semibold underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Movement table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center">
                    <div>
                        <h2 className="font-semibold text-slate-800">
                            Movement Records
                        </h2>

                        <p className="mt-1 text-xs text-slate-500">
                            Showing {filteredRows.length} of {rows.length} loaded
                            records
                        </p>
                    </div>

                    <span className="text-xs text-slate-500">
                        {hasMore
                            ? "More records available"
                            : "All records loaded"}
                    </span>
                </div>

                <div
                    onScroll={handleScroll}
                    className="max-h-[650px] overflow-auto"
                >
                    <table className="min-w-[1900px] w-full border-collapse text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-100">
                            <tr className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                {[
                                    "Date",
                                    "PI ID",
                                    "Challan No",
                                    "Job Number",
                                    "Factory",
                                    "Yarn Color",
                                    "Yarn Count",
                                    "Lot No",
                                    "Work Order Qty",
                                    "Delivery Type",
                                    "Delivery Qty",
                                    "From Factory",
                                    "To Factory",
                                    "Delivery Status",
                                ].map((heading) => (
                                    <th
                                        key={heading}
                                        className={`whitespace-nowrap border-b border-slate-200 px-3 py-3 ${
                                            heading === "Yarn Color"
                                                ? "bg-blue-50 text-blue-700"
                                                : ""
                                        }`}
                                    >
                                        {heading}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr>
                                    <td
                                        colSpan={14}
                                        className="py-16 text-center"
                                    >
                                        <Loader2
                                            size={28}
                                            className="mx-auto animate-spin text-blue-600"
                                        />

                                        <p className="mt-3 text-sm text-slate-500">
                                            Loading movement records...
                                        </p>
                                    </td>
                                </tr>
                            ) : filteredRows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={14}
                                        className="py-16 text-center text-slate-500"
                                    >
                                        <Package
                                            size={32}
                                            className="mx-auto mb-2 text-slate-300"
                                        />

                                        <p className="font-medium">
                                            No movement records found
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row) => (
                                    <tr
                                        key={row.rowKey}
                                        className="transition-colors hover:bg-slate-50"
                                    >
                                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                            {formatDate(row.date)}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">
                                            {row.piId || "-"}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-800">
                                            {row.challanNo || "-"}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">
                                            {row.jobNumber || "-"}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                            {row.factoryName || "-"}
                                        </td>

                                        <td className="whitespace-nowrap bg-blue-50/40 px-3 py-3">
                                            <span
                                                className="inline-block rounded-md bg-blue-100 px-2.5 py-1 font-semibold text-blue-800"
                                                title={row.yarnColors}
                                            >
                                                {row.yarnColors}
                                            </span>
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                            {row.yarnCount || "-"}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                            {row.lotNo || "-"}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                                            {formatNumber(row.workOrderQty)}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3">
                                            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                                                {row.deliveryType || "-"}
                                            </span>
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-slate-800">
                                            {formatNumber(row.deliveryQty)}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                            {row.fromFactory || "-"}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                                            {row.toFactory || "-"}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-3">
                                            <span
                                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                                                    row.deliveryStatus
                                                )}`}
                                            >
                                                {row.deliveryStatus || "-"}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>

                        {!isLoading && filteredRows.length > 0 && (
                            <tfoot className="sticky bottom-0 bg-slate-100">
                                <tr className="font-bold text-slate-800">
                                    <td
                                        colSpan={8}
                                        className="px-3 py-3 text-right"
                                    >
                                        Total ({filteredRows.length} records)
                                    </td>

                                    <td className="px-3 py-3 text-right tabular-nums">
                                        {formatNumber(
                                            filteredRows.reduce(
                                                (sum, row) =>
                                                    sum +
                                                    (Number(row.workOrderQty) ||
                                                        0),
                                                0
                                            )
                                        )}
                                    </td>

                                    <td className="px-3 py-3">-</td>

                                    <td className="px-3 py-3 text-right tabular-nums">
                                        {formatNumber(
                                            filteredRows.reduce(
                                                (sum, row) =>
                                                    sum +
                                                    (Number(row.deliveryQty) ||
                                                        0),
                                                0
                                            )
                                        )}
                                    </td>

                                    <td colSpan={3} className="px-3 py-3">
                                        -
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>

                    {isLoadingMore && (
                        <div className="flex items-center justify-center gap-2 border-t border-slate-100 py-4 text-sm text-slate-500">
                            <Loader2
                                size={18}
                                className="animate-spin text-blue-600"
                            />
                            Loading more records...
                        </div>
                    )}

                    {!isLoading &&
                        !isLoadingMore &&
                        hasMore &&
                        rows.length > 0 && (
                            <div className="flex justify-center border-t border-slate-100 py-4">
                                <button
                                    onClick={loadMore}
                                    className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    Load More
                                </button>
                            </div>
                        )}

                    {!isLoading &&
                        !isLoadingMore &&
                        !hasMore &&
                        rows.length > 0 && (
                            <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
                                You have reached the end of the records.
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
};

export default YarnDyedMovement;
