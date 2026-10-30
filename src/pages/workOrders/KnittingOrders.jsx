import { useState, useMemo } from "react";

const KnittingOrder = ({
    orders,
    handleEditRowData,
    handleRedirect,
    handleInlineEdit,
    updatedFields,
    handleOnChange,
    isEdit,
    FROZEN_COUNT,
    currentFrozenWidths,
    currentFrozenLefts
}) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    const cellPad = "px-3 py-2";

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

    const stickyTd = (colIndex, isHovered) => ({
        ...baseTd,
        position: "sticky",
        left: `${currentFrozenLefts[colIndex]}px`,
        zIndex: 3,
        backgroundColor: isHovered ? "#bbf7d0" : "#ffffff",
        width: `${currentFrozenWidths[colIndex]}px`,
        minWidth: `${currentFrozenWidths[colIndex]}px`,
        maxWidth: `${currentFrozenWidths[colIndex]}px`,
        overflow: "visible",
        textOverflow: "clip",
        whiteSpace: "nowrap",
        boxShadow: colIndex === FROZEN_COUNT - 1 ? "2px 0 5px -1px rgba(0,0,0,0.18)" : "none",
    });

    const plainTd = (isHovered) => ({
        ...baseTd,
        backgroundColor: isHovered ? "#f0fdf4" : "#ffffff",
        minWidth: "100px",
    });

    /* ============================================================
       FOOTER STYLES (same pattern as DyeingOrder / AopOrder)
       ============================================================ */

    // Base style for every footer cell (sticks to bottom of scroll area)
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

    // index <  FROZEN_COUNT -> sticky BOTTOM + sticky LEFT (frozen column)
    // index >= FROZEN_COUNT -> sticky BOTTOM only
    const getFooterCellStyle = (index) => {
        if (index < FROZEN_COUNT) {
            return {
                ...footerBaseStyle,
                left: `${currentFrozenLefts[index]}px`,
                // must sit above the non-frozen footer cells (12)
                zIndex: 20,
                backgroundColor: "#657582",
                width: `${currentFrozenWidths[index]}px`,
                minWidth: `${currentFrozenWidths[index]}px`,
                maxWidth: `${currentFrozenWidths[index]}px`,
                overflow: "visible",
                textOverflow: "clip",
                // right shadow only on the last frozen column
                boxShadow: index === FROZEN_COUNT - 1
                    ? "2px -2px 5px -1px rgba(0,0,0,0.18)"
                    : "0 -2px 5px -1px rgba(0,0,0,0.1)",
            };
        }

        return footerBaseStyle;
    };

    const totals = useMemo(() => {
        const acc = {
            orderQty: 0,
            workOrderQty: 0,
            totalYarnDelivery: 0,
            delShortExcess: 0,
            yarnReturn: 0,
            GreyFabricReceived: 0,
            rcvdShortExcess: 0,
            payableAmount: 0,
        };

        (orders || []).forEach((job) => {
            (job.workOrders || []).forEach((wo) => {
                (wo.compositions || []).forEach((comp) => {
                    const orderQty = Number(comp.orderQty) || 0;
                    const workOrderQty = Number(comp.workOrderQty) || 0;
                    const delivered = Number(comp.yarnDeliveriesWithColor?.YarnDelivery) || 0;
                    const returned = Number(comp.yarnDeliveriesWithColor?.YarnReturn) || 0;
                    const received = Number(comp.yarnDeliveriesWithColor?.GreyFabricReceived) || 0;
                    const price = Number(comp.unitePrice) || 0;

                    acc.orderQty += orderQty;
                    acc.workOrderQty += workOrderQty;
                    acc.totalYarnDelivery += delivered;
                    acc.delShortExcess += workOrderQty - delivered;
                    acc.yarnReturn += returned;
                    acc.GreyFabricReceived += received;
                    acc.rcvdShortExcess += received + returned - delivered;
                    acc.payableAmount += received * price;
                });
            });
        });

        return acc;
    }, [orders]);

    const renderSigned = (value) => {
        const exceeded = value > 0;
        return (
            <span style={{ color: exceeded ? "green" : value < 0 ? "red" : "inherit" }}>
                {exceeded ? `(${Math.abs(value)})` : Math.abs(value)}
            </span>
        );
    };

    const getFinishDia = (wo, comp) => {
        if (!wo?.styleRequirement?.rows || !comp) return "-";

        const matchingRow = wo.styleRequirement.rows.find(row =>
            row.composition === comp.composition &&
            row.color === comp.color
        );

        return matchingRow?.finishDia || "-";
    };

    // Filter orders based on search term
    const filteredOrders = useMemo(() => {
        if (!searchTerm.trim()) return orders || [];

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
                        wo?.yarnCount,
                        wo?.lotNo,
                        wo?.stichLength,
                        wo?.machineDia,
                        comp?.workOrderQty,
                    ].map(val => String(val || "").toLowerCase());

                    return searchableValues.some(val => val.includes(lowerSearch));
                });

                return { ...wo, compositions: filteredComps };
            }).filter(wo => wo.compositions.length > 0);

            return { ...job, workOrders: filteredWorkOrders };
        }).filter(job => job.workOrders.length > 0);
    }, [orders, searchTerm]);

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

    // Search input style
    const searchInputStyle = {
        width: "100%",
        padding: "4px 8px",
        border: "1px solid #d1d5db",
        borderRadius: "4px",
        fontSize: "12px",
        outline: "none",
        boxSizing: "border-box",
    };

    const clearButtonStyle = {
        position: "absolute",
        right: "4px",
        top: "50%",
        transform: "translateY(-50%)",
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "#6b7280",
        fontSize: "14px",
        padding: "2px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    };

    return (
        <>
            <tbody>
                {flatRows.map((r, rowIndex) => {
                    const { job, wo, comp, isFirstOfJob, jobRowSpan, isFirstOfWo, woRowSpan, jobIndex } = r;
                    const isHovered = hoveredIndex === jobIndex;

                    const workOrderQty = Number(comp?.workOrderQty) || 0;
                    const totalYarnDelivery = Number(comp?.yarnDeliveriesWithColor?.YarnDelivery) || 0;
                    const totalYarnReturn = Number(comp?.yarnDeliveriesWithColor?.YarnReturn) || 0;
                    const totalDelivered = totalYarnDelivery - totalYarnReturn || 0;
                    const delDiff = workOrderQty - totalYarnDelivery + totalYarnReturn;
                    const delExceeded = delDiff?.toFixed(2) > 0;

                    const greyReceived = Number(comp?.yarnDeliveriesWithColor?.GreyFabricReceived) || 0;
                    const rcvdDiff = greyReceived + totalYarnReturn - totalYarnDelivery;
                    const rcvdExceeded = rcvdDiff.toFixed(2) < 0;

                    const payablePrice = Number(comp?.unitePrice) || 0;
                    const payableTotal = greyReceived * payablePrice;

                    const currentFinishDia = getFinishDia(wo, comp);

                    return (
                        <tr key={rowIndex} onClick={() => setHoveredIndex(jobIndex)}>
                            {/* COL 0 — MONTH */}
                            {isFirstOfWo && (
                                <td style={stickyTd(0, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {wo?.month || "NO MONTH NAME FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 1 — FACTORY NAME */}
                            {isFirstOfWo && (
                                <td style={stickyTd(1, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {!wo || wo.factoryName === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() => handleInlineEdit(wo.id, wo.factoryName, "workOrder", "factoryName", 0)}
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName === "factoryName" && isEdit.rowId === wo.id ? (
                                                    <input type="text" name="factoryName" className="p-2 outline-none border rounded-md w-full" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                                ) : <span onClick={() => handleEditRowData(wo.id)}>{wo.factoryName}</span>}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 2 — WORK ORDER NO */}
                            {isFirstOfWo && (
                                <td style={stickyTd(2, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {wo?.workOrderNo || "NO WORK ORDER FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 3 — BUYER NAME */}
                            {isFirstOfWo && (
                                <td style={stickyTd(3, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {wo?.styleRequirement?.buyerName || "NO BUYER NAME FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 4 — JOB NO */}
                            {isFirstOfJob && (
                                <td style={stickyTd(4, isHovered)} rowSpan={jobRowSpan}>
                                    <div
                                        onDoubleClick={() => handleRedirect(job.jobNo)}
                                        className={cellPad}
                                    >
                                        {job.jobNo || "NO JOB FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 5 — STYLE NO */}
                            {isFirstOfWo && (
                                <td style={stickyTd(5, isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {wo?.styleRequirement?.styleNo || wo?.styleNo || "NO STYLE NO FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 6 — COLOR */}
                            <td style={stickyTd(6, isHovered)}>
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (comp?.id) {
                                            handleEditRowData(comp.id);
                                        }
                                    }}
                                    className={`${cellPad} cursor-pointer hover:text-blue-500`}
                                >
                                    {comp?.color || "-"}
                                </div>
                            </td>

                            {/* COL 7 — COMPOSITION */}
                            <td style={stickyTd(7, isHovered)}>
                                <div className={cellPad}>
                                    {comp?.composition || "-"}
                                </div>
                            </td>

                            {/* COL 8 — FINISH DIA */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>
                                    {currentFinishDia}
                                </div>
                            </td>

                            {/* COL 9 — YARN COUNT */}
                            {isFirstOfWo && (
                                <td style={plainTd(isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {!wo || wo.yarnCount === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() => handleInlineEdit(wo.id, wo.yarnCount, "workOrder", "yarnCount", 0)}
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName === "yarnCount" && isEdit.rowId === wo.id ? (
                                                    <input type="text" name="yarnCount" className="p-2 outline-none border rounded-md w-full" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                                ) : <span>{wo.yarnCount}</span>}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 10 — YARN LOT */}
                            {isFirstOfWo && (
                                <td style={plainTd(isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {!wo || wo.lotNo === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() => handleInlineEdit(wo.id, wo.lotNo, "workOrder", "lotNo", 0)}
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName === "lotNo" && isEdit.rowId === wo.id ? (
                                                    <input type="text" name="lotNo" className="p-2 outline-none border rounded-md w-full" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                                ) : <span>{wo.lotNo}</span>}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 11 — STITCH LENGTH */}
                            {isFirstOfWo && (
                                <td style={plainTd(isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {!wo || wo.stichLength === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() => handleInlineEdit(wo.id, wo.stichLength, "workOrder", "stichLength", 0)}
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName === "stichLength" && isEdit.rowId === wo.id ? (
                                                    <input type="text" name="stichLength" className="p-2 outline-none border rounded-md w-full" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                                ) : <span>{wo.stichLength}</span>}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 12 — MACHINE DIA */}
                            {isFirstOfWo && (
                                <td style={plainTd(isHovered)} rowSpan={woRowSpan}>
                                    <div className={cellPad}>
                                        {!wo || wo.machineDia === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() => handleInlineEdit(wo.id, wo.machineDia, "workOrder", "machineDia", 0)}
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName === "machineDia" && isEdit.rowId === wo.id ? (
                                                    <input type="text" name="machineDia" className="p-2 outline-none border rounded-md w-full" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                                ) : <span>{wo.machineDia}</span>}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 13 — WORK ORDER QTY */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    onDoubleClick={() => wo && handleInlineEdit(wo.id, comp?.workOrderQty, "workOrder", "workOrderQty", comp?.id)}
                                    className={`${cellPad} cursor-pointer`}
                                >
                                    {isEdit.updatedFieldName === "workOrderQty" && isEdit.compId === comp?.id ? (
                                        <input type="text" className="p-2 outline-none border rounded-md w-full" name="workOrderQty" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                    ) : comp?.workOrderQty?.toFixed(2) || "-"}
                                </div>
                            </td>

                            {/* COL 14 — TOTAL YARN DELIVERY */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>{totalDelivered.toFixed(2)}</div>
                            </td>

                            {/* COL 15 — DEL SHORT & EXCESS */}
                            <td style={plainTd(isHovered)}>
                                <div className={`${cellPad} font-bold`} style={{ color: delExceeded ? "green" : "red" }}>
                                    {delExceeded ? `(${Math.abs(delDiff?.toFixed(2))})` : Math.abs(delDiff?.toFixed(2))}
                                </div>
                            </td>

                            {/* COL 16 — YARN RETURN */}
                            <td style={plainTd(isHovered)}>
                                <div className={`${cellPad} text-red-600 font-extrabold`}>{comp?.yarnDeliveriesWithColor?.YarnReturn?.toFixed(2) || "-"}</div>
                            </td>

                            {/* COL 17 — GREY RECEIVED */}
                            <td style={plainTd(isHovered)}>
                                <div className={cellPad}>{comp?.yarnDeliveriesWithColor?.GreyFabricReceived?.toFixed(2) || "-"}</div>
                            </td>

                            {/* COL 18 — RCVD SHORT & EXCESS */}
                            <td style={plainTd(isHovered)}>
                                <div className={`${cellPad} font-bold`} style={{ color: rcvdExceeded ? "red" : "green" }}>
                                    {rcvdExceeded ? `(${Math.abs(rcvdDiff?.toFixed(2))})` : rcvdDiff?.toFixed(2)}
                                </div>
                            </td>

                            {/* COL 19 — UNIT PRICE */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    onDoubleClick={() => handleInlineEdit(comp?.id, comp?.unitePrice, "workOrder", "unitePrice", comp?.id)}
                                    className={`${cellPad} cursor-pointer`}
                                >
                                    {isEdit.updatedFieldName === "unitePrice" && isEdit.rowId === comp?.id ? (
                                        <input type="text" className="p-2 outline-none border rounded-md w-full" name="unitePrice" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                    ) : comp?.unitePrice?.toFixed(2) || "-"}
                                </div>
                            </td>

                            {/* COL 20 — PAYABLE AMOUNT */}
                            <td style={plainTd(isHovered)}>
                                <div className={`${cellPad} text-red-600 font-extrabold`}>{payableTotal > 0 ? payableTotal.toFixed(2) : "-"}</div>
                            </td>

                            {/* COL 21 — PAID BILLING AMOUNT */}
                            <td style={plainTd(isHovered)}>
                                <div className={`${cellPad} text-red-600 font-extrabold`}>-</div>
                            </td>

                            {/* COL 22 — PENDING BILLING AMOUNT */}
                            <td style={plainTd(isHovered)}>
                                <div className={`${cellPad} text-red-600 font-extrabold`}>-</div>
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
                        which is why the frozen side of the footer wasn't sticking. */}
                    {Array.from({ length: FROZEN_COUNT }).map((_, i) => (
                        <td key={`footer-frozen-${i}`} style={getFooterCellStyle(i)}>
                            {i === 0 ? (
                                <div className= {`${cellPad} text-white`} style={{ textAlign: "center", fontSize: "14px", fontWeight: 700 }}>TOTAL</div>
                            ) : null}
                        </td>
                    ))}

                    {/* COL 8 — FINISH DIA (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT)}>
                        <div className= {`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 9 — YARN COUNT (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 1)}>
                        <div className= {`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 10 — YARN LOT (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 2)}>
                        <div className= {`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 11 — STITCH LENGTH (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 3)}>
                        <div className= {`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 12 — MACHINE DIA (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 4)}>
                        <div className= {`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 13 — WORK ORDER QTY total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 5)}>
                        <div className= {`${cellPad} text-white`}>{formatNumber(totals.workOrderQty?.toFixed(2))}</div>
                    </td>

                    {/* COL 14 — TOTAL YARN DELIVERY total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 6)}>
                        <div className= {`${cellPad} text-white`}>{formatNumber(totals.totalYarnDelivery?.toFixed(2))}</div>
                    </td>

                    {/* COL 15 — DEL SHORT & EXCESS total - FIXED FORMATTING */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 7)}>
                        <div 
                            className={`${cellPad} font-bold text-white`} 
                            style={{ 
                                color: "white" 
                            }}
                        >
                            {totals?.delShortExcess > 0 
                                ? `(${Math.abs(totals?.delShortExcess)?.toFixed(2)})` 
                                : Math.abs(totals?.delShortExcess)?.toFixed(2)
                            }
                        </div>
                    </td>

                    {/* COL 16 — YARN RETURN total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 8)}>
                        <div className={`${cellPad} text-white`}>{formatNumber(totals.yarnReturn?.toFixed(2))}</div>
                    </td>

                    {/* COL 17 — GREY RECEIVED total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 9)}>
                        <div className= {`${cellPad} text-white`}>{formatNumber(totals.GreyFabricReceived?.toFixed(2))}</div>
                    </td>

                    {/* COL 18 — RCVD SHORT & EXCESS total - FIXED FORMATTING */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 10)}>
                        <div 
                            className={`${cellPad} font-bold text-white`}
                            style={{ 
                                color: "white" 
                            }}
                        >
                            {totals?.rcvdShortExcess < 0 
                                ? `(${Math.abs(totals?.rcvdShortExcess)?.toFixed(2)})` 
                                : Math.abs(totals?.rcvdShortExcess)?.toFixed(2)
                            }
                        </div>
                    </td>

                    {/* COL 19 — UNIT PRICE (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 11)}>
                        <div className= {`${cellPad} text-white`}></div>
                    </td>

                    {/* COL 20 — PAYABLE AMOUNT total */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 12)}>
                        <div className={`${cellPad} text-white`}>{formatNumber(totals.payableAmount.toFixed(2))}</div>
                    </td>

                    {/* COL 21 — PAID BILLING AMOUNT (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 13)}>
                        <div className= {`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 22 — PENDING BILLING AMOUNT (blank) */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 14)}>
                        <div className= {`${cellPad} text-white`}>-</div>
                    </td>
                </tr>
            </tfoot>
        </>
    );
};

export default KnittingOrder;