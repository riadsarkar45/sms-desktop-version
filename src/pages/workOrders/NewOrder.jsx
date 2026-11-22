import { useEffect, useState, useMemo, useCallback, useRef, useLayoutEffect } from "react";
import {
    Loader2,
    Save,
    X,
    Plus,
    Copy,
    Sparkles,
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
    Pin,
    PinOff,
    ChevronLeft,
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

const str = (value) => String(value ?? "").trim();

// Keeps only digits and a single decimal point
const sanitizeDecimal = (value) =>
    String(value ?? "")
        .replace(/[^\d.]/g, "")
        .replace(/(\..*)\./g, "$1");

const formatKg = (value) =>
    toNum(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

const formatMoney = (value) =>
    toNum(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

// Fields in a yarn color row that must be numeric
const NUMERIC_YARN_FIELDS = new Set(["qty", "price"]);
// Fields in a work order line that must be numeric
const NUMERIC_LOT_FIELDS = new Set(["workOrderQty"]);
// Composition-level fields (shared by all lines) that must be numeric
const NUMERIC_ROW_FIELDS = new Set(["unitPrice", "shadePercent"]);
// Fields driven by the PI / Lot / Count inventory
const INVENTORY_FIELDS = new Set(["lotNo", "yarnCount", "piNo"]);

// ---------------------------------------------------------
// Default lot / count / PI (ALL order types)
// Selectable from the dropdowns, and selected automatically when the job has
// no lot / yarn count at all.
// A line that uses them ALWAYS carries DEFAULT PI too, so the backend
// still receives a PI No. It has no stock bucket.
// ---------------------------------------------------------
const DEFAULT_LOT = "DEFAULT LOT";
const DEFAULT_COUNT = "DEFAULT COUNT";
const DEFAULT_PI = "DEFAULT PI";

const isDefaultItem = (item) =>
    item?.lotNo === DEFAULT_LOT || item?.yarnCount === DEFAULT_COUNT;

// PI No that is sent to the backend for one line / color
const getPiForPayload = (item) =>
    isDefaultItem(item) ? DEFAULT_PI : String(item?.piNo ?? "").trim();

// Stable ids so React keys stay correct when yarn colors are removed
// `prefilled` = the line was filled automatically from the job's base work order
// (cleared as soon as the user edits the line)
let yarnColorCounter = 0;
const defaultYarnColor = (init = {}) => ({
    uid: ++yarnColorCounter,
    color: "",
    qty: "",
    price: "",
    lotNo: "",
    yarnCount: "",
    piNo: "",
    prefilled: false,
    ...init,
});

// Stable ids so React keys stay correct when work order lines are removed.
// A line holds ONLY: qty, lot, yarn count and PI.
// Price / stich length / machine dia live on the composition row.
let lotCounter = 0;
const defaultLot = (init = {}) => ({
    uid: ++lotCounter,
    workOrderQty: "",
    lotNo: "",
    ydBatch: "",
    yarnCount: "",
    piNo: "",
    prefilled: false,
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

// Every PI No in the yarn stock
const getAllPis = (inventory) =>
    uniqSorted(inventory.map((entry) => entry.piNo));

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

// TRUE when the stock list has this exact PI + Lot + Count
const hasInventoryEntry = (inventory, piNo, lotNo, yarnCount) =>
    inventory.some(
        (entry) =>
            entry.piNo === piNo &&
            entry.lotNo === lotNo &&
            entry.yarnCount === yarnCount
    );

// Applies a Lot / Count / PI change to a line or yarn color.
// Every lot, count and PI is offered, so nothing is cascaded: each field keeps
// exactly what the user picked. Only the default values are handled.
const applyInventoryChange = (item, field, value) => {
    // Picking the default lot / count / PI selects ALL THREE defaults
    if (
        (field === "lotNo" && value === DEFAULT_LOT) ||
        (field === "yarnCount" && value === DEFAULT_COUNT)
    ) {
        return {
            ...item,
            lotNo: DEFAULT_LOT,
            yarnCount: DEFAULT_COUNT,
            piNo: DEFAULT_PI,
        };
    }

    const next = { ...item, [field]: value };

    // Leaving the defaults: drop the other default values so they do not stick
    if (isDefaultItem(item)) {
        if (field !== "lotNo" && next.lotNo === DEFAULT_LOT) next.lotNo = "";
        if (field !== "yarnCount" && next.yarnCount === DEFAULT_COUNT) next.yarnCount = "";
        if (field !== "piNo" && next.piNo === DEFAULT_PI) next.piNo = "";
    }

    return next;
};

// ---------------------------------------------------------
// Yarn dyeing (Y/D) lot helpers (knitting orders)
// One entry = a lot + yarn count booked on a yarn dyeing work order of this job
// ---------------------------------------------------------
const getYdCounts = (ydLots, ydBatch) =>
    uniqSorted(
        ydLots
            .filter((entry) => entry.ydBatch === ydBatch)
            .map((entry) => entry.yarnCount)
            .filter(Boolean)
    );

const getYdBookedQty = (ydLots, ydBatch) =>
    ydLots
        .filter((entry) => entry.ydBatch === ydBatch)
        .reduce((sum, entry) => sum + toNum(entry.bookedQuantity), 0);

const hasValue = (value) =>
    value !== "" && value !== null && value !== undefined;

// Yarn requirement for one composition.
// The process loss saved on the style (style summary) is the source of truth;
// a composition's own process loss is only a fallback when the style has none.
const calcRequireQty = (row, styleLoss) => {
    const loss = hasValue(styleLoss)
        ? toNum(styleLoss)
        : toNum(row.processLoss);

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
    // AOP + Dyeing use the compact design: ONE set of 8 fields per
    // composition (price, qty, yarn count, yarn lot, PI no, stitch length,
    // package, shade %). Knitting + Yarn dyeing keep the standard design.
    aopOrder: {
        compact: true,
        lotNo: true,
        yarnCount: true,
        stichLength: true,
        machineDia: false,
    },
    dyeingOrder: {
        compact: true,
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

const ORDER_TYPE_OPTIONS = [
    { value: "knittingOrder", label: "Knitting", dot: "bg-indigo-500" },
    { value: "aopOrder", label: "AOP", dot: "bg-fuchsia-500" },
    { value: "dyeingOrder", label: "Dyeing", dot: "bg-sky-500" },
    { value: "yarnDyeingOrder", label: "Yarn dyeing", dot: "bg-amber-500" },
];

const getOrderTypeLabel = (value) =>
    ORDER_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "";

const MONTH_OPTIONS = [
    "JANUARY",
    "FEBRUARY",
    "MARCH",
    "APRIL",
    "MAY",
    "JUNE",
    "JULY",
    "AUGUST",
    "SEPTEMBER",
    "OCTOBER",
    "NOVEMBER",
    "DECEMBER",
];

// Yesterday as YYYY-MM-DD in the user's LOCAL time (for <input type="date">)
const getYesterdayISO = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const getRules = (orderType) =>
    ORDER_TYPE_RULES[orderType] || {};

// ---------------------------------------------------------
// AOP / Dyeing lot helpers
// They use the SAME lot list as the other order types: the full yarn stock
// when the job has no knitting / yarn dyeing order yet, otherwise only the
// lots of the job's first (base) order. When a Lot + Count is chosen, the
// balance of the PIs that really exist for that pair is attached.
// Each PI option: { piNo, totalQuantity } (null when unknown).
// ---------------------------------------------------------
const getAllCompactLots = (inventory) => getAllLots(inventory);

const getAllCompactCounts = (inventory) => getAllCounts(inventory);

const getCompactPiOptions = (inventory, lotNo, yarnCount) => {
    const options = new Map(getAllPis(inventory).map((piNo) => [piNo, null]));

    if (lotNo && yarnCount) {
        getPisForPair(inventory, lotNo, yarnCount).forEach((entry) => {
            options.set(entry.piNo, entry.totalQuantity);
        });
    }

    return [...options.entries()]
        .map(([piNo, totalQuantity]) => ({ piNo, totalQuantity }))
        .sort((a, b) => a.piNo.localeCompare(b.piNo));
};

// ---------------------------------------------------------
// DEFAULT LOT / DEFAULT COUNT / DEFAULT PI sync (ALL order types)
// ---------------------------------------------------------

// Removes DEFAULT LOT / DEFAULT COUNT / DEFAULT PI from every line + color
// (used when real lots exist, so the real ones can take over)
const clearDefaultLotValues = (rows) => {
    const fix = (item) => {
        if (!isDefaultItem(item) && item.piNo !== DEFAULT_PI) return item;

        return {
            ...item,
            lotNo: item.lotNo === DEFAULT_LOT ? "" : item.lotNo,
            yarnCount: item.yarnCount === DEFAULT_COUNT ? "" : item.yarnCount,
            piNo: item.piNo === DEFAULT_PI ? "" : item.piNo,
        };
    };

    return rows.map((row) => ({
        ...row,
        lots: row.lots ? row.lots.map(fix) : row.lots,
        yarnColors: row.yarnColors ? row.yarnColors.map(fix) : row.yarnColors,
    }));
};

// Fills empty Lot / Count with the defaults AND sets DEFAULT PI on every line
// that ends up using a default (lines that use a Y/D batch are skipped)
const fillDefaultLotValues = (rows, orderType) => {
    const fill = (item) => {
        if (item.ydBatch) return item;

        const lotNo = item.lotNo || DEFAULT_LOT;
        const yarnCount = item.yarnCount || DEFAULT_COUNT;
        const usesDefault = lotNo === DEFAULT_LOT || yarnCount === DEFAULT_COUNT;

        return {
            ...item,
            lotNo,
            yarnCount,
            piNo: usesDefault ? DEFAULT_PI : item.piNo,
        };
    };

    return rows.map((row) =>
        orderType === "yarnDyeingOrder"
            ? { ...row, yarnColors: (row.yarnColors ?? []).map(fill) }
            : { ...row, lots: (row.lots ?? []).map(fill) }
    );
};

// One place that decides what Lot / Count / PI the rows should hold:
//  - real lots exist  -> clear the defaults
//                        (AOP / Dyeing keep a default the user picked on purpose)
//  - nothing found    -> select DEFAULT LOT / DEFAULT COUNT / DEFAULT PI
const syncDefaultLots = (rows, orderType, noLotsFound) => {
    if (!orderType) return rows;

    // AOP / Dyeing never use the default lot / count / PI: real values only
    if (noLotsFound && !getRules(orderType).compact) {
        return fillDefaultLotValues(rows, orderType);
    }

    return clearDefaultLotValues(rows);
};

// ---------------------------------------------------------
// PREFILL from the job's BASE work order
// The base order is the first knitting / yarn dyeing order created in the job.
// The backend returns, per composition, its lot / yarn count / PI and the
// REMAINING qty (base qty minus what earlier orders of this type already used).
// The new order starts with exactly those values; only the lots of the base
// order can be selected.
//   knitting (base = yarn dyeing) -> lot becomes the Y/D batch
//   yarn dyeing (base = knitting) -> one color line per lot
//   AOP / dyeing                  -> one set of details
// ---------------------------------------------------------
const EMPTY_PREFILL = { key: "", version: 0, sourceOrderType: null, rows: [] };

// Which lots the lot / count / PI dropdowns are limited to
const EMPTY_LOT_SOURCE = { key: "", restricted: false, baseOrderType: null };

// A line the user has not typed anything into yet
// (empty, or only holding the default lot / count / PI)
const isBlankLine = (item, isYD) =>
    !hasValue(isYD ? item.qty : item.workOrderQty) &&
    !str(item.color) &&
    !hasValue(item.price) &&
    !str(item.ydBatch) &&
    (!str(item.lotNo) || item.lotNo === DEFAULT_LOT) &&
    (!str(item.yarnCount) || item.yarnCount === DEFAULT_COUNT) &&
    (!str(item.piNo) || item.piNo === DEFAULT_PI);

// Auto-fill never overwrites what the user typed
const canPrefillLines = (items, isYD) =>
    items.every((item) => item.prefilled || isBlankLine(item, isYD));

const qtyText = (qty) =>
    toNum(qty) > 0 ? String(Number(toNum(qty).toFixed(3))) : "";

const piForLine = (line) =>
    isDefaultItem(line) ? DEFAULT_PI : str(line.piNo);

const applyPrefillToRows = (rows, prefill, orderType) => {
    if (
        !prefill?.sourceOrderType ||
        !Array.isArray(prefill.rows) ||
        prefill.rows.length === 0
    ) {
        return rows;
    }

    const byRow = new Map(
        prefill.rows.map((item) => [
            Number(item.styleRequirementRowId),
            item.lines ?? [],
        ])
    );

    const isYD = orderType === "yarnDyeingOrder";
    const isKnitting = orderType === "knittingOrder";
    const isCompact = Boolean(getRules(orderType).compact);
    const fromYd = prefill.sourceOrderType === "yarnDyeingOrder";

    return rows.map((row) => {
        const sourceLines = byRow.get(Number(row.styleRequirementRowId ?? row.id));
        if (!sourceLines || sourceLines.length === 0) return row;

        const current = (isYD ? row.yarnColors : row.lots) ?? [];
        if (!canPrefillLines(current, isYD)) return row;

        // Knitting: yarn dyeing lot -> Y/D Batch, merged by lot + count
        if (isKnitting) {
            const merged = new Map();

            sourceLines.forEach((line) => {
                const key = JSON.stringify([
                    str(line.lotNo).toLowerCase(),
                    str(line.yarnCount).toLowerCase(),
                ]);
                const entry = merged.get(key) ?? { ...line, qty: 0 };
                entry.qty += toNum(line.qty);
                merged.set(key, entry);
            });

            const lots = [...merged.values()].map((line) =>
                fromYd
                    ? defaultLot({
                        ydBatch: str(line.lotNo),
                        yarnCount: str(line.yarnCount),
                        workOrderQty: qtyText(line.qty),
                        prefilled: true,
                    })
                    : defaultLot({
                        lotNo: str(line.lotNo),
                        yarnCount: str(line.yarnCount),
                        piNo: piForLine(line),
                        workOrderQty: qtyText(line.qty),
                        prefilled: true,
                    })
            );

            return lots.length ? { ...row, lots } : row;
        }

        // Yarn dyeing: one color line per source lot (color + price stay empty)
        if (isYD) {
            const yarnColors = sourceLines.map((line) =>
                defaultYarnColor({
                    lotNo: str(line.lotNo),
                    yarnCount: str(line.yarnCount),
                    piNo: piForLine(line),
                    qty: qtyText(line.qty),
                    prefilled: true,
                })
            );

            return yarnColors.length ? { ...row, yarnColors } : row;
        }

        // AOP / Dyeing: ONE set of details, real values only (never the defaults)
        if (isCompact) {
            const line = sourceLines.find((item) => !isDefaultItem(item));
            if (!line) return row;

            return {
                ...row,
                lots: [
                    defaultLot({
                        lotNo: str(line.lotNo),
                        yarnCount: str(line.yarnCount),
                        piNo: str(line.piNo),
                        workOrderQty: qtyText(line.qty),
                        prefilled: true,
                    }),
                ],
            };
        }

        return row;
    });
};

// Removes the lines that were filled automatically (used when the order type
// changes, so values of the old type do not follow the user into the new one)
const resetPrefilledLines = (rows) =>
    rows.map((row) => {
        const hasPrefilled = (list) => (list ?? []).some((item) => item.prefilled);

        if (!hasPrefilled(row.lots) && !hasPrefilled(row.yarnColors)) return row;

        const keep = (list, make) => {
            const kept = (list ?? []).filter((item) => !item.prefilled);
            return kept.length > 0 ? kept : [make()];
        };

        return {
            ...row,
            lots: keep(row.lots, defaultLot),
            yarnColors: keep(row.yarnColors, defaultYarnColor),
        };
    });

// ===== AUTO-FIT LAYOUT CONFIG (same as Summary) =====
// The content box always fills the rest of the screen: bigger screen = taller box, smaller screen = shorter box.
const MIN_TABLE_HEIGHT = 300;   // only a safety minimum - the real height is calculated from the screen
// Space kept free under the box: the fixed action bar (~56px) + a little gap
const BOTTOM_RESERVE = 70;

// The ERP has its own zoom (67% / 100% ...). With CSS zoom / scale the real screen pixels are NOT the same as the CSS
// pixels of the page, so the height must be corrected by this factor. 1 = no zoom.
// (only used as a fallback - measureFit measures the zoom factor from the box itself)
const getZoomScale = (el) => {
    const rect = el.getBoundingClientRect();
    const w = el.offsetWidth;
    if (!w || !rect.width) return 1;
    const scale = rect.width / w;
    return scale > 0.2 && scale < 5 ? scale : 1;
};
// ===== END AUTO-FIT LAYOUT CONFIG =====

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
        pkg: "",
        shadePercent: "",
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
            pkg: "",
            shadePercent: "",
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

// Dropdown used by AOP / Dyeing for Yarn Count and Yarn Lot.
// A value that was filled automatically from the base work order stays
// selectable even when it is no longer in the list.
const JobLotSelect = ({
    label,
    value,
    onChange,
    options,
    loading,
    placeholder,
    emptyText,
}) => {
    const shownOptions =
        value && !options.includes(value) ? [...options, value] : options;

    return (
        <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
                {label} <span className="text-red-500">*</span>
            </label>
            <select
                value={value ?? ""}
                disabled={loading || shownOptions.length === 0}
                onChange={(e) => onChange(e.target.value)}
                className={SELECT_CLASS}
            >
                <option value="">
                    {loading
                        ? "Loading..."
                        : shownOptions.length === 0
                            ? emptyText
                            : placeholder}
                </option>
                {shownOptions.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </div>
    );
};

// PI No field used by AOP / Dyeing (compact design).
//  - a dropdown with the PI numbers of the list (balance shown when the chosen
//    Lot + Count has one)
// `usage` is a Map(inventoryKey -> qty requested by ALL lines of this order).
const CompactPiField = ({ item, options, loading, usage, onChange }) => {
    // A PI filled automatically from the base work order stays selectable
    const shownOptions =
        item.piNo && !options.some((option) => option.piNo === item.piNo)
            ? [...options, { piNo: item.piNo, totalQuantity: null }]
            : options;

    const picked = shownOptions.find((option) => option.piNo === item.piNo);
    const availableQty = picked?.totalQuantity ?? null;

    const usedQty =
        item.piNo && availableQty !== null
            ? usage?.get(inventoryKey(item.piNo, item.lotNo, item.yarnCount)) ?? 0
            : 0;

    const isOver = availableQty !== null && usedQty > availableQty;

    return (
        <div className="min-w-0">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
                PI No <span className="text-red-500">*</span>
            </label>

            {shownOptions.length > 0 ? (
                <select
                    value={item.piNo ?? ""}
                    disabled={loading}
                    onChange={(e) => onChange(e.target.value)}
                    className={SELECT_CLASS}
                >
                    <option value="">
                        {loading ? "Loading..." : "Select PI No"}
                    </option>
                    {shownOptions.map((option) => (
                        <option key={option.piNo} value={option.piNo}>
                            {option.piNo}
                            {option.totalQuantity !== null
                                ? ` — ${option.totalQuantity.toLocaleString()} KG`
                                : ""}
                        </option>
                    ))}
                </select>
            ) : (
                <input
                    type="text"
                    value={item.piNo ?? ""}
                    disabled={loading}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Type PI No"
                    autoComplete="off"
                    className={SELECT_CLASS}
                />
            )}

            {availableQty !== null && (
                <p
                    className={`mt-1 text-[11px] ${isOver ? "font-medium text-red-600" : "text-slate-500"}`}
                >
                    {isOver
                        ? `Over by ${formatKg(usedQty - availableQty)} KG. `
                        : ""}
                    {formatKg(usedQty)} of {formatKg(availableQty)} KG used in this order
                </p>
            )}
        </div>
    );
};

// Lot No + Yarn Count + PI No selects.
// Renders three grid cells, so put it directly inside a grid container.
// Lot and Count sit side by side, PI No spans the full width underneath.
// `usage` is a Map(inventoryKey -> qty requested by ALL lines of this order)
// so each card can show a live stock bar for its PI.
// `noLots` = nothing found for this job: DEFAULT LOT / DEFAULT COUNT / DEFAULT PI are offered.
const LotCountPiFields = ({
    item,
    onChange,
    inventory,
    loading,
    usage,
    noLots = false,
    showYdBatch = false,
    ydLots = [],
    ydBatchLoading = false,
}) => {
    // Knitting only: a line uses EITHER a Lot (raw yarn) OR a Y/D Batch.
    // Typing a Y/D Batch locks Lot; picking a Lot locks Y/D Batch.
    const hasYd = showYdBatch && String(item.ydBatch ?? "").trim() !== "";
    const isDefault = isDefaultItem(item);

    const ydOptions = uniqSorted(ydLots.map((entry) => entry.ydBatch));

    const ydLabel = (batch) => {
        const counts = getYdCounts(ydLots, batch);
        const booked = getYdBookedQty(ydLots, batch);

        return (
            batch +
            (counts.length ? ` — ${counts.join(", ")}` : "") +
            (booked > 0 ? ` (${formatKg(booked)} KG booked)` : "")
        );
    };

    // Every lot / count / PI of the list is offered, whatever is picked in the other fields
    let lotOptions = getAllLots(inventory);

    const ydCounts = hasYd ? getYdCounts(ydLots, item.ydBatch) : [];

    let countOptions =
        ydCounts.length > 0 ? ydCounts : getAllCounts(inventory);

    // Nothing found for this job: offer the defaults
    if ((noLots || item.lotNo === DEFAULT_LOT) && !lotOptions.includes(DEFAULT_LOT)) {
        lotOptions = [...lotOptions, DEFAULT_LOT];
    }

    if (
        (noLots || item.yarnCount === DEFAULT_COUNT) &&
        !countOptions.includes(DEFAULT_COUNT)
    ) {
        countOptions = [...countOptions, DEFAULT_COUNT];
    }

    // A value filled automatically from the base work order stays selectable,
    // even when that lot / count is not in the list any more
    if (item.lotNo && !lotOptions.includes(item.lotNo)) {
        lotOptions = [...lotOptions, item.lotNo];
    }

    if (item.yarnCount && !countOptions.includes(item.yarnCount)) {
        countOptions = [...countOptions, item.yarnCount];
    }

    // ALL PI numbers; the balance is shown when the chosen Lot + Count has one
    const basePiOptions = isDefault
        ? []
        : getAllPis(inventory).map((piNo) => ({
            piNo,
            totalQuantity:
                item.lotNo && item.yarnCount
                    ? inventory.find(
                        (entry) =>
                            entry.piNo === piNo &&
                            entry.lotNo === item.lotNo &&
                            entry.yarnCount === item.yarnCount
                    )?.totalQuantity ?? null
                    : null,
        }));

    const piOptions =
        !isDefault &&
        item.piNo &&
        !basePiOptions.some((entry) => entry.piNo === item.piNo)
            ? [...basePiOptions, { piNo: item.piNo, totalQuantity: null }]
            : basePiOptions;

    const hasFullKey = Boolean(
        item.piNo && item.lotNo && item.yarnCount && !isDefault
    );

    const hasEntry =
        hasFullKey &&
        hasInventoryEntry(inventory, item.piNo, item.lotNo, item.yarnCount);

    // PI + Lot + Count picked together but not found in the list
    const noMatch = hasFullKey && !hasEntry && !loading && !hasYd;

    const availableQty = hasEntry
        ? getAvailableQty(inventory, item.piNo, item.lotNo, item.yarnCount)
        : null;

    const usedQty = hasFullKey
        ? usage?.get(inventoryKey(item.piNo, item.lotNo, item.yarnCount)) ?? 0
        : 0;

    const isOver = availableQty !== null && usedQty > availableQty;
    const usedPercent =
        availableQty && availableQty > 0
            ? Math.min(100, (usedQty / availableQty) * 100)
            : 0;

    const noStock = !loading && inventory.length === 0;

    return (
        <>
            <div className="min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    Lot No {!hasYd && <span className="text-red-500">*</span>}
                </label>
                <select
                    value={item.lotNo}
                    disabled={loading || (noStock && !noLots) || hasYd}
                    onChange={(e) => onChange("lotNo", e.target.value)}
                    className={SELECT_CLASS}
                >
                    <option value="">
                        {loading ? "Loading..." : "Select lot"}
                    </option>
                    {lotOptions.map((lotNo) => (
                        <option key={lotNo} value={lotNo}>
                            {lotNo}
                        </option>
                    ))}
                </select>
            </div>

            {showYdBatch && (
                <div className="min-w-0">
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                        Y/D Batch {!item.lotNo && <span className="text-red-500">*</span>}
                    </label>
                    <select
                        value={item.ydBatch ?? ""}
                        disabled={
                            Boolean(item.lotNo) ||
                            ydBatchLoading ||
                            (ydOptions.length === 0 && !item.ydBatch)
                        }
                        onChange={(e) => onChange("ydBatch", e.target.value)}
                        className={SELECT_CLASS}
                    >
                        <option value="">
                            {item.lotNo
                                ? "Clear lot to use"
                                : ydBatchLoading
                                    ? "Loading..."
                                    : ydOptions.length === 0
                                        ? "No Y/D batch for this job"
                                        : "Select Y/D batch"}
                        </option>
                        {ydOptions.map((batch) => (
                            <option key={batch} value={batch}>
                                {ydLabel(batch)}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className={showYdBatch ? "col-span-2 min-w-0" : "min-w-0"}>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    Yarn Count <span className="text-red-500">*</span>
                </label>
                <select
                    value={item.yarnCount}
                    disabled={loading || (noStock && !hasYd && !noLots)}
                    onChange={(e) => onChange("yarnCount", e.target.value)}
                    className={SELECT_CLASS}
                >
                    <option value="">
                        {loading ? "Loading..." : "Select count"}
                    </option>
                    {countOptions.map((count) => (
                        <option key={count} value={count}>
                            {count}
                        </option>
                    ))}
                </select>
            </div>

            <div className="col-span-2 min-w-0">
                <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    PI No {!hasYd && <span className="text-red-500">*</span>}
                </label>

                {isDefault ? (
                    // Default lot / count always carry the default PI
                    <input
                        type="text"
                        value={DEFAULT_PI}
                        disabled
                        readOnly
                        className={SELECT_CLASS}
                    />
                ) : (
                    <select
                        value={item.piNo}
                        disabled={loading || hasYd || piOptions.length === 0}
                        onChange={(e) => onChange("piNo", e.target.value)}
                        className={SELECT_CLASS}
                    >
                        <option value="">
                            {hasYd ? "Not needed for Y/D batch" : "Select PI No"}
                        </option>
                        {piOptions.map((entry) => (
                            <option key={entry.piNo} value={entry.piNo}>
                                {entry.piNo}
                                {entry.totalQuantity !== null
                                    ? ` — ${entry.totalQuantity.toLocaleString()} KG`
                                    : ""}
                            </option>
                        ))}
                    </select>
                )}

                {noMatch && (
                    <p className="mt-1 text-[11px] font-medium text-amber-600">
                        This PI has no available qty for the selected Lot + Count.
                    </p>
                )}

                {availableQty !== null && (
                    <div className="mt-2">
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                                className={`h-full rounded-full transition-all ${isOver ? "bg-red-500" : usedPercent > 85 ? "bg-amber-500" : "bg-emerald-500"}`}
                                style={{ width: `${usedPercent}%` }}
                            />
                        </div>
                        <p
                            className={`mt-1 text-[11px] ${isOver ? "font-medium text-red-600" : "text-slate-500"}`}
                        >
                            {isOver
                                ? `Over by ${formatKg(usedQty - availableQty)} KG. `
                                : ""}
                            {formatKg(usedQty)} of {formatKg(availableQty)} KG used in this order
                        </p>
                    </div>
                )}
            </div>
        </>
    );
};

// ---------------------------------------------------------
// One line card (used for work order lines AND yarn colors)
// ---------------------------------------------------------
const CARD_ACCENTS = [
    "border-l-emerald-500",
    "border-l-amber-500",
    "border-l-sky-500",
    "border-l-rose-500",
    "border-l-violet-500",
    "border-l-teal-500",
];

const BADGE_ACCENTS = [
    "bg-emerald-50 text-emerald-700",
    "bg-amber-50 text-amber-700",
    "bg-sky-50 text-sky-700",
    "bg-rose-50 text-rose-700",
    "bg-violet-50 text-violet-700",
    "bg-teal-50 text-teal-700",
];

const IconButton = ({ title, onClick, disabled, danger, children }) => (
    <button
        type="button"
        title={title}
        aria-label={title}
        onClick={onClick}
        disabled={disabled}
        className={`flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 ${danger
            ? "hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            : "hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800"
            }`}
    >
        {children}
    </button>
);

const LineCard = ({
    position,
    label,
    isMain,
    isPrefilled,
    canRemove,
    onDuplicate,
    onRemove,
    amount,
    children,
}) => {
    const accentIndex = Math.max(0, position - 1) % CARD_ACCENTS.length;

    return (
        <div
            className={`flex flex-col rounded-xl border bg-white transition hover:shadow-md ${isMain
                ? "border-indigo-200 bg-gradient-to-b from-indigo-50/70 to-white shadow-sm ring-1 ring-indigo-100"
                : `border-slate-200 border-l-4 ${CARD_ACCENTS[accentIndex]}`
                }`}
        >
            <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
                <div className="flex items-center gap-2">
                    <span
                        className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md px-1.5 text-xs font-bold ${isMain
                            ? "bg-indigo-600 text-white"
                            : BADGE_ACCENTS[accentIndex]
                            }`}
                    >
                        {position}
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                        {isMain ? `${label} (main)` : label}
                    </span>

                    {isPrefilled && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                            <Sparkles size={10} />
                            Auto-filled
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    <IconButton
                        title="Duplicate with same lot, count and PI"
                        onClick={onDuplicate}
                    >
                        <Copy size={13} />
                    </IconButton>

                    {canRemove && (
                        <IconButton title="Remove" onClick={onRemove} danger>
                            <X size={14} />
                        </IconButton>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 px-3.5 pb-3 pt-3">
                {children}
            </div>

            <div className="mt-auto flex items-center justify-between rounded-b-xl border-t border-slate-100 bg-slate-50/70 px-3.5 py-2 text-[11px] text-slate-500">
                <span>Line amount</span>
                <span className="font-semibold tabular-nums text-slate-800">
                    {formatMoney(amount)} BDT
                </span>
            </div>
        </div>
    );
};

// ---------------------------------------------------------
// Lines board: main line on the left, extra lines beside it in a
// swipeable rail, with an add tile at the end of the rail.
// Works for every order type (lots for knitting / AOP / dyeing,
// colors for yarn dyeing).
// ---------------------------------------------------------
const LinesBoard = ({
    items,
    isYarnDyeing,
    unitPrice,
    inventory,
    loading,
    usage,
    noLots = false,
    restrictedNote = "",
    showYdBatch = false,
    ydLots = [],
    ydBatchLoading = false,
    onAdd,
    onChange,
    onRemove,
    onDuplicate,
}) => {
    const railRef = useRef(null);
    const previousLength = useRef(items.length);

    // Scroll the rail to the newest card after "Add"
    useEffect(() => {
        if (items.length > previousLength.current && railRef.current) {
            railRef.current.scrollTo({
                left: railRef.current.scrollWidth,
                behavior: "smooth",
            });
        }
        previousLength.current = items.length;
    }, [items.length]);

    const label = isYarnDyeing ? "Color" : "Line";
    const canRemove = items.length > 1;

    const getQty = (item) =>
        isYarnDyeing ? toNum(item.qty) : toNum(item.workOrderQty);

    const getAmount = (item) =>
        isYarnDyeing
            ? toNum(item.qty) * toNum(item.price)
            : toNum(item.workOrderQty) * toNum(unitPrice);

    const totalQty = items.reduce((sum, item) => sum + getQty(item), 0);
    const totalAmount = items.reduce((sum, item) => sum + getAmount(item), 0);

    const renderFields = (item, itemIndex) => (
        <>
            {isYarnDyeing && (
                <div className="col-span-2">
                    <Input
                        label="Booking Color"
                        placeholder="Yarn booking color"
                        value={item.color}
                        onChange={(e) =>
                            onChange(itemIndex, "color", e.target.value)
                        }
                        required
                        isShowOutLabel
                    />
                </div>
            )}

            <div className={isYarnDyeing ? "" : "col-span-2"}>
                <Input
                    label={isYarnDyeing ? "Qty (KG)" : "Work Order Qty (KG)"}
                    placeholder="Qty"
                    value={isYarnDyeing ? item.qty : item.workOrderQty}
                    onChange={(e) =>
                        onChange(
                            itemIndex,
                            isYarnDyeing ? "qty" : "workOrderQty",
                            e.target.value
                        )
                    }
                    required
                    isShowOutLabel
                />
            </div>

            {isYarnDyeing && (
                <div>
                    <Input
                        label="Price Per Kg"
                        placeholder="Unit Price"
                        value={item.price}
                        onChange={(e) =>
                            onChange(itemIndex, "price", e.target.value)
                        }
                        required
                        isShowOutLabel
                    />
                </div>
            )}

            <LotCountPiFields
                item={item}
                inventory={inventory}
                loading={loading}
                usage={usage}
                noLots={noLots}
                showYdBatch={showYdBatch}
                ydLots={ydLots}
                ydBatchLoading={ydBatchLoading}
                onChange={(field, value) => onChange(itemIndex, field, value)}
            />
        </>
    );

    const [mainItem, ...extraItems] = items;

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            {/* Board header */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h5 className="text-sm font-semibold text-slate-800">
                        {isYarnDyeing
                            ? "Yarn colors, lots and quantities"
                            : "Lots, yarn counts and quantities"}
                    </h5>
                    <p className="mt-0.5 text-xs text-slate-500">
                        Need another lot or count? Add a {label.toLowerCase()} and it
                        appears right beside the main one.
                    </p>

                    {restrictedNote && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-indigo-600">
                            <Sparkles size={12} className="shrink-0" />
                            {restrictedNote}
                        </p>
                    )}

                    {noLots && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-600">
                            <AlertCircle size={12} className="shrink-0" />
                            No lot or yarn count found for this job. {DEFAULT_LOT},{" "}
                            {DEFAULT_COUNT} and {DEFAULT_PI} are used.
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {items.length} {items.length === 1 ? label.toLowerCase() : `${label.toLowerCase()}s`}
                    </span>

                    <button
                        type="button"
                        onClick={onAdd}
                        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 active:scale-[0.98]"
                    >
                        <Plus size={14} />
                        Add {label.toLowerCase()}
                    </button>
                </div>
            </div>

            {/* Main card + rail */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
                <div className="w-full shrink-0 lg:w-[320px]">
                    <LineCard
                        position={1}
                        label={label}
                        isMain
                        isPrefilled={Boolean(mainItem.prefilled)}
                        canRemove={canRemove}
                        onDuplicate={() => onDuplicate(0)}
                        onRemove={() => onRemove(0)}
                        amount={getAmount(mainItem)}
                    >
                        {renderFields(mainItem, 0)}
                    </LineCard>
                </div>

                <div
                    ref={railRef}
                    className="flex min-w-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]"
                >
                    {extraItems.map((item, extraIndex) => {
                        const itemIndex = extraIndex + 1;

                        return (
                            <div
                                key={item.uid ?? itemIndex}
                                className="w-[300px] shrink-0 snap-start"
                            >
                                <LineCard
                                    position={itemIndex + 1}
                                    label={label}
                                    isPrefilled={Boolean(item.prefilled)}
                                    canRemove={canRemove}
                                    onDuplicate={() => onDuplicate(itemIndex)}
                                    onRemove={() => onRemove(itemIndex)}
                                    amount={getAmount(item)}
                                >
                                    {renderFields(item, itemIndex)}
                                </LineCard>
                            </div>
                        );
                    })}

                    <button
                        type="button"
                        onClick={onAdd}
                        className={`group flex min-h-[200px] snap-start flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white/60 px-4 text-center transition hover:border-indigo-400 hover:bg-indigo-50/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${extraItems.length === 0 ? "flex-1" : "w-[200px] shrink-0"
                            }`}
                    >
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-indigo-600 group-hover:text-white">
                            <Plus size={20} />
                        </span>
                        <span className="text-sm font-semibold text-slate-700">
                            Add another {label.toLowerCase()}
                        </span>
                        <span className="max-w-[200px] text-[11px] leading-4 text-slate-400">
                            {isYarnDyeing
                                ? "A new color with its own qty, price, lot, count and PI"
                                : "A new lot, yarn count, PI and qty for this composition"}
                        </span>
                    </button>
                </div>
            </div>

            {/* Board totals */}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-slate-200 pt-3 text-xs text-slate-500">
                <span>
                    Composition total:{" "}
                    <span className="font-semibold tabular-nums text-slate-800">
                        {formatKg(totalQty)} KG
                    </span>
                </span>

                <span>
                    Amount:{" "}
                    <span className="font-semibold tabular-nums text-slate-800">
                        {formatMoney(totalAmount)} BDT
                    </span>
                </span>
            </div>
        </div>
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

    // Right-side summary panel.
    // Pinned (default on every visit) = docked beside the form, exactly like
    // the first screen. Unpinned = collapsed behind an edge tab and opened
    // as a slide-over drawer whenever the user wants to see more.
    const [isSummaryPinned, setIsSummaryPinned] = useState(true);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);

    const handleToggleSummaryPin = () => {
        setIsSummaryPinned((prev) => !prev);
        setIsSummaryOpen(false);
    };

    // Escape closes the slide-over drawer
    useEffect(() => {
        if (!isSummaryOpen) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === "Escape") setIsSummaryOpen(false);
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isSummaryOpen]);

    // Lots from /api/lots-work-orders/:orderType (loaded per order type + job):
    //  - lotsAndCounts: the lots to choose from, one entry per PI + Lot + Count
    //    with its available qty:
    //      * first time in this job: the full yarn stock
    //      * the job already has a knitting / yarn dyeing order: ONLY the lots
    //        of the first (base) order, qty = base qty - qty already used by
    //        earlier orders of this type
    //  - ydLots: yarn dyeing lots booked for this job (knitting only)
    //  - jobLots: lots + counts (+ PI numbers) already used by any work order
    //    of this job (AOP + dyeing)
    //  - prefill: the base order's lot / count / PI / remaining qty per composition
    //  - lotSource: { restricted, baseOrderType } for the loaded order type + job
    const [lotsAndCounts, setLotsAndCounts] = useState([]);
    const [ydLots, setYdLots] = useState([]);
    const [jobLots, setJobLots] = useState([]);
    const [prefill, setPrefill] = useState(EMPTY_PREFILL);
    const [lotSource, setLotSource] = useState(EMPTY_LOT_SOURCE);
    const [isLotsAndCountsLoading, setIsLotsAndCountsLoading] = useState(false);
    const [lotQtyAlert, setLotQtyAlert] = useState("");

    // Refs
    const redirectTimerRef = useRef(null);
    // Synchronous lock against fast double clicks
    const submitLockRef = useRef(false);
    const searchBoxRef = useRef(null);
    // Every fetched prefill gets a new version; each version is applied once
    const prefillVersionRef = useRef(0);
    const appliedPrefillVersionRef = useRef(0);

    // ===== AUTO-FIT (screen size) REFS + STATE =====
    const topRef = useRef(null);              // page header, watched for size changes
    const scrollContainerRef = useRef(null);  // the box that fills the screen
    // invisible element pinned to the screen: its bottom edge = the bottom of the visible screen
    const viewportProbeRef = useRef(null);
    const [fit, setFit] = useState({ height: 560, width: 1400 });
    // ===============================================

    const [formData, setFormData] = useState({
        workOrderPlaceDate: getYesterdayISO(),
        workOrderNo: "",
        month: "",
        salesContractNo: "",
        buyer: "",
        jobNo: "",
        poNo: "",
        style: "",
        orderType: "",
        factoryName: "",
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

    // ===== AUTO-FIT MEASURING (same logic as Summary) =====
    // Box height = (bottom of the visible screen - top of the box) - space kept free under the box.
    // Nothing is hard-coded: a bigger screen gives a taller box, a smaller screen gives a shorter one.
    // Everything is measured with getBoundingClientRect (one single coordinate space), so it works the same with the
    // ERP zoom (67% / 100% / ...), browser zoom, phones and tablets.
    const measureFit = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();

        // zoom factor measured from the box: rendered height / the CSS height we gave it
        const applied = parseFloat(el.style.height);
        let k = applied > 0 && rect.height > 0 ? rect.height / applied : getZoomScale(el);
        if (!(k > 0.2 && k < 5)) k = 1;

        // bottom of the visible screen (same coordinate space as `rect`)
        const probe = viewportProbeRef.current;
        const probeRect = probe ? probe.getBoundingClientRect() : null;
        const viewH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        const viewportBottom = probeRect && probeRect.height > 0 ? probeRect.bottom : viewH;

        // box top measured from the very top of the content, no matter how far the page / the ERP panel is scrolled
        const docTop = document.documentElement.getBoundingClientRect().top;
        let top = rect.top - docTop;
        if (document.body.scrollTop) top += document.body.scrollTop * k;
        let node = el.parentElement;
        while (node && node !== document.body && node !== document.documentElement) {
            if (node.scrollTop) top += node.scrollTop * k;
            node = node.parentElement;
        }

        const height = Math.max(MIN_TABLE_HEIGHT, Math.floor((viewportBottom - top) / k - BOTTOM_RESERVE));
        const width = el.clientWidth;
        setFit((prev) => (prev.height === height && prev.width === width ? prev : { height, width }));
    }, []);

    // measure on mount, window resize, and whenever the page / the area above the box changes size
    useLayoutEffect(() => {
        measureFit();
        // the ERP shell / fonts / images can still move things after the first paint: measure again a bit later
        const t1 = setTimeout(measureFit, 100);
        const t2 = setTimeout(measureFit, 500);
        const t3 = setTimeout(measureFit, 1500);
        window.addEventListener("resize", measureFit);
        window.addEventListener("orientationchange", measureFit);
        window.addEventListener("load", measureFit);
        if (window.visualViewport) window.visualViewport.addEventListener("resize", measureFit);

        // the ERP zoom control changes a style / class on <html> or <body> without resizing anything: catch that too
        let mo = null;
        if (typeof MutationObserver !== "undefined") {
            mo = new MutationObserver(() => measureFit());
            mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
            mo.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
        }
        // safety net: cheap re-check (state only changes when the number really changes)
        const poll = setInterval(measureFit, 800);
        let ro = null;
        if (typeof ResizeObserver !== "undefined") {
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
            window.removeEventListener("resize", measureFit);
            window.removeEventListener("orientationchange", measureFit);
            window.removeEventListener("load", measureFit);
            if (window.visualViewport) window.visualViewport.removeEventListener("resize", measureFit);
            if (ro) ro.disconnect();
        };
        // re-run when loading finishes, because the box only exists after that
    }, [measureFit, isLoading, styleData]);
    // ======================================================

    const showNotification = useCallback((message, type = "success") => {
        setToastMessage(message);
        setToastType(type);
        setToastId((prev) => prev + 1);
        setShowToast(true);
    }, []);

    // Load the lots for the selected order type + job.
    // Reloaded after a successful save so the available qty stays current.
    // The backend decides what is offered:
    //  - the job has no knitting / yarn dyeing order yet  -> the full yarn stock
    //  - the job already has one (the base order)         -> only its lots, with
    //    base qty minus what earlier orders of this type used, plus `prefill`
    //    (the remaining base qty per composition)
    // Knitting also gets the yarn dyeing lots of the job (Y/D batches).
    useEffect(() => {
        if (!orderType || !activeJobNo) {
            setLotsAndCounts([]);
            setYdLots([]);
            setJobLots([]);
            setPrefill(EMPTY_PREFILL);
            setLotSource(EMPTY_LOT_SOURCE);
            setIsLotsAndCountsLoading(false);
            return undefined;
        }

        let isMounted = true;
        const controller = new AbortController();
        const loadKey = `${activeJobNo}|${orderType}`;

        const toList = (value) => (Array.isArray(value) ? value : []);

        const fetchLots = async () => {
            setIsLotsAndCountsLoading(true);
            setLotsAndCounts([]);
            setYdLots([]);
            setJobLots([]);
            setPrefill(EMPTY_PREFILL);
            setLotSource(EMPTY_LOT_SOURCE);

            try {
                const response = await axiosPrivate.get(
                    `/api/lots-work-orders/${encodeURIComponent(orderType)}`,
                    {
                        params: { jobNo: activeJobNo },
                        signal: controller.signal,
                    }
                );

                if (!isMounted) return;

                const body = response.data ?? {};
                const isCompactType = Boolean(getRules(orderType).compact);

                setLotsAndCounts(
                    toList(body.data)
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
                        // the default lot / count / PI have no stock bucket
                        .filter(
                            (item) =>
                                item.lotNo !== DEFAULT_LOT &&
                                item.yarnCount !== DEFAULT_COUNT &&
                                item.piNo !== DEFAULT_PI
                        )
                );

                setYdLots(
                    toList(body.ydLots)
                        .map((item) => ({
                            ydBatch: String(item?.ydBatch ?? item?.lotNo ?? "").trim(),
                            yarnCount: String(item?.yarnCount ?? "").trim(),
                            colors: toList(item?.colors)
                                .map((color) => String(color).trim())
                                .filter(Boolean),
                            bookedQuantity: toNum(item?.bookedQuantity),
                        }))
                        .filter((item) => item.ydBatch)
                );

                setJobLots(
                    toList(body.jobLots)
                        .map((item) => ({
                            lotNo: String(item?.lotNo ?? "").trim(),
                            yarnCount: String(item?.yarnCount ?? "").trim(),
                            // PI numbers of this lot + count (single `piNo` or a `piNos` list)
                            piNos: uniqSorted(
                                [item?.piNo, ...toList(item?.piNos)]
                                    .map((pi) => String(pi ?? "").trim())
                                    .filter(Boolean)
                            ),
                            sources: toList(item?.sources),
                            styleRequirementRowIds: toList(item?.styleRequirementRowIds)
                                .map(Number)
                                .filter(Number.isFinite),
                        }))
                        .filter((item) => item.lotNo)
                );

                // Is the list limited to the job's base order?
                setLotSource({
                    key: loadKey,
                    restricted: Boolean(body.restricted),
                    baseOrderType: body.baseOrderType ?? null,
                });

                // Values of the base order (selected automatically)
                const prefillBody = body.prefill ?? {};
                prefillVersionRef.current += 1;

                setPrefill({
                    key: loadKey,
                    version: prefillVersionRef.current,
                    sourceOrderType: prefillBody.sourceOrderType ?? null,
                    rows: toList(prefillBody.rows)
                        .map((item) => ({
                            styleRequirementRowId: Number(item?.styleRequirementRowId),
                            lines: toList(item?.lines)
                                .map((line) => ({
                                    lotNo: str(line?.lotNo),
                                    yarnCount: str(line?.yarnCount),
                                    piNo: str(line?.piNo),
                                    qty: toNum(line?.qty),
                                }))
                                .filter((line) => line.lotNo)
                                // AOP / Dyeing never use the default lot / count / PI
                                .filter(
                                    (line) =>
                                        !isCompactType ||
                                        (line.lotNo !== DEFAULT_LOT &&
                                            line.yarnCount !== DEFAULT_COUNT &&
                                            line.piNo !== DEFAULT_PI)
                                ),
                        }))
                        .filter(
                            (item) =>
                                Number.isFinite(item.styleRequirementRowId) &&
                                item.lines.length > 0
                        ),
                });

                // Stock that could not be matched: useful for the admin, not the user
                if (toList(body.warnings).length > 0) {
                    console.warn("Yarn stock warnings:", body.warnings);
                }
            } catch (error) {
                if (controller.signal.aborted || error?.code === "ERR_CANCELED") return;

                console.error("Failed to fetch available lots and yarn counts:", error);
                if (isMounted) {
                    setLotsAndCounts([]);
                    setYdLots([]);
                    setJobLots([]);
                    setPrefill(EMPTY_PREFILL);
                    setLotSource({ key: loadKey, restricted: false, baseOrderType: null });
                    showNotification(
                        error?.response?.data?.message || "Failed to load available lots and yarn counts",
                        "error"
                    );
                }
            } finally {
                if (isMounted) setIsLotsAndCountsLoading(false);
            }
        };

        fetchLots();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [axiosPrivate, showNotification, reloadKey, orderType, activeJobNo]);

    // TRUE when the loaded job has no lot / yarn count to choose from.
    // Then DEFAULT LOT, DEFAULT COUNT and DEFAULT PI are selected automatically.
    //  - the list is limited to the base order: never (its lots are the only choice)
    //  - knitting:       no raw stock AND no Y/D batch (a Y/D batch is a real choice)
    //  - yarn dyeing:    no raw stock
    //  - AOP / dyeing:   never use the defaults
    const noLotsFound = useMemo(() => {
        if (!orderType || !activeJobNo || isLotsAndCountsLoading) return false;

        // wait until the lots of THIS order type + job have been loaded
        if (lotSource.key !== `${activeJobNo}|${orderType}`) return false;

        // limited to the base order's lots
        if (lotSource.restricted) return false;

        // AOP / Dyeing never use the defaults
        if (getRules(orderType).compact) return false;

        if (orderType === "knittingOrder") {
            return lotsAndCounts.length === 0 && ydLots.length === 0;
        }

        return lotsAndCounts.length === 0;
    }, [
        orderType,
        activeJobNo,
        isLotsAndCountsLoading,
        jobLots,
        lotsAndCounts,
        ydLots,
        lotSource,
    ]);

    // Keeps the Lot / Count / PI of every line in step with what the job really has:
    //  - nothing found      -> DEFAULT LOT / DEFAULT COUNT / DEFAULT PI are selected
    //  - real lots found    -> defaults are cleared (AOP / dyeing keep a default the
    //                          user picked)
    // It only fills empty values and clears defaults, so it never overwrites a
    // choice the user makes afterwards.
    useEffect(() => {
        setRows((prev) =>
            syncDefaultLots(prev, orderType, noLotsFound)
        );
    }, [lotsAndCounts, orderType, noLotsFound]);

    // Auto-select the lot / yarn count / PI / qty of the job's BASE work order
    // (composition by composition). Declared AFTER the sync effect above,
    // so the base order's values win over the defaults.
    // Each fetched prefill is applied once and never overwrites typed values.
    useEffect(() => {
        if (!orderType || !activeJobNo || isLotsAndCountsLoading) return;
        if (!prefill.version || prefill.key !== `${activeJobNo}|${orderType}`) return;
        if (appliedPrefillVersionRef.current === prefill.version) return;

        appliedPrefillVersionRef.current = prefill.version;

        setRows((prev) => applyPrefillToRows(prev, prefill, orderType));
    }, [prefill, orderType, activeJobNo, isLotsAndCountsLoading]);

    // Initial values for a NEW line / color (defaults when nothing was found)
    const newLineInit = noLotsFound
        ? { lotNo: DEFAULT_LOT, yarnCount: DEFAULT_COUNT, piNo: DEFAULT_PI }
        : {};

    // ---------------------------------------------------------
    // Apply selected style data to the form
    // ---------------------------------------------------------
    const applyStyleData = useCallback((style) => {
        if (!style) return;

        setStyleData(style);
        setFormError("");
        setIsSaved(false);

        setFormData({
            workOrderPlaceDate: getYesterdayISO(),
            workOrderNo: "",
            month: "",
            salesContractNo: style.salesContractNo || "",
            buyer: style.buyerName || "",
            jobNo: style.jobNo || "",
            poNo: style.poNo || "",
            style: style.styleNo || "",
            orderType: "",
            factoryName: "",
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
        const styleLoss = styleData?.processLoss;

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

    // How many lines were filled automatically (drives the info banner)
    const prefilledLineCount = useMemo(() => {
        if (!orderType) return 0;

        return rows.reduce((sum, row) => {
            const list = orderType === "yarnDyeingOrder" ? row.yarnColors : row.lots;

            return sum + (list ?? []).filter((item) => item.prefilled).length;
        }, 0);
    }, [rows, orderType]);

    // Live usage per PI + Lot + Count across ALL lines / colors of this order
    // (default lot lines have no stock bucket, so they never count here)
    const bucketUsage = useMemo(() => {
        const usage = new Map();

        const add = (item, qty) => {
            if (!item.piNo || !item.lotNo || !item.yarnCount) return;
            if (isDefaultItem(item)) return;

            const key = inventoryKey(item.piNo, item.lotNo, item.yarnCount);
            usage.set(key, (usage.get(key) ?? 0) + toNum(qty));
        };

        rows.forEach((row) => {
            if (orderType === "yarnDyeingOrder") {
                (row.yarnColors ?? []).forEach((item) => add(item, item.qty));
            } else {
                (row.lots ?? []).forEach((item) => add(item, item.workOrderQty));
            }
        });

        return usage;
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

            // Defaults and auto-filled lines of the previous order type must not
            // follow the user into the new one (defaults are filled again by the
            // sync effect when the new order type really has no lots, and the
            // base order's values are selected again by the prefill effect).
            setRows((prev) => resetPrefilledLines(clearDefaultLotValues(prev)));

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

            // Compact design (AOP / Dyeing) has exactly one set of details
            if (getRules(value).compact) {
                setRows((prev) =>
                    prev.map((row) => ({
                        ...row,
                        lots: row.lots?.length
                            ? [row.lots[0]]
                            : [defaultLot()],
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

    const handleSelectOrderType = (value) => {
        if (isBusy) return;
        handleChange({ target: { name: "orderType", value } });
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

        const fresh = syncDefaultLots(
            buildRowsFromStyle(styleData),
            orderType,
            noLotsFound
        );

        // Restored compositions get the base work order's values again
        const restored =
            orderType && prefill.key === `${activeJobNo}|${orderType}`
                ? applyPrefillToRows(fresh, prefill, orderType)
                : fresh;

        setRows(restored);
        setFormError("");

        showNotification("Compositions restored", "success");
    }, [styleData, orderType, noLotsFound, prefill, activeJobNo, showNotification]);

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
                    ? {
                        ...row,
                        lots: [...(row.lots ?? []), defaultLot(newLineInit)],
                    }
                    : row
            )
        );
    };

    // Copies lot / count / PI into a new line right after the source line
    const handleDuplicateLot = (rowIndex, lotIndex) => {
        setFormError("");

        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                const current = row.lots ?? [];
                const source = current[lotIndex];

                if (!source) return row;

                const copy = defaultLot({
                    lotNo: source.lotNo,
                    ydBatch: source.ydBatch,
                    yarnCount: source.yarnCount,
                    piNo: source.piNo,
                });

                return {
                    ...row,
                    lots: [
                        ...current.slice(0, lotIndex + 1),
                        copy,
                        ...current.slice(lotIndex + 1),
                    ],
                };
            })
        );
    };

    const handleLotChange = (rowIndex, lotIndex, field, value) => {
        setFormError("");
        setLotQtyAlert("");

        const updateLot = (lot) => {
            // Knitting: picking a Y/D batch replaces the raw lot + PI
            // and fills the yarn count when the batch has only one.
            if (field === "ydBatch") {
                if (!value) return { ...lot, ydBatch: "" };

                const counts = getYdCounts(ydLots, value);

                return {
                    ...lot,
                    ydBatch: value,
                    lotNo: "",
                    piNo: "",
                    yarnCount: counts.includes(lot.yarnCount)
                        ? lot.yarnCount
                        : counts.length === 1
                            ? counts[0]
                            : "",
                };
            }

            if (
                INVENTORY_FIELDS.has(field) &&
                !getRules(orderType).compact &&
                !lot.ydBatch
            ) {
                return applyInventoryChange(lot, field, value);
            }

            return {
                ...lot,
                [field]: NUMERIC_LOT_FIELDS.has(field)
                    ? sanitizeDecimal(value)
                    : value,
            };
        };

        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                return {
                    ...row,
                    lots: (row.lots ?? [defaultLot()]).map((lot, li) =>
                        li === lotIndex
                            // an edited line is no longer "auto-filled"
                            ? { ...updateLot(lot), prefilled: false }
                            : lot
                    ),
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
                            defaultYarnColor(newLineInit),
                        ],
                    }
                    : row
            )
        );
    };

    // Copies price / lot / count / PI into a new color right after the source
    const handleDuplicateYarnColor = (rowIndex, colorIndex) => {
        setFormError("");

        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                const current = row.yarnColors ?? [];
                const source = current[colorIndex];

                if (!source) return row;

                const copy = defaultYarnColor({
                    price: source.price,
                    lotNo: source.lotNo,
                    yarnCount: source.yarnCount,
                    piNo: source.piNo,
                });

                return {
                    ...row,
                    yarnColors: [
                        ...current.slice(0, colorIndex + 1),
                        copy,
                        ...current.slice(colorIndex + 1),
                    ],
                };
            })
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

        const updateColor = (color) => {
            if (INVENTORY_FIELDS.has(field)) {
                return applyInventoryChange(color, field, value);
            }

            return {
                ...color,
                [field]: NUMERIC_YARN_FIELDS.has(field)
                    ? sanitizeDecimal(value)
                    : value,
            };
        };

        setRows((prev) =>
            prev.map((row, i) => {
                if (i !== rowIndex) return row;

                return {
                    ...row,
                    yarnColors: (row.yarnColors ?? [defaultYarnColor()]).map(
                        (color, ci) =>
                            ci === colorIndex
                                // an edited color is no longer "auto-filled"
                                ? { ...updateColor(color), prefilled: false }
                                : color
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
        const isCompact = Boolean(rules.compact);

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

        // Knitting after a yarn dyeing order: requested qty per Y/D batch + count
        const requestedByYd = new Map();

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            if (!row.composition || !row.color) {
                return fail(
                    `Composition and Color are required for Composition ${i + 1}`
                );
            }

            if (isCompact) {
                // AOP / Dyeing: one set of details per composition
                const lot = row.lots?.[0] ?? {};
                const where = `Composition ${i + 1}`;
                const usesDefault = isDefaultItem(lot);

                if (!(toNum(row.unitPrice) > 0)) {
                    return fail(`Price Per Kg must be greater than 0 for ${where}`);
                }

                if (!(toNum(lot.workOrderQty) > 0)) {
                    return fail(`Work Order Qty must be greater than 0 for ${where}`);
                }

                if (!String(lot.yarnCount ?? "").trim()) {
                    return fail(`Yarn Count is required for ${where}`);
                }

                if (!String(lot.lotNo ?? "").trim()) {
                    return fail(`Yarn Lot is required for ${where}`);
                }

                // PI No is required. Default lot / count carry DEFAULT PI automatically.
                if (!getPiForPayload(lot)) {
                    return fail(`PI No is required for ${where}`);
                }

                if (!String(row.stichLength ?? "").trim()) {
                    return fail(`Stitch Length is required for ${where}`);
                }

                // Check the available qty only when this PI really exists in the
                // list (a PI typed by hand has no balance to compare against).
                if (!usesDefault) {
                    const piNo = String(lot.piNo).trim();
                    const lotNo = String(lot.lotNo).trim();
                    const yarnCount = String(lot.yarnCount).trim();

                    if (hasInventoryEntry(lotsAndCounts, piNo, lotNo, yarnCount)) {
                        addRequested(piNo, lotNo, yarnCount, toNum(lot.workOrderQty));
                    }
                }
            } else if (!isYD) {
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

                    const usesYdBatch =
                        orderType === "knittingOrder" &&
                        String(lot.ydBatch ?? "").trim() !== "";

                    // Default lot / count: DEFAULT PI, no stock bucket
                    const usesDefault = isDefaultItem(lot);
                    const skipStock = usesYdBatch || usesDefault;

                    if (rules.lotNo && !usesYdBatch && !String(lot.lotNo).trim()) {
                        return fail(
                            orderType === "knittingOrder"
                                ? `Lot No or Y/D Batch is required for ${where}`
                                : `Lot No is required for ${where}`
                        );
                    }

                    if (rules.yarnCount && !String(lot.yarnCount).trim()) {
                        return fail(`Yarn Count is required for ${where}`);
                    }

                    if (!usesYdBatch && !getPiForPayload(lot)) {
                        return fail(`PI No is required for ${where}`);
                    }

                    // Y/D batch lines have no PI bucket. When the job's base order is
                    // the yarn dyeing order, their qty is checked against the booked qty.
                    if (usesYdBatch && lotSource.restricted) {
                        const ydKey = JSON.stringify([
                            str(lot.ydBatch),
                            str(lot.yarnCount),
                        ]);
                        const entry = requestedByYd.get(ydKey) ?? {
                            ydBatch: str(lot.ydBatch),
                            yarnCount: str(lot.yarnCount),
                            requestedQty: 0,
                        };

                        entry.requestedQty += toNum(lot.workOrderQty);
                        requestedByYd.set(ydKey, entry);
                    }

                    // Y/D batch and default lines have no PI stock bucket to check
                    if (!skipStock) {
                        addRequested(
                            String(lot.piNo).trim(),
                            String(lot.lotNo).trim(),
                            String(lot.yarnCount).trim(),
                            toNum(lot.workOrderQty)
                        );
                    }
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
                    const usesDefault = isDefaultItem(yarnColor);

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

                    // PI No is required. Default lot / count carry DEFAULT PI automatically.
                    if (!getPiForPayload(yarnColor)) {
                        return fail(`PI No is required for ${where}`);
                    }

                    if (!usesDefault) {
                        addRequested(
                            String(yarnColor.piNo).trim(),
                            String(yarnColor.lotNo).trim(),
                            String(yarnColor.yarnCount).trim(),
                            toNum(yarnColor.qty)
                        );
                    }
                }
            }
        }

        // Knitting after yarn dyeing: the qty of a Y/D batch cannot exceed what was booked
        for (const requested of requestedByYd.values()) {
            const entry =
                ydLots.find(
                    (item) =>
                        item.ydBatch === requested.ydBatch &&
                        item.yarnCount === requested.yarnCount
                ) ?? ydLots.find((item) => item.ydBatch === requested.ydBatch);

            if (!entry) continue;

            if (requested.requestedQty > entry.bookedQuantity) {
                const message =
                    `Insufficient quantity for Y/D Batch ${requested.ydBatch}` +
                    `${requested.yarnCount ? ` / Yarn Count ${requested.yarnCount}` : ""}. ` +
                    `Available: ${entry.bookedQuantity.toLocaleString()} KG, ` +
                    `Requested: ${requested.requestedQty.toLocaleString()} KG.`;
                setLotQtyAlert(message);
                return fail(message);
            }
        }

        // Combined requested qty of every line / color must fit inside the
        // available qty of that exact PI + Lot + Count.
        if (requestedByBucket.size > 0 && isLotsAndCountsLoading) {
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
                        // DEFAULT PI is sent for default lot / count
                        piNo: getPiForPayload(yc),
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

                // AOP / Dyeing: a single entry per composition, with its PI No
                // (DEFAULT PI for the default lot / count)
                if (getRules(orderType).compact) {
                    const lot = row.lots?.[0] ?? {};

                    return [
                        {
                            ...baseComposition(row),
                            workOrderQty: lot.workOrderQty,
                            unitPrice: row.unitPrice,
                            lotNo: String(lot.lotNo ?? "").trim(),
                            yarnCount: String(lot.yarnCount ?? "").trim(),
                            piNo: getPiForPayload(lot),
                            stichLength: String(row.stichLength ?? "").trim(),
                            machineDia: "",
                            package: String(row.pkg ?? "").trim(),
                            shadePercent: row.shadePercent,
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
                    piNo: getPiForPayload(lot),
                    stichLength: String(row.stichLength ?? "").trim(),
                    machineDia: String(row.machineDia ?? "").trim(),
                    ...(orderType === "knittingOrder"
                        ? { ydBatch: String(lot.ydBatch ?? "").trim() }
                        : {}),
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
                    // Stay on the page and reload the style + lots so
                    // previous work order qty and available qty are current.
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

    const currentRules = getRules(orderType);
    const isYarnDyeing = orderType === "yarnDyeingOrder";
    const isCompact = Boolean(currentRules.compact);

    const totalRequireQty = styleTotals.totalRequireQty.toFixed(2);

    // The lot list is limited to the job's base work order (first knitting / yarn dyeing order)
    const isLimitedToBase =
        Boolean(orderType) &&
        lotSource.restricted &&
        lotSource.key === `${activeJobNo}|${orderType}`;

    const baseOrderLabel = getOrderTypeLabel(lotSource.baseOrderType);
    const currentOrderLabel = getOrderTypeLabel(orderType);

    const restrictedNote = isLimitedToBase
        ? `Limited to the ${baseOrderLabel} work order's lots. Available qty = ${baseOrderLabel} qty minus qty already used by earlier ${currentOrderLabel} work orders.`
        : "";

    // Name of the work order the values were taken from
    const prefillSourceLabel = getOrderTypeLabel(prefill.sourceOrderType);

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

    // Header strip with the pin toggle (shared by docked + drawer modes)
    const summaryHeader = (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <span className="text-xs font-semibold text-slate-700">
                Summary panel
            </span>

            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={handleToggleSummaryPin}
                    aria-pressed={isSummaryPinned}
                    title={
                        isSummaryPinned
                            ? "Unpin: hide this panel until you need it"
                            : "Pin: keep this panel open beside the form"
                    }
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${isSummaryPinned
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                >
                    {isSummaryPinned ? <PinOff size={13} /> : <Pin size={13} />}
                    {isSummaryPinned ? "Unpin" : "Pin"}
                </button>

                {!isSummaryPinned && (
                    <IconButton
                        title="Close panel"
                        onClick={() => setIsSummaryOpen(false)}
                    >
                        <X size={14} />
                    </IconButton>
                )}
            </div>
        </div>
    );

    const sidebarBody = (
        <>
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
                                        Yarn Required Qty
                                        {hasValue(styleData?.processLoss) && (
                                            <span className="text-[11px] text-slate-400">
                                                (+{toNum(styleData.processLoss)}% loss)
                                            </span>
                                        )}
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
        </>
    );

    return (
        <DashboardLayout title="Add New Order">
            {toastElement}

            {/* pb-2 (was pb-24): the box below already ends above the fixed action bar */}
            <div className="pb-2">
                {/* Invisible screen-height probe (used only to measure the bottom of the visible screen) */}
                <div
                    ref={viewportProbeRef}
                    aria-hidden="true"
                    style={{ position: "fixed", top: 0, bottom: 0, left: 0, width: 1, pointerEvents: "none", visibility: "hidden" }}
                />

                {/* Page Header */}
                <div ref={topRef}>
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

                        <button
                            type="button"
                            onClick={handleToggleSummaryPin}
                            aria-pressed={isSummaryPinned}
                            title={
                                isSummaryPinned
                                    ? "Unpin the summary panel"
                                    : "Pin the summary panel"
                            }
                            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition ${isSummaryPinned
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                                }`}
                        >
                            {isSummaryPinned ? <Pin size={13} /> : <PinOff size={13} />}
                            Summary: {isSummaryPinned ? "Pinned" : "Unpinned"}
                        </button>
                    </div>
                </div>
                </div>

                {/* The box height is calculated from the screen: it fills everything under the page header */}
                <div
                    ref={scrollContainerRef}
                    className="overflow-y-auto overflow-x-hidden"
                    style={{ height: fit.height, boxSizing: "border-box" }}
                >
                <div
                    className={`grid grid-cols-1 items-start gap-6 ${isSummaryPinned ? "xl:grid-cols-[minmax(0,1fr)_390px]" : ""}`}
                >
                    {/* Main Content (locked while saving) */}
                    <div
                        className={`min-w-0 space-y-6 ${isBusy ? "pointer-events-none opacity-70" : ""}`}
                        aria-busy={isBusy}
                    >
                        {/* Work Order Details */}
                        <SectionCard
                            icon={ClipboardList}
                            title="Work Order Details"
                            description="Basic identification for this work order"
                        >
                            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
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
                                    type="select"
                                    value={formData.month}
                                    onChange={handleChange}
                                    placeholder="Select Month"
                                    options={MONTH_OPTIONS}
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

                                {/* Order type picker */}
                                <div className="sm:col-span-2 xl:col-span-4">
                                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                                        Order Type <span className="text-red-500">*</span>
                                    </label>

                                    <div
                                        role="radiogroup"
                                        aria-label="Order type"
                                        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                                    >
                                        {ORDER_TYPE_OPTIONS.map((option) => {
                                            const selected = orderType === option.value;

                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={selected}
                                                    onClick={() => handleSelectOrderType(option.value)}
                                                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${selected
                                                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200"
                                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                                        }`}
                                                >
                                                    <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                                                    {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
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
                            <div className="space-y-5">
                                {/* The job already has a base work order: lots are limited to it */}
                                {isLimitedToBase && (
                                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                        <p>
                                            A <span className="font-semibold">{baseOrderLabel}</span> work
                                            order was created first for this job, so only its lots, yarn
                                            counts and PI numbers can be selected. The available qty of a
                                            lot is the {baseOrderLabel} qty minus what earlier{" "}
                                            {currentOrderLabel} work orders already used, and your selected
                                            qty is deducted from it.
                                            {orderType === "knittingOrder" &&
                                                lotSource.baseOrderType === "yarnDyeingOrder" &&
                                                " Pick the Y/D batch on each line."}
                                        </p>
                                    </div>
                                )}

                                {/* Auto-fill info: values taken from the job's base work order */}
                                {prefilledLineCount > 0 && prefillSourceLabel && (
                                    <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs text-indigo-800">
                                        <Sparkles size={14} className="mt-0.5 shrink-0" />
                                        <p>
                                            Lot, yarn count, PI No and qty were selected automatically from the{" "}
                                            <span className="font-semibold">{prefillSourceLabel}</span>{" "}
                                            work order already created for this job. Review them and change
                                            anything you need before saving.
                                        </p>
                                    </div>
                                )}

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
                                    const colorList =
                                        styleRow.yarnColors ?? [defaultYarnColor()];


                                    // AOP / Dyeing: the lots / counts / PIs of the list
                                    // (full stock the first time, otherwise the base order's lots).
                                    const chosenCompactLot = String(lotList[0]?.lotNo ?? "").trim();
                                    const chosenCompactCount = String(lotList[0]?.yarnCount ?? "").trim();

                                    const compactCountOptions = isCompact
                                        ? getAllCompactCounts(lotsAndCounts)
                                        : [];

                                    const compactLotOptions = isCompact
                                        ? getAllCompactLots(lotsAndCounts)
                                        : [];

                                    // All PI numbers (balance attached for the chosen lot + count)
                                    const compactPiOptions = isCompact
                                        ? getCompactPiOptions(
                                            lotsAndCounts,
                                            chosenCompactLot,
                                            chosenCompactCount
                                                        )
                                        : [];

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
                                                        label="Order Qty (PCS)"
                                                        readOnly
                                                        value={styleRow.orderQty}
                                                        isShowOutLabel
                                                    />
                                                </div>

                                                {/* Nothing to book until an order type is picked */}
                                                {!orderType && (
                                                    <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
                                                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-indigo-500 shadow-sm ring-1 ring-slate-200">
                                                            <Sparkles size={18} />
                                                        </span>
                                                        <p className="text-sm font-semibold text-slate-700">
                                                            Pick an order type to start booking
                                                        </p>
                                                        <p className="max-w-sm text-xs text-slate-500">
                                                            Choose Knitting, AOP, Dyeing or Yarn dyeing above. You can then
                                                            add as many lots, yarn counts and quantities as you need.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* AOP / Dyeing: compact design, 8 fields in two lines */}
                                                {isCompact && (
                                                    <div className="mt-5 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4">
                                                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <h5 className="text-sm font-semibold text-slate-800">
                                                                    Booking details
                                                                </h5>
                                                                <p className="mt-0.5 text-xs text-slate-500">
                                                                    {isLotsAndCountsLoading
                                                                        ? "Loading yarn lots for this job..."
                                                                        : isLimitedToBase
                                                                            ? `Limited to the ${baseOrderLabel} work order's lots. Available qty = ${baseOrderLabel} qty minus qty already used by earlier ${currentOrderLabel} work orders.`
                                                                            : lotsAndCounts.length > 0
                                                                                ? "One set of details for this composition. Yarn count, lot and PI No list every available value."
                                                                                : "No yarn lot found in the yarn stock."}
                                                                </p>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                {lotList[0]?.prefilled && (
                                                                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700">
                                                                        <Sparkles size={11} />
                                                                        Auto-filled
                                                                    </span>
                                                                )}

                                                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                                                                    {ORDER_TYPE_OPTIONS.find((option) => option.value === orderType)?.label}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Line 1 */}
                                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                            <Input
                                                                label="Price Per Kg"
                                                                placeholder="Unit Price"
                                                                value={styleRow.unitPrice}
                                                                onChange={(e) =>
                                                                    handleRowFieldChange(index, "unitPrice", e.target.value)
                                                                }
                                                                required
                                                                isShowOutLabel
                                                            />

                                                            <Input
                                                                label="Work Order Qty (KG)"
                                                                placeholder="Work Order Qty"
                                                                value={lotList[0]?.workOrderQty ?? ""}
                                                                onChange={(e) =>
                                                                    handleLotChange(index, 0, "workOrderQty", e.target.value)
                                                                }
                                                                required
                                                                isShowOutLabel
                                                            />

                                                            <JobLotSelect
                                                                label="Yarn Count"
                                                                value={lotList[0]?.yarnCount ?? ""}
                                                                options={compactCountOptions}
                                                                loading={isLotsAndCountsLoading}
                                                                placeholder="Select count"
                                                                emptyText="No yarn count in stock"
                                                                onChange={(value) =>
                                                                    handleLotChange(index, 0, "yarnCount", value)
                                                                }
                                                            />

                                                            <JobLotSelect
                                                                label="Yarn Lot"
                                                                value={lotList[0]?.lotNo ?? ""}
                                                                options={compactLotOptions}
                                                                loading={isLotsAndCountsLoading}
                                                                placeholder="Select lot"
                                                                emptyText="No yarn lot in stock"
                                                                onChange={(value) =>
                                                                    handleLotChange(index, 0, "lotNo", value)
                                                                }
                                                            />
                                                        </div>

                                                        {/* Line 2 */}
                                                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                            <CompactPiField
                                                                item={lotList[0] ?? {}}
                                                                options={compactPiOptions}
                                                                loading={isLotsAndCountsLoading}
                                                                usage={bucketUsage}
                                                                onChange={(value) =>
                                                                    handleLotChange(index, 0, "piNo", value)
                                                                }
                                                            />

                                                            <Input
                                                                label="Stitch Length"
                                                                placeholder="Stitch Length"
                                                                value={styleRow.stichLength}
                                                                onChange={(e) =>
                                                                    handleRowFieldChange(index, "stichLength", e.target.value)
                                                                }
                                                                required
                                                                isShowOutLabel
                                                            />

                                                            <Input
                                                                label="Package"
                                                                placeholder="Package"
                                                                value={styleRow.pkg}
                                                                onChange={(e) =>
                                                                    handleRowFieldChange(index, "pkg", e.target.value)
                                                                }
                                                                isShowOutLabel
                                                            />

                                                            <Input
                                                                label="Shade %"
                                                                placeholder="Shade %"
                                                                value={styleRow.shadePercent}
                                                                onChange={(e) =>
                                                                    handleRowFieldChange(index, "shadePercent", e.target.value)
                                                                }
                                                                isShowOutLabel
                                                            />
                                                        </div>

                                                        {/* Amount */}
                                                        <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
                                                            <span>Amount</span>
                                                            <span className="text-sm font-semibold tabular-nums text-slate-900">
                                                                {formatMoney(sumLotAmount(styleRow))}
                                                                <span className="ml-1 text-[11px] font-medium text-slate-400">BDT</span>
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Common details (shared by ALL lines) */}
                                                {orderType && !isYarnDyeing && !isCompact && (
                                                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
                                                        <div className="mb-3">
                                                            <h5 className="text-sm font-semibold text-slate-800">
                                                                Common details
                                                            </h5>
                                                            <p className="mt-0.5 text-xs text-slate-500">
                                                                Entered once, applied to every line of this composition
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
                                                )}

                                                {/* Lines board: main line + extra lines beside it */}
                                                {orderType && !isCompact && (
                                                    <div className="mt-4">
                                                        <LinesBoard
                                                            items={isYarnDyeing ? colorList : lotList}
                                                            isYarnDyeing={isYarnDyeing}
                                                            unitPrice={styleRow.unitPrice}
                                                            inventory={lotsAndCounts}
                                                            loading={isLotsAndCountsLoading}
                                                            usage={bucketUsage}
                                                            noLots={noLotsFound}
                                                            restrictedNote={restrictedNote}
                                                            showYdBatch={orderType === "knittingOrder"}
                                                            ydLots={ydLots}
                                                            ydBatchLoading={isLotsAndCountsLoading}
                                                            onAdd={() =>
                                                                isYarnDyeing
                                                                    ? handleAddYarnColor(index)
                                                                    : handleAddLot(index)
                                                            }
                                                            onChange={(itemIndex, field, value) =>
                                                                isYarnDyeing
                                                                    ? handleYarnColorChange(index, itemIndex, field, value)
                                                                    : handleLotChange(index, itemIndex, field, value)
                                                            }
                                                            onRemove={(itemIndex) =>
                                                                isYarnDyeing
                                                                    ? handleRemoveYarnColor(index, itemIndex)
                                                                    : handleRemoveLot(index, itemIndex)
                                                            }
                                                            onDuplicate={(itemIndex) =>
                                                                isYarnDyeing
                                                                    ? handleDuplicateYarnColor(index, itemIndex)
                                                                    : handleDuplicateLot(index, itemIndex)
                                                            }
                                                        />
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

                    {/* Sidebar (docked when pinned). Own scroll so it fits inside the fitted box. */}
                    {isSummaryPinned && (
                        <aside
                            className="xl:sticky xl:top-0 xl:overflow-y-auto"
                            style={{ maxHeight: fit.height }}
                        >
                            {summaryHeader}
                            {sidebarBody}
                        </aside>
                    )}
                </div>
                </div>
            </div>

            {/* Unpinned summary panel: edge tab + slide-over drawer */}
            {!isSummaryPinned && (
                <>
                    {!isSummaryOpen && (
                        <button
                            type="button"
                            onClick={() => setIsSummaryOpen(true)}
                            title="Open summary panel"
                            className="fixed right-0 top-1/3 z-20 flex flex-col items-center gap-2 rounded-l-xl border border-r-0 border-slate-200 bg-white px-2 py-3 text-slate-600 shadow-lg transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                        >
                            <ChevronLeft size={16} />
                            <span className="text-[11px] font-semibold [writing-mode:vertical-rl]">
                                Summary
                            </span>

                            {totals.totalWorkOrderQty > 0 && (
                                <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                                    {formatKg(totals.totalWorkOrderQty)}
                                </span>
                            )}
                        </button>
                    )}

                    {isSummaryOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-20 bg-slate-900/20"
                                onMouseDown={() => setIsSummaryOpen(false)}
                                aria-hidden="true"
                            />

                            <aside
                                aria-label="Order summary panel"
                                className="fixed bottom-0 right-0 top-16 z-20 w-[400px] max-w-full overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 pb-24 shadow-2xl"
                            >
                                {summaryHeader}
                                {sidebarBody}
                            </aside>
                        </>
                    )}
                </>
            )}

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