import * as XLSX from "xlsx";

export const handleExportExcel = ({ COLUMNS, filteredData, getBreakdownValue, FROZEN_COUNT, footerTotals, NO_TOTAL_COLUMN_INDEXES, PERCENT_COLUMN_INDEXES }) => {
    const wsData = [];
    wsData.push(COLUMNS);

    const merges = [];
    let currentRow = 1;

    filteredData.forEach(row => {
        const compBreakdown = row.compBreakdown || row.rows.map(() => ({}));
        const numSubRows = row.rows.length;

        for (let j = 0; j < numSubRows; j++) {
            const cell = row.rows[j];
            const cb = compBreakdown[j] || {};

            const finishQty = Number(cell.finishRequiredQty) || 0;
            const processLoss = Number(row.processLoss) || 0;
            const totalRequired = finishQty + finishQty * (processLoss / 100);
            const knittingWOQty = Number(getBreakdownValue(cb, 'knittingOrder_workOrderQty')) || 0;

            const shortExcess0 = cb?.status ? "_" : (totalRequired - knittingWOQty).toFixed(2);
            const yarnDelivery = Number(getBreakdownValue(cb, 'knittingOrder_Yarn_Delivery')) || 0;
            const shortExcess1 = totalRequired === 0 ? "_" : (totalRequired - yarnDelivery).toFixed(2);

            const yarnReturn = Number(getBreakdownValue(cb, 'knittingOrder_Yarn_Return')) || 0;
            const greyReceived = Number(getBreakdownValue(cb, 'knittingOrder_Grey_Fabric_Received')) || 0;
            const balance = (greyReceived + yarnReturn) - (knittingWOQty - yarnDelivery);

            const greyReturnRcvd = Number(getBreakdownValue(cb, 'dyeingOrder_Grey_Return_Received')) || 0;
            const greyReceivedDyeing = Number(getBreakdownValue(cb, 'dyeingOrder_Grey_Received_From_Dyeing')) || 0;
            const greyDelivery = Number(getBreakdownValue(cb, 'dyeingOrder_Grey_Delivery')) || 0;
            const greyBalance = greyReturnRcvd + greyReceivedDyeing - greyDelivery;
            const hasGreyData = greyReturnRcvd || greyReceivedDyeing || greyDelivery;

            const aopSent = Number(getBreakdownValue(cb, 'aopOrder_Sent_for_AOP')) || 0;
            const aopReceived = Number(getBreakdownValue(cb, 'aopOrder_Received_From_Aop')) || 0;
            const aopBalance = aopReceived - aopSent;
            const aopLoss = aopSent > 0 ? (((aopSent - aopReceived) / aopSent) * 100).toFixed(2) + "%" : "_";

            const rpSent = Number(getBreakdownValue(cb, 'reProcessOrder_Sent_for_Re_Process')) || 0;
            const rpGrey = Number(getBreakdownValue(cb, 'reProcessOrder_Received_After_Re_Process_Grey')) || 0;
            const rpFinish = Number(getBreakdownValue(cb, 'reProcessOrder_Received_After_Re_Process_Finish')) || 0;
            const rpBalance = (rpGrey + rpFinish) - rpSent;
            const rpLoss = rpSent > 0 ? (((rpSent - (rpGrey + rpFinish)) / rpSent) * 100).toFixed(2) + "%" : "_";

            wsData.push([
                j === 0 ? row.salesContact : "",
                j === 0 ? row.buyerName : "",
                j === 0 ? row.jobNo : "",
                j === 0 ? row.styleNo : "",
                j === 0 ? row.poNo : "",
                cell.color,
                cell.composition,
                cell.finishDia,
                cell.orderQty,
                totalRequired.toFixed(2),
                cell.additional || "additional",
                totalRequired.toFixed(2),
                cb?.status ? "_" : knittingWOQty.toFixed(2),
                cb?.status ? "_" : shortExcess0,
                cb?.status ? "_" : yarnDelivery.toFixed(2),
                cb?.status ? "_" : shortExcess1,
                cb?.status ? "_" : (Number(getBreakdownValue(cb, 'yarnDyeingOrder_Yarn_Delivery_For_Yarn_Dye')) || 0).toFixed(2),
                cb?.status ? "_" : (Number(getBreakdownValue(cb, 'yarnDyeingOrder_Yarn_Received_From_Yarn_Dye')) || 0).toFixed(2),
                "-",
                cb?.status ? "_" : greyReceived.toFixed(2),
                cb?.status ? "_" : yarnReturn.toFixed(2),
                cb?.status ? "_" : balance.toFixed(2),
                cb?.status ? "_" : greyDelivery.toFixed(2),
                cb?.status ? "_" : greyReturnRcvd.toFixed(2),
                cb?.status ? "_" : (Number(getBreakdownValue(cb, 'dyeingOrder_Grey_Received')) || 0).toFixed(2),
                cb?.status ? "_" : (Number(getBreakdownValue(cb, 'dyeingOrder_Finish_Received')) || 0).toFixed(2),
                cb?.status ? "_" : (!hasGreyData ? "_" : greyBalance.toFixed(2)),
                `${processLoss}%`,
                cb?.status ? "_" : aopSent.toFixed(2),
                cb?.status ? "_" : (Number(getBreakdownValue(cb, 'aopOrder_Fabric_Return')) || 0).toFixed(2),
                cb?.status ? "_" : (Number(getBreakdownValue(cb, 'aopOrder_After_Aop_Fabric_Rcvd')) || 0).toFixed(2),
                cb?.status ? "_" : aopReceived.toFixed(2),
                cb?.status ? "_" : (aopSent === 0 && aopReceived === 0 ? "_" : Math.abs(aopBalance).toFixed(2)),
                cb?.status ? "_" : aopLoss,
                cb?.status ? "_" : rpSent.toFixed(2),
                cb?.status ? "_" : (Number(getBreakdownValue(cb, 'reProcessOrder_Return_Received')) || 0).toFixed(2),
                cb?.status ? "_" : rpGrey.toFixed(2),
                cb?.status ? "_" : rpFinish.toFixed(2),
                cb?.status ? "_" : (rpSent === 0 && rpGrey === 0 && rpFinish === 0 ? "_" : Math.abs(rpBalance).toFixed(2)),
                cb?.status ? "_" : rpLoss,
            ]);
        }

        if (numSubRows > 1) {
            for (let col = 0; col < 5; col++) {
                merges.push({
                    s: { r: currentRow, c: col },
                    e: { r: currentRow + numSubRows - 1, c: col }
                });
            }
        }
        currentRow += numSubRows;
    });

    const totalRow = new Array(COLUMNS.length).fill("");
    totalRow[0] = "TOTAL";
    for (let idx = FROZEN_COUNT; idx < COLUMNS.length; idx++) {
        if (NO_TOTAL_COLUMN_INDEXES.has(idx)) continue;
        const val = (footerTotals[idx] || 0).toFixed(2);
        totalRow[idx] = PERCENT_COLUMN_INDEXES.has(idx) ? `${val}%` : val;
    }
    wsData.push(totalRow);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = COLUMNS.map((_, i) => ({ wch: i < FROZEN_COUNT ? 20 : 18 }));
    ws['!merges'] = merges;

    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellAddress]) continue;
            if (!ws[cellAddress].s) ws[cellAddress].s = {};
            ws[cellAddress].s.alignment = { horizontal: "center", vertical: "center" };
        }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    XLSX.writeFile(wb, `Summary_${new Date().toISOString().slice(0, 10)}.xlsx`);
};