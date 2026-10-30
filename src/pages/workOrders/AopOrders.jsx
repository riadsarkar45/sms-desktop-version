import { useState, useMemo } from "react";

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
    searchTerm = ""
}) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const cellPad = "py-2 px-3";

    // Base styles for all TDs
    const baseTd = {
        borderRight: "1px solid #000000",
        borderBottom: "1px solid #000000",
        padding: 0,
        textAlign: "center",
        verticalAlign: "top",
        boxSizing: "border-box"
        
    };

    // Data cell style
    const dataTd = { ...baseTd };

    // Sticky frozen column style for body rows
    const stickyTd = (colIndex, isHovered) => ({
        ...baseTd,
        position: "sticky",
        left: `${currentFrozenLefts[colIndex]}px`,
        zIndex: 3,
        backgroundColor: isHovered ? "#bbf7d0" : "#ffffff",
        width: `${currentFrozenWidths[colIndex]}px`,
        minWidth: `${currentFrozenWidths[colIndex]}px`,
        boxShadow: colIndex === FROZEN_COUNT - 1
            ? "2px 0 5px -1px rgba(0,0,0,0.18)"
            : "none",
        cursor: "pointer",
    });

    // Helper function to get finish dia from styleRequirement
    const getFinishDia = (wo, comp) => {
        if (!wo?.styleRequirement?.rows || !comp) return "-";

        const matchingRow = wo.styleRequirement.rows.find(row =>
            row.composition === comp.composition &&
            row.color === comp.color
        );

        return matchingRow?.finishDia || "-";
    };

    // Calculate totals based on filtered orders
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

        (orders || []).forEach(job => {
            (job.workOrders || []).forEach(wo => {
                (wo.compositions || []).forEach(comp => {
                    const workOrderQty = Number(comp.workOrderQty) || 0;
                    const sentForAop = Number(comp.yarnDeliveriesWithColor?.SentForAop) || 0;
                    const ReturnFromAop = Number(comp.yarnDeliveriesWithColor?.ReturnFromAop) || 0;
                    const receivedFromAop = Number(comp.yarnDeliveriesWithColor?.ReceivedFromAop) || 0;
                    const FinishFromAop = Number(comp.yarnDeliveriesWithColor?.AOPFinishFabricRcvd) || 0;
                    const unitePrice = Number(comp.unitePrice) || 0;

                    acc.workOrderQty += workOrderQty;
                    acc.sentForAop += sentForAop;
                    acc.shortExcess += sentForAop - workOrderQty;
                    acc.ReturnFromAop += ReturnFromAop;
                    acc.receivedFromAop += receivedFromAop;
                    acc.FinishFromAop += FinishFromAop;
                    acc.rcvdShortExcess += ReturnFromAop + receivedFromAop - sentForAop;
                    acc.payableAmount += receivedFromAop * unitePrice;
                });
            });
        });

        return acc;
    }, [orders]);

    // Filter orders based on search term
    const filteredOrders = useMemo(() => {
        if (!searchTerm?.trim()) return orders || [];

        const lowerSearch = searchTerm.toLowerCase();

        return (orders || []).map(job => {
            const filteredWorkOrders = (job.workOrders || []).map(wo => {
                const filteredComps = (wo.compositions || []).filter(comp => {
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
                    ].map(val => String(val || "").toLowerCase());

                    return searchableValues.some(val => val.includes(lowerSearch));
                });

                return { ...wo, compositions: filteredComps };
            }).filter(wo => wo.compositions.length > 0);

            return { ...job, workOrders: filteredWorkOrders };
        }).filter(job => job.workOrders.length > 0);
    }, [orders, searchTerm]);

    // Flatten rows for rendering
    const flatRows = useMemo(() => {
        const out = [];
        (filteredOrders || []).forEach((job, jobIndex) => {
            const workOrders = job.workOrders || [];
            const jobCompCount = workOrders.reduce(
                (sum, wo) => sum + (wo.compositions?.length || 1),
                0
            ) || 1;
            let jobRowSeen = false;

            if (workOrders.length === 0) {
                out.push({
                    jobIndex, job, wo: null, comp: null,
                    isFirstOfJob: true, jobRowSpan: 1,
                    isFirstOfWo: true, woRowSpan: 1,
                });
                return;
            }

            workOrders.forEach((wo) => {
                const comps = wo.compositions && wo.compositions.length > 0 ? wo.compositions : [null];
                comps.forEach((comp, compIndex) => {
                    out.push({
                        jobIndex, job, wo, comp,
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
    }, [filteredOrders]);

    /* ============================================================
       FOOTER STYLES
       ============================================================ */

    // Base style for every footer cell (sticks to the bottom of the scroll area)
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
        borderTop: "2px solid #000000",
        boxShadow: "0 -2px 5px -1px rgba(0,0,0,0.1)",
        boxSizing: "border-box",
        whiteSpace: "nowrap",
    };

    // Footer cell style.
    // index < FROZEN_COUNT  -> sticky BOTTOM + sticky LEFT (frozen column)
    // index >= FROZEN_COUNT -> sticky BOTTOM only
    const getFooterCellStyle = (index) => {
        if (index < FROZEN_COUNT) {
            return {
                ...footerBaseStyle,
                // keep both axis sticky
                left: `${currentFrozenLefts[index]}px`,
                // must sit ABOVE the non-frozen footer cells (12)
                zIndex: 16,
                backgroundColor: "#657582",

                width: `${currentFrozenWidths[index]}px`,
                minWidth: `${currentFrozenWidths[index]}px`,
                maxWidth: `${currentFrozenWidths[index]}px`,
                // right shadow only on the last frozen column
                boxShadow: index === FROZEN_COUNT - 1
                    ? "2px -2px 5px -1px rgba(0,0,0,0.18)"
                    : "0 -2px 5px -1px rgba(0,0,0,0.1)",
            };
        }

        return footerBaseStyle;
    };

    return (
        <>
            <tbody>
                {flatRows.map((r, rowIndex) => {
                    const { job, wo, comp, isFirstOfJob, jobRowSpan, isFirstOfWo, woRowSpan, jobIndex } = r;
                    const isHovered = hoveredIndex === jobIndex;

                    const sentForAop = Number(comp?.yarnDeliveriesWithColor?.SentForAop) || 0;
                    const workOrderQtyNum = Number(comp?.workOrderQty) || 0;
                    const sentDiff = sentForAop - workOrderQtyNum;
                    const sentExceeded = sentDiff?.toFixed(2) > 0;

                    const returnFromAop = Number(comp?.yarnDeliveriesWithColor?.ReturnFromAop) || 0;
                    const receivedFromAop = Number(comp?.yarnDeliveriesWithColor?.ReceivedFromAop) || 0;
                    const rcvdDiff = (returnFromAop + receivedFromAop) - sentForAop;
                    const rcvdExceeded = rcvdDiff?.toFixed(2) > 0;

                    const payableAmount = (Number(comp?.yarnDeliveriesWithColor?.ReceivedFromAop?.toFixed(2)) || 0) * (Number(comp?.unitePrice?.toFixed(2)) || 0);

                    const currentFinishDia = getFinishDia(wo, comp);

                    return (
                        <tr
                            key={rowIndex}
                            onMouseEnter={() => setHoveredIndex(jobIndex)}
                            onMouseLeave={() => setHoveredIndex(null)}
                        >
                            {/* MONTH (per work order) */}
                            {isFirstOfWo && (
                                <td style={stickyTd(0, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>{wo?.month || "-"}</div>
                                </td>
                            )}

                            {/* FACTORY NAME (per work order) */}
                            {isFirstOfWo && (
                                <td style={stickyTd(1, isHovered)} rowSpan={woRowSpan}>
                                    {!wo || wo.factoryName === "NULL" ? (
                                        <div className={`${cellPad} text-gray-500`}>-</div>
                                    ) : (
                                        <div onDoubleClick={() => handleInlineEdit(wo.id, wo.factoryName, "workOrder", "factoryName", 0)} className={`${cellPad} cursor-pointer`}>
                                            {isEdit.updatedFieldName === "factoryName" && isEdit.rowId === wo.id ? (
                                                <input type="text" name="factoryName" className="p-2 outline-none border rounded-md w-full" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                            ) : <span onClick={() => handleEditRowData(wo.id)}>{wo.factoryName}</span>}
                                        </div>
                                    )}
                                </td>
                            )}

                            {/* WORK ORDER NO (per work order) */}
                            {isFirstOfWo && (
                                <td style={stickyTd(2, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>{wo?.workOrderNo || "-"}</div>
                                </td>
                            )}

                            {/* BUYER NAME (per work order) */}
                            {isFirstOfWo && (
                                <td style={stickyTd(3, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>{wo?.styleRequirement?.buyerName || "-"}</div>
                                </td>
                            )}

                            {/* JOB NO (per job) */}
                            {isFirstOfJob && (
                                <td style={stickyTd(4, isHovered)} rowSpan={jobRowSpan}>
                                    <div onDoubleClick={() => handleRedirect(job.jobNo)} className={cellPad}>{job.jobNo || "NO JOB FOUND"}</div>
                                </td>
                            )}

                            {/* STYLE NO (per work order) */}
                            {isFirstOfWo && (
                                <td style={stickyTd(5, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>{wo?.styleRequirement?.styleNo || "-"}</div>
                                </td>
                            )}

                            {/* COLOR (per composition) */}
                            {isFirstOfWo && (
                                <td style={stickyTd(6, isHovered)} rowSpan={woRowSpan}>
                                    <div onClick={() => handleEditRowData(comp?.id)} className={cellPad} style={{ cursor: "pointer" }}>
                                        {comp?.color || "-"}
                                    </div>
                                </td>
                            )}

                            {/* COMPOSITION (per composition) */}
                            {isFirstOfWo && (
                                <td style={stickyTd(7, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>{comp?.composition || "-"}</div>
                                </td>
                            )}

                            {/* FINISH DIA (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad}>{currentFinishDia}</div>
                            </td>

                            {/* WORK ORDER QTY (per composition) */}
                            <td style={dataTd}>
                                <div onDoubleClick={() => wo && handleInlineEdit(wo.id, comp?.workOrderQty, "workOrder", "workOrderQty", comp?.id)} className={`${cellPad} cursor-pointer`}>
                                    {isEdit.updatedFieldName === "workOrderQty" && isEdit.compId === comp?.id ? (
                                        <input type="text" className="p-2 outline-none border rounded-md w-full" name="workOrderQty" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                    ) : comp?.workOrderQty?.toFixed(2) || "-"}
                                </div>
                            </td>

                            {/* SENT FOR AOP (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad}>{comp?.yarnDeliveriesWithColor?.SentForAop?.toFixed(2) || "-"}</div>
                            </td>

                            {/* DEL. SHORT & EXCESS (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad} style={{ color: sentExceeded ? "red" : "green", fontWeight: "bold" }}>
                                    {sentExceeded ? sentDiff : `(${Math.abs(sentDiff?.toFixed(2))})`}
                                </div>
                            </td>

                            {/* RETURN FROM AOP (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad}>{comp?.yarnDeliveriesWithColor?.ReturnFromAop?.toFixed(2) || "-"}</div>
                            </td>

                            {/* RECEIVED FROM AOP (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad}>{comp?.yarnDeliveriesWithColor?.ReceivedFromAop?.toFixed(2) || "-"}</div>
                            </td>

                            {/* FINISH FROM AOP (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad}>{comp?.yarnDeliveriesWithColor?.AOPFinishFabricRcvd?.toFixed(2) || "-"}</div>
                            </td>

                            {/* RCVD SHORT & EXCESS (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad} style={{ color: rcvdExceeded ? "red" : "green", fontWeight: "bold" }}>
                                    {rcvdExceeded ? rcvdDiff?.toFixed(2) : `(${Math.abs(rcvdDiff?.toFixed(2))})`}
                                </div>
                            </td>

                            {/* UNIT PRICE (per composition) */}
                            <td style={dataTd}>
                                <div onDoubleClick={() => handleInlineEdit(comp?.id, comp?.unitePrice, "workOrder", "unitePrice", comp?.id)} className={`${cellPad} cursor-pointer`}>
                                    {isEdit.updatedFieldName === "unitePrice" && isEdit.rowId === comp?.id ? (
                                        <input type="text" className="p-2 outline-none border rounded-md w-full" name="unitePrice" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                    ) : comp?.unitePrice?.toFixed(2) || "-"}
                                </div>
                            </td>

                            {/* PAYABLE AMOUNT (per composition) */}
                            <td style={dataTd}>
                                <div className={cellPad}>{payableAmount || "-"}</div>
                            </td>

                            {/* PAID BILLING AMOUNT placeholder */}
                            <td style={dataTd}>
                                <div className={cellPad}>-</div>
                            </td>

                            {/* PENDING BILLING AMOUNT placeholder */}
                            <td style={dataTd}>
                                <div className={cellPad}>-</div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    {/* ===== FROZEN FOOTER CELLS =====
                        Rendered as INDIVIDUAL cells (no colSpan).
                        colSpan + position:sticky is broken in Chromium,
                        which is why the frozen side of the footer was not sticking. */}
                    {Array.from({ length: FROZEN_COUNT }).map((_, i) => (
                        <td key={`footer-frozen-${i}`} style={getFooterCellStyle(i)}>
                            {i === 0 ? (
                                <div className={`${cellPad} text-white`} style={{ textAlign: "left", paddingLeft: "4px" }}>TOTAL</div>
                            ) : null}
                        </td>
                    ))}

                    {/* FINISH DIA Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* WORK ORDER QTY Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 1)}>
                        <div className={`${cellPad} text-white`}>{totals.workOrderQty.toFixed(2)}</div>
                    </td>

                    {/* SENT FOR AOP Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 2)}>
                        <div className={`${cellPad} text-white`}>{totals.sentForAop.toFixed(2)}</div>
                    </td>

                    {/* DEL. SHORT & EXCESS Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 3)}>
                        <div className={`${cellPad} text-white`} style={{ color: totals.shortExcess > 0 ? "white" : "white" }}>
                            {totals.shortExcess > 0 ? totals.shortExcess.toFixed(2) : `(${Math.abs(totals.shortExcess.toFixed(2))})`}
                        </div>
                    </td>

                    {/* RETURN FROM AOP Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 4)}>
                        <div className={`${cellPad} text-white`}>{totals.ReturnFromAop.toFixed(2)}</div>
                    </td>

                    {/* RECEIVED FROM AOP Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 5)}>
                        <div className={`${cellPad} text-white`}>{totals.receivedFromAop.toFixed(2)}</div>
                    </td>

                    {/* FINISH FROM AOP Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 6)}>
                        <div className={`${cellPad} text-white`}>{totals.FinishFromAop.toFixed(2)}</div>
                    </td>

                    {/* RCVD SHORT & EXCESS Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 7)}>
                        <div className={`${cellPad} text-white`} style={{ color: totals.rcvdShortExcess > 0 ? "white" : "white" }}>
                            {totals.rcvdShortExcess > 0 ? totals.rcvdShortExcess.toFixed(2) : `(${Math.abs(totals.rcvdShortExcess.toFixed(2))})`}
                        </div>
                    </td>

                    {/* UNIT PRICE Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 8)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* PAYABLE AMOUNT Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 9)}>
                        <div className={`${cellPad} text-white`}>{totals.payableAmount.toFixed(2)}</div>
                    </td>

                    {/* PAID BILLING AMOUNT Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 10)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* PENDING BILLING AMOUNT Total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 11)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>
                </tr>
            </tfoot>
        </>
    );
};

export default AopOrder;