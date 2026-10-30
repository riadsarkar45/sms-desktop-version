import React, { useState, useMemo, useEffect } from "react";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

const OBJECT_NAME = "styleRequirement";
const BLANK = "(blank)";
const MAX_ROWS = 5000;
const MAX_OPTIONS_SHOWN = 300;

const AREA_LABELS = { filters: "Filters", columns: "Columns", rows: "Rows", values: "Σ Values" };
const AGG_LABELS = { sum: "Sum", count: "Count", avg: "Average", min: "Min", max: "Max" };
const MEASURE_AGGS = ["sum", "count", "avg", "min", "max"];
const DIMENSION_AGGS = ["count"];
const VALUE_OPS = [">", ">=", "<", "<=", "=", "≠"];

let uidCounter = 0;
const newUid = () => `v${Date.now().toString(36)}${uidCounter++}`;

const keyOf = (v) => (v === null || v === undefined || v === "" ? BLANK : String(v));

const compareKeys = (a, b) => {
    if (a === b) return 0;
    if (a === BLANK) return 1;
    if (b === BLANK) return -1;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
};

const compareTuples = (a, b, fields, sorts) => {
    for (let i = 0; i < fields.length; i++) {
        const c = compareKeys(a[i], b[i]);
        if (c !== 0) {
            if (a[i] === BLANK || b[i] === BLANK) return c;
            return sorts[fields[i]] === "desc" ? -c : c;
        }
    }
    return 0;
};

const samePrefix = (a, b, level) => {
    for (let i = 0; i <= level; i++) if (a[i] !== b[i]) return false;
    return true;
};

const uniqueOptions = (records, field) => {
    const set = new Set();
    records.forEach((r) => set.add(keyOf(r[field])));
    return [...set].sort(compareKeys);
};

const fmtNumber = (n) => n === null || n === undefined ? "" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const getDedupeKey = (rec, spec, meta) => {
    if (!meta || !spec.field) return null;
    const dedupeLevel = meta.dedupeLevel || meta.level;
    const entityId = rec._ids?.[dedupeLevel];
    if (entityId === null || entityId === undefined) return null;
    return `${spec.field}:${dedupeLevel}:${entityId}`;
};

const newAcc = () => ({ sum: 0, count: 0, min: Infinity, max: -Infinity, seen: new Set() });

const addToAcc = (acc, rec, spec, meta) => {
    const raw = rec[spec.field];
    if (raw === null || raw === undefined || raw === "") return;

    const dedupeKey = getDedupeKey(rec, spec, meta);
    if (dedupeKey !== null) {
        if (acc.seen.has(dedupeKey)) return;
        acc.seen.add(dedupeKey);
    }

    if (spec.agg === "count") {
        acc.count += 1;
        return;
    }

    const n = Number(raw);
    if (Number.isNaN(n)) return;

    acc.sum += n;
    acc.count += 1;
    if (n < acc.min) acc.min = n;
    if (n > acc.max) acc.max = n;
};

const finalize = (acc, agg) => {
    if (!acc || acc.count === 0) return null;
    switch (agg) {
        case "sum": return acc.sum;
        case "count": return acc.count;
        case "avg": return acc.sum / acc.count;
        case "min": return acc.min === Infinity ? null : acc.min;
        case "max": return acc.max === -Infinity ? null : acc.max;
        default: return null;
    }
};

const passesValueFilter = (val, f) => {
    if (!f || f.num === "" || f.num === undefined) return true;
    const n = Number(f.num);
    if (Number.isNaN(n)) return true;
    if (val === null) return false;
    switch (f.op) {
        case ">": return val > n;
        case ">=": return val >= n;
        case "<": return val < n;
        case "<=": return val <= n;
        case "=": return val === n;
        case "≠": return val !== n;
        default: return true;
    }
};

// ENHANCED: Now supports reordering within the same area
const applyDrop = (prev, payload, target, index, meta) => {
    const { key, source, uid } = payload;
    if (!meta) return prev;
    if (meta.type === "measure" && target !== "values") return prev;

    const next = { filters: [...prev.filters], columns: [...prev.columns], rows: [...prev.rows], values: [...prev.values] };
    let moved = null;
    let origIdx = -1;

    // Remove from source
    if (source === "values") {
        origIdx = next.values.findIndex((v) => v.uid === uid);
        if (origIdx >= 0) [moved] = next.values.splice(origIdx, 1);
    } else if (source && source !== "list") {
        origIdx = next[source].indexOf(key);
        next[source] = next[source].filter((k) => k !== key);
    }

    // Insert at target
    if (target === "values") {
        const item = moved || { uid: newUid(), field: key, agg: meta.type === "measure" ? "sum" : "count" };
        let at = index === null || index === undefined ? next.values.length : index;
        if (source === "values" && origIdx >= 0 && origIdx < at) at -= 1;
        next.values.splice(Math.max(0, Math.min(at, next.values.length)), 0, item);
    } else {
        ["filters", "columns", "rows"].forEach((a) => { next[a] = next[a].filter((k) => k !== key); });
        let at = index === null || index === undefined ? next[target].length : index;
        if (source === target && origIdx >= 0 && origIdx < at) at -= 1;
        next[target].splice(Math.max(0, Math.min(at, next[target].length)), 0, key);
    }
    return next;
};

const buildPivot = ({ records, config, fieldMap, filters, valueFilters, sorts }) => {
    const rowFields = config.rows;
    const values = config.values;
    const colFields = values.length ? config.columns : [];

    const allowed = Object.entries(filters).map(([k, arr]) => [k, new Set(arr)]);
    const filtered = records.filter((rec) => allowed.every(([k, set]) => set.has(keyOf(rec[k]))));

    const aggregate = (recs) => {
        const rowMap = new Map();
        const colMap = new Map();
        const colTotals = new Map();
        const grand = values.map(newAcc);

        recs.forEach((rec) => {
            const rowTuple = rowFields.map((f) => keyOf(rec[f]));
            const rk = JSON.stringify(rowTuple);

            let entry = rowMap.get(rk);
            if (!entry) {
                entry = { key: rk, tuple: rowTuple, cells: new Map(), total: values.map(newAcc) };
                rowMap.set(rk, entry);
            }

            if (!values.length) return;

            const colTuple = colFields.map((f) => keyOf(rec[f]));
            const ck = JSON.stringify(colTuple);

            if (!colMap.has(ck)) {
                colMap.set(ck, colTuple);
                colTotals.set(ck, values.map(newAcc));
            }

            let cell = entry.cells.get(ck);
            if (!cell) {
                cell = values.map(newAcc);
                entry.cells.set(ck, cell);
            }

            const colTotal = colTotals.get(ck);

            values.forEach((v, i) => {
                const meta = fieldMap[v.field];
                addToAcc(cell[i], rec, v, meta);
                addToAcc(entry.total[i], rec, v, meta);
                addToAcc(colTotal[i], rec, v, meta);
                addToAcc(grand[i], rec, v, meta);
            });
        });

        return { rowMap, colMap, colTotals, grand };
    };

    let agg = aggregate(filtered);

    const activeValueFilters = values.map((v, i) => ({ v, i, f: valueFilters[v.uid] })).filter(({ f }) => f && f.num !== "" && f.num !== undefined);

    if (activeValueFilters.length && rowFields.length) {
        const keep = new Set();
        agg.rowMap.forEach((entry, key) => {
            const ok = activeValueFilters.every(({ v, i, f }) => passesValueFilter(finalize(entry.total[i], v.agg), f));
            if (ok) keep.add(key);
        });
        agg = aggregate(filtered.filter((rec) => keep.has(JSON.stringify(rowFields.map((f) => keyOf(rec[f]))))));
    }

    let rowList = [...agg.rowMap.values()].sort((a, b) => compareTuples(a.tuple, b.tuple, rowFields, sorts));
    const truncated = rowList.length > MAX_ROWS;
    if (truncated) rowList = rowList.slice(0, MAX_ROWS);

    const colList = colFields.length ? [...agg.colMap.values()].sort((a, b) => compareTuples(a, b, colFields, sorts)) : [[]];
    const colKeys = colList.map((t) => JSON.stringify(t));

    const n = rowList.length;
    const rowSpans = rowList.map(() => Array(rowFields.length).fill(1));
    for (let l = 0; l < rowFields.length; l++) {
        let i = 0;
        while (i < n) {
            let j = i + 1;
            while (j < n && samePrefix(rowList[i].tuple, rowList[j].tuple, l)) j++;
            rowSpans[i][l] = j - i;
            for (let k = i + 1; k < j; k++) rowSpans[k][l] = 0;
            i = j;
        }
    }

    return { rowFields, colFields, values, rowList, colList, colKeys, rowSpans, colTotals: agg.colTotals, grand: agg.grand, truncated };
};

const FieldValueFilter = ({ records, fieldKey, selected, onChange, listHeight = "max-h-40" }) => {
    const [search, setSearch] = useState("");
    const options = useMemo(() => uniqueOptions(records, fieldKey), [records, fieldKey]);
    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    }, [options, search]);
    const selectedSet = useMemo(() => new Set(selected ?? options), [selected, options]);

    const toggle = (opt) => {
        const cur = new Set(selected ?? options);
        if (cur.has(opt)) cur.delete(opt); else cur.add(opt);
        const arr = options.filter((o) => cur.has(o));
        onChange(arr.length === options.length ? undefined : arr);
    };

    return (
        <div className="space-y-1.5">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:border-emerald-500" />
            <div className="flex items-center gap-2 text-[11px]">
                <button onClick={() => onChange(undefined)} className="text-emerald-700 hover:underline">Select all</button>
                <button onClick={() => onChange([])} className="text-slate-500 hover:underline">None</button>
                {search.trim() && <button onClick={() => onChange(visible)} className="text-blue-700 hover:underline">Only matches ({visible.length})</button>}
                <span className="ml-auto text-slate-400">{selectedSet.size}/{options.length}</span>
            </div>
            <div className={`${listHeight} overflow-y-auto border border-slate-200 rounded bg-white`}>
                {visible.slice(0, MAX_OPTIONS_SHOWN).map((opt) => (
                    <label key={opt} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-slate-50">
                        <input type="checkbox" checked={selectedSet.has(opt)} onChange={() => toggle(opt)} className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                        <span className="truncate">{opt}</span>
                    </label>
                ))}
                {visible.length === 0 && <p className="px-2 py-2 text-xs text-slate-400 italic">No matches</p>}
                {visible.length > MAX_OPTIONS_SHOWN && <p className="px-2 py-1 text-[11px] text-slate-400">+{visible.length - MAX_OPTIONS_SHOWN} more, refine your search</p>}
            </div>
        </div>
    );
};

const ReportStudio = () => {
    const axiosPrivate = useAxiosPrivate();
    const [fieldMeta, setFieldMeta] = useState([]);
    const [config, setConfig] = useState({ filters: [], columns: [], rows: [], values: [] });
    const [filters, setFilters] = useState({});
    const [valueFilters, setValueFilters] = useState({});
    const [sorts, setSorts] = useState({});
    const [slicerKeys, setSlicerKeys] = useState([]);
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [refreshTick, setRefreshTick] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [fieldSearch, setFieldSearch] = useState("");
    const [slicerSearch, setSlicerSearch] = useState("");
    const [dragOver, setDragOver] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null); // NEW: Track drop position
    const [editor, setEditor] = useState(null);
    const [showGrandRow, setShowGrandRow] = useState(true);
    const [showGrandCol, setShowGrandCol] = useState(true);
    
    // NEW: View mode toggle
    const [viewMode, setViewMode] = useState("delivery"); // "delivery" | "orderType"

    useEffect(() => {
        const loadFields = async () => {
            try {
                const res = await axiosPrivate.get("/api/objects-report-studio");
                const list = Array.isArray(res.data) ? res.data : [];
                setFieldMeta(list);
                const has = (k) => list.some((f) => f.key === k);
                setConfig((prev) => {
                    const empty = !prev.rows.length && !prev.columns.length && !prev.values.length && !prev.filters.length;
                    if (!empty) return prev;
                    return {
                        filters: [], columns: [], rows: ["buyerName", "jobNo"].filter(has),
                        values: has("workOrderQty") ? [{ uid: newUid(), field: "workOrderQty", agg: "sum" }] : [],
                    };
                });
            } catch (err) {
                console.log(err);
                setError("Failed to load field list");
            }
        };
        loadFields();
    }, [axiosPrivate]);

    const fieldMap = useMemo(() => Object.fromEntries(fieldMeta.map((f) => [f.key, f])), [fieldMeta]);

    const groupedFields = useMemo(() => {
        const q = fieldSearch.trim().toLowerCase();
        const list = q ? fieldMeta.filter((f) => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) || f.group.toLowerCase().includes(q)) : fieldMeta;
        const groups = [];
        list.forEach((f) => {
            let g = groups.find((x) => x.name === f.group);
            if (!g) { g = { name: f.group, fields: [] }; groups.push(g); }
            g.fields.push(f);
        });
        return groups;
    }, [fieldMeta, fieldSearch]);

    const usedFields = useMemo(() => {
        const set = new Set([...config.filters, ...config.columns, ...config.rows, ...config.values.map((v) => v.field), ...slicerKeys]);
        return [...set].filter((k) => fieldMap[k]);
    }, [config, slicerKeys, fieldMap]);

    const fetchKey = useMemo(() => [...usedFields].sort().join(","), [usedFields]);

    useEffect(() => {
        if (!fetchKey) { setRecords([]); return undefined; }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setLoading(true);
            setError("");
            try {
                const res = await axiosPrivate.get("/api/selected-fields-data", { params: { objectName: OBJECT_NAME, fields: fetchKey } });
                if (!cancelled) {
                    setRecords(res.data?.data ?? []);
                    if (res.data?.fieldMeta) {
                        setFieldMeta((prev) => {
                            const merged = [...prev];
                            res.data.fieldMeta.forEach((fm) => {
                                const idx = merged.findIndex((m) => m.key === fm.key);
                                if (idx >= 0) merged[idx] = { ...merged[idx], ...fm };
                                else merged.push(fm);
                            });
                            return merged;
                        });
                    }
                }
            } catch (e) {
                if (!cancelled) setError(e?.response?.data?.message || "Failed to fetch data");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [fetchKey, refreshTick, axiosPrivate]);

    useEffect(() => {
        const used = new Set(fetchKey ? fetchKey.split(",") : []);
        setFilters((prev) => {
            const stale = Object.keys(prev).filter((k) => !used.has(k));
            if (!stale.length) return prev;
            const next = { ...prev };
            stale.forEach((k) => delete next[k]);
            return next;
        });
    }, [fetchKey]);

    const placementOf = (key) => {
        for (const a of ["rows", "columns", "filters"]) if (config[a].includes(key)) return a;
        return config.values.some((v) => v.field === key) ? "values" : null;
    };

    const dropField = (payload, target, index) => setConfig((prev) => applyDrop(prev, payload, target, index, fieldMap[payload.key]));
    const removeFromArea = (source, key, uid) => {
        setConfig((prev) => source === "values" ? { ...prev, values: prev.values.filter((v) => v.uid !== uid) } : { ...prev, [source]: prev[source].filter((k) => k !== key) });
        setEditor(null);
    };
    const toggleField = (key) => {
        const meta = fieldMap[key];
        if (!meta) return;
        if (placementOf(key)) {
            setConfig((prev) => ({ filters: prev.filters.filter((k) => k !== key), columns: prev.columns.filter((k) => k !== key), rows: prev.rows.filter((k) => k !== key), values: prev.values.filter((v) => v.field !== key) }));
            setEditor(null);
        } else {
            dropField({ key, source: "list" }, meta.type === "measure" ? "values" : "rows", null);
        }
    };
    const setAgg = (uid, agg) => setConfig((prev) => ({ ...prev, values: prev.values.map((v) => (v.uid === uid ? { ...v, agg } : v)) }));
    const toggleSort = (key) => setSorts((prev) => ({ ...prev, [key]: prev[key] === "desc" ? "asc" : "desc" }));
    const setFieldFilter = (key, arr) => setFilters((prev) => { const next = { ...prev }; if (arr === undefined) delete next[key]; else next[key] = arr; return next; });
    const setValueFilter = (uid, patch) => setValueFilters((prev) => ({ ...prev, [uid]: { op: ">", num: "", ...prev[uid], ...patch } }));
    const resetAll = () => { setConfig({ filters: [], columns: [], rows: [], values: [] }); setFilters({}); setValueFilters({}); setSorts({}); setSlicerKeys([]); setRecords([]); setEditor(null); setError(""); };

    const startDrag = (e, payload) => { e.dataTransfer.setData("text/plain", JSON.stringify(payload)); e.dataTransfer.effectAllowed = "move"; };
    const readPayload = (e) => { try { const p = JSON.parse(e.dataTransfer.getData("text/plain")); return p && p.key ? p : null; } catch { return null; } };
    
    // ENHANCED: Handle drop with position tracking
    const handleDrop = (e, area, index) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(null);
        setDragOverIndex(null);
        const payload = readPayload(e);
        if (payload) dropField(payload, area, index);
    };
    
    const handleListDrop = (e) => { e.preventDefault(); setDragOver(null); setDragOverIndex(null); const payload = readPayload(e); if (payload && payload.source && payload.source !== "list") removeFromArea(payload.source, payload.key, payload.uid); };

    // NEW: Apply view mode preset
    const applyViewMode = (mode) => {
        setViewMode(mode);
        const has = (k) => fieldMeta.some((f) => f.key === k);
        
        if (mode === "delivery") {
            setConfig((prev) => ({
                ...prev,
                rows: ["buyerName", "jobNo", "color", "composition"].filter(has),
                columns: ["deliveryMonth"].filter(has),
                values: [
                    ...(has("workOrderQty") ? [{ uid: newUid(), field: "workOrderQty", agg: "sum" }] : []),
                    ...(has("deliveryQty") ? [{ uid: newUid(), field: "deliveryQty", agg: "sum" }] : []),
                ],
            }));
        } else if (mode === "orderType") {
            setConfig((prev) => ({
                ...prev,
                rows: ["buyerName", "jobNo", "color", "composition"].filter(has),
                columns: ["orderType"].filter(has),
                values: [
                    ...(has("workOrderQty") ? [{ uid: newUid(), field: "workOrderQty", agg: "sum" }] : []),
                    ...(has("deliveryQty") ? [{ uid: newUid(), field: "deliveryQty", agg: "sum" }] : []),
                ],
            }));
        }
    };

    const pivot = useMemo(() => buildPivot({ records, config, fieldMap, filters, valueFilters, sorts }), [records, config, fieldMap, filters, valueFilters, sorts]);
    const labelOf = (key) => fieldMap[key]?.label ?? key;
    const valueLabel = (v) => `${AGG_LABELS[v.agg]} of ${labelOf(v.field)}`;
    const slicerFields = useMemo(() => [...new Set([...config.filters, ...slicerKeys])].filter((k) => fieldMap[k]), [config.filters, slicerKeys, fieldMap]);
    const slicerSuggestions = useMemo(() => {
        const q = slicerSearch.trim().toLowerCase();
        if (!q) return [];
        return fieldMeta.filter((f) => !slicerFields.includes(f.key) && (f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))).slice(0, 8);
    }, [fieldMeta, slicerFields, slicerSearch]);

    const renderChip = (area, item, idx) => {
        const isValues = area === "values";
        const key = isValues ? item.field : item;
        const uid = isValues ? item.uid : undefined;
        const meta = fieldMap[key];
        const filterActive = isValues ? !!valueFilters[uid]?.num : filters[key] !== undefined;
        const editing = isValues ? editor?.type === "value" && editor.uid === uid : editor?.type === "field" && editor.key === key;

        return (
            <div key={uid || key} draggable onDragStart={(e) => startDrag(e, { key, source: area, uid })} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(area); setDragOverIndex(idx); }} onDrop={(e) => handleDrop(e, area, idx)} className={`flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] cursor-grab ${isValues ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-slate-100 border-slate-200 text-slate-700"} ${dragOver === area && dragOverIndex === idx ? "border-t-2 border-t-emerald-500" : ""}`}>
                <span className="truncate flex-1" title={labelOf(key)}>{labelOf(key)}</span>
                {isValues && (
                    <select value={item.agg} onChange={(e) => setAgg(uid, e.target.value)} className="text-[10px] bg-white border border-emerald-200 rounded px-0.5 py-0">
                        {(meta?.type === "measure" ? MEASURE_AGGS : DIMENSION_AGGS).map((a) => <option key={a} value={a}>{AGG_LABELS[a]}</option>)}
                    </select>
                )}
                {(area === "rows" || area === "columns") && (
                    <button onClick={() => toggleSort(key)} title="Toggle sort" className="text-slate-500 hover:text-slate-900">{sorts[key] === "desc" ? "▼" : "▲"}</button>
                )}
                <button onClick={() => setEditor(editing ? null : isValues ? { type: "value", uid } : { type: "field", key })} title="Filter" className={filterActive ? "text-emerald-600" : "text-slate-400 hover:text-slate-700"}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                </button>
                <button onClick={() => removeFromArea(area, key, uid)} title="Remove" className="text-slate-400 hover:text-red-500 font-bold">×</button>
            </div>
        );
    };

    const renderArea = (area) => {
        const items = config[area];
        return (
            <div key={area} onDragOver={(e) => { e.preventDefault(); if (dragOver !== area) setDragOver(area); }} onDragLeave={() => { setDragOver(null); setDragOverIndex(null); }} onDrop={(e) => handleDrop(e, area, items.length)} className={`border rounded p-1.5 min-h-[84px] transition ${dragOver === area ? "border-emerald-500 bg-emerald-50/60" : "border-slate-300 bg-white"}`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight block mb-1">{AREA_LABELS[area]}</span>
                <div className="flex flex-col gap-1">
                    {items.map((item, idx) => renderChip(area, item, idx))}
                    {items.length === 0 && <span className="text-[10px] text-slate-300 italic">Drop fields here</span>}
                </div>
            </div>
        );
    };

    const renderEditor = () => {
        if (!editor) return null;
        if (editor.type === "field") {
            if (!fieldMap[editor.key]) return null;
            return (
                <div className="border border-slate-200 rounded bg-slate-50 p-2">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold text-slate-600 uppercase">Filter: {labelOf(editor.key)}</span>
                        <button onClick={() => setEditor(null)} className="text-slate-400 hover:text-slate-700">×</button>
                    </div>
                    <FieldValueFilter records={records} fieldKey={editor.key} selected={filters[editor.key]} onChange={(arr) => setFieldFilter(editor.key, arr)} />
                </div>
            );
        }
        const spec = config.values.find((v) => v.uid === editor.uid);
        if (!spec) return null;
        const vf = valueFilters[spec.uid] || { op: ">", num: "" };
        return (
            <div className="border border-slate-200 rounded bg-slate-50 p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Value filter: {valueLabel(spec)}</span>
                    <button onClick={() => setEditor(null)} className="text-slate-400 hover:text-slate-700">×</button>
                </div>
                <p className="text-[11px] text-slate-500">Keep only rows whose total is…</p>
                <div className="flex items-center gap-1.5">
                    <select value={vf.op} onChange={(e) => setValueFilter(spec.uid, { op: e.target.value })} className="text-xs border border-slate-200 rounded px-1 py-1 bg-white">
                        {VALUE_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input type="number" value={vf.num} onChange={(e) => setValueFilter(spec.uid, { num: e.target.value })} placeholder="Number" className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-emerald-500" />
                    <button onClick={() => setValueFilter(spec.uid, { num: "" })} className="text-[11px] text-slate-500 hover:underline">Clear</button>
                </div>
            </div>
        );
    };

    const { rowFields, colFields, values, rowList, colList, colKeys, rowSpans, colTotals, grand } = pivot;
    const showColTotal = showGrandCol && colFields.length > 0 && values.length > 0;
    const showRowTotal = showGrandRow && rowFields.length > 0 && values.length > 0;

    const colLevels = colFields.map((_, l) => {
        const cells = [];
        let i = 0;
        while (i < colList.length) {
            let j = i + 1;
            while (j < colList.length && samePrefix(colList[i], colList[j], l)) j++;
            cells.push({ label: colList[i][l], span: (j - i) * values.length, key: `${l}-${i}` });
            i = j;
        }
        return cells;
    });

    const headerTotalRows = Math.max(1, colLevels.length + (values.length ? 1 : 0));
    const cornerCells = (rowFields.length ? rowFields : [null]).map((f, i) => (
        <th key={`corner-${i}`} rowSpan={headerTotalRows} className="py-2.5 px-3 font-semibold text-slate-700 border border-slate-300 bg-slate-100 whitespace-nowrap">{f ? labelOf(f) : ""}</th>
    ));

    const headerTrs = [];
    colLevels.forEach((cells, l) => {
        headerTrs.push(
            <tr key={`hl-${l}`}>
                {l === 0 && cornerCells}
                {cells.map((c) => <th key={c.key} colSpan={c.span} className="py-2 px-3 font-semibold text-slate-700 border border-slate-300 bg-slate-100 whitespace-nowrap">{c.label}</th>)}
                {l === 0 && showColTotal && <th colSpan={values.length} rowSpan={colLevels.length} className="py-2 px-3 font-semibold text-emerald-900 border border-slate-300 bg-emerald-100 whitespace-nowrap">Grand Total</th>}
            </tr>
        );
    });

    if (values.length) {
        headerTrs.push(
            <tr key="hv">
                {colLevels.length === 0 && cornerCells}
                {colList.map((ct, ci) => values.map((v) => <th key={`${ci}-${v.uid}`} className="py-2 px-3 font-semibold text-slate-700 border border-slate-300 bg-emerald-50 whitespace-nowrap">{valueLabel(v)}</th>))}
                {showColTotal && values.map((v) => <th key={`gt-${v.uid}`} className="py-2 px-3 font-semibold text-emerald-900 border border-slate-300 bg-emerald-100 whitespace-nowrap">{valueLabel(v)}</th>)}
            </tr>
        );
    }
    if (!headerTrs.length) headerTrs.push(<tr key="h0">{cornerCells}</tr>);

    const activeFilterEntries = Object.entries(filters).filter(([k]) => fieldMap[k]);
    const hasLayout = rowFields.length || values.length;

    return (
        <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-800 font-sans antialiased overflow-hidden">
            <header className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm">
                        <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" /></svg>
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-sm font-semibold text-slate-900">Report Studio</h1>
                            <span className="text-xs bg-emerald-100 text-emerald-800 font-medium px-2 py-0.5 rounded-full">Pivot Mode</span>
                        </div>
                        <p className="text-xs text-slate-500">Apparel Production & Work Orders Analysis</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* NEW: View Mode Toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                        <button onClick={() => applyViewMode("delivery")} className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${viewMode === "delivery" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                            Delivery Wise
                        </button>
                        <button onClick={() => applyViewMode("orderType")} className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${viewMode === "orderType" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                            OrderType Wise
                        </button>
                    </div>
                    <button onClick={() => setRefreshTick((t) => t + 1)} className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 font-medium transition">Refresh</button>
                    <button onClick={resetAll} className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 font-medium transition">Reset</button>
                    <button className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded font-medium shadow-sm transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Export XLSX
                    </button>
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-xs text-slate-600 hover:text-slate-900 p-2 rounded border border-slate-200 hover:bg-slate-100 transition" title="Toggle Fields Sidebar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <main className="flex-1 flex flex-col min-w-0 bg-white">
                    <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-2 flex items-center flex-wrap gap-2 text-xs">
                        <span className="text-slate-400 font-medium">Active Filters:</span>
                        {activeFilterEntries.length === 0 && <span className="text-slate-400 italic">None (Displaying all records)</span>}
                        {activeFilterEntries.map(([k, arr]) => (
                            <span key={k} className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-700 px-2 py-0.5 rounded">
                                <strong>{labelOf(k)}:</strong> {arr.length} selected
                                <button onClick={() => setFieldFilter(k, undefined)} className="hover:text-red-500 font-bold ml-0.5">×</button>
                            </span>
                        ))}
                        {activeFilterEntries.length > 0 && <button onClick={() => setFilters({})} className="text-slate-500 hover:text-slate-900 underline">Clear all</button>}
                        {hasLayout && <span className="ml-auto text-slate-400">{loading ? "Loading..." : `${rowList.length.toLocaleString()} rows`}</span>}
                    </div>

                    {error && <div className="px-4 py-2 text-xs bg-rose-50 text-rose-700 border-b border-rose-200">{error}</div>}
                    {pivot.truncated && <div className="px-4 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-200">Showing the first {MAX_ROWS.toLocaleString()} rows. Add a filter to narrow the report.</div>}

                    <div className="flex-1 overflow-auto">
                        {!hasLayout ? (
                            <div className="py-16 text-center text-xs text-slate-400">Tick a field, or drag fields into Rows / Columns / Values.</div>
                        ) : (
                            <table className="w-full text-center border-collapse text-xs">
                                <thead className="sticky top-0 z-10 select-none">{headerTrs}</thead>
                                <tbody>
                                    {rowList.map((entry, ri) => (
                                        <tr key={entry.key} className="hover:bg-slate-50/70 transition-colors">
                                            {rowFields.length ? (
                                                rowFields.map((f, l) => rowSpans[ri][l] === 0 ? null : (
                                                    <td key={f} rowSpan={rowSpans[ri][l]} className="py-2 px-3 border border-slate-300 bg-white align-middle font-medium text-slate-800">{entry.tuple[l]}</td>
                                                ))
                                            ) : (
                                                <td className="py-2 px-3 border border-slate-300 bg-white font-medium">Total</td>
                                            )}
                                            {colKeys.map((ck, ci) => values.map((v, vi) => {
                                                const cell = entry.cells.get(ck);
                                                return <td key={`${ci}-${v.uid}`} className="py-2 px-3 border border-slate-300 text-right font-mono tabular-nums text-slate-900">{fmtNumber(finalize(cell?.[vi], v.agg))}</td>;
                                            }))}
                                            {showColTotal && values.map((v, vi) => (
                                                <td key={`gt-${v.uid}`} className="py-2 px-3 border border-slate-300 text-right font-mono tabular-nums font-semibold bg-emerald-50 text-emerald-900">{fmtNumber(finalize(entry.total[vi], v.agg))}</td>
                                            ))}
                                        </tr>
                                    ))}
                                    {rowList.length === 0 && !loading && <tr><td colSpan={20} className="py-12 text-center text-slate-400">No records match the current layout and filters.</td></tr>}
                                </tbody>
                                {showRowTotal && rowList.length > 0 && (
                                    <tfoot className="sticky bottom-0 font-semibold">
                                        <tr>
                                            <td colSpan={Math.max(1, rowFields.length)} className="py-2.5 px-3 border border-slate-400 bg-emerald-100 text-emerald-900 text-center">Grand Total</td>
                                            {colKeys.map((ck, ci) => values.map((v, vi) => (
                                                <td key={`${ci}-${v.uid}`} className="py-2.5 px-3 border border-slate-400 bg-emerald-100 text-emerald-900 text-right font-mono tabular-nums">{fmtNumber(finalize(colTotals.get(ck)?.[vi], v.agg))}</td>
                                            )))}
                                            {showColTotal && values.map((v, vi) => (
                                                <td key={`gt-${v.uid}`} className="py-2.5 px-3 border border-slate-400 bg-emerald-200 text-emerald-950 text-right font-mono tabular-nums">{fmtNumber(finalize(grand[vi], v.agg))}</td>
                                            ))}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        )}
                    </div>
                </main>

                {sidebarOpen && (
                    <aside className="w-[26rem] border-l border-slate-200 bg-white flex flex-col shadow-lg z-20 overflow-y-auto">
                        <div className="p-3 border-b border-slate-200 bg-slate-50">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">PivotTable Fields</h2>
                            <p className="text-[11px] text-slate-500">Tick a field or drag it into an area below</p>
                        </div>
                        <div className="p-3 border-b border-slate-200">
                            <input type="text" placeholder="Search fields..." value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-emerald-500 transition" />
                        </div>
                        <div onDragOver={(e) => e.preventDefault()} onDrop={handleListDrop} className="p-3 max-h-72 overflow-y-auto border-b border-slate-200">
                            {groupedFields.map((g) => (
                                <div key={g.name} className="mb-2">
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{g.name}</div>
                                    {g.fields.map((f) => {
                                        const isChecked = placementOf(f.key) !== null;
                                        return (
                                            <div key={f.key} draggable onDragStart={(e) => startDrag(e, { key: f.key, source: "list" })} className={`flex items-center justify-between px-2 py-1 rounded text-xs select-none cursor-grab transition ${isChecked ? "bg-emerald-50 text-emerald-900" : "hover:bg-slate-50"}`}>
                                                <label className="flex items-center gap-2 flex-1 cursor-pointer">
                                                    <input type="checkbox" checked={isChecked} onChange={() => toggleField(f.key)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5" />
                                                    <span>{f.label}</span>
                                                </label>
                                                {f.type === "measure" && <span className="text-[10px] text-emerald-700 font-mono">Σ</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                            {groupedFields.length === 0 && <p className="text-xs text-slate-400 italic">No fields found.</p>}
                        </div>
                        <div className="p-3 border-b border-slate-200 bg-slate-100/80 space-y-2">
                            <div className="grid grid-cols-2 gap-2">{["filters", "columns", "rows", "values"].map(renderArea)}</div>
                            <div className="flex items-center gap-4 text-[11px] text-slate-600">
                                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showGrandRow} onChange={(e) => setShowGrandRow(e.target.checked)} className="h-3 w-3" />Total row</label>
                                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={showGrandCol} onChange={(e) => setShowGrandCol(e.target.checked)} className="h-3 w-3" />Total column</label>
                            </div>
                            {renderEditor()}
                        </div>
                        <div className="p-3 space-y-3">
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Quick Slicers</div>
                            <div className="relative">
                                <input type="text" placeholder="Search any field to add a slicer..." value={slicerSearch} onChange={(e) => setSlicerSearch(e.target.value)} className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-emerald-500 transition" />
                                {slicerSuggestions.length > 0 && (
                                    <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-30 max-h-48 overflow-y-auto">
                                        {slicerSuggestions.map((f) => (
                                            <button key={f.key} onClick={() => { setSlicerKeys((prev) => [...prev, f.key]); setSlicerSearch(""); }} className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-emerald-50 flex items-center justify-between">
                                                <span>{f.label}</span><span className="text-[10px] text-slate-400">{f.group}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {slicerFields.length === 0 && <p className="text-[11px] text-slate-400 italic">Search a field above (or drop one in Filters) to filter by its values.</p>}
                            {slicerFields.map((key) => (
                                <div key={key} className="bg-white border border-slate-200 rounded p-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-xs font-semibold text-slate-700">{labelOf(key)}{filters[key] !== undefined && <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full">filtered</span>}</span>
                                        {slicerKeys.includes(key) && (
                                            <button onClick={() => { setSlicerKeys((prev) => prev.filter((k) => k !== key)); if (!config.filters.includes(key)) setFieldFilter(key, undefined); }} className="text-slate-400 hover:text-red-500 font-bold" title="Remove slicer">×</button>
                                        )}
                                    </div>
                                    <FieldValueFilter records={records} fieldKey={key} selected={filters[key]} onChange={(arr) => setFieldFilter(key, arr)} />
                                </div>
                            ))}
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
};

export default ReportStudio;