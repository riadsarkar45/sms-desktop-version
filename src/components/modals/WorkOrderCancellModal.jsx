
import React, { useEffect, useMemo, useRef, useState } from 'react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

const REASONS = [
    'Buyer cancelled the order',
    'Quantity reduced',
    'Factory capacity issue',
    'Quality or compliance issue',
    'Moved to another factory',
    'Other',
];

const COLOR_MAP = {
    WHITE: '#ffffff',
    'GREY MELANGE': '#b7bcc4',
    BLACK: '#1f2328',
    NAVY: '#1f2f56',
    RED: '#c0392b',
    BLUE: '#2f6fb5',
    GREEN: '#3c8d5a',
    YELLOW: '#e4c441',
};

const nf = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
});

const fmt = (n) => nf.format(Number(n) || 0);

const factoryLabel = (name) =>
    !name || String(name).trim() === '0'
        ? 'Unassigned factory'
        : name;

const sumQty = (compositions = []) =>
    compositions.reduce(
        (sum, composition) =>
            sum + (Number(composition.workOrderQty) || 0),
        0
    );

const orderTypeLabel = (type) =>
    type === 'knittingOrder'
        ? 'Knitting order'
        : type || '';

/* Checkbox with indeterminate support */
const Checkbox = ({
    checked,
    indeterminate,
    onChange,
    label,
    disabled = false,
}) => {
    const ref = useRef(null);

    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate =
                Boolean(indeterminate) && !checked;
        }
    }, [indeterminate, checked]);

    return (
        <input
            ref={ref}
            type="checkbox"
            className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-red-600 disabled:cursor-not-allowed"
            checked={checked}
            onChange={onChange}
            aria-label={label}
            disabled={disabled}
        />
    );
};

const WorkOrderCancelModal = ({
    dataForCancellation,
    open = true,
    onConfirm,
    setIsCancelModalOpen,
}) => {
    const axiosPrivate = useAxiosPrivate();

    /* Normalize API response */
    const workOrders = useMemo(() => {
        if (Array.isArray(dataForCancellation)) {
            return dataForCancellation;
        }

        if (Array.isArray(dataForCancellation?.workOrder)) {
            return dataForCancellation.workOrder;
        }

        return [];
    }, [dataForCancellation]);

    const jobNo = workOrders[0]?.jobNo || '';
    const orderType = workOrders[0]?.orderType || '';

    /* State */
    const [selected, setSelected] = useState({});
    const [query, setQuery] = useState('');
    const [reason, setReason] = useState('');
    const [remarks, setRemarks] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    /* Close modal */
    const closeModal = () => {
        if (submitting) return;

        setIsCancelModalOpen(false);
    };

    /* Reset whenever modal opens or data changes */
    useEffect(() => {
        if (!open) return;

        setSelected({});
        setQuery('');
        setReason('');
        setRemarks('');
        setConfirming(false);
        setSubmitError('');
    }, [open, dataForCancellation]);

    /* Escape key + body scroll lock */
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !submitting) {
                setIsCancelModalOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener(
                'keydown',
                handleKeyDown
            );

            document.body.style.overflow = previousOverflow;
        };
    }, [open, submitting, setIsCancelModalOpen]);

    /* Filter work orders */
    const visibleOrders = useMemo(() => {
        const search = query.trim().toLowerCase();

        if (!search) return workOrders;

        return workOrders.filter((wo) => {
            return (
                factoryLabel(wo.factoryName)
                    .toLowerCase()
                    .includes(search) ||
                String(wo.id).includes(search) ||
                (wo.compositions || []).some(
                    (composition) =>
                        (composition.color || '')
                            .toLowerCase()
                            .includes(search) ||
                        (composition.composition || '')
                            .toLowerCase()
                            .includes(search)
                )
            );
        });
    }, [workOrders, query]);

    /* All compositions */
    const allCompositions = useMemo(
        () =>
            workOrders.flatMap(
                (wo) => wo.compositions || []
            ),
        [workOrders]
    );

    const selectedComps = allCompositions.filter(
        (composition) => selected[composition.id]
    );

    const selectedCount = selectedComps.length;

    const selectedQty = sumQty(selectedComps);

    const selectedWoCount = workOrders.filter((wo) =>
        (wo.compositions || []).some(
            (composition) => selected[composition.id]
        )
    ).length;

    const totalQty = sumQty(allCompositions);

    /* Visible selection */
    const visibleIds = visibleOrders.flatMap((wo) =>
        (wo.compositions || []).map(
            (composition) => composition.id
        )
    );

    const allVisibleSelected =
        visibleIds.length > 0 &&
        visibleIds.every((id) => selected[id]);

    const someVisibleSelected = visibleIds.some(
        (id) => selected[id]
    );

    const needsRemarks = reason === 'Other';

    const canSubmit =
        selectedCount > 0 &&
        Boolean(reason) &&
        (!needsRemarks || remarks.trim().length > 0) &&
        !submitting;

    /* Selection handlers */
    const setMany = (ids, value) => {
        setSelected((previous) => {
            const next = { ...previous };

            ids.forEach((id) => {
                if (value) {
                    next[id] = true;
                } else {
                    delete next[id];
                }
            });

            return next;
        });

        setConfirming(false);
    };

    const toggleOne = (id) => {
        setMany([id], !selected[id]);
    };

    const toggleWorkOrder = (wo) => {
        const ids = (wo.compositions || []).map(
            (composition) => composition.id
        );

        const allSelected =
            ids.length > 0 &&
            ids.every((id) => selected[id]);

        setMany(ids, !allSelected);
    };

    const toggleAllVisible = () => {
        setMany(visibleIds, !allVisibleSelected);
    };

    /* Individual work order API request */
    const handleCancelWorkOrder = async (workOrder) => {
        const response = await axiosPrivate.put(
            `/api/cancel-work-order/${workOrder.id}`,
            {
                jobNo,
                orderType,
                reason,
                remarks: remarks.trim(),
                fullCancel: workOrder.fullCancel,
                compositionIds: workOrder.compositionIds,
            }
        );

        if (response?.data?.success === false) {
            throw new Error(
                response.data.message ||
                    `Failed to cancel work order ${workOrder.id}`
            );
        }

        return response?.data;
    };

    /* Submit cancellation */
    const handleSubmit = async () => {
        if (!canSubmit) return;

        setSubmitting(true);
        setSubmitError('');

        const payload = {
            jobNo,
            orderType,
            reason,
            remarks: remarks.trim(),

            workOrders: workOrders
                .map((wo) => {
                    const compositions =
                        wo.compositions || [];

                    const compositionIds =
                        compositions
                            .filter(
                                (composition) =>
                                    selected[composition.id]
                            )
                            .map(
                                (composition) =>
                                    composition.id
                            );

                    return {
                        id: wo.id,

                        fullCancel:
                            compositionIds.length > 0 &&
                            compositionIds.length ===
                                compositions.length,

                        compositionIds,
                    };
                })
                .filter(
                    (wo) =>
                        wo.compositionIds.length > 0
                ),
        };

        try {
            if (typeof onConfirm === 'function') {
                await onConfirm(payload);
            } else {
                /* Sequential requests */
                for (const workOrder of payload.workOrders) {
                    await handleCancelWorkOrder(workOrder);
                }
            }

            setIsCancelModalOpen(false);
        } catch (error) {
            console.error(
                'Work order cancellation failed:',
                error.response?.data || error
            );

            const message =
                error?.response?.data?.message ||
                error?.message ||
                'Cancellation failed. Please try again.';

            setSubmitError(message);
            setConfirming(false);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const inputCls =
        'h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20';

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-900/60 p-2 sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    !submitting
                ) {
                    closeModal();
                }
            }}
        >
            <div
                className="my-auto flex max-h-[calc(100dvh-1rem)] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white text-slate-800 shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="woc-title"
            >
                {/* Header */}
                <header className="flex shrink-0 items-start justify-between border-b border-slate-200 px-4 pb-3 pt-4 sm:px-5">
                    <div>
                        <h2
                            id="woc-title"
                            className="text-lg font-semibold text-slate-900"
                        >
                            Cancel work orders
                        </h2>

                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
                            <span>
                                Job{' '}
                                <strong className="font-semibold text-slate-700">
                                    {jobNo || '-'}
                                </strong>
                            </span>

                            {orderType && (
                                <>
                                    <span className="h-[3px] w-[3px] rounded-full bg-slate-300" />
                                    <span>
                                        {orderTypeLabel(orderType)}
                                    </span>
                                </>
                            )}

                            <span className="h-[3px] w-[3px] rounded-full bg-slate-300" />

                            <span>
                                {workOrders.length} work order
                                {workOrders.length === 1 ? '' : 's'}
                            </span>
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={closeModal}
                        disabled={submitting}
                        aria-label="Close"
                        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 20 20"
                            fill="none"
                        >
                            <path
                                d="M5 5l10 10M15 5L5 15"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </header>

                {/* Toolbar */}
                <div className="flex shrink-0 flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[13px] font-medium text-slate-700">
                        <Checkbox
                            checked={allVisibleSelected}
                            indeterminate={someVisibleSelected}
                            onChange={toggleAllVisible}
                            label="Select all"
                            disabled={visibleIds.length === 0}
                        />

                        <span>Select all</span>
                    </label>

                    <input
                        type="search"
                        className={`${inputCls} w-full sm:max-w-xs`}
                        placeholder="Search factory, color or composition"
                        value={query}
                        onChange={(event) =>
                            setQuery(event.target.value)
                        }
                    />
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3.5 sm:px-5">
                    {workOrders.length === 0 && (
                        <div className="px-3 py-9 text-center text-sm text-slate-500">
                            No work orders available to cancel for this job.
                        </div>
                    )}

                    {workOrders.length > 0 &&
                        visibleOrders.length === 0 && (
                            <div className="px-3 py-9 text-center text-sm text-slate-500">
                                Nothing matches “{query}”.
                            </div>
                        )}

                    {visibleOrders.map((wo) => {
                        const compositions =
                            wo.compositions || [];

                        const ids = compositions.map(
                            (composition) => composition.id
                        );

                        const selCount = ids.filter(
                            (id) => selected[id]
                        ).length;

                        const allSelected =
                            ids.length > 0 &&
                            selCount === ids.length;

                        const unassigned =
                            factoryLabel(wo.factoryName) ===
                            'Unassigned factory';

                        return (
                            <section
                                key={wo.id}
                                className={`shrink-0 rounded-[10px] border transition-colors ${
                                    selCount > 0
                                        ? 'border-red-300 bg-red-50/40'
                                        : 'border-slate-200 bg-white'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3.5 py-2.5">
                                    <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                                        <Checkbox
                                            checked={allSelected}
                                            indeterminate={
                                                selCount > 0
                                            }
                                            onChange={() =>
                                                toggleWorkOrder(wo)
                                            }
                                            label={`Select work order ${wo.id}`}
                                        />

                                        <span
                                            className={`truncate text-sm ${
                                                unassigned
                                                    ? 'font-medium italic text-slate-400'
                                                    : 'font-semibold text-slate-900'
                                            }`}
                                        >
                                            {factoryLabel(
                                                wo.factoryName
                                            )}
                                        </span>

                                        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                            WO #{wo.id}
                                        </span>
                                    </label>

                                    <div className="whitespace-nowrap text-right">
                                        <span className="text-[15px] font-semibold tabular-nums text-slate-900">
                                            {fmt(
                                                sumQty(compositions)
                                            )}
                                        </span>

                                        <span className="ml-1 text-xs text-slate-400">
                                            kg total
                                        </span>
                                    </div>
                                </div>

                                <ul className="m-0 list-none divide-y divide-dashed divide-slate-100 p-0">
                                    {compositions.map((composition) => {
                                        const swatch =
                                            COLOR_MAP[
                                                (
                                                    composition.color ||
                                                    ''
                                                ).toUpperCase()
                                            ];

                                        const zero =
                                            !Number(
                                                composition.workOrderQty
                                            );

                                        return (
                                            <li
                                                key={composition.id}
                                                className="flex items-center justify-between gap-3 py-2 pl-3.5 pr-3.5 sm:pl-10"
                                            >
                                                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                                                    <Checkbox
                                                        checked={Boolean(
                                                            selected[
                                                                composition.id
                                                            ]
                                                        )}
                                                        onChange={() =>
                                                            toggleOne(
                                                                composition.id
                                                            )
                                                        }
                                                        label={`${composition.color} ${composition.composition}`}
                                                    />

                                                    <span
                                                        className="h-4 w-4 shrink-0 rounded-full border border-slate-300 bg-slate-200"
                                                        style={
                                                            swatch
                                                                ? {
                                                                      backgroundColor:
                                                                          swatch,
                                                                  }
                                                                : undefined
                                                        }
                                                    />

                                                    <span className="flex min-w-0 flex-col">
                                                        <span className="text-[13px] font-semibold text-slate-800">
                                                            {composition.color}
                                                        </span>

                                                        <span className="truncate text-xs text-slate-500">
                                                            {composition.composition}
                                                        </span>
                                                    </span>
                                                </label>

                                                <span
                                                    className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
                                                        zero
                                                            ? 'text-slate-400'
                                                            : 'text-slate-900'
                                                    }`}
                                                >
                                                    {fmt(
                                                        composition.workOrderQty
                                                    )}

                                                    <small className="text-xs font-normal text-slate-400">
                                                        {' '}kg
                                                    </small>
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>

                {/* Reason and remarks */}
                {workOrders.length > 0 && (
                    <div className="flex shrink-0 flex-wrap gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
                        <div className="flex min-w-[200px] flex-col gap-1.5">
                            <label
                                htmlFor="woc-reason"
                                className="text-xs font-semibold text-slate-600"
                            >
                                Reason for cancellation
                            </label>

                            <select
                                id="woc-reason"
                                value={reason}
                                onChange={(event) =>
                                    setReason(event.target.value)
                                }
                                className={inputCls}
                            >
                                <option value="">
                                    Select a reason
                                </option>

                                {REASONS.map((item) => (
                                    <option
                                        key={item}
                                        value={item}
                                    >
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
                            <label
                                htmlFor="woc-remarks"
                                className="text-xs font-semibold text-slate-600"
                            >
                                Remarks
                                {needsRemarks ? '' : ' (optional)'}
                            </label>

                            <input
                                id="woc-remarks"
                                type="text"
                                value={remarks}
                                onChange={(event) =>
                                    setRemarks(event.target.value)
                                }
                                placeholder={
                                    needsRemarks
                                        ? 'Please explain the reason'
                                        : 'Add a note for the record'
                                }
                                className={inputCls}
                            />
                        </div>
                    </div>
                )}

                {/* Footer */}
                <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-5 sm:py-3.5">
                    {submitError && (
                        <div className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
                            {submitError}
                        </div>
                    )}

                    {confirming ? (
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-3">
                            <p className="m-0 min-w-[240px] flex-1 text-[13px] leading-relaxed text-red-900">
                                Cancel{' '}
                                <strong>{selectedCount}</strong>{' '}
                                composition
                                {selectedCount === 1 ? '' : 's'}{' '}
                                across{' '}
                                <strong>{selectedWoCount}</strong>{' '}
                                work order
                                {selectedWoCount === 1 ? '' : 's'}{' '}
                                ({fmt(selectedQty)} kg)? This can’t be undone.
                            </p>

                            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setConfirming(false)
                                    }
                                    disabled={submitting}
                                    className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                                >
                                    Go back
                                </button>

                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="h-9 flex-1 rounded-lg border border-red-600 bg-red-600 px-4 text-[13px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                                >
                                    {submitting
                                        ? 'Cancelling…'
                                        : 'Yes, cancel them'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm text-slate-900">
                                {selectedCount > 0 ? (
                                    <>
                                        <strong>
                                            {fmt(selectedQty)} kg
                                        </strong>{' '}
                                        selected

                                        <span className="text-[13px] text-slate-500">
                                            {' '}of {fmt(totalQty)} kg ·{' '}
                                            {selectedWoCount} work order
                                            {selectedWoCount === 1
                                                ? ''
                                                : 's'}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-[13px] text-slate-500">
                                        Select the work orders or colors to cancel
                                    </span>
                                )}
                            </div>

                            <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={submitting}
                                    className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:flex-none"
                                >
                                    Keep work orders
                                </button>

                                <button
                                    type="button"
                                    disabled={!canSubmit}
                                    onClick={() =>
                                        setConfirming(true)
                                    }
                                    className="h-9 flex-1 rounded-lg border border-red-600 bg-red-600 px-4 text-[13px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
                                >
                                    Cancel selected
                                </button>
                            </div>
                        </div>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default WorkOrderCancelModal;
