import { Fragment, useMemo, useState } from "react";
import { X, ChevronDown, ArrowUpRight, Loader2, Clock } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// All user-facing wording lives here. Edit or translate in one place.
// ─────────────────────────────────────────────────────────────
const LABELS = {
  currentSituation: "Current Situation",
  jobNo: "Job No",
  orderType: "Order Type",
  factory: "Factory",
  factoryWiseTitle: "Factory wise work orders",
  orderQty: { label: "Work Order Qty", hint: "Quantity in the work order" },
  totalSent: { label: "Total Sent", hint: "Everything sent to the factory, minus what was returned" },
  returned: { label: "Returned", hint: "Sent back to us by the factory" },
  totalReceived: { label: "Total Received", hint: "Everything the factory has sent back to us" },
  partyStock: { label: "Party Stock", hint: "Still with the factory (Total Sent − Total Received)" },
  awaitingDelivery: {
    label: "Awaiting Delivery",
    hint: "Work Order Qty minus what has been delivered (after returns)",
  },
  extraSent: { label: "Extra Sent", hint: "More was sent than the work order quantity" },
  extra: "Excess",
  sentPct: "sent",
  sentTo: "Sent to:",
  notSpecified: "Not specified",
  workOrder: "WO",
  total: "Total",
  loading: "Loading details...",
  empty: "No details found.",
  legendSent: "Sent",
  legendReturned: "Returned",
  legendReceived: "Received",
  howToRead: "How to read this table",
  howToReadLines: [
    "Work Order Qty: quantity in the work order.",
    "Awaiting Delivery: Work Order Qty minus what has been delivered (after returns). If it shows red \"Excess\", more was delivered than ordered.",
    "Total Received: everything the factory has sent back (all received columns added together).",
    "Party Stock: material delivered to the factory (after returns) minus Total Received. This is the material still with the factory.",
  ],
};

// ─────────────────────────────────────────────────────────────
// Column order per order type. Use AWAITING to place the Awaiting Delivery column.
// Order types not listed here use the default order:
//   sent -> Awaiting Delivery -> received -> returned -> other
// Any delivery type not listed for an order type is added at the end, so nothing is lost.
// ─────────────────────────────────────────────────────────────
const AWAITING = "__awaiting";

const COLUMN_ORDER = {
  dyeingOrder: [
    "Grey Delivery",
    "Grey Return",
    AWAITING,
    "Grey Received",
    "Finish Received",
    // the other "Received From ..." columns follow automatically
  ],
};

function fmt(n) {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

// zero shows as a dash so the many type columns stay readable
const fmtCell = (n) => (n ? fmt(n) : <span className="text-neutral-300">–</span>);

const showName = (name) => (name === "Unknown" ? LABELS.notSpecified : name);

// "Grey Received", "GreyReceived", "grey received" all match
const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

// "21 Sep 2026" and "10:39 AM"
const fmtDate = (d) => d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
const fmtTime = (d) => d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

const KIND = {
  sent: { head: "bg-emerald-50 text-emerald-700", cell: "text-neutral-800", dot: "bg-emerald-500", label: LABELS.legendSent },
  returned: { head: "bg-amber-50 text-amber-700", cell: "text-amber-700", dot: "bg-amber-500", label: LABELS.legendReturned },
  received: { head: "bg-blue-50 text-blue-700", cell: "text-blue-700", dot: "bg-blue-500", label: LABELS.legendReceived },
  other: { head: "bg-neutral-100 text-neutral-600", cell: "text-neutral-600", dot: "bg-neutral-400", label: "Other" },
};

const kindOf = (kind) => KIND[kind] || KIND.other;

function buildLayout(columns, orderType) {
  const awaiting = { deliveryType: AWAITING, kind: "awaiting" };
  const byKind = (k) => columns.filter((c) => c.kind === k);
  const other = columns.filter((c) => !["sent", "returned", "received"].includes(c.kind));

  // Default order: sent -> Awaiting Delivery -> received -> returned -> other
  const defaultOrder = [...byKind("sent"), awaiting, ...byKind("received"), ...byKind("returned"), ...other];

  const wanted = COLUMN_ORDER[orderType];
  if (!wanted) return defaultOrder;

  const used = new Set();
  const result = [];

  for (const name of wanted) {
    if (name === AWAITING) {
      result.push(awaiting);
      used.add(AWAITING);
      continue;
    }
    const col = columns.find((c) => norm(c.deliveryType) === norm(name));
    if (col && !used.has(col.deliveryType)) {
      result.push(col);
      used.add(col.deliveryType);
    }
  }

  // anything not listed goes at the end, in the default order
  defaultOrder.forEach((item) => {
    if (!used.has(item.deliveryType)) result.push(item);
  });

  return result;
}

// Positive = still awaiting delivery (green). Negative = more was delivered than ordered (red, "Excess").
function AwaitingDelivery({ value }) {
  const over = value < 0;
  return (
    <span
      className={over ? "text-red-600" : "text-emerald-600"}
      title={over ? LABELS.extraSent.hint : LABELS.awaitingDelivery.hint}
    >
      {over ? `${fmt(Math.abs(value))} ${LABELS.extra}` : fmt(value)}
    </span>
  );
}

function Stat({ label, hint, children }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums text-neutral-900 mt-0.5">{children}</div>
      {hint && <div className="text-[10px] leading-tight text-neutral-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function SummaryCard({ summary }) {
  const {
    workOrderQty = 0,
    deliveredQty = 0,
    pendingQty = 0,
    returnedQty = 0,
    receivedQty = 0,
    yetToReceive = 0,
    // toFactory = [],
  } = summary || {};

  const isOver = pendingQty < 0;
  const hasWo = workOrderQty > 0;
  const rawPct = hasWo ? (deliveredQty / workOrderQty) * 100 : 0;
  const barWidth = Math.min(100, Math.max(0, rawPct));

  return (
    <div className="mx-5 mt-4 mb-1 rounded-lg border border-neutral-200 bg-neutral-50/60 px-4 py-3.5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-4">
        <Stat label={LABELS.orderQty.label} hint={LABELS.orderQty.hint}>
          {fmt(workOrderQty)}
        </Stat>
        <Stat label={LABELS.totalSent.label} hint={LABELS.totalSent.hint}>
          {fmt(deliveredQty)}
        </Stat>
        <Stat
          label={isOver ? LABELS.extraSent.label : LABELS.awaitingDelivery.label}
          hint={isOver ? LABELS.extraSent.hint : LABELS.awaitingDelivery.hint}
        >
          <span className={isOver ? "text-red-600" : "text-emerald-600"}>{fmt(Math.abs(pendingQty))}</span>
        </Stat>
        <Stat label={LABELS.returned.label} hint={LABELS.returned.hint}>
          <span className="text-amber-600">{fmt(returnedQty)}</span>
        </Stat>
        <Stat label={LABELS.totalReceived.label} hint={LABELS.totalReceived.hint}>
          <span className="text-blue-600">{fmt(receivedQty)}</span>
        </Stat>
        <Stat label={LABELS.partyStock.label} hint={LABELS.partyStock.hint}>
          {fmt(yetToReceive)}
        </Stat>
      </div>

      {hasWo && (
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${isOver ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-neutral-500 tabular-nums">
            {rawPct.toFixed(1)}% {LABELS.sentPct}
          </div>
        </div>
      )}

      {/* {toFactory.length > 0 && (
        <div className="mt-3 pt-3 border-t border-neutral-200 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
          <ArrowUpRight size={13} className="text-blue-500" />
          {LABELS.sentTo}
          {toFactory.map((t) => (
            <span key={t.factory} className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 tabular-nums">
              {showName(t.factory)}: {fmt(t.qty)}
            </span>
          ))}
        </div>
      )} */}
    </div>
  );
}

// One data cell for a layout column (works for factory rows, work order rows and the total row)
function LayoutCell({ item, data, className }) {
  if (item.kind === "awaiting") {
    return (
      <td className={`${className} whitespace-nowrap font-medium`}>
        <AwaitingDelivery value={data?.pendingQty || 0} />
      </td>
    );
  }
  return (
    <td className={`${className} ${kindOf(item.kind).cell}`}>{fmtCell(data?.types?.[item.deliveryType])}</td>
  );
}

function DeliveryTable({ columns, rows, summary, orderType }) {
  const [open, setOpen] = useState(null);
  if (!rows?.length) return null;

  const layout = buildLayout(columns, orderType);

  // factory, work order qty, [layout columns], total received, party stock
  const colCount = layout.length + 4;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px] text-neutral-500">
        <span className="font-medium tracking-wide">{LABELS.factoryWiseTitle}</span>
        {["sent", "returned", "received"].map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${KIND[k].dot}`} />
            {KIND[k].label}
          </span>
        ))}
      </div>

      <div className="border border-neutral-200 rounded-md overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] text-neutral-500 border-b border-neutral-200">
              <th className="sticky left-0 z-10 bg-neutral-50 text-left font-medium px-3 py-2 min-w-[190px]">
                {LABELS.factory}
              </th>
              <th
                title={LABELS.orderQty.hint}
                className="bg-neutral-50 text-right font-medium px-3 py-2 whitespace-nowrap"
              >
                {LABELS.orderQty.label}
              </th>
              {layout.map((item) =>
                item.kind === "awaiting" ? (
                  <th
                    key={item.deliveryType}
                    title={LABELS.awaitingDelivery.hint}
                    className="bg-neutral-50 text-right font-medium px-3 py-2 whitespace-nowrap"
                  >
                    {LABELS.awaitingDelivery.label}
                  </th>
                ) : (
                  <th
                    key={item.deliveryType}
                    className={`text-right font-medium px-3 py-2 whitespace-nowrap ${kindOf(item.kind).head}`}
                  >
                    {item.deliveryType}
                  </th>
                )
              )}
              <th
                title={LABELS.totalReceived.hint}
                className="bg-blue-50 text-blue-700 text-right font-medium px-3 py-2 whitespace-nowrap"
              >
                {LABELS.totalReceived.label}
              </th>
              <th
                title={LABELS.partyStock.hint}
                className="bg-neutral-50 text-right font-medium px-3 py-2 whitespace-nowrap"
              >
                {LABELS.partyStock.label}
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.factory;
              return (
                <Fragment key={r.factory}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : r.factory)}
                    className="group cursor-pointer border-b border-neutral-100 hover:bg-neutral-50"
                  >
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-neutral-50 px-3 py-2 text-neutral-800">
                      <span className="flex items-center gap-1.5">
                        <ChevronDown
                          size={14}
                          className={`shrink-0 text-neutral-400 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                        />
                        <span>{showName(r.factory)}</span>
                        <span className="text-[11px] text-neutral-400">({r.workOrders.length})</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.workOrderQty)}</td>
                    {layout.map((item) => (
                      <LayoutCell
                        key={item.deliveryType}
                        item={item}
                        data={r}
                        className="px-3 py-2 text-right tabular-nums"
                      />
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmtCell(r.receivedQty)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(r.yetToReceive)}</td>
                  </tr>

                  {isOpen &&
                    r.workOrders.map((wo, idx) => (
                      <Fragment key={`${wo.workOrderNo}-${idx}`}>
                        <tr className="text-[13px] text-neutral-600 bg-neutral-50/50 border-b border-neutral-100">
                          <td className="sticky left-0 z-10 bg-neutral-50 pl-10 pr-3 py-1.5">
                            {LABELS.workOrder} #{wo.workOrderNo}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(wo.workOrderQty)}</td>
                          {layout.map((item) => (
                            <LayoutCell
                              key={item.deliveryType}
                              item={item}
                              data={wo}
                              className="px-3 py-1.5 text-right tabular-nums"
                            />
                          ))}
                          <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">
                            {fmtCell(wo.receivedQty)}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(wo.yetToReceive)}</td>
                        </tr>

                        {wo.toFactory?.length > 0 && (
                          <tr className="bg-neutral-50/50 border-b border-neutral-100">
                            <td colSpan={colCount} className="pl-10 pr-3 pb-2 pt-0.5">
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                                <ArrowUpRight size={12} className="text-blue-500" />
                                {LABELS.sentTo}
                                {wo.toFactory.map((t) => (
                                  <span
                                    key={t.factory}
                                    className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 tabular-nums"
                                  >
                                    {showName(t.factory)}: {fmt(t.qty)}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                </Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="border-t border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-900">
              <td className="sticky left-0 z-10 bg-neutral-50 px-3 py-2">{LABELS.total}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(summary?.workOrderQty)}</td>
              {layout.map((item) => (
                <LayoutCell
                  key={item.deliveryType}
                  item={item}
                  data={summary}
                  className="px-3 py-2 text-right tabular-nums"
                />
              ))}
              <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmtCell(summary?.receivedQty)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(summary?.yetToReceive)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Plain-language explanation for non-technical users */}
      <div className="mt-3 rounded-md bg-neutral-50 border border-neutral-200 px-3 py-2.5">
        <div className="text-[11px] font-medium text-neutral-600 mb-1">{LABELS.howToRead}</div>
        <ul className="space-y-0.5 text-[11px] text-neutral-500 list-disc pl-4">
          {LABELS.howToReadLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// jobDetails = response.data.data
// { jobNo, orderType, columns, summary, factoryWise }
const JobModal = ({ isOpen, jobDetails, loading, onClose }) => {
  // Time the details were loaded. Recomputed only when new details arrive, so it does not tick.
  // (Hooks must run before the early return below.)
  const asOf = useMemo(() => new Date(), [jobDetails]);

  if (!isOpen) return null;

  const isEmpty = !jobDetails || !jobDetails.factoryWise?.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-6xl max-h-[88vh] bg-white rounded-lg shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 px-5 py-4 border-b border-neutral-200">
          {/* Left: title + date and time */}
          <div>
            <div className="text-lg font-semibold text-neutral-900">{LABELS.currentSituation}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-neutral-500 tabular-nums">
              <Clock size={12} className="text-neutral-400" />
              {fmtDate(asOf)} · {fmtTime(asOf)}
            </div>
          </div>

          {/* Right: job no + order type + close */}
          <div className="flex items-start gap-6">
            <div className="flex gap-8 text-right">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-neutral-400 font-medium">{LABELS.jobNo}</div>
                <div className="text-lg font-semibold text-neutral-900 mt-0.5">{jobDetails?.jobNo || "—"}</div>
              </div>
              {jobDetails?.orderType && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-neutral-400 font-medium">
                    {LABELS.orderType}
                  </div>
                  <div className="text-lg font-semibold text-neutral-900 mt-0.5">{jobDetails.orderType}</div>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Summary card */}
        {!loading && !isEmpty && <SummaryCard summary={jobDetails.summary} />}

        {/* Body */}
        <div className="overflow-y-auto px-5 py-3 flex-1 min-h-[160px]">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-neutral-400 text-sm">
              <Loader2 size={16} className="animate-spin" />
              {LABELS.loading}
            </div>
          )}

          {!loading && isEmpty && <div className="py-16 text-center text-sm text-neutral-400">{LABELS.empty}</div>}

          {!loading && !isEmpty && (
            <DeliveryTable
              columns={jobDetails.columns || []}
              rows={jobDetails.factoryWise}
              summary={jobDetails.summary}
              orderType={jobDetails.orderType}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default JobModal;