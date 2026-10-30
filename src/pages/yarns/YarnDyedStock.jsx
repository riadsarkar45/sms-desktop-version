import React, { useState, useMemo, useRef, useEffect } from 'react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

/* ----------------------------- Icons ----------------------------- */
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-400">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor" />
  </svg>
);

const IconFilter = ({ active }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
    <path
      d="M3 4.5h18l-7 8.2V19l-4 2v-8.3L3 4.5z"
      fill={active ? '#2563EB' : 'none'}
      stroke={active ? '#2563EB' : '#94A3B8'}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const IconCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5l5.5 5.5L20 7" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPencil = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-blue-500 shrink-0">
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ----------------------------- Column definitions -----------------------------
   `available: false` marks columns the /api/total/yd-stock feed does not currently
   supply (workOrderQty, delivery/return/received quantities, fabric width). Those
   headers are kept exactly as-is; their cells/totals render as "—" instead of a
   fabricated number. `stock` is the one real numeric figure this endpoint returns
   (mapped from `yarnDyedStock`).

   `editable: true` marks columns whose cells can be double-clicked into an
   editable input (currently NOTE and REMARKS — see EDITABLE_KEYS below).
------------------------------------------------------------------------------- */
const COLUMNS = [
  { key: 'jobNumber', label: 'JOB NUMBER', width: 100, type: 'text' },
  { key: 'orderNumber', label: 'ORDER NUMBER', width: 130, type: 'text' },
  { key: 'color', label: 'COLOR', width: 90, type: 'text' },
  { key: 'fabricComposition', label: 'FABRIC COMPOSITION', width: 160, type: 'text' },
  { key: 'fabricWidth', label: 'FABRIC WIDTH', width: 100, type: 'text', available: false },
  { key: 'yarnCount', label: 'YARN COUNT', width: 90, type: 'text' },
  { key: 'composition', label: 'COMPOSITION', width: 140, type: 'text' },
  { key: 'lot', label: 'LOT', width: 140, type: 'text' },
  { key: 'workOrderQty', label: 'WORKORDER QTY', width: 120, type: 'number', numeric: true, available: false },
  { key: 'yarnDeliveryQty', label: 'YARN DELIVERY QTY (Y/D)', width: 140, type: 'number', numeric: true, available: false },
  { key: 'delShortExcess', label: 'DEL. SHORT & EXCESS', width: 130, type: 'number', numeric: true, available: false },
  { key: 'yarnReturnQty', label: 'YARN RETURN QTY (Y/D FACTORY)', width: 150, type: 'number', numeric: true, available: false },
  { key: 'yarnReceivedGrey', label: 'YARN RECEIVED QTY (GREY)', width: 150, type: 'number', numeric: true, available: false },
  { key: 'yarnReceivedFinish', label: 'YARN RECEIVED QTY (FINISH)', width: 160, type: 'number', numeric: true, available: false },
  { key: 'stock', label: 'STOCK', width: 90, type: 'number', numeric: true },
  { key: 'remarks', label: 'REMARKS', width: 220, type: 'text', editable: true },
];

const NUMERIC_KEYS = COLUMNS.filter((c) => c.numeric).map((c) => c.key);
const EDITABLE_KEYS = COLUMNS.filter((c) => c.editable).map((c) => c.key);

/* ----------------------------- API → row mapping ----------------------------- */
const MONTH_MAP = {
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3, MAY: 4, JUNE: 5,
  JULY: 6, AUGUST: 7, SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
};

// Job numbers look like "SM25-2260 JUNE" or "SM25-SAMPLE/1014" (no month).
// Pull a sortable month key + display label out of the job number when present.
function parseJobMeta(jobNo) {
  if (!jobNo) return { monthKey: null, monthLabel: null };
  const yearMatch = jobNo.match(/SM(\d{2})/i);
  const monthName = Object.keys(MONTH_MAP).find((m) => jobNo.toUpperCase().includes(m));
  if (!yearMatch || !monthName) return { monthKey: null, monthLabel: null };
  const year = 2000 + parseInt(yearMatch[1], 10);
  const monthIndex = MONTH_MAP[monthName];
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthLabel = new Date(year, monthIndex).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { monthKey, monthLabel };
}

// Maps one raw /api/total/yd-stock record into the row shape the table renders.
function mapApiItem(item) {
  const stockNum = parseFloat(item.yarnDyedStock);
  const { monthKey, monthLabel } = parseJobMeta(item.jobNo);
  const remarksParts = [
    item.buyer,
    item.styleNo && item.styleNo !== 'SAMPLE' ? `Style ${item.styleNo}` : (item.styleNo === 'SAMPLE' ? 'Sample' : null),
  ].filter(Boolean);

  return {
    id: item.id,
    jobNumber: item.jobNo || '—',
    orderNumber: item.orderNo || '—',
    color: item.color || '—',
    fabricComposition: item.composition || '—',
    fabricWidth: null,
    yarnCount: item.count || '—',
    composition: item.composition || '—',
    lot: item.dyedYarnLot || '—',
    workOrderQty: null,
    yarnDeliveryQty: null,
    delShortExcess: null,
    yarnReturnQty: null,
    yarnReceivedGrey: null,
    yarnReceivedFinish: null,
    stock: Number.isFinite(stockNum) ? stockNum : null,
    remarks: remarksParts.length ? remarksParts.join(' • ') : '—',
    monthKey,
    monthLabel,
    buyer: item.buyer || '',
    styleNo: item.styleNo || '',
  };
}

/* ----------------------------- Filter Popover Component ----------------------------- */
function FilterPopover({ column, values, activeSet, onApply, onClose }) {
  const ref = useRef(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(activeSet ? new Set(activeSet) : new Set(values));

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const visibleValues = values.filter((v) => v.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="absolute z-50 top-full left-0 mt-1 w-60 bg-white border border-gray-300 rounded-md shadow-lg text-gray-800 normal-case font-normal text-xs" onMouseDown={(e) => e.stopPropagation()}>
      <div className="p-2 border-b border-gray-200">
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${column.label}...`} className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs outline-none focus:border-blue-500" />
      </div>
      <div className="flex justify-between px-2 py-1.5 border-b border-gray-200 text-blue-600 font-medium">
        <button className="hover:underline" onClick={() => setDraft(new Set(values))}>Select all</button>
        <button className="hover:underline" onClick={() => setDraft(new Set())}>Clear</button>
      </div>
      <div className="max-h-52 overflow-y-auto py-1">
        {visibleValues.length === 0 && <div className="px-3 py-3 text-gray-400 italic">No matches</div>}
        {visibleValues.map((v) => {
          const checked = draft.has(v);
          return (
            <label key={v} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer select-none">
              <span onClick={(e) => { e.preventDefault(); setDraft((prev) => { const next = new Set(prev); checked ? next.delete(v) : next.add(v); return next; }); }} className={`w-3.5 h-3.5 border border-gray-400 rounded-sm flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'bg-white'}`}>
                {checked && <IconCheck />}
              </span>
              <span className="truncate">{v}</span>
            </label>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 p-2 border-t border-gray-200 bg-gray-50 rounded-b-md">
        <button onClick={onClose} className="px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Cancel</button>
        <button onClick={() => onApply(draft)} className="px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">OK</button>
      </div>
    </div>
  );
}

/* ----------------------------- Editable Cell Component -----------------------------
   Renders plain text by default. Double-click switches it into an <input>.
   Typing updates the row's pending edit (not yet saved); Enter commits/exits
   edit mode, Escape reverts just this field and exits edit mode.
------------------------------------------------------------------------------- */
function EditableCell({ rowId, colKey, value, isEditing, onStartEdit, onChange, onCommit, onCancel }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value === '—' ? '' : value ?? ''}
        onChange={(e) => onChange(rowId, colKey, e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="w-full px-1.5 py-1 border border-blue-500 rounded text-sm outline-none bg-blue-50/40"
      />
    );
  }

  return (
    <div
      onDoubleClick={onStartEdit}
      title="Double-click to edit"
      className="group flex items-center gap-1 cursor-text min-h-[1.25rem] rounded px-1 -mx-1 hover:bg-blue-50"
    >
      <span className="wrap-break-words">{value === '' || value === null || value === undefined ? '—' : value}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity"><IconPencil /></span>
    </div>
  );
}

/* ----------------------------- Main Component ----------------------------- */
const YarnDyedStock = () => {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [filters, setFilters] = useState({});
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const axiosSecure = useAxiosPrivate();

  // ---- Inline editing state ----
  // pendingEdits: { [rowId]: { [colKey]: newValue } } — unsaved edits only.
  const [pendingEdits, setPendingEdits] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { id, key } | null
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccessNote, setSaveSuccessNote] = useState(null);

  const fmt = (num) => (num === null || num === undefined ? '—' : (Number.isFinite(num) ? num.toFixed(2) : '—'));
  const cell = (val) => (val === null || val === undefined || val === '' ? '—' : val);

  useEffect(() => {
    let cancelled = false;
    const fetchYdStock = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axiosSecure.get('/api/total/yd-stock');
        const raw = Array.isArray(res.data) ? res.data : (Array.isArray(res.data?.data) ? res.data.data : []);
        if (!cancelled) setAllData(raw.map(mapApiItem));
      } catch (err) {
        if (!cancelled) setError('Failed to load yarn dyed stock data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchYdStock();
    return () => { cancelled = true; };
  }, [axiosSecure]);

  // Unique values for header filters (nulls normalized to "—")
  const uniqueValues = useMemo(() => {
    const map = {};
    COLUMNS.forEach((col) => {
      const set = new Set();
      allData.forEach((row) => set.add(cell(row[col.key]) === '—' ? '—' : String(row[col.key])));
      map[col.key] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    return map;
  }, [allData]);

  // Available months, derived from job numbers (e.g. "SM25-2260 JUNE")
  const availableMonths = useMemo(() => {
    const map = new Map();
    allData.forEach((item) => {
      if (item.monthKey) map.set(item.monthKey, item.monthLabel);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [allData]);

  // Filtered Data (Search + Month + Header Filters)
  const filteredData = useMemo(() => {
    return allData.filter((item) => {
      if (selectedMonth !== 'all' && item.monthKey !== selectedMonth) return false;

      if (searchInput.trim()) {
        const q = searchInput.trim().toLowerCase();
        const hay = [item.jobNumber, item.color, item.lot, item.fabricComposition, item.buyer, item.styleNo]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      for (const col of COLUMNS) {
        const active = filters[col.key];
        if (!active) continue;
        const val = cell(item[col.key]) === '—' ? '—' : String(item[col.key]);
        if (!active.has(val)) return false;
      }
      return true;
    });
  }, [allData, selectedMonth, searchInput, filters]);

  // Totals — only computed for columns the API actually supplies data for
  const calculateTotals = (data) => {
    return NUMERIC_KEYS.reduce((acc, key) => {
      const values = data.map((item) => item[key]).filter((v) => v !== null && v !== undefined);
      acc[key] = values.length ? values.reduce((sum, v) => sum + v, 0) : null;
      return acc;
    }, {});
  };

  const filteredTotals = useMemo(() => calculateTotals(filteredData), [filteredData]);

  // Reset to page 1 whenever the filtered result set changes underneath the current page
  useEffect(() => {
    setCurrentPage(1);
  }, [searchInput, selectedMonth, filters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, safePage, pageSize]);

  const rangeStart = filteredData.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredData.length);

  // Builds a numbered page list like: 1 … 4 5 [6] 7 8 … 42
  const pageNumbers = useMemo(() => {
    const delta = 2;
    const pages = [];
    const start = Math.max(2, safePage - delta);
    const end = Math.min(totalPages - 1, safePage + delta);

    pages.push(1);
    if (start > 2) pages.push('ellipsis-start');
    for (let p = start; p <= end; p++) pages.push(p);
    if (end < totalPages - 1) pages.push('ellipsis-end');
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  }, [safePage, totalPages]);

  const handleSearch = () => { }; // Reactive via useMemo
  const handleClear = () => { setSearchInput(''); setSelectedMonth('all'); setFilters({}); };

  const applyFilter = (colKey, set) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (set.size === uniqueValues[colKey].length) delete next[colKey];
      else next[colKey] = set;
      return next;
    });
    setOpenFilterCol(null);
  };

  // ---- Inline editing handlers ----
  const editedRowCount = Object.keys(pendingEdits).length;
  const hasUnsavedChanges = editedRowCount > 0;

  const getDisplayValue = (row, colKey) => {
    const rowEdits = pendingEdits[row.id];
    if (rowEdits && Object.prototype.hasOwnProperty.call(rowEdits, colKey)) return rowEdits[colKey];
    return row[colKey];
  };

  const startEdit = (rowId, colKey) => {
    if (!EDITABLE_KEYS.includes(colKey)) return;
    setSaveError(null);
    setSaveSuccessNote(null);
    setEditingCell({ id: rowId, key: colKey });
  };

  const handleCellChange = (rowId, colKey, value) => {
    setPendingEdits((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], [colKey]: value },
    }));
  };

  const commitCellEdit = () => {
    setEditingCell(null);
  };

  const cancelCellEdit = () => {
    if (editingCell) {
      const { id, key } = editingCell;
      setPendingEdits((prev) => {
        if (!prev[id]) return prev;
        const rowEdits = { ...prev[id] };
        delete rowEdits[key];
        const next = { ...prev };
        if (Object.keys(rowEdits).length) next[id] = rowEdits;
        else delete next[id];
        return next;
      });
    }
    setEditingCell(null);
  };

  const handleDiscardAll = () => {
    setPendingEdits({});
    setEditingCell(null);
    setSaveError(null);
    setSaveSuccessNote(null);
  };

  const handleSaveAll = async () => {
    if (!hasUnsavedChanges) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccessNote(null);
    const entries = Object.entries(pendingEdits);
    try {
      // Persist each edited row. Adjust the endpoint/payload shape to match
      // your actual API contract for updating a yarn-dyed-stock record.
      await Promise.all(
        entries.map(([rowId, changes]) => axiosSecure.put(`/api/total/yd-stock/${rowId}`, changes))
      );

      setAllData((prev) =>
        prev.map((row) => (pendingEdits[row.id] ? { ...row, ...pendingEdits[row.id] } : row))
      );
      setPendingEdits({});
      setSaveSuccessNote(`Saved ${entries.length} row${entries.length > 1 ? 's' : ''}.`);
    } catch (err) {
      setSaveError('Failed to save changes. Your edits are kept — please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen font-sans">

      {/* QUICK SUMMARY - 5 cards */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-blue-600 rounded-full"></span> Quick Summary
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border-l-4 border-blue-600 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Work Order Qty</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(filteredTotals.workOrderQty)}</p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-amber-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Delivery (Y/D)</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(filteredTotals.yarnDeliveryQty)}</p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-orange-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Return (Y/D)</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(filteredTotals.yarnReturnQty)}</p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-teal-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Received (Grey)</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(filteredTotals.yarnReceivedGrey)}</p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-purple-600 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Stock</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(filteredTotals.stock)}</p>
          </div>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="bg-white p-4 rounded-t-lg border border-gray-200 border-b-0 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <input type="text" placeholder="Search Job, Color, Lot, Buyer..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="absolute left-3 top-2.5"><IconSearch /></div>
          </div>
          <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2">
            <IconSearch /> Search
          </button>
          <button onClick={handleClear} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors border border-gray-300">Clear</button>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Month Filter:
          </label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm">
            <option value="all">All Months</option>
            {availableMonths.map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
          </select>
        </div>
      </div>

      {/* SAVE BAR — appears above the table only while there are unsaved edits */}
      {(hasUnsavedChanges || saving || saveError || saveSuccessNote) && (
        <div className="bg-amber-50 border border-amber-200 border-b-0 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-sm text-amber-800 flex items-center gap-2">
            {saving ? (
              <span>Saving…</span>
            ) : saveError ? (
              <span className="text-red-600 font-medium">{saveError}</span>
            ) : saveSuccessNote ? (
              <span className="text-green-700 font-medium">{saveSuccessNote}</span>
            ) : (
              <span>
                <strong>{editedRowCount}</strong> row{editedRowCount > 1 ? 's' : ''} with unsaved changes.
              </span>
            )}
          </div>
          {hasUnsavedChanges && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDiscardAll}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-600 bg-white hover:bg-gray-100 disabled:opacity-50"
              >
                Discard
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: '65vh' }}>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-gray-100 sticky top-0 z-20">
              <tr>
                {COLUMNS.map((col) => {
                  const isFiltered = !!filters[col.key];
                  return (
                    <th key={col.key} className="relative border border-gray-300 px-2 py-3 text-left font-bold text-gray-700 uppercase text-xs align-top bg-gray-100" style={{ minWidth: col.width }}>
                      <div className="flex items-start justify-between gap-1">
                        <span className={`whitespace-normal wrap-break-words leading-tight ${col.numeric ? 'text-right w-full' : ''}`}>{col.label}</span>
                        <button onClick={() => setOpenFilterCol(openFilterCol === col.key ? null : col.key)} className={`shrink-0 p-1 rounded mt-0.5 ${isFiltered ? 'bg-blue-100' : 'hover:bg-gray-200'}`} title={`Filter ${col.label}`}>
                          <IconFilter active={isFiltered} />
                        </button>
                      </div>
                      {openFilterCol === col.key && (
                        <FilterPopover column={col} values={uniqueValues[col.key]} activeSet={filters[col.key]} onApply={(set) => applyFilter(col.key, set)} onClose={() => setOpenFilterCol(null)} />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-6 py-12 text-center text-gray-500 italic bg-white">Loading yarn dyed stock…</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-6 py-12 text-center text-red-600 italic bg-white">{error}</td>
                </tr>
              ) : paginatedData.length > 0 ? (
                paginatedData.map((item, index) => (
                  <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-yellow-50 transition-colors`}>
                    <td className="px-3 py-2 text-gray-900 border border-gray-300 wrap-break-words font-medium">{cell(item.jobNumber)}</td>

                    <td className="px-3 py-2 text-gray-900 border border-gray-300 wrap-break-words">{cell(item.orderNumber)}</td>

                    <td className="px-3 py-2 text-gray-900 border border-gray-300 wrap-break-words">{cell(item.color)}</td>
                    <td className="px-3 py-2 text-gray-900 border border-gray-300 wrap-break-words">{cell(item.fabricComposition)}</td>
                    <td className="px-3 py-2 text-gray-400 border border-gray-300 wrap-break-words">{cell(item.fabricWidth)}</td>
                    <td className="px-3 py-2 text-gray-900 border border-gray-300 wrap-break-words">{cell(item.yarnCount)}</td>
                    <td className="px-3 py-2 text-gray-900 border border-gray-300 wrap-break-words">{cell(item.composition)}</td>
                    <td className="px-3 py-2 text-gray-900 border border-gray-300 wrap-break-words">{cell(item.lot)}</td>

                    <td className="px-3 py-2 text-gray-400 text-right border border-gray-300 whitespace-nowrap font-mono tabular-nums">{fmt(item.workOrderQty)}</td>
                    <td className="px-3 py-2 text-gray-400 text-right border border-gray-300 whitespace-nowrap font-mono tabular-nums">{fmt(item.yarnDeliveryQty)}</td>
                    <td className="px-3 py-2 text-gray-400 text-right border border-gray-300 whitespace-nowrap font-mono tabular-nums">{fmt(item.delShortExcess)}</td>
                    <td className="px-3 py-2 text-gray-400 text-right border border-gray-300 whitespace-nowrap font-mono tabular-nums">{fmt(item.yarnReturnQty)}</td>
                    <td className="px-3 py-2 text-gray-400 text-right border border-gray-300 whitespace-nowrap font-mono tabular-nums">{fmt(item.yarnReceivedGrey)}</td>
                    <td className="px-3 py-2 text-gray-400 text-right border border-gray-300 whitespace-nowrap font-mono tabular-nums">{fmt(item.yarnReceivedFinish)}</td>
                    <td className={`px-3 py-2 text-right border border-gray-300 whitespace-nowrap font-mono tabular-nums font-bold ${item.stock !== null && item.stock < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmt(item.stock)}</td>

                    <td className={`px-3 py-2 border border-gray-300 wrap-break-words ${pendingEdits[item.id]?.remarks !== undefined ? 'bg-amber-50' : ''}`}>
                      <EditableCell
                        rowId={item.id}
                        colKey="remarks"
                        value={getDisplayValue(item, 'remarks')}
                        isEditing={editingCell?.id === item.id && editingCell?.key === 'remarks'}
                        onStartEdit={() => startEdit(item.id, 'remarks')}
                        onChange={handleCellChange}
                        onCommit={commitCellEdit}
                        onCancel={cancelCellEdit}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-6 py-12 text-center text-gray-500 italic bg-white">No records found matching your search or filter criteria.</td>
                </tr>
              )}
            </tbody>

            <tfoot className="bg-gray-100 sticky bottom-0 z-20">
              <tr className="border-t-2 border-gray-400">
                <td colSpan="8" className="px-3 py-3 text-right text-sm font-bold text-gray-800 border border-gray-300 uppercase tracking-wider">Footer Sub-Total:</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-gray-400 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(filteredTotals.workOrderQty)}</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-gray-400 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(filteredTotals.yarnDeliveryQty)}</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-gray-400 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(filteredTotals.delShortExcess)}</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-gray-400 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(filteredTotals.yarnReturnQty)}</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-gray-400 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(filteredTotals.yarnReceivedGrey)}</td>
                <td className="px-3 py-3 text-right text-sm font-bold text-gray-400 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(filteredTotals.yarnReceivedFinish)}</td>
                <td className={`px-3 py-3 text-right text-sm font-bold border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50 ${filteredTotals.stock !== null && filteredTotals.stock < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(filteredTotals.stock)}</td>
                <td colSpan="1" className="px-3 py-3 border border-gray-300 bg-gray-100"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* PAGINATION BAR */}
      <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-gray-200 rounded-md px-4 py-2.5 shadow-sm">
        <div className="text-xs text-gray-500 font-medium">
          Showing {rangeStart}-{rangeEnd} of {filteredData.length} records
          {filteredData.length !== allData.length && <span className="text-gray-400"> (filtered from {allData.length})</span>}
        </div>
        <div className="flex items-center gap-4">
          <label className="text-xs font-medium text-gray-600 flex items-center gap-2">
            Rows per page:
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {[10, 25, 50, 100].map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100">‹ Prev</button>
            {pageNumbers.map((p, i) =>
              typeof p === 'number' ? (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`min-w-[28px] px-2 py-1 text-xs border rounded font-medium ${p === safePage ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                >
                  {p}
                </button>
              ) : (
                <span key={p + i} className="px-1 text-xs text-gray-400">…</span>
              )
            )}
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="px-2 py-1 text-xs border border-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100">Next ›</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YarnDyedStock;