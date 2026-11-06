import React from 'react';

const BORDER_COLOR = "#b9c2c7";

const cellStyle = {
    border: `2px solid ${BORDER_COLOR}`,
    padding: "7px 10px",
    verticalAlign: "middle",
    textAlign: "center",
    fontSize: "13px",
    color: "#1F2937",
    fontVariantNumeric: "tabular-nums",
    boxSizing: "border-box",
    backgroundColor: "#ffffff",
};

const footerCellStyle = {
    ...cellStyle,
    position: "sticky",
    bottom: 0,
    zIndex: 5,
    fontWeight: 700,
    backgroundColor: "#E8F5E9",
};

const TOTAL_COLS = 6;

const fmt = (v) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const shortExcess = (diff) => {
    const f = fmt(Math.abs(diff));
    if (diff > 0) return <span className="se-badge se-pos">{f}</span>;
    if (diff < 0) return <span className="se-badge se-neg">({f})</span>;
    return <span className="se-badge se-zero">{f}</span>;
};

const KnittingGlance = ({ rows = [], totals = {} }) => {
    if (!rows.length) {
        return (
            <tbody>
                <tr>
                    <td colSpan={TOTAL_COLS} style={{ ...cellStyle, padding: "40px", color: "#6b7280", backgroundColor: "#fafafa" }}>
                        No data available.
                    </td>
                </tr>
            </tbody>
        );
    }

    return (
        <>
            <style>{`
                .se-badge { display: inline-block; min-width: 86px; padding: 4px 14px; border-radius: 9px; border: 1px solid transparent; font-family: "Consolas", "SF Mono", "Menlo", "Courier New", monospace; font-weight: 700; font-size: 13px; letter-spacing: .6px; line-height: 1.2; text-align: center; white-space: nowrap; box-shadow: inset 0 1px 0 rgba(255,255,255,.6); }
                .se-neg  { background: #FCEDEF; border-color: #E5A9B4; color: #8C1D2F; }
                .se-pos  { background: #E9F7EE; border-color: #A3D9B4; color: #17663A; }
                .se-zero { background: #F3F4F6; border-color: #D6DAE1; color: #6B7280; }
                .aop-table-row:hover td { background-color: #DCEFD9 !important; }
            `}</style>

            <tbody>
                {rows.map((r, i) => {
                    const rowBg = i % 2 === 1 ? "#F2F7F4" : "#ffffff";
                    return (
                        <tr key={`${r.serial}-${r.factoryName}`} className="aop-table-row">
                            <td style={{ ...cellStyle, backgroundColor: rowBg }}>{r.serial}</td>
                            <td style={{ ...cellStyle, backgroundColor: rowBg, textAlign: "left", fontWeight: 600 }}>{r.factoryName}</td>
                            <td style={{ ...cellStyle, backgroundColor: rowBg }}>{fmt(r.yarnDelivery)}</td>
                            <td style={{ ...cellStyle, backgroundColor: rowBg }}>{fmt(r.yarnReturn)}</td>
                            <td style={{ ...cellStyle, backgroundColor: rowBg }}>{fmt(r.greyReceived)}</td>
                            <td style={{ ...cellStyle, backgroundColor: "rgba(234, 179, 8, 0.2)" }}>{shortExcess(r.partyStock)}</td>
                        </tr>
                    );
                })}
            </tbody>

            <tfoot>
                <tr>
                    <td style={footerCellStyle}>&nbsp;</td>
                    <td style={{ ...footerCellStyle, textAlign: "left" }}>TOTAL</td>
                    <td style={footerCellStyle}>{fmt(totals.yarnDelivery)}</td>
                    <td style={footerCellStyle}>{fmt(totals.yarnReturn)}</td>
                    <td style={footerCellStyle}>{fmt(totals.greyReceived)}</td>
                    <td style={footerCellStyle}>{shortExcess(totals.partyStock || 0)}</td>
                </tr>
            </tfoot>
        </>
    );
};

export default KnittingGlance;