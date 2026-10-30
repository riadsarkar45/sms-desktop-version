import { useMemo } from "react";

const YarnDyeOrders = ({ orders, isEdit, updatedFields, handleOnChange, handleInlineEdit, handleEditRowData }) => {

    const cellClass = "cursor-pointer px-3 py-1.5";
    const compCellClass = "hover:bg-red-500/10 hover:text-red-500 cursor-pointer px-3 py-1.5";

    // ---- FOOTER TOTALS ----
    const allCompositions =
        (orders || []).flatMap(job =>
            (job.workOrders || []).flatMap(w =>
                (w.compositions || []).map(c => ({ ...c, _workOrder: w }))
            )
        );

    const totals = allCompositions.reduce(
        (acc, c) => {
            const yarnJobs = (c._workOrder?.yarnDyeingJobs || []).filter(
                y => y.composition === c.composition
            );
            const bookingQty = yarnJobs.reduce((s, y) => s + (Number(y.qty) || 0), 0);

            acc.bookingQty += bookingQty;
            acc.workOrderQty += Number(c.yarnDeliveriesWithColor?.YarnDeliveryForYarnDye) || 0;
            acc.greyReceived += Number(c.greyReceived) || 0;
            acc.greyReturn += Number(c.greyReturn) || 0;
            acc.finishReceived += Number(c.finishReceived) || 0;
            acc.finishReturn += Number(c.finishReturn) || 0;
            return acc;
        },
        { bookingQty: 0, workOrderQty: 0, greyReceived: 0, greyReturn: 0, finishReceived: 0, finishReturn: 0 }
    );

    // ── Flatten jobs -> workOrders -> compositions into ONE real <tr> per
    // composition line, with rowSpan for job-level (JOB NO) and
    // work-order-level (FACTORY NAME, WORK ORDER NO, BUYER NAME, STYLE,
    // MONTH) columns. Fixes the same border-desync bug documented in
    // KnittingOrder.jsx — long composition/booking-color text wrapping no
    // longer breaks alignment with the single-value columns.
    const flatRows = useMemo(() => {
        const out = [];
        (orders || []).forEach((job, jobIndex) => {
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
    }, [orders]);

    return (
        <>
            <tbody className="whitespace-nowrap">
                {flatRows.map((r, rowIndex) => {
                    const { job, wo, comp, isFirstOfJob, jobRowSpan, isFirstOfWo, woRowSpan } = r;

                    const yarnJobs = (wo?.yarnDyeingJobs || []).filter(
                        y => y.composition === comp?.composition
                    );

                    return (
                        <tr key={rowIndex} className="border-b border-gray-200">

                            {/* MONTH (per work order) */}
                            {isFirstOfWo && (
                                <td className="border border-gray-200 align-top" rowSpan={woRowSpan}>
                                    <div className={cellClass}>{wo?.month}</div>
                                </td>
                            )}

                            {/* FACTORY NAME (per work order) */}
                            {isFirstOfWo && (
                                <td className="border border-gray-200 align-top" rowSpan={woRowSpan}>
                                    {!wo || wo.factoryName === "NULL" ? (
                                        <div className={`${cellClass} text-gray-500`}>-</div>
                                    ) : (
                                        <div onDoubleClick={() => handleInlineEdit(wo.id, wo.factoryName, "workOrder", "factoryName", 0)} className="cursor-pointer px-3 py-1.5">
                                            {isEdit.updatedFieldName === "factoryName" && isEdit.rowId === wo.id ? (
                                                <input type="text" name="factoryName" className="p-2 outline-none border rounded-md w-full" value={updatedFields.currentValue} onChange={(e) => handleOnChange(e)} />
                                            ) : <span onClick={() => handleEditRowData(wo.id)}>{wo.factoryName}</span>}
                                        </div>
                                    )}
                                </td>
                            )}

                            

                            {/* WORK ORDER NO (per work order) */}
                            {isFirstOfWo && (
                                <td className="border border-gray-200 align-top" rowSpan={woRowSpan}>
                                    <div className={cellClass}>{wo?.workOrderNo}</div>
                                </td>
                            )}

                            {/* BUYER NAME (per work order) */}
                            {isFirstOfWo && (
                                <td className="border border-gray-200 align-top" rowSpan={woRowSpan}>
                                    <div className={cellClass}>{wo?.styleRequirement?.buyerName || "-"}</div>
                                </td>
                            )}

                            {/* JOB NO (per job) */}
                            {isFirstOfJob && (
                                <td className="border border-gray-200 px-3 py-1.5 text-sm align-top" rowSpan={jobRowSpan}>
                                    {job.jobNo}
                                </td>
                            )}

                            {/* STYLE (per work order) */}
                            {isFirstOfWo && (
                                <td className="border border-gray-200 align-top" rowSpan={woRowSpan}>
                                    <div className={cellClass}>{wo?.styleNo}</div>
                                </td>
                            )}

                            {/* BOOKING COLOR (per composition; may itself stack multiple yarnJobs, which just grows this one row) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>
                                    {yarnJobs.length > 0
                                        ? yarnJobs.map((y, yi) => (
                                            <div onClick={() => handleEditRowData(comp?.id, y.id)} key={yi} className="border-b border-gray-100 last:border-b-0 py-0.5">{y.color} y id {"=>"} {y.id}  </div>
                                        ))
                                        : "-"}
                                    Color
                                </div>
                            </td>
                            
                            {/* COMPOSITION (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.composition}</div>
                            </td>

                            {/* FINISH DIA */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.id}</div>
                            </td>                      

                            {/* SHADE (%) (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div onClick={() => handleEditRowData(comp?.id, comp?.id)} className={compCellClass}>
                                    SHADE (%)
                                </div>
                            </td>

                            {/* BOOKING QTY (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>
                                    {yarnJobs.length > 0
                                        ? yarnJobs.map((y, yi) => (
                                            <div onClick={() => handleEditRowData(comp?.id, y.id)} key={yi} className="border-b border-gray-100 last:border-b-0 py-0.5">
                                                {y.qty}
                                            </div>
                                        ))
                                        : "-"}
                                </div>
                            </td>

                            {/* PRICE PER KG (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.unitePrice?.toFixed(2)}</div>
                            </td>

                            {/* WORK ORDER QTY (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.yarnDeliveriesWithColor?.YarnDeliveryForYarnDye || "NOT DELIVERED YET"}</div>
                            </td>

                            {/* GREY RECEIVED (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.greyReceived || 0}</div>
                            </td>

                            {/* GREY RETURN (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.greyReturn || 0}</div>
                            </td>

                            {/* FINISH RECEIVED (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.finishReceived || 0}</div>
                            </td>

                            {/* FINISH RETURN (per composition) */}
                            <td className="border border-gray-200 align-top">
                                <div className={compCellClass}>{comp?.finishReturn || 0}</div>
                            </td>

                        </tr>
                    );
                })}
            </tbody>

            {/* FOOTER TOTALS ROW */}
            <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td colSpan={6} className="border border-gray-200 px-3 py-1.5 text-right text-sm">
                        TOTAL
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5"></td>
                    <td className="border border-gray-200 px-3 py-1.5"></td>
                    <td className="border border-gray-200 px-3 py-1.5"></td>
                    <td className="border border-gray-200 px-3 py-1.5">{totals.bookingQty}</td>
                    <td className="border border-gray-200 px-3 py-1.5"></td>
                    <td className="border border-gray-200 px-3 py-1.5">{totals.workOrderQty}</td>
                    <td className="border border-gray-200 px-3 py-1.5">{totals.greyReceived}</td>
                    <td className="border border-gray-200 px-3 py-1.5">{totals.greyReturn}</td>
                    <td className="border border-gray-200 px-3 py-1.5">{totals.finishReceived}</td>
                    <td className="border border-gray-200 px-3 py-1.5">{totals.finishReturn}</td>
                </tr>
            </tfoot>
        </>
    );
};

export default YarnDyeOrders;