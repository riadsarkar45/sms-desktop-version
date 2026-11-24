import React, { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, RotateCcw, X } from "lucide-react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
const toNum = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatKg = (n) =>
  toNum(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const tempId = () => `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const str = (v) => String(v ?? "").trim();

// ---------------------------------------------------------
// Field definitions
// ---------------------------------------------------------
const FIELDS = [
  { key: "workOrderQty", label: "WO Qty (Kg)", type: "number" },
  { key: "lotNo", label: "Yarn Lot No", type: "select" },
  { key: "yarnCount", label: "Yarn Count", type: "select" },
  { key: "piId", label: "PI No", type: "select" },
  { key: "stichLength", label: "Stitch Length", type: "text" },
  { key: "machineDia", label: "Machine Dia", type: "text" },
  { key: "unitePrice", label: "Unit Price", type: "number" },
];

// Yarn dyeing: PI is at composition level, the rest is per yarn color
const YD_COMP_FIELDS = [{ key: "piId", label: "PI No", type: "select" }];

const YD_COLOR_FIELDS = [
  { key: "color", label: "Color", type: "text" },
  { key: "qty", label: "WO Qty (Kg)", type: "number" },
  { key: "lotNo", label: "Yarn Lot No", type: "select" },
  { key: "yarnCount", label: "Yarn Count", type: "select" },
  { key: "shade", label: "Shade (%)", type: "text" },
];

const INVENTORY_FIELDS = new Set(["lotNo", "yarnCount", "piId"]);

// ---------------------------------------------------------
// Default lot / count / PI (same idea as NewOrder.jsx)
// ---------------------------------------------------------
const DEFAULT_LOT = "DEFAULT LOT";
const DEFAULT_COUNT = "DEFAULT COUNT";
const DEFAULT_PI = "DEFAULT PI";

const isDefaultItem = (item) =>
  item?.lotNo === DEFAULT_LOT || item?.yarnCount === DEFAULT_COUNT;

// ---------------------------------------------------------
// API response parsing (tolerant to different shapes / field names)
// ---------------------------------------------------------
const extractList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const candidates = [
    payload.data,
    payload.lots,
    payload.result,
    payload.results,
    payload.items,
    payload.data?.data,
    payload.data?.lots,
    payload.data?.items,
    payload.data?.result,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  return [];
};

const normalizeLotEntry = (item) => ({
  piNo: str(item?.piNo ?? item?.piId ?? item?.piNumber ?? item?.pi_no ?? item?.pi?.piNo ?? item?.pi),
  lotNo: str(item?.lotNo ?? item?.lot ?? item?.lotNumber ?? item?.lot_no),
  yarnCount: str(item?.yarnCount ?? item?.count ?? item?.yarn_count),
  totalQuantity: toNum(
    item?.totalQuantity ?? item?.quantity ?? item?.qty ?? item?.availableQuantity ?? item?.balance
  ),
});

// ---------------------------------------------------------
// Yarn inventory helpers (one entry = PI + Lot No + Yarn Count)
// ---------------------------------------------------------
const uniqSorted = (values) => [...new Set(values)].sort();

const getAllLots = (inventory) => uniqSorted(inventory.map((e) => e.lotNo).filter(Boolean));
const getAllCounts = (inventory) => uniqSorted(inventory.map((e) => e.yarnCount).filter(Boolean));
const getAllPis = (inventory) => uniqSorted(inventory.map((e) => e.piNo).filter(Boolean));

const getCountsForLot = (inventory, lotNo) =>
  uniqSorted(inventory.filter((e) => e.lotNo === lotNo).map((e) => e.yarnCount).filter(Boolean));

const getPisForPair = (inventory, lotNo, yarnCount) =>
  inventory
    .filter((e) => e.piNo && e.lotNo === lotNo && e.yarnCount === yarnCount)
    .sort((a, b) => a.piNo.localeCompare(b.piNo));

// QTY FILTER: only stock that is >= the work order qty is offered.
// No qty typed (empty / 0) = no filtering.
const filterInventoryByQty = (inventory, qty) => {
  const need = toNum(qty);
  if (!(need > 0)) return inventory;
  return inventory.filter((e) => toNum(e.totalQuantity) >= need);
};

// Yarn dyeing: stock that covers the qty of at least one color of the composition
const stockForColors = (inventory, colors) => {
  const withQty = (colors || []).filter((y) => toNum(y.qty) > 0);
  if (withQty.length === 0) return inventory;

  const seen = new Set();
  const out = [];

  withQty.forEach((y) => {
    filterInventoryByQty(inventory, y.qty).forEach((e) => {
      const k = `${e.piNo}|${e.lotNo}|${e.yarnCount}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push(e);
      }
    });
  });

  return out;
};

// The PI with the most stock is the automatic choice
const bestPi = (entries) =>
  [...entries].sort(
    (a, b) => toNum(b.totalQuantity) - toNum(a.totalQuantity) || a.piNo.localeCompare(b.piNo)
  )[0]?.piNo ?? "";

// PI of a lot + count pair (auto-selected):
//  - current PI stays when it still belongs to the pair
//  - otherwise the PI with the most stock is selected
//  - pair not in the list at all: current PI (unless it is the default PI)
const pickPiForPair = (inventory, lotNo, yarnCount, currentPi) => {
  const base = currentPi === DEFAULT_PI ? "" : currentPi;

  if (!lotNo || !yarnCount) return base;

  const entries = getPisForPair(inventory, lotNo, yarnCount);

  if (entries.length === 0) return base;
  if (entries.some((e) => e.piNo === base)) return base;

  return bestPi(entries);
};

// Applies a Lot / Count / PI change (inventory = already filtered by qty):
//  - LOT picked  -> yarn count is selected automatically (kept if it belongs to the lot,
//                   otherwise the first count of the lot), then the PI is selected automatically
//  - COUNT picked first (no lot) -> nothing else is selected
//  - COUNT changed while a lot is chosen -> PI is re-selected
const applyInventoryChange = (item, field, value, inventory = [], withPi = true) => {
  if (
    (field === "lotNo" && value === DEFAULT_LOT) ||
    (field === "yarnCount" && value === DEFAULT_COUNT)
  ) {
    return {
      ...item,
      lotNo: DEFAULT_LOT,
      yarnCount: DEFAULT_COUNT,
      ...(withPi ? { piId: DEFAULT_PI } : {}),
    };
  }

  const next = { ...item, [field]: value };

  // Leaving the defaults: drop the other default values so they do not stick
  if (isDefaultItem(item)) {
    if (field !== "lotNo" && next.lotNo === DEFAULT_LOT) next.lotNo = "";
    if (field !== "yarnCount" && next.yarnCount === DEFAULT_COUNT) next.yarnCount = "";
    if (withPi && field !== "piId" && next.piId === DEFAULT_PI) next.piId = "";
  }

  // LOT picked: select the yarn count automatically, then the PI automatically
  if (field === "lotNo" && value) {
    const counts = getCountsForLot(inventory, value);

    if (counts.length > 0) {
      next.yarnCount = counts.includes(next.yarnCount) ? next.yarnCount : counts[0];
    }

    if (withPi) {
      next.piId = pickPiForPair(inventory, value, next.yarnCount, next.piId);
    }
  }

  // COUNT changed while a lot is chosen: re-select the PI of that pair
  if (withPi && field === "yarnCount" && value && next.lotNo && next.lotNo !== DEFAULT_LOT) {
    next.piId = pickPiForPair(inventory, next.lotNo, value, next.piId);
  }

  return next;
};

// Yarn dyeing: the PI sits on the composition, so it follows the lot + count of its colors
// (each color uses the stock that covers its own qty)
const pickPiForColors = (inventory, colors, currentPi) => {
  if (colors.some((y) => isDefaultItem(y))) return DEFAULT_PI;

  const entries = colors
    .filter((y) => y.lotNo && y.yarnCount)
    .flatMap((y) => getPisForPair(filterInventoryByQty(inventory, y.qty), y.lotNo, y.yarnCount));

  const base = currentPi === DEFAULT_PI ? "" : currentPi;

  if (entries.length === 0) return base;
  if (entries.some((e) => e.piNo === base)) return base;

  return bestPi(entries);
};

// PI options: PIs of the matching pair(s) first (with stock), then the other PIs of the stock
const buildPiOptions = (stock, pairEntries) => {
  const pairPis = new Set(pairEntries.map((e) => e.piNo));

  const matching = pairEntries.map((e) => ({
    value: e.piNo,
    label: `${e.piNo} — ${toNum(e.totalQuantity).toLocaleString()} KG`,
  }));

  const others = getAllPis(stock)
    .filter((pi) => !pairPis.has(pi))
    .map((pi) => ({ value: pi, label: pi }));

  return [...matching, ...others];
};

// ---------------------------------------------------------
// Data shaping
// ---------------------------------------------------------
const emptyColor = () => ({
  id: null,
  _tempId: tempId(),
  color: "",
  yarnCount: "",
  lotNo: "",
  qty: "",
  shade: "",
});

const emptyLine = (isYarnDye) =>
  isYarnDye
    ? { id: null, _tempId: tempId(), piId: "", workOrderQty: 0, yarnColors: [emptyColor()] }
    : {
      id: null,
      _tempId: tempId(),
      yarnCount: "",
      lotNo: "",
      stichLength: "",
      workOrderQty: "",
      piId: "",
      machineDia: "",
      unitePrice: "",
    };

// Accept a single object or an array wrapping it
const normalize = (raw, isYarnDye) => {
  const src = Array.isArray(raw) ? raw[0] : raw;

  return {
    id: src?.id ?? null,
    factoryName: src?.factoryName ?? "",
    revisedRemarks: src?.revisedRemarks ?? "",
    compositions: (src?.compositions || []).map((c) => {
      if (isYarnDye) {
        return {
          ...c,
          piId: c.piId ?? "",
          workOrderQty: c.workOrderQty ?? 0,
          yarnColors: (c.yarnColors || []).map((y) => ({
            ...y,
            color: y.color ?? "",
            yarnCount: y.yarnCount ?? "",
            lotNo: y.lotNo ?? "",
            qty: y.qty ?? "",
            shade: y.shade ?? "",
          })),
        };
      }

      return {
        ...c,
        yarnCount: c.yarnCount ?? "",
        lotNo: c.lotNo ?? "",
        stichLength: c.stichLength ?? "",
        workOrderQty: c.workOrderQty ?? "",
        piId: c.piId ?? "",
        machineDia: c.machineDia ?? "",
        unitePrice: c.unitePrice ?? "",
      };
    }),
  };
};

const lineKey = (line) => line.id ?? line._tempId;
const colorKey = (color) => color.id ?? color._tempId;

const sumColorQty = (line) =>
  (line.yarnColors || []).reduce((s, y) => s + (Number(y.qty) || 0), 0);

const castValue = (field, value) =>
  field.type === "number" ? Number(value) || 0 : String(value ?? "").trim();

// ---------------------------------------------------------
// UI pieces
// ---------------------------------------------------------
const inputBase =
  "w-full rounded-lg border px-3 py-2 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-blue-200 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400";

const labelBase = "block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1";

const inputClass = (changed) =>
  `${inputBase} ${changed ? "border-amber-400 bg-amber-50" : "border-gray-300 bg-white"}`;

// Dropdown. A value that is already saved stays selectable even when the list does not contain it.
const SelectField = ({ label, value, options, placeholder, disabled, changed, onChange }) => {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const shown =
    value && !opts.some((o) => o.value === value) ? [...opts, { value, label: value }] : opts;

  return (
    <div>
      <label className={labelBase}>{label}</label>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(changed)}
      >
        <option value="">{placeholder}</option>
        {shown.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// Lot No + Yarn Count (+ PI No) selects for one line / color.
// Renders grid cells, so place it directly inside a grid container.
// Only stock that covers `qty` is listed (qty empty / 0 = everything).
const LotCountPiFields = ({
  item,
  inventory,
  loading,
  noLots,
  qty,
  showPi,
  disabled,
  isChanged,
  onChange,
}) => {
  const isDefault = isDefaultItem(item);

  // QTY FILTER: lots / counts / PIs must have stock >= the work order qty
  const stock = filterInventoryByQty(inventory, qty);

  // No stock at all, or no stock big enough for the qty: the defaults are offered
  const noStock = noLots || (!loading && stock.length === 0);

  let lotOptions = getAllLots(stock);
  let countOptions = getAllCounts(stock);

  if ((noStock || item.lotNo === DEFAULT_LOT) && !lotOptions.includes(DEFAULT_LOT)) {
    lotOptions = [...lotOptions, DEFAULT_LOT];
  }
  if ((noStock || item.yarnCount === DEFAULT_COUNT) && !countOptions.includes(DEFAULT_COUNT)) {
    countOptions = [...countOptions, DEFAULT_COUNT];
  }

  let piOptions = [];
  if (showPi) {
    if (isDefault) {
      piOptions = [{ value: DEFAULT_PI, label: DEFAULT_PI }];
    } else {
      const pairEntries =
        item.lotNo && item.yarnCount ? getPisForPair(stock, item.lotNo, item.yarnCount) : [];

      piOptions = buildPiOptions(stock, pairEntries);
    }
  }

  const placeholderFor = (what) => (loading ? "Loading..." : `Select ${what}`);

  return (
    <>
      <SelectField
        label="Yarn Lot No"
        value={item.lotNo}
        options={lotOptions}
        placeholder={placeholderFor("lot")}
        disabled={disabled || loading}
        changed={isChanged("lotNo")}
        onChange={(v) => onChange("lotNo", v)}
      />

      <SelectField
        label="Yarn Count"
        value={item.yarnCount}
        options={countOptions}
        placeholder={placeholderFor("count")}
        disabled={disabled || loading}
        changed={isChanged("yarnCount")}
        onChange={(v) => onChange("yarnCount", v)}
      />

      {showPi && (
        <SelectField
          label="PI No"
          value={item.piId}
          options={piOptions}
          placeholder={placeholderFor("PI No")}
          disabled={disabled || loading || isDefault}
          changed={isChanged("piId")}
          onChange={(v) => onChange("piId", v)}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------
// Modal
// ---------------------------------------------------------
const WorkOrderEditModal = ({ setWorkOrderModal, orderType, workOrderReviseData }) => {
  const axiosPrivate = useAxiosPrivate();
  const isYarnDye = orderType === "yarnDyeingOrder";

  const original = useMemo(
    () => normalize(workOrderReviseData?.data, isYarnDye),
    [workOrderReviseData, isYarnDye]
  );

  const [form, setForm] = useState(original);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Lots from /api/lots-work-orders/:orderType (one entry per PI + Lot + Count)
  const [inventory, setInventory] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsLoaded, setLotsLoaded] = useState(false);
  const [lotsSourceInfo, setLotsSourceInfo] = useState("");

  useEffect(() => {
    setForm(original);
    setError("");
    setNotice("");
  }, [original]);

  useEffect(() => {
    setNotice("");
  }, [form]);

  const onClose = () => setWorkOrderModal({ isShowModal: false });

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────── Load the lots ─────────
  // Lots come from the order type's endpoint AND from the yarnDyeingOrder endpoint.
  // Both lists are merged so every order type gets the full stock list.
  useEffect(() => {
    if (!orderType) {
      setInventory([]);
      setLotsLoaded(false);
      setLotsLoading(false);
      setLotsSourceInfo("");
      return undefined;
    }

    let isMounted = true;
    const controller = new AbortController();

    const fetchLots = async () => {
      setLotsLoading(true);
      setLotsLoaded(false);

      // remove "yarnDyeingOrder" here if each order type must only see its own stock
      const LOT_SOURCES = [...new Set([orderType, "yarnDyeingOrder"])];

      const results = await Promise.allSettled(
        LOT_SOURCES.map((source) =>
          axiosPrivate.get(`/api/lots-work-orders/${encodeURIComponent(source)}`, {
            signal: controller.signal,
          })
        )
      );

      if (!isMounted || controller.signal.aborted) return;

      const merged = new Map();
      const info = [];
      let firstError = "";

      results.forEach((result, i) => {
        const source = LOT_SOURCES[i];

        if (result.status === "rejected") {
          const err = result.reason;
          if (err?.code === "ERR_CANCELED") return;
          console.error(`Lots request failed (${source}):`, err);
          if (!firstError) {
            firstError = err?.response?.data?.message || `Failed to load lots (${source}).`;
          }
          info.push(`${source}: failed`);
          return;
        }

        console.log(`Lots API response (${source}):`, result.value.data);

        const entries = extractList(result.value.data)
          .map(normalizeLotEntry)
          // keep every entry that has at least a lot, a count or a PI
          .filter((e) => e.lotNo || e.yarnCount || e.piNo)
          // the default lot / count / PI have no stock bucket
          .filter(
            (e) =>
              e.lotNo !== DEFAULT_LOT && e.yarnCount !== DEFAULT_COUNT && e.piNo !== DEFAULT_PI
          );

        info.push(`${source}: ${entries.length}`);

        entries.forEach((e) => {
          const k = `${e.piNo}|${e.lotNo}|${e.yarnCount}`;
          if (!merged.has(k)) merged.set(k, e);
        });
      });

      setInventory([...merged.values()]);
      setLotsSourceInfo(info.join(" · "));
      setLotsLoaded(true);
      setLotsLoading(false);

      if (merged.size === 0 && firstError) setError(firstError);
    };

    fetchLots();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [axiosPrivate, orderType]);

  // Nothing in the stock: the defaults are offered
  const noLots = lotsLoaded && !lotsLoading && inventory.length === 0;

  // Small status line so it is visible what was loaded
  const lotsStatus = !orderType
    ? "No order type received - lots cannot be loaded."
    : lotsLoading
      ? ""
      : lotsLoaded
        ? `${getAllLots(inventory).length} lots · ${getAllCounts(inventory).length} yarn counts · ${getAllPis(inventory).length} PIs loaded (${lotsSourceInfo}) · filtered by WO Qty`
        : "";

  // ───────── Change tracking ─────────
  const originalById = useMemo(() => {
    const map = {};
    original.compositions.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [original]);

  const lineFields = isYarnDye ? YD_COMP_FIELDS : FIELDS;

  const isFieldChanged = (line, key) => {
    if (line.id == null) return false;
    const o = originalById[line.id];
    return String(o?.[key] ?? "") !== String(line[key] ?? "");
  };

  const isColorFieldChanged = (line, color, key) => {
    if (line.id == null || color.id == null) return false;
    const oLine = originalById[line.id];
    const oColor = (oLine?.yarnColors || []).find((y) => y.id === color.id);
    return String(oColor?.[key] ?? "") !== String(color[key] ?? "");
  };

  const factoryChanged = form.factoryName !== original.factoryName;
  const revisedRemarks = form.revisedRemarks !== original.revisedRemarks;

  // Payload with ONLY what the user edited. null = nothing changed.
  const changesPayload = useMemo(() => {
    const out = { id: form.id };
    let any = false;

    if (factoryChanged) {
      out.factoryName = form.factoryName.trim();
      any = true;
    }
    if (revisedRemarks) {
      out.revisedRemarks = form.revisedRemarks.trim();
      any = true;
    }

    const comps = [];

    form.compositions.forEach((line) => {
      // Brand new line: send every field
      if (line.id == null) {
        if (isYarnDye) {
          comps.push({
            id: null,
            piId: String(line.piId ?? "").trim(),
            workOrderQty: sumColorQty(line),
            yarnColors: (line.yarnColors || []).map((y) => ({
              id: null,
              ...Object.fromEntries(YD_COLOR_FIELDS.map((f) => [f.key, castValue(f, y[f.key])])),
            })),
          });
        } else {
          comps.push({
            id: null,
            ...Object.fromEntries(FIELDS.map((f) => [f.key, castValue(f, line[f.key])])),
          });
        }
        return;
      }

      const entry = { id: line.id };
      let changed = false;

      lineFields.forEach((f) => {
        if (isFieldChanged(line, f.key)) {
          entry[f.key] = castValue(f, line[f.key]);
          changed = true;
        }
      });

      if (isYarnDye) {
        const colors = [];

        (line.yarnColors || []).forEach((y) => {
          // Brand new color: send every field
          if (y.id == null) {
            colors.push({
              id: null,
              ...Object.fromEntries(YD_COLOR_FIELDS.map((f) => [f.key, castValue(f, y[f.key])])),
            });
            return;
          }

          const colorEntry = { id: y.id };
          let colorChanged = false;

          YD_COLOR_FIELDS.forEach((f) => {
            if (isColorFieldChanged(line, y, f.key)) {
              colorEntry[f.key] = castValue(f, y[f.key]);
              colorChanged = true;
            }
          });

          if (colorChanged) colors.push(colorEntry);
        });

        if (colors.length > 0) {
          entry.yarnColors = colors;
          changed = true;

          // composition qty follows its colors, only sent when it really differs
          const newSum = sumColorQty(line);
          const oldQty = toNum(originalById[line.id]?.workOrderQty);
          if (newSum !== oldQty) entry.workOrderQty = newSum;
        }
      }

      if (changed) comps.push(entry);
    });

    if (comps.length > 0) {
      out.compositions = comps;
      any = true;
    }

    return any ? out : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, original, isYarnDye]);

  const hasChanges = changesPayload !== null;

  const totalQty = useMemo(
    () => form.compositions.reduce((s, c) => s + (Number(c.workOrderQty) || 0), 0),
    [form.compositions]
  );

  // ───────── Line handlers ─────────
  const updateLine = (key, field, value) => {
    setForm((prev) => ({
      ...prev,
      compositions: prev.compositions.map((c) => {
        if (lineKey(c) !== key) return c;

        if (INVENTORY_FIELDS.has(field)) {
          return applyInventoryChange(
            c,
            field,
            value,
            filterInventoryByQty(inventory, c.workOrderQty)
          );
        }

        return { ...c, [field]: value };
      }),
    }));
  };

  const addLine = () => {
    setForm((prev) => ({
      ...prev,
      compositions: [...prev.compositions, emptyLine(isYarnDye)],
    }));
  };

  // Only brand new (unsaved) lines can be removed here
  const removeNewLine = (key) => {
    setForm((prev) => ({
      ...prev,
      compositions: prev.compositions.filter((c) => lineKey(c) !== key),
    }));
  };

  // ───────── Yarn color handlers ─────────
  const updateColor = (lineK, colorK, field, value) => {
    setForm((prev) => ({
      ...prev,
      compositions: prev.compositions.map((c) => {
        if (lineKey(c) !== lineK) return c;

        const yarnColors = c.yarnColors.map((y) => {
          if (colorKey(y) !== colorK) return y;

          if (INVENTORY_FIELDS.has(field)) {
            return applyInventoryChange(
              y,
              field,
              value,
              filterInventoryByQty(inventory, y.qty),
              false
            );
          }

          return { ...y, [field]: value };
        });

        const next = { ...c, yarnColors };

        // The PI is on the composition: keep it in step with the lot + count of its colors
        if (field === "lotNo" || field === "yarnCount") {
          next.piId = pickPiForColors(inventory, yarnColors, c.piId);
        }

        return next;
      }),
    }));
  };

  const addColor = (lineK) => {
    setForm((prev) => ({
      ...prev,
      compositions: prev.compositions.map((c) =>
        lineKey(c) === lineK ? { ...c, yarnColors: [...c.yarnColors, emptyColor()] } : c
      ),
    }));
  };

  // Only brand new (unsaved) colors can be removed here
  const removeNewColor = (lineK, colorK) => {
    setForm((prev) => ({
      ...prev,
      compositions: prev.compositions.map((c) =>
        lineKey(c) === lineK
          ? { ...c, yarnColors: c.yarnColors.filter((y) => colorKey(y) !== colorK) }
          : c
      ),
    }));
  };

  // PI options for a yarn dyeing composition: PIs of its colors' lot + count pairs first,
  // then the other PIs of the stock that covers its colors' qty
  const getYdPiOptions = (line) => {
    if ((line.yarnColors || []).some((y) => isDefaultItem(y))) {
      return [{ value: DEFAULT_PI, label: DEFAULT_PI }];
    }

    const pairEntries = (line.yarnColors || [])
      .filter((y) => y.lotNo && y.yarnCount)
      .flatMap((y) =>
        getPisForPair(filterInventoryByQty(inventory, y.qty), y.lotNo, y.yarnCount)
      );

    const unique = [];
    const seen = new Set();
    pairEntries.forEach((e) => {
      if (!seen.has(e.piNo)) {
        seen.add(e.piNo);
        unique.push(e);
      }
    });

    return buildPiOptions(stockForColors(inventory, line.yarnColors), unique);
  };

  const handleReset = () => {
    setForm(original);
    setError("");
    setNotice("");
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!hasChanges || saving) return;

    if (!form.factoryName.trim()) {
      setError("Factory name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      const response = await axiosPrivate.patch(
        `/api/revise-work-order/${encodeURIComponent(orderType)}/${form.id}`,
        changesPayload
      );

      setNotice(response.data.message || "Work order revised successfully.");

      // Reload or update the parent data here if needed.
      setWorkOrderModal({ isShowModal: false });

    } catch (error) {
      setError(
        error.response?.data?.message || "Failed to revise work order."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex flex-col w-full max-w-4xl max-h-[92vh] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Edit {isYarnDye ? "Yarn Dyeing " : ""}Work Order
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {form.factoryName || "Unnamed factory"}
              {form.id != null && (
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                  ID {form.id}
                </span>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 bg-slate-50">
          {lotsLoading && (
            <div className="mx-5 mt-5 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading yarn lots...
            </div>
          )}

          {lotsStatus && <div className="mx-5 mt-5 text-xs text-gray-500">{lotsStatus}</div>}

          {/* Factory */}
          <div className="px-5 pt-5">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <label className={labelBase}>Factory Name</label>
              <input
                type="text"
                value={form.factoryName}
                onChange={(e) => setForm((p) => ({ ...p, factoryName: e.target.value }))}
                className={`${inputBase} ${factoryChanged ? "border-amber-400 bg-amber-50" : "border-gray-300"
                  }`}
                placeholder="Factory name"
              />
            </div>
          </div>
          <div className="px-5 pt-5">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <label className={labelBase}>Remarks</label>
              <input
                type="text"
                value={form.revisedRemarks}
                onChange={(e) => setForm((p) => ({ ...p, revisedRemarks: e.target.value }))}
                className={`${inputBase} ${factoryChanged ? "border-amber-400 bg-amber-50" : "border-gray-300"
                  }`}
                placeholder="Remarks"
              />
            </div>
          </div>

          {/* Section heading */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Compositions</h3>
              <p className="text-xs text-gray-500">
                {form.compositions.length} line{form.compositions.length === 1 ? "" : "s"} · edited
                fields are highlighted
              </p>
            </div>

            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition"
            >
              <Plus className="w-4 h-4" />
              Add Line
            </button>
          </div>

          {/* Composition cards */}
          <div className="space-y-4 px-5 pb-5">
            {form.compositions.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-400">
                No compositions on this work order.
              </div>
            )}

            {form.compositions.map((line, idx) => {
              const key = lineKey(line);
              const isNew = line.id == null;

              return (
                <div
                  key={key}
                  className={`rounded-xl border bg-white shadow-sm ${isNew ? "border-green-300" : "border-gray-200"
                    }`}
                >
                  {/* Card header */}
                  <div
                    className={`flex items-center justify-between rounded-t-xl border-b px-4 py-2.5 ${isNew ? "border-green-200 bg-green-50" : "border-gray-100 bg-slate-50"
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        {isNew ? "New Line" : `Line ${idx + 1}`}
                      </span>
                      {!isNew && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                          ID {line.id}
                        </span>
                      )}
                    </div>

                    {isNew && (
                      <button
                        type="button"
                        onClick={() => removeNewLine(key)}
                        title="Remove new line"
                        className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* ───────── YARN DYEING LAYOUT ───────── */}
                  {isYarnDye ? (
                    <div className="p-4 space-y-4">
                      {/* Composition-level PI */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <SelectField
                          label="PI No"
                          value={line.piId}
                          options={getYdPiOptions(line)}
                          placeholder={lotsLoading ? "Loading..." : "Select PI No"}
                          disabled={lotsLoading || (line.yarnColors || []).some((y) => isDefaultItem(y))}
                          changed={isFieldChanged(line, "piId")}
                          onChange={(v) => updateLine(key, "piId", v)}
                        />
                      </div>

                      {/* Yarn colors (WO Qty is entered per color) */}
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                            Yarn Colors ({line.yarnColors.length})
                          </h4>

                          <button
                            type="button"
                            onClick={() => addColor(key)}
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Color
                          </button>
                        </div>

                        {line.yarnColors.length === 0 && (
                          <div className="rounded-lg border border-dashed border-gray-300 py-5 text-center text-xs text-gray-400">
                            No yarn colors on this line.
                          </div>
                        )}

                        <div className="space-y-3">
                          {line.yarnColors.map((y, yi) => {
                            const yKey = colorKey(y);
                            const yNew = y.id == null;

                            return (
                              <div
                                key={yKey}
                                className={`rounded-lg border p-3 ${yNew ? "border-green-300 bg-green-50/50" : "border-gray-200 bg-slate-50"
                                  }`}
                              >
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-[10px] font-bold text-white">
                                      {yi + 1}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-600">
                                      {yNew ? "New Color" : y.color || `Color ${yi + 1}`}
                                    </span>
                                    {!yNew && (
                                      <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                                        ID {y.id}
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span className="rounded-md bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                                      {formatKg(y.qty)} Kg
                                    </span>

                                    {yNew && (
                                      <button
                                        type="button"
                                        onClick={() => removeNewColor(key, yKey)}
                                        title="Remove new color"
                                        className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {/* Color + Qty */}
                                  {YD_COLOR_FIELDS.filter((f) => f.type !== "select" && f.key !== "shade").map(
                                    (f) => (
                                      <div key={f.key}>
                                        <label className={labelBase}>{f.label}</label>
                                        <input
                                          type={f.type}
                                          step={f.type === "number" ? "any" : undefined}
                                          min={f.type === "number" ? 0 : undefined}
                                          value={y[f.key]}
                                          onChange={(e) => updateColor(key, yKey, f.key, e.target.value)}
                                          className={inputClass(isColorFieldChanged(line, y, f.key))}
                                        />
                                      </div>
                                    )
                                  )}

                                  <LotCountPiFields
                                    item={y}
                                    inventory={inventory}
                                    loading={lotsLoading}
                                    noLots={noLots}
                                    qty={y.qty}
                                    showPi={false}
                                    isChanged={(field) => isColorFieldChanged(line, y, field)}
                                    onChange={(field, value) => updateColor(key, yKey, field, value)}
                                  />

                                  <div>
                                    <label className={labelBase}>Shade (%)</label>
                                    <input
                                      type="text"
                                      value={y.shade}
                                      onChange={(e) => updateColor(key, yKey, "shade", e.target.value)}
                                      className={inputClass(isColorFieldChanged(line, y, "shade"))}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ───────── STANDARD LAYOUT (knitting etc.) ───────── */
                    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <label className={labelBase}>WO Qty (Kg)</label>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          value={line.workOrderQty}
                          onChange={(e) => updateLine(key, "workOrderQty", e.target.value)}
                          className={inputClass(isFieldChanged(line, "workOrderQty"))}
                        />
                      </div>

                      <LotCountPiFields
                        item={line}
                        inventory={inventory}
                        loading={lotsLoading}
                        noLots={noLots}
                        qty={line.workOrderQty}
                        showPi
                        isChanged={(field) => isFieldChanged(line, field)}
                        onChange={(field, value) => updateLine(key, field, value)}
                      />

                      <div>
                        <label className={labelBase}>Stitch Length</label>
                        <input
                          type="text"
                          value={line.stichLength}
                          onChange={(e) => updateLine(key, "stichLength", e.target.value)}
                          className={inputClass(isFieldChanged(line, "stichLength"))}
                        />
                      </div>

                      <div>
                        <label className={labelBase}>Machine Dia</label>
                        <input
                          type="text"
                          value={line.machineDia}
                          onChange={(e) => updateLine(key, "machineDia", e.target.value)}
                          className={inputClass(isFieldChanged(line, "machineDia"))}
                        />
                      </div>

                      <div>
                        <label className={labelBase}>Unit Price</label>
                        <input
                          type="number"
                          step="any"
                          min={0}
                          value={line.unitePrice}
                          onChange={(e) => updateLine(key, "unitePrice", e.target.value)}
                          className={inputClass(isFieldChanged(line, "unitePrice"))}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Total (standard orders only) */}
            {!isYarnDye && form.compositions.length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-3 text-white shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
                  Total WO Qty
                </span>
                <span className="text-base font-bold">{formatKg(totalQty)} Kg</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-gray-100 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-[20px] text-sm">
            {error ? (
              <span className="font-medium text-red-600">{error}</span>
            ) : notice ? (
              <span className="font-medium text-green-600">{notice}</span>
            ) : hasChanges ? (
              <span className="text-amber-600">You have unsaved changes</span>
            ) : (
              <span className="text-gray-400">No changes yet</span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasChanges}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!hasChanges}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkOrderEditModal;