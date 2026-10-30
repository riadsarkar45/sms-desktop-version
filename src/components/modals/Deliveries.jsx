import React, { useState, useMemo } from "react";
import { Check, Loader2, X } from "lucide-react";
import Input from "../InputText/Input";
import { useFetchData } from "../../hooks/fetch";

const formatKg = (num) => {
  if (!num && num !== 0) return "—";
  return `${Number(num).toLocaleString()} kg`;
};

// "dyeingOrder" -> "Dyeing Order"
const prettyOrderType = (t) => {
  if (!t) return "N/A";
  const spaced = String(t).replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const norm = (v) => String(v ?? "").trim().toLowerCase();

const GREY_FABRIC_RECEIVED = "Grey Fabric Received";
const GREY_DELIVERY = "Grey Delivery";

// Delivery types available per order type.
const DELIVERY_TYPES_BY_ORDER = {
  knittingOrder: ["Yarn Delivery", "Yarn Return", GREY_FABRIC_RECEIVED],
  dyeingOrder: [
    "Grey Delivery",
    "Grey Received",
    "Grey Return",
    "Received From Compacting",
    "Received From Reprocess",
    "Received From HEAT Set",
    "Received From Trumble",
  ],
  aopOrder: ["Sent For Aop", "Return From Aop", "Received From Aop"],
  yarnDyeingOrder: [
    "Yarn Delivery For Yarn Dye",
    "Yarn Return From Yarn Dye",
    "Yarn Received From Yarn Dye",
    "Finish Received",
    "Finish Return",
  ],
};

// Receive/return types -> this factory goes in "From".
// All other (sending) types -> this factory goes in "To".
const isReceiveOrReturnType = (deliveryType) => {
  if (!deliveryType) return false;
  const t = deliveryType.toLowerCase();
  return t.includes("received") || t.includes("return");
};

// Internal processing steps — toFactory/fromFactory not required.
const FACTORY_OPTIONAL_DELIVERY_TYPES = new Set([
  "Received From Compacting",
  "Received From Reprocess",
  "Received From HEAT Set",
]);

const isFactoryOptional = (deliveryType) =>
  FACTORY_OPTIONAL_DELIVERY_TYPES.has(deliveryType);

const getDefaultFactories = (isReturnOrReceive, factoryName) => ({
  toFactory: !isReturnOrReceive ? (factoryName || "") : "",
  fromFactory: isReturnOrReceive ? (factoryName || "") : "",
});

// Totals for a list of deliveries (same rules as the row's "remaining" chip).
//  - greyDeliveryQty : sum of "Grey Delivery" only
//  - totalDelivery   : every type containing "delivery" or "sent"
//  - totalReturn     : every type containing "return"
//  - remaining       : workOrderQty + totalReturn - totalDelivery
const computeDeliveryTotals = (deliveriesArr, workOrderQty) => {
  let totalDelivery = 0;
  let totalReturn = 0;
  let greyDeliveryQty = 0;

  for (const d of deliveriesArr || []) {
    const type = String(d.deliveryType || "");
    const lower = type.toLowerCase();
    const qty = Number(d.deliveryQty ?? d.qty ?? 0) || 0;

    if (type === GREY_DELIVERY) greyDeliveryQty += qty;

    if (lower.includes("return")) totalReturn += qty;
    else if (lower.includes("delivery") || lower.includes("sent")) totalDelivery += qty;
  }

  const remaining = (Number(workOrderQty) || 0) + totalReturn - totalDelivery;
  return { greyDeliveryQty, totalDelivery, totalReturn, remaining };
};

const flattenDeliveries = (workOrders) => {
  return (workOrders || []).flatMap((wo) =>
    (wo.compositions || []).map((comp, compIndex) => {
      const styleReq = comp.styleRequirementRow?.styleRequirement || {};
      const compId = comp.id ?? comp.compositionId ?? comp.yarnId;
      return {
        id: `${wo.id}-${compId}`,
        yarnId: compId,
        compIndex,
        workOrderId: wo.id,
        orderType: wo.orderType,
        factoryName: wo.factoryName,
        composition: comp.composition || "—",
        color: comp.color || "—",
        workOrderQty: comp.workOrderQty || 0,
        deliveries: comp.deliveries || [],
        buyerName: styleReq.buyerName || comp.buyerName || comp.styleRequirementRow?.buyerName,
        jobNo: styleReq.jobNo || comp.jobNo,
        processLoss: styleReq.processLoss ?? comp.processLoss ?? comp.styleRequirementRow?.processLoss,
      };
    })
  );
};

// Normalises whatever useFetchData returns:
//  - plain body:      { workOrders: [...] }
//  - axios response:  { data: { workOrders: [...] } }
// Flattens every composition and adds the delivery totals for each one.
const extractLinkedCompositions = (res) => {
  const body = res?.data?.workOrders ? res.data : res;
  const workOrders = Array.isArray(body?.workOrders) ? body.workOrders : [];
  return workOrders.flatMap((wo) =>
    (wo.compositions || []).map((c, compIndex) => {
      const totals = computeDeliveryTotals(c.deliveries, c.workOrderQty);
      return {
        ...c,
        id: c.id ?? c.compositionId ?? c.yarnId,
        compIndex,
        factoryName: wo.factoryName,
        workOrderOrderType: wo.orderType,
        workOrderId: wo.id ?? wo.workOrderId ?? c.workOrderId,
        greyDeliveryQty: totals.greyDeliveryQty,
        remainingQty: totals.remaining,
      };
    })
  );
};

// Picks ONLY the compositions that belong to this row:
//  1) match by composition + color (when the API returns them)
//  2) fallback: same position (compIndex) as this row
const pickMatchingCompositions = (items, row) => {
  const byName = items.filter(
    (it) =>
      it.composition !== undefined &&
      it.color !== undefined &&
      norm(it.composition) === norm(row.composition) &&
      norm(it.color) === norm(row.color)
  );
  if (byName.length > 0) return byName;

  const hasNames = items.some((it) => it.composition !== undefined || it.color !== undefined);
  if (hasNames) return []; // API sent names but none matched -> show nothing wrong

  const byIndex = items[row.compIndex];
  return byIndex ? [byIndex] : [];
};

const hasFactory = (item) => norm(item?.factoryName) !== "";

// tone: "default" | "blue" | "red" | "green"
const PILL_TONES = {
  default: "bg-white border-blue-100",
  blue: "bg-blue-50 border-blue-200",
  red: "bg-red-50 border-red-200",
  green: "bg-green-50 border-green-200",
};

const InfoPill = ({ label, value, tone = "default" }) => (
  <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[11px] ${PILL_TONES[tone] || PILL_TONES.default}`}>
    <span className="text-gray-400">{label}</span>
    <span className="font-semibold text-gray-800">{value}</span>
  </span>
);

// Compact strip under the row chips. The factory pill is clickable:
// clicking selects that linked composition (and its factory).
const LinkedCompositionStrip = ({ details, selectedId, knittingFactory, pendingQty, onSelect }) => {
  if (!details) return null;

  const items = details.items || [];
  const canSelect = !details.loading && !details.error && items.length > 0;
  const selectedItem = items.find((it) => !!selectedId && it.id === selectedId);

  const pending = Number(pendingQty) || 0;
  const remainingAfter = selectedItem ? (Number(selectedItem.remainingQty) || 0) - pending : 0;

  return (
    <div className="flex flex-wrap items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
      <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-blue-700 mr-1">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Linked Composition
      </span>

      {details.loading ? (
        <span className="flex items-center gap-1.5 text-[11px] text-blue-700">
          <Loader2 className="animate-spin w-3.5 h-3.5" />
          Loading...
        </span>
      ) : details.error ? (
        <span className="text-[11px] text-red-600">{details.error}</span>
      ) : items.length === 0 ? (
        <span className="text-[11px] text-gray-500">No linked composition found</span>
      ) : (
        items.map((item) => {
          const isSelected = !!selectedId && selectedId === item.id;
          const selectable = hasFactory(item);
          const remaining = Number(item.remainingQty) || 0;
          const remainingTone = remaining > 0 ? "blue" : remaining < 0 ? "red" : "green";
          const remainingLabel =
            remaining > 0 ? "Remaining" : remaining < 0 ? "Excess" : "Fulfilled";

          return (
            <div key={`${item.workOrderId ?? "wo"}-${item.id}`} className="flex flex-wrap items-center gap-1.5">
              <InfoPill label="ID" value={item.id ?? "N/A"} />
              <InfoPill label="Order Type" value={prettyOrderType(item.orderType || item.workOrderOrderType)} />

              <button
                type="button"
                disabled={!selectable}
                onClick={() => onSelect(item)}
                title={selectable ? "Click to select this factory" : "No factory name on record"}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border transition-colors ${
                  isSelected
                    ? "bg-indigo-500 border-indigo-500 text-white"
                    : selectable
                      ? "bg-white border-blue-200 text-gray-800 hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer"
                      : "bg-white border-blue-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
                <span className={isSelected ? "text-indigo-100" : "text-gray-400"}>Factory</span>
                <span className="font-semibold">{hasFactory(item) ? item.factoryName : "N/A"}</span>
              </button>

              {item.composition && <InfoPill label="Composition" value={item.composition} />}
              {item.color && <InfoPill label="Color" value={item.color} />}
              {item.workOrderQty !== undefined && item.workOrderQty !== null && (
                <InfoPill label="WO Qty" value={formatKg(item.workOrderQty)} />
              )}

              {/* Grey Delivery qty already sent to this dyeing composition */}
              <InfoPill label="Grey Delivery" value={formatKg(item.greyDeliveryQty ?? 0)} />

              {/* Remaining delivery qty for this dyeing composition */}
              {Number(item.workOrderQty) > 0 && (
                <InfoPill
                  label={remainingLabel}
                  value={formatKg(Math.abs(remaining))}
                  tone={remainingTone}
                />
              )}
            </div>
          );
        })
      )}

      {canSelect && !selectedId && (
        <span className="text-[10px] text-blue-600 w-full">
          Click the factory to also send this delivery as “Grey Delivery” to that composition.
        </span>
      )}
      {canSelect && selectedId && (
        <span className="text-[10px] text-green-700 w-full">
          Grey Delivery for ID {selectedId} will also be submitted — same challan &amp; qty,
          from {knittingFactory || "knitting factory"} to the selected factory.
          {selectedItem && pending > 0 && (
            <>
              {" "}
              {remainingAfter >= 0 ? (
                <>Remaining after this delivery: <b>{formatKg(remainingAfter)}</b>.</>
              ) : (
                <span className="text-red-600 font-semibold">
                  This exceeds the remaining qty by {formatKg(Math.abs(remainingAfter))}.
                </span>
              )}
            </>
          )}
        </span>
      )}
    </div>
  );
};

const DeliveryRowInputs = ({
  row,
  group,
  rowChangedField,
  isReturnOrReceive,
  orderType,
  deliveryTypes,
  handleEditOnChange,
  handleTypeChange,
  handleRemove,
}) => {
  const defaults = getDefaultFactories(isReturnOrReceive, group.factoryName);

  const toFactoryValue = rowChangedField.toFactory ?? defaults.toFactory;
  const fromFactoryValue = rowChangedField.fromFactory ?? defaults.fromFactory;

  const factoryOptional = isFactoryOptional(rowChangedField.deliveryType);

  return (
    <div className="flex flex-wrap gap-2 items-end">
      <div className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wider text-gray-400">Qty</span>
        <input
          onChange={(e) => handleEditOnChange(row.yarnId, e)}
          name="deliveryQty"
          value={rowChangedField.deliveryQty ?? ""}
          className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
          type="text"
          placeholder="Qty"
        />
      </div>

      {((rowChangedField.deliveryType === "Grey Received" && (orderType === "dyeingOrder" || orderType === "aopOrder")) || rowChangedField.deliveryType === "Received From Aop") && (
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wider text-gray-400">Finish Qty</span>
          <input
            onChange={(e) => handleEditOnChange(row.yarnId, e)}
            name="finishReceivedQty"
            value={rowChangedField.finishReceivedQty ?? ""}
            className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
            type="text"
            placeholder="Finish Qty"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wider text-gray-400">Challan</span>
        <input
          onChange={(e) => handleEditOnChange(row.yarnId, e)}
          name="challanNo"
          value={rowChangedField.challanNo ?? ""}
          className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
          type="text"
          placeholder="Challan No"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[9px] uppercase tracking-wider text-gray-400">Date</span>
        <input
          onChange={(e) => handleEditOnChange(row.yarnId, e)}
          name="date"
          value={rowChangedField.date ?? new Date().toISOString().split("T")[0]}
          className="outline-none border border-gray-200 p-3 rounded-md w-40 text-xs"
          type="date"
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className={`text-[9px] uppercase tracking-wider ${factoryOptional ? "text-gray-300" : "text-gray-400"}`}>
          {orderType === "aopOrder" && "Aop Factory"}
          {orderType === "dyeingOrder" && "Dyeing Factory"}
          {orderType === "knittingOrder" && "Knitting Factory"}
          {factoryOptional && " (optional)"}
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
        <span className={`text-[9px] uppercase tracking-wider ${factoryOptional ? "text-gray-300" : "text-gray-400"}`}>
          From{factoryOptional && " (optional)"}
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
        <span className="text-[9px] uppercase tracking-wider text-gray-400">Type</span>
        <Input
          className="w-full"
          onChange={(e) => handleTypeChange(row, e)}
          name="deliveryType"
          type="select"
          value={rowChangedField.deliveryType ?? ""}
          options={deliveryTypes}
          required
        />
      </div>

      <div className="flex gap-2 items-center pb-0.5">
        <span onClick={() => handleRemove(row.id, row.yarnId)} className="cursor-pointer bg-red-500 bg-opacity-15 text-red-600 p-2 rounded-lg">
          <X className="w-4 h-4" />
        </span>
      </div>
    </div>
  );
};

const Deliveries = ({ deliveries, deliveryIssue, challanIssue, orderType, changedField, handleEditOnChange, handleSubmit, isLoading }) => {
  const [openYarnIds, setOpenYarnIds] = useState(new Set());

  // Linked composition(s) per row (keyed by the row's yarnId):
  // { loading: boolean, items: [...matched compositions only], error?: string }
  const [compositionDetails, setCompositionDetails] = useState({});

  // The linked composition the user picked (by clicking its factory), keyed by the row's yarnId.
  // Only a selected linked composition receives the extra "Grey Delivery".
  const [selectedLinked, setSelectedLinked] = useState({});

  const baseRows = flattenDeliveries(deliveries);
  const styleReq = baseRows.find((r) => r.buyerName || r.processLoss) || {};
  const totalWorkOrderQty = baseRows.reduce((sum, r) => sum + (r.workOrderQty || 0), 0);

  const [removedIds, setRemovedIds] = useState(new Set());
  const [selectedDeliveryTypes, setDeliveryTypes] = useState([]);
  const visibleRows = baseRows.filter((r) => !removedIds.has(r.id));

  const { fetchData } = useFetchData();

  const groupedRows = visibleRows.reduce((groups, row) => {
    const key = row.workOrderId;
    if (!groups[key]) {
      groups[key] = { workOrderId: row.workOrderId, factoryName: row.factoryName, jobNo: row.jobNo, rows: [] };
    }
    groups[key].rows.push(row);
    return groups;
  }, {});
  const groupList = Object.values(groupedRows);

  const clearLinkedForRow = (yarnId) => {
    setCompositionDetails((prev) => {
      const next = { ...prev };
      delete next[yarnId];
      return next;
    });
    setSelectedLinked((prev) => {
      const next = { ...prev };
      delete next[yarnId];
      return next;
    });
  };

  const handleRemove = (id, yarnId) => {
    setRemovedIds((prev) => new Set([...prev, id]));
    setOpenYarnIds((prev) => {
      const next = new Set(prev);
      next.delete(yarnId);
      return next;
    });
    clearLinkedForRow(yarnId);
  };

  const deliveryTypes = useMemo(
    () => DELIVERY_TYPES_BY_ORDER[orderType] ?? [],
    [orderType]
  );

  // Writes a value into the row's changedField through the parent's normal handler.
  const setRowField = (yarnId, name, value) => {
    handleEditOnChange(yarnId, { target: { name, value, type: "text" } });
  };

  // The knitting factory = the modal's delivery factory = this row's work order factory.
  const getKnittingFactory = (row) =>
    groupedRows[row.workOrderId]?.factoryName || row.factoryName || "";

  // User clicked a linked composition's factory.
  //  - To Factory   = the clicked (dyeing) factory
  //  - From Factory = the knitting factory (the modal's delivery factory)
  //  - clicking again deselects and clears both (only if they still hold those values)
  const handleSelectLinked = (row, item) => {
    if (!item || !hasFactory(item)) return; // nothing to select -> nothing happens

    const knittingFactory = getKnittingFactory(row);
    const currentlySelected = selectedLinked[row.yarnId];
    const rowChangedField = changedField?.[row.yarnId] || {};

    if (currentlySelected?.id === item.id) {
      setSelectedLinked((prev) => {
        const next = { ...prev };
        delete next[row.yarnId];
        return next;
      });
      if (rowChangedField.toFactory === item.factoryName) {
        setRowField(row.yarnId, "toFactory", "");
      }
      if (knittingFactory && rowChangedField.fromFactory === knittingFactory) {
        setRowField(row.yarnId, "fromFactory", "");
      }
      return;
    }

    setSelectedLinked((prev) => ({ ...prev, [row.yarnId]: item }));
    setRowField(row.yarnId, "toFactory", item.factoryName);
    if (knittingFactory) {
      setRowField(row.yarnId, "fromFactory", knittingFactory);
    }
  };

  const handleTypeChange = async (row, e) => {
    handleEditOnChange(row.yarnId, e);

    const selectedType = e?.target?.value;

    const next =
      selectedType === GREY_FABRIC_RECEIVED
        ? selectedDeliveryTypes.includes(row.yarnId)
          ? selectedDeliveryTypes
          : [...selectedDeliveryTypes, row.yarnId]
        : selectedDeliveryTypes.filter((id) => id !== row.yarnId);

    setDeliveryTypes(next);

    if (selectedType === GREY_FABRIC_RECEIVED) {
      const jobNo = row.jobNo || groupedRows[row.workOrderId]?.jobNo;

      // a fresh selection of the type starts with nothing selected
      setSelectedLinked((prev) => {
        const n = { ...prev };
        delete n[row.yarnId];
        return n;
      });

      if (!jobNo) {
        setCompositionDetails((prev) => ({
          ...prev,
          [row.yarnId]: { loading: false, items: [], error: "Job No not found for this row" },
        }));
        return;
      }

      setCompositionDetails((prev) => ({
        ...prev,
        [row.yarnId]: { loading: true, items: [] },
      }));

      try {
        const res = await fetchData(`/api/get-join-deliveries/${jobNo}`);
        const allItems = extractLinkedCompositions(res);

        // keep ONLY the composition(s) that belong to this row
        const items = pickMatchingCompositions(allItems, row);

        setCompositionDetails((prev) => ({
          ...prev,
          [row.yarnId]: { loading: false, items },
        }));
      } catch (err) {
        console.error(err);
        setCompositionDetails((prev) => ({
          ...prev,
          [row.yarnId]: { loading: false, items: [], error: "Failed to load composition details" },
        }));
      }
    } else {
      // switched to a different type -> drop linked data and selection
      clearLinkedForRow(row.yarnId);
    }
  };

  const aggregateDeliveries = (deliveriesArr) => {
    const map = {};
    for (const d of deliveriesArr) {
      if (!map[d.deliveryType]) map[d.deliveryType] = 0;
      map[d.deliveryType] += Number(d.deliveryQty || 0);
    }
    return map;
  };

  const handleShowDeliveryInputs = (yarnId) => {
    setOpenYarnIds((prev) => {
      const next = new Set(prev);
      if (next.has(yarnId)) next.delete(yarnId);
      else next.add(yarnId);
      return next;
    });
  };

  // Returns { error } or { payload }.
  // When a linked composition is selected (Grey Fabric Received only), the extra
  // "Grey Delivery" travels INSIDE the payload as `linkedDeliveries`. The parent's
  // handleSubmit sends it first (and strips it from the main payload).
  const buildRowPayload = (row) => {
    const rowChangedField = changedField?.[row.yarnId] || {};
    const group = groupedRows[row.workOrderId];

    if (!rowChangedField.deliveryType) {
      return { error: `Please select a Delivery Type for ${row.composition}` };
    }
    if (!rowChangedField.deliveryQty || Number(rowChangedField.deliveryQty) <= 0) {
      return { error: `Please enter a valid Quantity for ${row.composition}` };
    }

    const parsedQty = Number(rowChangedField.deliveryQty);
    const parsedFinishQty = rowChangedField.finishReceivedQty ? Number(rowChangedField.finishReceivedQty) : 0;

    let finalDeliveries = [];
    if (rowChangedField.deliveries && rowChangedField.deliveries.length > 0) {
      finalDeliveries = rowChangedField.deliveries.map((d) => ({
        deliveryType: d.deliveryType,
        qty: d.qty ? Number(d.qty) : 0,
      }));
    } else {
      finalDeliveries = [
        { deliveryType: rowChangedField.deliveryType, qty: parsedQty },
        ...(parsedFinishQty > 0
          ? [{
            deliveryType: rowChangedField.deliveryType === "Aop Grey Received" ? "Finish Received From Aop" : "Finish Received",
            qty: parsedFinishQty,
          }]
          : []),
      ];
    }

    const isReturnOrReceive = isReceiveOrReturnType(rowChangedField.deliveryType);
    const groupFactoryName = group?.factoryName || row.factoryName || ""; // knitting factory
    const defaults = getDefaultFactories(isReturnOrReceive, groupFactoryName);

    const date = rowChangedField.date || new Date().toISOString().split("T")[0];
    const challanNo = rowChangedField.challanNo || "";

    // Selected linked composition (only meaningful for Grey Fabric Received)
    const linkedItem =
      rowChangedField.deliveryType === GREY_FABRIC_RECEIVED && selectedLinked[row.yarnId]?.id
        ? selectedLinked[row.yarnId]
        : null;

    // With a linked factory selected:
    //   To   = the selected (dyeing) factory
    //   From = the knitting factory (this modal's delivery factory)
    const resolvedToFactory = linkedItem && hasFactory(linkedItem)
      ? linkedItem.factoryName
      : (rowChangedField.toFactory ?? defaults.toFactory);
    const resolvedFromFactory = linkedItem && groupFactoryName
      ? groupFactoryName
      : (rowChangedField.fromFactory ?? defaults.fromFactory);

    const fullPayload = {
      ...rowChangedField,
      toFactory: resolvedToFactory,
      fromFactory: resolvedFromFactory,
      date,
      challanNo,
      deliveryType: rowChangedField.deliveryType,
      deliveryQty: parsedQty,
      finishReceivedQty: parsedFinishQty,
      deliveries: finalDeliveries,
    };

    const factoryOptional = isFactoryOptional(rowChangedField.deliveryType);

    if (!factoryOptional && !fullPayload.toFactory) {
      return {
        error: !groupFactoryName
          ? `This work order has no factory name on record, so "To Factory" couldn't be auto-filled for ${row.composition}. Please type it in manually, or fix the factory name on the work order.`
          : `Please enter a To Factory for ${row.composition}`,
      };
    }
    if (!factoryOptional && !fullPayload.fromFactory) {
      return {
        error: !groupFactoryName
          ? `This work order has no factory name on record, so "From Factory" couldn't be auto-filled for ${row.composition}. Please type it in manually, or fix the factory name on the work order.`
          : `Please enter a From Factory for ${row.composition}`,
      };
    }

    // ── Linked "Grey Delivery" for the selected dyeing composition (by yarn id) ──
    // No linked data / nothing selected -> nothing extra is sent.
    if (linkedItem) {
      fullPayload.linkedDeliveries = [
        {
          yarnId: linkedItem.id,
          workOrderId: linkedItem.workOrderId, // may be undefined -> simply not sent
          payload: {
            deliveryType: GREY_DELIVERY,
            deliveryQty: parsedQty,
            finishReceivedQty: 0,
            challanNo,
            date,
            fromFactory: fullPayload.fromFactory, // knitting factory
            toFactory: fullPayload.toFactory,     // selected dyeing factory
            factoryOptional: false,
            deliveries: [{ deliveryType: GREY_DELIVERY, qty: parsedQty }],
          },
        },
      ];
    }

    return { payload: fullPayload };
  };

  // Validate every selected row first, collect every error.
  // If anything is invalid, submit NOTHING. Otherwise one handleSubmit per row
  // (the parent also sends the row's linked Grey Delivery, if any).
  const handleGlobalSubmit = async () => {
    const rowsToSubmit = visibleRows.filter((r) => openYarnIds.has(r.yarnId));

    const errors = [];
    const payloadsByYarnId = {};

    for (const row of rowsToSubmit) {
      const result = buildRowPayload(row);
      if (result.error) {
        errors.push(result.error);
      } else {
        payloadsByYarnId[row.yarnId] = result.payload;
      }
    }

    if (errors.length > 0) {
      alert(errors.join("\n"));
      return;
    }

    for (const row of rowsToSubmit) {
      await handleSubmit(row.yarnId, row.workOrderId, payloadsByYarnId[row.yarnId]);
    }
  };

  return (
    <div className="flex flex-col border border-gray-200 rounded-xl bg-white text-sm">

      {/* Info Strip */}
      <div className="grid grid-cols-3 border-b border-gray-100">
        {[
          { label: "Buyer", value: styleReq?.buyerName || "—", accent: true },
          { label: "Work Order Qty", value: formatKg(totalWorkOrderQty) },
          { label: "Process Loss", pill: `${styleReq?.processLoss || 0}%` },
        ].map((c, i) => (
          <div key={i} className={`px-4 py-3 ${i < 3 ? "border-r border-gray-100" : ""}`}>
            <span className="block mb-1 text-[9px] font-semibold tracking-wider uppercase text-gray-400">{c.label}</span>
            {c.pill ? (
              <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                ⚠ {c.pill}
              </span>
            ) : (
              <span className={`font-semibold text-sm ${c.accent ? "text-indigo-500" : "text-slate-800"}`}>{c.value}</span>
            )}
          </div>
        ))}
      </div>

      {challanIssue?.length > 0 && (
        challanIssue.map((issue, index) => (
          <div key={index} className="bg-green-100 border border-green-500 text-green-700 p-4 rounded-md mb-3 mt-2 flex items-center gap-3">
            <Check className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-bold">{issue.title || "Success"}</h2>
              <p>{issue.message}</p>
            </div>
          </div>
        ))
      )}

      {(deliveryIssue?.deliveries?.length > 0 || (Array.isArray(deliveryIssue) && deliveryIssue.length > 0)) && (
        (deliveryIssue.deliveries || deliveryIssue).map((issue, index) => (
          <div key={index} className={`${issue.type === "error" ? "bg-red-100 border border-red-500 text-red-700" : "bg-amber-100 border border-amber-500 text-amber-700"} p-4 rounded-md mb-3 mt-2 flex items-center gap-3`}>
            <X className="w-6 h-6" />
            <div>
              <h2 className="text-lg font-bold">{issue.title || "Error"}</h2>
              <p>{issue.message}</p>
            </div>
          </div>
        ))
      )}

      <div className="overflow-y-auto max-h-[32rem] divide-y divide-gray-100">
        {groupList.length === 0 ? (
          <div className="py-10 text-center text-[11px] tracking-widest uppercase text-gray-300">No compositions found</div>
        ) : (
          groupList.map((group) => (
            <div key={group.workOrderId}>
              {groupList.length > 1 && (
                <div className="px-5 pt-3 pb-1 flex items-center gap-2 bg-gray-50">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">
                    {group.factoryName || `Job No #${group.jobNo}`}
                  </span>
                </div>
              )}

              {group.rows.map((row) => {
                const aggregated = aggregateDeliveries(row.deliveries);
                const { remaining: remainingDelivery } = computeDeliveryTotals(
                  row.deliveries,
                  row.workOrderQty
                );

                const isOpen = openYarnIds.has(row.yarnId);
                const rowChangedField = changedField?.[row.yarnId] || {};
                const isReturnOrReceive = isReceiveOrReturnType(rowChangedField.deliveryType);
                const details = compositionDetails[row.yarnId];
                const selectedItem = selectedLinked[row.yarnId];

                return (
                  <div key={row.id} className={`${isOpen && "bg-green-300 bg-opacity-30 p-2"} flex flex-col px-5 py-4 gap-3`}>

                    <div className="flex items-center gap-3 flex-wrap">
                      <span
                        onClick={() => handleShowDeliveryInputs(row.yarnId)}
                        className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800 cursor-pointer"
                      >
                        {row.composition} ID: {row.yarnId}
                      </span>
                      <span
                        className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800 cursor-pointer"
                      >
                        {row.color}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {row.workOrderQty > 0 ? formatKg(row.workOrderQty) : "No Qty"} work order qty
                      </span>

                      {row.workOrderQty > 0 && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${remainingDelivery > 0 ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          remainingDelivery < 0 ? 'bg-red-50 text-red-600 border-red-200' :
                            'bg-green-50 text-green-600 border-green-200'
                          }`}>
                          {formatKg(Math.abs(remainingDelivery))} {remainingDelivery > 0 ? 'remaining' : remainingDelivery < 0 ? 'excess' : 'fulfilled'}
                        </span>
                      )}

                      {!group.factoryName && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-600 border-red-200">
                          ⚠ No factory set on this work order
                        </span>
                      )}
                    </div>

                    {Object.keys(aggregated).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(aggregated).map(([type, qty]) => (
                          <div key={type} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{type}</span>
                            <span className="text-[11px] font-bold text-slate-700">{formatKg(qty)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isOpen && (
                      <>
                        {/* Only THIS row's linked composition; click its factory to select */}
                        <LinkedCompositionStrip
                          details={details}
                          selectedId={selectedItem?.id}
                          knittingFactory={getKnittingFactory(row)}
                          pendingQty={rowChangedField.deliveryQty}
                          onSelect={(item) => handleSelectLinked(row, item)}
                        />

                        <DeliveryRowInputs
                          row={row}
                          group={group}
                          rowChangedField={rowChangedField}
                          isReturnOrReceive={isReturnOrReceive}
                          orderType={orderType}
                          deliveryTypes={deliveryTypes}
                          handleEditOnChange={handleEditOnChange}
                          handleTypeChange={handleTypeChange}
                          handleRemove={handleRemove}
                        />
                      </>
                    )}

                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {openYarnIds.size > 0 && (
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <span className="text-[11px] text-gray-400">
            {openYarnIds.size} composition{openYarnIds.size > 1 ? "s" : ""} ready to submit
          </span>
          <button
            onClick={handleGlobalSubmit}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isLoading
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-green-500 bg-opacity-15 text-green-600 hover:bg-opacity-25 cursor-pointer"
              }`}
          >
            {isLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <Check className="w-4 h-4" />}
            Submit All
          </button>
        </div>
      )}
    </div>
  );
};

export default Deliveries;