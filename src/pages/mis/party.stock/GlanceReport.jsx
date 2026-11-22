import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import ExcelJS from "exceljs";
import KnittingGlance from "./KnittingGlance";
import DyeingGlance from "./DyeingGlance";
import AopGlance from "./AopGlance";
import { useFetchData } from "../../../hooks/fetch";

const BORDER_COLOR = "#b9c2c7";
const HEADER_BG = "#1E6B3A";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ===================================================================
   NEW LOCATIONS (edit here only)
   YARN_STORE_KEY = the :orderType used in /api/mis-party-stock/:orderType for the Yarn Store location
   YARN_STORE_METRICS = movement type names of the store (lowercase, letters/digits only)
   =================================================================== */
const YARN_STORE_KEY = "yarnStoreOrder";
const YARN_STORE_METRICS = {
    yarnReceived: ["yarnreceived"],
    yarnIssued: ["yarnissued"],
    yarnReturned: ["yarnreturned"],
};
/* keys that must not break the Summary tab when the API fails (a warning is shown instead) */
const OPTIONAL_KEYS = new Set([YARN_STORE_KEY, "finishFabric"]);


/* ---------- helpers ---------- */
const round2 = (v) => {
    const n = Math.round((Number(v) || 0) * 100) / 100;
    return Math.abs(n) < 0.005 ? 0 : n;
};

const fmt = (v) =>
    Number(v || 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const pctCell = (v) => `${(Number(v) || 0).toFixed(2)}%`;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

const fmtYmd = (s) => {
    if (!s) return "";
    const [y, m, d] = String(s).split("-");
    return `${d}-${MON[Number(m) - 1]}-${y}`;
};

/* "2026-11-01" -> "2026-10-31" (timezone safe) */
const prevDay = (s) => {
    const [y, m, d] = String(s).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return dt.toISOString().slice(0, 10);
};

const pickMetric = (dt, aliases) => {
    const map = {};
    Object.keys(dt || {}).forEach((k) => {
        map[norm(k)] = dt[k];
    });
    for (const a of aliases) {
        if (map[a] !== undefined && Number(map[a])) return Number(map[a]) || 0;
    }
    return 0;
};

/* API factory item -> { normalizedDeliveryType: qty }
   supports:  deliveryTypeWiseTotal: [{ deliveryType, totalQty }]   (current API)
              deliveryTotals: { "Yarn Delivery": 123 }              (old shape, fallback) */
const buildTotals = (f) => {
    const out = {};
    if (Array.isArray(f?.deliveryTypeWiseTotal)) {
        f.deliveryTypeWiseTotal.forEach((d) => {
            const k = norm(d?.deliveryType ?? "");
            if (!k) return;
            out[k] = (out[k] || 0) + (Number(d?.totalQty) || 0);
        });
    } else if (f?.deliveryTotals && typeof f.deliveryTotals === "object") {
        Object.entries(f.deliveryTotals).forEach(([key, val]) => {
            const k = norm(key);
            out[k] = (out[k] || 0) + (Number(val) || 0);
        });
    }
    return out;
};

/* accepts: axios response, response body, or a plain array */
const extractBody = (res) => {
    if (Array.isArray(res)) return { data: res };
    if (res && res.data && !Array.isArray(res.data) && typeof res.data === "object" && "data" in res.data) {
        return res.data; // axios response -> body
    }
    return res || {}; // already the body
};

/* total CSS zoom applied to an element (your app zoom control) */
const getZoom = (el) => {
    let z = 1;
    let n = el;
    while (n && n.nodeType === 1) {
        const v = parseFloat(window.getComputedStyle(n).zoom);
        if (v && !isNaN(v)) z *= v;
        n = n.parentElement;
    }
    return z || 1;
};

const anchorOf = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, bottom: r.bottom, zoom: getZoom(el) };
};

/* factories of one API response -> Map(lowercase name -> { name, m }) with the metrics picked (strict aliases)
   factories whose names only differ by spaces / case are merged */
const factoryMetrics = (list, metrics) => {
    const merged = new Map();
    (Array.isArray(list) ? list : []).forEach((f) => {
        const name = String(f?.factoryName ?? "").trim();
        const key = name.toLowerCase();
        const t = buildTotals(f);
        if (!merged.has(key)) merged.set(key, { name, totals: {} });
        const entry = merged.get(key);
        Object.entries(t).forEach(([k, v]) => {
            entry.totals[k] = (entry.totals[k] || 0) + v;
        });
    });
    const out = new Map();
    merged.forEach(({ name, totals }, key) => {
        const m = {};
        Object.entries(metrics).forEach(([k, aliases]) => {
            m[k] = round2(pickMetric(totals, aliases));
        });
        out.set(key, { name, m });
    });
    return out;
};

const hasActivity = (m) => Object.values(m).some((v) => v !== 0);

/* rows of a normal order tab: drops factories with no activity on that tab */
const standardBuild = (orderKey, metrics, derive) => (ds) => {
    const rows = [];
    factoryMetrics(ds[orderKey], metrics).forEach(({ name, m }) => {
        if (!hasActivity(m)) return;
        rows.push({ factoryName: name, ...m, ...derive(m) });
    });
    return rows;
};

const sumOf = (rows, k) => round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));

/* ---------- table / header styles ---------- */
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

const headerCellStyle = {
    ...cellStyle,
    position: "sticky",
    top: 0,
    zIndex: 20,
    backgroundColor: HEADER_BG,
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "12px",
    textTransform: "uppercase",
    letterSpacing: ".4px",
    whiteSpace: "nowrap",
    padding: "9px 10px",
};

/* ===================================================================
   GENERIC TABLE BODY (used by Summary, Finish Fabric, Yarn Store, Yarn Stock Y/D tabs)
   renders <tbody> + <tfoot> like KnittingGlance / DyeingGlance / AopGlance
   kinds: text | serial | count | num | pct | stock | open (Opening Qty)
   =================================================================== */
const StaticBody = ({ rows, totals, columns, showTotal = true, onRowClick }) => {
    const renderValue = (c, r) => {
        const v = r[c.key];
        if (c.kind === "text" || c.kind === "serial") return v;
        if (c.kind === "count") return Number(v) || 0;
        if (c.kind === "pct") return pctCell(v);
        if (c.kind === "stock") return Number(v) < 0 ? `(${fmt(Math.abs(v))})` : fmt(v);
        if (c.kind === "open") {
            if (!Number(v)) return "-";
            return Number(v) < 0 ? `(${fmt(Math.abs(v))})` : fmt(v);
        }
        return Number(v) ? fmt(v) : "-"; // num: show - for zero
    };

    const styleOf = (c, r, idx) => {
        const base = { ...cellStyle, backgroundColor: idx % 2 === 1 ? "#F2F7F4" : "#ffffff" };
        if (c.kind === "text") return { ...base, textAlign: "left", fontWeight: 600 };
        if (c.kind === "stock") {
            return { ...base, backgroundColor: "#FBF0CD", fontWeight: 700, ...(Number(r[c.key]) < 0 ? { color: "#8C1D2F" } : {}) };
        }
        if (c.kind === "open") {
            return { ...base, backgroundColor: "#E0F2FE", fontWeight: 700, ...(Number(r[c.key]) < 0 ? { color: "#8C1D2F" } : {}) };
        }
        if (c.kind === "pct") return { ...base, backgroundColor: "#CEFAE5" };
        return base;
    };

    if (!rows.length) {
        return (
            <tbody>
                <tr>
                    <td colSpan={columns.length} style={{ ...cellStyle, padding: 40, color: "#6b7280", backgroundColor: "#fafafa" }}>
                        No data found.
                    </td>
                </tr>
            </tbody>
        );
    }

    const footStyle = {
        ...cellStyle,
        position: "sticky",
        bottom: 0,
        zIndex: 15,
        backgroundColor: "#E8F5E9",
        fontWeight: 700,
    };

    return (
        <>
            <tbody>
                {rows.map((r, idx) => (
                    <tr
                        key={r.id ?? `${r.factoryName}-${idx}`}
                        onClick={onRowClick ? () => onRowClick(r) : undefined}
                        title={onRowClick ? "Click to open this tab" : undefined}
                        style={onRowClick ? { cursor: "pointer" } : undefined}
                    >
                        {columns.map((c) => (
                            <td key={c.key} style={styleOf(c, r, idx)}>
                                {renderValue(c, r)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
            {showTotal && (
                <tfoot>
                    <tr>
                        {columns.map((c) => {
                            let val = "";
                            if (c.kind === "text") val = "TOTAL";
                            else if (c.kind === "serial") val = "";
                            else if (c.kind === "count") val = Number(totals[c.key]) || 0;
                            else if (c.kind === "pct") val = pctCell(totals[c.key]);
                            else if (c.kind === "stock" || c.kind === "open")
                                val = Number(totals[c.key]) < 0 ? `(${fmt(Math.abs(totals[c.key]))})` : fmt(totals[c.key]);
                            else val = fmt(totals[c.key]);
                            return (
                                <td key={c.key} style={{ ...footStyle, textAlign: c.kind === "text" ? "left" : "center" }}>
                                    {val}
                                </td>
                            );
                        })}
                    </tr>
                </tfoot>
            )}
        </>
    );
};

/* ===================================================================
   TABS
   metrics: field -> accepted API key names (lowercase, letters/digits only)

   IMPORTANT: aliases are STRICT per tab. The API returns every factory on
   every tab, and knitting / dyeing factories use similar names:
     Knitting     -> "Grey Fabric Received"
     Dyeing       -> "Grey Received", "Finish Received"
     AOP          -> "AOP Finish Fabric Rcvd"
     Yarn Dyeing  -> "Yarn Delivery For Yarn Dye", "Yarn Return From Yarn Dye",
                     "Yarn Received From Yarn Dye", "Finish Received"
   Sharing aliases between tabs double counts quantities.

   needs  = which order APIs this tab loads (/api/mis-party-stock/:orderKey)
   build  = (datasets, openingDatasets) -> rows
            openingDatasets = same shape as datasets, but calculated up to the day
            BEFORE the selected period starts (only used by the Summary tab)
   =================================================================== */
const KNIT_METRICS = {
    yarnDelivery: ["yarndelivery"],
    yarnReturn: ["yarnreturn"],
    greyReceived: ["greyfabricreceived"],
};
const DYE_METRICS = {
    greyDelivery: ["greydelivery"],
    greyReturn: ["greyreturn"],
    greyReceived: ["greyreceived"],
    finishReceived: ["finishreceived"],
};
const AOP_METRICS = {
    sentForAop: ["sentforaop"],
    returnFromAop: ["returnfromaop"],
    receivedFromAop: ["receivedfromaop"],
    finishReceived: ["aopfinishfabricrcvd", "finishreceivedfromaop", "aopfinishreceived"],
};
const YD_METRICS = {
    ydDelivery: ["yarndeliveryforyarndye"],
    ydReturn: ["yarnreturnfromyarndye"],
    ydReceived: ["yarnreceivedfromyarndye"],
    ydFinish: ["finishreceived"],
};

const deriveKnit = (m) => ({
    partyStock: round2(m.yarnDelivery - m.yarnReturn - m.greyReceived),
});
const deriveDye = (m) => ({
    processLoss: m.greyReceived ? round2(((m.greyReceived - m.finishReceived) / m.greyReceived) * 100) : 0,
    partyStock: round2(m.greyDelivery - m.greyReturn - m.greyReceived),
});
const deriveAop = (m) => ({
    partyStock: round2(m.sentForAop - m.returnFromAop - m.receivedFromAop),
});
const deriveYd = (m) => ({
    partyStock: round2(m.ydDelivery - m.ydReturn - m.ydReceived),
});
/* store stock = received + returned - issued */
const deriveStore = (m) => ({
    partyStock: round2(m.yarnReceived + m.yarnReturned - m.yarnIssued),
});

const KNITTING_TAB = {
    key: "knittingOrder",
    label: "Knitting",
    title: "Knitting Party Stock",
    fileName: "Knitting_Party_Stock",
    unit: "factories",
    Component: KnittingGlance,
    needs: ["knittingOrder"],
    sumKeys: Object.keys(KNIT_METRICS),
    derive: deriveKnit,
    build: standardBuild("knittingOrder", KNIT_METRICS, deriveKnit),
    columns: [
        { key: "serial", label: "SL", kind: "serial" },
        { key: "factoryName", label: "Factory Name", kind: "text" },
        { key: "yarnDelivery", label: "Yarn Delivery", kind: "num" },
        { key: "yarnReturn", label: "Yarn Return", kind: "num" },
        { key: "greyReceived", label: "Grey Received", kind: "num" },
        { key: "partyStock", label: "Party Stock", kind: "stock" },
    ],
};

const DYEING_TAB = {
    key: "dyeingOrder",
    label: "Dyeing",
    title: "Dyeing Party Stock",
    fileName: "Dyeing_Party_Stock",
    unit: "factories",
    Component: DyeingGlance,
    needs: ["dyeingOrder"],
    sumKeys: Object.keys(DYE_METRICS),
    derive: deriveDye,
    build: standardBuild("dyeingOrder", DYE_METRICS, deriveDye),
    columns: [
        { key: "serial", label: "SL", kind: "serial" },
        { key: "factoryName", label: "Factory Name", kind: "text" },
        { key: "greyDelivery", label: "Grey Delivery", kind: "num" },
        { key: "greyReturn", label: "Grey Return", kind: "num" },
        { key: "greyReceived", label: "Grey Received", kind: "num" },
        { key: "finishReceived", label: "Finish Received", kind: "num" },
        { key: "processLoss", label: "Process Loss", kind: "pct" },
        { key: "partyStock", label: "Party Stock", kind: "stock" },
    ],
};

const AOP_TAB = {
    key: "aopOrder",
    label: "AOP",
    title: "AOP Party Stock",
    fileName: "AOP_Party_Stock",
    unit: "factories",
    Component: AopGlance,
    needs: ["aopOrder"],
    sumKeys: Object.keys(AOP_METRICS),
    derive: deriveAop,
    build: standardBuild("aopOrder", AOP_METRICS, deriveAop),
    columns: [
        { key: "serial", label: "SL", kind: "serial" },
        { key: "factoryName", label: "Factory Name", kind: "text" },
        { key: "sentForAop", label: "Sent For AOP", kind: "num" },
        { key: "returnFromAop", label: "Return From AOP", kind: "num" },
        { key: "receivedFromAop", label: "Received From AOP", kind: "num" },
        { key: "finishReceived", label: "Finish Received From AOP", kind: "num" },
        { key: "partyStock", label: "Party Stock", kind: "stock" },
    ],
};

/* YARN STOCK (Y/D) = yarn lying with the yarn dyeing factories */
const YARN_DYE_TAB = {
    key: "yarnDyeingOrder",
    label: "Yarn Stock (Y/D)",
    title: "Yarn Stock (Y/D) - Yarn Dyeing Party Stock",
    fileName: "Yarn_Stock_YD",
    unit: "factories",
    Component: StaticBody,
    needs: ["yarnDyeingOrder"],
    sumKeys: Object.keys(YD_METRICS),
    derive: deriveYd,
    build: standardBuild("yarnDyeingOrder", YD_METRICS, deriveYd),
    columns: [
        { key: "serial", label: "SL", kind: "serial" },
        { key: "factoryName", label: "Factory Name", kind: "text" },
        { key: "ydDelivery", label: "Yarn Delivery For Yarn Dye", kind: "num" },
        { key: "ydReturn", label: "Yarn Return From Yarn Dye", kind: "num" },
        { key: "ydReceived", label: "Yarn Received From Yarn Dye", kind: "num" },
        { key: "ydFinish", label: "Finish Received", kind: "num" },
        { key: "partyStock", label: "Party Stock", kind: "stock" },
    ],
};

/* YARN STORE STOCK = yarn lying in the yarn store location */
const YARN_STORE_TAB = {
    key: "yarnStore",
    label: "Yarn Store Stock",
    title: "Yarn Store Stock",
    fileName: "Yarn_Store_Stock",
    unit: "stores",
    Component: StaticBody,
    needs: [YARN_STORE_KEY],
    sumKeys: Object.keys(YARN_STORE_METRICS),
    derive: deriveStore,
    build: standardBuild(YARN_STORE_KEY, YARN_STORE_METRICS, deriveStore),
    columns: [
        { key: "serial", label: "SL", kind: "serial" },
        { key: "factoryName", label: "Store / Location", kind: "text" },
        { key: "yarnReceived", label: "Yarn Received", kind: "num" },
        { key: "yarnIssued", label: "Yarn Issued", kind: "num" },
        { key: "yarnReturned", label: "Yarn Returned", kind: "num" },
        { key: "partyStock", label: "Store Stock", kind: "stock" },
    ],
};

/* FINISH FABRIC (factory wise) = finish fabric received INTO our garments factories
   API: /api/mis-party-stock/finishFabric  (grouped by the "To" garments factory of the challan;
   the garments factory list and the AOP rule are applied in the backend)
   Dyeing Finish Received + AOP Finish Received */
const FINISH_METRICS = {
    dyeingFinish: ["dyeingfinishreceived"],
    aopFinish: ["aopfinishreceived"],
};
const FINISH_TAB = {
    key: "finishFabric",
    label: "Finish Fabric",
    title: "Finish Fabric Stock (Garments Factory Wise)",
    fileName: "Finish_Fabric_Stock",
    unit: "factories",
    Component: StaticBody,
    needs: ["finishFabric"],
    sumKeys: Object.keys(FINISH_METRICS),
    derive: (m) => ({ totalFinish: round2(m.dyeingFinish + m.aopFinish) }),
    build: (ds) => {
        const rows = [];
        factoryMetrics(ds.finishFabric, FINISH_METRICS).forEach(({ name, m }) => {
            if (!hasActivity(m)) return;
            rows.push({ factoryName: name, ...m, totalFinish: round2(m.dyeingFinish + m.aopFinish) });
        });
        return rows.sort((x, y) => x.factoryName.toLowerCase().localeCompare(y.factoryName.toLowerCase()));
    },
    columns: [
        { key: "serial", label: "SL", kind: "serial" },
        { key: "factoryName", label: "Garments Factory", kind: "text" },
        { key: "dyeingFinish", label: "Dyeing Finish Received", kind: "num" },
        { key: "aopFinish", label: "AOP Finish Received", kind: "num" },
        { key: "totalFinish", label: "Total Finish Fabric Rcvd", kind: "stock" },
    ],
};

/* SUMMARY = Yarn Store + Yarn stock (Knitting) + Yarn stock (Y/D) + Dyeing + AOP + Finish fabric
   Opening Qty  = party stock of all transactions BEFORE the selected period
   Party Stock  = Opening Qty + (Delivery - Return - Received) of the selected period (closing)
   Yarn Store row: Delivery / Sent = Yarn Issued, Return = Yarn Returned, Received = Yarn Received */
const SUMMARY_TAB = {
    key: "summary",
    label: "Summary",
    title: "Party Stock Summary",
    fileName: "Party_Stock_Summary",
    unit: "stock types",
    Component: StaticBody,
    showTotal: false, // different stock types (yarn / fabric) are not added together
    rowTab: true, // click a row = open that tab
    needs: ["knittingOrder", "dyeingOrder", "aopOrder", "yarnDyeingOrder", YARN_STORE_KEY, "finishFabric"],
    sumKeys: ["factories", "opening", "delivery", "ret", "received", "finishReceived", "stock"],
    derive: () => ({}),
    build: (ds, openDs = {}) => {
        const k = KNITTING_TAB.build(ds);
        const d = DYEING_TAB.build(ds);
        const a = AOP_TAB.build(ds);
        const y = YARN_DYE_TAB.build(ds);
        const s = YARN_STORE_TAB.build(ds);
        const f = FINISH_TAB.build(ds);
        const finishTotal = sumOf(f, "totalFinish");

        /* opening = same calculation on the data before the period starts */
        const ok = KNITTING_TAB.build(openDs);
        const od = DYEING_TAB.build(openDs);
        const oa = AOP_TAB.build(openDs);
        const oy = YARN_DYE_TAB.build(openDs);
        const os = YARN_STORE_TAB.build(openDs);
        const of = FINISH_TAB.build(openDs);
        const openYarn = sumOf(ok, "partyStock");
        const openDye = sumOf(od, "partyStock");
        const openAop = sumOf(oa, "partyStock");
        const openYd = sumOf(oy, "partyStock");
        const openStore = sumOf(os, "partyStock");
        const openFinish = sumOf(of, "totalFinish");

        return [
            {
                id: "store", tabKey: YARN_STORE_TAB.key, label: "Yarn Store Stock", factories: s.length,
                opening: openStore,
                delivery: sumOf(s, "yarnIssued"), ret: sumOf(s, "yarnReturned"), received: sumOf(s, "yarnReceived"),
                finishReceived: 0, stock: round2(openStore + sumOf(s, "partyStock")),
            },
            {
                id: "yarn", tabKey: KNITTING_TAB.key, label: "Yarn Stock (Knitting)", factories: k.length,
                opening: openYarn,
                delivery: sumOf(k, "yarnDelivery"), ret: sumOf(k, "yarnReturn"), received: sumOf(k, "greyReceived"),
                finishReceived: 0, stock: round2(openYarn + sumOf(k, "partyStock")),
            },
            {
                id: "yd", tabKey: YARN_DYE_TAB.key, label: "Yarn Stock (Y/D)", factories: y.length,
                opening: openYd,
                delivery: sumOf(y, "ydDelivery"), ret: sumOf(y, "ydReturn"), received: sumOf(y, "ydReceived"),
                finishReceived: sumOf(y, "ydFinish"), stock: round2(openYd + sumOf(y, "partyStock")),
            },
            {
                id: "dyeing", tabKey: DYEING_TAB.key, label: "Dyeing Stock", factories: d.length,
                opening: openDye,
                delivery: sumOf(d, "greyDelivery"), ret: sumOf(d, "greyReturn"), received: sumOf(d, "greyReceived"),
                finishReceived: sumOf(d, "finishReceived"), stock: round2(openDye + sumOf(d, "partyStock")),
            },
            {
                id: "aop", tabKey: AOP_TAB.key, label: "AOP Stock", factories: a.length,
                opening: openAop,
                delivery: sumOf(a, "sentForAop"), ret: sumOf(a, "returnFromAop"), received: sumOf(a, "receivedFromAop"),
                finishReceived: sumOf(a, "finishReceived"), stock: round2(openAop + sumOf(a, "partyStock")),
            },
            {
                id: "finish", tabKey: FINISH_TAB.key, label: "Finish Fabric Stock", factories: f.length,
                opening: openFinish,
                delivery: 0, ret: 0, received: 0,
                finishReceived: finishTotal, stock: round2(openFinish + finishTotal),
            },
        ];
    },
    columns: [
        { key: "serial", label: "SL", kind: "serial" },
        { key: "label", label: "Stock Type", kind: "text" },
        { key: "factories", label: "Factories", kind: "count" },
        { key: "opening", label: "Opening Qty", kind: "open" },
        { key: "delivery", label: "Delivery / Sent", kind: "num" },
        { key: "ret", label: "Return", kind: "num" },
        { key: "received", label: "Received", kind: "num" },
        { key: "finishReceived", label: "Finish Received", kind: "num" },
        { key: "stock", label: "Party Stock", kind: "stock" },
    ],
};

const TABS = [SUMMARY_TAB, YARN_STORE_TAB, KNITTING_TAB, YARN_DYE_TAB, DYEING_TAB, AOP_TAB, FINISH_TAB];

/* ---------- filter helpers ---------- */
const textOf = (col, row) => {
    const v = row[col.key];
    if (col.kind === "text") return String(v ?? "");
    if (col.kind === "serial") return String(v);
    if (col.kind === "count") return String(Number(v) || 0);
    if (col.kind === "pct") return pctCell(v);
    return fmt(v);
};

const sortOf = (col, row) => {
    const v = row[col.key];
    return col.kind === "text" ? String(v ?? "").toLowerCase() : Number(v) || 0;
};

const matches = (row, cols, filters, skipKey) =>
    cols.every((c) => {
        if (c.key === skipKey) return true;
        const sel = filters[c.key];
        return !sel || sel.includes(textOf(c, row));
    });

/* ===================================================================
   EXCEL-STYLE COLUMN FILTER POPUP
   =================================================================== */
const FilterPopup = ({ col, options, selected, rect, sort, onSort, onApply, onClose }) => {
    const [search, setSearch] = useState("");
    const [draft, setDraft] = useState(
        () =>
            new Set(
                selected
                    ? options.filter((o) => selected.includes(o.label)).map((o) => o.label)
                    : options.map((o) => o.label)
            )
    );

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, search]);

    const allVisible = visible.length > 0 && visible.every((o) => draft.has(o.label));

    const toggleAll = () =>
        setDraft((prev) => {
            const n = new Set(prev);
            visible.forEach((o) => (allVisible ? n.delete(o.label) : n.add(o.label)));
            return n;
        });

    const toggle = (label) =>
        setDraft((prev) => {
            const n = new Set(prev);
            n.has(label) ? n.delete(label) : n.add(label);
            return n;
        });

    const apply = () => {
        if (draft.size === 0) return;
        onApply(draft.size === options.length ? null : Array.from(draft));
    };

    const isText = col.kind === "text";
    const z = rect.zoom || 1;
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    const left = Math.max(8, Math.min(rect.left / z, vw - 284));
    const top = Math.min(rect.bottom / z + 4, Math.max(8, vh - 470));

    return (
        <>
            <div
                onClick={onClose}
                style={{ position: "fixed", inset: 0, zIndex: 999, background: "transparent" }}
            />
            <div
                className="ps-popup"
                style={{ position: "fixed", left, top, zIndex: 1000 }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    className={`ps-menu-btn${sort?.key === col.key && sort.dir === "asc" ? " ps-on" : ""}`}
                    onClick={() => onSort("asc")}
                >
                    {isText ? "Sort A → Z" : "Sort Smallest → Largest"}
                </button>
                <button
                    type="button"
                    className={`ps-menu-btn${sort?.key === col.key && sort.dir === "desc" ? " ps-on" : ""}`}
                    onClick={() => onSort("desc")}
                >
                    {isText ? "Sort Z → A" : "Sort Largest → Smallest"}
                </button>
                <button
                    type="button"
                    className="ps-menu-btn"
                    disabled={!selected}
                    onClick={() => onApply(null)}
                >
                    Clear filter from “{col.label}”
                </button>

                <div style={{ height: 1, background: "#E5E7EB", margin: "6px 0" }} />

                <input
                    autoFocus
                    className="ps-search"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <div className="ps-list">
                    <label className="ps-item" style={{ fontWeight: 700 }}>
                        <input type="checkbox" checked={allVisible} onChange={toggleAll} />
                        <span>(Select All)</span>
                    </label>
                    {visible.map((o) => (
                        <label key={o.label} className="ps-item">
                            <input
                                type="checkbox"
                                checked={draft.has(o.label)}
                                onChange={() => toggle(o.label)}
                            />
                            <span>{o.label}</span>
                        </label>
                    ))}
                    {!visible.length && (
                        <div style={{ padding: 10, color: "#9CA3AF", fontSize: 12 }}>No matches</div>
                    )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                    <button type="button" className="ps-btn ps-btn-ok" onClick={apply} disabled={draft.size === 0}>
                        OK
                    </button>
                    <button type="button" className="ps-btn ps-btn-cancel" onClick={onClose}>
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
};

/* ===================================================================
   MONTH PICKER (multi select)
   options: [{ key: "2026-09", label: "Sep'26" }]   selected: ["2026-09"]
   empty selected = all months
   =================================================================== */
const MonthPicker = ({ options, selected, onApply }) => {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState(null);
    const [draft, setDraft] = useState(new Set());

    const sorted = useMemo(
        () => [...options].sort((a, b) => b.key.localeCompare(a.key)),
        [options]
    );

    const label = !selected.length
        ? "All Months"
        : selected.length === 1
            ? options.find((o) => o.key === selected[0])?.label || selected[0]
            : `${selected.length} Months`;

    const openMenu = (e) => {
        setAnchor(anchorOf(e.currentTarget));
        setDraft(new Set(selected.length ? selected : sorted.map((o) => o.key)));
        setOpen(true);
    };

    const allChecked = sorted.length > 0 && sorted.every((o) => draft.has(o.key));

    const toggleAll = () => setDraft(allChecked ? new Set() : new Set(sorted.map((o) => o.key)));

    const toggle = (k) =>
        setDraft((prev) => {
            const n = new Set(prev);
            n.has(k) ? n.delete(k) : n.add(k);
            return n;
        });

    const apply = () => {
        if (draft.size === 0) return;
        onApply(draft.size === sorted.length ? [] : Array.from(draft).sort());
        setOpen(false);
    };

    const z = anchor?.zoom || 1;
    const left = anchor ? Math.max(8, Math.min(anchor.left / z, window.innerWidth / z - 250)) : 0;
    const top = anchor ? anchor.bottom / z + 4 : 0;

    return (
        <>
            <button
                type="button"
                className={`ps-btn ps-btn-light${selected.length ? " ps-btn-active" : ""}`}
                disabled={!sorted.length}
                onClick={openMenu}
                title={sorted.length ? "Filter by month" : "No months available"}
            >
                Months: {label} ▾
            </button>

            {open && (
                <>
                    <div
                        onClick={() => setOpen(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 999, background: "transparent" }}
                    />
                    <div
                        className="ps-popup"
                        style={{ position: "fixed", left, top, zIndex: 1000, width: 230 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="ps-list" style={{ marginTop: 0, maxHeight: 280 }}>
                            <label className="ps-item" style={{ fontWeight: 700 }}>
                                <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                                <span>(Select All)</span>
                            </label>
                            {sorted.map((o) => (
                                <label key={o.key} className="ps-item">
                                    <input
                                        type="checkbox"
                                        checked={draft.has(o.key)}
                                        onChange={() => toggle(o.key)}
                                    />
                                    <span>{o.label}</span>
                                </label>
                            ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                            <button type="button" className="ps-btn ps-btn-ok" onClick={apply} disabled={draft.size === 0}>
                                OK
                            </button>
                            <button
                                type="button"
                                className="ps-btn ps-btn-cancel"
                                onClick={() => {
                                    onApply([]);
                                    setOpen(false);
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
};

/* ===================================================================
   PARENT
   =================================================================== */
const PartyStockGlance = () => {
    const [activeKey, setActiveKey] = useState(TABS[0].key); // Summary tab first
    const [datasets, setDatasets] = useState({}); // { knittingOrder: [...], dyeingOrder: [...], ... }
    const [openingDatasets, setOpeningDatasets] = useState({}); // same shape, data BEFORE the selected period (Summary only)
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [warning, setWarning] = useState(""); // Summary: an optional location (Yarn Store) failed to load
    const [filters, setFilters] = useState({});
    const [sort, setSort] = useState(null);
    const [openFilter, setOpenFilter] = useState(null); // { key, rect }
    const [exporting, setExporting] = useState(false);

    /* date / month filter (sent to the API, calculated by challan date) */
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [selMonths, setSelMonths] = useState([]); // ["2026-09", ...]
    const [monthOptions, setMonthOptions] = useState([]); // [{ key, label }]

    const reqId = useRef(0);
    const tableWrapRef = useRef(null);
    const [tableHeight, setTableHeight] = useState(null);

    const { fetchData } = useFetchData();
    const fetchRef = useRef(fetchData);
    fetchRef.current = fetchData; // always latest, never triggers re-fetch

    const cfg = useMemo(() => TABS.find((o) => o.key === activeKey) || TABS[0], [activeKey]);
    const { columns, Component } = cfg;
    const showTotal = cfg.showTotal !== false;

    const monthsKey = selMonths.join(",");
    const dateInvalid = !!(dateFrom && dateTo && dateFrom > dateTo);

    /* ---------------- OPENING DATE ----------------
       period start = earliest of (From date, first day of the earliest selected month)
       opening data = everything up to the day BEFORE the period start
       no From date / no month selected = no opening (everything counts from the beginning) */
    const periodStart = useMemo(() => {
        const c = [];
        if (dateFrom) c.push(dateFrom);
        if (selMonths.length) c.push(`${[...selMonths].sort()[0]}-01`);
        return c.length ? c.sort()[0] : "";
    }, [dateFrom, selMonths]);

    const openingTo = periodStart ? prevDay(periodStart) : "";

    /* ---------------- table height: fill the screen below the cards ---------------- */
    const measure = useCallback(() => {
        const el = tableWrapRef.current;
        if (!el) return;
        const zoom = getZoom(el); // compensates the ERP zoom control
        const top = el.getBoundingClientRect().top + window.scrollY;
        const avail = (window.innerHeight + window.scrollY - top) / zoom - 14;
        const h = Math.max(240, Math.floor(avail));
        setTableHeight((prev) => (prev !== null && Math.abs(prev - h) < 2 ? prev : h));
    }, []);

    useLayoutEffect(() => {
        measure();
    });

    useEffect(() => {
        window.addEventListener("resize", measure);
        let ro;
        if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(measure);
            ro.observe(document.body);
            ro.observe(document.documentElement);
        }
        return () => {
            window.removeEventListener("resize", measure);
            if (ro) ro.disconnect();
        };
    }, [measure]);

    /* ---------------- API: /api/mis-party-stock/:orderType?fromDate&toDate&months ----------------
       Summary loads knitting + dyeing + aop + yarn dyeing + yarn store, Finish Fabric loads dyeing + aop,
       other tabs load their own order.
       Summary also loads the same orders with toDate = (period start - 1 day) for the Opening Qty. */
    const load = useCallback(async () => {
        if (dateFrom && dateTo && dateFrom > dateTo) return; // invalid range, wait for the user

        const tab = TABS.find((t) => t.key === activeKey) || TABS[0];
        const id = ++reqId.current;
        setLoading(true);
        setError("");
        setWarning("");
        setDatasets({});
        setOpeningDatasets({});
        try {
            const params = new URLSearchParams();
            if (dateFrom) params.set("fromDate", dateFrom);
            if (dateTo) params.set("toDate", dateTo);
            if (monthsKey) params.set("months", monthsKey);
            const qs = params.toString();

            /* opening query: only toDate, no fromDate and no months = all earlier transactions */
            const needOpening = tab.key === "summary" && !!openingTo;
            const openQs = needOpening ? `?toDate=${openingTo}` : "";

            /* one request; on the Summary tab an optional location that fails gives an empty list + a warning */
            const warns = [];
            const tolerant = tab.key === "summary";
            const fetchOne = async (orderKey, query) => {
                try {
                    const res = await fetchRef.current(`/api/mis-party-stock/${orderKey}${query}`);
                    const body = extractBody(res);
                    if (body.success === false || (body.type && body.type !== "success")) {
                        throw new Error(body.message || "API returned an error");
                    }
                    return body;
                } catch (e) {
                    if (tolerant && OPTIONAL_KEYS.has(orderKey)) {
                        warns.push(`${orderKey}: ${e?.response?.data?.message || e?.message || "failed to load"}`);
                        return { data: [] };
                    }
                    throw e;
                }
            };

            const [bodies, openBodies] = await Promise.all([
                Promise.all(tab.needs.map((orderKey) => fetchOne(orderKey, qs ? `?${qs}` : ""))),
                needOpening
                    ? Promise.all(tab.needs.map((orderKey) => fetchOne(orderKey, openQs)))
                    : Promise.resolve([]),
            ]);

            const next = {};
            const monthMap = new Map();
            tab.needs.forEach((orderKey, i) => {
                const body = bodies[i];
                next[orderKey] = Array.isArray(body.data) ? body.data : [];
                if (Array.isArray(body.months)) body.months.forEach((mo) => monthMap.set(mo.key, mo));
            });

            const nextOpen = {};
            if (needOpening) {
                tab.needs.forEach((orderKey, i) => {
                    nextOpen[orderKey] = Array.isArray(openBodies[i]?.data) ? openBodies[i].data : [];
                });
            }

            if (id !== reqId.current) return;
            setDatasets(next);
            setOpeningDatasets(nextOpen);
            setWarning(Array.from(new Set(warns)).join("  |  "));
            if (monthMap.size) setMonthOptions(Array.from(monthMap.values()));
        } catch (e) {
            if (id !== reqId.current) return;
            setError(e?.response?.data?.message || e?.message || "Failed to load data");
        } finally {
            if (id === reqId.current) setLoading(false);
        }
    }, [activeKey, dateFrom, dateTo, monthsKey, openingTo]);

    /* switching tab resets column filters (date / month filters stay) */
    useEffect(() => {
        setFilters({});
        setSort(null);
        setOpenFilter(null);
    }, [activeKey]);

    /* reload on tab / date / month change; column filters are kept */
    useEffect(() => {
        load();
    }, [load]);

    /* ---------------- rows (built by the active tab, then numbered) ---------------- */
    const allRows = useMemo(
        () => cfg.build(datasets, openingDatasets).map((r, i) => ({ serial: i + 1, ...r })),
        [datasets, openingDatasets, cfg]
    );

    const filteredRows = useMemo(() => {
        const rows = allRows.filter((r) => matches(r, columns, filters, null));
        if (!sort) return rows;
        const col = columns.find((c) => c.key === sort.key);
        if (!col) return rows;
        const dir = sort.dir === "asc" ? 1 : -1;
        return [...rows].sort((a, b) => {
            const x = sortOf(col, a);
            const y = sortOf(col, b);
            if (typeof x === "string") return x.localeCompare(y) * dir;
            return (x - y) * dir;
        });
    }, [allRows, columns, filters, sort]);

    /* ---------------- totals (footer + cards, filtered rows only) ---------------- */
    const totals = useMemo(() => {
        const m = {};
        cfg.sumKeys.forEach((k) => {
            m[k] = round2(filteredRows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
        });
        return { ...m, ...cfg.derive(m) };
    }, [filteredRows, cfg]);

    const cards = useMemo(() => {
        if (cfg.key === "summary") {
            return filteredRows.map((r) => ({ key: r.id, label: r.label, value: r.stock, stock: true }));
        }
        return columns
            .filter((c) => c.kind === "num" || c.kind === "stock")
            .map((c) => ({ key: c.key, label: c.label, value: totals[c.key], stock: c.kind === "stock" }));
    }, [cfg, columns, filteredRows, totals]);

    /* ---------------- filter options (cascading like Excel) ---------------- */
    const popupOptions = useMemo(() => {
        if (!openFilter) return [];
        const col = columns.find((c) => c.key === openFilter.key);
        if (!col) return [];
        const map = new Map();
        allRows
            .filter((r) => matches(r, columns, filters, col.key))
            .forEach((r) => map.set(textOf(col, r), sortOf(col, r)));
        return Array.from(map, ([label, sv]) => ({ label, sv })).sort((a, b) =>
            typeof a.sv === "string" ? a.sv.localeCompare(b.sv) : a.sv - b.sv
        );
    }, [openFilter, allRows, columns, filters]);

    const applyFilter = (key, arr) => {
        setFilters((prev) => {
            const n = { ...prev };
            if (arr) n[key] = arr;
            else delete n[key];
            return n;
        });
        setOpenFilter(null);
    };

    const activeCount = Object.keys(filters).length;
    const hasDateFilter = !!(dateFrom || dateTo || selMonths.length);

    const monthLabels = selMonths
        .map((k) => monthOptions.find((o) => o.key === k)?.label || k)
        .join(", ");

    const periodText =
        dateFrom || dateTo
            ? `${dateFrom ? fmtYmd(dateFrom) : "Start"} to ${dateTo ? fmtYmd(dateTo) : "End"}`
            : "";

    const openingText = cfg.key === "summary" && openingTo ? `Opening Qty = stock up to ${fmtYmd(openingTo)}` : "";

    const clearAll = () => {
        setFilters({});
        setSort(null);
        setDateFrom("");
        setDateTo("");
        setSelMonths([]);
    };

    /* ---------------- export XLSX ---------------- */
    const handleExport = async () => {
        setExporting(true);
        try {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(cfg.title.slice(0, 31), {
                views: [{ state: "frozen", ySplit: 4 }],
            });
            const n = columns.length;
            const thin = { style: "thin", color: { argb: "FFB9C2C7" } };
            const border = { top: thin, left: thin, bottom: thin, right: thin };
            const center = { vertical: "middle", horizontal: "center" };

            ws.columns = columns.map((c) => ({
                width: c.kind === "text" ? 34 : c.kind === "serial" ? 7 : 22,
            }));

            ws.mergeCells(1, 1, 1, n);
            const t = ws.getCell(1, 1);
            t.value = cfg.title;
            t.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
            t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E6B3A" } };
            t.alignment = center;
            ws.getRow(1).height = 28;

            const filterText = Object.keys(filters)
                .map((k) => columns.find((c) => c.key === k)?.label)
                .filter(Boolean)
                .join(", ");
            ws.mergeCells(2, 1, 2, n);
            const s = ws.getCell(2, 1);
            s.value =
                `Generated: ${new Date().toLocaleString("en-GB")}   |   ` +
                `${cfg.unit === "stock types" ? "Stock types" : cfg.unit === "stores" ? "Stores" : "Factories"}: ${filteredRows.length} of ${allRows.length}` +
                (periodText ? `   |   Period (challan date): ${periodText}` : "") +
                (monthLabels ? `   |   Months: ${monthLabels}` : "") +
                (openingText ? `   |   ${openingText}` : "") +
                (filterText ? `   |   Filtered by: ${filterText}` : "");
            s.font = { italic: true, size: 10, color: { argb: "FF374151" } };
            s.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
            ws.getRow(2).height = 30;
            ws.getRow(3).height = 6;

            const hr = ws.getRow(4);
            columns.forEach((c, i) => {
                const cell = hr.getCell(i + 1);
                cell.value = c.label;
                cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E6B3A" } };
                cell.alignment = { ...center, wrapText: true };
                cell.border = border;
            });
            hr.height = 36;

            const numFmt = (c) =>
                c.kind === "stock" || c.kind === "open"
                    ? "#,##0.00;[Red](#,##0.00);0.00"
                    : c.kind === "pct"
                        ? "0.00%"
                        : c.kind === "serial" || c.kind === "count"
                            ? "0"
                            : "#,##0.00";

            const styleCell = (cell, c, bg, bold) => {
                cell.border = border;
                cell.alignment =
                    c.kind === "text" ? { vertical: "middle", horizontal: "left" } : center;
                cell.font = { bold: !!bold || c.kind === "text", size: 11 };
                if (c.kind !== "text") cell.numFmt = numFmt(c);
                let fill = bg;
                if (!bold && c.kind === "stock") fill = "FFFBF0CD";
                if (!bold && c.kind === "open") fill = "FFE0F2FE";
                if (!bold && c.kind === "pct") fill = "FFCEFAE5";
                if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
            };

            filteredRows.forEach((r, ri) => {
                const row = ws.getRow(5 + ri);
                const bg = ri % 2 === 1 ? "FFF2F7F4" : "FFFFFFFF";
                columns.forEach((c, ci) => {
                    const cell = row.getCell(ci + 1);
                    const v = r[c.key];
                    cell.value = c.kind === "pct" ? v / 100 : v;
                    styleCell(cell, c, bg, false);
                });
            });

            if (showTotal) {
                const fr = ws.getRow(5 + filteredRows.length);
                columns.forEach((c, ci) => {
                    const cell = fr.getCell(ci + 1);
                    if (c.kind === "serial") cell.value = "";
                    else if (c.kind === "text") cell.value = "TOTAL";
                    else cell.value = c.kind === "pct" ? totals[c.key] / 100 : totals[c.key];
                    styleCell(cell, c, "FFE8F5E9", true);
                });
                fr.height = 22;
            }

            ws.autoFilter = {
                from: { row: 4, column: 1 },
                to: { row: 4 + filteredRows.length, column: n },
            };

            const buf = await wb.xlsx.writeBuffer();
            const blob = new Blob([buf], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${cfg.fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Export failed", e);
            alert("Excel export failed");
        } finally {
            setExporting(false);
        }
    };

    /* ---------------- render ---------------- */
    const openCol = openFilter ? columns.find((c) => c.key === openFilter.key) : null;
    const countLabel = cfg.unit === "stores" ? "Stores" : "Factories";

    return (
        <div style={{ padding: 16, fontFamily: "inherit" }}>
            <style>{`
                .ps-btn { border: 1px solid transparent; border-radius: 8px; padding: 7px 18px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; line-height: 1.2; transition: background .15s ease; }
                .ps-btn:disabled { opacity: .5; cursor: not-allowed; }
                .ps-btn-ok { background: #16A34A; color: #fff; border-color: #15803D; }
                .ps-btn-ok:hover:not(:disabled) { background: #15803D; }
                .ps-btn-cancel { background: #fff; color: #B91C1C; border-color: #E5A9B4; }
                .ps-btn-cancel:hover { background: #FCEDEF; }
                .ps-btn-light { background: #fff; color: #1F2937; border-color: #b9c2c7; }
                .ps-btn-light:hover:not(:disabled) { background: #F1F5F9; }
                .ps-btn-active { background: #E8F5E9; border-color: #16A34A; color: #14532D; }

                .ps-date-wrap { display: flex; align-items: center; gap: 6px; }
                .ps-date-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #6B7280; }
                .ps-date { border: 1px solid #b9c2c7; border-radius: 8px; padding: 6px 10px; font-size: 13px; font-family: inherit; color: #1F2937; background: #fff; outline: none; }
                .ps-date:focus { border-color: #2563EB; box-shadow: 0 0 0 2px rgba(37,99,235,.15); }
                .ps-date.ps-date-on { border-color: #16A34A; background: #E8F5E9; }
                .ps-date.ps-date-bad { border-color: #B91C1C; background: #FCEDEF; }

                .ps-tab { border: 1px solid #b9c2c7; background: #fff; color: #1F2937; border-radius: 8px; padding: 7px 20px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background .15s ease; }
                .ps-tab:hover { background: #E8F5E9; }
                .ps-tab.ps-tab-on { background: #16A34A; color: #fff; border-color: #15803D; }

                .ps-filter-btn { border: none; background: rgba(255,255,255,.15); color: #fff; border-radius: 4px; padding: 3px 5px; margin-left: 6px; cursor: pointer; display: inline-flex; align-items: center; vertical-align: middle; }
                .ps-filter-btn:hover { background: rgba(255,255,255,.3); }
                .ps-filter-btn.ps-active { background: #FACC15; color: #1F2937; }

                .ps-popup { width: 268px; background: #fff; border: 1px solid #b9c2c7; border-radius: 10px; box-shadow: 0 12px 30px rgba(15,23,42,.25); padding: 8px; font-size: 13px; color: #1F2937; text-transform: none; letter-spacing: 0; font-weight: 400; }
                .ps-menu-btn { display: block; width: 100%; text-align: left; border: none; background: transparent; padding: 6px 8px; border-radius: 6px; font-size: 13px; cursor: pointer; font-family: inherit; color: #1F2937; }
                .ps-menu-btn:hover:not(:disabled) { background: #E8F5E9; }
                .ps-menu-btn:disabled { color: #9CA3AF; cursor: not-allowed; }
                .ps-menu-btn.ps-on { background: #DCEFD9; font-weight: 700; }
                .ps-search { width: 100%; box-sizing: border-box; border: 1px solid #93C5FD; border-radius: 6px; padding: 6px 10px; font-size: 13px; outline: none; font-family: inherit; }
                .ps-search:focus { border-color: #2563EB; box-shadow: 0 0 0 2px rgba(37,99,235,.15); }
                .ps-list { max-height: 230px; overflow-y: auto; border: 1px solid #E5E7EB; border-radius: 6px; margin-top: 8px; padding: 4px 0; }
                .ps-item { display: flex; align-items: center; gap: 8px; padding: 4px 10px; cursor: pointer; }
                .ps-item:hover { background: #F2F7F4; }
                .ps-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

                .ps-card { background: #fff; border: 1px solid #b9c2c7; border-left: 5px solid #16A34A; border-radius: 10px; padding: 10px 16px; min-width: 170px; flex: 1 1 170px; box-shadow: 0 1px 3px rgba(15,23,42,.06); }
                .ps-card.ps-card-stock { border-left-color: #EAB308; background: #FFFBEB; }
                .ps-card.ps-card-count { border-left-color: #2563EB; }
                .ps-card-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #6B7280; }
                .ps-card-value { font-size: 20px; font-weight: 700; color: #1F2937; font-variant-numeric: tabular-nums; margin-top: 2px; }
            `}</style>

            {/* ---------- tabs: Summary / Yarn Store / Knitting / Yarn (Y/D) / Dyeing / AOP / Finish Fabric ---------- */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {TABS.map((o) => (
                    <button
                        key={o.key}
                        type="button"
                        className={`ps-tab${o.key === activeKey ? " ps-tab-on" : ""}`}
                        onClick={() => setActiveKey(o.key)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>

            {/* ---------- toolbar ---------- */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    padding: "12px 16px",
                    backgroundColor: "#F1F5F9",
                    border: `1px solid ${BORDER_COLOR}`,
                    borderRadius: 10,
                    marginBottom: 12,
                }}
            >
                <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1F2937" }}>{cfg.title}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                        Showing {filteredRows.length} of {allRows.length} {cfg.unit}
                        {activeCount > 0 && ` • ${activeCount} filter${activeCount > 1 ? "s" : ""} active`}
                        {periodText && ` • Period: ${periodText}`}
                        {monthLabels && ` • Months: ${monthLabels}`}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                        Date filter works on challan date
                        {cfg.rowTab && " • Click a row to open that tab"}
                        {openingText && ` • ${openingText}`}
                    </div>
                    {dateInvalid && (
                        <div style={{ fontSize: 12, color: "#B91C1C", fontWeight: 600 }}>
                            From date is after To date
                        </div>
                    )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div className="ps-date-wrap">
                        <span className="ps-date-label">From</span>
                        <input
                            type="date"
                            className={`ps-date${dateInvalid ? " ps-date-bad" : dateFrom ? " ps-date-on" : ""}`}
                            value={dateFrom}
                            max={dateTo || undefined}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </div>
                    <div className="ps-date-wrap">
                        <span className="ps-date-label">To</span>
                        <input
                            type="date"
                            className={`ps-date${dateInvalid ? " ps-date-bad" : dateTo ? " ps-date-on" : ""}`}
                            value={dateTo}
                            min={dateFrom || undefined}
                            onChange={(e) => setDateTo(e.target.value)}
                        />
                    </div>

                    <MonthPicker options={monthOptions} selected={selMonths} onApply={setSelMonths} />

                    <button
                        type="button"
                        className="ps-btn ps-btn-light"
                        onClick={clearAll}
                        disabled={!activeCount && !sort && !hasDateFilter}
                    >
                        Clear Filters
                    </button>
                    <button type="button" className="ps-btn ps-btn-light" onClick={load} disabled={loading}>
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                    <button
                        type="button"
                        className="ps-btn ps-btn-ok"
                        onClick={handleExport}
                        disabled={exporting || loading || !filteredRows.length}
                    >
                        {exporting ? "Exporting..." : "Export Excel"}
                    </button>
                </div>
            </div>

            {/* ---------- warning: an optional location could not be loaded (Summary still shows the rest) ---------- */}
            {warning && (
                <div
                    style={{
                        marginBottom: 12,
                        padding: "10px 16px",
                        background: "#FFFBEB",
                        border: "1px solid #FDE68A",
                        borderRadius: 10,
                        fontSize: 13,
                        color: "#92400E",
                        fontWeight: 600,
                    }}
                >
                    Some data could not be loaded and is shown as empty: {warning}
                </div>
            )}

            {/* ---------- cards ---------- */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                {cfg.key !== "summary" && (
                    <div className="ps-card ps-card-count">
                        <div className="ps-card-label">{countLabel}</div>
                        <div className="ps-card-value">{filteredRows.length}</div>
                    </div>
                )}
                {cards.map((c) => (
                    <div key={c.key} className={`ps-card${c.stock ? " ps-card-stock" : ""}`}>
                        <div className="ps-card-label">{c.label}</div>
                        <div
                            className="ps-card-value"
                            style={c.stock && c.value < 0 ? { color: "#8C1D2F" } : undefined}
                        >
                            {c.value < 0 ? `(${fmt(Math.abs(c.value))})` : fmt(c.value)}
                        </div>
                    </div>
                ))}
            </div>

            {/* ---------- table (height fills the screen) ---------- */}
            <div
                ref={tableWrapRef}
                style={{
                    overflow: "auto",
                    height: tableHeight ?? 420,
                    border: `1px solid ${BORDER_COLOR}`,
                    borderRadius: 10,
                    background: "#fff",
                }}
            >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr>
                            {columns.map((c) => {
                                const active = !!filters[c.key];
                                const sorted = sort?.key === c.key;
                                return (
                                    <th
                                        key={c.key}
                                        style={{
                                            ...headerCellStyle,
                                            textAlign: c.kind === "text" ? "left" : "center",
                                            minWidth: c.kind === "text" ? 220 : c.kind === "serial" ? 70 : 130,
                                        }}
                                    >
                                        {c.label}
                                        {sorted && (
                                            <span style={{ marginLeft: 4 }}>{sort.dir === "asc" ? "▲" : "▼"}</span>
                                        )}
                                        <button
                                            type="button"
                                            className={`ps-filter-btn${active ? " ps-active" : ""}`}
                                            title="Filter"
                                            onClick={(e) =>
                                                setOpenFilter({
                                                    key: c.key,
                                                    rect: anchorOf(e.currentTarget),
                                                })
                                            }
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M3 4h18l-7 8v6l-4 2v-8z" />
                                            </svg>
                                        </button>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>

                    {loading ? (
                        <tbody>
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    style={{ ...cellStyle, padding: 40, color: "#6b7280", backgroundColor: "#fafafa" }}
                                >
                                    Loading...
                                </td>
                            </tr>
                        </tbody>
                    ) : error ? (
                        <tbody>
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    style={{ ...cellStyle, padding: 40, color: "#B91C1C", backgroundColor: "#FCEDEF" }}
                                >
                                    {error}
                                </td>
                            </tr>
                        </tbody>
                    ) : (
                        /* child renders <tbody> + <tfoot> (or the empty state) */
                        <Component
                            rows={filteredRows}
                            totals={totals}
                            columns={columns}
                            showTotal={showTotal}
                            onRowClick={cfg.rowTab ? (r) => setActiveKey(r.tabKey) : undefined}
                        />
                    )}
                </table>
            </div>

            {/* ---------- column filter popup ---------- */}
            {openFilter && openCol && (
                <FilterPopup
                    key={openFilter.key}
                    col={openCol}
                    options={popupOptions}
                    selected={filters[openFilter.key]}
                    rect={openFilter.rect}
                    sort={sort}
                    onSort={(dir) => {
                        setSort({ key: openFilter.key, dir });
                        setOpenFilter(null);
                    }}
                    onApply={(arr) => applyFilter(openFilter.key, arr)}
                    onClose={() => setOpenFilter(null)}
                />
            )}
        </div>
    );
};

export default PartyStockGlance;