import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

const DELIVERY_TYPES = {
  YARN_DELIVERY: "Yarn Delivery",
  YARN_RETURN: "Yarn Return",
  YARN_DELIVERY_DYE: "Yarn Delivery For Yarn Dye",
  YARN_RETURN_DYE: "Yarn Return From Yarn Dye",
  YARN_RECEIVED_GREY: "Yarn Received From Yarn Dye",
  FINISH_RECEIVED: "Finish Received",
  FINISH_RETURN: "Finish Return",
};

const DELIVERY_FILTER_KEYS = [
  "deliveryDate",
  "challanNo",
  "fromFactory",
  "toFactory",
  "deliveryType",
];

const DELIVERY_TOTAL_KEYS = [
  "yarnDeliveryQty",
  "yarnReturnQty",
  "yarnReceivedGrey",
  "yarnReceivedFinish",
  "finishReturnQty",
];

const COLUMNS = [
  { key: "jobNumber", label: "JOB NO" },
  { key: "piId", label: "PI ID" },
  { key: "orderNumber", label: "ORDER NO" },
  { key: "color", label: "YARN COLOR" },
  { key: "machineDia", label: "MACHINE DIA" },
  { key: "yarnCount", label: "YARN COUNT" },
  { key: "composition", label: "COMPOSITION" },
  { key: "lot", label: "LOT NO" },

  { key: "workOrderQty", label: "WORK ORDER QTY", numeric: true },
  { key: "yarnForDyeQty", label: "YARN FOR DYE", numeric: true },
  { key: "knittingWorkOrderQty", label: "KNITTING WO QTY", numeric: true },
  { key: "knittingAwaitingQty", label: "KNITTING AWAITING", numeric: true },

  { key: "yarnDeliveryQty", label: "YARN DELIVERY QTY", numeric: true },
  { key: "delShortExcess", label: "DEL. SHORT / EXCESS", numeric: true },
  { key: "yarnReturnQty", label: "YARN RETURN QTY", numeric: true },
  { key: "yarnReceivedGrey", label: "GREY RECEIVED QTY", numeric: true },
  { key: "yarnReceivedFinish", label: "FINISH RECEIVED QTY", numeric: true },
  { key: "finishReturnQty", label: "FINISH RETURN QTY", numeric: true },

  { key: "stock", label: "AVAILABLE STOCK", numeric: true },

  { key: "fromFactory", label: "FROM FACTORY" },
  { key: "toFactory", label: "TO FACTORY" },
  { key: "deliveryDate", label: "DELIVERY DATE" },
  { key: "challanNo", label: "CHALLAN NO" },
  { key: "deliveryType", label: "DELIVERY TYPE" },
];

const DEFAULT_VISIBLE_COLUMNS = COLUMNS.map((column) => column.key);

const BOOKING_FIELDS = [
  "piId",
  "orderNumber",
  "color",
  "machineDia",
  "yarnCount",
  "composition",
  "lot",
  "workOrderQty",
  "yarnForDyeQty",
  "knittingWorkOrderQty",
  "knittingAwaitingQty",
  "delShortExcess",
  "stock",
];

const BOOKING_NUMERIC_FIELDS = [
  "workOrderQty",
  "yarnForDyeQty",
  "knittingWorkOrderQty",
  "knittingAwaitingQty",
  "delShortExcess",
  "stock",
];

const SUMMARY_KEYS = [
  "workOrderQty",
  "yarnForDyeQty",
  "knittingWorkOrderQty",
  "knittingAwaitingQty",
  "yarnDeliveryQty",
  "delShortExcess",
  "yarnReturnQty",
  "yarnReceivedGrey",
  "yarnReceivedFinish",
  "finishReturnQty",
  "stock",
];

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const sumValues = (values) =>
  values.reduce((total, value) => total + toNumber(value), 0);

const formatNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-GB");
};

const parseJobMeta = (jobNumber) => {
  const match = String(jobNumber || "").match(
    /(?:^|[-_])([A-Z]{3})(?:[-_]|$)/i
  );

  if (!match) {
    return { monthKey: "", monthLabel: "" };
  }

  const month = match[1].toUpperCase();

  const monthNames = {
    JAN: "January",
    FEB: "February",
    MAR: "March",
    APR: "April",
    MAY: "May",
    JUN: "June",
    JUL: "July",
    AUG: "August",
    SEP: "September",
    OCT: "October",
    NOV: "November",
    DEC: "December",
  };

  return {
    monthKey: month,
    monthLabel: monthNames[month] || month,
  };
};

const getDeliveryField = (delivery, field) => {
  const value = delivery?.[field];

  return value === null || value === undefined || value === ""
    ? "—"
    : value;
};

/**
 * Sum of the quantity of all deliveries of one type.
 * Used only as a fallback when the API does not send a total.
 */
const getDeliveryQuantity = (deliveries, type) => {
  return sumValues(
    deliveries
      .filter((delivery) => delivery.deliveryType === type)
      .map((delivery) => delivery.deliveryQty)
  );
};

/**
 * Normalize one API record (one job).
 *
 * IMPORTANT:
 * Stock is taken directly from API stockSummary.
 * Do not recalculate stock from delivery transactions.
 */
const mapBooking = (item, index) => {
  const rawDeliveries = Array.isArray(item?.deliveries)
    ? item.deliveries
    : [];

  const yarnColors = Array.isArray(item?.yarnColors)
    ? item.yarnColors
    : [];

  const jobNumber = item?.workOrder?.jobNo || "—";

  const jobMeta = parseJobMeta(jobNumber);

  const colors = yarnColors
    .map((color) => color?.color)
    .filter(Boolean);

  // A job can have several compositions: show all distinct names.
  const compositionNames = Array.isArray(item?.compositions)
    ? [
        ...new Set(
          item.compositions
            .map((entry) => entry?.composition)
            .filter(Boolean)
        ),
      ]
    : [];

  const compositionLabel = compositionNames.length
    ? compositionNames.join(", ")
    : item?.composition ?? "—";

  const summary = item?.stockSummary || {};

  const bookingId =
    item?.id ??
    `${jobNumber}-${item?.piId ?? ""}-${item?.lotNo ?? ""}-${index}`;

  const deliveries = rawDeliveries.map((delivery, deliveryIndex) => ({
    id:
      delivery?.id ??
      `${bookingId}-delivery-${deliveryIndex}`,

    deliveryQty: toNumber(delivery?.deliveryQty),
    deliveryDate: formatDate(delivery?.deliveryDate),

    challanNo: getDeliveryField(delivery, "challanNo"),
    fromFactory: getDeliveryField(delivery, "fromFactory"),
    toFactory: getDeliveryField(delivery, "toFactory"),
    deliveryType: getDeliveryField(delivery, "deliveryType"),

    sourceOrderType: getDeliveryField(delivery, "sourceOrderType"),
  }));

  const knittingWorkOrderQty = toNumber(
    summary.knittingWorkOrderQty ?? item?.knittingWorkOrderQty
  );

  const yarnDeliveryQty = toNumber(summary.yarnDeliveryQty);

  // The API may not send the grey received total: sum it from the deliveries.
  const yarnReceivedGrey =
    summary.yarnReceivedGrey !== undefined &&
    summary.yarnReceivedGrey !== null
      ? toNumber(summary.yarnReceivedGrey)
      : getDeliveryQuantity(
          deliveries,
          DELIVERY_TYPES.YARN_RECEIVED_GREY
        );

  return {
    id: String(bookingId),
    bookingId,

    jobNumber,

    piId: item?.piId ?? "—",
    orderNumber: item?.orderNo ?? "—",

    colors: colors.length ? colors : ["—"],

    machineDia: item?.machineDia ?? "—",
    yarnCount: item?.yarnCount ?? "—",
    composition: compositionLabel,
    lot: item?.lotNo ?? "—",

    workOrderQty: toNumber(item?.workOrderQty),

    // API stockSummary values
    yarnForDyeQty: toNumber(summary.yarnForDyeQty),

    knittingWorkOrderQty,

    knittingAwaitingQty: toNumber(summary.knittingAwaitingQty),

    yarnDeliveryQty,

    // Delivered minus knitting work order qty:
    // negative = short, positive = excess.
    delShortExcess: yarnDeliveryQty - knittingWorkOrderQty,

    yarnReturnQty: toNumber(summary.yarnReturnQty),
    yarnReceivedGrey,
    yarnReceivedFinish: toNumber(summary.finishReceivedQty),
    finishReturnQty: toNumber(summary.finishReturnQty),

    // This is the authoritative stock value from the API.
    stock: toNumber(summary.availableStock),

    deliveries,

    monthKey: jobMeta.monthKey,
    monthLabel: jobMeta.monthLabel,
  };
};

/**
 * Get booking totals directly from the normalized API summary.
 */
const getBookingDeliveryTotals = (booking) => ({
  yarnDeliveryQty: booking.yarnDeliveryQty,
  yarnReturnQty: booking.yarnReturnQty,
  yarnReceivedGrey: booking.yarnReceivedGrey,
  yarnReceivedFinish: booking.yarnReceivedFinish,
  finishReturnQty: booking.finishReturnQty,
});

/**
 * Group bookings by unique Job No.
 */
const groupBookingsByJob = (bookings) => {
  const groups = new Map();

  bookings.forEach((booking) => {
    const key = booking.jobNumber || "—";

    if (!groups.has(key)) {
      groups.set(key, {
        jobNumber: key,
        monthKey: booking.monthKey,
        monthLabel: booking.monthLabel,
        bookings: [],
      });
    }

    groups.get(key).bookings.push(booking);
  });

  return Array.from(groups.values());
};

const FilterPopover = ({
  column,
  values,
  selectedValues,
  onChange,
  onClear,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredValues = values.filter((value) =>
    String(value).toLowerCase().includes(search.toLowerCase())
  );

  const toggleValue = (value) => {
    const next = selectedValues.includes(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];

    onChange(column.key, next);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className={`ml-1 rounded px-1.5 py-0.5 text-xs ${
          selectedValues.length
            ? "bg-blue-100 text-blue-700"
            : "text-gray-400 hover:bg-gray-200"
        }`}
        title={`Filter ${column.label}`}
      >
        ▼
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close filter"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                Filter: {column.label}
              </span>

              <button
                type="button"
                onClick={() => onClear(column.key)}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear
              </button>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search values..."
              className="mb-2 w-full rounded border border-gray-200 px-2 py-1.5 text-xs outline-none focus:border-blue-400"
            />

            <div className="max-h-52 space-y-1 overflow-y-auto">
              {filteredValues.map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(value)}
                    onChange={() => toggleValue(value)}
                    className="accent-blue-600"
                  />

                  <span className="break-all text-gray-700">
                    {value}
                  </span>
                </label>
              ))}

              {filteredValues.length === 0 && (
                <p className="py-2 text-center text-xs text-gray-400">
                  No values found
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 w-full rounded bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Apply
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const SummaryCard = ({ title, value, negative = false }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
      {title}
    </p>

    <p
      className={`mt-2 text-xl font-bold ${
        negative ? "text-red-600" : "text-gray-800"
      }`}
    >
      {formatNumber(value)}
    </p>
  </div>
);

const YarnDyedStock = () => {
  const axiosSecure = useAxiosPrivate();

  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [monthFilter, setMonthFilter] = useState("ALL");
  const [columnFilters, setColumnFilters] = useState({});

  const [visibleColumns, setVisibleColumns] = useState(
    DEFAULT_VISIBLE_COLUMNS
  );

  const [showColumnSettings, setShowColumnSettings] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  /**
   * Fetch API
   */
  const fetchStock = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await axiosSecure.get("/api/total/yd-stock");

      const responseData = res?.data;

      const records = Array.isArray(responseData)
        ? responseData
        : Array.isArray(responseData?.data)
          ? responseData.data
          : Array.isArray(responseData?.data?.data)
            ? responseData.data.data
            : [];

      setRawData(records);
    } catch (err) {
      console.error("Failed to fetch yarn dyed stock:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load yarn dyed stock."
      );

      setRawData([]);
    } finally {
      setLoading(false);
    }
  }, [axiosSecure]);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  /**
   * Normalize API data.
   */
  const bookings = useMemo(
    () => rawData.map((item, index) => mapBooking(item, index)),
    [rawData]
  );

  /**
   * Job grouping.
   */
  const jobGroups = useMemo(
    () => groupBookingsByJob(bookings),
    [bookings]
  );

  /**
   * Month options.
   */
  const months = useMemo(() => {
    const monthMap = new Map();

    jobGroups.forEach((group) => {
      if (group.monthKey) {
        monthMap.set(group.monthKey, group.monthLabel);
      }
    });

    return Array.from(monthMap.entries()).map(([key, label]) => ({
      key,
      label,
    }));
  }, [jobGroups]);

  /**
   * Global search and column filtering.
   */
  const filteredGroups = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return jobGroups
      .map((group) => {
        const filteredBookings = group.bookings.filter((booking) => {
          if (search) {
            const values = [
              booking.jobNumber,
              booking.piId,
              booking.orderNumber,
              ...booking.colors,
              booking.machineDia,
              booking.yarnCount,
              booking.composition,
              booking.lot,

              booking.workOrderQty,
              booking.yarnForDyeQty,
              booking.knittingWorkOrderQty,
              booking.knittingAwaitingQty,
              booking.delShortExcess,
              booking.stock,

              ...booking.deliveries.flatMap((delivery) => [
                delivery.fromFactory,
                delivery.toFactory,
                delivery.challanNo,
                delivery.deliveryType,
                delivery.deliveryDate,
                delivery.sourceOrderType,
                delivery.deliveryQty,
              ]),
            ];

            if (
              !values.some((value) =>
                String(value ?? "")
                  .toLowerCase()
                  .includes(search)
              )
            ) {
              return false;
            }
          }

          return Object.entries(columnFilters).every(
            ([key, selected]) => {
              if (!selected?.length) return true;

              if (DELIVERY_FILTER_KEYS.includes(key)) {
                return booking.deliveries.some((delivery) =>
                  selected.includes(String(delivery[key] ?? "—"))
                );
              }

              if (key === "color") {
                return booking.colors.some((color) =>
                  selected.includes(String(color))
                );
              }

              if (DELIVERY_TOTAL_KEYS.includes(key)) {
                const totals = getBookingDeliveryTotals(booking);

                return selected.includes(
                  String(totals[key] ?? 0)
                );
              }

              return selected.includes(
                String(booking[key] ?? "—")
              );
            }
          );
        });

        return {
          ...group,
          bookings: filteredBookings,
        };
      })
      .filter((group) => {
        if (!group.bookings.length) return false;

        return (
          monthFilter === "ALL" ||
          group.monthKey === monthFilter
        );
      });
  }, [jobGroups, searchTerm, monthFilter, columnFilters]);

  /**
   * All bookings for filter options.
   */
  const allBookings = useMemo(
    () => jobGroups.flatMap((group) => group.bookings),
    [jobGroups]
  );

  /**
   * Filter dropdown values.
   */
  const getColumnValues = useCallback(
    (key) => {
      const values = [];

      allBookings.forEach((booking) => {
        if (DELIVERY_FILTER_KEYS.includes(key)) {
          booking.deliveries.forEach((delivery) => {
            values.push(String(delivery[key] ?? "—"));
          });
        } else if (key === "color") {
          booking.colors.forEach((color) => {
            values.push(String(color));
          });
        } else if (DELIVERY_TOTAL_KEYS.includes(key)) {
          const totals = getBookingDeliveryTotals(booking);
          values.push(String(totals[key] ?? 0));
        } else {
          values.push(String(booking[key] ?? "—"));
        }
      });

      return [...new Set(values)].sort((a, b) =>
        a.localeCompare(b)
      );
    },
    [allBookings]
  );

  /**
   * Summary totals of the visible jobs.
   * No delivery recalculation is performed here.
   */
  const totals = useMemo(() => {
    const visibleBookings = filteredGroups.flatMap(
      (group) => group.bookings
    );

    return Object.fromEntries(
      SUMMARY_KEYS.map((key) => [
        key,
        sumValues(
          visibleBookings.map((booking) => booking[key])
        ),
      ])
    );
  }, [filteredGroups]);

  /**
   * Totals of one job group.
   */
  const getGroupTotals = useCallback((group) => {
    return Object.fromEntries(
      SUMMARY_KEYS.map((key) => [
        key,
        sumValues(group.bookings.map((booking) => booking[key])),
      ])
    );
  }, []);

  /**
   * Pagination.
   */
  const totalPages = Math.max(
    1,
    Math.ceil(filteredGroups.length / pageSize)
  );

  const currentPage = Math.min(page, totalPages);

  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;

    return filteredGroups.slice(
      startIndex,
      startIndex + pageSize
    );
  }, [filteredGroups, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, monthFilter, columnFilters, pageSize]);

  const handleColumnFilter = (key, values) => {
    setColumnFilters((previous) => ({
      ...previous,
      [key]: values,
    }));
  };

  const clearColumnFilter = (key) => {
    setColumnFilters((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const toggleColumn = (key) => {
    setVisibleColumns((previous) =>
      previous.includes(key)
        ? previous.filter((item) => item !== key)
        : [...previous, key]
    );
  };

  const resetFilters = () => {
    setSearchTerm("");
    setMonthFilter("ALL");
    setColumnFilters({});
    setPage(1);
  };

  /**
   * Booking-level cell rendering.
   */
  const renderBookingValue = (booking, key) => {
    if (key === "color") {
      return (
        <div className="flex flex-col gap-1">
          {booking.colors.map((color, index) => (
            <div key={`${booking.id}-color-${index}`}>
              {color}
            </div>
          ))}
        </div>
      );
    }

    const value = booking[key];

    if (BOOKING_NUMERIC_FIELDS.includes(key)) {
      return formatNumber(value);
    }

    return value === null || value === undefined || value === ""
      ? "—"
      : value;
  };

  /**
   * Delivery-level cell rendering.
   *
   * Each challan remains a separate row.
   */
  const getDeliveryCellValue = (delivery, key) => {
    if (!delivery) return "—";

    switch (key) {
      case "yarnDeliveryQty":
        return delivery.deliveryType === DELIVERY_TYPES.YARN_DELIVERY
          ? formatNumber(delivery.deliveryQty)
          : "—";

      case "yarnReturnQty":
        return delivery.deliveryType === DELIVERY_TYPES.YARN_RETURN
          ? formatNumber(delivery.deliveryQty)
          : "—";

      case "yarnReceivedGrey":
        return delivery.deliveryType === DELIVERY_TYPES.YARN_RECEIVED_GREY
          ? formatNumber(delivery.deliveryQty)
          : "—";

      case "yarnReceivedFinish":
        return delivery.deliveryType === DELIVERY_TYPES.FINISH_RECEIVED
          ? formatNumber(delivery.deliveryQty)
          : "—";

      case "finishReturnQty":
        return delivery.deliveryType === DELIVERY_TYPES.FINISH_RETURN
          ? formatNumber(delivery.deliveryQty)
          : "—";

      case "fromFactory":
      case "toFactory":
      case "deliveryDate":
      case "challanNo":
      case "deliveryType":
        return delivery[key] ?? "—";

      default:
        return "—";
    }
  };

  const activeColumns = COLUMNS.filter((column) =>
    visibleColumns.includes(column.key)
  );

  const startRecord =
    filteredGroups.length === 0
      ? 0
      : (currentPage - 1) * pageSize + 1;

  const endRecord = Math.min(
    currentPage * pageSize,
    filteredGroups.length
  );

  /**
   * Render.
   */
  return (
    <div className="w-full space-y-5 p-4">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            Yarn Dyed Stock
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Job-wise yarn dyed stock. Stock = Finish Received − Yarn
            Delivery to knitting (same job).
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStock}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Jobs"
          value={filteredGroups.length}
        />

        <SummaryCard
          title="Work Order Qty"
          value={totals.workOrderQty}
        />

        <SummaryCard
          title="Yarn For Dye"
          value={totals.yarnForDyeQty}
        />

        <SummaryCard
          title="Knitting WO Qty"
          value={totals.knittingWorkOrderQty}
        />

        <SummaryCard
          title="Knitting Awaiting"
          value={totals.knittingAwaitingQty}
        />

        <SummaryCard
          title="Yarn Delivery Qty"
          value={totals.yarnDeliveryQty}
        />

        <SummaryCard
          title="Yarn Return Qty"
          value={totals.yarnReturnQty}
        />

        <SummaryCard
          title="Grey Received"
          value={totals.yarnReceivedGrey}
        />

        <SummaryCard
          title="Finish Received"
          value={totals.yarnReceivedFinish}
        />

        <SummaryCard
          title="Finish Return"
          value={totals.finishReturnQty}
        />

        <SummaryCard
          title="Available Stock"
          value={totals.stock}
          negative={totals.stock < 0}
        />
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search Job No, PI, Color, Lot, Factory, Challan..."
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />

          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none"
          >
            <option value="ALL">All Months</option>

            {months.map((month) => (
              <option key={month.key} value={month.key}>
                {month.label}
              </option>
            ))}
          </select>

          {/* Column Settings */}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setShowColumnSettings((previous) => !previous)
              }
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Columns ▾
            </button>

            {showColumnSettings && (
              <>
                <button
                  type="button"
                  aria-label="Close column settings"
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => setShowColumnSettings(false)}
                />

                <div className="absolute right-0 top-full z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      Visible Columns
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
                      }
                      className="text-xs text-blue-600"
                    >
                      Reset
                    </button>
                  </div>

                  {COLUMNS.map((column) => (
                    <label
                      key={column.key}
                      className="flex cursor-pointer items-center gap-2 py-1.5 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column.key)}
                        onChange={() => toggleColumn(column.key)}
                        className="accent-blue-600"
                      />

                      {column.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>

          <button
            type="button"
            onClick={fetchStock}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              Job-wise Booking Details
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Each delivery is shown separately. Stock values are taken
              directly from the API stockSummary.
            </p>
          </div>

          <span className="text-xs text-gray-500">
            {filteredGroups.length.toLocaleString()} unique jobs
          </span>
        </div>

        <div className="max-h-[680px] overflow-auto">
          <table className="min-w-max w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-20 bg-gray-100">
              <tr>
                <th className="whitespace-nowrap border-b border-r border-gray-200 px-3 py-3 text-center">
                  #
                </th>

                {activeColumns.map((column) => (
                  <th
                    key={column.key}
                    className="whitespace-nowrap border-b border-r border-gray-200 px-3 py-3 font-semibold text-gray-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{column.label}</span>

                      <FilterPopover
                        column={column}
                        values={getColumnValues(column.key)}
                        selectedValues={columnFilters[column.key] || []}
                        onChange={handleColumnFilter}
                        onClear={clearColumnFilter}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={activeColumns.length + 1}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    Loading yarn dyed stock...
                  </td>
                </tr>
              ) : paginatedGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeColumns.length + 1}
                    className="px-4 py-12 text-center text-gray-500"
                  >
                    No records found.
                  </td>
                </tr>
              ) : (
                paginatedGroups.map((group, groupIndex) => {
                  const groupRows = [];

                  group.bookings.forEach((booking, bookingIndex) => {
                    const deliveries = booking.deliveries.length
                      ? booking.deliveries
                      : [null];

                    deliveries.forEach((delivery, deliveryIndex) => {
                      groupRows.push({
                        booking,
                        delivery,
                        bookingIndex,
                        deliveryIndex,
                      });
                    });
                  });

                  const groupTotals = getGroupTotals(group);
                  const groupRowSpan = groupRows.length + 1;

                  return (
                    <Fragment key={group.jobNumber}>
                      {groupRows.map((entry, rowIndex) => {
                        const {
                          booking,
                          delivery,
                          deliveryIndex,
                        } = entry;

                        const isFirstDelivery = deliveryIndex === 0;

                        return (
                          <tr
                            key={`${booking.id}-${delivery?.id ?? "no-delivery"}-${rowIndex}`}
                            className={`hover:bg-blue-50/50 ${
                              rowIndex === 0
                                ? "border-t-2 border-t-blue-300"
                                : ""
                            }`}
                          >
                            {/* Row Number */}
                            {rowIndex === 0 && (
                              <td
                                rowSpan={groupRowSpan}
                                className="whitespace-nowrap border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-center align-middle text-gray-500"
                              >
                                {(currentPage - 1) * pageSize +
                                  groupIndex +
                                  1}
                              </td>
                            )}

                            {activeColumns.map((column) => {
                              // Job Number
                              if (column.key === "jobNumber") {
                                if (rowIndex !== 0) return null;

                                return (
                                  <td
                                    key={column.key}
                                    rowSpan={groupRowSpan}
                                    className="min-w-[170px] whitespace-nowrap border-b border-r border-gray-200 bg-blue-50 px-3 py-2 text-center align-middle font-bold text-blue-800"
                                  >
                                    {group.jobNumber}
                                  </td>
                                );
                              }

                              // Booking-level fields
                              if (BOOKING_FIELDS.includes(column.key)) {
                                if (!isFirstDelivery) return null;

                                const value = renderBookingValue(
                                  booking,
                                  column.key
                                );

                                return (
                                  <td
                                    key={column.key}
                                    rowSpan={booking.deliveries.length || 1}
                                    className={`max-w-[260px] border-b border-r border-gray-100 px-3 py-2 align-middle ${
                                      column.numeric
                                        ? "whitespace-nowrap text-right tabular-nums"
                                        : "whitespace-normal"
                                    } ${
                                      column.key === "stock"
                                        ? booking.stock < 0
                                          ? "bg-red-50 font-semibold text-red-600"
                                          : "font-semibold text-gray-800"
                                        : column.key === "piId"
                                          ? "font-medium text-gray-800"
                                          : "text-gray-700"
                                    }`}
                                    title={
                                      column.key === "color"
                                        ? booking.colors.join(" / ")
                                        : String(value)
                                    }
                                  >
                                    {value}
                                  </td>
                                );
                              }

                              // Delivery-level fields
                              if (
                                DELIVERY_TOTAL_KEYS.includes(column.key) ||
                                DELIVERY_FILTER_KEYS.includes(column.key)
                              ) {
                                const value = getDeliveryCellValue(
                                  delivery,
                                  column.key
                                );

                                return (
                                  <td
                                    key={column.key}
                                    className={`max-w-[240px] border-b border-r border-gray-100 px-3 py-2 ${
                                      column.numeric
                                        ? "whitespace-nowrap text-right tabular-nums"
                                        : "whitespace-normal text-gray-700"
                                    }`}
                                  >
                                    {value}
                                  </td>
                                );
                              }

                              return (
                                <td
                                  key={column.key}
                                  className="border-b border-r border-gray-100 px-3 py-2"
                                >
                                  —
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}

                      {/* Job Total */}
                      <tr className="bg-gray-100 font-semibold">
                        {activeColumns.map((column) => {
                          if (column.key === "jobNumber") {
                            return null;
                          }

                          if (column.key === "piId") {
                            return (
                              <td
                                key={column.key}
                                className="border-b border-r border-gray-200 px-3 py-2 text-right text-gray-700"
                              >
                                JOB TOTAL
                              </td>
                            );
                          }

                          const totalValue = groupTotals[column.key];

                          if (
                            column.numeric &&
                            totalValue !== undefined
                          ) {
                            return (
                              <td
                                key={column.key}
                                className={`whitespace-nowrap border-b border-r border-gray-200 px-3 py-2 text-right tabular-nums ${
                                  column.key === "stock" && totalValue < 0
                                    ? "text-red-600"
                                    : "text-gray-800"
                                }`}
                              >
                                {formatNumber(totalValue)}
                              </td>
                            );
                          }

                          return (
                            <td
                              key={column.key}
                              className="border-b border-r border-gray-200 px-3 py-2"
                            />
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span>Jobs per page:</span>

            <select
              value={pageSize}
              onChange={(event) =>
                setPageSize(Number(event.target.value))
              }
              className="rounded border border-gray-200 px-2 py-1"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>

            <span>
              {startRecord}–{endRecord} of {filteredGroups.length} jobs
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage(1)}
              className="rounded border border-gray-200 px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              First
            </button>

            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((previous) => previous - 1)}
              className="rounded border border-gray-200 px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              Previous
            </button>

            <span className="px-2 text-xs text-gray-600">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((previous) => previous + 1)}
              className="rounded border border-gray-200 px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              Next
            </button>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(totalPages)}
              className="rounded border border-gray-200 px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              Last
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YarnDyedStock;