
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
    currentFrozenLefts,
    getDataForCancellation
}) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [hoveredCancellation, setHoveredCancellation] = useState(null);

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

    // Work order-level cancellation style
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
                left: `${currentFrozenLefts[index]}px`,
                zIndex: 20,
                backgroundColor: "#657582",
                width: `${currentFrozenWidths[index]}px`,
                minWidth: `${currentFrozenWidths[index]}px`,
                maxWidth: `${currentFrozenWidths[index]}px`,
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

    // Totals
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
                    const delivered =
                        Number(comp.yarnDeliveriesWithColor?.YarnDelivery) || 0;
                    const returned =
                        Number(comp.yarnDeliveriesWithColor?.YarnReturn) || 0;
                    const received =
                        Number(comp.yarnDeliveriesWithColor?.GreyFabricReceived) || 0;
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
            <span
                style={{
                    color: exceeded ? "green" : value < 0 ? "red" : "inherit",
                }}
            >
                {exceeded ? `(${Math.abs(value)})` : Math.abs(value)}
            </span>
        );
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

    // Search filter
    const filteredOrders = useMemo(() => {
        if (!searchTerm.trim()) return orders || [];

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
                                    wo?.yarnCount,
                                    wo?.lotNo,
                                    wo?.stichLength,
                                    wo?.machineDia,
                                    comp?.workOrderQty,
                                ].map((val) =>
                                    String(val || "").toLowerCase()
                                );

                                return searchableValues.some((val) =>
                                    val.includes(lowerSearch)
                                );
                            }
                        );

                        return {
                            ...wo,
                            compositions: filteredComps,
                        };
                    })
                    .filter((wo) => wo.compositions.length > 0);

                return {
                    ...job,
                    workOrders: filteredWorkOrders,
                };
            })
            .filter((job) => job.workOrders.length > 0);
    }, [orders, searchTerm]);

    // Flatten rows
    const flatRows = useMemo(() => {
        const out = [];

        (filteredOrders || []).forEach((job, jobIndex) => {
            const workOrders = job.workOrders || [];

            const jobCompCount =
                workOrders.reduce(
                    (sum, wo) => sum + (wo.compositions?.length || 1),
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

    // Search input styles
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

    // Handle cancellation tooltip
    const handleCancellationHover = (event, wo, comp) => {
        if (!wo) {
            setHoveredCancellation(null);
            return;
        }

        const workOrderCancelled = Boolean(wo.isCancelled);
        const compositionCancelled = Boolean(comp?.isCancelled);

        if (!workOrderCancelled && !compositionCancelled) {
            setHoveredCancellation(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();

        const reason = workOrderCancelled
            ? wo.reason
            : comp?.reason || wo.reason;

        const remarks = workOrderCancelled
            ? wo.remarks
            : comp?.remarks || wo.remarks;

        const tooltipWidth = 280;
        const tooltipHeight = 140;

        const left = Math.max(
            12,
            Math.min(rect.right + 10, window.innerWidth - tooltipWidth - 12)
        );

        const top = Math.max(
            12,
            Math.min(rect.top, window.innerHeight - tooltipHeight - 12)
        );

        setHoveredCancellation({
            workOrderId: wo.id,
            reason: reason || "No reason provided",
            remarks: remarks || "No remarks provided",
            left,
            top,
        });
    };

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

                    // Cancellation status
                    const isWorkOrderCancelled = Boolean(wo?.isCancelled);
                    const isCompositionCancelled = Boolean(comp?.isCancelled);

                    // Full work order cancellation affects every composition row.
                    // Composition cancellation affects only its own row.
                    const isRowCancelled =
                        isWorkOrderCancelled || isCompositionCancelled;

                    const cancellationTextStyle = {
                        textDecoration: isRowCancelled
                            ? "line-through"
                            : "none",
                        textDecorationColor: "#dc2626",
                        textDecorationThickness: "1.5px",
                    };

                    const workOrderTextStyle = {
                        textDecoration: isWorkOrderCancelled
                            ? "line-through"
                            : "none",
                        textDecorationColor: "#dc2626",
                        textDecorationThickness: "1.5px",
                    };

                    const workOrderQty = Number(comp?.workOrderQty) || 0;

                    const totalYarnDelivery =
                        Number(
                            comp?.yarnDeliveriesWithColor?.YarnDelivery
                        ) || 0;

                    const totalYarnReturn =
                        Number(
                            comp?.yarnDeliveriesWithColor?.YarnReturn
                        ) || 0;

                    const totalDelivered =
                        totalYarnDelivery - totalYarnReturn || 0;

                    const delDiff =
                        workOrderQty - totalYarnDelivery + totalYarnReturn;

                    const delExceeded = delDiff.toFixed(2) > 0;

                    const greyReceived =
                        Number(
                            comp?.yarnDeliveriesWithColor?.GreyFabricReceived
                        ) || 0;

                    const rcvdDiff =
                        greyReceived + totalYarnReturn - totalYarnDelivery;

                    const rcvdExceeded = rcvdDiff.toFixed(2) < 0;

                    const payablePrice = Number(comp?.unitePrice) || 0;
                    const payableTotal = greyReceived * payablePrice;

                    const currentFinishDia = getFinishDia(wo, comp);

                    return (
                        <tr
                            key={`${wo?.id || job?.jobNo || "job"}-${comp?.id || rowIndex}`}
                            onClick={() => setHoveredIndex(jobIndex)}
                            onMouseEnter={(e) =>
                                handleCancellationHover(e, wo, comp)
                            }
                            onMouseLeave={() =>
                                setHoveredCancellation(null)
                            }
                        >
                            {/* COL 0 — MONTH */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(0, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {wo?.month || "NO MONTH NAME FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 1 — FACTORY NAME */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(1, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {!wo || wo.factoryName === "NULL" ? (
                                            <span>-</span>
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
                                                className="cursor-pointer"
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
                                                                wo.id
                                                            )
                                                        }
                                                    >
                                                        {wo.factoryName}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 2 — WORK ORDER NO */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(2, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {wo?.workOrderNo ||
                                            "NO WORK ORDER FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 3 — BUYER NAME */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(3, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {wo?.styleRequirement?.buyerName ||
                                            "NO BUYER NAME FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 4 — JOB NO */}
                            {isFirstOfJob && (
                                <td
                                    onDoubleClick={() =>
                                        handleRedirect(job.jobNo)
                                    }
                                    style={stickyTd(4, isHovered)}
                                    rowSpan={jobRowSpan}
                                >
                                    <div
                                        onClick={() =>
                                            getDataForCancellation({
                                                jobNo: job.jobNo,
                                                isOpen: true,
                                            })
                                        }
                                        className={cellPad}
                                    >
                                        {job.jobNo || "NO JOB FOUND"}
                                    </div>
                                </td>
                            )}

                            {/* COL 5 — STYLE NO */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(5, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {wo?.styleRequirement?.styleNo ||
                                            wo?.styleNo ||
                                            "NO STYLE NO FOUND"}
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
                                    style={cancellationTextStyle}
                                >
                                    {comp?.color || "-"}
                                </div>
                            </td>

                            {/* COL 7 — COMPOSITION */}
                            <td style={stickyTd(7, isHovered)}>
                                <div
                                    className={cellPad}
                                    style={cancellationTextStyle}
                                >
                                    {comp?.composition || "-"}
                                </div>
                            </td>

                            {/* COL 8 — FINISH DIA */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={cellPad}
                                    style={cancellationTextStyle}
                                >
                                    {currentFinishDia}
                                </div>
                            </td>

                            {/* COL 9 — YARN COUNT */}
                            {isFirstOfWo && (
                                <td
                                    style={plainTd(isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {!wo || wo.yarnCount === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() =>
                                                    handleInlineEdit(
                                                        wo.id,
                                                        wo.yarnCount,
                                                        "workOrder",
                                                        "yarnCount",
                                                        0
                                                    )
                                                }
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName ===
                                                    "yarnCount" &&
                                                isEdit.rowId === wo.id ? (
                                                    <input
                                                        type="text"
                                                        name="yarnCount"
                                                        className="p-2 outline-none border rounded-md w-full"
                                                        value={
                                                            updatedFields.currentValue
                                                        }
                                                        onChange={(e) =>
                                                            handleOnChange(e)
                                                        }
                                                    />
                                                ) : (
                                                    <span>{wo.yarnCount}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 10 — YARN LOT */}
                            {isFirstOfWo && (
                                <td
                                    style={plainTd(isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {!wo || wo.lotNo === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() =>
                                                    handleInlineEdit(
                                                        wo.id,
                                                        wo.lotNo,
                                                        "workOrder",
                                                        "lotNo",
                                                        0
                                                    )
                                                }
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName ===
                                                    "lotNo" &&
                                                isEdit.rowId === wo.id ? (
                                                    <input
                                                        type="text"
                                                        name="lotNo"
                                                        className="p-2 outline-none border rounded-md w-full"
                                                        value={
                                                            updatedFields.currentValue
                                                        }
                                                        onChange={(e) =>
                                                            handleOnChange(e)
                                                        }
                                                    />
                                                ) : (
                                                    <span>{wo.lotNo}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 11 — STITCH LENGTH */}
                            {isFirstOfWo && (
                                <td
                                    style={plainTd(isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {!wo || wo.stichLength === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() =>
                                                    handleInlineEdit(
                                                        wo.id,
                                                        wo.stichLength,
                                                        "workOrder",
                                                        "stichLength",
                                                        0
                                                    )
                                                }
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName ===
                                                    "stichLength" &&
                                                isEdit.rowId === wo.id ? (
                                                    <input
                                                        type="text"
                                                        name="stichLength"
                                                        className="p-2 outline-none border rounded-md w-full"
                                                        value={
                                                            updatedFields.currentValue
                                                        }
                                                        onChange={(e) =>
                                                            handleOnChange(e)
                                                        }
                                                    />
                                                ) : (
                                                    <span>
                                                        {wo.stichLength}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 12 — MACHINE DIA */}
                            {isFirstOfWo && (
                                <td
                                    style={plainTd(isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    <div
                                        className={cellPad}
                                        style={workOrderTextStyle}
                                    >
                                        {!wo || wo.machineDia === "NULL" ? (
                                            <span>-</span>
                                        ) : (
                                            <div
                                                onDoubleClick={() =>
                                                    handleInlineEdit(
                                                        wo.id,
                                                        wo.machineDia,
                                                        "workOrder",
                                                        "machineDia",
                                                        0
                                                    )
                                                }
                                                className="cursor-pointer"
                                            >
                                                {isEdit.updatedFieldName ===
                                                    "machineDia" &&
                                                isEdit.rowId === wo.id ? (
                                                    <input
                                                        type="text"
                                                        name="machineDia"
                                                        className="p-2 outline-none border rounded-md w-full"
                                                        value={
                                                            updatedFields.currentValue
                                                        }
                                                        onChange={(e) =>
                                                            handleOnChange(e)
                                                        }
                                                    />
                                                ) : (
                                                    <span>{wo.machineDia}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </td>
                            )}

                            {/* COL 13 — WORK ORDER QTY */}
                            <td style={plainTd(isHovered)}>
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
                                    style={cancellationTextStyle}
                                >
                                    {isEdit.updatedFieldName ===
                                        "workOrderQty" &&
                                    isEdit.compId === comp?.id ? (
                                        <input
                                            type="text"
                                            className="p-2 outline-none border rounded-md w-full"
                                            name="workOrderQty"
                                            value={updatedFields.currentValue}
                                            onChange={(e) =>
                                                handleOnChange(e)
                                            }
                                        />
                                    ) : (
                                        comp?.workOrderQty?.toFixed(2) || "-"
                                    )}
                                </div>
                            </td>

                            {/* COL 14 — TOTAL YARN DELIVERY */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={cellPad}
                                    style={cancellationTextStyle}
                                >
                                    {totalDelivered.toFixed(2)}
                                </div>
                            </td>

                            {/* COL 15 — DEL SHORT & EXCESS */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={`${cellPad} font-bold`}
                                    style={{
                                        color: delExceeded ? "green" : "red",
                                        ...cancellationTextStyle,
                                    }}
                                >
                                    {delExceeded
                                        ? `(${Math.abs(delDiff.toFixed(2))})`
                                        : Math.abs(delDiff.toFixed(2))}
                                </div>
                            </td>

                            {/* COL 16 — YARN RETURN */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={`${cellPad} text-red-600 font-extrabold`}
                                    style={cancellationTextStyle}
                                >
                                    {comp?.yarnDeliveriesWithColor?.YarnReturn?.toFixed(
                                        2
                                    ) || "-"}
                                </div>
                            </td>

                            {/* COL 17 — GREY RECEIVED */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={cellPad}
                                    style={cancellationTextStyle}
                                >
                                    {comp?.yarnDeliveriesWithColor?.GreyFabricReceived?.toFixed(
                                        2
                                    ) || "-"}
                                </div>
                            </td>

                            {/* COL 18 — RCVD SHORT & EXCESS */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={`${cellPad} font-bold`}
                                    style={{
                                        color: rcvdExceeded ? "red" : "green",
                                        ...cancellationTextStyle,
                                    }}
                                >
                                    {rcvdExceeded
                                        ? `(${Math.abs(rcvdDiff.toFixed(2))})`
                                        : rcvdDiff.toFixed(2)}
                                </div>
                            </td>

                            {/* COL 19 — UNIT PRICE */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    onDoubleClick={() =>
                                        handleInlineEdit(
                                            comp?.id,
                                            comp?.unitePrice,
                                            "workOrder",
                                            "unitePrice",
                                            comp?.id
                                        )
                                    }
                                    className={`${cellPad} cursor-pointer`}
                                    style={cancellationTextStyle}
                                >
                                    {isEdit.updatedFieldName ===
                                        "unitePrice" &&
                                    isEdit.rowId === comp?.id ? (
                                        <input
                                            type="text"
                                            className="p-2 outline-none border rounded-md w-full"
                                            name="unitePrice"
                                            value={updatedFields.currentValue}
                                            onChange={(e) =>
                                                handleOnChange(e)
                                            }
                                        />
                                    ) : (
                                        comp?.unitePrice?.toFixed(2) || "-"
                                    )}
                                </div>
                            </td>

                            {/* COL 20 — PAYABLE AMOUNT */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={`${cellPad} text-red-600 font-extrabold`}
                                    style={cancellationTextStyle}
                                >
                                    {payableTotal > 0
                                        ? payableTotal.toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* COL 21 — PAID BILLING AMOUNT */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={`${cellPad} text-red-600 font-extrabold`}
                                    style={cancellationTextStyle}
                                >
                                    -
                                </div>
                            </td>

                            {/* COL 22 — PENDING BILLING AMOUNT */}
                            <td style={plainTd(isHovered)}>
                                <div
                                    className={`${cellPad} text-red-600 font-extrabold`}
                                    style={cancellationTextStyle}
                                >
                                    -
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    {/* FROZEN FOOTER CELLS */}
                    {Array.from({ length: FROZEN_COUNT }).map((_, i) => (
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

                    {/* COL 8 — FINISH DIA */}
                    <td style={getFooterCellStyle(FROZEN_COUNT)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 9 — YARN COUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 1)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 10 — YARN LOT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 2)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 11 — STITCH LENGTH */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 3)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 12 — MACHINE DIA */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 4)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 13 — WORK ORDER QTY */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 5)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.workOrderQty?.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 14 — TOTAL YARN DELIVERY */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 6)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.totalYarnDelivery?.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 15 — DEL SHORT & EXCESS */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 7)}>
                        <div
                            className={`${cellPad} font-bold text-white`}
                            style={{ color: "white" }}
                        >
                            {totals?.delShortExcess > 0
                                ? `(${Math.abs(
                                      totals?.delShortExcess
                                  )?.toFixed(2)})`
                                : Math.abs(
                                      totals?.delShortExcess
                                  )?.toFixed(2)}
                        </div>
                    </td>

                    {/* COL 16 — YARN RETURN */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 8)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.yarnReturn?.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 17 — GREY RECEIVED */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 9)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(
                                totals.GreyFabricReceived?.toFixed(2)
                            )}
                        </div>
                    </td>

                    {/* COL 18 — RCVD SHORT & EXCESS */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 10)}>
                        <div
                            className={`${cellPad} font-bold text-white`}
                            style={{ color: "white" }}
                        >
                            {totals?.rcvdShortExcess < 0
                                ? `(${Math.abs(
                                      totals?.rcvdShortExcess
                                  )?.toFixed(2)})`
                                : Math.abs(
                                      totals?.rcvdShortExcess
                                  )?.toFixed(2)}
                        </div>
                    </td>

                    {/* COL 19 — UNIT PRICE */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 11)}>
                        <div className={`${cellPad} text-white`} />
                    </td>

                    {/* COL 20 — PAYABLE AMOUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 12)}>
                        <div className={`${cellPad} text-white`}>
                            {formatNumber(totals.payableAmount.toFixed(2))}
                        </div>
                    </td>

                    {/* COL 21 — PAID BILLING AMOUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 13)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>

                    {/* COL 22 — PENDING BILLING AMOUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 14)}>
                        <div className={`${cellPad} text-white`}>-</div>
                    </td>
                </tr>
            </tfoot>

            {/* CANCELLATION TOOLTIP */}
            {hoveredCancellation && (
                <div
                    className="fixed z-[99999] pointer-events-none w-[280px] rounded-lg border border-red-200 bg-white p-3 shadow-xl"
                    style={{
                        left: `${hoveredCancellation.left}px`,
                        top: `${hoveredCancellation.top}px`,
                    }}
                >
                    <div className="mb-2 flex items-center gap-2 border-b border-red-100 pb-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600">
                            !
                        </span>

                        <span className="text-sm font-bold text-red-700">
                            Cancellation Details
                        </span>
                    </div>

                    <div className="mb-2">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Reason
                        </p>

                        <p className="break-words text-sm font-medium text-gray-800">
                            {hoveredCancellation.reason}
                        </p>
                    </div>

                    <div>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Remarks
                        </p>

                        <p className="break-words text-sm text-gray-700">
                            {hoveredCancellation.remarks}
                        </p>
                    </div>
                </div>
            )}
        </>
    );
};

export default KnittingOrder;
