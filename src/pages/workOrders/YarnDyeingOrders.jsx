
import { useState, useMemo } from "react";
import { Eye, Edit } from "lucide-react";
import WorkOrderPreviewModal from "./WorkOrderPreviewModal";

const YarnDyeOrders = ({
    orders,
    isEdit,
    getDataForCancellation,
    updatedFields,
    handleOnChange,
    handleInlineEdit,
    handleEditRowData,
    FROZEN_COUNT = 9,
    currentFrozenWidths = [],
    currentFrozenLefts = [],
    handlePreview,
    getRevisionCount,
    setWorkOrderReviseModal,
    handleReviseWorkOrder,
}) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    // Preview modal: store IDs and always read fresh data from orders
    const [previewKey, setPreviewKey] = useState(null);

    const previewTarget = useMemo(() => {
        if (!previewKey) return null;

        const job = (orders || []).find(
            (j) => j.jobNo === previewKey.jobNo
        );

        const wo = job?.workOrders?.find(
            (w) => w.id === previewKey.woId
        );

        return job && wo ? { job, wo } : null;
    }, [orders, previewKey]);

    const openPreview = (e, job, wo) => {
        e.stopPropagation();

        if (!wo) return;

        setPreviewKey({
            jobNo: job?.jobNo,
            woId: wo.id,
        });
    };

    const closePreview = () => setPreviewKey(null);

    const cellPad = "px-3 py-2";
    const clickableCell =
        `${cellPad} cursor-pointer hover:bg-red-500/10 hover:text-red-500`;

    const baseTd = {
        borderRight: "1px solid #d1d5db",
        borderBottom: "1px solid #d1d5db",
        padding: 0,
        textAlign: "center",
        verticalAlign: "middle",
        boxSizing: "border-box",
    };

    const formatNumber = (value) => {
        const num = Number(value) || 0;
        return num.toLocaleString("en-US");
    };

    // Frozen columns: 0 through 8
    const stickyTd = (colIndex, isHovered) => ({
        ...baseTd,
        position: "sticky",
        left: `${currentFrozenLefts[colIndex] ?? 0}px`,
        zIndex: 3,
        backgroundColor: isHovered ? "#bbf7d0" : "#ffffff",
        width: currentFrozenWidths[colIndex]
            ? `${currentFrozenWidths[colIndex]}px`
            : undefined,
        minWidth: currentFrozenWidths[colIndex]
            ? `${currentFrozenWidths[colIndex]}px`
            : undefined,
        maxWidth: currentFrozenWidths[colIndex]
            ? `${currentFrozenWidths[colIndex]}px`
            : undefined,
        overflow: "visible",
        textOverflow: "clip",
        whiteSpace: "nowrap",
        boxShadow:
            colIndex === FROZEN_COUNT - 1
                ? "2px 0 5px -1px rgba(0,0,0,0.18)"
                : "none",
    });

    const plainTd = (isHovered) => ({
        ...baseTd,
        backgroundColor: isHovered ? "#f0fdf4" : "#ffffff",
        minWidth: "100px",
    });

    // Footer styles
    const footerBaseStyle = {
        ...baseTd,
        position: "sticky",
        bottom: 0,
        zIndex: 12,
        backgroundColor: "#657582",
        fontWeight: 700,
        padding: "8px 12px",
        textAlign: "center",
        verticalAlign: "middle",
        borderTop: "2px solid #6b7280",
        boxShadow: "0 -2px 5px -1px rgba(0,0,0,0.1)",
        boxSizing: "border-box",
        whiteSpace: "nowrap",
        color: "#1f2937",
    };

    const getFooterCellStyle = (index) => {
        if (index < FROZEN_COUNT) {
            return {
                ...footerBaseStyle,
                left: `${currentFrozenLefts[index] ?? 0}px`,
                zIndex: 20,
                backgroundColor: "#657582",
                width: currentFrozenWidths[index]
                    ? `${currentFrozenWidths[index]}px`
                    : undefined,
                minWidth: currentFrozenWidths[index]
                    ? `${currentFrozenWidths[index]}px`
                    : undefined,
                maxWidth: currentFrozenWidths[index]
                    ? `${currentFrozenWidths[index]}px`
                    : undefined,
                overflow: "visible",
                textOverflow: "clip",
                boxShadow:
                    index === FROZEN_COUNT - 1
                        ? "2px -2px 5px -1px rgba(0,0,0,0.18)"
                        : "0 -2px 5px -1px rgba(0,0,0,0.1)",
            };
        }

        return footerBaseStyle;
    };

    // Finish dia from matching style requirement row
    const getFinishDia = (wo, comp) => {
        if (!wo?.styleRequirement?.rows || !comp) return "-";

        const matchingRow = wo.styleRequirement.rows.find(
            (row) =>
                row.composition === comp.composition &&
                row.color === comp.color
        );

        return matchingRow?.finishDia || "-";
    };

    // Footer totals
    const totals = useMemo(() => {
        const acc = {
            bookingQty: 0,
            workOrderQty: 0,
            greyReceived: 0,
            greyReturn: 0,
            finishReceived: 0,
            finishReturn: 0,
        };

        (orders || []).forEach((job) => {
            (job.workOrders || []).forEach((wo) => {
                (wo.compositions || []).forEach((c) => {
                    const yarnJobs = (
                        wo.yarnDyeingJobs || []
                    ).filter(
                        (y) => y.composition === c.composition
                    );

                    acc.bookingQty += yarnJobs.reduce(
                        (s, y) => s + (Number(y.qty) || 0),
                        0
                    );

                    acc.workOrderQty +=
                        Number(
                            c.yarnDeliveriesWithColor
                                ?.YarnDeliveryForYarnDye
                        ) || 0;

                    acc.greyReceived += Number(c.greyReceived) || 0;
                    acc.greyReturn += Number(c.greyReturn) || 0;
                    acc.finishReceived +=
                        Number(c.finishReceived) || 0;
                    acc.finishReturn +=
                        Number(c.finishReturn) || 0;
                });
            });
        });

        return acc;
    }, [orders]);

    // Flatten jobs -> workOrders -> compositions
    const flatRows = useMemo(() => {
        const out = [];

        (orders || []).forEach((job, jobIndex) => {
            const workOrders = job.workOrders || [];

            const jobCompCount =
                workOrders.reduce(
                    (sum, wo) =>
                        sum + (wo.compositions?.length || 1),
                    0
                ) || 1;

            let jobRowSeen = false;

            if (workOrders.length === 0) {
                out.push({
                    jobIndex,
                    job,
                    wo: null,
                    comp: null,
                    isFirstOfJob: true,
                    jobRowSpan: 1,
                    isFirstOfWo: true,
                    woRowSpan: 1,
                });

                return;
            }

            workOrders.forEach((wo) => {
                const comps =
                    wo.compositions &&
                    wo.compositions.length > 0
                        ? wo.compositions
                        : [null];

                comps.forEach((comp, compIndex) => {
                    out.push({
                        jobIndex,
                        job,
                        wo,
                        comp,
                        isFirstOfJob: !jobRowSeen,
                        jobRowSpan: jobCompCount,
                        isFirstOfWo: compIndex === 0,
                        woRowSpan: comps.length,
                    });

                    jobRowSeen = true;
                });
            });
        });

        return out;
    }, [orders]);

    return (
        <>
            <tbody>
                {flatRows.map((r, rowIndex) => {
                    const {
                        job,
                        wo,
                        comp,
                        isFirstOfJob,
                        jobRowSpan,
                        isFirstOfWo,
                        woRowSpan,
                        jobIndex,
                    } = r;

                    const isHovered = hoveredIndex === jobIndex;

                    const yarnJobs = (
                        wo?.yarnDyeingJobs || []
                    ).filter(
                        (y) => y.composition === comp?.composition
                    );

                    const deliveredForDye =
                        comp?.yarnDeliveriesWithColor
                            ?.YarnDeliveryForYarnDye;

                    return (
                        <tr
                            key={`${wo?.id || job?.jobNo || "job"}-${comp?.id || rowIndex}`}
                            onMouseEnter={() =>
                                setHoveredIndex(jobIndex)
                            }
                            onMouseLeave={() =>
                                setHoveredIndex(null)
                            }
                        >
                            {/* COL 0 — ACTION */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(0, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    {wo ? (
                                        <div className="flex flex-col items-center justify-center gap-2 px-2 py-2">
                                            <button
                                                type="button"
                                                onClick={(e) =>
                                                    openPreview(e, job, wo)
                                                }
                                                className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                                                title="Preview work order"
                                            >
                                                Preview
                                                <Eye size={16} />
                                            </button>

                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleReviseWorkOrder?.(
                                                        wo.id
                                                    );
                                                }}
                                                className="flex w-full items-center justify-center gap-2 rounded-md bg-yellow-400 px-3 py-1.5 text-sm font-medium text-yellow-900 transition hover:bg-yellow-500"
                                                title="Revise work order"
                                            >
                                                Revise
                                                <Edit size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={cellPad}>-</div>
                                    )}
                                </td>
                            )}

                            {/* COL 1 — WORK ORDER DATE */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(1, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div className={cellPad}>
                                        {wo?.newWorkOrderPlaceDate || "-"}
                                    </div>
                                </td>
                            )}

                            {/* COL 2 — MONTH */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(2, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div className={cellPad}>
                                        {wo?.month || "-"}
                                    </div>
                                </td>
                            )}

                            {/* COL 3 — FACTORY NAME */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(3, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    {!wo || wo.factoryName === "NULL" ? (
                                        <div className={`${cellPad} text-gray-500`}>
                                            -
                                        </div>
                                    ) : (
                                        <div
                                            onDoubleClick={() =>
                                                handleInlineEdit(
                                                    wo.id,
                                                    wo.factoryName,
                                                    "workOrder",
                                                    "factoryName",
                                                    0
                                                )
                                            }
                                            className={`${cellPad} cursor-pointer`}
                                        >
                                            {isEdit.updatedFieldName ===
                                                "factoryName" &&
                                            isEdit.rowId === wo.id ? (
                                                <input
                                                    type="text"
                                                    name="factoryName"
                                                    className="p-2 outline-none border rounded-md w-full"
                                                    value={
                                                        updatedFields.currentValue
                                                    }
                                                    onChange={(e) =>
                                                        handleOnChange(e)
                                                    }
                                                />
                                            ) : (
                                                <span
                                                    onClick={() =>
                                                        handleEditRowData(
                                                            wo.id,
                                                            "yarnDyeingOrder"
                                                        )
                                                    }
                                                >
                                                    {wo.factoryName}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </td>
                            )}

                            {/* COL 4 — WORK ORDER NO */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(4, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div className={cellPad}>
                                        {wo?.workOrderNo || "-"}
                                    </div>
                                </td>
                            )}

                            {/* COL 5 — BUYER NAME */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(5, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div className={cellPad}>
                                        {wo?.styleRequirement?.buyerName || "-"}
                                    </div>
                                </td>
                            )}

                            {/* COL 6 — JOB NO */}
                            {isFirstOfJob && (
                                <td
                                    style={stickyTd(6, isHovered)}
                                    rowSpan={jobRowSpan}
                                >
                                    <div
                                        onClick={() =>
                                            getDataForCancellation({
                                                jobNo: job.jobNo,
                                                isOpen: true,
                                            })
                                        }
                                        className={`${cellPad} cursor-pointer`}
                                    >
                                        {job.jobNo || "-"}
                                    </div>
                                </td>
                            )}

                            {/* COL 7 — STYLE NO */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(7, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div className={cellPad}>
                                        {wo?.styleRequirement?.styleNo ||
                                            wo?.styleNo ||
                                            "-"}
                                    </div>
                                </td>
                            )}

                            {/* COL 8 — BOOKING COLOR */}
                            <td style={stickyTd(8, isHovered)}>
                                <div className={clickableCell}>
                                    {yarnJobs.length > 0
                                        ? yarnJobs.map((y, yi) => (
                                            <div
                                                key={y.id ?? yi}
                                                onClick={() =>
                                                    handleEditRowData(
                                                        comp?.id,
                                                        y.id
                                                    )
                                                }
                                                className="border-b border-gray-100 py-0.5 last:border-b-0"
                                            >
                                                {y.color}
                                            </div>
                                        ))
                                        : "-"}
                                </div>
                            </td>

                            {/* COL 9 — COMPOSITION (NOT FROZEN) */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {comp?.composition || "-"}
                                </div>
                            </td>

                            {/* COL 10 — FINISH DIA */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {getFinishDia(wo, comp)}
                                </div>
                            </td>

                            {/* COL 11 — SHADE (%) */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    onClick={() =>
                                        handleEditRowData(
                                            comp?.id,
                                            comp?.id
                                        )
                                    }
                                    className={clickableCell}
                                >
                                    -
                                </div>
                            </td>

                            {/* COL 12 — BOOKING QTY */}
                            <td style={plainTd(isHovered)}>
                                <div className={clickableCell}>
                                    {yarnJobs.length > 0
                                        ? yarnJobs.map((y, yi) => (
                                            <div
                                                key={y.id ?? yi}
                                                onClick={() =>
                                                    handleEditRowData(
                                                        comp?.id,
                                                        y.id
                                                    )
                                                }
                                                className="border-b border-gray-100 py-0.5 last:border-b-0"
                                            >
                                                {y.qty}
                                            </div>
                                        ))
                                        : "-"}
                                </div>
                            </td>

                            {/* COL 13 — PRICE PER KG */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {comp?.unitePrice != null
                                        ? Number(comp.unitePrice).toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* COL 14 — WORK ORDER QTY */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {deliveredForDye || "NOT DELIVERED YET"}
                                </div>
                            </td>

                            {/* COL 15 — GREY RECEIVED */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {comp?.greyReceived || 0}
                                </div>
                            </td>

                            {/* COL 16 — GREY RETURN */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {comp?.greyReturn || 0}
                                </div>
                            </td>

                            {/* COL 17 — FINISH RECEIVED */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {comp?.finishReceived || 0}
                                </div>
                            </td>

                            {/* COL 18 — FINISH RETURN */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {comp?.finishReturn || 0}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    {/* COL 0–8 — FROZEN FOOTER CELLS */}
                    {Array.from({
                        length: FROZEN_COUNT,
                    }).map((_, i) => (
                        <td
                            key={`footer-frozen-${i}`}
                            style={getFooterCellStyle(i)}
                        >
                            {i === 0 ? (
                                <div
                                    className={`${cellPad} text-white`}
                                    style={{
                                        textAlign: "center",
                                        fontSize: "14px",
                                        fontWeight: 700,
                                    }}
                                >
                                    TOTAL
                                </div>
                            ) : null}
                        </td>
                    ))}

                    {/* COL 9 — COMPOSITION */}
                    <td style={getFooterCellStyle(FROZEN_COUNT)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 10 — FINISH DIA */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 1)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 11 — SHADE */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 2)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 12 — BOOKING QTY */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 3)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.bookingQty.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 13 — PRICE PER KG */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 4)}>
                        <div className={`${cellPad} text-white`} />
                    </td>

                    {/* COL 14 — WORK ORDER QTY */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 5)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.workOrderQty.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 15 — GREY RECEIVED */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 6)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.greyReceived.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 16 — GREY RETURN */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 7)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.greyReturn.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 17 — FINISH RECEIVED */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 8)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.finishReceived.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 18 — FINISH RETURN */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 9)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.finishReturn.toFixed(2))}
                        </div>
                    </td>
                </tr>
            </tfoot>

            {/* WORK ORDER PREVIEW MODAL */}
            {previewTarget && (
                <WorkOrderPreviewModal
                    data={previewTarget}
                    orderType="yarnDyeingOrder"
                    revisionCount={
                        getRevisionCount
                            ? getRevisionCount(previewTarget.wo)
                            : 0
                    }
                    onClose={closePreview}
                />
            )}
        </>
    );
};

export default YarnDyeOrders;
