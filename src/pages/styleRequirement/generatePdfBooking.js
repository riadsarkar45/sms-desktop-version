export const generatePDFBooking = (rowData) => {
        const printWindow = window.open('', '_blank');

        const processLoss = Number(rowData.processLoss) || 0;
        const rows = rowData.rows || [];

        let rowsHtml = '';
        let grandOrder = 0;
        let grandAdditional = 0;
        let grandTotal = 0;

        rows.forEach((row) => {
            const finishQty = Number(row.finishRequiredQty) || 0;
            const additional = Number(row.additional) || 0;
            const totalRequired = finishQty * (1 + processLoss / 100) + additional;

            grandOrder += finishQty;
            grandAdditional += additional;
            grandTotal += totalRequired;

            rowsHtml += `
                <tr>
                    <td>${rowData.styleNo || ''}</td>
                    <td>${rowData.poNo || ''}</td>
                    <td>${row.color || ''}</td>
                    <td>${row.composition || ''}</td>
                    <td>${rowData.hod || ''}</td>
                    <td>${finishQty.toFixed(2)}</td>
                    <td class="${additional > 0 ? 'add-cell' : ''}">${additional > 0 ? additional.toFixed(2) : '-'}</td>
                    <td>${totalRequired.toFixed(2)}</td>
                    <td>${row.finishDia || ''}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>${totalRequired.toFixed(2)}</td>
                    <td>${totalRequired.toFixed(2)}</td>
                    <td>BODY-Solid</td>
                </tr>
            `;
        });

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Fabric Booking Sheet - ${rowData.jobNo}</title>
                <style>
                    @media print {
                        @page { margin: 0.5in; }
                        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    }
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        font-size: 12px;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .header h1 { margin: 5px 0; font-size: 18px; }
                    .header h2 { margin: 5px 0; font-size: 16px; }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 10px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 15px;
                    }
                    th, td {
                        border: 1px solid #000;
                        padding: 6px;
                        text-align: center;
                        font-size: 10px;
                    }
                    th { background-color: #f3ddc7; font-weight: bold; }
                    th.add-head { background-color: #fde68a; }
                    td.add-cell { background-color: #fef3c7; font-weight: bold; color: #92400e; }
                    tfoot td { background-color: #f3ddc7; font-weight: bold; }
                    .footer {
                        margin-top: 30px;
                        display: flex;
                        justify-content: space-between;
                    }
                    .signature {
                        text-align: center;
                        margin-top: 40px;
                    }
                    button { margin: 10px 5px; padding: 8px 16px; cursor: pointer; }
                </style>
            </head>
            <body>
                <div style="text-align: right; margin-bottom: 10px;">
                    <button onclick="window.print()">🖨️ Print / Save as PDF</button>
                    <button onclick="window.close()">Close</button>
                </div>

                <div class="header">
                    <h1>SM SOURCING</h1>
                    <h2>Fabric Booking Sheet</h2>
                </div>

                <div class="info-row">
                    <div>
                        <strong>Buyer:</strong> ${rowData.buyerName || ''}<br/>
                        <strong>Process loss below 8%.</strong>
                    </div>
                    <div style="text-align: center;">
                        <strong>HOD:</strong> ${rowData.hod || 'N/A'}
                    </div>
                    <div style="text-align: right;">
                        <strong>JOB NO:</strong> ${rowData.jobNo}<br/>
                        <strong>Date:</strong> ${new Date().toLocaleDateString()}
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Style No</th>
                            <th>PO No</th>
                            <th>Color</th>
                            <th>Fabrication</th>
                            <th>HOD</th>
                            <th>Order Qty</th>
                            <th class="add-head">Additional Booking</th>
                            <th>Total Booking</th>
                            <th>Finished fab. Width</th>
                            <th>Consumption PCS</th>
                            <th>F. Fab</th>
                            <th>2x1 rib lycra</th>
                            <th>Total fabric</th>
                            <th>Yarn req.</th>
                            <th>Type Of work order</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="5">TOTAL</td>
                            <td>${grandOrder.toFixed(2)}</td>
                            <td class="add-cell">${grandAdditional.toFixed(2)}</td>
                            <td>${grandTotal.toFixed(2)}</td>
                            <td colspan="7"></td>
                        </tr>
                    </tfoot>
                </table>

                <div class="footer">
                    <div>
                        <p>Thanks &amp; Best regards</p>
                    </div>
                    <div>
                        <p>CC To:</p>
                    </div>
                    <div class="signature">
                        <p>Approved by:</p>
                        <p style="margin-top: 40px;">_________________</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };