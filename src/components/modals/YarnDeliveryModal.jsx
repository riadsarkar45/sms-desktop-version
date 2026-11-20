import React, { useMemo, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

const DELIVERY_TYPES = [
  "Yarn Delivery For Yarn Dye",
  "Yarn Return From Yarn Dye",
  "Yarn Received From Yarn Dye",
  "Finish Received",
  "Finish Return",
];

// Local date (not UTC) so Dhaka mornings don't get yesterday's date
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];
};

const formatKg = (num) => {
  if (num === undefined || num === null || num === "") return "—";
  return `${Number(num).toLocaleString()} kg`;
};

const isReceiveOrReturnType = (type) => {
  if (!type) return false;
  const value = type.toLowerCase();
  return value.includes("received") || value.includes("return");
};

const normalizeWorkOrders = (input) => {
  if (!input) return [];

  let list = [];
  if (Array.isArray(input)) list = input;
  else if (Array.isArray(input.data)) list = input.data;
  else if (Array.isArray(input.workOrders)) list = input.workOrders;
  else if (input.data && Array.isArray(input.data.workOrders))
    list = input.data.workOrders;
  else if (Array.isArray(input.compositions)) list = [input];

  return list.flatMap((item) =>
    Array.isArray(item?.workOrders) && !Array.isArray(item?.compositions)
      ? item.workOrders
      : [item]
  );
};

const getDeliveryYarnColorId = (d) => {
  const candidates = [
    d?.yarnColorId,
    d?.yarnColorBookingId,
    d?.yarnColorBooking?.id,
    d?.yarnColor?.id,
    d?.yarnId,
  ];
  const found = candidates.find(
    (v) => v !== undefined && v !== null && v !== ""
  );
  return found === undefined ? null : String(found);
};

const pickYarnDeliveries = (yarnColor, comp) => {
  const own = Array.isArray(yarnColor?.deliveries) ? yarnColor.deliveries : [];
  const fromComp = (Array.isArray(comp?.deliveries) ? comp.deliveries : [])
    .filter((d) => getDeliveryYarnColorId(d) === String(yarnColor.id));

  const seen = new Set();
  const result = [];
  for (const d of [...own, ...fromComp]) {
    if (!d) continue;
    const key = d.id !== undefined && d.id !== null ? `id-${d.id}` : null;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    result.push(d);
  }
  return result;
};

const flattenYarnColors = (input) => {
  const orders = normalizeWorkOrders(input);

  return orders.flatMap((wo) => {
    const compositions = Array.isArray(wo?.compositions)
      ? wo.compositions
      : [];

    return compositions.flatMap((comp) => {
      const styleReq = comp?.styleRequirementRow?.styleRequirement || {};

      const yarnColors = Array.isArray(comp?.yarnColors)
        ? comp.yarnColors
        : [];

      return yarnColors.map((yarnColor) => ({
        id: `${wo.id}-${comp.id ?? "c"}-${yarnColor.id}`,
        yarnId: yarnColor.id,
        workOrderId: wo.id,
        factoryName: wo.factoryName || wo.factory?.name || "",
        composition: comp.composition || "—",
        color: yarnColor.color || "—",
        workOrderQty: Number(yarnColor.qty || 0),
        deliveries: pickYarnDeliveries(yarnColor, comp),
        buyerName: styleReq.buyerName || "—",
        jobNo: styleReq.jobNo || "—",
        processLoss: styleReq.processLoss ?? 0,
      }));
    });
  });
};

const countUnmatchedDeliveries = (input) => {
  const orders = normalizeWorkOrders(input);
  let count = 0;

  for (const wo of orders) {
    for (const comp of Array.isArray(wo?.compositions) ? wo.compositions : []) {
      const colorIds = new Set(
        (Array.isArray(comp?.yarnColors) ? comp.yarnColors : []).map((yc) =>
          String(yc.id)
        )
      );
      for (const d of Array.isArray(comp?.deliveries) ? comp.deliveries : []) {
        const id = getDeliveryYarnColorId(d);
        if (!id || !colorIds.has(id)) count += 1;
      }
    }
  }
  return count;
};

const computeDeliveryTotals = (deliveries = [], workOrderQty = 0) => {
  let totalDelivery = 0;
  let totalReturn = 0;

  for (const delivery of deliveries) {
    const type = String(delivery?.deliveryType || "").toLowerCase();
    const qty = Number(delivery?.deliveryQty ?? delivery?.qty ?? 0) || 0;

    if (type.includes("return")) {
      totalReturn += qty;
    } else if (type.includes("delivery") || type.includes("received")) {
      totalDelivery += qty;
    }
  }

  return {
    totalDelivery,
    totalReturn,
    remaining: Number(workOrderQty || 0) + totalReturn - totalDelivery,
  };
};

const YarnDeliveryModal = ({
  isOpen,
  onClose,
  deliveries,
  changedField,
  handleEditOnChange,
  isFetching,
  // called after a successful save: ({ savedYarnIds, workOrderIds }) => Promise | void
  onSaved,
}) => {
  const axiosPrivate = useAxiosPrivate();

  const [openYarnIds, setOpenYarnIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  // { type: "success" | "error", title?, message }[]
  const [messages, setMessages] = useState([]);

  const busy = submitting;

  const rows = useMemo(() => flattenYarnColors(deliveries), [deliveries]);
  const unmatchedCount = useMemo(
    () => countUnmatchedDeliveries(deliveries),
    [deliveries]
  );

  const styleReq = rows[0] || {};

  const totalWorkOrderQty = rows.reduce(
    (sum, row) => sum + row.workOrderQty,
    0
  );

  const groupList = useMemo(() => {
    const groups = {};
    for (const row of rows) {
      if (!groups[row.workOrderId]) {
        groups[row.workOrderId] = {
          workOrderId: row.workOrderId,
          factoryName: row.factoryName,
          rows: [],
        };
      }
      groups[row.workOrderId].rows.push(row);
    }
    return Object.values(groups);
  }, [rows]);

  const toggleRow = (yarnId) => {
    setOpenYarnIds((prev) => {
      const next = new Set(prev);
      if (next.has(yarnId)) next.delete(yarnId);
      else next.add(yarnId);
      return next;
    });
  };

  const closeRow = (yarnId) => {
    setOpenYarnIds((prev) => {
      const next = new Set(prev);
      next.delete(yarnId);
      return next;
    });
  };

  const openAllRows = () => setOpenYarnIds(new Set(rows.map((r) => r.yarnId)));
  const closeAllRows = () => setOpenYarnIds(new Set());

  const aggregateDeliveries = (deliveriesArr = []) => {
    const map = {};
    for (const delivery of deliveriesArr) {
      const type = delivery.deliveryType;
      const qty = Number(delivery.deliveryQty ?? delivery.qty ?? 0) || 0;
      if (!map[type]) map[type] = 0;
      map[type] += qty;
    }
    return map;
  };

  const labelOf = (row) => `${row.composition} / ${row.color} (ID ${row.yarnId})`;

  // Returns { error } or { item } where item is exactly what the backend expects.
  const buildItem = (row) => {
    const values = changedField?.[row.yarnId] || {};
    const label = labelOf(row);

    if (!values.deliveryType) {
      return { error: `Please select a Delivery Type for ${label}` };
    }
    if (!DELIVERY_TYPES.includes(values.deliveryType)) {
      return { error: `Invalid Delivery Type for ${label}` };
    }

    const qty = Number(values.deliveryQty);
    if (
      values.deliveryQty === undefined ||
      values.deliveryQty === "" ||
      !Number.isFinite(qty) ||
      qty <= 0
    ) {
      return { error: `Please enter a valid Quantity for ${label}` };
    }

    const challanNo = Number(values.challanNo);
    if (
      values.challanNo === undefined ||
      String(values.challanNo).trim() === "" ||
      !Number.isInteger(challanNo) ||
      challanNo <= 0
    ) {
      return { error: `Please enter a valid Challan No (whole number) for ${label}` };
    }

    const receiveOrReturn = isReceiveOrReturnType(values.deliveryType);
    const toFactory = String(
      values.toFactory ?? (receiveOrReturn ? "" : row.factoryName)
    ).trim();
    const fromFactory = String(
      values.fromFactory ?? (receiveOrReturn ? row.factoryName : "")
    ).trim();

    if (!toFactory) return { error: `Please enter To Factory for ${label}` };
    if (!fromFactory) return { error: `Please enter From Factory for ${label}` };

    return {
      item: {
        yarnId: row.yarnId,
        workOrderId: row.workOrderId,
        toFactory,
        fromFactory,
        date: values.date || todayStr(),
        challanNo,
        deliveries: [{ deliveryType: values.deliveryType, qty }],
      },
    };
  };

  const handleGlobalSubmit = async () => {
    if (busy) return;

    const rowsToSubmit = rows.filter((row) => openYarnIds.has(row.yarnId));

    if (rowsToSubmit.length === 0) {
      alert("Please open at least one yarn color (click Add Delivery).");
      return;
    }

    // validate EVERY row first, send nothing if one is wrong
    const errors = [];
    const items = [];
    for (const row of rowsToSubmit) {
      const result = buildItem(row);
      if (result.error) errors.push(result.error);
      else items.push(result.item);
    }

    if (errors.length > 0) {
      alert(errors.join("\n"));
      return;
    }

    setSubmitting(true);
    setMessages([]);

    try {
      // ONE request for every color. The backend saves all of them or none.
      const res = await axiosPrivate.post("/api/yarn-dye-deliveries", { items });

      setMessages([
        {
          type: "success",
          title: "Success",
          message: res.data?.message || `${items.length} yarn color(s) delivered`,
        },
      ]);

      await onSaved?.({
        savedYarnIds: items.map((i) => i.yarnId),
        workOrderIds: [...new Set(items.map((i) => i.workOrderId))],
      });

      onClose?.();
    } catch (err) {
      const data = err?.response?.data;
      const labelByYarn = new Map(rowsToSubmit.map((r) => [String(r.yarnId), labelOf(r)]));

      const list = Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.map((e) => {
            const label = labelByYarn.get(String(e.yarnId));
            return {
              type: "error",
              title: label
                ? `${label}${e.deliveryType ? ` — ${e.deliveryType}` : ""}`
                : e.title || "Error",
              message: e.message || e.msg || e.error || "Validation failed",
            };
          })
        : [
            {
              type: "error",
              title: "Error",
              message: data?.message || "Something went wrong. Nothing was saved.",
            },
          ];

      setMessages(list);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) {
          onClose?.();
        }
      }}
    >
      <div className="flex flex-col w-full max-w-6xl max-h-[92vh] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Yarn Dyeing Delivery
            </h2>
            <p className="text-[10px] text-gray-400 mt-1">
              Manage yarn dyeing deliveries and returns
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Strip */}
        <div className="grid grid-cols-3 border-b border-gray-100 bg-slate-50">
          {[
            { label: "Buyer", value: styleReq.buyerName || "—", accent: true },
            { label: "Work Order Qty", value: formatKg(totalWorkOrderQty) },
            { label: "Process Loss", pill: `${styleReq.processLoss || 0}%` },
          ].map((item, index) => (
            <div key={index} className="px-4 py-3 border-r border-gray-100">
              <span className="block mb-1 text-[9px] font-semibold tracking-wider uppercase text-gray-400">
                {item.label}
              </span>

              {item.pill ? (
                <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                  ⚠ {item.pill}
                </span>
              ) : (
                <span
                  className={`font-semibold text-sm ${
                    item.accent ? "text-indigo-500" : "text-slate-800"
                  }`}
                >
                  {item.value}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Open all / Close all */}
        {!isFetching && rows.length > 1 && (
          <div className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 bg-white">
            <span className="text-[10px] text-gray-400 mr-auto">
              {rows.length} yarn colors in this work order
            </span>
            <button
              type="button"
              onClick={openAllRows}
              disabled={busy}
              className="text-[11px] font-semibold px-3 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
            >
              Open all
            </button>
            <button
              type="button"
              onClick={closeAllRows}
              disabled={busy || openYarnIds.size === 0}
              className="text-[11px] font-semibold px-3 py-1 rounded-md bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
            >
              Close all
            </button>
          </div>
        )}

        {/* Success / Error messages */}
        {messages.length > 0 && (
          <div className="max-h-28 overflow-y-auto px-5 pb-2">
            {messages.map((m, index) => (
              <div
                key={index}
                className={`${
                  m.type === "success"
                    ? "bg-green-100 border border-green-300 text-green-700"
                    : "bg-red-100 border border-red-300 text-red-700"
                } p-3 rounded-md mt-2 flex items-center gap-3`}
              >
                {m.type === "success" ? (
                  <Check className="w-5 h-5 shrink-0" />
                ) : (
                  <X className="w-5 h-5 shrink-0" />
                )}
                <div>
                  <h2 className="text-xs font-bold">{m.title}</h2>
                  <p className="text-[11px]">{m.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unmatched deliveries notice */}
        {!isFetching && unmatchedCount > 0 && (
          <div className="mx-5 mt-2 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-md text-[11px]">
            {unmatchedCount} delivery record(s) came from the server without a
            yarn color id (<b>yarnId</b>), so they cannot be shown under a
            specific color. The deliveries API needs to return{" "}
            <b>yarnId</b> for each delivery.
          </div>
        )}

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          {isFetching ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : groupList.length === 0 ? (
            <div className="py-10 text-center text-[11px] tracking-widest uppercase text-gray-300">
              No yarn colors found
            </div>
          ) : (
            groupList.map((group) => (
              <div key={group.workOrderId}>
                {groupList.length > 1 && (
                  <div className="px-5 pt-3 pb-1 flex items-center gap-2 bg-gray-50">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                      {group.factoryName || "Work Order"}
                    </span>
                  </div>
                )}

                {group.rows.map((row) => {
                  const aggregated = aggregateDeliveries(row.deliveries);

                  const { remaining } = computeDeliveryTotals(
                    row.deliveries,
                    row.workOrderQty
                  );

                  const isRowOpen = openYarnIds.has(row.yarnId);
                  const rowChangedField = changedField?.[row.yarnId] || {};

                  const receiveOrReturn = isReceiveOrReturnType(
                    rowChangedField.deliveryType
                  );

                  const toFactoryValue =
                    rowChangedField.toFactory ??
                    (receiveOrReturn ? "" : group.factoryName || "");

                  const fromFactoryValue =
                    rowChangedField.fromFactory ??
                    (receiveOrReturn ? group.factoryName || "" : "");

                  return (
                    <div
                      key={row.id}
                      className={`flex flex-col px-5 py-4 gap-3 ${
                        isRowOpen ? "bg-green-50" : "bg-white"
                      }`}
                    >
                      {/* Row Chips */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          type="button"
                          onClick={() => toggleRow(row.yarnId)}
                          className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800 cursor-pointer hover:bg-violet-100"
                        >
                          {row.composition} ID: {row.yarnId}
                        </button>

                        <span className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800">
                          {row.color}
                        </span>

                        <span className="text-[10px] text-gray-400">
                          {formatKg(row.workOrderQty)} work order qty
                        </span>

                        {row.workOrderQty > 0 && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                              remaining > 0
                                ? "bg-blue-50 text-blue-600 border-blue-200"
                                : remaining < 0
                                  ? "bg-red-50 text-red-600 border-red-200"
                                  : "bg-green-50 text-green-600 border-green-200"
                            }`}
                          >
                            {formatKg(Math.abs(remaining))}{" "}
                            {remaining > 0
                              ? "remaining"
                              : remaining < 0
                                ? "excess"
                                : "fulfilled"}
                          </span>
                        )}

                        {!isRowOpen && (
                          <button
                            type="button"
                            onClick={() => toggleRow(row.yarnId)}
                            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold px-3 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Delivery
                          </button>
                        )}
                      </div>

                      {/* Existing Delivery History */}
                      {Object.keys(aggregated).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(aggregated).map(([type, qty]) => (
                            <div
                              key={type}
                              className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5"
                            >
                              <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                                {type}
                              </span>
                              <span className="text-[11px] font-bold text-slate-700">
                                {formatKg(qty)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Delivery Inputs */}
                      {isRowOpen && (
                        <div className="flex flex-wrap gap-2 items-end">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              Qty
                            </span>
                            <input
                              onChange={(e) => handleEditOnChange(row.yarnId, e)}
                              name="deliveryQty"
                              value={rowChangedField.deliveryQty ?? ""}
                              className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
                              type="number"
                              min="0"
                              placeholder="Qty"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              Challan
                            </span>
                            <input
                              onChange={(e) => handleEditOnChange(row.yarnId, e)}
                              name="challanNo"
                              value={rowChangedField.challanNo ?? ""}
                              className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
                              type="number"
                              min="1"
                              step="1"
                              placeholder="Challan No"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              Date
                            </span>
                            <input
                              onChange={(e) => handleEditOnChange(row.yarnId, e)}
                              name="date"
                              value={rowChangedField.date ?? todayStr()}
                              className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
                              type="date"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              To Factory
                            </span>
                            <input
                              onChange={(e) => handleEditOnChange(row.yarnId, e)}
                              name="toFactory"
                              value={toFactoryValue}
                              className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
                              type="text"
                              placeholder="To Factory"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              From Factory
                            </span>
                            <input
                              onChange={(e) => handleEditOnChange(row.yarnId, e)}
                              name="fromFactory"
                              value={fromFactoryValue}
                              className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
                              type="text"
                              placeholder="From Factory"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              Type
                            </span>
                            <select
                              onChange={(e) => handleEditOnChange(row.yarnId, e)}
                              name="deliveryType"
                              value={rowChangedField.deliveryType ?? ""}
                              className="outline-none border border-gray-200 p-3 rounded-md w-56 text-xs bg-white"
                              required
                            >
                              <option value="" disabled>
                                Select Delivery Type
                              </option>
                              {DELIVERY_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={() => closeRow(row.yarnId)}
                            disabled={busy}
                            className="cursor-pointer bg-red-500 bg-opacity-15 text-red-600 p-3 rounded-lg"
                            title="Close this row"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {openYarnIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-[11px] text-gray-400 mr-auto">
              {openYarnIds.size} color(s) ready to submit
            </span>

            <button
              type="button"
              onClick={handleGlobalSubmit}
              disabled={busy}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                busy
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-green-500 bg-opacity-15 text-green-600 hover:bg-opacity-25"
              }`}
            >
              {busy ? (
                <Loader2 className="animate-spin w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Submit All
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default YarnDeliveryModal;