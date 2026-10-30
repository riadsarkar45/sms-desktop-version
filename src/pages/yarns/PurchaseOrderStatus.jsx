import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChallanRecordModal } from './SpinningDeliveryModal';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';
import { useFetchData } from '../../hooks/fetch';

/* ----------------------------- Icons ----------------------------- */
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-gray-400">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor" />
  </svg>
);

const IconFilter = ({ active }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="shrink-0">
    <path d="M3 4.5h18l-7 8.2V19l-4 2v-8.3L3 4.5z" fill={active ? '#2563EB' : 'none'} stroke={active ? '#2563EB' : '#94A3B8'} strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const IconCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
    <path d="M4 12.5l5.5 5.5L20 7" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const IconSave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M17 21v-8H7v8M7 3v5h8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M4 7h16M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7m2 0v13a2 2 0 01-2 2H9a2 2 0 01-2-2V7h10z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconX = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const IconPen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconFilePlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

/* ----------------------------- Custom Confirm Modal ----------------------------- */
const CustomConfirmModal = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-red-600">
              <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Confirm Deletion</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors shadow-sm">Delete Row</button>
        </div>
      </div>
    </div>
  );
};

/* ----------------------------- Column definitions ----------------------------- */
const COLUMNS = [
  { key: 'authorized', label: 'STATUS', width: 130, type: 'boolean', getDisplay: (item) => (item.authorized ? 'Authorized' : 'Open') },
  { key: 'piNo', label: 'PI NO.', width: 110, type: 'text' },
  { key: 'piDate', label: 'PI DATE', width: 110, type: 'date' },
  { key: 'lcNo', label: 'LC NO.', width: 100, type: 'text' },
  { key: 'po', label: 'PO', width: 100, type: 'text' },
  { key: 'supplierName', label: 'SUPPLIER NAME', width: 170, type: 'text' },
  { key: 'yarnCount', label: 'YARN COUNT', width: 100, type: 'text' },
  { key: 'composition', label: 'COMPOSITION', width: 150, type: 'text' },
  { key: 'poQty', label: 'PO QTY', width: 110, type: 'number', numeric: true },
  { key: 'yarnReceivedFromSpinning', label: 'YARN RECEIVED FROM SPINNING', width: 180, type: 'number', numeric: true },
  { key: 'yarnReturnedToSpinning', label: 'YARN RETURNED TO SPINNING', width: 170, type: 'number', numeric: true },
  { key: 'pendingReceivedQty', label: 'PENDING RECEIVED QTY', width: 150, type: 'number', numeric: true },
  { key: 'remarks', label: 'REMARKS', width: 200, type: 'text' },
];

const NUMERIC_KEYS = COLUMNS.filter((c) => c.numeric).map((c) => c.key);
const PI_LEVEL_KEYS = ['authorized', 'piNo', 'piDate', 'lcNo', 'po', 'supplierName', 'remarks', '__auth'];

const LEADING_COLS = [{ key: '__auth', width: 50 }, { key: '__actions', width: 70 }];
const ALL_COLS = [...LEADING_COLS, ...COLUMNS];

const FROZEN_THROUGH_KEY = 'supplierName';
const FROZEN_COUNT = ALL_COLS.findIndex((c) => c.key === FROZEN_THROUGH_KEY) + 1;
const LEFT_OFFSETS = ALL_COLS.map((_, i) => ALL_COLS.slice(0, i).reduce((sum, c) => sum + c.width, 0));
const TABLE_MIN_WIDTH = ALL_COLS.reduce((sum, c) => sum + c.width, 0);
const FIRST_NUMERIC_IDX = ALL_COLS.findIndex((c) => c.numeric);
const isFrozen = (i) => i < FROZEN_COUNT;
const isLastFrozen = (i) => i === FROZEN_COUNT - 1;
const FROZEN_EDGE_SHADOW = 'shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)]';
const FOOTER_ROW_H = 44;

const getTodayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ----------------------------- Add / Modify PO Modal ----------------------------- */
function PORecordModal({ mode, initial, onSave, onClose }) {
  const [header, setHeader] = useState({
    piNo: initial.piNo || '',
    piDate: initial.piDate || getTodayISO(),
    lcNo: initial.lcNo || '',
    po: initial.po || '',
    supplierName: initial.supplierName || '',
    remarks: initial.remarks || '',
    authorized: initial.authorized || false,
  });

  const [items, setItems] = useState(initial.items || [{ yarnCount: '', composition: '', poQty: 0 }]);
  const [error, setError] = useState('');

  const initialRef = useRef(JSON.stringify({ header, items }));
  const isDirty = JSON.stringify({ header, items }) !== initialRef.current;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setHeaderField = (key, value) => {
    setHeader((prev) => ({ ...prev, [key]: value }));
    if (error) setError('');
  };

  const updateItem = (index, key, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
    if (error) setError('');
  };

  const addItem = () => {
    setItems((prev) => [...prev, { yarnCount: '', composition: '', poQty: 0 }]);
  };

  const removeItem = (index) => {
    if (items.length === 1) {
      setError('At least one yarn count is required.');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveClick = () => {
    if (!String(header.piNo || '').trim()) {
      setError('PI No. is required.');
      return;
    }
    if (items.some(item => !String(item.yarnCount || '').trim())) {
      setError('Yarn Count is required for all items.');
      return;
    }

    onSave({
      id: initial.id,
      ...header,
      items: items.map(item => ({
        id: item.id,
        yarnCount: String(item.yarnCount || '').trim(),
        composition: String(item.composition || '').trim(),
        poQty: Number(item.poQty) || 0,
      }))
    });
  };

  const inputBase = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{mode === 'add' ? 'Add New PO' : 'Modify PO'}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{mode === 'add' ? 'Fill in the details below. You can add multiple yarn counts.' : `Editing ${initial.piNo || 'record'}.`}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-gray-500 hover:bg-gray-100" title="Close (Esc)"><IconX /></button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {[
              { key: 'piNo', label: 'PI No.', type: 'text', required: true },
              { key: 'piDate', label: 'PI Date', type: 'date' },
              { key: 'lcNo', label: 'LC No.', type: 'text' },
              { key: 'po', label: 'PO', type: 'text' },
              { key: 'supplierName', label: 'Supplier Name', type: 'text' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                <input type={f.type} value={header[f.key] ?? ''} onChange={(e) => setHeaderField(f.key, e.target.value)} className={inputBase} autoFocus={f.key === 'piNo' && mode === 'add'} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Remarks</label>
              <textarea rows={2} value={header.remarks ?? ''} onChange={(e) => setHeaderField('remarks', e.target.value)} className={inputBase} />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-700">Yarn Details</h4>
              <button type="button" onClick={addItem} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors">
                <IconPlus /> Add Yarn Count
              </button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="relative bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="absolute top-2 right-2">
                    <button type="button" onClick={() => removeItem(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Remove this yarn count">
                      <IconTrash />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Yarn Count <span className="text-red-500">*</span></label>
                      <input type="text" value={item.yarnCount} onChange={(e) => updateItem(index, 'yarnCount', e.target.value)} className={inputBase} placeholder="e.g., 30s" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Composition</label>
                      <input type="text" value={item.composition} onChange={(e) => updateItem(index, 'composition', e.target.value)} className={inputBase} placeholder="e.g., 100% Cotton" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">PO Qty</label>
                      <input type="number" step="0.01" min="0" value={item.poQty} onChange={(e) => updateItem(index, 'poQty', e.target.value)} className={`${inputBase} text-right font-mono`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-600 font-medium bg-red-50 p-3 rounded-md">{error}</p>}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <span className="text-xs text-gray-400">Press Esc to discard &amp; close</span>
          <div className="flex items-center gap-3">
            {isDirty && (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors">Discard</button>
                <button onClick={handleSaveClick} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5">
                  <IconSave /> Save
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Filter Popover Component ----------------------------- */
const POPOVER_WIDTH = 224;
function FilterPopover({ column, values, activeSet, anchorRect, onApply, onClose }) {
  const ref = useRef(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(activeSet ? new Set(activeSet) : new Set(values));

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  if (!anchorRect) return null;

  const spaceBelow = window.innerHeight - anchorRect.bottom;
  const openUpward = spaceBelow < 320 && anchorRect.top > 320;
  const left = Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - 8);
  const style = openUpward ? { left, bottom: window.innerHeight - anchorRect.top + 4, width: POPOVER_WIDTH } : { left, top: anchorRect.bottom + 4, width: POPOVER_WIDTH };

  const visibleValues = values.filter((v) => v.toLowerCase().includes(search.toLowerCase()));
  const allVisibleChecked = visibleValues.length > 0 && visibleValues.every((v) => draft.has(v));

  const toggleSelectAll = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) visibleValues.forEach((v) => next.delete(v));
      else visibleValues.forEach((v) => next.add(v));
      return next;
    });
  };

  const toggleValue = (v) => {
    setDraft((prev) => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  };

  return createPortal(
    <div ref={ref} className="fixed z-[9999] bg-white border border-gray-300 rounded-md shadow-lg text-gray-800 normal-case font-normal text-xs" style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div className="p-2">
        <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items..." className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs outline-none focus:border-blue-500" />
      </div>
      <div className="mx-2 mb-2 border border-gray-200 rounded max-h-56 overflow-y-auto py-1">
        {visibleValues.length === 0 ? (
          <div className="px-3 py-3 text-gray-400 italic">No matches</div>
        ) : (
          <>
            <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer select-none font-semibold border-b border-gray-100" onClick={(e) => { e.preventDefault(); toggleSelectAll(); }}>
              <span className={`w-3.5 h-3.5 border border-gray-400 rounded-sm flex items-center justify-center shrink-0 ${allVisibleChecked ? 'bg-blue-600 border-blue-600' : 'bg-white'}`}>
                {allVisibleChecked && <IconCheck />}
              </span>
              <span>(Select All)</span>
            </label>
            {visibleValues.map((v) => {
              const checked = draft.has(v);
              return (
                <label key={v} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer select-none" onClick={(e) => { e.preventDefault(); toggleValue(v); }}>
                  <span className={`w-3.5 h-3.5 border border-gray-400 rounded-sm flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'bg-white'}`}>
                    {checked && <IconCheck />}
                  </span>
                  <span className="truncate">{v}</span>
                </label>
              );
            })}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 p-2 border-t border-gray-200 bg-gray-50 rounded-b-md">
        <button onClick={onClose} className="px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Cancel</button>
        <button onClick={() => onApply(draft)} className="px-2.5 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">APPLY</button>
      </div>
    </div>,
    document.body
  );
}

/* ----------------------------- Main Component ----------------------------- */
const PurchaseOrderStatus = () => {
  const [allData, setAllData] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [filters, setFilters] = useState({});
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [filterAnchorRect, setFilterAnchorRect] = useState(null);
  const tableScrollRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [newRowIds, setNewRowIds] = useState(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, id: null });
  const axiosPrivate = useAxiosPrivate();
  const [poModal, setPoModal] = useState(null);
  const [challanModal, setChallanModal] = useState(null);
  const [piNo, setPiNo] = useState(null);

  const { fetchData, error, loading } = useFetchData();

  const fmt = (num) => Number.isFinite(num) ? num.toFixed(2) : '0.00';
  const fmtDate = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const fmtMonthLabel = (monthStr) => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getColumnValue = (item, col) => (col.getDisplay ? col.getDisplay(item) : String(item[col.key]));

  const uniqueValues = useMemo(() => {
    const map = {};
    COLUMNS.forEach((col) => {
      const set = new Set();
      allData.forEach((row) => set.add(getColumnValue(row, col)));
      map[col.key] = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
    return map;
  }, [allData]);

  const availableMonths = useMemo(() => {
    const months = new Set();
    allData.forEach(item => { if (item.piDate) months.add(item.piDate.substring(0, 7)); });
    return Array.from(months).sort().reverse();
  }, [allData]);

  // FIXED: Updated to match the new API structure with movementTotals
  const flattenApiData = (apiData) => {
    if (!Array.isArray(apiData)) return [];
    return apiData.flatMap(pi => {
      const basePi = {
        piNo: pi.piNo || '',
        piDate: pi.piDate || getTodayISO(),
        lcNo: pi.lcNo || '',
        po: pi.poNo || '',
        supplierName: pi.supplierName || '',
        remarks: pi.remarks || '',
        authorized: pi.isAuthorized || false,
      };

      if (pi.items && pi.items.length > 0) {
        return pi.items.map(item => {
          const received = Number(item.movementTotals?.ReceivedFromSpinning) || 0;
          const returned = Number(item.movementTotals?.ReturnToSpinning) || 0;
          const poQty = Number(item.poQty) || 0;
          
          return {
            id: item.id,
            piId: pi.id,
            ...basePi,
            yarnCount: item.yarnCount || '',
            composition: item.composition || '',
            poQty: poQty,
            yarnReceivedFromSpinning: received,
            yarnReturnedToSpinning: returned,
            pendingReceivedQty: poQty - received - returned,
          };
        });
      } else {
        return [{
          id: pi.id,
          piId: pi.id,
          ...basePi,
          yarnCount: '',
          composition: '',
          poQty: 0,
          yarnReceivedFromSpinning: 0,
          yarnReturnedToSpinning: 0,
          pendingReceivedQty: 0,
        }];
      }
    });
  };

  useEffect(() => {
    fetchData('/api/yarn-purchase-data')
      .then((response) => {
        const dataArray = response?.data ? response.data : response;
        setAllData(flattenApiData(dataArray));
      })
      .catch((err) => {
        console.error('Error fetching purchase orders:', err);
      });
  }, [fetchData]);

  const filteredData = useMemo(() => {
    return allData.filter(item => {
      if (selectedMonth !== 'all' && item.piDate && !item.piDate.startsWith(selectedMonth)) return false;
      if (searchInput.trim()) {
        const q = searchInput.trim().toLowerCase();
        const hay = [item.piNo, item.lcNo, item.po, item.supplierName, item.yarnCount, item.composition].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const col of COLUMNS) {
        const active = filters[col.key];
        if (!active) continue;
        if (!active.has(getColumnValue(item, col))) return false;
      }
      return true;
    });
  }, [allData, selectedMonth, searchInput, filters]);

  const groupedData = useMemo(() => {
    const groups = new Map();
    filteredData.forEach(item => {
      if (!groups.has(item.piNo)) {
        groups.set(item.piNo, []);
      }
      groups.get(item.piNo).push(item);
    });
    return Array.from(groups.values());
  }, [filteredData]);

  const calculateTotals = (data) => {
    return NUMERIC_KEYS.reduce((acc, key) => {
      acc[key] = data.reduce((sum, item) => sum + (Number(item[key]) || 0), 0);
      return acc;
    }, {});
  };

  const filteredTotals = useMemo(() => calculateTotals(filteredData), [filteredData]);
  const grandTotals = useMemo(() => calculateTotals(allData), [allData]);

  const handleClear = () => { setSearchInput(''); setSelectedMonth('all'); setFilters({}); };
  const closeFilter = () => { setOpenFilterCol(null); setFilterAnchorRect(null); };

  const applyFilter = (colKey, set) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (set.size === uniqueValues[colKey].length) delete next[colKey];
      else next[colKey] = set;
      return next;
    });
    closeFilter();
  };

  const updateField = (id, key, rawValue) => {
    const col = COLUMNS.find((c) => c.key === key);
    const value = col && col.numeric ? (rawValue === '' ? '' : Number(rawValue)) : rawValue;

    if (key === 'authorized') {
      const targetRow = allData.find(r => r.id === id);
      if (!targetRow) return;
      const boolValue = !!value;
      setAllData((prev) => prev.map((row) =>
        row.piNo === targetRow.piNo ? { ...row, [key]: boolValue } : row
      ));
    } else {
      setAllData((prev) => prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [key]: value };
        if (['poQty', 'yarnReceivedFromSpinning', 'yarnReturnedToSpinning'].includes(key)) {
          const poQty = Number(updated.poQty) || 0;
          const received = Number(updated.yarnReceivedFromSpinning) || 0;
          const returned = Number(updated.yarnReturnedToSpinning) || 0;
          updated.pendingReceivedQty = poQty - received - returned;
        }
        return updated;
      }));
    }
    setIsDirty(true);
    setSavedFlash(false);
  };

  /* --- PO Modal Handlers --- */
  const openAddPOModal = () => {
    closeFilter();
    setPoModal({ 
      mode: 'add', 
      record: { 
        piNo: '', piDate: getTodayISO(), lcNo: '', po: '', supplierName: '', remarks: '', authorized: false,
        items: [{ yarnCount: '', composition: '', poQty: 0 }]
      } 
    });
  };

  const openEditPOModal = (item) => {
    closeFilter();
    const allItemsForPi = allData.filter(r => r.piNo === item.piNo);
    const header = { 
      piNo: item.piNo, piDate: item.piDate, lcNo: item.lcNo, po: item.po, 
      supplierName: item.supplierName, remarks: item.remarks, authorized: item.authorized 
    };
    const items = allItemsForPi.map(r => ({
      id: r.id, yarnCount: r.yarnCount, composition: r.composition, poQty: r.poQty,
    }));
    setPoModal({ mode: 'edit', record: { id: item.id, ...header, items } });
  };

  const handlePOModalSave = async (formData) => {
    if (poModal.mode === 'add') {
      const apiPayload = {
        piNo: String(formData.piNo || '').trim(),
        piDate: formData.piDate ? new Date(formData.piDate).toISOString() : new Date().toISOString(),
        lcNo: String(formData.lcNo || '').trim(),
        poNo: String(formData.po || '').trim(),
        supplierName: String(formData.supplierName || '').trim(),
        remarks: String(formData.remarks || '').trim(),
        isAuthorized: false,
        items: formData.items.map(item => ({
          yarnCount: String(item.yarnCount || '').trim(),
          composition: String(item.composition || '').trim(),
          poQty: Number(item.poQty) || 0,
          yarnReceivedFromSpinning: 0,
          yarnReturnedToSpinning: 0,
          pendingReceivedQty: Number(item.poQty) || 0,
        }))
      };

      try {
        const res = await axiosPrivate.post('/api/purchase-yarn-pi', apiPayload);
        console.log('✅ Added PO with multiple yarns:', res.data);
        
        const maxId = allData.length > 0 ? Math.max(...allData.map((r) => r.id)) : 0;
        const newRows = formData.items.map((item, index) => {
          const poQty = Number(item.poQty) || 0;
          return {
            id: maxId + 1 + index, piNo: formData.piNo, piDate: formData.piDate, lcNo: formData.lcNo,
            po: formData.po, supplierName: formData.supplierName, remarks: formData.remarks,
            yarnCount: item.yarnCount, composition: item.composition, poQty,
            yarnReceivedFromSpinning: 0, yarnReturnedToSpinning: 0, pendingReceivedQty: poQty,
            authorized: false,
          };
        });
        
        setAllData((prev) => [...newRows, ...prev]);
        const newIds = new Set(newRows.map(r => r.id));
        setNewRowIds((prev) => { const next = new Set(prev); newIds.forEach(id => next.add(id)); return next; });
      } catch (error) {
        console.error("❌ Failed to add PO:", error);
        alert("Failed to save PO to database. Please try again.");
        return;
      }
    } else {
      const existing = allData.find((r) => r.id === formData.id);
      if (!existing) return;

      const existingByYarn = new Map();
      allData.filter(r => r.piNo === formData.piNo).forEach(r => {
        existingByYarn.set(r.yarnCount, r);
      });

      const apiPayload = {
        piNo: String(formData.piNo || '').trim(),
        piDate: formData.piDate ? new Date(formData.piDate).toISOString() : new Date().toISOString(),
        lcNo: String(formData.lcNo || '').trim(),
        poNo: String(formData.po || '').trim(),
        supplierName: String(formData.supplierName || '').trim(),
        remarks: String(formData.remarks || '').trim(),
        isAuthorized: formData.authorized || false,
        items: formData.items.map(item => {
          const exRow = existingByYarn.get(item.yarnCount);
          return {
            id: exRow ? exRow.id : undefined,
            yarnCount: String(item.yarnCount || '').trim(),
            composition: String(item.composition || '').trim(),
            poQty: Number(item.poQty) || 0,
            yarnReceivedFromSpinning: exRow ? Number(exRow.yarnReceivedFromSpinning) || 0 : 0,
            yarnReturnedToSpinning: exRow ? Number(exRow.yarnReturnedToSpinning) || 0 : 0,
            pendingReceivedQty: exRow ? Number(exRow.pendingReceivedQty) || 0 : (Number(item.poQty) || 0),
          };
        })
      };

      try {
        const res = await axiosPrivate.put(`/api/purchase-orders/pi/${encodeURIComponent(formData.piNo)}`, apiPayload);
        console.log('✅ Updated PO:', res.data);
        
        const maxId = allData.length > 0 ? Math.max(...allData.map((r) => r.id)) : 0;
        let nextId = maxId + 1;
        const newRows = formData.items.map((item) => {
          const exRow = existingByYarn.get(item.yarnCount);
          const poQty = Number(item.poQty) || 0;
          if (exRow) {
            const received = Number(exRow.yarnReceivedFromSpinning) || 0;
            const returned = Number(exRow.yarnReturnedToSpinning) || 0;
            return {
              ...exRow,
              piNo: formData.piNo, piDate: formData.piDate, lcNo: formData.lcNo,
              po: formData.po, supplierName: formData.supplierName, remarks: formData.remarks,
              yarnCount: item.yarnCount, composition: item.composition, poQty,
              pendingReceivedQty: poQty - received - returned,
              authorized: formData.authorized || false,
            };
          } else {
            return {
              id: nextId++, piNo: formData.piNo, piDate: formData.piDate, lcNo: formData.lcNo,
              po: formData.po, supplierName: formData.supplierName, remarks: formData.remarks,
              yarnCount: item.yarnCount, composition: item.composition, poQty,
              yarnReceivedFromSpinning: 0, yarnReturnedToSpinning: 0, pendingReceivedQty: poQty,
              authorized: formData.authorized || false,
            };
          }
        });
        
        setAllData((prev) => {
          const filtered = prev.filter(r => r.piNo !== formData.piNo);
          return [...newRows, ...filtered];
        });
        
        setNewRowIds((prev) => { const next = new Set(prev); next.delete(formData.id); return next; });
      } catch (error) {
        console.error("❌ Failed to update PO:", error);
        alert("Failed to update PO in database. Please try again.");
        return;
      }
    }

    setIsDirty(true);
    setSavedFlash(false);
    setPoModal(null);
  };

  /* --- Challan Modal Handlers --- */
  const openAddChallanModal = (targetPiNo) => {
    closeFilter();
    setPiNo(targetPiNo);
    
    // Pre-fill data if a specific PI is targeted
    const existingItem = targetPiNo ? allData.find(r => r.piNo === targetPiNo) : null;
    const defaultPoQty = existingItem ? Number(existingItem.poQty) || 0 : 0;

    setChallanModal({ 
      mode: 'add', 
      record: { 
        id: Date.now(), 
        date: new Date().toISOString().split('T')[0], 
        challan: '', 
        piNo: targetPiNo || '', 
        lcNo: existingItem?.lcNo || '', 
        supplierName: existingItem?.supplierName || '', 
        yarnCount: existingItem?.yarnCount || '', 
        yarnComposition: existingItem?.composition || '', 
        compositionId: null, 
        poQty: defaultPoQty,
        yarnReceived: 0, 
        yarnReturned: 0, 
        remarks: '' 
      } 
    });
  };

  const openEditChallanModal = (item) => {
    closeFilter();
    setChallanModal({ 
      mode: 'edit', 
      record: { 
        ...item, 
        yarnReceived: item.yarnReceivedFromSpinning || 0,
        yarnReturned: item.yarnReturnedToSpinning || 0
      } 
    });
  };

  const closeChallanModal = () => setChallanModal(null);

  const handleChallanModalSave = (data) => {
    setAllData((prev) => {
      const existingIndex = prev.findIndex(r => r.id === data.id);
      
      if (existingIndex !== -1 && challanModal.mode === 'edit') {
        return prev.map((row) => {
          if (row.id === data.id) {
            const received = data.yarnReceived !== undefined ? Number(data.yarnReceived) : Number(row.yarnReceivedFromSpinning);
            const returned = data.yarnReturned !== undefined ? Number(data.yarnReturned) : Number(row.yarnReturnedToSpinning);
            const poQty = Number(data.poQty) !== 0 ? Number(data.poQty) : Number(row.poQty);
            
            return {
              ...row,
              ...data,
              poQty: poQty,
              yarnReceivedFromSpinning: received,
              yarnReturnedToSpinning: returned,
              pendingReceivedQty: poQty - received - returned,
            };
          }
          return row;
        });
      } else {
        const maxId = prev.length > 0 ? Math.max(...prev.map((r) => r.id || 0)) : 0;
        const received = Number(data.yarnReceived) || 0;
        const returned = Number(data.yarnReturned) || 0;
        const poQty = Number(data.poQty) || 0;
        
        const newRow = {
          ...data,
          id: maxId + 1,
          piNo: data.piNo || piNo || '',
          yarnReceivedFromSpinning: received,
          yarnReturnedToSpinning: returned,
          pendingReceivedQty: poQty - received - returned,
        };
        return [newRow, ...prev];
      }
    });
    setIsDirty(true);
    setSavedFlash(false);
    setChallanModal(null);
  };

  const handleDeleteRow = (id) => {
    if (!newRowIds.has(id)) return;
    setDeleteConfirm({ isOpen: true, id });
  };

  const confirmDelete = () => {
    const id = deleteConfirm.id;
    setAllData((prev) => prev.filter((row) => row.id !== id));
    setNewRowIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    setIsDirty(true);
    setSavedFlash(false);
    setDeleteConfirm({ isOpen: false, id: null });
  };

  const buildNestedPayload = (rows) => {
    const groupedMap = new Map();
    rows.forEach((row) => {
      const currentPiNo = String(row.piNo || '').trim() || `TEMP_PI_${row.id}`;
      if (!groupedMap.has(currentPiNo)) {
        groupedMap.set(currentPiNo, {
          id: row.piId || undefined,
          piNo: row.piNo,
          piDate: row.piDate ? new Date(row.piDate).toISOString() : new Date().toISOString(),
          lcNo: row.lcNo,
          poNo: row.po,
          supplierName: row.supplierName,
          remarks: row.remarks,
          isAuthorized: row.authorized,
          items: [],
        });
      }
      const group = groupedMap.get(currentPiNo);
      group.items.push({
        id: row.id && typeof row.id === 'number' ? row.id : undefined,
        yarnCount: row.yarnCount,
        composition: row.composition,
        poQty: Number(row.poQty) || 0,
        yarnReceivedFromSpinning: Number(row.yarnReceivedFromSpinning) || 0,
        yarnReturnedToSpinning: Number(row.yarnReturnedToSpinning) || 0,
        pendingReceivedQty: Number(row.pendingReceivedQty) || 0,
      });
    });
    return Array.from(groupedMap.values());
  };

  const handleSave = async () => {
    const submissionPayload = buildNestedPayload(allData);
    console.log('🚀 FUNCTIONAL SUBMISSION PAYLOAD (Nested Structure):', JSON.stringify(submissionPayload, null, 2));

    try {
      await axiosPrivate.post('/api/purchase-orders/bulk', submissionPayload);
      setIsDirty(false);
      setSavedFlash(true);
      setNewRowIds(new Set());
      alert(`✅ Successfully submitted ${submissionPayload.length} PI group(s) to the database!`);
      setTimeout(() => setSavedFlash(false), 3000);
      
      const response = await fetchData('/api/yarn-purchase-data');
      const dataArray = response?.data ? response.data : response;
      setAllData(flattenApiData(dataArray));
    } catch (error) {
      console.error('❌ Submission failed:', error);
      alert('Failed to submit data. Please check your connection and try again.');
    }
  };

  const renderBodyCell = (col, i, item, stripe, rowSpan = 1) => {
    const frozen = isFrozen(i);
    const isPiLevel = PI_LEVEL_KEYS.includes(col.key);
    const base = `border-b border-r border-gray-300 ${frozen ? `sticky z-10 ${stripe} group-hover:bg-yellow-50` : ''} ${isLastFrozen(i) ? FROZEN_EDGE_SHADOW : ''}`;
    const style = frozen ? { left: LEFT_OFFSETS[i] } : undefined;
    const rowSpanAttr = rowSpan > 1 ? { rowSpan } : {};
    const alignAttr = isPiLevel && rowSpan > 1 ? { className: `${base} align-middle` } : { className: base };

    if (col.key === '__auth') {
      return (
        <td key={col.key} {...alignAttr} style={style} {...rowSpanAttr}>
          <div className="px-2 py-2 text-center">
            <input type="checkbox" checked={!!item.authorized} onChange={(e) => updateField(item.id, 'authorized', e.target.checked)} className="w-4 h-4 accent-emerald-600 cursor-pointer" />
          </div>
        </td>
      );
    }
    if (col.key === '__actions') {
      return (
        <td key={col.key} {...alignAttr} style={style}>
          <div className="px-2 py-2 text-center">
            {newRowIds.has(item.id) ? (
              <button onClick={() => handleDeleteRow(item.id)} title="Remove this newly added row" className="p-1.5 rounded text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"><IconTrash /></button>
            ) : <span className="text-gray-300 select-none">—</span>}
          </div>
        </td>
      );
    }
    if (col.key === 'authorized') {
      return (
        <td key={col.key} {...alignAttr} style={style} {...rowSpanAttr}>
          <div className="px-3 py-2 flex items-center justify-center">
            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap ${item.authorized ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {item.authorized ? 'Authorized' : 'Open'}
            </span>
          </div>
        </td>
      );
    }
    if (col.key === 'piNo') {
      return (
        <td key={col.key} {...alignAttr} style={style} {...rowSpanAttr}>
          <div className="p-0 select-none">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-gray-900">{item.piNo || '-'}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button 
                  onClick={(e) => { e.stopPropagation(); openAddChallanModal(item.piNo); }} 
                  className="p-1.5 rounded text-indigo-600 hover:bg-indigo-50 transition-colors" 
                  title="Add Challan for this PI"
                >
                  <IconFilePlus />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); openEditPOModal(item); }} 
                  className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors" 
                  title="Modify PO"
                >
                  <IconPen />
                </button>
              </div>
            </div>
          </div>
        </td>
      );
    }
    if (col.key === 'pendingReceivedQty') {
      return (
        <td key={col.key} {...alignAttr} style={style} {...rowSpanAttr}>
          <div className={`px-3 py-2 text-right whitespace-nowrap font-mono tabular-nums font-semibold ${item.pendingReceivedQty > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {fmt(Number(item.pendingReceivedQty) || 0)}
          </div>
        </td>
      );
    }
    return (
      <td key={col.key} {...alignAttr} style={style} {...rowSpanAttr}>
        <span className={`block px-3 py-2 text-gray-900 ${col.numeric ? 'text-right font-mono tabular-nums' : 'truncate'}`}>
          {col.key === 'piDate' ? fmtDate(item[col.key]) : (col.numeric ? fmt(Number(item[col.key]) || 0) : (item[col.key] || '-'))}
        </span>
      </td>
    );
  };

  const footerCellStyle = { bottom: 0, height: FOOTER_ROW_H };

  if (loading) {
    return (
      <div className="p-4 md:p-6 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 font-medium">Loading purchase orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen font-sans">
      <CustomConfirmModal isOpen={deleteConfirm.isOpen} message="Are you sure you want to remove this newly added row? This action cannot be undone." onConfirm={confirmDelete} onCancel={() => setDeleteConfirm({ isOpen: false, id: null })} />

      {poModal && (
        <PORecordModal key={`${poModal.mode}-${poModal.record.id}`} mode={poModal.mode} initial={poModal.record} onSave={handlePOModalSave} onClose={() => setPoModal(null)} />
      )}

      {challanModal && (
        <ChallanRecordModal
          key={`${challanModal.mode}-${challanModal.record.id}`}
          mode={challanModal.mode}
          initial={challanModal.record}
          onSave={handleChallanModalSave}
          onClose={closeChallanModal}
          piNo={piNo}
        />
      )}

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><span className="w-1 h-4 bg-blue-600 rounded-full"></span> Quick Summary</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border-l-4 border-blue-600 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total PO Qty</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(grandTotals.poQty || 0)}</p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-emerald-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Received From Spinning</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(grandTotals.yarnReceivedFromSpinning || 0)}</p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-orange-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Returned To Spinning</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(grandTotals.yarnReturnedToSpinning || 0)}</p>
          </div>
          <div className="bg-white rounded-lg border-l-4 border-red-500 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Pending Received Qty</p>
            <p className="text-2xl font-bold text-gray-900">{fmt(grandTotals.pendingReceivedQty || 0)}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-t-lg border border-gray-200 border-b-0 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <input type="text" placeholder="Search PI, LC, PO, Supplier..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="absolute left-3 top-2.5"><IconSearch /></div>
          </div>
          {searchInput.length > 0 && (
            <button onClick={handleClear} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors border border-gray-300 flex items-center gap-1.5"><IconX /> Clear</button>
          )}
          <button onClick={openAddPOModal} className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 transition-colors flex items-center gap-1.5"><IconPlus /> Add PO</button>
          <button onClick={() => openAddChallanModal(null)} className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-1.5"><IconFilePlus /> Add Challan</button>
          
          {isDirty && (
            <button onClick={handleSave} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1.5 animate-pulse"><IconSave /> Save & Submit</button>
          )}
          {savedFlash && <span className="text-sm font-medium text-emerald-600 flex items-center gap-1"><IconCheck /> Submitted</span>}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            Month Filter:
          </label>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm">
            <option value="all">All Months</option>
            {availableMonths.map(month => (<option key={month} value={month}>{fmtMonthLabel(month)}</option>))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
        <div ref={tableScrollRef} onScroll={closeFilter} className="overflow-x-auto overflow-y-auto max-h-[600px]">
          <table className="text-sm" style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed', width: '100%', minWidth: TABLE_MIN_WIDTH }}>
            <colgroup>{ALL_COLS.map((col, i) => (<col key={col.key} style={i === ALL_COLS.length - 1 ? undefined : { width: col.width }} />))}</colgroup>
            <thead>
              <tr>
                {ALL_COLS.map((col, i) => {
                  const frozen = isFrozen(i);
                  const thBase = `sticky top-0 ${frozen ? 'z-40' : 'z-30'} border-b border-r border-gray-300 bg-gray-100 ${isLastFrozen(i) ? FROZEN_EDGE_SHADOW : ''}`;
                  const thStyle = frozen ? { left: LEFT_OFFSETS[i] } : undefined;

                  if (col.key === '__auth') return <th key={col.key} className={`${thBase} px-2 py-3 text-center font-bold text-gray-700 uppercase text-xs align-top`} style={thStyle}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="mx-auto text-gray-600"><path d="M4 12.5l5.5 5.5L20 7" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /></svg></th>;
                  if (col.key === '__actions') return <th key={col.key} className={`${thBase} px-2 py-3 text-center font-bold text-gray-700 uppercase text-xs align-top`} style={thStyle}>Actions</th>;

                  const isFiltered = !!filters[col.key];
                  return (
                    <th key={col.key} className={`${thBase} px-2 py-3 text-left font-bold text-gray-700 uppercase text-xs align-top`} style={thStyle}>
                      <div className="flex items-start justify-between gap-1">
                        <span className={`whitespace-normal break-words leading-tight ${col.numeric ? 'text-right w-full' : ''}`}>{col.label}</span>
                        <button onClick={(e) => { if (openFilterCol === col.key) closeFilter(); else { setFilterAnchorRect(e.currentTarget.getBoundingClientRect()); setOpenFilterCol(col.key); } }} className={`shrink-0 p-1 rounded mt-0.5 ${isFiltered ? 'bg-blue-100' : 'hover:bg-gray-200'}`} title={`Filter ${col.label}`}><IconFilter active={isFiltered} /></button>
                      </div>
                      {openFilterCol === col.key && (<FilterPopover column={col} values={uniqueValues[col.key]} activeSet={filters[col.key]} anchorRect={filterAnchorRect} onApply={(set) => applyFilter(col.key, set)} onClose={closeFilter} />)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groupedData.length > 0 ? groupedData.map((group, groupIndex) => {
                const stripe = groupIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                return group.map((item, rowIndex) => {
                  const isFirstInGroup = rowIndex === 0;
                  const rowSpan = group.length;

                  return (
                    <tr key={item.id} className={`group ${stripe} hover:bg-yellow-50 transition-colors`}>
                      {ALL_COLS.map((col, i) => {
                        const isPiLevel = PI_LEVEL_KEYS.includes(col.key);
                        if (isPiLevel && !isFirstInGroup) {
                          return null;
                        }
                        return renderBodyCell(col, i, item, stripe, isFirstInGroup && isPiLevel ? rowSpan : 1);
                      })}
                    </tr>
                  );
                });
              }) : (
                <tr>
                  <td colSpan={ALL_COLS.length} className="px-6 py-12 text-center text-gray-500 italic bg-white">No records found matching your search or filter criteria.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={FROZEN_COUNT} className={`sticky z-40 px-3 text-right text-sm font-bold text-gray-800 border-t-2 border-r border-b border-gray-400 uppercase tracking-wider bg-gray-100 ${FROZEN_EDGE_SHADOW}`} style={{ left: 0, ...footerCellStyle }}>Footer Sub-Total:</td>
                {FIRST_NUMERIC_IDX - FROZEN_COUNT > 0 && <td colSpan={FIRST_NUMERIC_IDX - FROZEN_COUNT} className="sticky z-30 border-t-2 border-r border-b border-gray-400 bg-gray-100" style={footerCellStyle} />}
                {NUMERIC_KEYS.map((key) => (
                  <td key={key} className={`sticky z-30 px-3 text-right text-sm font-bold border-t-2 border-r border-b border-gray-400 whitespace-nowrap font-mono tabular-nums bg-green-50 ${
                    key === 'pendingReceivedQty'
                      ? (filteredTotals.pendingReceivedQty > 0 ? 'text-red-600' : 'text-green-600')
                      : 'text-gray-800'
                  }`} style={footerCellStyle}>
                    {fmt(filteredTotals[key])}
                  </td>
                ))}
                <td className="sticky z-30 border-t-2 border-r border-b border-gray-400 bg-gray-100" style={footerCellStyle} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="mt-3 text-right text-xs text-gray-500 font-medium">Showing {filteredData.length} of {allData.length} records</div>
    </div>
  );
};

export default PurchaseOrderStatus;