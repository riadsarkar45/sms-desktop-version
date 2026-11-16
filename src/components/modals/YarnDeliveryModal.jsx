
import React, { useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

const DELIVERY_TYPES = [
  "Yarn Delivery For Yarn Dye",
  "Yarn Return From Yarn Dye",
  "Yarn Received From Yarn Dye",
  "Finish Received",
  "Finish Return",
];

const formatKg = (num) => {
  if (num === undefined || num === null || num === "") return "—";
  return `${Number(num).toLocaleString()} kg`;
};

const isReceiveOrReturnType = (type) => {
  if (!type) return false;

  const value = type.toLowerCase();

  return value.includes("received") || value.includes("return");
};

const flattenYarnColors = (workOrders) => {
  const orders = Array.isArray(workOrders) ? workOrders : [];

  return orders.flatMap((wo) => {
    const compositions = Array.isArray(wo?.compositions)
      ? wo.compositions
      : [];

    return compositions.flatMap((comp) => {
      const styleReq =
        comp?.styleRequirementRow?.styleRequirement || {};

      const yarnColors = Array.isArray(comp?.yarnColors)
        ? comp.yarnColors
        : [];

      return yarnColors.map((yarnColor) => ({
        id: `${wo.id}-${yarnColor.id}`,
        yarnId: yarnColor.id,
        workOrderId: wo.id,
        factoryName: wo.factoryName || "",
        composition: comp.composition || "—",
        color: yarnColor.color || "—",
        workOrderQty: Number(yarnColor.qty || 0),
        deliveries: Array.isArray(yarnColor.deliveries)
          ? yarnColor.deliveries
          : Array.isArray(comp.deliveries)
            ? comp.deliveries
            : [],
        buyerName: styleReq.buyerName || "—",
        jobNo: styleReq.jobNo || "—",
        processLoss: styleReq.processLoss ?? 0,
      }));
    });
  });
};

const computeDeliveryTotals = (deliveries = [], workOrderQty = 0) => {
  let totalDelivery = 0;
  let totalReturn = 0;

  for (const delivery of deliveries) {
    const type = String(delivery?.deliveryType || "").toLowerCase();
    const qty = Number(
      delivery?.deliveryQty ?? delivery?.qty ?? 0
    ) || 0;

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

const InfoPill = ({ label, value }) => (
  <span className="inline-flex items-center gap-1.5 border border-gray-200 rounded-full px-2.5 py-1 text-[11px] bg-white">
    <span className="text-gray-400">{label}</span>
    <span className="font-semibold text-gray-800">{value}</span>
  </span>
);

const YarnDeliveryModal = ({
  isOpen,
  onClose,
  deliveries,
  changedField,
  handleEditOnChange,
  handleSubmit,
  isLoading,
  challanIssue,
  deliveryIssue,
}) => {
  const [openYarnIds, setOpenYarnIds] = useState(new Set());

  const rows = useMemo(
    () => flattenYarnColors(deliveries),
    [deliveries]
  );

  const styleReq = rows[0] || {};

  const totalWorkOrderQty = rows.reduce(
    (sum, row) => sum + row.workOrderQty,
    0
  );

  const groupedRows = useMemo(() => {
    return rows.reduce((groups, row) => {
      if (!groups[row.workOrderId]) {
        groups[row.workOrderId] = {
          workOrderId: row.workOrderId,
          factoryName: row.factoryName,
          rows: [],
        };
      }

      groups[row.workOrderId].rows.push(row);

      return groups;
    }, {});
  }, [rows]);

  const groupList = Object.values(groupedRows);

  const handleShowDeliveryInputs = (yarnId) => {
    setOpenYarnIds((prev) => {
      const next = new Set(prev);

      if (next.has(yarnId)) {
        next.delete(yarnId);
      } else {
        next.add(yarnId);
      }

      return next;
    });
  };

  const handleRemove = (yarnId) => {
    setOpenYarnIds((prev) => {
      const next = new Set(prev);
      next.delete(yarnId);
      return next;
    });
  };

  const aggregateDeliveries = (deliveriesArr = []) => {
    const map = {};

    for (const delivery of deliveriesArr) {
      const type = delivery.deliveryType;
      const qty = Number(
        delivery.deliveryQty ?? delivery.qty ?? 0
      ) || 0;

      if (!map[type]) map[type] = 0;

      map[type] += qty;
    }

    return map;
  };

  const buildRowPayload = (row) => {
    const values = changedField?.[row.yarnId] || {};

    if (!values.deliveryType) {
      return {
        error: `Please select a Delivery Type for ${row.color}`,
      };
    }

    if (!DELIVERY_TYPES.includes(values.deliveryType)) {
      return {
        error: `Invalid Delivery Type for ${row.color}`,
      };
    }

    if (
      values.deliveryQty === undefined ||
      values.deliveryQty === "" ||
      !Number.isFinite(Number(values.deliveryQty)) ||
      Number(values.deliveryQty) <= 0
    ) {
      return {
        error: `Please enter a valid Quantity for ${row.color}`,
      };
    }

    const receiveOrReturn = isReceiveOrReturnType(
      values.deliveryType
    );

    const defaults = {
      toFactory: receiveOrReturn ? "" : row.factoryName,
      fromFactory: receiveOrReturn ? row.factoryName : "",
    };

    const toFactory = values.toFactory ?? defaults.toFactory;
    const fromFactory = values.fromFactory ?? defaults.fromFactory;

    if (!String(toFactory).trim()) {
      return {
        error: `Please enter To Factory for ${row.color}`,
      };
    }

    if (!String(fromFactory).trim()) {
      return {
        error: `Please enter From Factory for ${row.color}`,
      };
    }

    const deliveryQty = Number(values.deliveryQty);

    const date =
      values.date || new Date().toISOString().split("T")[0];

    const payload = {
      ...values,
      deliveryType: values.deliveryType,
      deliveryQty,
      challanNo: values.challanNo || "",
      date,
      toFactory,
      fromFactory,
      finishReceivedQty: 0,
      deliveries: [
        {
          deliveryType: values.deliveryType,
          qty: deliveryQty,
        },
      ],
    };

    return { payload };
  };

  const handleGlobalSubmit = async () => {
    if (isLoading) return;

    const rowsToSubmit = rows.filter((row) =>
      openYarnIds.has(row.yarnId)
    );

    if (rowsToSubmit.length === 0) {
      alert("Please select at least one yarn color.");
      return;
    }

    const errors = [];
    const payloads = {};

    // Validate all rows before submitting.
    for (const row of rowsToSubmit) {
      const result = buildRowPayload(row);

      if (result.error) {
        errors.push(result.error);
      } else {
        payloads[row.yarnId] = result.payload;
      }
    }

    if (errors.length > 0) {
      alert(errors.join("\n"));
      return;
    }

    for (const row of rowsToSubmit) {
      await handleSubmit(
        row.yarnId,
        row.workOrderId,
        payloads[row.yarnId]
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
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
            disabled={isLoading}
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Strip */}
        <div className="grid grid-cols-3 border-b border-gray-100 bg-slate-50">
          {[
            {
              label: "Buyer",
              value: styleReq.buyerName || "—",
              accent: true,
            },
            {
              label: "Work Order Qty",
              value: formatKg(totalWorkOrderQty),
            },
            {
              label: "Process Loss",
              pill: `${styleReq.processLoss || 0}%`,
            },
          ].map((item, index) => (
            <div
              key={index}
              className="px-4 py-3 border-r border-gray-100"
            >
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
                    item.accent
                      ? "text-indigo-500"
                      : "text-slate-800"
                  }`}
                >
                  {item.value}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Success Messages */}
        <div className="max-h-28 overflow-y-auto px-5">
          {challanIssue?.map((issue, index) => (
            <div
              key={index}
              className="bg-green-100 border border-green-300 text-green-700 p-3 rounded-md mt-2 flex items-center gap-3"
            >
              <Check className="w-5 h-5 shrink-0" />

              <div>
                <h2 className="text-xs font-bold">
                  {issue.title || "Success"}
                </h2>
                <p className="text-[11px]">{issue.message}</p>
              </div>
            </div>
          ))}

          {(deliveryIssue?.deliveries || deliveryIssue || [])
            .map?.((issue, index) => (
              <div
                key={index}
                className="bg-red-100 border border-red-300 text-red-700 p-3 rounded-md mt-2 flex items-center gap-3"
              >
                <X className="w-5 h-5 shrink-0" />

                <div>
                  <h2 className="text-xs font-bold">
                    {issue.title || "Error"}
                  </h2>
                  <p className="text-[11px]">{issue.message}</p>
                </div>
              </div>
            ))}
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">

          {groupList.length === 0 ? (
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
                  const aggregated = aggregateDeliveries(
                    row.deliveries
                  );

                  const { remaining } = computeDeliveryTotals(
                    row.deliveries,
                    row.workOrderQty
                  );

                  const isOpen = openYarnIds.has(row.yarnId);

                  const rowChangedField =
                    changedField?.[row.yarnId] || {};

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
                        isOpen ? "bg-green-50" : "bg-white"
                      }`}
                    >
                      {/* Row Chips */}
                      <div className="flex items-center gap-3 flex-wrap">

                        <button
                          type="button"
                          onClick={() =>
                            handleShowDeliveryInputs(row.yarnId)
                          }
                          className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800"
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
                      </div>

                      {/* Existing Delivery History */}
                      {Object.keys(aggregated).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(aggregated).map(
                            ([type, qty]) => (
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
                            )
                          )}
                        </div>
                      )}

                      {/* Delivery Inputs */}
                      {isOpen && (
                        <div className="flex flex-wrap gap-2 items-end">

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              Qty
                            </span>

                            <input
                              onChange={(e) =>
                                handleEditOnChange(row.yarnId, e)
                              }
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
                              onChange={(e) =>
                                handleEditOnChange(row.yarnId, e)
                              }
                              name="challanNo"
                              value={rowChangedField.challanNo ?? ""}
                              className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
                              type="text"
                              placeholder="Challan No"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              Date
                            </span>

                            <input
                              onChange={(e) =>
                                handleEditOnChange(row.yarnId, e)
                              }
                              name="date"
                              value={
                                rowChangedField.date ??
                                new Date().toISOString().split("T")[0]
                              }
                              className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
                              type="date"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] uppercase tracking-wider text-gray-400">
                              To Factory
                            </span>

                            <input
                              onChange={(e) =>
                                handleEditOnChange(row.yarnId, e)
                              }
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
                              onChange={(e) =>
                                handleEditOnChange(row.yarnId, e)
                              }
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
                              onChange={(e) =>
                                handleEditOnChange(row.yarnId, e)
                              }
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
                            onClick={() => handleRemove(row.yarnId)}
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
              disabled={isLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                isLoading
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-green-500 bg-opacity-15 text-green-600 hover:bg-opacity-25"
              }`}
            >
              {isLoading ? (
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
