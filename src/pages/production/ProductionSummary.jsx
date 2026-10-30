import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useFetchData } from '../../hooks/fetch';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

const HEADER_ROW1_HEIGHT = 34;
const HEADER_ROW2_HEIGHT = 30;
const HEADER_TOTAL_HEIGHT = HEADER_ROW1_HEIGHT + HEADER_ROW2_HEIGHT;

const colWidths = { buyer: 100, jobNumber: 110, color: 190, orderQty: 90, hod: 120 };

const frozenColumns = {
    buyer: 0,
    jobNumber: colWidths.buyer,
    color: colWidths.buyer + colWidths.jobNumber,
    orderQty: colWidths.buyer + colWidths.jobNumber + colWidths.color,
    hod: colWidths.buyer + colWidths.jobNumber + colWidths.color + colWidths.orderQty,
};

const filterableColumns = [
    'buyer', 'jobNumber', 'color', 'orderQty', 'hod', 'hodDate',
    'dailyCutting', 'totalCutting', 'dailyInput', 'totalInput', 'dailySewing', 'totalSewing',
    'dailyFinishingRcvd', 'totalFinishingRcvd', 'dailyFinishing', 'totalFinishing',
    'dailyShipment', 'totalShipment', 'plannedLeftover', 'physicalFound', 'leftFoundPercent', 'remarks'
];

const subHeaders = [
    { key: 'dailyCutting', label: 'TODAY CUTTING' }, { key: 'totalCutting', label: 'TOTAL CUTTING' },
    { key: 'dailyInput', label: 'TODAY INPUT' }, { key: 'totalInput', label: 'TOTAL INPUT' },
    { key: 'dailySewing', label: 'TODAY SEWING' }, { key: 'totalSewing', label: 'TOTAL SEWING' },
    { key: 'dailyFinishingRcvd', label: 'TODAY FIN. RCVD' }, { key: 'totalFinishingRcvd', label: 'TOTAL FIN. RCVD' },
    { key: 'dailyFinishing', label: 'TODAY FINISHING' }, { key: 'totalFinishing', label: 'TOTAL FINISHING' },
    { key: 'dailyShipment', label: 'TODAY SHIPMENT' }, { key: 'totalShipment', label: 'TOTAL SHIPMENT' },
    { key: 'plannedLeftover', label: 'PLANNED LEFTOVER' }, { key: 'physicalFound', label: 'PHYSICAL FOUND' },
    { key: 'leftFoundPercent', label: 'LEFT. FOUND (%)' },
];

const exportColumns = [
    { key: 'buyer', label: 'BUYER' }, { key: 'jobNumber', label: 'JOB NUMBER' },
    { key: 'color', label: 'COLOR' }, { key: 'orderQty', label: 'ORDER QTY' }, { key: 'hod', label: 'HOD' },
    { key: 'dailyCutting', label: 'TODAY CUTTING' }, { key: 'totalCutting', label: 'TOTAL CUTTING' },
    { key: 'dailyInput', label: 'TODAY INPUT' }, { key: 'totalInput', label: 'TOTAL INPUT' },
    { key: 'dailySewing', label: 'TODAY SEWING' }, { key: 'totalSewing', label: 'TOTAL SEWING' },
    { key: 'dailyFinishingRcvd', label: 'TODAY FIN. RCVD' }, { key: 'totalFinishingRcvd', label: 'TOTAL FIN. RCVD' },
    { key: 'dailyFinishing', label: 'TODAY FINISHING' }, { key: 'totalFinishing', label: 'TOTAL FINISHING' },
    { key: 'dailyShipment', label: 'TODAY SHIPMENT' }, { key: 'totalShipment', label: 'TOTAL SHIPMENT' },
    { key: 'plannedLeftover', label: 'PLANNED LEFTOVER' }, { key: 'physicalFound', label: 'PHYSICAL FOUND' },
    { key: 'leftFoundPercent', label: 'LEFT. FOUND (%)' }, { key: 'remarks', label: 'REMARKS' },
];

const initialTableData = [
    { buyer: 'Nike', jobNumber: 'JOB001', orderNo: 'ORD-001', color: 'Blue', orderQty: 1000, hod: 'John Doe', dailyCutting: 100, totalCutting: 500, dailyInput: 95, totalInput: 480, dailySewing: 90, totalSewing: 450, dailyFinishingRcvd: 85, totalFinishingRcvd: 430, dailyFinishing: 80, totalFinishing: 400, dailyShipment: 75, totalShipment: 380, plannedLeftover: 20, physicalFound: 18, leftFoundPercent: 90, remarks: 'On track' },
];

const isLastFrozen = (columnKey) => columnKey === 'hod';
const thClass = 'sticky z-20 border-b border-r border-[#7f7f7f] px-1.5 text-center font-bold text-[11px] whitespace-nowrap align-middle box-border overflow-hidden';
const clickableTdClass = 'cursor-pointer decoration-dotted underline decoration-1 underline-offset-2 hover:brightness-95';

const getUniqueValues = (data, key) => {
    const unique = [...new Set(data.map(item => item[key]))];
    return unique.sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
};

const ExcelInput = ({ numeric = false, value = '', onChange, className = '', placeholder = '' }) => {
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const scope = e.target.closest('table') || document;
            const inputs = Array.from(scope.querySelectorAll('input:not([disabled])'));
            const idx = inputs.indexOf(e.target);
            if (idx > -1 && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
                inputs[idx + 1].select();
            }
        }
    };
    const handleChange = (e) => {
        let v = e.target.value;
        if (numeric) v = v.replace(/[^0-9]/g, '');
        onChange(v);
    };
    return (
        <input type="text" inputMode={numeric ? 'numeric' : 'text'} value={value} placeholder={placeholder} onChange={handleChange} onKeyDown={handleKeyDown} className={`w-full h-full px-2 py-1 outline-none bg-transparent border border-transparent hover:border-gray-400 focus:border-[#217346] focus:shadow-[inset_0_0_0_1px_#217346] text-[13px] ${className}`} />
    );
};

const DraggableModal = ({ title, children, onClose }) => {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const currentOffset = useRef({ x: 0, y: 0 });
    const headerRef = useRef(null);

    useEffect(() => { setOffset({ x: 0, y: 0 }); currentOffset.current = { x: 0, y: 0 }; }, [title]);
    useEffect(() => {
        const handleMouseDown = (e) => {
            if (e.target.closest('button')) return;
            isDragging.current = true;
            startPos.current = { x: e.clientX - currentOffset.current.x, y: e.clientY - currentOffset.current.y };
            document.body.style.userSelect = 'none';
        };
        const handleMouseMove = (e) => {
            if (!isDragging.current) return;
            e.preventDefault();
            currentOffset.current = { x: e.clientX - startPos.current.x, y: e.clientY - startPos.current.y };
            setOffset({ ...currentOffset.current });
        };
        const handleMouseUp = () => {
            if (isDragging.current) { isDragging.current = false; document.body.style.userSelect = ''; }
        };
        const headerEl = headerRef.current;
        if (headerEl) headerEl.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            if (headerEl) headerEl.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4" onClick={onClose}>
            <div className="bg-white rounded shadow-2xl w-full max-w-2xl border border-gray-400 max-h-[85vh] flex flex-col" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} onClick={(e) => e.stopPropagation()}>
                <div ref={headerRef} className="flex justify-between items-center px-3 py-2 border-b border-gray-400 bg-[#217346] cursor-move select-none flex-shrink-0">
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        {title}
                    </h3>
                    <button onClick={onClose} className="text-white hover:bg-red-600 rounded px-2 py-0.5 text-xl leading-none transition-colors">×</button>
                </div>
                <div className="p-4 overflow-y-auto flex-1">{children}</div>
            </div>
        </div>
    );
};

const FilterIcon = ({ active, onOpen }) => (
    <span className={`cursor-pointer p-0.5 rounded inline-flex items-center justify-center flex-shrink-0 ${active ? 'text-blue-600 bg-blue-100' : 'text-gray-500 hover:bg-gray-300'}`} onClick={(e) => { e.stopPropagation(); onOpen(e); }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
    </span>
);

const StickyTh = ({ children, columnKey, label, colSpan, rowSpan, filterActive, onOpenFilter }) => {
    const isFrozen = Object.prototype.hasOwnProperty.call(frozenColumns, columnKey);
    const left = frozenColumns[columnKey] || 0;
    const width = colWidths[columnKey] || 'auto';
    const hasFilter = filterableColumns.includes(columnKey);
    const height = rowSpan === 2 ? HEADER_TOTAL_HEIGHT : HEADER_ROW1_HEIGHT;
    return (
        <th colSpan={colSpan} rowSpan={rowSpan} className={`bg-[#d9d9d9] border-b border-r border-[#7f7f7f] px-1.5 text-center font-bold text-[#262626] align-middle overflow-hidden ${isFrozen ? 'sticky z-40' : 'sticky top-0 z-20'} ${isLastFrozen(columnKey) ? 'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.25)]' : ''}`} style={{ height: `${height}px`, boxSizing: 'border-box', ...(isFrozen ? { left: `${left}px`, top: 0 } : {}), ...(width !== 'auto' ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : {}) }}>
            <div className="flex items-center justify-center gap-1 h-full">
                <span className="whitespace-normal break-words leading-tight text-center text-[11px]">{children}</span>
                {hasFilter && <FilterIcon active={filterActive} onOpen={onOpenFilter} />}
            </div>
        </th>
    );
};

const StickyTd = ({ children, columnKey, className = '', isEvenRow, rowSpan = 1 }) => {
    const isFrozen = Object.prototype.hasOwnProperty.call(frozenColumns, columnKey);
    const left = frozenColumns[columnKey] || 0;
    const width = colWidths[columnKey] || 'auto';
    return (
        <td rowSpan={rowSpan} className={`border-b border-r border-[#d0d0d0] px-2 py-1.5 text-center text-[13px] align-middle ${isFrozen ? 'sticky z-10' : ''} ${isEvenRow ? 'bg-white' : 'bg-[#f7f7f7]'} ${isLastFrozen(columnKey) ? 'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)]' : ''} ${rowSpan > 1 ? 'font-semibold' : ''} ${className}`} style={{ ...(isFrozen ? { left: `${left}px` } : {}), ...(width !== 'auto' ? { width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` } : {}) }}>
            <div className="whitespace-normal break-words leading-snug">{children}</div>
        </td>
    );
};

const FilterDropdown = ({ activeFilter, filterSearch, onSearchChange, filterValues, onFilterChange, onClose, data }) => {
    const dropdownRef = useRef(null);
    useEffect(() => {
        const handleClickOutside = (event) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target)) onClose(); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (!activeFilter) return null;
    const { key, label, rect } = activeFilter;
    const uniqueValues = getUniqueValues(data, key);
    const filteredValues = uniqueValues.filter(v => String(v).toLowerCase().includes(filterSearch.toLowerCase()));
    const currentFilters = filterValues[key] || [];

    return (
        <div ref={dropdownRef} className="fixed bg-white border border-black rounded shadow-xl z-[9999] w-64 flex flex-col" style={{ top: `${rect.bottom + 5}px`, left: `${rect.left}px` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-2 border-b border-gray-200 bg-gray-100 font-bold text-sm">
                <span>Filter: {label}</span>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-lg leading-none">×</button>
            </div>
            <div className="p-2 border-b border-gray-200">
                <div className="relative">
                    <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" placeholder="Search..." value={filterSearch} onChange={(e) => onSearchChange(e.target.value)} className="w-full pl-7 pr-2 py-1.5 text-sm border border-black rounded focus:outline-none focus:border-blue-500" autoFocus />
                </div>
            </div>
            <div className="overflow-y-auto max-h-60 p-1">
                {filteredValues.length === 0 ? (<div className="text-sm text-gray-500 text-center py-2">No results found</div>) : (
                    filteredValues.map((value, idx) => (
                        <label key={idx} className="flex items-center p-1.5 px-2 cursor-pointer rounded hover:bg-gray-100 text-sm">
                            <input type="checkbox" className="mr-2 accent-blue-600" checked={currentFilters.includes(value)} onChange={(e) => { if (e.target.checked) onFilterChange(key, [...currentFilters, value]); else onFilterChange(key, currentFilters.filter(v => v !== value)); }} />
                            <span>{String(value)}</span>
                        </label>
                    ))
                )}
            </div>
            <div className="flex gap-2 p-2 border-t border-gray-200 bg-gray-50">
                <button className="flex-1 px-3 py-1.5 border border-blue-600 rounded bg-blue-600 text-white text-xs cursor-pointer hover:bg-blue-700" onClick={onClose}>Apply</button>
                <button className="flex-1 px-3 py-1.5 border border-black rounded bg-white text-gray-700 text-xs cursor-pointer hover:bg-gray-100" onClick={() => { onFilterChange(key, []); onClose(); }}>Clear</button>
            </div>
        </div>
    );
};

const ModalJobHeader = ({ row, modalDate, onDateChange }) => (
    <div className="text-sm mb-3 border border-gray-400 rounded overflow-hidden bg-[#f9f9f9]">
        <div className="flex border-b border-gray-400">
            <div className="w-32 bg-[#e7e6e6] font-semibold px-2 py-1.5 border-r border-gray-400 text-gray-700">Job Name</div>
            <div className="flex-1 px-2 py-1.5 font-medium text-gray-800">{row?.jobNo || row?.jobNumber}</div>
        </div>
        <div className="flex">
            <div className="w-32 bg-[#e7e6e6] font-semibold px-2 py-1.5 border-r border-gray-400 text-gray-700">Date</div>
            <div className="flex-1 px-2 py-1.5">
                <input type="date" value={modalDate} onChange={(e) => onDateChange(e.target.value)} className="border border-gray-400 rounded px-2 py-1 text-sm w-44 outline-none focus:border-2 focus:border-[#217346] transition-colors" />
            </div>
        </div>
    </div>
);

const ProductionSummary = () => {
    const [filterValues, setFilterValues] = useState({});
    const [activeFilter, setActiveFilter] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');
    const [tableData, setTableData] = useState(initialTableData);
    const [activeModal, setActiveModal] = useState(null);
    const [modalDate, setModalDate] = useState('');
    const [modalRows, setModalRows] = useState([]);
    const [modalTargetForm, setModalTargetForm] = useState({ numberOfMC: '', lineNumber: '', targetHour: '', productionTarget: '' });
    const [editingRowIndex, setEditingRowIndex] = useState(null);
    const [editingRemarksValue, setEditingRemarksValue] = useState('');
    const [dataForProduction, setDataForProduction] = useState([]);
    const [colorId, setColorId] = useState("");
    const [modalError, setModalError] = useState('');
    
    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const jobsPerPage = 30;

    const { fetchData } = useFetchData();
    const axiosPrivate = useAxiosPrivate();

    const productionData = () => {
        return fetchData('/api/production-data')
            .then((res) => {
                const responseData = res.data?.data || res.data;
                const jobs = responseData?.jobs || [];

                const formattedData = jobs.map(job => {
                    let colorsArray = [];
                    if (job.colors) {
                        if (Array.isArray(job.colors)) {
                            colorsArray = job.colors;
                        } else {
                            colorsArray = Object.values(job.colors);
                        }
                    }

                    return {
                        jobNumber: job.jobNo || job.jobNumber,
                        buyer: job.buyerName || job.buyer || 'Unknown',
                        hodDate: job.hodDate || '',
                        remarks: job.remarks || '',
                        colors: colorsArray
                    };
                });
                setDataForProduction(formattedData);
            })
            .catch((e) => {
                console.log("API Error:", e);
                setDataForProduction([]);
            });
    };

    useEffect(() => {
        productionData();
    }, []);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [filterValues]);

    const handleFilterChange = (key, value) => setFilterValues(prev => ({ ...prev, [key]: value }));
    const openFilter = (key, label, event) => { setActiveFilter({ key, label, rect: event.currentTarget.getBoundingClientRect() }); setFilterSearch(''); };
    const closeFilter = () => { setActiveFilter(null); setFilterSearch(''); };

    const flattenedData = useMemo(() => {
        if (!dataForProduction || dataForProduction.length === 0) {
            return initialTableData.map(item => ({ ...item, id: item.id || `static-${Math.random().toString(36).substr(2, 9)}`, hodDate: item.hod, jobNumber: item.jobNumber, buyer: item.buyer, color: item.color, orderQty: item.orderQty }));
        }
        const flat = [];
        dataForProduction.forEach(job => {
            job.colors.forEach(colorRow => {
                flat.push({
                    buyer: job.buyer,
                    jobNumber: job.jobNumber,
                    color: colorRow.color || 'N/A',
                    id: colorRow.colorId || colorRow.id,
                    orderQty: colorRow.orderQty || 0,
                    hodDate: job.hodDate,
                    dailyCutting: colorRow.today?.cuttingQty || 0,
                    totalCutting: colorRow.total?.cuttingQty || 0,
                    dailyInput: colorRow.today?.dailyInput || 0,
                    totalInput: colorRow.total?.dailyInput || 0,
                    dailySewing: colorRow.today?.dailyOutput || 0,
                    totalSewing: colorRow.total?.dailyOutput || 0,
                    dailyFinishingRcvd: colorRow.today?.finishDeptRecvdQty || 0,
                    totalFinishingRcvd: colorRow.total?.finishDeptRecvdQty || 0,
                    dailyFinishing: colorRow.today?.finishDeptProdQty || 0,
                    totalFinishing: colorRow.total?.finishDeptProdQty || 0,
                    dailyShipment: colorRow.today?.shipmentQty || 0,
                    totalShipment: colorRow.total?.shipmentQty || 0,
                    plannedLeftover: colorRow.total?.plannedLeftover || 0,
                    physicalFound: colorRow.total?.physicalFound || 0,
                    leftFoundPercent: colorRow.total?.leftFoundPercent || 0,
                    remarks: colorRow.remarks || job.remarks || '',
                    _originalRow: job,
                    _originalColor: colorRow
                });
            });
        });
        return flat;
    }, [dataForProduction]);

    const filteredData = useMemo(() => flattenedData.filter(row => Object.keys(filterValues).every(key => {
        if (!filterValues[key] || filterValues[key].length === 0) return true;
        return filterValues[key].some(filter => String(row[key] ?? '').toLowerCase().includes(String(filter).toLowerCase()));
    })), [flattenedData, filterValues]);

    // Group filtered data by jobNumber to prevent splitting jobs across pages
    const jobGroups = useMemo(() => {
        const groups = new Map();
        filteredData.forEach(row => {
            if (!groups.has(row.jobNumber)) {
                groups.set(row.jobNumber, []);
            }
            groups.get(row.jobNumber).push(row);
        });
        return Array.from(groups.values());
    }, [filteredData]);

    const totalPages = Math.ceil(jobGroups.length / jobsPerPage) || 1;

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * jobsPerPage;
        const end = start + jobsPerPage;
        return jobGroups.slice(start, end).flat();
    }, [jobGroups, currentPage]);

    const rowMeta = useMemo(() => {
        const meta = new Array(paginatedData.length);
        let i = 0;
        while (i < paginatedData.length) {
            let j = i + 1;
            while (j < paginatedData.length && paginatedData[j].buyer === paginatedData[i].buyer && paginatedData[j].jobNumber === paginatedData[i].jobNumber) j++;
            const span = j - i;
            meta[i] = { isFirst: true, rowSpan: span };
            for (let k = i + 1; k < j; k++) meta[k] = { isFirst: false, rowSpan: 0 };
            i = j;
        }
        return meta;
    }, [paginatedData]);

    const clearAllFilters = () => { setFilterValues({}); setActiveFilter(null); };
    const escapeCsvValue = (value) => { const str = String(value ?? ''); return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str; };

    const exportToCSV = () => {
        const headerRow = exportColumns.map(col => escapeCsvValue(col.label)).join(',');
        const dataRows = filteredData.map(row => exportColumns.map(col => escapeCsvValue(row[col.key])).join(','));
        const blob = new Blob(['\uFEFF' + [headerRow, ...dataRows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.setAttribute('download', `production_summary_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    };

    const openModal = (type, row) => {
        const originalJob = row._originalRow;
        const allColors = originalJob.colors || [];

        setModalDate('');
        setModalError('');

        if (type === 'cutting') {
            setModalRows(allColors.map(r => ({
                color: r.color,
                cuttingQty: '',
                remarks: '',
                id: r.colorId || r.id
            })));
        } else if (type === 'finishing') {
            setModalRows(allColors.map(r => ({
                color: r.color,
                finishDeptRecvdQty: '',
                finishDeptProdQty: '',
                remarks: '',
                id: r.colorId || r.id
            })));
        } else if (type === 'sewing-production-qty') {
            setModalTargetForm({
                numberOfMC: '',
                lineNumber: '',
                targetHour: '',
                productionTarget: ''
            });
        } else if (type === 'shipment') {
            setModalRows(allColors.map(r => ({
                color: r.color,
                shipmentQty: '',
                remarks: '',
                id: r.colorId || r.id
            })));
        }

        setColorId(row.id);

        setActiveModal({
            type,
            row: originalJob
        });
    };

    const closeModal = () => {
        setActiveModal(null);
        setModalError('');
    };

    const updateModalRow = (index, field, value) => {
        setModalRows(prev =>
            prev.map((r, i) =>
                i === index
                    ? { ...r, [field]: value }
                    : r
            )
        );
    };

    const makeProductionPayload = () => {
        if (!activeModal) return null;

        const type = activeModal.type;

        const basePayload = {
            date: modalDate,
            jobNo: activeModal.row?.jobNo || activeModal.row?.jobNumber,
            productionType: type
        };

        let editedDetails = [];

        if (type === 'sewing-production-qty') {
            if (modalTargetForm.numberOfMC || modalTargetForm.lineNumber || modalTargetForm.targetHour || modalTargetForm.productionTarget) {
                editedDetails = [{
                    colorId: colorId || 0,
                    numberOfMC: modalTargetForm.numberOfMC,
                    lineNumber: modalTargetForm.lineNumber,
                    targetHour: modalTargetForm.targetHour,
                    productionTarget: modalTargetForm.productionTarget
                }];
            }
        } else if (type === 'finishing') {
            editedDetails = modalRows.filter(r => r.finishDeptRecvdQty !== '' || r.finishDeptProdQty !== '' || r.remarks !== '').map(r => {
                const detail = { colorId: r.id, color: r.color };
                if (r.finishDeptRecvdQty !== '') detail.finishDeptRecvdQty = r.finishDeptRecvdQty;
                if (r.finishDeptProdQty !== '') detail.finishDeptProdQty = r.finishDeptProdQty;
                if (r.remarks !== '') detail.remarks = r.remarks;
                return detail;
            });
        } else if (type === 'cutting') {
            editedDetails = modalRows.filter(r => r.cuttingQty !== '' || r.remarks !== '').map(r => {
                const detail = { colorId: r.id, color: r.color };
                if (r.cuttingQty !== '') detail.cuttingQty = r.cuttingQty;
                if (r.remarks !== '') detail.remarks = r.remarks;
                return detail;
            });
        } else if (type === 'shipment') {
            editedDetails = modalRows.filter(r => r.shipmentQty !== '' || r.remarks !== '').map(r => {
                const detail = { colorId: r.id, color: r.color };
                if (r.shipmentQty !== '') detail.shipmentQty = r.shipmentQty;
                if (r.remarks !== '') detail.remarks = r.remarks;
                return detail;
            });
        }

        if (editedDetails.length === 0) {
            return null;
        }

        return {
            ...basePayload,
            details: editedDetails
        };
    };

    const handleModalSave = async () => {
        if (!activeModal) return;
        const payload = makeProductionPayload();
        if (!payload || !payload.details?.length) { closeModal(); return; }

        try {
            const response = await axiosPrivate.post(`/api/enter-production/${activeModal.type}`, payload);
            console.log("✅ Success:", response.data);
            await productionData();
            closeModal();
        } catch (error) {
            const message = error.response?.data?.errors?.join(', ') || error.response?.data?.message || error.message || 'Failed to save';
            console.error("❌ Error:", error.response?.data || error.message);
            setModalError(message);
        }
    };

    const startEditingRemarks = (index, currentValue) => { setEditingRowIndex(index); setEditingRemarksValue(currentValue || ''); };
    const saveRemarks = () => {
        if (editingRowIndex !== null) {
            const rowToUpdate = paginatedData[editingRowIndex];
            setDataForProduction(prev => prev.map(job =>
                (job.jobNumber === rowToUpdate.jobNumber)
                    ? { ...job, remarks: editingRemarksValue }
                    : job
            ));
        }
        setEditingRowIndex(null); setEditingRemarksValue('');
    };
    const discardRemarks = () => { setEditingRowIndex(null); setEditingRemarksValue(''); };

    return (
        <div className="h-screen w-full flex flex-col bg-[#f3f4f6] font-sans text-xs overflow-hidden">
            <div className="flex justify-between items-center px-5 pt-5 pb-4 flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-800">Production Summary</h2>
                <div className="flex gap-2">
                    {editingRowIndex !== null && (
                        <>
                            <button onClick={saveRemarks} className="px-4 py-2 bg-[#217346] text-white border border-green-900 rounded cursor-pointer text-sm font-semibold hover:bg-[#185c37] shadow-sm">Save</button>
                            <button onClick={discardRemarks} className="px-4 py-2 bg-gray-100 border border-gray-400 rounded cursor-pointer text-sm font-semibold hover:bg-gray-200 text-gray-700">Discard</button>
                        </>
                    )}
                    <button className="flex items-center gap-1.5 px-4 py-2 bg-green-700 border border-green-900 rounded cursor-pointer text-sm font-semibold text-white hover:bg-green-800 shadow-sm" onClick={exportToCSV}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Export to CSV
                    </button>
                    <button className="px-4 py-2 bg-gray-100 border border-black rounded cursor-pointer text-sm hover:bg-gray-200" onClick={clearAllFilters}>Clear All Filters</button>
                </div>
            </div>
            <div className="flex-1 min-h-0 px-5 pb-5 flex flex-col">
                <div className="flex-1 min-h-0 overflow-auto border border-[#7f7f7f] rounded-sm shadow-sm bg-white">
                    <table className="bg-white" style={{ minWidth: '2000px', width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontFamily: "Calibri, 'Segoe UI', Arial, sans-serif" }}>
                        <colgroup>
                            <col style={{ width: `${colWidths.buyer}px` }} /><col style={{ width: `${colWidths.jobNumber}px` }} /><col style={{ width: `${colWidths.color}px` }} /><col style={{ width: `${colWidths.orderQty}px` }} /><col style={{ width: `${colWidths.hod}px` }} />
                            <col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} />
                            <col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '120px' }} /><col style={{ width: '135px' }} /><col style={{ width: '135px' }} /><col style={{ width: '135px' }} /><col style={{ width: '135px' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <StickyTh columnKey="buyer" label="Buyer" rowSpan={2} filterActive={!!filterValues.buyer?.length} onOpenFilter={(e) => openFilter('buyer', 'Buyer', e)}>BUYER</StickyTh>
                                <StickyTh columnKey="jobNumber" label="Job Number" rowSpan={2} filterActive={!!filterValues.jobNumber?.length} onOpenFilter={(e) => openFilter('jobNumber', 'Job Number', e)}>JOB NUMBER</StickyTh>
                                <StickyTh columnKey="color" label="Color" rowSpan={2} filterActive={!!filterValues.color?.length} onOpenFilter={(e) => openFilter('color', 'Color', e)}>COLOR</StickyTh>
                                <StickyTh columnKey="orderQty" label="Order Qty" rowSpan={2} filterActive={!!filterValues.orderQty?.length} onOpenFilter={(e) => openFilter('orderQty', 'Order Qty', e)}>ORDER QTY</StickyTh>
                                <StickyTh columnKey="hod" label="HOD" rowSpan={2} filterActive={!!filterValues.hod?.length} onOpenFilter={(e) => openFilter('hod', 'HOD', e)}>HOD</StickyTh>
                                <th colSpan={2} className={`${thClass} bg-[#c6e0b4] text-[#375623]`} style={{ height: `${HEADER_ROW1_HEIGHT}px`, top: 0 }}>CUTTING</th>
                                <th colSpan={4} className={`${thClass} bg-[#f8cbad] text-[#833c00]`} style={{ height: `${HEADER_ROW1_HEIGHT}px`, top: 0 }}>SEWING</th>
                                <th colSpan={4} className={`${thClass} bg-[#c6e0b4] text-[#375623]`} style={{ height: `${HEADER_ROW1_HEIGHT}px`, top: 0 }}>FINISHING</th>
                                <th colSpan={5} className={`${thClass} bg-[#bdd7ee] text-[#1f4e79]`} style={{ height: `${HEADER_ROW1_HEIGHT}px`, top: 0 }}>OTHERS</th>
                                <StickyTh columnKey="remarks" label="Remarks" rowSpan={2} filterActive={!!filterValues.remarks?.length} onOpenFilter={(e) => openFilter('remarks', 'Remarks', e)}>REMARKS</StickyTh>
                            </tr>
                            <tr>
                                {subHeaders.map((header) => {
                                    const isCutting = header.key === 'dailyCutting' || header.key === 'totalCutting';
                                    const isSewing = header.key === 'dailyInput' || header.key === 'totalInput' || header.key === 'dailySewing' || header.key === 'totalSewing';
                                    const isFinishing = header.key === 'dailyFinishingRcvd' || header.key === 'totalFinishingRcvd' || header.key === 'dailyFinishing' || header.key === 'totalFinishing';
                                    const colorClass = isCutting || isFinishing ? 'bg-[#e2efda] text-[#375623]' : isSewing ? 'bg-[#fbe5d5] text-[#833c00]' : 'bg-[#deebf7] text-[#1f4e79]';
                                    return (<th key={header.key} className={`${thClass} ${colorClass}`} style={{ height: `${HEADER_ROW2_HEIGHT}px`, top: `${HEADER_ROW1_HEIGHT}px` }}><div className="flex items-center justify-center gap-1"><span className="whitespace-nowrap">{header.label}</span><FilterIcon active={!!filterValues[header.key]?.length} onOpen={(e) => openFilter(header.key, header.label, e)} /></div></th>);
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedData.map((row, index) => {
                                const meta = rowMeta[index];
                                const isEvenRow = index % 2 === 0;
                                const tdClass = `border-b border-r border-[#d0d0d0] px-2 py-1.5 text-center align-middle text-[13px]`;
                                const isEditing = editingRowIndex === index;
                                return (
                                    <tr key={row.id || index} className="cursor-pointer hover:bg-[#fff2cc] transition-colors">
                                        {/* Job-level cells: span across all color rows */}
                                        {meta.isFirst && (<><StickyTd columnKey="buyer" isEvenRow={isEvenRow} rowSpan={meta.rowSpan}>{row.buyer}</StickyTd><StickyTd columnKey="jobNumber" isEvenRow={isEvenRow} rowSpan={meta.rowSpan}>{row.jobNumber}</StickyTd></>)}

                                        {/* Color-level cells: render for EACH color row */}
                                        <StickyTd columnKey="color" isEvenRow={isEvenRow} rowSpan={1}>{row.color}{row.id && <span className="text-gray-400 text-[10px] ml-1 font-normal">(ID: {row.id})</span>}</StickyTd>
                                        <StickyTd columnKey="orderQty" isEvenRow={isEvenRow} rowSpan={1}>{row.orderQty}</StickyTd>

                                        {meta.isFirst && (
                                            <StickyTd columnKey="hod" isEvenRow={isEvenRow} rowSpan={meta.rowSpan}>{row.hodDate}</StickyTd>
                                        )}

                                        {/* Per-color quantity cells: NO rowSpan, render for each color */}
                                        <td className={`${tdClass} ${clickableTdClass} bg-[#eaf3e3] text-[#375623]`} onDoubleClick={() => openModal('cutting', row)}>{row.dailyCutting}</td>
                                        <td className={`${tdClass} bg-[#eaf3e3] text-[#375623]`}>{row.totalCutting}</td>
                                        <td className={`${tdClass} bg-[#fdf0e6] text-[#833c00]`}>{row.dailyInput}</td>
                                        <td className={`${tdClass} bg-[#fdf0e6] text-[#833c00]`}>{row.totalInput}</td>
                                        <td className={`${tdClass} ${clickableTdClass} bg-[#fdf0e6] text-[#833c00]`} onDoubleClick={() => openModal('sewing-production-qty', row)}>{row.dailySewing}</td>
                                        <td className={`${tdClass} bg-[#fdf0e6] text-[#833c00]`}>{row.totalSewing}</td>
                                        <td className={`${tdClass} ${clickableTdClass} bg-[#eaf3e3] text-[#375623]`} onDoubleClick={() => openModal('finishing', row)}>{row.dailyFinishingRcvd}</td>
                                        <td className={`${tdClass} bg-[#eaf3e3] text-[#375623]`}>{row.totalFinishingRcvd}</td>
                                        <td className={`${tdClass} bg-[#eaf3e3] text-[#375623]`}>{row.dailyFinishing}</td>
                                        <td className={`${tdClass} bg-[#eaf3e3] text-[#375623]`}>{row.totalFinishing}</td>
                                        <td className={`${tdClass} ${clickableTdClass} bg-[#eaf1f9] text-[#1f4e79]`} onDoubleClick={() => openModal('shipment', row)}>{row.dailyShipment}</td>
                                        <td className={`${tdClass} bg-[#eaf1f9] text-[#1f4e79]`}>{row.totalShipment}</td>
                                        <td className={`${tdClass} bg-[#eaf1f9] text-[#1f4e79]`}>{row.plannedLeftover}</td>
                                        <td className={`${tdClass} bg-[#eaf1f9] text-[#1f4e79]`}>{row.physicalFound}</td>
                                        <td className={`${tdClass} bg-[#eaf1f9] text-[#1f4e79]`}>{row.leftFoundPercent}%</td>
                                        <td className={`${tdClass} ${!isEditing ? clickableTdClass : ''} ${isEditing ? 'bg-yellow-50' : ''}`} onDoubleClick={() => !isEditing && startEditingRemarks(index, row.remarks)}>
                                            {isEditing ? <input type="text" value={editingRemarksValue} onChange={(e) => setEditingRemarksValue(e.target.value)} className="w-full px-2 py-1 border border-[#217346] outline-none text-center text-[13px]" autoFocus onClick={(e) => e.stopPropagation()} /> : row.remarks}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination Controls */}
                {filteredData.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white flex-shrink-0 mt-2 rounded-sm shadow-sm">
                        <div className="text-sm text-gray-700">
                            Showing <span className="font-medium">{jobGroups.length > 0 ? (currentPage - 1) * jobsPerPage + 1 : 0}</span> to <span className="font-medium">{Math.min(currentPage * jobsPerPage, jobGroups.length)}</span> of <span className="font-medium">{jobGroups.length}</span> jobs
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <span className="text-sm text-gray-700 px-2">
                                Page <span className="font-medium">{currentPage}</span> of <span className="font-medium">{totalPages}</span>
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <FilterDropdown activeFilter={activeFilter} filterSearch={filterSearch} onSearchChange={setFilterSearch} filterValues={filterValues} onFilterChange={handleFilterChange} onClose={closeFilter} data={flattenedData} />

            {activeModal && activeModal.type === 'cutting' && (
                <DraggableModal title="Enter Today's Cutting Quantity" onClose={closeModal}>
                    <ModalJobHeader row={activeModal.row} modalDate={modalDate} onDateChange={setModalDate} />
                    <table className="w-full border-collapse border border-gray-400 text-sm mt-2">
                        <thead><tr className="bg-[#e7e6e6] text-gray-800"><th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Color</th><th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Cutting Quantity</th><th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Remarks</th></tr></thead>
                        <tbody>{modalRows.map((r, i) => (<tr key={r.id || i} className="hover:bg-[#f2f2f2]"><td className="border border-gray-300 px-2 py-1.5 text-center font-medium bg-[#fafafa] text-gray-700">{r.color} {r.id && <span className="text-gray-400 text-[10px]">(ID: {r.id})</span>}</td><td className="border border-gray-300 p-0 h-8"><ExcelInput numeric value={r.cuttingQty} placeholder="0" onChange={(v) => updateModalRow(i, 'cuttingQty', v)} className="text-center" /></td><td className="border border-gray-300 p-0 h-8"><ExcelInput value={r.remarks} onChange={(v) => updateModalRow(i, 'remarks', v)} /></td></tr>))}</tbody>
                    </table>
                    {modalError && <div className="mt-3 px-3 py-2 rounded bg-red-50 border border-red-300 text-red-700 text-sm">{modalError}</div>}
                    <div className="flex justify-end mt-4 gap-2"><button onClick={closeModal} className="px-4 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold hover:bg-gray-100 text-gray-700">Cancel</button><button onClick={handleModalSave} className="px-4 py-1.5 bg-[#217346] text-white rounded text-sm font-semibold hover:bg-[#185c37] shadow-sm">Save</button></div>
                </DraggableModal>
            )}

            {activeModal && activeModal.type === 'sewing-production-qty' && (
                <DraggableModal title="Set Sewing Line & Hourly Target" onClose={closeModal}>
                    <ModalJobHeader row={activeModal.row} modalDate={modalDate} onDateChange={setModalDate} />
                    <table className="w-full border-collapse border border-gray-400 text-sm mt-2">
                        <tbody>
                            <tr><td className="border border-gray-400 px-2 py-1.5 font-semibold bg-[#e7e6e6] text-gray-700 w-1/4">Number of Machines</td><td className="border border-gray-300 p-0 h-9 w-1/4"><ExcelInput numeric value={modalTargetForm.numberOfMC} placeholder="0" onChange={(v) => setModalTargetForm(p => ({ ...p, numberOfMC: v }))} className="text-center" /></td><td className="border border-gray-400 px-2 py-1.5 font-semibold bg-[#e7e6e6] text-gray-700 w-1/4">Line Number</td><td className="border border-gray-300 p-0 h-9 w-1/4"><ExcelInput value={modalTargetForm.lineNumber} onChange={(v) => setModalTargetForm(p => ({ ...p, lineNumber: v }))} className="text-center" /></td></tr>
                            <tr><td className="border border-gray-400 px-2 py-1.5 font-semibold bg-[#e7e6e6] text-gray-700">Working Hours</td><td className="border border-gray-300 p-0 h-9"><ExcelInput numeric value={modalTargetForm.targetHour} placeholder="0" onChange={(v) => setModalTargetForm(p => ({ ...p, targetHour: v }))} className="text-center" /></td><td className="border border-gray-400 px-2 py-1.5 font-semibold bg-[#e7e6e6] text-gray-700">Hourly Production Target</td><td className="border border-gray-300 p-0 h-9"><ExcelInput numeric value={modalTargetForm.productionTarget} placeholder="0" onChange={(v) => setModalTargetForm(p => ({ ...p, productionTarget: v }))} className="text-center" /></td></tr>
                        </tbody>
                    </table>
                    {modalError && <div className="mt-3 px-3 py-2 rounded bg-red-50 border border-red-300 text-red-700 text-sm">{modalError}</div>}
                    <div className="flex justify-end mt-4 gap-2"><button onClick={closeModal} className="px-4 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold hover:bg-gray-100 text-gray-700">Cancel</button><button onClick={handleModalSave} className="px-4 py-1.5 bg-[#217346] text-white rounded text-sm font-semibold hover:bg-[#185c37] shadow-sm">Save</button></div>
                </DraggableModal>
            )}

            {activeModal && activeModal.type === 'finishing' && (
                <DraggableModal title="Enter Finishing Received & Output Quantity" onClose={closeModal}>
                    <ModalJobHeader row={activeModal.row} modalDate={modalDate} onDateChange={setModalDate} />
                    <table className="w-full border-collapse border border-gray-400 text-sm mt-2">
                        <thead><tr className="bg-[#e7e6e6] text-gray-800"><th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Color</th><th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Received Quantity</th><th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Produced Quantity</th><th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Remarks</th></tr></thead>
                        <tbody>{modalRows.map((r, i) => (<tr key={r.id || i} className="hover:bg-[#f2f2f2]"><td className="border border-gray-300 px-2 py-1.5 text-center font-medium bg-[#fafafa] text-gray-700">{r.color} {r.id && <span className="text-gray-400 text-[10px]">(ID: {r.id})</span>}</td>
                            <td className="border border-gray-300 p-0 h-8">
                                <ExcelInput numeric value={r.finishDeptRecvdQty} placeholder="0" onChange={(v) => updateModalRow(i, 'finishDeptRecvdQty', v)} className="text-center" />
                            </td>
                            <td className="border border-gray-300 p-0 h-8">
                                <ExcelInput numeric value={r.finishDeptProdQty} placeholder="0" onChange={(v) => updateModalRow(i, 'finishDeptProdQty', v)} className="text-center" />
                            </td>
                            <td className="border border-gray-300 p-0 h-8">
                                <ExcelInput value={r.remarks} onChange={(v) => updateModalRow(i, 'remarks', v)} />
                            </td></tr>))}
                        </tbody>
                    </table>
                    {modalError && <div className="mt-3 px-3 py-2 rounded bg-red-50 border border-red-300 text-red-700 text-sm">{modalError}</div>}
                    <div className="flex justify-end mt-4 gap-2"><button onClick={closeModal} className="px-4 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold hover:bg-gray-100 text-gray-700">Cancel</button><button onClick={handleModalSave} className="px-4 py-1.5 bg-[#217346] text-white rounded text-sm font-semibold hover:bg-[#185c37] shadow-sm">Save</button></div>
                </DraggableModal>
            )}

            {activeModal && activeModal.type === 'shipment' && (
                <DraggableModal title="Enter Today's Shipment Quantity" onClose={closeModal}>
                    <ModalJobHeader row={activeModal.row} modalDate={modalDate} onDateChange={setModalDate} />
                    <table className="w-full border-collapse border border-gray-400 text-sm mt-2">
                        <thead>
                            <tr className="bg-[#e7e6e6] text-gray-800">
                                <th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Color</th>
                                <th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Shipped Quantity</th>
                                <th className="border border-gray-400 px-2 py-1.5 text-left font-semibold">Remarks</th></tr></thead>
                        <tbody>{modalRows.map((r, i) => (<tr key={r.id || i} className="hover:bg-[#f2f2f2]">
                            <td className="border border-gray-300 px-2 py-1.5 text-center font-medium bg-[#fafafa] text-gray-700">
                                {r.color} {r.id &&
                                    <span className="text-gray-400 text-[10px]">(ID: {r.id})</span>}</td><td className="border border-gray-300 p-0 h-8">
                                <ExcelInput numeric value={r.shipmentQty} placeholder="0" onChange={(v) => updateModalRow(i, 'shipmentQty', v)} className="text-center" /></td>
                            <td className="border border-gray-300 p-0 h-8">
                                <ExcelInput value={r.remarks} onChange={(v) => updateModalRow(i, 'remarks', v)} /></td></tr>))}</tbody>
                    </table>
                    {modalError && <div className="mt-3 px-3 py-2 rounded bg-red-50 border border-red-300 text-red-700 text-sm">{modalError}</div>}
                    <div className="flex justify-end mt-4 gap-2"><button onClick={closeModal} className="px-4 py-1.5 bg-white border border-gray-400 rounded text-sm font-semibold hover:bg-gray-100 text-gray-700">Cancel</button><button onClick={handleModalSave} className="px-4 py-1.5 bg-[#217346] text-white rounded text-sm font-semibold hover:bg-[#185c37] shadow-sm">Save</button></div>
                </DraggableModal>
            )}
        </div>
    );
};

export default ProductionSummary;