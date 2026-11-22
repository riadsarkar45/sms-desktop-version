import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { formatWorkOrderDate, getWorkOrderDate, ORDER_TITLES } from "./WorkOrderHelpers";
// import { formatWorkOrderDate, getWorkOrderDate, ORDER_TITLES } from "./workOrderHelpers";

const isEmpty = (v) =>
    v === null || v === undefined || String(v).trim() === "" || String(v).trim().toUpperCase() === "NULL";

// composition value first, then the old work-order value
const lineValue = (wo, comp, field) => {
    if (!isEmpty(comp?.[field])) return comp[field];
    if (!isEmpty(wo?.[field])) return wo[field];
    return "-";
};

const getFinishDia = (wo, comp) => {
    const rows = wo?.styleRequirement?.rows;
    if (!rows || !comp) return "-";
    const match = rows.find(r => r.composition === comp.composition && r.color === comp.color);
    return match?.finishDia || "-";
};

const getPoNo = (wo, comp) => {
    const rows = wo?.styleRequirement?.rows;
    const match = rows?.find(r => r.composition === comp?.composition && r.color === comp?.color);
    return match?.poNo || wo?.styleRequirement?.poNo || wo?.poNo || "-";
};

const num = (v) => (Number(v) || 0);

// NEW: natural text compare used to order the print rows (composition -> color -> yarn count -> lot)
const cmp = (a, b) =>
    String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });

const WorkOrderPreviewModal = ({ data, orderType, revisionCount = 0, onClose }) => {
    const job = data?.job;
    const wo = data?.wo;

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    if (!wo) return null;

    const title = ORDER_TITLES[orderType] || "Work Order";
    const shortTitle = title.replace(" Work Order", "").toUpperCase();
    const comps = wo.compositions && wo.compositions.length > 0 ? wo.compositions : [];
    const isRevised = revisionCount > 0;

    // yarn dyeing: booking color comes from yarnDyeingJobs
    const rowsData = comps.map((comp) => {
        const yJobs = (wo.yarnDyeingJobs || []).filter(y => y.composition === comp.composition);
        const color =
            orderType === "yarnDyeingOrder" && yJobs.length > 0
                ? yJobs.map(y => y.color).join(", ")
                : (comp.bookingColor || comp.color || "-");
        const qty = orderType === "yarnDyeingOrder" && yJobs.length > 0
            ? yJobs.reduce((s, y) => s + num(y.qty), 0)
            : num(comp.workOrderQty);
        return { comp, color, qty };
    });

    // NEW: print rows grouped composition wise, then color, yarn count and lot
    // (same rows as before, only ordered; repeated Fabrication / Color cells are merged with rowSpan)
    const printRows = rowsData
        .map((r, idx) => ({ ...r, idx }))
        .sort((a, b) =>
            cmp(a.comp?.composition, b.comp?.composition) ||
            cmp(a.color, b.color) ||
            cmp(lineValue(wo, a.comp, "yarnCount"), lineValue(wo, b.comp, "yarnCount")) ||
            cmp(lineValue(wo, a.comp, "lotNo"), lineValue(wo, b.comp, "lotNo")) ||
            a.idx - b.idx
        )
        .map((r, i, arr) => {
            const prev = arr[i - 1];
            const sameComp = prev && (prev.comp?.composition || "") === (r.comp?.composition || "");
            const sameColor = sameComp && prev.color === r.color;

            let compSpan = 1;
            if (!sameComp) {
                for (let j = i + 1; j < arr.length && (arr[j].comp?.composition || "") === (r.comp?.composition || ""); j++) compSpan++;
            } else {
                compSpan = 0;
            }

            let colorSpan = 1;
            if (!sameColor) {
                for (let j = i + 1; j < arr.length
                    && (arr[j].comp?.composition || "") === (r.comp?.composition || "")
                    && arr[j].color === r.color; j++) colorSpan++;
            } else {
                colorSpan = 0;
            }

            return { ...r, compSpan, colorSpan };
        });

    const totalQty = rowsData.reduce((s, r) => s + r.qty, 0);
    const styleNo = wo.styleRequirement?.styleNo || wo.styleNo || "-";
    const buyerName = wo.styleRequirement?.buyerName || "-";

    const th = { border: "1px solid #000", padding: "3px 3px", fontSize: "8.5px", fontWeight: 700, background: "#e5e7eb", textAlign: "center", verticalAlign: "middle" };
    const td = { border: "1px solid #000", padding: "3px 3px", fontSize: "9px", textAlign: "center", verticalAlign: "middle" };

    return createPortal(
        <div className="wo-print-portal">
            <style>{`
                .wo-print-portal .wo-preview-overlay {
                    position: fixed; inset: 0; z-index: 100001;
                    background: rgba(15, 23, 42, 0.7);
                    display: flex; flex-direction: column; align-items: center;
                    overflow: auto; padding: 16px;
                }
                .wo-print-portal .wo-preview-toolbar {
                    display: flex; gap: 8px; margin-bottom: 12px;
                    position: sticky; top: 0; z-index: 5;
                }
                .wo-print-portal .wo-btn {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 8px 16px; border-radius: 6px; border: none;
                    font-weight: 600; font-size: 14px; cursor: pointer;
                }
                .wo-print-portal .wo-sheet {
                    width: 297mm; min-height: 210mm; background: #fff; color: #000;
                    padding: 8mm 10mm; box-sizing: border-box; flex-shrink: 0;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.45);
                    font-family: Arial, Helvetica, sans-serif;
                }
                .wo-print-portal .wo-sheet table { width: 100%; border-collapse: collapse; }
                @media print {
                    @page { size: A4 landscape; margin: 6mm; }
                    html, body { background: #fff !important; margin: 0 !important; }
                    body > *:not(.wo-print-portal) { display: none !important; }
                    .wo-print-portal .wo-preview-overlay {
                        position: static !important; background: none !important;
                        padding: 0 !important; overflow: visible !important; display: block !important;
                    }
                    .wo-print-portal .wo-preview-toolbar { display: none !important; }
                    .wo-print-portal .wo-sheet {
                        width: 100% !important; min-height: 0 !important;
                        padding: 0 !important; box-shadow: none !important;
                    }
                    .wo-print-portal .wo-sheet, .wo-print-portal .wo-sheet * {
                        -webkit-print-color-adjust: exact; print-color-adjust: exact;
                    }
                }
            `}</style>

            <div className="wo-preview-overlay" onClick={onClose}>
                <div className="wo-preview-toolbar" onClick={(e) => e.stopPropagation()}>
                    <button className="wo-btn" style={{ background: "#1d4ed8", color: "#fff" }} onClick={() => window.print()}>
                        <Printer size={16} /> Print / Save as PDF
                    </button>
                    <button className="wo-btn" style={{ background: "#fff", color: "#111" }} onClick={onClose}>
                        <X size={16} /> Close
                    </button>
                </div>

                <div className="wo-sheet" onClick={(e) => e.stopPropagation()}>
                    {/* ---------- top header ---------- */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ width: "28%" }} />
                        <div style={{ width: "44%", textAlign: "center" }}>
                            <div style={{ fontSize: 17, fontWeight: 700 }}>SM SOURCING</div>
                            <div style={{ fontSize: 11 }}>Dhanmondi, Road#8, House-3/1</div>
                            {isRevised && (
                                <div style={{
                                    display: "inline-block", marginTop: 4, padding: "1px 20px",
                                    border: "2px solid #b91c1c", color: "#b91c1c",
                                    fontWeight: 800, fontSize: 14, letterSpacing: 3,
                                }}>
                                    REVISED{revisionCount > 1 ? ` (${revisionCount})` : ""}
                                </div>
                            )}
                        </div>
                        <div style={{ width: "28%", textAlign: "right", fontSize: 15, fontWeight: 600 }}>
                            Work Order No-({wo.workOrderNo || "-"})
                        </div>
                    </div>

                    <div style={{ borderTop: "2px solid #000", borderBottom: "1px solid #000", textAlign: "center", fontWeight: 700, fontSize: 13, margin: "4px 0 8px", textDecoration: "underline" }}>
                        {title}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                        <div style={{ lineHeight: 1.8 }}>
                            <div><b>Attn :</b> {wo.attn || "MR. Mashuq"}</div>
                            <div><b>To:</b> {wo.factoryName || "-"}</div>
                            <div><b>Addres:</b> {wo.factoryAddress || wo.address || "-"}</div>
                            <div style={{ marginTop: 6 }}><b><u>Subject</u></b> {title}</div>
                        </div>
                        <div style={{ textAlign: "right", lineHeight: 1.8 }}>
                            <div style={{ border: "1px solid #000", display: "inline-block", padding: "1px 22px", fontWeight: 700 }}>
                                HOD : {String(wo.month || "-").toUpperCase()}
                            </div>
                            <div><b>DATE:</b> {formatWorkOrderDate(getWorkOrderDate(wo))}</div>
                            <div><b>BUYER : {buyerName}</b></div>
                            <div style={{ border: "1px solid #000", display: "inline-block", padding: "1px 12px", fontWeight: 700 }}>
                                JOB NUMBER : {job?.jobNo || "-"}
                            </div>
                        </div>
                    </div>

                    <div style={{ textAlign: "center", margin: "8px 0" }}>
                        <span style={{ border: "1px solid #000", padding: "4px 40px", fontWeight: 700, fontSize: 13 }}>
                            FACTORY NAME : {wo.factoryName || "-"}
                        </span>
                    </div>

                    <div style={{ fontSize: 9, marginBottom: 3 }}>
                        Dear sir,<br />Please fine here with the below {shortTitle} work order for your ref..
                    </div>

                    {/* ---------- items ---------- */}
                    <table>
                        <thead>
                            <tr>
                                <th style={th}>STYLE</th>
                                <th style={th}>PO NO.</th>                                
                                <th style={th}>HOD</th>
                                <th style={th}>Color</th>
                                <th style={th}>Fabrication</th>
                                <th style={th}>Finished fab. Width</th>
                                <th style={th}>WORK Order Qnty (Kg)</th>
                                <th style={th}>Yarn count</th>
                                <th style={th}>YARN LOT NUMBER</th>
                                <th style={th}>SL</th>
                                 <th style={th}>M/D</th>
                                <th style={th}>PRICE/ DT/kg</th>              
                                <th style={th}>production start date</th>
                                <th style={th}>production close date</th>
                                <th style={th}>REMARKS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {printRows.length === 0 && (
                                <tr><td style={td} colSpan={15}>No compositions found</td></tr>
                            )}
                            {printRows.map(({ comp, color, qty, compSpan, colorSpan }, i) => (
                                <tr key={comp?.id ?? i}>
                                    {i === 0 && <td style={td} rowSpan={printRows.length}>{styleNo}</td>}
                                    <td style={td}>{getPoNo(wo, comp)}</td>                                    
                                    {i === 0 && <td style={td} rowSpan={printRows.length}>{wo.month || "-"}</td>}
                                    {colorSpan > 0 && <td style={td} rowSpan={colorSpan}>{color}</td>}
                                    {compSpan > 0 && <td style={td} rowSpan={compSpan}>{comp?.composition || "-"}</td>}
                                    <td style={td}>{getFinishDia(wo, comp)}</td>
                                    <td style={td}>{qty ? qty.toFixed(2) : "-"}</td>
                                    <td style={td}>{lineValue(wo, comp, "yarnCount")}</td>
                                    <td style={td}>{lineValue(wo, comp, "lotNo")}</td>
                                    <td style={td}>{lineValue(wo, comp, "stichLength")}</td>
                                    <td style={td}>{lineValue(wo, comp, "machineDia")}</td>                                 
                                    
                                    <td style={td}>{comp?.unitePrice != null ? Number(comp.unitePrice).toFixed(2) : "-"}</td>
                                    
                                    
                                    {i === 0 && <td style={td} rowSpan={printRows.length}>{wo.productionStartDate ? formatWorkOrderDate(wo.productionStartDate) : "-"}</td>}
                                    {i === 0 && <td style={td} rowSpan={printRows.length}>{wo.productionCloseDate ? formatWorkOrderDate(wo.productionCloseDate) : "-"}</td>}
                                    {i === 0 && <td style={td} rowSpan={printRows.length}>{wo.remarks || "Body"}</td>}
                                </tr>
                            ))}
                            <tr>
                                <td style={{ ...td, textAlign: "left", fontWeight: 700, background: "#d1d5db" }} colSpan={6}>Grand Total =</td>
                                <td style={{ ...td, fontWeight: 700, background: "#d1d5db" }}>{totalQty.toFixed(2)}</td>
                                <td style={{ ...td, background: "#d1d5db" }} colSpan={8} />
                            </tr>
                        </tbody>
                    </table>

                    {/* ---------- terms ---------- */}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
                        <div style={{ fontSize: 9, lineHeight: 1.5, flex: 1 }}>
                            <div><b>Delivery place :</b> {wo.deliveryPlace || ""} &nbsp;&nbsp;&nbsp; <b>Factory.</b></div>
                            <div>(1) Please follow our Finish fabric GSM strictly which is mentioned in work order.</div>
                            <div>(2) Supplier will collect yarn from SM warehouse &amp; buyer will collect the ready goods after inspection.</div>
                            <div>(3) Any process loss not allowed.</div>
                            <div>(4) Satuf Not Allowed.</div>
                            <div>(5) Only 1 pcs hole per roll to be allowed otherwise rejected.</div>
                            <div>(6) Edge to egde dia should be 100% accurate as per our work order. Roll to roll Dia discrepency not allowed.</div>
                            <div>(7) Payment by Cash after deliver the order. Supplier will send bill order to order seperately.</div>
                            <div style={{ marginTop: 4 }}>Thanking you in advance for your nice co-operation.</div>
                            <div style={{ marginTop: 4 }}><b><u>Remarks.</u></b></div>
                            <div>If any claim arises from buyer side that situation total liabilities will go through on your shoulder</div>
                        </div>
                        <div style={{ width: "38%", border: "1px solid #000", background: "#d1d5db", fontSize: 10, fontWeight: 700, padding: 6, display: "flex", gap: 8, alignSelf: "flex-start" }}>
                            <div style={{ alignSelf: "center" }}>NOTE:</div>
                            <div>After {shortTitle.charAt(0) + shortTitle.slice(1).toLowerCase()} Grey Fabric will directly deliver to Bscic Grey Store for Inspection &amp; on each Grey Fabric roll should be written by Yellow Marker.</div>
                        </div>
                    </div>

                    <div style={{ marginTop: 6, background: "#d1d5db", fontSize: 10, fontWeight: 700, padding: "2px 6px" }}>
                        *** Any Kind of Lose Yarn Return &amp; Process Loss Not Allow.
                    </div>

                    <div style={{ marginTop: 28, fontSize: 10 }}>
                        <div style={{ borderTop: "1px solid #000", width: 180, paddingTop: 2 }}>Planning Manager</div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default WorkOrderPreviewModal;