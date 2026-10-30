import { AlertCircle, Package, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetchData } from "../../hooks/fetch";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

const DELIVERY_TYPES = [
    { value: "Received From Spinning", label: "Received From Spinning" },
    { value: "Return To Spinning", label: "Return To Spinning" },
];

const inputCls =
    "w-full h-9 px-2.5 rounded-md border bg-white text-sm text-slate-900 placeholder:text-slate-400 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-colors";

const itemKeyOf = (pi, pIdx, item, iIdx) =>
    `${pi?.id ?? pi?.piNo ?? pIdx}::${item?.id ?? item?.itemId ?? iIdx}`;

const emptyRow = (rid) => ({
    rid,
    challanNo: "",
    quantity: "",
    date: new Date().toISOString().slice(0, 10),
    deliveryType: "",
});

// A row is "touched" if the user typed anything. Fully blank rows are ignored.
const isTouched = (r) => String(r.challanNo).trim() || r.quantity !== "" || r.deliveryType;

const isRowValid = (r) =>
    String(r.challanNo).trim() && Number(r.quantity) > 0 && r.date && r.deliveryType;

function InfoCell({ label, value }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-900 truncate" title={value || ""}>
                {value || "—"}
            </dd>
        </div>
    );
}

function ChallanRow({ row, showErrors, onChange, onRemove }) {
    const bad = (cond) => (showErrors && isTouched(row) && cond ? "border-red-400" : "border-slate-300");

    return (
        <div className="grid grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.2fr_1.6fr_auto] gap-2 items-start p-2.5 rounded-md border bg-white border-slate-200 border-l-4 border-l-indigo-500">
            <input
                type="text"
                aria-label="Challan number"
                placeholder="Challan no."
                value={row.challanNo}
                onChange={(e) => onChange("challanNo", e.target.value)}
                className={`${inputCls} ${bad(!String(row.challanNo).trim())}`}
            />
            <input
                type="number"
                min="0"
                step="any"
                aria-label="Quantity"
                placeholder="Quantity"
                value={row.quantity}
                onChange={(e) => onChange("quantity", e.target.value)}
                className={`${inputCls} ${bad(!(Number(row.quantity) > 0))}`}
            />
            <input
                type="date"
                aria-label="Delivery date"
                value={row.date}
                onChange={(e) => onChange("date", e.target.value)}
                className={`${inputCls} ${bad(!row.date)}`}
            />
            <select
                aria-label="Delivery type"
                value={row.deliveryType}
                onChange={(e) => onChange("deliveryType", e.target.value)}
                className={`${inputCls} ${bad(!row.deliveryType)}`}
            >
                <option value="">Select delivery type</option>
                {DELIVERY_TYPES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                ))}
            </select>
            <button
                type="button"
                onClick={onRemove}
                title="Remove row"
                aria-label="Remove row"
                className="h-9 w-9 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
            >
                <Trash2 size={16} />
            </button>
        </div>
    );
}

export function ChallanRecordModal({ onSave, onClose, piNo }) {
    const { fetchData, loading, error: fetchError } = useFetchData();
    const axiosSecure = useAxiosPrivate();

    const [piData, setPiData] = useState([]);
    const [rows, setRows] = useState({}); // { itemKey: Row[] }  -> NEW rows only
    const [showErrors, setShowErrors] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const tmpCounter = useRef(0);

    const fetchRef = useRef(fetchData);
    fetchRef.current = fetchData;

    /* ---- load PI header + items only (existing challans are ignored) ---- */
    useEffect(() => {
        let cancelled = false;
        fetchRef.current(`/api/yarn-purchase-data/${piNo}`)
            .then((res) => {
                if (cancelled) return;
                const data = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
                const initial = {};
                data.forEach((pi, pIdx) => {
                    (pi?.items ?? []).forEach((item, iIdx) => {
                        initial[itemKeyOf(pi, pIdx, item, iIdx)] = [emptyRow(`new-${++tmpCounter.current}`)];
                    });
                });
                setPiData(data);
                setRows(initial);
            })
            .catch((e) => console.error("Failed to fetch PI data:", e));
        return () => { cancelled = true; };
    }, [piNo]);

    const updateRow = (key, rid, field, value) =>
        setRows((prev) => ({
            ...prev,
            [key]: prev[key].map((r) => (r.rid === rid ? { ...r, [field]: value } : r)),
        }));

    const addRow = (key) =>
        setRows((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), emptyRow(`new-${++tmpCounter.current}`)] }));

    const removeRow = (key, rid) =>
        setRows((prev) => ({ ...prev, [key]: prev[key].filter((r) => r.rid !== rid) }));

    /* ---- payload: only new challans ---- */
    const { payload, entryCount, invalidCount } = useMemo(() => {
        const items = [];
        let count = 0;
        let invalid = 0;

        piData.forEach((pi, pIdx) => {
            (pi?.items ?? []).forEach((item, iIdx) => {
                const key = itemKeyOf(pi, pIdx, item, iIdx);
                const added = [];
                (rows[key] ?? []).forEach((r) => {
                    if (!isTouched(r)) return;
                    if (!isRowValid(r)) invalid++;
                    added.push({
                        challanNo: String(r.challanNo).trim(),
                        quantity: Number(r.quantity),
                        date: r.date,
                        deliveryType: r.deliveryType,
                    });
                });
                if (added.length) {
                    count += added.length;
                    const rawComp = item?.composition;
                    const compId = item?.id ?? (typeof rawComp === "object" && rawComp !== null ? rawComp.id : null);
                    items.push({ compositionId: compId, added });
                }
            });
        });

        return { payload: { piNo, items }, entryCount: count, invalidCount: invalid };
    }, [piData, rows, piNo]);

    const isDirty = entryCount > 0;

    const requestClose = useCallback(() => {
        if (isDirty && !window.confirm("You have unsaved challans. Discard them and close?")) return;
        onClose?.();
    }, [isDirty, onClose]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                requestClose();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [requestClose]);

    const handleSave = async () => {
        if (!isDirty || saving) return;
        if (invalidCount > 0) {
            setShowErrors(true);
            return;
        }
        setSaving(true);
        setSaveError("");
        try {
            await axiosSecure.post("/api/yarn-purchase-data/challans", payload);
            onSave?.(payload); // parent should refetch the table
        } catch (e) {
            console.error(e);
            setSaveError("Failed to save challans. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const getCompName = (item) => {
        const raw = item?.composition;
        return typeof raw === "object" && raw !== null ? raw.name || raw.composition || "Item" : raw || "Item";
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
            onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200"
            >
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">Add new challans</h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Record new yarn deliveries against PI {piNo}. Previously saved challans are kept as they are.
                        </p>
                    </div>
                    <button type="button" onClick={requestClose} title="Close (Esc)" aria-label="Close" className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 bg-slate-50/60">
                    {loading && <p className="text-sm text-slate-500">Loading PI data…</p>}

                    {!loading && fetchError && (
                        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            <AlertCircle size={16} /> Couldn't load PI data. Close the dialog and try again.
                        </div>
                    )}

                    {!loading && !fetchError && piData.length === 0 && (
                        <p className="text-sm text-slate-500">No purchase data found for PI {piNo}.</p>
                    )}

                    {piData.map((pi, pIdx) => (
                        <section key={pi?.id ?? pi?.piNo ?? pIdx} className="bg-white rounded-lg border border-slate-200">
                            <dl className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-3 p-4 border-b border-slate-200">
                                <InfoCell label="PI no." value={pi?.piNo} />
                                <InfoCell label="PI date" value={pi?.piDate ? String(pi.piDate).slice(0, 10) : ""} />
                                <InfoCell label="PO no." value={pi?.poNo} />
                                <InfoCell label="LC no." value={pi?.lcNo} />
                                <InfoCell label="Supplier" value={pi?.supplierName} />
                            </dl>

                            <div className="p-4 space-y-5">
                                {(pi?.items ?? []).map((item, iIdx) => {
                                    const key = itemKeyOf(pi, pIdx, item, iIdx);
                                    const list = rows[key] ?? [];
                                    return (
                                        <div key={key}>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Package size={16} className="text-slate-400 shrink-0" />
                                                    <span className="text-sm font-medium text-slate-900 truncate">{getCompName(item)}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => addRow(key)}
                                                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                                                >
                                                    <Plus size={15} /> Add challan
                                                </button>
                                            </div>

                                            {list.length === 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => addRow(key)}
                                                    className="w-full py-4 rounded-md border border-dashed border-slate-300 text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-700"
                                                >
                                                    Add a challan for this yarn.
                                                </button>
                                            ) : (
                                                <div className="space-y-2">
                                                    {list.map((row) => (
                                                        <ChallanRow
                                                            key={row.rid}
                                                            row={row}
                                                            showErrors={showErrors}
                                                            onChange={(f, v) => updateRow(key, row.rid, f, v)}
                                                            onRemove={() => removeRow(key, row.rid)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))}

                    {showErrors && invalidCount > 0 && (
                        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            <AlertCircle size={16} />
                            {invalidCount} {invalidCount === 1 ? "challan is" : "challans are"} incomplete. Fill in challan no., quantity, date and delivery type.
                        </div>
                    )}
                    {saveError && (
                        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            <AlertCircle size={16} /> {saveError}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-slate-200 bg-white rounded-b-xl">
                    <span className="text-xs text-slate-500">
                        {isDirty ? `${entryCount} new ${entryCount === 1 ? "challan" : "challans"} to save` : "Esc to close"}
                    </span>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={requestClose} className="h-9 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50">
                            {isDirty ? "Discard" : "Close"}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!isDirty || saving}
                            className="h-9 px-4 inline-flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                        >
                            <Save size={15} /> {saving ? "Saving…" : "Save challans"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}