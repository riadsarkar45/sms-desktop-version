import { useState, useMemo } from "react";
import { Edit, Eye } from "lucide-react";

const AopOrder = ({
    orders,
    handleInlineEdit,
    handleRedirect,
    updatedFields,
    handleOnChange,
    isEdit,
    handleEditRowData,
    FROZEN_COUNT,
    currentFrozenWidths,
    currentFrozenLefts,
    searchTerm = "",
    getDataForCancellation,
    handlePreview,
    getRevisionCount,
    setWorkOrderReviseModal,
    handleReviseWorkOrder
}) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const cellPad = "py-2 px-3";
    const frozenCount = Number.isInteger(FROZEN_COUNT) ? FROZEN_COUNT : 9;

    const baseTd = {
        borderRight: "1px solid #000000",
        borderBottom: "1px solid #000000",
        padding: 0,
        textAlign: "center",
        verticalAlign: "top",
        boxSizing: "border-box",
    };

    const dataTd = { ...baseTd };

    // Indexes MUST match AllOrders.jsx COLUMNS:
    // 0 ACTION, 1 WORK ORDER DATE, 2 MONTH, 3 FACTORY,
    // 4 WORK ORDER NO, 5 BUYER, 6 JOB NO, 7 STYLE, 8 COLOR,
    // 9 COMPOSITION, 10 FINISH DIA, ...
    const stickyTd = (colIndex, isHovered) => {
        const width = currentFrozenWidths?.[colIndex] ?? 0;
        const left = currentFrozenLefts?.[colIndex] ?? 0;

        return {
            ...baseTd,
            position: "sticky",
            left: `${left}px`,
            zIndex: 3,
            backgroundColor: isHovered ? "#bbf7d0" : "#ffffff",
            width: `${width}px`,
            minWidth: `${width}px`,
            maxWidth: `${width}px`,
            boxShadow:
                colIndex === frozenCount - 1
                    ? "2px 0 5px -1px rgba(0,0,0,0.18)"
                    : "none",
            cursor: "pointer",
        };
    };

    const getFinishDia = (wo, comp) => {
        if (!wo?.styleRequirement?.rows || !comp) return "-";

        const matchingRow = wo.styleRequirement.rows.find(
            (row) =>
                row.composition === comp.composition &&
                row.color === comp.color
        );

        return matchingRow?.finishDia || "-";
    };

    const toNumber = (value) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    };

    const formatNumber = (value) => toNumber(value).toFixed(2);

    // Totals retain the original behavior: totals are calculated from all supplied orders.
    const totals = useMemo(() => {
        const acc = {
            workOrderQty: 0,
            sentForAop: 0,
            shortExcess: 0,
            ReturnFromAop: 0,
            receivedFromAop: 0,
            FinishFromAop: 0,
            rcvdShortExcess: 0,
            payableAmount: 0,
        };

        (orders || []).forEach((job) => {
            (job.workOrders || []).forEach((wo) => {
                (wo.compositions || []).forEach((comp) => {
                    const workOrderQty = toNumber(comp.workOrderQty);
                    const sentForAop = toNumber(
                        comp.yarnDeliveriesWithColor?.SentForAop
                    );
                    const returnFromAop = toNumber(
                        comp.yarnDeliveriesWithColor?.ReturnFromAop
                    );
                    const receivedFromAop = toNumber(
                        comp.yarnDeliveriesWithColor?.ReceivedFromAop
                    );
                    const finishFromAop = toNumber(
                        comp.yarnDeliveriesWithColor?.AOPFinishFabricRcvd
                    );
                    const unitePrice = toNumber(comp.unitePrice);

                    acc.workOrderQty += workOrderQty;
                    acc.sentForAop += sentForAop;
                    acc.shortExcess += sentForAop - workOrderQty;
                    acc.ReturnFromAop += returnFromAop;
                    acc.receivedFromAop += receivedFromAop;
                    acc.FinishFromAop += finishFromAop;
                    acc.rcvdShortExcess +=
                        returnFromAop + receivedFromAop - sentForAop;
                    acc.payableAmount += receivedFromAop * unitePrice;
                });
            });
        });

        return acc;
    }, [orders]);

    const filteredOrders = useMemo(() => {
        if (!searchTerm?.trim()) return orders || [];

        const lowerSearch = searchTerm.toLowerCase();

        return (orders || [])
            .map((job) => {
                const filteredWorkOrders = (job.workOrders || [])
                    .map((wo) => {
                        const filteredComps = (wo.compositions || []).filter(
                            (comp) => {
                                const searchableValues = [
                                    job?.jobNo,
                                    wo?.factoryName,
                                    wo?.workOrderNo,
                                    wo?.styleRequirement?.buyerName,
                                    wo?.styleRequirement?.styleNo,
                                    wo?.month,
                                    comp?.composition,
                                    comp?.color,
                                    comp?.workOrderQty,
                                ].map((value) =>
                                    String(value ?? "").toLowerCase()
                                );

                                return searchableValues.some((value) =>
                                    value.includes(lowerSearch)
                                );
                            }
                        );

                        return { ...wo, compositions: filteredComps };
                    })
                    .filter((wo) => wo.compositions.length > 0);

                return { ...job, workOrders: filteredWorkOrders };
            })
            .filter((job) => job.workOrders.length > 0);
    }, [orders, searchTerm]);

    const flatRows = useMemo(() => {
        const out = [];

        (filteredOrders || []).forEach((job, jobIndex) => {
            const workOrders = job.workOrders || [];
            const jobRowCount =
                workOrders.reduce(
                    (sum, wo) => sum + Math.max(wo.compositions?.length || 0, 1),
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
                    wo.compositions && wo.compositions.length > 0
                        ? wo.compositions
                        : [null];

                comps.forEach((comp, compIndex) => {
                    out.push({
                        jobIndex,
                        job,
                        wo,
                        comp,
                        isFirstOfJob: !jobRowSeen,
                        jobRowSpan: jobRowCount,
                        isFirstOfWo: compIndex === 0,
                        woRowSpan: comps.length,
                    });
                    jobRowSeen = true;
                });
            });
        });

        return out;
    }, [filteredOrders]);

    const footerBaseStyle = {
        ...baseTd,
        position: "sticky",
        bottom: 0,
        zIndex: 12,
        backgroundColor: "#657582",
        color: "#ffffff",
        fontWeight: 700,
        padding: "8px 12px",
        textAlign: "center",
        verticalAlign: "middle",
        borderTop: "2px solid #000000",
        boxShadow: "0 -2px 5px -1px rgba(0,0,0,0.1)",
        boxSizing: "border-box",
        whiteSpace: "nowrap",
    };

    // Footer index is the REAL table column index, not an offset from the
    // first non-frozen cell. Column 9 is COMPOSITION and is not frozen.
    const getFooterCellStyle = (index) => {
        if (index < frozenCount) {
            const width = currentFrozenWidths?.[index] ?? 0;
            const left = currentFrozenLefts?.[index] ?? 0;

            return {
                ...footerBaseStyle,
                left: `${left}px`,
                zIndex: 16,
                width: `${width}px`,
                minWidth: `${width}px`,
                maxWidth: `${width}px`,
                boxShadow:
                    index === frozenCount - 1
                        ? "2px -2px 5px -1px rgba(0,0,0,0.18)"
                        : "0 -2px 5px -1px rgba(0,0,0,0.1)",
            };
        }

        return footerBaseStyle;
    };

    return (
        <>
            <tbody>
                {flatRows.map((row, rowIndex) => {
                    const {
                        job,
                        wo,
                        comp,
                        isFirstOfJob,
                        jobRowSpan,
                        isFirstOfWo,
                        woRowSpan,
                        jobIndex,
                    } = row;

                    const isHovered = hoveredIndex === jobIndex;
                    const sentForAop = toNumber(
                        comp?.yarnDeliveriesWithColor?.SentForAop
                    );
                    const workOrderQty = toNumber(comp?.workOrderQty);
                    const sentDiff = sentForAop - workOrderQty;
                    const sentExceeded = sentDiff > 0;

                    const returnFromAop = toNumber(
                        comp?.yarnDeliveriesWithColor?.ReturnFromAop
                    );
                    const receivedFromAop = toNumber(
                        comp?.yarnDeliveriesWithColor?.ReceivedFromAop
                    );
                    const rcvdDiff =
                        returnFromAop + receivedFromAop - sentForAop;
                    const rcvdExceeded = rcvdDiff > 0;
                    const payableAmount =
                        receivedFromAop * toNumber(comp?.unitePrice);
                    const currentFinishDia = getFinishDia(wo, comp);

                    return (
                        <tr
                            key={`${wo?.id ?? "no-wo"}-${comp?.id ?? rowIndex}-${rowIndex}`}
                            onMouseEnter={() => setHoveredIndex(jobIndex)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            {/* 0 — ACTION */}
                            {isFirstOfWo && (
                                <td style={stickyTd(0, isHovered)} rowSpan={woRowSpan}>
                                    {wo ? (
                                        <div className="flex flex-col items-center justify-center gap-2 px-2 py-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePreview?.({ job, wo });
                                                }}
                                                className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
                                                title="Preview work order"
                                            >
                                                Preview <Eye size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleReviseWorkOrder?.(wo.id);
                                                }}
                                                className="flex w-full items-center justify-center gap-2 rounded-md bg-yellow-400 px-3 py-1.5 text-sm font-medium text-yellow-900 transition hover:bg-yellow-500"
                                                title="Revise work order"
                                            >
                                                Revise <Edit size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={cellPad}>-</div>
                                    )}
                                </td>
                            )}

                            {/* 1 — WORK ORDER DATE */}
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

                            {/* 2 — MONTH */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(2, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div className={cellPad}>{wo?.month || "-"}</div>
                                </td>
                            )}

                            {/* 3 — FACTORY NAME */}
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
                                            {isEdit?.updatedFieldName ===
                                                "factoryName" &&
                                            isEdit?.rowId === wo.id ? (
                                                <input
                                                    type="text"
                                                    name="factoryName"
                                                    className="p-2 outline-none border rounded-md w-full"
                                                    value={updatedFields.currentValue}
                                                    onChange={handleOnChange}
                                                />
                                            ) : (
                                                <span
                                                    onClick={() =>
                                                        handleEditRowData(wo.id)
                                                    }
                                                >
                                                    {wo.factoryName}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </td>
                            )}

                            {/* 4 — WORK ORDER NO */}
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

                            {/* 5 — BUYER NAME */}
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

                            {/* 6 — JOB NO (one cell per job) */}
                            {isFirstOfJob && (
                                <td
                                    style={stickyTd(6, isHovered)}
                                    rowSpan={jobRowSpan}
                                >
                                    <div
                                        onDoubleClick={() =>
                                            handleRedirect(job.jobNo)
                                        }
                                        className={cellPad}
                                    >
                                        <span
                                            onClick={() =>
                                                getDataForCancellation({
                                                    jobNo: job.jobNo,
                                                    isOpen: true,
                                                })
                                            }
                                        >
                                            {job.jobNo || "_"}
                                        </span>
                                    </div>
                                </td>
                            )}

                            {/* 7 — STYLE NO */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(7, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div className={cellPad}>
                                        {wo?.styleRequirement?.styleNo || "-"}
                                    </div>
                                </td>
                            )}

                            {/* 8 — COLOR (per work order, as in the original row grouping). */}
                            {isFirstOfWo && (
                                <td style={stickyTd(8, isHovered)} rowSpan={woRowSpan}>
                                    <div
                                        onClick={() => comp?.id && handleEditRowData(comp.id)}
                                        className={cellPad}
                                        style={{ cursor: "pointer" }}
                                    >
                                        {comp?.color || "-"}
                                    </div>
                                </td>
                            )}

                            {/* 9 — COMPOSITION (non-frozen; preserve original row grouping). */}
                            {isFirstOfWo && (
                                <td style={dataTd} rowSpan={woRowSpan}>
                                    <div className={cellPad}>{comp?.composition || "-"}</div>
                                </td>
                            )}

                            {/* 10 — FINISH DIA */}
                            <td style={dataTd}>
                                <div className={cellPad}>{currentFinishDia}</div>
                            </td>

                            {/* 11 — WORK ORDER QTY */}
                            <td style={dataTd}>
                                <div
                                    onDoubleClick={() =>
                                        wo &&
                                        handleInlineEdit(
                                            wo.id,
                                            comp?.workOrderQty,
                                            "workOrder",
                                            "workOrderQty",
                                            comp?.id
                                        )
                                    }
                                    className={`${cellPad} cursor-pointer`}
                                >
                                    {isEdit?.updatedFieldName ===
                                        "workOrderQty" &&
                                    isEdit?.compId === comp?.id ? (
                                        <input
                                            type="text"
                                            className="p-2 outline-none border rounded-md w-full"
                                            name="workOrderQty"
                                            value={updatedFields.currentValue}
                                            onChange={handleOnChange}
                                        />
                                    ) : comp?.workOrderQty != null ? (
                                        formatNumber(comp.workOrderQty)
                                    ) : (
                                        "-"
                                    )}
                                </div>
                            </td>

                            {/* 12 — SENT FOR AOP */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {comp?.yarnDeliveriesWithColor?.SentForAop != null
                                        ? formatNumber(
                                              comp.yarnDeliveriesWithColor.SentForAop
                                          )
                                        : "-"}
                                </div>
                            </td>

                            {/* 13 — DELIVERY SHORT & EXCESS */}
                            <td style={dataTd}>
                                <div
                                    className={cellPad}
                                    style={{
                                        color: sentExceeded ? "red" : "green",
                                        fontWeight: "bold",
                                    }}
                                >
                                    {sentExceeded
                                        ? formatNumber(sentDiff)
                                        : `(${formatNumber(Math.abs(sentDiff))})`}
                                </div>
                            </td>

                            {/* 14 — RETURN FROM AOP */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {comp?.yarnDeliveriesWithColor?.ReturnFromAop != null
                                        ? formatNumber(returnFromAop)
                                        : "-"}
                                </div>
                            </td>

                            {/* 15 — RECEIVED FROM AOP */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {comp?.yarnDeliveriesWithColor?.ReceivedFromAop != null
                                        ? formatNumber(receivedFromAop)
                                        : "-"}
                                </div>
                            </td>

                            {/* 16 — FINISH AFTER AOP */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {comp?.yarnDeliveriesWithColor?.AOPFinishFabricRcvd != null
                                        ? formatNumber(
                                              comp.yarnDeliveriesWithColor
                                                  .AOPFinishFabricRcvd
                                          )
                                        : "-"}
                                </div>
                            </td>

                            {/* 17 — PARTY BALANCE */}
                            <td style={dataTd}>
                                <div
                                    className={cellPad}
                                    style={{
                                        color: rcvdExceeded ? "red" : "green",
                                        fontWeight: "bold",
                                    }}
                                >
                                    {rcvdExceeded
                                        ? formatNumber(rcvdDiff)
                                        : `(${formatNumber(Math.abs(rcvdDiff))})`}
                                </div>
                            </td>

                            {/* 18 — PRICE PER KG */}
                            <td style={dataTd}>
                                <div
                                    onDoubleClick={() =>
                                        comp?.id &&
                                        handleInlineEdit(
                                            comp.id,
                                            comp.unitePrice,
                                            "workOrder",
                                            "unitePrice",
                                            comp.id
                                        )
                                    }
                                    className={`${cellPad} cursor-pointer`}
                                >
                                    {isEdit?.updatedFieldName === "unitePrice" &&
                                    isEdit?.rowId === comp?.id ? (
                                        <input
                                            type="text"
                                            className="p-2 outline-none border rounded-md w-full"
                                            name="unitePrice"
                                            value={updatedFields.currentValue}
                                            onChange={handleOnChange}
                                        />
                                    ) : comp?.unitePrice != null ? (
                                        formatNumber(comp.unitePrice)
                                    ) : (
                                        "-"
                                    )}
                                </div>
                            </td>

                            {/* 19 — PAYABLE AMOUNT */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {payableAmount ? formatNumber(payableAmount) : "-"}
                                </div>
                            </td>

                            {/* 20 — PAID BILLING AMOUNT placeholder */}
                            <td style={dataTd}>
                                <div className={cellPad}>-</div>
                            </td>

                            {/* 21 — PENDING BILLING AMOUNT placeholder */}
                            <td style={dataTd}>
                                <div className={cellPad}>-</div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    {/* Columns 0–8: frozen footer cells. */}
                    {Array.from({ length: frozenCount }).map((_, index) => (
                        <td
                            key={`footer-frozen-${index}`}
                            style={getFooterCellStyle(index)}
                        >
                            {index === 0 ? (
                                <div
                                    className={`${cellPad} text-white`}
                                    style={{ textAlign: "left", paddingLeft: "4px" }}
                                >
                                    TOTAL
                                </div>
                            ) : null}
                        </td>
                    ))}

                    {/* 9 — COMPOSITION placeholder (non-frozen). */}
                    <td style={getFooterCellStyle(9)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* 10 — FINISH DIA total placeholder. */}
                    <td style={getFooterCellStyle(10)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* 11 — WORK ORDER QTY total. */}
                    <td style={getFooterCellStyle(11)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.workOrderQty.toFixed(2)}
                        </div>
                    </td>

                    {/* 12 — SENT FOR AOP total. */}
                    <td style={getFooterCellStyle(12)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.sentForAop.toFixed(2)}
                        </div>
                    </td>

                    {/* 13 — DELIVERY SHORT & EXCESS total. */}
                    <td style={getFooterCellStyle(13)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.shortExcess > 0
                                ? totals.shortExcess.toFixed(2)
                                : `(${Math.abs(totals.shortExcess).toFixed(2)})`}
                        </div>
                    </td>

                    {/* 14 — RETURN FROM AOP total. */}
                    <td style={getFooterCellStyle(14)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.ReturnFromAop.toFixed(2)}
                        </div>
                    </td>

                    {/* 15 — RECEIVED FROM AOP total. */}
                    <td style={getFooterCellStyle(15)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.receivedFromAop.toFixed(2)}
                        </div>
                    </td>

                    {/* 16 — FINISH AFTER AOP total. */}
                    <td style={getFooterCellStyle(16)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.FinishFromAop.toFixed(2)}
                        </div>
                    </td>

                    {/* 17 — PARTY BALANCE total. */}
                    <td style={getFooterCellStyle(17)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.rcvdShortExcess > 0
                                ? totals.rcvdShortExcess.toFixed(2)
                                : `(${Math.abs(totals.rcvdShortExcess).toFixed(2)})`}
                        </div>
                    </td>

                    {/* 18 — PRICE PER KG placeholder. */}
                    <td style={getFooterCellStyle(18)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* 19 — PAYABLE AMOUNT total. */}
                    <td style={getFooterCellStyle(19)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.payableAmount.toFixed(2)}
                        </div>
                    </td>

                    {/* 20 — PAID BILLING AMOUNT placeholder. */}
                    <td style={getFooterCellStyle(20)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* 21 — PENDING BILLING AMOUNT placeholder. */}
                    <td style={getFooterCellStyle(21)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>
                </tr>
            </tfoot>
        </>
    );
};

export default AopOrder;
