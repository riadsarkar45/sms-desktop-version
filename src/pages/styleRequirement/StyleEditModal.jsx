import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Save, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';
import Input from '../../components/InputText/Input';

let tempIdCounter = 0;
const generateTempId = () => `temp-${Date.now()}-${++tempIdCounter}`;

const StyleEditModal = ({ editingStyleData, setStyleEditingData, isLoading, onSave }) => {
    const [styles, setStyles] = useState([]);
    const [isSuccess, setIsSuccess] = useState({ isSuccess: null, message: "" });
    const [isLoading1, setIsLoading1] = useState(false);
    
    // State for custom delete confirmation modal
    const [deleteTarget, setDeleteTarget] = useState(null);

    const axiosSecure = useAxiosPrivate();
    const originalMapRef = useRef(new Map());

    useEffect(() => {
        const incoming = (editingStyleData || []).map((row) => ({
            ...row,
            rows: (row.rows || []).map((r) => ({ ...r })),
        }));

        setStyles(incoming);

        const map = new Map();
        incoming.forEach((style) => {
            map.set(style.id, {
                ...style,
                rowsById: new Map((style.rows || []).map((r) => [r.id, r])),
            });
        });
        originalMapRef.current = map;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(editingStyleData)]);

    const updateStyleField = (styleIndex, field, value) => {
        setStyles((prev) =>
            prev.map((s, i) => (i === styleIndex ? { ...s, [field]: value } : s))
        );
    };

    const updateBreakdownField = (styleIndex, rowIndex, field, value) => {
        setStyles((prev) =>
            prev.map((s, i) =>
                i === styleIndex
                    ? {
                        ...s,
                        rows: s.rows.map((r, j) =>
                            j === rowIndex ? { ...r, [field]: value } : r
                        ),
                    }
                    : s
            )
        );
    };

    const addBreakdownRow = (styleIndex) => {
        setStyles((prev) =>
            prev.map((s, i) =>
                i === styleIndex
                    ? {
                        ...s,
                        rows: [
                            {
                                id: generateTempId(),
                                isNew: true,
                                composition: '',
                                color: '',
                                finishDia: '',
                                orderQty: '',
                                finishRequiredQty: '',
                                processLoss: '',
                                additional: '',
                            },
                            ...(s.rows || []),
                        ],
                    }
                    : s
            )
        );
    };

    // 1. Request deletion (opens custom modal)
    const requestRemoveBreakdownRow = (styleIndex, rowIndex, compId, deleteType) => {
        setDeleteTarget({ styleIndex, rowIndex, compId, deleteType });
    };

    // 2. Confirm deletion (executes API call and state update)
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        const { styleIndex, rowIndex, compId, deleteType } = deleteTarget;
        
        setIsLoading1(true);

        try {
            const res = await axiosSecure.delete(`/api/delete-style-data/${compId}/${deleteType}`);
            
            const isSuccessful = 
                res.status === 200 || 
                res.status === 204 || 
                res.data?.status === 200 || 
                res.data?.data === 200 ||
                res.data?.type === "success";

            if (isSuccessful) {
                setIsSuccess({ isSuccess: true, message: "Delete successful" });
                
                // Update state based on what is being deleted
                setStyles((prev) => {
                    if (deleteType === "delWholeJob") {
                        // Remove the entire style object from the array
                        return prev.filter((_, i) => i !== styleIndex);
                    }
                    // Remove only the specific breakdown row
                    return prev.map((s, i) =>
                        i === styleIndex
                            ? { ...s, rows: (s.rows || []).filter((_, j) => j !== rowIndex) }
                            : s
                    );
                });
            } else {
                setIsSuccess({ isSuccess: false, message: res.data?.message || "Failed to delete" });
            }
        } catch (e) {
            console.error("Delete error:", e);
            setIsSuccess({ isSuccess: false, message: e.response?.data?.message || "Failed to delete" });
        } finally {
            setIsLoading1(false);
            setDeleteTarget(null); // Close modal
        }
    };

    // 3. Cancel deletion
    const cancelDelete = () => {
        setDeleteTarget(null);
    };

    const handleClose = () => {
        setStyleEditingData({ isShowStyleEditModal: false, data: [] });
        setIsSuccess({ isSuccess: null, message: "" });
    };

    const buildChangePayload = useCallback(() => {
        const originalMap = originalMapRef.current;
        const payload = [];

        styles.forEach((style) => {
            const { rows = [], ...styleFields } = style;
            const origStyle = originalMap.get(style.id);

            const changedFields = {};
            let styleFieldsChanged = false;
            if (origStyle) {
                Object.keys(styleFields).forEach((key) => {
                    if (styleFields[key] !== origStyle[key]) {
                        changedFields[key] = styleFields[key];
                        styleFieldsChanged = true;
                    }
                });
            }

            const newRows = [];
            const updatedRows = [];
            const currentExistingIds = new Set();

            rows.forEach((r) => {
                const { isNew, ...rowFields } = r;
                if (isNew) {
                    newRows.push(rowFields);
                    return;
                }
                currentExistingIds.add(r.id);
                const origRow = origStyle?.rowsById?.get(r.id);
                if (!origRow) return;

                const rowChanges = {};
                let rowChanged = false;
                Object.keys(rowFields).forEach((key) => {
                    if (rowFields[key] !== origRow[key]) {
                        rowChanges[key] = rowFields[key];
                        rowChanged = true;
                    }
                });
                if (rowChanged) {
                    updatedRows.push({ id: r.id, ...rowChanges });
                }
            });

            const deletedRowIds = origStyle
                ? [...origStyle.rowsById.keys()].filter((id) => !currentExistingIds.has(id))
                : [];

            const hasChanges =
                styleFieldsChanged || newRows.length || updatedRows.length || deletedRowIds.length;

            if (hasChanges) {
                payload.push({
                    id: style.id,
                    ...(styleFieldsChanged ? changedFields : {}),
                    ...(newRows.length ? { newRows } : {}),
                    ...(updatedRows.length ? { updatedRows } : {}),
                    ...(deletedRowIds.length ? { deletedRowIds } : {}),
                });
            }
        });

        return payload;
    }, [styles]);

    const isDirty = useMemo(() => buildChangePayload().length > 0, [buildChangePayload]);

    const handleSave = async () => {
        const changedPayload = buildChangePayload();

        console.log('StyleEditModal save payload (edited data only):', changedPayload);
        setIsLoading1(true);
        
        try {
            const res = await axiosSecure.put("/api/edit-style-requirement", changedPayload);
            console.log(res.data);

            if (res.status === 200 || res.data?.type === "success" || (res.data?.data && res.data.data.length > 0)) {
                setIsSuccess({ isSuccess: true, message: "Update successful" });
            } else {
                setIsSuccess({ isSuccess: false, message: res.data?.message || "Update failed" });
            }
        } catch (error) {
            console.error(error);
            setIsSuccess({ isSuccess: false, message: error.response?.data?.message || "Update failed" });
        } finally {
            setIsLoading1(false);
        }

        if (typeof onSave === 'function') {
            onSave(changedPayload);
        }
        if (typeof setStyleEditingData === 'function') {
            setStyleEditingData((prev) => ({
                ...prev,
                data: styles,
            }));
        }
    };

    return (
        <>
            <div
                onClick={handleClose}
                className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] animate-fade-in transition-opacity"
            />

            <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-hidden pointer-events-none">
                {/* INCREASED WIDTH HERE: max-w-7xl and max-h-[95vh] */}
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="relative flex flex-col w-full max-w-7xl max-h-[100vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto animate-slide-in"
                >
                    {isLoading && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center z-50 animate-fade-in">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                                <span className="text-sm font-medium text-slate-600">Processing...</span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center mb-3 justify-between px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Edit Requirement</h2>
                            <p className="text-xs text-slate-500">Edit style specifications and composition breakdowns</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {isSuccess.message && (
                        isSuccess.isSuccess === true ? (
                            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-md mx-6 mt-2">
                                {isSuccess.message}
                            </div>
                        ) : (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-md mx-6 mt-2">
                                {isSuccess.message}
                            </div>
                        )
                    )}

                    <div className="flex-1 overflow-y-auto min-h-0 p-6 space-y-6 bg-slate-50/40">
                        {styles?.map((row, styleIdx) => {
                            const rows = row.rows || [];
                            return (
                                <div
                                    key={row.id || styleIdx}
                                    className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-6"
                                >
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center gap-2 border-b border-slate-100 pb-2.5">
                                            <div className='flex gap-2 items-center'>
                                                <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
                                                <h3 className="text-sm font-semibold text-slate-800">
                                                    General Information {row.id}
                                                </h3>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => requestRemoveBreakdownRow(styleIdx, "rowIdx", row.id, "delWholeJob")}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                title="Delete entire job"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-semibold text-slate-700">
                                                    Sales Contact
                                                </label>
                                                <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter sales contact"
                                                        value={row.salesContact || ''}
                                                        onChange={(e) =>
                                                            updateStyleField(styleIdx, 'salesContact', e.target.value)
                                                        }
                                                        className="w-full px-3 py-2 text-sm text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-semibold text-slate-700">
                                                    Buyer Name
                                                </label>
                                                <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter buyer name"
                                                        value={row.buyerName || ''}
                                                        onChange={(e) =>
                                                            updateStyleField(styleIdx, 'buyerName', e.target.value)
                                                        }
                                                        className="w-full px-3 py-2 text-sm text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-semibold text-slate-700">
                                                    Job No
                                                </label>
                                                <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter job number"
                                                        value={row.jobNo || ''}
                                                        onChange={(e) =>
                                                            updateStyleField(styleIdx, 'jobNo', e.target.value)
                                                        }
                                                        className="w-full px-3 py-2 text-sm text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-semibold text-slate-700">
                                                    Style No
                                                </label>
                                                <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter style number"
                                                        value={row.styleNo || ''}
                                                        onChange={(e) =>
                                                            updateStyleField(styleIdx, 'styleNo', e.target.value)
                                                        }
                                                        className="w-full px-3 py-2 text-sm text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="block text-xs font-semibold text-slate-700">
                                                    Process Loss
                                                </label>
                                                <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                    <Input
                                                        type="text"
                                                        placeholder="Enter process loss (%)"
                                                        value={row.processLoss || ''}
                                                        onChange={(e) =>
                                                            updateStyleField(styleIdx, 'processLoss', e.target.value)
                                                        }
                                                        className="w-full px-3 py-2 text-sm text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-4 bg-emerald-600 rounded-full" />
                                                <h3 className="text-sm font-semibold text-slate-800">
                                                    Breakdown Specifications ({rows.length})
                                                </h3>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => addBreakdownRow(styleIdx)}
                                                disabled={isLoading || isLoading1}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                Add Item
                                            </button>
                                        </div>

                                        <div className="space-y-3.5">
                                            {rows?.map((r, rowIdx) => (
                                                <div
                                                    key={r.id || rowIdx}
                                                    className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/90 shadow-2xs space-y-3 hover:border-slate-300 transition-colors"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold">
                                                                {rowIdx + 1}
                                                            </span>
                                                            <span className="text-xs font-semibold text-slate-700">
                                                                Item Specification {r.id}
                                                            </span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => requestRemoveBreakdownRow(styleIdx, rowIdx, r.id, "delComp")}
                                                            disabled={isLoading || isLoading1}
                                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            aria-label="Remove item"
                                                            title="Delete this item"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
                                                        <div className="space-y-1.5">
                                                            <label className="block text-xs font-medium text-slate-700">
                                                                Composition
                                                            </label>
                                                            <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="e.g. 100% Cotton"
                                                                    value={r.composition || ''}
                                                                    onChange={(e) =>
                                                                        updateBreakdownField(styleIdx, rowIdx, 'composition', e.target.value)
                                                                    }
                                                                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="block text-xs font-medium text-slate-700">
                                                                Color
                                                            </label>
                                                            <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Color"
                                                                    value={r.color || ''}
                                                                    onChange={(e) =>
                                                                        updateBreakdownField(styleIdx, rowIdx, 'color', e.target.value)
                                                                    }
                                                                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="block text-xs font-medium text-slate-700">
                                                                Finish Dia
                                                            </label>
                                                            <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Finish Dia"
                                                                    value={r.finishDia || ''}
                                                                    onChange={(e) =>
                                                                        updateBreakdownField(styleIdx, rowIdx, 'finishDia', e.target.value)
                                                                    }
                                                                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="block text-xs font-medium text-slate-700">
                                                                Order Qty
                                                            </label>
                                                            <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Order Qty"
                                                                    value={r.orderQty || ''}
                                                                    onChange={(e) =>
                                                                        updateBreakdownField(styleIdx, rowIdx, 'orderQty', e.target.value)
                                                                    }
                                                                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="block text-xs font-medium text-slate-700">
                                                                Process Loss
                                                            </label>
                                                            <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Process Loss"
                                                                    value={r.processLoss || ''}
                                                                    onChange={(e) =>
                                                                        updateBreakdownField(styleIdx, rowIdx, 'processLoss', e.target.value)
                                                                    }
                                                                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1.5">
                                                            <label className="block text-xs font-medium text-slate-700">
                                                                Finish Required Qty
                                                            </label>
                                                            <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Required Qty"
                                                                    value={r.finishRequiredQty || ''}
                                                                    onChange={(e) =>
                                                                        updateBreakdownField(styleIdx, rowIdx, 'finishRequiredQty', e.target.value)
                                                                    }
                                                                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="block text-xs font-medium text-slate-700">
                                                                Additional
                                                            </label>
                                                            <div className="relative rounded-lg bg-white shadow-2xs hover:border-slate-400 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                                                                <Input
                                                                    type="text"
                                                                    placeholder="Additional"
                                                                    value={r.additional || ''}
                                                                    onChange={(e) =>
                                                                        updateBreakdownField(styleIdx, rowIdx, 'additional', e.target.value)
                                                                    }
                                                                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded-lg focus:outline-none"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white flex-shrink-0">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isLoading || isLoading1}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isLoading1 || !isDirty}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading1 ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom Delete Confirmation Modal */}
            {deleteTarget && (
                <>
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] animate-fade-in" />
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none">
                        <div className="bg-white rounded-xl border border-slate-200 w-full max-w-sm p-6 pointer-events-auto animate-slide-in shadow-2xl">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600">
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Confirm Deletion</h3>
                            </div>
                            <p className="text-sm text-slate-600 mb-6">
                                Are you sure you want to delete this {deleteTarget.deleteType === "delWholeJob" ? "entire job" : "item"}? This action is permanent and cannot be undone.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={cancelDelete}
                                    disabled={isLoading1}
                                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDelete}
                                    disabled={isLoading1}
                                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isLoading1 ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        "Delete"
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            <style>
                {`
                @keyframes fade-in {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
                @keyframes slide-in {
                  from {
                    opacity: 0;
                    transform: scale(0.98) translateY(8px);
                  }
                  to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                  }
                }
                .animate-fade-in {
                  animation: fade-in 0.15s ease-out;
                }
                .animate-slide-in {
                  animation: slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                }
              `}
            </style>
        </>
    );
};

export default StyleEditModal;