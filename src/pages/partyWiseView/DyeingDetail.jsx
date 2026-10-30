import React, { useMemo } from 'react';

const BORDER_COLOR = "#000000";

const cellStyle = {
    border: `1px solid ${BORDER_COLOR}`,
    padding: 0,
    verticalAlign: "top",
    fontSize: "13px",
    boxSizing: "border-box",
    textAlign: "center",
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

const sumValue = (value) => {
    const list = normalizeToArray(value);
    return list.reduce((acc, v) => acc + (Number(v) || 0), 0);
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

const getDeliverySum = (deliveries, type) => {
    if (!Array.isArray(deliveries)) return 0;
    return deliveries
        .filter(d => (d.deliveryType || "").trim().replace(/\s+/g, "") === type)
        .reduce((acc, d) => acc + (Number(d.deliveryQty) || 0), 0);
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
                    borderBottom: isLastItem ? "none" : `1px solid ${BORDER_COLOR}`,
                }}
            >
                {renderItem(item, idx)}
            </div>
        );
    });
};

const DyeingDetail = ({ detailView }) => {
    const totals = useMemo(() => {
        const acc = {
            workOrderQty: 0,
            greyDelivery: 0,
            greyReceived: 0,
            greyReturn: 0,
            finishReceived: 0,
            payableAmount: 0,
        };

        (detailView || []).forEach((d) => {
            const factory = d.workOrders || [];
            const deliveries = d.deliveryTotals || {};
            const unitePriceArr = factory.flatMap((c) => c.compositions || []) || [];

            unitePriceArr.forEach((up) => {
                acc.workOrderQty += Number(up.workOrderQty) || 0;
            });

            acc.greyDelivery += sumValue(deliveries?.GreyDelivery);
            acc.greyReceived += sumValue(deliveries?.GreyReceived);
            acc.finishReceived += sumValue(deliveries?.FinishReceived);
            acc.greyReturn += sumValue(deliveries?.GreyReturn)

            if (deliveries?.PayableAmount !== undefined && deliveries?.PayableAmount !== null) {
                acc.payableAmount += sumValue(deliveries.PayableAmount);
            } else {
                unitePriceArr.forEach((up) => {
                    const price = Number(up.unitePrice) || 0;
                    const qty = Number(up.greyReceived) || 0;
                    acc.payableAmount += price * qty;
                });
            }
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
                    const unitePrice = factory.flatMap((c) => c.compositions || []) || [];

                    return (
                        <tr key={i}>
                            <td style={centeredCellStyle}>
                                {renderBreakdownCell(factory, (f) => f.factoryName, `factory-${i}`, true)}
                            </td>
                            <td style={centeredCellStyle}>
                                {renderBreakdownCell(d.jobNo, (jn) => jn, `job-${i}`, true)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up, idx) => d.rows?.[idx]?.composition || "N/A", `comp-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => formatNumber(up.workOrderQty), `qty-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => formatNumber(getDeliverySum(up.deliveries, "GreyDelivery")), `yd-${i}`)}
                            </td>
                            <td className="bg-[#d2e0e6]" style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => {
                                    const greyDelivery = getDeliverySum(up.deliveries, "GreyDelivery");
                                    const workOrderQty = Number(up.workOrderQty) || 0;
                                    return renderColoredShortExcess(greyDelivery - workOrderQty);
                                }, `short-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => formatNumber(getDeliverySum(up.deliveries, "GreyReturn")), `grey-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => formatNumber(getDeliverySum(up.deliveries, "GreyReceived")), `grey-${i}`)}
                            </td>

                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => formatNumber(getDeliverySum(up.deliveries, "FinishReceived")), `finish-${i}`)}
                            </td>
                            <td className="bg-[#d2e0e6]" style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => {
                                    const GreyDelivery = getDeliverySum(up.deliveries, "GreyDelivery");
                                    const GreyReceived = getDeliverySum(up.deliveries, "GreyReceived");
                                    const GreyReturn = getDeliverySum(up.deliveries, "GreyReturn");
                                    return renderColoredShortExcess(GreyReceived + GreyReturn - GreyDelivery);
                                }, `short2-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => formatMoney(up.unitePrice), `price-${i}`)}
                            </td>
                            <td style={cellStyle}>
                                {renderBreakdownCell(unitePrice, (up) => {
                                    const price = Number(up.unitePrice) || 0;
                                    const qty = Number(up.workOrderQty) || 0;
                                    return formatMoney(price * qty);
                                }, `payable-${i}`)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>TOTAL</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>&nbsp;</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>&nbsp;</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.workOrderQty.toFixed(2))}</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.greyDelivery.toFixed(2))}</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{renderColoredShortExcess(totals.greyDelivery.toFixed(2) - totals.workOrderQty.toFixed(2))}</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.greyReturn.toFixed(2))}</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.greyReceived.toFixed(2))}</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatNumber(totals.finishReceived.toFixed(2))}</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{renderColoredShortExcess(totals.greyReceived + totals.greyReturn - totals.greyDelivery)}</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>&nbsp;</div></td>
                    <td className="bg-[#16455a]" style={footerCellStyle}><div style={{ padding: "10px 8px" }}>{formatMoney(totals.payableAmount)}</div></td>
                </tr>
            </tfoot>
        </>
    );
};

export default DyeingDetail;