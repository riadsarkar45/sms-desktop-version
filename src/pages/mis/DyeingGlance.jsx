import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';

const BORDER_COLOR = "#b9c2c7";
const EDIT_BG = "#FFFBEB";

/* ---------- base cell style (applies to every cell in the row) ---------- */
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

/* ---------- footer ---------- */
const footerCellStyle = {
    ...cellStyle,
    position: "sticky",
    bottom: 0,
    zIndex: 5,
    fontWeight: 700,
    backgroundColor: "#E8F5E9",
};

/* ---------- remarks cell: same table design, left aligned ---------- */
const remarksCellStyle = {
    ...cellStyle,
    textAlign: "left",
    verticalAlign: "top",
    minWidth: "240px",
    maxWidth: "340px",
    whiteSpace: "normal",
    wordBreak: "break-word",
    paddingTop: "8px",
    paddingBottom: "8px",
};

/* ---------- remarks input ---------- */
const remarksInputStyle = {
    width: "100%",
    minWidth: "220px",
    boxSizing: "border-box",
    border: `1px solid #93C5FD`,
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "13px",
    fontFamily: "inherit",
    color: "#1F2937",
    backgroundColor: "#ffffff",
    outline: "none",
    resize: "vertical",
    lineHeight: "1.4",
    minHeight: "34px",
    textTransform: "uppercase",
};

/* ---------- TOOLBAR (Caption at the very top of the table) ---------- */
const toolbarCaptionStyle = {
    captionSide: "top",
    padding: "12px 16px",
    backgroundColor: "#F1F5F9",
    borderBottom: `1px solid ${BORDER_COLOR}`,
    textAlign: "left",
    boxShadow: "0 2px 6px rgba(15, 23, 42, 0.08)",
    position: "sticky",
    top: 0,
    zIndex: 30,
};

const TOTAL_COLS = 12;

/* ---------- helpers ---------- */
const fmt = (v) =>
    Number(v || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const shortExcess = (diff) => {
    const f = fmt(Math.abs(diff));
    if (diff > 0) return <span className="se-badge se-pos">{f}</span>;
    if (diff < 0) return <span className="se-badge se-neg">({f})</span>;
    return <span className="se-badge se-zero">{f}</span>;
};

const pct = (num, den) => (den ? (num / den) * 100 : 0);
const pctCell = (v) => `${(Number(v) || 0).toFixed(2)}%`;

const dv = (dt, key) => {
    if (!dt) return 0;
    const target = key.toLowerCase();
    const found = Object.keys(dt).find((k) => k.toLowerCase() === target);
    return found ? Number(dt[found]) || 0 : 0;
};

/* ===================================================================
   COMPONENT
   =================================================================== */
const DyeingGlance = ({ detailView, handleGetMisDetail, onSave }) => {
    const [remarksEdits, setRemarksEdits] = useState({});
    const [editingJob, setEditingJob] = useState(null);
    const [draftRemarks, setDraftRemarks] = useState("");
    const textareaRef = useRef(null);

    /* ---------------- rows ---------------- */
    const rows = useMemo(
        () =>
            (detailView || []).map((job) => {
                const wo = Number(job.totalWorkOrderQty) || 0;
                const dt = job.deliveryTypeTotals || {};
                const greyDelivery = dv(dt, "GreyDelivery");
                const greyReceived = dv(dt, "GreyReceived") || dv(dt, "GreyFabricReceived");
                const greyReturn = dv(dt, "GreyReturn");
                const finishReceived = dv(dt, "FinishReceived");
                const baseRemarks = job.remarks || "";
                return {
                    jobNo: job.jobNo,
                    wo,
                    greyDelivery,
                    greyReceived,
                    greyReturn,
                    finishReceived,
                    remarks:
                        remarksEdits[job.jobNo] !== undefined
                            ? remarksEdits[job.jobNo]
                            : baseRemarks,
                };
            }),
        [detailView, remarksEdits]
    );

    /* ---------------- totals ---------------- */
    const t = useMemo(
        () =>
            rows.reduce(
                (a, r) => ({
                    wo: a.wo + r.wo,
                    greyDelivery: a.greyDelivery + r.greyDelivery,
                    greyReceived: a.greyReceived + r.greyReceived,
                    greyReturn: a.greyReturn + r.greyReturn,
                    finishReceived: a.finishReceived + r.finishReceived,
                }),
                {
                    wo: 0,
                    greyDelivery: 0,
                    greyReceived: 0,
                    greyReturn: 0,
                    finishReceived: 0,
                }
            ),
        [rows]
    );

    /* ---------------- cancel editing if row disappears ---------------- */
    useEffect(() => {
        if (editingJob != null && !rows.some((r) => r.jobNo === editingJob)) {
            setEditingJob(null);
            setDraftRemarks("");
        }
    }, [rows, editingJob]);

    /* ---------------- actions ---------------- */
    const startEdit = useCallback((row) => {
        setEditingJob(row.jobNo);
        setDraftRemarks((row.remarks || "").toUpperCase());
        setTimeout(() => {
            if (textareaRef.current) textareaRef.current.focus();
        }, 0);
    }, []);

    const handleDiscard = useCallback(() => {
        setEditingJob(null);
        setDraftRemarks("");
    }, []);

    const handleSave = useCallback(() => {
        if (editingJob == null) return;
        const value = (draftRemarks || "").toUpperCase();
        setRemarksEdits((prev) => ({ ...prev, [editingJob]: value }));
        if (typeof onSave === "function") onSave(editingJob, value);
        setEditingJob(null);
        setDraftRemarks("");
    }, [editingJob, draftRemarks, onSave]);

    const handleKeyDown = useCallback(
        (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                handleDiscard();
            } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
            }
        },
        [handleSave, handleDiscard]
    );

    const handleRemarksChange = useCallback((e) => {
        setDraftRemarks(e.target.value.toUpperCase());
    }, []);

    const safeMisDetail = useCallback(
        (jobNo) => {
            if (editingJob != null) return;
            if (typeof handleGetMisDetail === "function") {
                handleGetMisDetail(jobNo);
            }
        },
        [editingJob, handleGetMisDetail]
    );

    /* ---------------- empty state ---------------- */
    if (!rows.length) {
        return (
            <tbody>
                <tr>
                    <td
                        colSpan={TOTAL_COLS}
                        style={{
                            ...cellStyle,
                            padding: "40px",
                            color: "#6b7280",
                            backgroundColor: "#fafafa",
                        }}
                    >
                        No data available.
                    </td>
                </tr>
            </tbody>
        );
    }

    const isEditing = editingJob != null;

    return (
        <>
            <style>{`
                .se-badge {
                    display: inline-block;
                    min-width: 86px;
                    padding: 4px 14px;
                    border-radius: 9px;
                    border: 1px solid transparent;
                    font-family: "Consolas", "SF Mono", "Menlo", "Courier New", monospace;
                    font-weight: 700;
                    font-size: 13px;
                    letter-spacing: .6px;
                    line-height: 1.2;
                    text-align: center;
                    white-space: nowrap;
                    box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
                }
                .se-neg  { background: #FCEDEF; border-color: #E5A9B4; color: #8C1D2F; }
                .se-pos  { background: #E9F7EE; border-color: #A3D9B4; color: #17663A; }
                .se-zero { background: #F3F4F6; border-color: #D6DAE1; color: #6B7280; }

                .aop-table-row:hover td {
                    background-color: #DCEFD9 !important;
                }
                .aop-table-row.aop-editing:hover td {
                    background-color: ${EDIT_BG} !important;
                }

                .aop-remarks-input:focus {
                    border-color: #2563EB !important;
                    box-shadow: 0 0 0 2px rgba(37,99,235,.15);
                }

                .aop-btn {
                    border: 1px solid transparent;
                    border-radius: 8px;
                    padding: 6px 18px;
                    font-size: 13px;
                    font-weight: 600;
                    font-family: inherit;
                    cursor: pointer;
                    line-height: 1.2;
                    transition: background .15s ease;
                }
                .aop-btn-save {
                    background: #16A34A;
                    color: #ffffff;
                    border-color: #15803D;
                }
                .aop-btn-save:hover { background: #15803D; }

                .aop-btn-discard {
                    background: #ffffff;
                    color: #B91C1C;
                    border-color: #E5A9B4;
                }
                .aop-btn-discard:hover { background: #FCEDEF; }
            `}</style>

            {/* ================= TOP TOOLBAR ================= */}
            {isEditing && (
                <caption style={toolbarCaptionStyle}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "13px",
                                color: "#374151",
                                fontWeight: 600,
                            }}
                        >
                            Editing remarks for&nbsp;
                            <span style={{ color: "#1D4ED8" }}>{editingJob}</span>
                            <span style={{ fontWeight: 400, color: "#6B7280" }}>
                                &nbsp;— press <b>Enter</b> to save,{" "}
                                <b>Esc</b> to discard, <b>Shift+Enter</b> for a
                                new line
                            </span>
                        </span>

                        <div style={{ display: "flex", gap: "10px" }}>
                            <button
                                type="button"
                                className="aop-btn aop-btn-save"
                                onClick={handleSave}
                            >
                                Save
                            </button>
                            <button
                                type="button"
                                className="aop-btn aop-btn-discard"
                                onClick={handleDiscard}
                            >
                                Discard
                            </button>
                        </div>
                    </div>
                </caption>
            )}

            {/* ================= BODY ================= */}
            <tbody>
                {rows.map((r, i) => {
                    const rowEditing = r.jobNo === editingJob;
                    const recv = r.greyReceived + r.greyReturn;
                    const rowBg = rowEditing
                        ? EDIT_BG
                        : i % 2 === 1
                            ? "#F2F7F4"
                            : "#ffffff";

                    return (
                        <tr
                            key={`${r.jobNo}-${i}`}
                            className={`aop-table-row${rowEditing ? " aop-editing" : ""}`}
                        >
                            {/* 1 - Job No */}
                            <td
                                onClick={() => safeMisDetail(r.jobNo)}
                                style={{
                                    ...cellStyle,
                                    backgroundColor: rowBg,
                                    fontWeight: 600,
                                }}
                            >
                                {r.jobNo}
                            </td>

                            {/* 2 - Work Order Qty */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: rowBg,
                                    cursor: "pointer",
                                }}
                            >
                                {fmt(r.wo)}
                            </td>

                            {/* 3 - Grey Delivery */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: rowBg,
                                    cursor: "pointer",
                                }}
                            >
                                {fmt(r.greyDelivery)}
                            </td>

                            {/* 4 - Short / Excess (GreyDelivery - WO) */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: "rgba(234, 179, 8, 0.2)",
                                }}
                            >
                                {shortExcess(r.greyDelivery - r.wo)}
                            </td>

                            {/* 5 - % GreyDelivery / WO */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: "rgba(10, 240, 125, 0.2)",
                                }}
                            >
                                {pctCell(pct(r.greyDelivery, r.wo))}
                            </td>

                            {/* 6 - Grey Return */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: rowBg,
                                    cursor: "pointer",
                                }}
                            >
                                {fmt(r.greyReturn)}
                            </td>

                            {/* 7 - Grey Received */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: rowBg,
                                    cursor: "pointer",
                                }}
                            >
                                {fmt(r.greyReceived)}
                            </td>

                            {/* 8 - Finish Received */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: rowBg,
                                    cursor: "pointer",
                                }}

                            >
                                {fmt(r.finishReceived)}
                            </td>

                            {/* 9 - % (GreyReceived - FinishReceived) / GreyReceived */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: "rgba(10, 240, 125, 0.2)",
                                }}
                            >
                                {pctCell(
                                    pct(
                                        r.greyReceived - r.finishReceived,
                                        r.greyReceived
                                    )
                                )}
                            </td>

                            {/* 10 - Short / Excess (Received + Return - Delivery) */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: "rgba(234, 179, 8, 0.2)",
                                }}
                            >
                                {shortExcess(recv - r.greyDelivery)}
                            </td>

                            {/* 11 - % (Received + Return) / Delivery */}
                            <td
                                style={{
                                    ...cellStyle,
                                    backgroundColor: "rgba(10, 240, 125, 0.2)",
                                }}
                            >
                                {pctCell(pct(recv, r.greyDelivery))}
                            </td>

                            {/* 12 - REMARKS (only editable column, auto uppercase) */}
                            <td
                                onDoubleClick={() => {
                                    if (!rowEditing) startEdit(r);
                                }}
                                style={{
                                    ...remarksCellStyle,
                                    backgroundColor: rowEditing ? EDIT_BG : rowBg,
                                    cursor: "text",
                                }}
                                title={rowEditing ? "" : "Double-click to edit remarks"}
                            >
                                {rowEditing ? (
                                    <textarea
                                        ref={textareaRef}
                                        className="aop-remarks-input"
                                        style={remarksInputStyle}
                                        value={draftRemarks}
                                        onChange={handleRemarksChange}
                                        onKeyDown={handleKeyDown}
                                        autoFocus
                                        rows={2}
                                        placeholder="ADD REMARKS…"
                                        spellCheck={false}
                                        autoCapitalize="characters"
                                        autoCorrect="off"
                                    />
                                ) : r.remarks ? (
                                    <span style={{ whiteSpace: "pre-wrap" }}>
                                        {r.remarks}
                                    </span>
                                ) : (
                                    <span
                                        style={{
                                            color: "#9CA3AF",
                                            fontStyle: "italic",
                                        }}
                                    >
                                        Double-click to add remarks…
                                    </span>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>

            {/* ================= FOOTER ================= */}
            <tfoot>
                <tr>
                    <td style={footerCellStyle}>TOTAL</td>
                    <td style={footerCellStyle}>{fmt(t.wo)}</td>
                    <td style={footerCellStyle}>{fmt(t.greyDelivery)}</td>
                    <td style={footerCellStyle}>
                        {shortExcess(t.greyDelivery - t.wo)}
                    </td>
                    <td style={footerCellStyle}>
                        {pctCell(pct(t.greyDelivery, t.wo))}
                    </td>
                    <td style={footerCellStyle}>{fmt(t.greyReturn)}</td>
                    <td style={footerCellStyle}>{fmt(t.greyReceived)}</td>
                    <td style={footerCellStyle}>{fmt(t.finishReceived)}</td>
                    <td style={footerCellStyle}>
                        {pctCell(
                            pct(
                                t.greyReceived - t.finishReceived,
                                t.greyReceived
                            )
                        )}
                    </td>
                    <td style={footerCellStyle}>
                        {shortExcess(
                            t.greyReceived + t.greyReturn - t.greyDelivery
                        )}
                    </td>
                    <td style={footerCellStyle}>
                        {pctCell(
                            pct(
                                t.greyReceived + t.greyReturn,
                                t.greyDelivery
                            )
                        )}
                    </td>
                    <td style={footerCellStyle}>&nbsp;</td>
                </tr>
            </tfoot>
        </>
    );
};

export default DyeingGlance;