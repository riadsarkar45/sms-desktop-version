import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    X,
    Save,
    RefreshCcw,
    Layers,
    AlertCircle,
    CheckCircle2,
    FileText,
    MapPin,
    Hash,
    Scale,
    Loader2,
    PackageCheck,
    Tag
} from 'lucide-react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

// Fields the user can edit. A delivery counts as "edited" only if one of these differs from the original.
const EDITABLE_FIELDS = ['challanNo', 'deliveryQty', 'fromFactory', 'toFactory', 'deliveryMonth', 'deliveryDate'];

// How long the success message stays visible before the modal closes
const CLOSE_DELAY_MS = 1200;

const ChallanEditModal = ({
    setIsChallanEditing,
    isChallanDataLoading = false,
    challanToEditData = {},
    onSuccess // optional: called after a successful save, use it to refetch the parent list
}) => {
    const [items, setItems] = useState([]);
    const [original, setOriginal] = useState([]); // untouched copy, used to detect edits
    const [formError, setFormError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const closeTimer = useRef(null);
    const axiosSecure = useAxiosPrivate();

    useEffect(() => {
        if (challanToEditData?.data && Array.isArray(challanToEditData.data)) {
            setItems(JSON.parse(JSON.stringify(challanToEditData.data)));
            setOriginal(JSON.parse(JSON.stringify(challanToEditData.data)));
            setFormError('');
        }
    }, [challanToEditData]);

    // Clear the pending close timer if the modal unmounts first
    useEffect(() => () => clearTimeout(closeTimer.current), []);

    // Calculate live breakdown per deliveryType
    const totalsByDeliveryType = useMemo(() => {
        const summary = {};
        items.forEach((row) => {
            (row.deliveries || []).forEach((dev) => {
                const type = dev.deliveryType?.trim() || 'General';
                const val = parseFloat(dev.deliveryQty);
                const qty = isNaN(val) ? 0 : val;
                summary[type] = (summary[type] || 0) + qty;
            });
        });
        return summary;
    }, [items]);

    // Overall grand total
    const grandTotalQty = useMemo(() => {
        return Object.values(totalsByDeliveryType).reduce((sum, val) => sum + val, 0);
    }, [totalsByDeliveryType]);

    // Only the deliveries whose editable fields differ from the original
    const changedDeliveries = useMemo(() => {
        const changed = [];
        items.forEach((row, rowIndex) => {
            (row.deliveries || []).forEach((dev, devIndex) => {
                const base = original[rowIndex]?.deliveries?.[devIndex];
                if (!base) return;
                const differs = EDITABLE_FIELDS.some(
                    (f) => String(dev[f] ?? '').trim() !== String(base[f] ?? '').trim()
                );
                if (differs) changed.push(dev);
            });
        });
        return changed;
    }, [items, original]);

    const handleClose = () => setIsChallanEditing(false);

    // Update only delivery-level fields
    const handleDeliveryChange = (rowIndex, devIndex, field, value) => {
        setItems((prev) => {
            const updated = [...prev];
            const targetDeliveries = [...(updated[rowIndex].deliveries || [])];
            targetDeliveries[devIndex] = {
                ...targetDeliveries[devIndex],
                [field]: value,
            };
            updated[rowIndex] = {
                ...updated[rowIndex],
                deliveries: targetDeliveries,
            };
            return updated;
        });
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setFormError('');

        if (changedDeliveries.length === 0) return;

        if (changedDeliveries.some((d) => d.id == null)) {
            setFormError('Delivery id is missing from the data. Add id: true to the delivery select on the server.');
            return;
        }

        const payload = [];
        for (const d of changedDeliveries) {
            const challanNo = Number(d.challanNo);
            const deliveryQty = Number(d.deliveryQty);
            const deliveryMonth = d.deliveryMonth
            const deliveryDate = d.deliveryDate;

            if (String(d.challanNo ?? '').trim() === '' || Number.isNaN(challanNo)) {
                setFormError('Enter a valid challan number for every edited delivery.');
                return;
            }
            if (String(d.deliveryQty ?? '').trim() === '' || Number.isNaN(deliveryQty) || deliveryQty < 0) {
                setFormError('Enter a valid delivery quantity for every edited delivery.');
                return;
            }

            payload.push({
                id: d.id,
                challanNo,
                deliveryQty,
                deliveryMonth,
                deliveryDate,
                fromFactory: (d.fromFactory ?? '').trim(),
                toFactory: (d.toFactory ?? '').trim(),
            });
        }

        setSaving(true);
        try {
            const res = await axiosSecure.patch('/api/edit-challan', { deliveries: payload });

            // Success: show the message, refresh the parent, then close the modal
            setSuccessMessage(res?.data?.message || 'Challan updated successfully');
            if (onSuccess) onSuccess(res?.data);
            closeTimer.current = setTimeout(handleClose, CLOSE_DELAY_MS);
        } catch (err) {
            // Failure: the modal stays open so nothing typed is lost
            setFormError(err?.response?.data?.message || err?.response?.data?.msg || 'Failed to update challan details.');
        } finally {
            setSaving(false);
        }
    };

    const hasData = items.length > 0;
    const isBusy = saving || isChallanDataLoading;
    const deliveryTypeEntries = Object.entries(totalsByDeliveryType);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                onClick={handleClose}
            />

            {/* Modal Dialog */}
            <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-hidden z-10"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-800">Edit Challan</h2>
                            <p className="text-xs text-slate-500">
                                Update delivery quantities, challan numbers, and factory routes
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleClose}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Delivery Type Totals Summary Bar */}
                {!isChallanDataLoading && hasData && deliveryTypeEntries.length > 0 && (
                    <div className="px-6 py-3 bg-slate-50/90 border-b border-slate-200/80 flex flex-wrap items-center gap-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mr-1">
                            <PackageCheck className="w-4 h-4 text-slate-500" />
                            <span>Totals:</span>
                        </div>

                        {/* Grand Total */}
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs">
                            <span className="text-slate-500 font-medium">All:</span>
                            <span>
                                {grandTotalQty.toLocaleString(undefined, {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                })}
                            </span>
                        </div>

                        {/* Badges per Delivery Type */}
                        {deliveryTypeEntries.map(([type, totalQty]) => (
                            <div
                                key={type}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50/90 border border-indigo-200 text-indigo-900 rounded-lg text-xs font-medium shadow-2xs"
                            >
                                <Tag className="w-3 h-3 text-indigo-500" />
                                <span className="text-indigo-700 font-medium">{type}:</span>
                                <span className="font-bold">
                                    {totalQty.toLocaleString(undefined, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Success Notification */}
                {successMessage && (
                    <div
                        role="status"
                        className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-center gap-2 text-xs"
                    >
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {/* Error Notification */}
                {formError && (
                    <div
                        role="alert"
                        className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 text-xs"
                    >
                        <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                        <span>{formError}</span>
                    </div>
                )}

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {isChallanDataLoading ? (
                        /* Loading State */
                        <div className="py-20 flex flex-col items-center justify-center space-y-4">
                            <div className="p-3 bg-blue-50 rounded-2xl text-blue-600">
                                <Loader2 className="w-8 h-8 animate-spin" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-semibold text-slate-700">Loading Challan Details</p>
                                <p className="text-xs text-slate-400 mt-0.5">Please wait while fetching delivery batches...</p>
                            </div>
                        </div>
                    ) : !hasData ? (
                        /* Empty State */
                        <div className="py-16 text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                                <Layers className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-medium text-slate-700">No challan data available</p>
                            <p className="text-xs text-slate-400 mt-0.5">There are no records to edit at this time.</p>
                        </div>
                    ) : (
                        /* Item & Delivery List */
                        items.map((row, rowIndex) => (
                            <div
                                key={row.id || rowIndex}
                                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4"
                            >
                                {/* Item Header & Read-only Composition Display */}
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2.5">
                                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                                        <div>
                                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 block leading-tight">
                                                Item #{rowIndex + 1}
                                            </span>
                                            <h3 className="text-sm font-semibold text-slate-800">
                                                {row.composition || 'Untitled Composition'}
                                            </h3>
                                        </div>
                                    </div>
                                    <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2.5 py-1 rounded-full">
                                        {row.deliveries?.length || 0} {row.deliveries?.length === 1 ? 'Delivery' : 'Deliveries'}
                                    </span>
                                </div>

                                {/* Deliveries List */}
                                <div className="space-y-3">
                                    {row.deliveries && row.deliveries.length > 0 ? (
                                        row.deliveries.map((dev, devIndex) => (
                                            <div
                                                // Stable key: the key must NOT be an editable field, or the inputs remount on every keystroke
                                                key={dev.id ?? devIndex}
                                                className="p-4 bg-slate-50/70 rounded-xl border border-slate-100 space-y-3.5"
                                            >
                                                {/* Batch Header with read-only delivery type */}
                                                <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                                                    <span className="text-xs font-semibold text-slate-600">
                                                        Batch #{devIndex + 1}
                                                    </span>
                                                    {dev.deliveryType && (
                                                        <span className="text-[11px] font-medium px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                                                            {dev.deliveryType}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Editable: Challan No & Delivery Qty */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
                                                            <Hash className="w-3.5 h-3.5 text-slate-400" />
                                                            Challan No
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={dev.challanNo || ''}
                                                            onChange={(e) =>
                                                                handleDeliveryChange(rowIndex, devIndex, 'challanNo', e.target.value)
                                                            }
                                                            placeholder="Enter challan no"
                                                            className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
                                                            <Scale className="w-3.5 h-3.5 text-slate-400" />
                                                            Delivery Qty
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={dev.deliveryQty ?? ''}
                                                            onChange={(e) =>
                                                                handleDeliveryChange(rowIndex, devIndex, 'deliveryQty', e.target.value)
                                                            }
                                                            placeholder="0.00"
                                                            className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Editable: From Factory & To Factory */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
                                                            <MapPin className="w-3.5 h-3.5 text-amber-500" />
                                                            From Factory (Source)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={dev.fromFactory || ''}
                                                            onChange={(e) =>
                                                                handleDeliveryChange(rowIndex, devIndex, 'fromFactory', e.target.value)
                                                            }
                                                            placeholder="Source factory name"
                                                            className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
                                                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                                                            To Factory (Destination)
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={dev.toFactory || ''}
                                                            onChange={(e) =>
                                                                handleDeliveryChange(rowIndex, devIndex, 'toFactory', e.target.value)
                                                            }
                                                            placeholder="Destination factory name"
                                                            className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                                        />
                                                    </div>
                                                </div>
                                                {/* delivery dates month created at */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
                                                            <MapPin className="w-3.5 h-3.5 text-amber-500" />
                                                            Delivery Date
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={dev.deliveryDate ? String(dev.deliveryDate).slice(0, 10) : ''}
                                                            onChange={(e) =>
                                                                handleDeliveryChange(rowIndex, devIndex, 'deliveryDate', e.target.value)
                                                            }
                                                            placeholder="Source factory name"
                                                            className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
                                                            <MapPin className="w-3.5 h-3.5 text-blue-500" />
                                                            Delivery Month
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={dev.deliveryMonth || ''}
                                                            onChange={(e) =>
                                                                handleDeliveryChange(rowIndex, devIndex, 'deliveryMonth', e.target.value)
                                                            }
                                                            placeholder="Destination factory name"
                                                            className="w-full px-3 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all placeholder:text-slate-400"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-6 text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                                            No deliveries associated with this item
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
                    <span className="mr-auto text-xs text-slate-500">
                        {changedDeliveries.length === 0
                            ? 'No changes yet'
                            : `${changedDeliveries.length} ${changedDeliveries.length === 1 ? 'delivery' : 'deliveries'} edited`}
                    </span>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isBusy || !hasData || changedDeliveries.length === 0 || Boolean(successMessage)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {saving ? (
                            <>
                                <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                                <span>Saving...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-3.5 h-3.5" />
                                <span>Save Changes</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChallanEditModal;