import React, { useMemo } from 'react';

const BORDER_COLOR = "#000000";

// Base cell style: The <td> provides the outer 1px border.
const cellStyle = {
    border: `1px solid ${BORDER_COLOR}`,
    padding: 0,
    verticalAlign: "top",
    fontSize: "13px",
    boxSizing: "border-box",
    textAlign: "center"
};

const centeredCellStyle = {
    ...cellStyle,
    verticalAlign: "middle",
    textAlign: "center",
};

const footerCellStyle = {
    ...cellStyle,
    position: "sticky",
    bottom: 0,
    zIndex: 5,
    // backgroundColor: "#f3f4f6",
    fontWeight: 700,
    color: "#ffffff",
};

const normalizeToArray = (value) => {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === "") return [];
    return [value];
};

const formatNumber = (value) => {
    const num = Number(value) || 0;
    return num.toLocaleString("en-US");
};

const formatMoney = (value) => {
    const num = Number(value) || 0;
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const renderColoredShortExcess = (diff) => {
    const formatted = formatNumber(Math.abs(diff));
    return diff > 0
        ? <span className='text-green-600 font-extrabold'>{formatted}</span>
        : <span className='text-red-600 font-extrabold'>({formatted})</span>;
};

// Safely sums deliveries for a SPECIFIC composition, preventing cross-contamination
const getDeliverySum = (deliveries, targetType) => {
    if (!Array.isArray(deliveries)) return 0;
    const normalizedTarget = (targetType || "").trim().replace(/\s+/g, "");

    return deliveries.reduce((acc, d) => {
        const normalizedType = (d.deliveryType || "").trim().replace(/\s+/g, "");
        if (normalizedType === normalizedTarget) {
            return acc + (Number(d.deliveryQty) || 0);
        }
        return acc;
    }, 0);
};

const renderBreakdownCell = (items, renderItem, keyPrefix, center = false) => {
    const list = normalizeToArray(items);

    if (list.length === 0) {
        return (
            <div style={center
                ? { padding: "10px 8px", minHeight: "36px", display: "flex", alignItems: "center", justifyContent: "center" }
                : { padding: "10px 8px", minHeight: "36px" }}>
                &nbsp;
            </div>
        );
    }

    return list.map((item, idx) => {
        const isLastItem = idx === list.length - 1;

        return (
            <div
                key={`${keyPrefix}-${idx}`}
                style={{
                    padding: "10px 8px",
                    ...(center ? { display: "flex", alignItems: "center", justifyContent: "center" } : {}),
                    // PROPER BORDERS: Only draw a line BETWEEN items. 
                    // The last item relies on the parent <td>'s bottom border, preventing double borders.
                    borderBottom: isLastItem ? "none" : `1px solid ${BORDER_COLOR}`,
                }}
            >
                {renderItem(item, idx)}
            </div>
        );
    });
};

const AopDetail = ({ detailView }) => {
    // Calculate totals using the EXACT SAME per-composition logic as the rows
    const totals = useMemo(() => {
        const acc = {
            workOrderQty: 0,
            sentForAop: 0,
            receivedFromAop: 0,
            aopFinishFabricRcvd: 0,
            returnFromAop: 0,
            payableAmount: 0,
            totalReceivedFromAop: 0,
        };

        (detailView || []).forEach((d) => {
            const factory = d.workOrders || [];
            const compositions = factory.flatMap((c) => c.compositions || []) || [];

            compositions.forEach((up) => {
                console.log(up, "uppppppp checking");
                acc.workOrderQty += Number(up.workOrderQty) || 0;
                // acc.totalReceivedFromAop += Number(up.receivedFromAop) || 0
                acc.sentForAop += getDeliverySum(up.deliveries, "SentForAop");
                acc.receivedFromAop += getDeliverySum(up.deliveries, "ReceivedFromAop");
                acc.aopFinishFabricRcvd += getDeliverySum(up.deliveries, "AOPFinishFabricRcvd");
                acc.returnFromAop += getDeliverySum(up.deliveries, "ReturnFromAop");
                // acc.totalReceivedFromAop += getDeliverySum(up.deliveries, "ReceivedFromAop");

                const price = Number(up.unitePrice) || 0;
                const qty = Number(acc.receivedFromAop) || 0;
                acc.payableAmount  = price * qty;
            });
        });

        return acc;
    }, [detailView]);

    if (!detailView || detailView.length === 0) {
        return (
            <tbody>
                <tr>
                    <td
                        colSpan={11}
                        style={{
                            border: `1px solid ${BORDER_COLOR}`,
                            padding: "40px",
                            textAlign: "center",
                            color: "#6b7280",
                            fontSize: "14px",
                            backgroundColor: "#fafafa"
                        }}
                    >
                        Select a factory from the list above to view detailed breakdown.
                    </td>
                </tr>
            </tbody>
        );
    }

    return (
        <>
            <tbody>
                {detailView.map((d, i) => {
                    const factory = d.workOrders || [];
                    // This is the source of truth for row-level data
                    const compositions = factory.flatMap((c) => c.compositions || []) || [];

                    return (
                        <tr key={i}>
                            <td style={centeredCellStyle}>
                                {renderBreakdownCell(factory, (f) => f.factoryName, `factory-${i}`, true)}
                            </td>
                            <td style={centeredCellStyle}>
                                {renderBreakdownCell(d.jobNo, (jn) => jn, `job-${i}`, true)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up, idx) => d.rows?.[idx]?.composition || "N/A", `comp-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => formatNumber(up.workOrderQty), `qty-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => formatNumber(getDeliverySum(up.deliveries, "SentForAop")), `sent-${i}`)}
                            </td>
                            <td className="bg-[#d2e0e6]" style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => {
                                    const AOP_sentForAop = getDeliverySum(up.deliveries, "SentForAop");
                                    const AOP_workOrderQty = getDeliverySum(up.deliveries, "workOrderQty");
                                    return renderColoredShortExcess(AOP_sentForAop - AOP_workOrderQty);
                                }, `short-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => formatNumber(getDeliverySum(up.deliveries, "ReturnFromAop")), `return-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => formatNumber(getDeliverySum(up.deliveries, "ReceivedFromAop")), `received-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => formatNumber(getDeliverySum(up.deliveries, "AOPFinishFabricRcvd")), `finish-${i}`)}
                            </td>

                            <td className="bg-[#d2e0e6]" style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => {
                                    const receivedFromAop = getDeliverySum(up.deliveries, "ReceivedFromAop");
                                    const AopSentForAop = getDeliverySum(up.deliveries, "SentForAop");
                                    const AopReturnFromAop = getDeliverySum(up.deliveries, "ReturnFromAop");
                                    return renderColoredShortExcess(receivedFromAop + AopReturnFromAop - AopSentForAop);
                                }, `short-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => formatMoney(up.unitePrice), `price-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(compositions, (up) => {
                                    const price = Number(up.unitePrice) || 0;
                                    const receivedFromAop = getDeliverySum(up.deliveries, "ReceivedFromAop");
                                    return formatMoney(price * receivedFromAop);
                                }, `payable-${i}`)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    {/* 1. FACTORY NAME */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>TOTAL</div></td>
                    {/* 2. JOB NO. */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>&nbsp;</div></td>
                    {/* 3. COMPOSITION */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>&nbsp;</div></td>
                    {/* 4. WORK ORDER QTY */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.workOrderQty)}</div></td>
                    {/* 5. SENT FOR AOP */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.sentForAop)}</div></td>
                    {/* Del. Short & Excess */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{renderColoredShortExcess(totals.sentForAop - totals.workOrderQty)}</div></td>
                    {/* 8. RETURN FROM AOP */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.returnFromAop)}</div></td>
                    {/* 6. RECEIVE FROM AOP */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.receivedFromAop)}</div></td>
                    {/* 7. FINISH RECEIVED FROM AOP */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.aopFinishFabricRcvd)}</div></td>
                    {/* 9. SHORT & EXCESS */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{renderColoredShortExcess(totals.receivedFromAop + totals.returnFromAop - totals.sentForAop)}</div></td>
                    {/* 10. PRICE PER KG */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>-</div></td>
                    {/* 11. PAYABLE AMOUNT */}
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatMoney(totals.payableAmount)}</div></td>
                </tr>
            </tfoot>
        </>
    );
};

export default AopDetail;