import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Filter, RefreshCw, Search, X } from "lucide-react";
import { useFetchData } from "../../hooks/fetch";

/* ==================================================================
   SAVE  —  for now the payload is only logged to the console.
   Connect your "mark as received" API here later.

   payload = {
     orderType: "knittingOrder",
     factory:   "SALIM KNITWEAR",
     challans:  [{ id, challanNo, challanQty, okQty }, ...]
   }
   ================================================================== */

const saveReceivedRows = async (payload) => {
  console.log("In-Transit save payload:", payload);
  // await ... your "receive" API call here
};

/* ================================================================== */

const MODES = [
  { key: "knitting", label: "KNITTING", orderType: "knittingOrder" },
  { key: "dyeing", label: "DYEING", orderType: "dyeingOrder" },
  { key: "aop", label: "AOP", orderType: "aopOrder" },
  { key: "yarnDyed", label: "YARN DYED", orderType: "yarnDyeingOrder" },
];

/*
 * Factory rule (same as Knitting / DailyTransaction):
 *  - delivery rows          -> counted to the TO factory
 *  - return / received rows -> counted to the FROM factory
 */
const TO_FACTORY_TYPES = ["Yarn Delivery", "Grey Delivery", "Sent For Aop"];

const getFactoryName = (row) =>
  TO_FACTORY_TYPES.includes(row.deliveryType) ? row.toFactory : row.fromFactory;

const STATUS_LABEL = "In-Transit";
const BLANK_LABEL = "(Blanks)";

// Table height: bottom gap + minimum height (px)
const BOTTOM_GAP = 16;
const MIN_TABLE_HEIGHT = 240;

// Excel-style filter dropdown width (px)
const POPOVER_WIDTH = 264;

/* ------------------------- table design ------------------------- */

const T = {
  card: "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
  table: "w-full text-sm",
  th: "sticky top-0 z-10 bg-slate-800 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white",
  tr: "border-t border-slate-100 hover:bg-slate-50",
  // edited / ticked challan row
  trEdited: "border-t border-emerald-200 bg-emerald-100 hover:bg-emerald-200",
  td: "px-4 py-2.5",
  tdRight: "px-4 py-2.5 text-right tabular-nums",
  tdCenter: "px-4 py-2.5 text-center",
  tfCell:
    "sticky bottom-0 z-10 border-t-2 border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-900",
  badge:
    "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700",
};

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };
const JUSTIFY = {
  left: "justify-start",
  right: "justify-end",
  center: "justify-center",
};

/* ------------------------- helpers ------------------------- */

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

const formatNumber = (value) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

// Accepts: array | { data: [] } | { data: { data: [] } }
const extractList = (res) => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
};

// "inTransit" | "In-Transit" | "in transit" | "IN_TRANSIT" -> true
const isInTransit = (status) =>
  String(status ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "") === "intransit";

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/*
 * Quantity of a challan line.
 *  - DYEING : ONLY the finish received qty is used (Finish Received and
 *             Grey Received rows both show the finish qty).
 *             If your API uses another field name, add it to FINISH_QTY_FIELDS.
 *  - others : deliveryQty (as before).
 */
const FINISH_QTY_FIELDS = [
  "finishReceivedQty",
  "finishReceiveQty",
  "finishQty",
  "receivedQty",
  "receiveQty",
  "deliveryQty",
];

const getQty = (d, orderType) => {
  if (orderType === "dyeingOrder") {
    for (const field of FINISH_QTY_FIELDS) {
      const n = toNum(d?.[field]);
      if (n > 0) return n;
    }
    return 0;
  }
  return toNum(d?.deliveryQty);
};

const toRow = (d, orderType) => ({
  // rowKey is unique even if two different tables (Finish Received /
  // Grey Received / Delivery) use the same numeric id.
  rowKey: `${d.deliveryType ?? "x"}-${d.id}`,
  id: d.id,
  challanDate: d.deliveryDate,
  challanNo: d.challanNo,
  fromFactory: d.fromFactory,
  toFactory: d.toFactory,
  challanQty: getQty(d, orderType),
  deliveryType: d.deliveryType,
});

// work-order lines -> one row per in-transit delivery (challan line)
const flattenDeliveries = (items, orderType) => {
  const map = new Map();

  const add = (d, parent) => {
    if (!d) return;
    // status on the delivery itself, otherwise inherit from the parent line
    const status = d.deliveryStatus ?? d.status ?? parent?.deliveryStatus;
    if (!isInTransit(status)) return;
    const row = toRow(d, orderType);
    map.set(row.rowKey, row);
  };

  items.forEach((item) => {
    if (Array.isArray(item?.deliveries)) {
      item.deliveries.forEach((d) => add(d, item));
    } else {
      add(item, null);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.challanDate) - new Date(a.challanDate) ||
      Number(b.challanNo) - Number(a.challanNo),
  );
};

/* ------------------------- column definitions -------------------------
   get(row, ctx)  -> text shown / filtered
   ctx = { edits } (needed for the Check Box and Ok Qty columns)
   ----------------------------------------------------------------------- */

const SUMMARY_COLS = [
  { key: "factory", label: "Factory Name", align: "left", get: (r) => r.factory },
  { key: "status", label: "Status", align: "left", get: () => STATUS_LABEL },
  {
    key: "challanCount",
    label: "Challan Count",
    align: "right",
    get: (r) => formatNumber(r.challanCount),
    sortVal: (r) => r.challanCount,
  },
  {
    key: "qty",
    label: "Qty",
    align: "right",
    get: (r) => formatNumber(r.qty),
    sortVal: (r) => r.qty,
  },
];

const DETAIL_COLS = [
  {
    key: "challanDate",
    label: "Challan Date",
    align: "left",
    get: (r) => formatDate(r.challanDate),
    sortVal: (r) => new Date(r.challanDate).getTime() || 0,
  },
  {
    key: "challanNo",
    label: "Challan No.",
    align: "left",
    get: (r) => String(r.challanNo ?? ""),
    sortVal: (r) => Number(r.challanNo) || 0,
  },
  { key: "fromFactory", label: "From", align: "left", get: (r) => r.fromFactory },
  { key: "toFactory", label: "To", align: "left", get: (r) => r.toFactory },
  {
    key: "deliveryType",
    label: "Delivery Mode",
    align: "left",
    get: (r) => r.deliveryType,
  },
  {
    key: "challanQty",
    label: "Challan Qty",
    align: "right",
    get: (r) => formatNumber(r.challanQty),
    sortVal: (r) => r.challanQty,
  },
  {
    key: "checked",
    label: "Check Box",
    align: "center",
    get: (r, ctx) => (ctx?.edits?.[r.rowKey]?.checked ? "Checked" : "Unchecked"),
  },
  {
    key: "okQty",
    label: "Ok Qty",
    align: "right",
    get: (r, ctx) => {
      const v = ctx?.edits?.[r.rowKey]?.okQty;
      return v === undefined || v === "" ? "" : formatNumber(v);
    },
    sortVal: (r, ctx) => Number(ctx?.edits?.[r.rowKey]?.okQty) || 0,
  },
  { key: "status", label: "Status", align: "left", get: () => STATUS_LABEL },
];

const labelOf = (col, row, ctx) => {
  const v = col.get(row, ctx);
  return v === undefined || v === null || v === "" ? BLANK_LABEL : String(v);
};

// Apply Excel-style filters ({ [colKey]: Set(labels) }), optionally skipping one column
const filterRows = (rows, cols, filters, skipKey, ctx) =>
  rows.filter((row) =>
    cols.every((col) => {
      if (col.key === skipKey) return true;
      const selected = filters[col.key];
      if (!selected) return true;
      return selected.has(labelOf(col, row, ctx));
    }),
  );

// Unique values of a column (respecting the OTHER columns' filters, like Excel)
const buildOptions = (rows, cols, filters, col, filterCtx, liveCtx) => {
  const base = filterRows(rows, cols, filters, col.key, filterCtx);
  const map = new Map();

  base.forEach((row) => {
    const label = labelOf(col, row, liveCtx);
    if (!map.has(label)) {
      map.set(label, col.sortVal ? col.sortVal(row, liveCtx) : label);
    }
  });

  return Array.from(map.entries())
    .sort((a, b) =>
      typeof a[1] === "number" && typeof b[1] === "number"
        ? a[1] - b[1]
        : String(a[1]).localeCompare(String(b[1])),
    )
    .map(([label]) => label);
};

/* ------------------------- responsive table height ------------------------- */

// Fits the table's max-height to the space left on screen (works with the
// ERP's global zoom too, because the zoom scale is measured, not assumed).
const useFitHeight = (ref, deps) => {
  const [height, setHeight] = useState(480);

  useLayoutEffect(() => {
    const calc = () => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const scale =
        el.offsetHeight && rect.height ? rect.height / el.offsetHeight : 1;
      const available =
        (window.innerHeight - rect.top) / (scale || 1) - BOTTOM_GAP;

      setHeight(Math.max(MIN_TABLE_HEIGHT, Math.floor(available)));
    };

    calc();
    window.addEventListener("resize", calc);

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(calc) : null;
    if (observer) observer.observe(document.body);

    return () => {
      window.removeEventListener("resize", calc);
      if (observer) observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return height;
};

/* ------------------------- Excel-style filter dropdown -------------------------
   Opens right under the column header (like Excel).
   - type in the search box -> only the matches get selected
   - Enter  -> apply the filter
   - Esc / click outside -> close
   - "Add current selection to filter" keeps the previous selection
   ------------------------------------------------------------------------------ */

const ColumnFilterPopover = ({
  title,
  options,
  applied,
  anchor,
  onApply,
  onClose,
}) => {
  const rootRef = useRef(null);

  const [searchText, setSearchText] = useState("");
  const [checked, setChecked] = useState(() => new Set(applied ?? options));
  const [addToCurrent, setAddToCurrent] = useState(false);

  // close when clicking outside (the header filter button toggles by itself)
  useEffect(() => {
    const handleDown = (event) => {
      if (rootRef.current && rootRef.current.contains(event.target)) return;
      if (event.target.closest && event.target.closest("[data-filter-btn]")) return;
      onClose();
    };

    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [onClose]);

  // close when the window is resized
  useEffect(() => {
    window.addEventListener("resize", onClose);
    return () => window.removeEventListener("resize", onClose);
  }, [onClose]);

  const visible = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, searchText]);

  // Typing selects only the matches (previous selection is NOT kept unless
  // "Add current selection to filter" is ticked).
  const handleSearchChange = (value) => {
    setSearchText(value);
    setAddToCurrent(false);

    const q = value.trim().toLowerCase();
    if (q) {
      setChecked(new Set(options.filter((o) => o.toLowerCase().includes(q))));
    } else {
      setChecked(new Set(applied ?? options));
    }
  };

  const allVisibleChecked =
    visible.length > 0 && visible.every((o) => checked.has(o));

  const toggleAll = () => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visible.forEach((o) => next.delete(o));
      else visible.forEach((o) => next.add(o));
      return next;
    });
  };

  const toggleOne = (option) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  };

  const hasSearch = searchText.trim() !== "";

  const finalSelection = () => {
    let result;

    if (hasSearch) {
      result = new Set(visible.filter((o) => checked.has(o)));

      // "Add current selection to filter": keep the previously applied values.
      if (addToCurrent && applied) {
        applied.forEach((v) => {
          if (options.includes(v)) result.add(v);
        });
      }
    } else {
      result = new Set(options.filter((o) => checked.has(o)));
    }

    return result;
  };

  const selectionCount = finalSelection().size;

  const handleOk = () => {
    const result = finalSelection();
    if (result.size === 0) return;
    onApply(result.size === options.length ? null : result);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleOk();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  // position: right under the column header (fixed, corrected for ERP zoom)
  const scale = anchor.scale || 1;
  const visualLeft = Math.max(
    8,
    Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH * scale - 8),
  );
  const listMaxHeight = Math.max(
    120,
    Math.min(240, (window.innerHeight - anchor.bottom) / scale - 170),
  );

  return (
    <div
      ref={rootRef}
      onKeyDown={handleKeyDown}
      className="rounded-lg border border-slate-300 bg-white text-slate-800 shadow-2xl"
      style={{
        position: "fixed",
        left: visualLeft / scale,
        top: anchor.bottom / scale,
        width: POPOVER_WIDTH,
        zIndex: 100,
      }}
    >
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
        Filter: {title}
      </div>

      <div className="space-y-2 border-b border-slate-100 p-2">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            autoFocus
            value={searchText}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search (Enter to apply)"
            className="w-full rounded border border-slate-300 py-1 pl-7 pr-2 text-xs outline-none focus:border-slate-800"
          />
        </div>

        {hasSearch && (
          <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={addToCurrent}
              onChange={(e) => setAddToCurrent(e.target.checked)}
              className="h-3.5 w-3.5 accent-slate-800"
            />
            Add current selection to filter
          </label>
        )}
      </div>

      <div
        className="overflow-y-auto px-2 py-1"
        style={{ maxHeight: listMaxHeight }}
      >
        <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 py-1 text-xs font-bold text-slate-800">
          <input
            type="checkbox"
            checked={allVisibleChecked}
            onChange={toggleAll}
            className="h-3.5 w-3.5 accent-slate-800"
          />
          (Select All{hasSearch ? " Search Results" : ""})
        </label>

        {visible.length === 0 ? (
          <div className="py-3 text-center text-[11px] text-slate-400">
            No matching values
          </div>
        ) : (
          visible.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={checked.has(option)}
                onChange={() => toggleOne(option)}
                className="h-3.5 w-3.5 accent-slate-800"
              />
              <span className="truncate">{option}</span>
            </label>
          ))
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2">
        <button
          type="button"
          onClick={() => onApply(null)}
          className="text-[11px] font-bold text-red-600 hover:underline"
        >
          Clear Filter
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOk}
            disabled={selectionCount === 0}
            className="rounded bg-slate-800 px-3 py-1 text-[11px] font-bold text-white hover:bg-slate-900 disabled:opacity-50"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------- header cell with filter button ------------------------- */

const FilterHeaderCell = ({ col, active, onFilter }) => (
  <th className={`${T.th} ${ALIGN[col.align]}`}>
    <div className={`flex items-center gap-1.5 ${JUSTIFY[col.align]}`}>
      <span>{col.label}</span>
      <button
        type="button"
        data-filter-btn="true"
        onClick={onFilter}
        title={`Filter ${col.label}`}
        className={`rounded p-0.5 transition ${
          active
            ? "bg-amber-400 text-slate-900"
            : "text-slate-300 hover:bg-slate-600 hover:text-white"
        }`}
      >
        <Filter size={12} />
      </button>
    </div>
  </th>
);

/* ================================================================== */

const InTransit = () => {
  const [mode, setMode] = useState("knitting");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [selectedFactory, setSelectedFactory] = useState(null);
  const { fetchData, loading } = useFetchData();

  // Search (works only on the already loaded data)
  const [searchText, setSearchText] = useState("");

  // Excel-style filters: { [colKey]: Set(labels) }  (absent = no filter)
  const [summaryFilters, setSummaryFilters] = useState({});
  const [detailFilters, setDetailFilters] = useState({});
  const [filterModal, setFilterModal] = useState(null); // { view, colKey, anchor }

  // Local edits per row: { [rowKey]: { checked: boolean, okQty: string } }
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  // Snapshot of edits taken when a filter is applied, so rows do not vanish
  // while the user is typing in Ok Qty / ticking Check Box.
  const [filterCtx, setFilterCtx] = useState({ edits: {} });

  const activeMode = MODES.find((m) => m.key === mode);
  const orderType = activeMode.orderType;
  const busy = loading;

  // Ignore results of an older request (when buttons are clicked quickly).
  const requestId = useRef(0);

  /* ---------------- data loading ---------------- */

  const load = useCallback(async () => {
    const currentId = ++requestId.current;
    setError("");

    try {
      const res = await fetchData(`/api/movement/${orderType}/inTransit`);

      if (currentId !== requestId.current) return;

      const list = extractList(res);
      const flat = flattenDeliveries(list, orderType);

      // Debug help: if the API sent data but nothing survived, show why.
      if (list.length > 0 && flat.length === 0) {
        console.warn(
          `[InTransit] ${orderType}: API returned ${list.length} item(s) but 0 in-transit rows. First item:`,
          list[0],
        );
      }

      setRows(flat);
    } catch (err) {
      if (currentId !== requestId.current) return;
      setError(err?.message || "Failed to load in-transit data");
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderType]);

  // Fetch on first render and whenever the button (orderType) changes.
  useEffect(() => {
    setSelectedFactory(null);
    setEdits({});
    setRows([]);
    setSearchText("");
    setSummaryFilters({});
    setDetailFilters({});
    setFilterModal(null);
    load();
  }, [orderType, load]);

  // Each factory has its own detail filters.
  useEffect(() => {
    setDetailFilters({});
    setFilterModal(null);
  }, [selectedFactory]);

  const handleRefresh = () => {
    setEdits({});
    load();
  };

  /* ---------------- search (client side) ---------------- */

  // several challan numbers can be searched together, separated by space
  const searchTerms = useMemo(
    () =>
      searchText
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((t) => t.toLowerCase()),
    [searchText],
  );

  const isSearchMode = searchTerms.length > 0;

  const clearSearch = () => setSearchText("");

  /* ---------------- derived data ---------------- */

  const baseRows = useMemo(() => {
    if (!isSearchMode) return rows;

    return rows.filter((row) => {
      const challan = String(row.challanNo ?? "").toLowerCase();
      return searchTerms.some((term) => challan.includes(term));
    });
  }, [rows, searchTerms, isSearchMode]);

  // summary (factory-wise)
  const factorySummary = useMemo(() => {
    const map = new Map();

    baseRows.forEach((row) => {
      const name = getFactoryName(row) || "Unknown";
      if (!map.has(name)) {
        map.set(name, { factory: name, challanKeys: new Set(), qty: 0 });
      }
      const entry = map.get(name);
      entry.challanKeys.add(String(row.challanNo));
      entry.qty += row.challanQty;
    });

    return Array.from(map.values())
      .map((e) => ({
        factory: e.factory,
        challanCount: e.challanKeys.size,
        qty: e.qty,
      }))
      .sort((a, b) => a.factory.localeCompare(b.factory));
  }, [baseRows]);

  const visibleSummary = useMemo(
    () => filterRows(factorySummary, SUMMARY_COLS, summaryFilters),
    [factorySummary, summaryFilters],
  );

  const summaryTotals = useMemo(
    () => ({
      challanCount: visibleSummary.reduce((s, r) => s + r.challanCount, 0),
      qty: visibleSummary.reduce((s, r) => s + r.qty, 0),
    }),
    [visibleSummary],
  );

  // details (selected factory)
  const factoryRowsAll = useMemo(() => {
    if (!selectedFactory) return [];
    return baseRows.filter(
      (r) => (getFactoryName(r) || "Unknown") === selectedFactory,
    );
  }, [baseRows, selectedFactory]);

  const visibleDetail = useMemo(
    () =>
      filterRows(factoryRowsAll, DETAIL_COLS, detailFilters, null, filterCtx),
    [factoryRowsAll, detailFilters, filterCtx],
  );

  const detailTotals = useMemo(
    () => ({
      challanQty: visibleDetail.reduce((s, r) => s + r.challanQty, 0),
      okQty: visibleDetail.reduce(
        (s, r) => s + Number(edits[r.rowKey]?.okQty || 0),
        0,
      ),
    }),
    [visibleDetail, edits],
  );

  /* ---------------- filter dropdown wiring ---------------- */

  const anyFilterActive =
    Object.keys(summaryFilters).length > 0 ||
    Object.keys(detailFilters).length > 0;

  const clearAllFilters = () => {
    setSummaryFilters({});
    setDetailFilters({});
    setFilterModal(null);
  };

  // open / close the dropdown right under the clicked column header
  const openFilter = (view, colKey, event) => {
    const th = event.currentTarget.closest("th");
    const rect = th.getBoundingClientRect();
    const scale = th.offsetWidth ? rect.width / th.offsetWidth : 1;
    const anchor = {
      left: rect.left,
      bottom: rect.bottom,
      scale: scale || 1,
    };

    setFilterModal((prev) =>
      prev && prev.view === view && prev.colKey === colKey
        ? null
        : { view, colKey, anchor },
    );
  };

  const closeFilter = useCallback(() => setFilterModal(null), []);

  const modalConfig = filterModal
    ? filterModal.view === "summary"
      ? {
          cols: SUMMARY_COLS,
          rows: factorySummary,
          filters: summaryFilters,
          setFilters: setSummaryFilters,
        }
      : {
          cols: DETAIL_COLS,
          rows: factoryRowsAll,
          filters: detailFilters,
          setFilters: setDetailFilters,
        }
    : null;

  const modalCol = modalConfig
    ? modalConfig.cols.find((c) => c.key === filterModal.colKey)
    : null;

  const modalOptions =
    modalConfig && modalCol
      ? buildOptions(
          modalConfig.rows,
          modalConfig.cols,
          modalConfig.filters,
          modalCol,
          filterCtx,
          { edits },
        )
      : [];

  const applyColumnFilter = (selection) => {
    if (filterModal.view === "detail") {
      setFilterCtx({ edits });
    }

    modalConfig.setFilters((prev) => {
      const next = { ...prev };
      if (selection) next[modalCol.key] = selection;
      else delete next[modalCol.key];
      return next;
    });
    setFilterModal(null);
  };

  /* ---------------- row edit handlers ---------------- */

  const handleCheck = (row, checked) => {
    setEdits((prev) => {
      const next = { ...prev };
      if (checked) {
        next[row.rowKey] = { checked: true, okQty: String(row.challanQty) };
      } else {
        delete next[row.rowKey];
      }
      return next;
    });
  };

  const handleOkQtyChange = (row, value) => {
    if (!/^\d*\.?\d*$/.test(value)) return;
    setEdits((prev) => ({
      ...prev,
      [row.rowKey]: {
        checked: prev[row.rowKey]?.checked ?? false,
        okQty: value,
      },
    }));
  };

  // A row is "edited" when it is ticked OR its Ok Qty was typed.
  const isDirty = (rowKey) => {
    const e = edits[rowKey];
    return Boolean(e && (e.checked || e.okQty !== ""));
  };

  const hasDirtyInView = factoryRowsAll.some((r) => isDirty(r.rowKey));

  const handleSave = async () => {
    // payload: every edited / ticked challan of this factory (many at once)
    const dirtyRows = factoryRowsAll.filter((r) => isDirty(r.rowKey));

    const challans = dirtyRows.map((r) => ({
      id: r.id,
      challanNo: r.challanNo,
      challanQty: r.challanQty,
      okQty: Number(edits[r.rowKey].okQty || 0),
    }));

    if (challans.length === 0) return;

    const payload = {
      orderType,
      factory: selectedFactory,
      challans,
    };

    setSaving(true);
    setError("");
    try {
      await saveReceivedRows(payload);

      // Saved challans are hidden from the list.
      const savedKeys = new Set(dirtyRows.map((r) => r.rowKey));
      setRows((prev) => prev.filter((r) => !savedKeys.has(r.rowKey)));
      setEdits((prev) => {
        const next = { ...prev };
        savedKeys.forEach((key) => delete next[key]);
        return next;
      });
    } catch (err) {
      setError(err?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- responsive table height ---------------- */

  const tableWrapRef = useRef(null);
  const tableHeight = useFitHeight(tableWrapRef, [
    selectedFactory,
    Boolean(error),
    busy,
  ]);

  /* ---------------- search box (shared by both views) ---------------- */

  const searchBox = (
    <div className="relative w-[300px] max-w-full">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search challan no. (space separated)"
        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-slate-800"
      />
      {searchText && (
        <button
          type="button"
          onClick={clearSearch}
          title="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );

  /* ---------------- render ---------------- */

  return (
    <div className="space-y-4">
      {/* ================= MODE BUTTONS + SEARCH + REFRESH ================= */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`rounded-lg border px-5 py-2 text-xs font-bold tracking-wide transition ${
                mode === m.key
                  ? "border-slate-800 bg-slate-800 text-white shadow"
                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {/* summary view: search box on the right */}
          {!selectedFactory && searchBox}

          {anyFilterActive && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
            >
              Clear Filters
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={busy}
            title="Refresh data"
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {/* ================= FACTORY SUMMARY ================= */}
      {!selectedFactory && (
        <div className={T.card}>
          <div
            ref={tableWrapRef}
            className="overflow-auto"
            style={{ maxHeight: tableHeight }}
            onScroll={() => filterModal && setFilterModal(null)}
          >
            <table className={T.table}>
              <thead>
                <tr>
                  {SUMMARY_COLS.map((col) => (
                    <FilterHeaderCell
                      key={col.key}
                      col={col}
                      active={Boolean(summaryFilters[col.key])}
                      onFilter={(e) => openFilter("summary", col.key, e)}
                    />
                  ))}
                </tr>
              </thead>

              <tbody>
                {busy ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      Loading...
                    </td>
                  </tr>
                ) : visibleSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      {isSearchMode
                        ? "No in-transit challan found for this search."
                        : anyFilterActive
                          ? "No data matches the filters."
                          : `No in-transit ${activeMode.label} challan found.`}
                    </td>
                  </tr>
                ) : (
                  visibleSummary.map((item) => (
                    <tr key={item.factory} className={T.tr}>
                      <td className={T.td}>
                        <button
                          type="button"
                          onClick={() => setSelectedFactory(item.factory)}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {item.factory}
                        </button>
                      </td>
                      <td className={T.td}>
                        <span className={T.badge}>{STATUS_LABEL}</span>
                      </td>
                      <td className={T.tdRight}>{formatNumber(item.challanCount)}</td>
                      <td className={T.tdRight}>{formatNumber(item.qty)}</td>
                    </tr>
                  ))
                )}
              </tbody>

              {!busy && visibleSummary.length > 0 && (
                <tfoot>
                  <tr>
                    <td className={T.tfCell}>Total</td>
                    <td className={T.tfCell}></td>
                    <td className={`${T.tfCell} text-right tabular-nums`}>
                      {formatNumber(summaryTotals.challanCount)}
                    </td>
                    <td className={`${T.tfCell} text-right tabular-nums`}>
                      {formatNumber(summaryTotals.qty)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ================= CHALLAN DETAILS ================= */}
      {selectedFactory && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedFactory(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                ← Back
              </button>
              <h2 className="text-sm font-bold text-slate-800">
                {activeMode.label} — {selectedFactory}
              </h2>
            </div>

            {/* factory view: search box (right) + Save */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {searchBox}

              {hasDirtyInView && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
          </div>

          <div className={T.card}>
            <div
              ref={tableWrapRef}
              className="overflow-auto"
              style={{ maxHeight: tableHeight }}
              onScroll={() => filterModal && setFilterModal(null)}
            >
              <table className={T.table}>
                <thead>
                  <tr>
                    {DETAIL_COLS.map((col) => (
                      <FilterHeaderCell
                        key={col.key}
                        col={col}
                        active={Boolean(detailFilters[col.key])}
                        onFilter={(e) => openFilter("detail", col.key, e)}
                      />
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {visibleDetail.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                        {isSearchMode
                          ? "No challan found for this search."
                          : Object.keys(detailFilters).length > 0
                            ? "No data matches the filters."
                            : "No in-transit challan left for this factory."}
                      </td>
                    </tr>
                  ) : (
                    visibleDetail.map((row) => {
                      const edit = edits[row.rowKey];
                      return (
                        <tr
                          key={row.rowKey}
                          className={isDirty(row.rowKey) ? T.trEdited : T.tr}
                        >
                          <td className={T.td}>{formatDate(row.challanDate)}</td>
                          <td className={T.td}>{row.challanNo}</td>
                          <td className={T.td}>{row.fromFactory}</td>
                          <td className={T.td}>{row.toFactory}</td>
                          <td className={T.td}>{row.deliveryType}</td>
                          <td className={T.tdRight}>{formatNumber(row.challanQty)}</td>
                          <td className={T.tdCenter}>
                            <input
                              type="checkbox"
                              checked={Boolean(edit?.checked)}
                              onChange={(e) => handleCheck(row, e.target.checked)}
                              className="h-4 w-4 cursor-pointer accent-slate-800"
                            />
                          </td>
                          <td className={T.tdRight}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={edit?.okQty ?? ""}
                              onChange={(e) =>
                                handleOkQtyChange(row, e.target.value)
                              }
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-slate-800"
                            />
                          </td>
                          <td className={T.td}>
                            <span className={T.badge}>{STATUS_LABEL}</span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {visibleDetail.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className={T.tfCell} colSpan={5}>
                        Total ({visibleDetail.length} challan)
                      </td>
                      <td className={`${T.tfCell} text-right tabular-nums`}>
                        {formatNumber(detailTotals.challanQty)}
                      </td>
                      <td className={T.tfCell}></td>
                      <td className={`${T.tfCell} text-right tabular-nums`}>
                        {formatNumber(detailTotals.okQty)}
                      </td>
                      <td className={T.tfCell}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= EXCEL-STYLE FILTER DROPDOWN ================= */}
      {filterModal && modalCol && (
        <ColumnFilterPopover
          key={`${filterModal.view}-${filterModal.colKey}`}
          title={modalCol.label}
          options={modalOptions}
          applied={modalConfig.filters[modalCol.key]}
          anchor={filterModal.anchor}
          onApply={applyColumnFilter}
          onClose={closeFilter}
        />
      )}
    </div>
  );
};

export default InTransit;