
import { useState, useMemo } from "react";
import { Edit, Eye } from "lucide-react";

const DyeingOrder = ({
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
    handleReviseWorkOrder,
}) => {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const cellPad = "py-2 px-3";

    const baseTd = {
        borderRight: "1px solid #000000",
        borderBottom: "1px solid #000000",
        padding: 0,
        textAlign: "center",
        verticalAlign: "top",
        boxSizing: "border-box",
    };

    const dataTd = { ...baseTd };

    const stickyTd = (colIndex, isHovered) => ({
        ...baseTd,
        position: "sticky",
        left: `${currentFrozenLefts[colIndex]}px`,
        zIndex: 3,
        backgroundColor: isHovered ? "#bbf7d0" : "#ffffff",
        width: `${currentFrozenWidths[colIndex]}px`,
        minWidth: `${currentFrozenWidths[colIndex]}px`,
        boxShadow:
            colIndex === FROZEN_COUNT - 1
                ? "2px 0 5px -1px rgba(0,0,0,0.18)"
                : "none",
        cursor: "pointer",
    });

    // Get finish dia from styleRequirement
    const getFinishDia = (wo, comp) => {
        if (!wo?.styleRequirement?.rows || !comp) return "-";

        const matchingRow = wo.styleRequirement.rows.find(
            (row) =>
                row.composition === comp.composition &&
                row.color === comp.color
        );

        return matchingRow?.finishDia || "-";
    };

    const totals = useMemo(() => {
        const acc = {
            orderQty: 0,
            workOrderQty: 0,
            totalGreyDelivery: 0,
            shortExcess: 0,
            greyReturn: 0,
            greyReceived: 0,
            finishReceived: 0,
            finishVsGreyDiff: 0,
            unitePrice: 0,
            sentForCompacting: 0,
            receivedFromCompacting: 0,
            greyReceivedValue: 0,
        };

        (orders || []).forEach((job) => {
            (job.workOrders || []).forEach((wo) => {
                (wo.compositions || []).forEach((comp) => {
                    const workOrderQty =
                        Number(comp.workOrderQty) || 0;

                    const totalGreyDelivery =
                        Number(
                            comp.yarnDeliveriesWithColor?.GreyDelivery
                        ) || 0;

                    const greyReturnReceived =
                        Number(
                            comp.yarnDeliveriesWithColor?.GreyReturn
                        ) || 0;

                    const greyReceived =
                        Number(
                            comp.yarnDeliveriesWithColor?.GreyReceived
                        ) || 0;

                    const finishReceived =
                        Number(
                            comp.yarnDeliveriesWithColor?.FinishReceived
                        ) || 0;

                    const unitePrice =
                        Number(comp.unitePrice) || 0;

                    const sentForCompacting =
                        Number(
                            comp.yarnDeliveriesWithColor?.SentForCompacting
                        ) || 0;

                    const receivedFromCompacting =
                        Number(
                            comp.yarnDeliveriesWithColor?.ReceivedFromCompacting
                        ) || 0;

                    acc.workOrderQty += workOrderQty;
                    acc.totalGreyDelivery += totalGreyDelivery;

                    acc.shortExcess +=
                        totalGreyDelivery - workOrderQty;

                    acc.greyReturn += greyReturnReceived;
                    acc.greyReceived += greyReceived;
                    acc.finishReceived += finishReceived;

                    acc.finishVsGreyDiff +=
                        greyReceived +
                        greyReturnReceived -
                        totalGreyDelivery;

                    acc.unitePrice += unitePrice;
                    acc.sentForCompacting += sentForCompacting;
                    acc.receivedFromCompacting +=
                        receivedFromCompacting;

                    acc.greyReceivedValue +=
                        greyReceived * unitePrice;
                });
            });
        });

        return acc;
    }, [orders]);

    // Filter orders based on search term
    const filteredOrders = useMemo(() => {
        if (!searchTerm?.trim()) return orders || [];

        const lowerSearch = searchTerm.toLowerCase();

        return (orders || [])
            .map((job) => {
                const filteredWorkOrders = (
                    job.workOrders || []
                )
                    .map((wo) => {
                        const filteredComps = (
                            wo.compositions || []
                        ).filter((comp) => {
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
                                comp?.workOrderQty,
                            ].map((val) =>
                                String(val || "").toLowerCase()
                            );

                            return searchableValues.some((val) =>
                                val.includes(lowerSearch)
                            );
                        });

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

    // Flatten jobs -> workOrders -> compositions
    const flatRows = useMemo(() => {
        const out = [];

        (filteredOrders || []).forEach((job, jobIndex) => {
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
    }, [filteredOrders]);

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
        borderTop: "2px solid #000000",
        boxShadow: "0 -2px 5px -1px rgba(0,0,0,0.1)",
        boxSizing: "border-box",
        whiteSpace: "nowrap",
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
                boxShadow:
                    index === FROZEN_COUNT - 1
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

                    const greyDelivery =
                        Number(
                            comp?.yarnDeliveriesWithColor?.GreyDelivery
                        ) || 0;

                    const workOrderQtyNum =
                        Number(comp?.workOrderQty) || 0;

                    const shortDiff =
                        greyDelivery - workOrderQtyNum;

                    const shortExceeded = shortDiff > 0;

                    const greyReceivedNum =
                        Number(
                            comp?.yarnDeliveriesWithColor?.GreyReceived
                        ) || 0;

                    const greyReturnNum =
                        Number(
                            comp?.yarnDeliveriesWithColor?.GreyReturn
                        ) || 0;

                    const rcvdDiff =
                        greyReceivedNum +
                        greyReturnNum -
                        greyDelivery;

                    const rcvdExceeded = rcvdDiff < 0;

                    const unitePriceNum =
                        Number(comp?.unitePrice) || 0;

                    const payableAmount = (
                        greyReceivedNum * unitePriceNum
                    ).toFixed(2);

                    const currentFinishDia =
                        getFinishDia(wo, comp);

                    return (
                        <tr
                            key={`${wo?.id || jobIndex}-${comp?.id || rowIndex}-${rowIndex}`}
                            onMouseEnter={() =>
                                setHoveredIndex(jobIndex)
                            }
                            onMouseLeave={() =>
                                setHoveredIndex(null)
                            }
                        >
                            {/* 0 — ACTION */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(0, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    {wo ? (
                                        <div className="flex flex-col items-center justify-center gap-2 px-2 py-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handlePreview?.({
                                                        job,
                                                        wo,
                                                    });
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
                                                    handleReviseWorkOrder?.(
                                                        wo.id
                                                    );
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
                                    <div className={cellPad}>
                                        {wo?.month || "-"}
                                    </div>
                                </td>
                            )}

                            {/* 3 — FACTORY NAME */}
                            {isFirstOfWo && (
                                <td
                                    style={stickyTd(3, isHovered)}
                                    rowSpan={woRowSpan}
                                >
                                    {!wo ||
                                    wo.factoryName === "NULL" ? (
                                        <div
                                            className={`${cellPad} text-gray-500`}
                                        >
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
                                                            "dyeingOrder"
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
                                        {wo?.styleRequirement?.buyerName ||
                                            "-"}
                                    </div>
                                </td>
                            )}

                            {/* 6 — JOB NO */}
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
                                        {wo?.styleRequirement?.styleNo ||
                                            "-"}
                                    </div>
                                </td>
                            )}

                            {/* 8 — COLOR */}
                            <td style={stickyTd(8, isHovered)}>
                                <div className={cellPad}>
                                    {comp?.color || "-"}
                                </div>
                            </td>

                            {/* 9 — COMPOSITION (NOT FROZEN) */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {comp?.composition || "-"}
                                </div>
                            </td>

                            {/* 10 — FINISH DIA */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {currentFinishDia}
                                </div>
                            </td>

                            {/* 11 — YARN COUNT */}
                            {isFirstOfWo && (
                                <td
                                    style={dataTd}
                                    rowSpan={woRowSpan}
                                >
                                    {!wo ||
                                    wo.yarnCount === "NULL" ? (
                                        <div
                                            className={`${cellPad} text-black`}
                                        >
                                            -
                                        </div>
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
                                            className={`${cellPad} cursor-pointer`}
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
                                </td>
                            )}

                            {/* 12 — YARN LOT */}
                            {isFirstOfWo && (
                                <td
                                    style={dataTd}
                                    rowSpan={woRowSpan}
                                >
                                    {!wo || wo.lotNo === "NULL" ? (
                                        <div
                                            className={`${cellPad} text-black`}
                                        >
                                            -
                                        </div>
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
                                            className={`${cellPad} cursor-pointer`}
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
                                </td>
                            )}

                            {/* 13 — STITCH LENGTH */}
                            {isFirstOfWo && (
                                <td
                                    style={dataTd}
                                    rowSpan={woRowSpan}
                                >
                                    {!wo ||
                                    wo.stichLength === "NULL" ? (
                                        <div
                                            className={`${cellPad} text-black`}
                                        >
                                            -
                                        </div>
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
                                            className={`${cellPad} cursor-pointer`}
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
                                </td>
                            )}

                            {/* 14 — MACHINE DIA */}
                            {isFirstOfWo && (
                                <td
                                    style={dataTd}
                                    rowSpan={woRowSpan}
                                >
                                    {!wo ||
                                    wo.machineDia === "NULL" ? (
                                        <div
                                            className={`${cellPad} text-black`}
                                        >
                                            -
                                        </div>
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
                                            className={`${cellPad} cursor-pointer`}
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
                                </td>
                            )}

                            {/* 15 — SHADE % */}
                            {isFirstOfWo && (
                                <td
                                    style={dataTd}
                                    rowSpan={woRowSpan}
                                >
                                    {!wo || wo.shade === "NULL" ? (
                                        <div
                                            className={`${cellPad} text-black`}
                                        >
                                            -
                                        </div>
                                    ) : (
                                        <div
                                            onDoubleClick={() =>
                                                handleInlineEdit(
                                                    wo.id,
                                                    wo.shade,
                                                    "workOrder",
                                                    "shade",
                                                    0
                                                )
                                            }
                                            className={`${cellPad} cursor-pointer`}
                                        >
                                            {isEdit.updatedFieldName ===
                                                "shade" &&
                                            isEdit.rowId === wo.id ? (
                                                <input
                                                    type="text"
                                                    name="shade"
                                                    className="p-2 outline-none border rounded-md w-full"
                                                    value={
                                                        updatedFields.currentValue
                                                    }
                                                    onChange={(e) =>
                                                        handleOnChange(e)
                                                    }
                                                />
                                            ) : (
                                                <span>{wo.shade}</span>
                                            )}
                                        </div>
                                    )}
                                </td>
                            )}

                            {/* 16 — WORK ORDER QTY */}
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
                                    {isEdit.updatedFieldName ===
                                        "workOrderQty" &&
                                    isEdit.compId === comp?.id ? (
                                        <input
                                            type="text"
                                            className="p-2 outline-none border rounded-md w-full"
                                            name="workOrderQty"
                                            value={
                                                updatedFields.currentValue
                                            }
                                            onChange={(e) =>
                                                handleOnChange(e)
                                            }
                                        />
                                    ) : (
                                        Number(comp?.workOrderQty)
                                            ? Number(
                                                  comp.workOrderQty
                                              ).toFixed(2)
                                            : "-"
                                    )}
                                </div>
                            </td>

                            {/* 17 — GREY DELIVERY */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {Number(
                                        comp?.yarnDeliveriesWithColor
                                            ?.GreyDelivery
                                    )
                                        ? Number(
                                              comp.yarnDeliveriesWithColor
                                                  .GreyDelivery
                                          ).toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* 18 — DEL SHORT & EXCESS */}
                            <td style={dataTd}>
                                <div
                                    className={cellPad}
                                    style={{
                                        color: shortExceeded
                                            ? "red"
                                            : "green",
                                        fontWeight: "bold",
                                    }}
                                >
                                    {shortExceeded
                                        ? shortDiff.toFixed(2)
                                        : `(${Math.abs(
                                              shortDiff
                                          ).toFixed(2)})`}
                                </div>
                            </td>

                            {/* 19 — GREY RETURN */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {Number(
                                        comp?.yarnDeliveriesWithColor
                                            ?.GreyReturn
                                    )
                                        ? Number(
                                              comp.yarnDeliveriesWithColor
                                                  .GreyReturn
                                          ).toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* 20 — GREY RECEIVED */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {Number(
                                        comp?.yarnDeliveriesWithColor
                                            ?.GreyReceived
                                    )
                                        ? Number(
                                              comp.yarnDeliveriesWithColor
                                                  .GreyReceived
                                          ).toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* 21 — FINISH RECEIVED */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {Number(
                                        comp?.yarnDeliveriesWithColor
                                            ?.FinishReceived
                                    )
                                        ? Number(
                                              comp.yarnDeliveriesWithColor
                                                  .FinishReceived
                                          ).toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* 22 — RCVD SHORT & EXCESS */}
                            <td style={dataTd}>
                                <div
                                    className={cellPad}
                                    style={{
                                        color: rcvdExceeded
                                            ? "red"
                                            : "green",
                                        fontWeight: "bold",
                                    }}
                                >
                                    {rcvdExceeded
                                        ? Math.abs(
                                              rcvdDiff
                                          ).toFixed(2)
                                        : `(${Math.abs(
                                              rcvdDiff
                                          ).toFixed(2)})`}
                                </div>
                            </td>

                            {/* 23 — UNIT PRICE */}
                            <td style={dataTd}>
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
                                >
                                    {isEdit.updatedFieldName ===
                                        "unitePrice" &&
                                    isEdit.rowId === comp?.id ? (
                                        <input
                                            type="text"
                                            className="p-2 outline-none border rounded-md w-full"
                                            name="unitePrice"
                                            value={
                                                updatedFields.currentValue
                                            }
                                            onChange={(e) =>
                                                handleOnChange(e)
                                            }
                                        />
                                    ) : (
                                        Number(comp?.unitePrice)
                                            ? Number(
                                                  comp.unitePrice
                                              ).toFixed(2)
                                            : "-"
                                    )}
                                </div>
                            </td>

                            {/* 24 — TOTAL SENT FOR COMPACTING */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {Number(
                                        comp?.yarnDeliveriesWithColor
                                            ?.SentForCompacting
                                    )
                                        ? Number(
                                              comp.yarnDeliveriesWithColor
                                                  .SentForCompacting
                                          ).toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* 25 — TOTAL RECEIVED FROM COMPACTING */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {Number(
                                        comp?.yarnDeliveriesWithColor
                                            ?.ReceivedFromCompacting
                                    )
                                        ? Number(
                                              comp.yarnDeliveriesWithColor
                                                  .ReceivedFromCompacting
                                          ).toFixed(2)
                                        : "-"}
                                </div>
                            </td>

                            {/* 26 — TOTAL BILLING / PAYABLE AMOUNT */}
                            <td style={dataTd}>
                                <div className={cellPad}>
                                    {payableAmount !== "0.00"
                                        ? payableAmount
                                        : "-"}
                                </div>
                            </td>

                            {/* 27 — PAYABLE AMOUNT */}
                            <td style={dataTd}>
                                <div className={cellPad}>-</div>
                            </td>

                            {/* 28 — PENDING BILLING AMOUNT */}
                            <td style={dataTd}>
                                <div className={cellPad}>-</div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    {/* 0–8 — FROZEN FOOTER CELLS */}
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
                                        textAlign: "left",
                                        paddingLeft: "4px",
                                    }}
                                >
                                    TOTAL
                                </div>
                            ) : null}
                        </td>
                    ))}

                    {/* 9 — COMPOSITION */}
                    <td style={getFooterCellStyle(FROZEN_COUNT)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 10 — FINISH DIA */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 1)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 11 — YARN COUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 2)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 12 — YARN LOT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 3)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 13 — STITCH LENGTH */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 4)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 14 — MACHINE DIA */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 5)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 15 — SHADE % */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 6)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 16 — WORK ORDER QTY */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 7)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.workOrderQty.toFixed(2)}
                        </div>
                    </td>

                    {/* 17 — GREY DELIVERY */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 8)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.totalGreyDelivery.toFixed(2)}
                        </div>
                    </td>

                    {/* 18 — DEL SHORT & EXCESS */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 9)}>
                        <div
                            className={`${cellPad} text-white`}
                            style={{
                                color: "white",
                                fontWeight: "bold",
                            }}
                        >
                            {totals.shortExcess > 0
                                ? totals.shortExcess.toFixed(2)
                                : `(${Math.abs(
                                      totals.shortExcess
                                  ).toFixed(2)})`}
                        </div>
                    </td>

                    {/* 19 — GREY RETURN */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 10)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.greyReturn.toFixed(2)}
                        </div>
                    </td>

                    {/* 20 — GREY RECEIVED */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 11)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.greyReceived.toFixed(2)}
                        </div>
                    </td>

                    {/* 21 — FINISH RECEIVED */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 12)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.finishReceived.toFixed(2)}
                        </div>
                    </td>

                    {/* 22 — RCVD SHORT & EXCESS */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 13)}>
                        <div
                            className={`${cellPad} text-white`}
                            style={{
                                color: "white",
                                fontWeight: "bold",
                            }}
                        >
                            {totals.finishVsGreyDiff < 0
                                ? Math.abs(
                                      totals.finishVsGreyDiff
                                  ).toFixed(2)
                                : `(${Math.abs(
                                      totals.finishVsGreyDiff
                                  ).toFixed(2)})`}
                        </div>
                    </td>

                    {/* 23 — UNIT PRICE */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 14)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 24 — TOTAL SENT FOR COMPACTING */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 15)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.sentForCompacting.toFixed(2)}
                        </div>
                    </td>

                    {/* 25 — TOTAL RECEIVED FROM COMPACTING */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 16)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.receivedFromCompacting.toFixed(2)}
                        </div>
                    </td>

                    {/* 26 — TOTAL BILLING / PAYABLE AMOUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 17)}>
                        <div className={`${cellPad} text-white`}>
                            {totals.greyReceivedValue.toFixed(2)}
                        </div>
                    </td>

                    {/* 27 — PAYABLE AMOUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 18)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>

                    {/* 28 — PENDING BILLING AMOUNT */}
                    <td style={getFooterCellStyle(FROZEN_COUNT + 19)}>
                        <div className={`${cellPad} text-white`}>
                            -
                        </div>
                    </td>
                </tr>
            </tfoot>
        </>
    );
};

export default DyeingOrder;
