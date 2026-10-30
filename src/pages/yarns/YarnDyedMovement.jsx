import React, { useState, useMemo, useEffect } from 'react';

const YarnDyedMovement = () => {
    // --- 1. Sample Data (with localStorage persistence) ---
    const defaultData = [
        {
            id: 1, date: '2026-08-01', challanNo: 'CH-001', piNo: 'PI-1001', lcNumber: 'LC-5001',
            supplierName: 'ABC Textiles Ltd. (Very Long Name for Testing Wrap)', jobNumber: 'JOB-2001',
            orderNo: 'ORD-1001', color: 'Navy Blue', fabricComposition: '100% Cotton Combed', fabricWidth: '58"',
            yarnCount: '30s', composition: '100% Cotton', lot: 'LOT-A1-Long-Lot-Number',
            yarnDeliveryQty: 1500.50, yarnReturnQty: 50.00, yarnReceivedQtyGrey: 1450.50, yarnReceivedQtyFinish: 1400.00,
            from: 'Factory A', to: 'Factory B', remarks: 'Regular shipment with special instructions'
        },
        {
            id: 2, date: '2026-08-05', challanNo: 'CH-002', piNo: 'PI-1002', lcNumber: 'LC-5002',
            supplierName: 'XYZ Fabrics Inc.', jobNumber: 'JOB-2002',
            orderNo: 'ORD-1002', color: 'White', fabricComposition: '80% Cotton, 20% Polyester Blend', fabricWidth: '60"',
            yarnCount: '40s', composition: '80% Cotton, 20% Poly', lot: 'LOT-B2',
            yarnDeliveryQty: 2000.00, yarnReturnQty: 100.00, yarnReceivedQtyGrey: 1900.00, yarnReceivedQtyFinish: 1850.50,
            from: 'Factory B', to: 'Factory C', remarks: 'Urgent order'
        },
        {
            id: 3, date: '2026-07-15', challanNo: 'CH-003', piNo: 'PI-1003', lcNumber: 'LC-5003',
            supplierName: 'Global Yarn Co.', jobNumber: 'JOB-2003',
            orderNo: 'ORD-1003', color: 'Red', fabricComposition: '100% Polyester', fabricWidth: '56"',
            yarnCount: '20s', composition: '100% Polyester', lot: 'LOT-C3',
            yarnDeliveryQty: 3000.75, yarnReturnQty: 150.25, yarnReceivedQtyGrey: 2850.50, yarnReceivedQtyFinish: 2800.00,
            from: 'Factory C', to: 'Factory A', remarks: 'Monthly batch'
        },
        {
            id: 4, date: '2026-08-10', challanNo: 'CH-004', piNo: 'PI-1004', lcNumber: 'LC-5004',
            supplierName: 'Prime Textiles', jobNumber: 'JOB-2004',
            orderNo: 'ORD-1004', color: 'Green', fabricComposition: '60% Cotton, 40% Linen', fabricWidth: '62"',
            yarnCount: '24s', composition: '60% Cotton, 40% Linen', lot: 'LOT-D4',
            yarnDeliveryQty: 1800.00, yarnReturnQty: 75.00, yarnReceivedQtyGrey: 1725.00, yarnReceivedQtyFinish: 1700.25,
            from: 'Factory A', to: 'Factory D', remarks: 'Special order'
        },
        {
            id: 5, date: '2026-07-22', challanNo: 'CH-005', piNo: 'PI-1005', lcNumber: 'LC-5005',
            supplierName: 'Elite Fabrics', jobNumber: 'JOB-2005',
            orderNo: 'ORD-1005', color: 'Yellow', fabricComposition: '100% Silk', fabricWidth: '54"',
            yarnCount: '60s', composition: '100% Silk', lot: 'LOT-E5',
            yarnDeliveryQty: 500.00, yarnReturnQty: 25.00, yarnReceivedQtyGrey: 475.00, yarnReceivedQtyFinish: 450.00,
            from: 'Factory D', to: 'Factory B', remarks: 'Premium quality'
        }
    ];

    // Load from localStorage if available, otherwise use default data
    const [allData, setAllData] = useState(() => {
        try {
            const saved = localStorage.getItem('yarnDyedMovementData');
            return saved ? JSON.parse(saved) : defaultData;
        } catch (error) {
            return defaultData;
        }
    });

    // --- 2. State Management ---
    const [searchInput, setSearchInput] = useState('');
    const [activeSearch, setActiveSearch] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('all');
    
    // Excel-like filter state
    const [columnFilters, setColumnFilters] = useState({});
    const [openFilterCol, setOpenFilterCol] = useState(null);
    const [filterSearch, setFilterSearch] = useState('');
    const [tempFilterValues, setTempFilterValues] = useState([]);

    // Inline Editing State (Batch Edit Pattern)
    const [pendingEdits, setPendingEdits] = useState({}); // { [id]: "new remark string" }
    const [editingRemarkId, setEditingRemarkId] = useState(null);

    const hasPendingEdits = Object.keys(pendingEdits).length > 0;

    // --- 3. Column Definitions ---
    const columns = [
        { key: 'date', label: 'Date', align: 'left', minWidth: 'min-w-[80px]' },
        { key: 'challanNo', label: 'Challan No.', align: 'left', minWidth: 'min-w-[100px]' },
        { key: 'piNo', label: 'PI No', align: 'left', minWidth: 'min-w-[80px]' },
        { key: 'lcNumber', label: 'LC Number', align: 'left', minWidth: 'min-w-[100px]' },
        { key: 'supplierName', label: 'Supplier Name', align: 'left', minWidth: 'min-w-[150px]' },
        { key: 'jobNumber', label: 'Job Number', align: 'left', minWidth: 'min-w-[100px]' },
        { key: 'orderNo', label: 'Order No', align: 'left', minWidth: 'min-w-[100px]' },
        { key: 'color', label: 'Color', align: 'left', minWidth: 'min-w-[80px]' },
        { key: 'fabricComposition', label: 'Fabric Composition', align: 'left', minWidth: 'min-w-[150px]' },
        { key: 'fabricWidth', label: 'Fabric Width', align: 'left', minWidth: 'min-w-[60px]' },
        { key: 'yarnCount', label: 'Yarn Count', align: 'left', minWidth: 'min-w-[60px]' },
        { key: 'composition', label: 'Composition', align: 'left', minWidth: 'min-w-[150px]' },
        { key: 'lot', label: 'Lot', align: 'left', minWidth: 'min-w-[100px]' },
        { key: 'yarnDeliveryQty', label: 'Yarn Delivery Qty (Y/D)', align: 'right', minWidth: 'min-w-[120px]' },
        { key: 'yarnReturnQty', label: 'Yarn Return Qty (Y/D Factory)', align: 'right', minWidth: 'min-w-[140px]' },
        { key: 'yarnReceivedQtyGrey', label: 'Yarn Received Qty (Grey)', align: 'right', minWidth: 'min-w-[140px]' },
        { key: 'yarnReceivedQtyFinish', label: 'Yarn Received Qty (Finish)', align: 'right', minWidth: 'min-w-[140px]' },
        { key: 'from', label: 'From', align: 'left', minWidth: 'min-w-[100px]' },
        { key: 'to', label: 'To', align: 'left', minWidth: 'min-w-[100px]' },
        { key: 'remarks', label: 'Remarks', align: 'left', minWidth: 'min-w-[150px]' },
    ];

    // --- 4. Precompute Unique Values for Each Column ---
    const columnUniqueValues = useMemo(() => {
        const uniqueMap = {};
        columns.forEach(col => {
            const vals = allData.map(item => String(item[col.key] ?? '').trim());
            uniqueMap[col.key] = [...new Set(vals)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        });
        return uniqueMap;
    }, [allData]);

    // --- 5. Available Months for Filter ---
    const availableMonths = useMemo(() => {
        const months = new Set();
        allData.forEach(item => {
            const monthYear = item.date.substring(0, 7);
            months.add(monthYear);
        });
        return Array.from(months).sort().reverse();
    }, [allData]);

    // --- 6. Filtered Data Logic ---
    const filteredData = useMemo(() => {
        return allData.filter(item => {
            const matchesMonth = selectedMonth === 'all' || item.date.startsWith(selectedMonth);
            
            const searchLower = activeSearch.toLowerCase();
            const matchesGlobalSearch = activeSearch === '' || 
                item.challanNo.toLowerCase().includes(searchLower) ||
                item.piNo.toLowerCase().includes(searchLower) ||
                item.supplierName.toLowerCase().includes(searchLower) ||
                item.jobNumber.toLowerCase().includes(searchLower) ||
                item.orderNo.toLowerCase().includes(searchLower) ||
                item.color.toLowerCase().includes(searchLower) ||
                item.lot.toLowerCase().includes(searchLower) ||
                item.remarks.toLowerCase().includes(searchLower);

            const matchesColumnFilters = Object.keys(columnFilters).every(key => {
                const filterValues = columnFilters[key];
                if (!filterValues) return true; 
                const itemValue = String(item[key] ?? '').trim();
                return filterValues.includes(itemValue);
            });

            return matchesMonth && matchesGlobalSearch && matchesColumnFilters;
        });
    }, [allData, selectedMonth, activeSearch, columnFilters]);

    // --- 7. Calculate Totals ---
    const totals = useMemo(() => {
        return filteredData.reduce((acc, item) => ({
            delivery: acc.delivery + item.yarnDeliveryQty,
            return: acc.return + item.yarnReturnQty,
            grey: acc.grey + item.yarnReceivedQtyGrey,
            finish: acc.finish + item.yarnReceivedQtyFinish
        }), { delivery: 0, return: 0, grey: 0, finish: 0 });
    }, [filteredData]);

    // --- 8. Helpers & Handlers ---
    const fmt = (num) => num.toFixed(2);
    const fmtDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const fmtMonthLabel = (monthStr) => {
        const [y, m] = monthStr.split('-');
        return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const handleSearch = () => setActiveSearch(searchInput);
    
    const handleClearAll = () => { 
        setSearchInput(''); 
        setActiveSearch(''); 
        setColumnFilters({});
        setSelectedMonth('all');
    };

    // --- Batch Edit Handlers ---
    const handleSaveChanges = () => {
        // Apply all pending edits to the main data source
        const updatedData = allData.map(item => 
            pendingEdits[item.id] !== undefined 
                ? { ...item, remarks: pendingEdits[item.id] } 
                : item
        );
        
        // Update state
        setAllData(updatedData);
        
        // Save to localStorage for persistence
        try {
            localStorage.setItem('yarnDyedMovementData', JSON.stringify(updatedData));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
        
        // Clear pending state and exit any active edit mode
        setPendingEdits({});
        setEditingRemarkId(null);
    };

    const handleDiscard = () => {
        // Discard all pending edits and exit edit mode
        setPendingEdits({});
        setEditingRemarkId(null);
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (openFilterCol && !event.target.closest('.excel-filter-dropdown')) {
                setOpenFilterCol(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openFilterCol]);

    return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-screen font-sans">
            
            {/* SECTION 1: SUMMARY CARDS */}
            <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="w-1 h-5 bg-blue-600 rounded-full inline-block"></span>
                    Quick Summary
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-500 flex flex-col justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Delivery (Y/D)</span>
                        <span className="text-2xl font-bold text-gray-800 mt-1">{fmt(totals.delivery)}</span>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-amber-500 flex flex-col justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Return (Y/D)</span>
                        <span className="text-2xl font-bold text-gray-800 mt-1">{fmt(totals.return)}</span>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-emerald-500 flex flex-col justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Received (Grey)</span>
                        <span className="text-2xl font-bold text-gray-800 mt-1">{fmt(totals.grey)}</span>
                    </div>
                    <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-purple-500 flex flex-col justify-between">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Received (Finish)</span>
                        <span className="text-2xl font-bold text-gray-800 mt-1">{fmt(totals.finish)}</span>
                    </div>
                </div>
            </div>

            {/* SECTION 2: SEARCH & FILTER (Action Bar) */}
            <div className="bg-white p-4 rounded-t-lg border border-gray-200 border-b-0 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3 flex-1 flex-wrap">
                    <div className="relative flex-1 min-w-[250px]">
                        <input
                            type="text"
                            placeholder="Search: Challan, PI, Supplier, Job, Order, Color..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        Search
                    </button>
                    <button onClick={handleClearAll} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors border border-gray-300 flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        Clear All
                    </button>
                    
                    {/* CONDITIONAL: Discard & Save Buttons (Only appear when there are pending edits) */}
                    {hasPendingEdits && (
                        <>
                            <button 
                                onClick={handleDiscard} 
                                className="px-4 py-2 bg-red-50 text-red-700 text-sm font-medium rounded-md hover:bg-red-100 transition-colors border border-red-200 flex items-center gap-2"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Discard
                            </button>
                            <button 
                                onClick={handleSaveChanges} 
                                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors border border-green-600 flex items-center gap-2 shadow-sm"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                Save Changes
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Month Filter:
                    </label>
                    <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm"
                    >
                        <option value="all">All Months</option>
                        {availableMonths.map(month => (
                            <option key={month} value={month}>{fmtMonthLabel(month)}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* SECTION 3: DATA TABLE */}
            <div className="bg-white border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto max-h-[calc(100vh-350px)]">
                    <table className="w-full border-collapse text-sm">
                        
                        {/* TABLE HEADER */}
                        <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                            <tr>
                                {columns.map(col => {
                                    const uniqueValues = columnUniqueValues[col.key];
                                    const hasFilter = columnFilters[col.key] && columnFilters[col.key].length > 0;

                                    return (
                                        <th key={col.key} className="px-2 py-2 text-xs font-bold text-gray-700 uppercase border border-gray-300 bg-gray-100 relative">
                                            <div className="flex flex-col gap-1.5">
                                                <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                                                    <span className="whitespace-nowrap">{col.label}</span>
                                                    
                                                    <div className="relative excel-filter-dropdown">
                                                        <button 
                                                            onClick={() => {
                                                                const isOpen = openFilterCol === col.key;
                                                                setOpenFilterCol(isOpen ? null : col.key);
                                                                setFilterSearch('');
                                                                const current = columnFilters[col.key];
                                                                setTempFilterValues(current && current.length > 0 ? [...current] : [...uniqueValues]);
                                                            }}
                                                            className="p-0.5 rounded hover:bg-gray-200 transition-colors flex items-center"
                                                            title="Filter"
                                                        >
                                                            <svg className={`h-3.5 w-3.5 ${hasFilter ? 'text-blue-600' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>

                                                        {openFilterCol === col.key && (
                                                            <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-300 rounded-md shadow-xl z-50 text-left excel-filter-dropdown">
                                                                <div className="p-2 border-b border-gray-200 bg-gray-50 rounded-t-md">
                                                                    <input 
                                                                        type="text" 
                                                                        placeholder="Search" 
                                                                        value={filterSearch}
                                                                        onChange={(e) => setFilterSearch(e.target.value)}
                                                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                </div>
                                                                
                                                                <div className="max-h-60 overflow-y-auto p-2 custom-scrollbar">
                                                                    <label className="flex items-center gap-2 p-1.5 hover:bg-blue-50 rounded cursor-pointer border-b border-gray-100 mb-1">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={tempFilterValues.length === uniqueValues.length}
                                                                            onChange={() => {
                                                                                const allSelected = tempFilterValues.length === uniqueValues.length;
                                                                                setTempFilterValues(allSelected ? [] : [...uniqueValues]);
                                                                            }}
                                                                            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                                                                        />
                                                                        <span className="text-xs font-semibold text-gray-700">(Select All)</span>
                                                                    </label>
                                                                    {uniqueValues
                                                                        .filter(val => val.toLowerCase().includes(filterSearch.toLowerCase()))
                                                                        .map(val => (
                                                                            <label key={val} className="flex items-center gap-2 p-1.5 hover:bg-blue-50 rounded cursor-pointer">
                                                                                <input 
                                                                                    type="checkbox" 
                                                                                    checked={tempFilterValues.includes(val)}
                                                                                    onChange={() => {
                                                                                        setTempFilterValues(prev => 
                                                                                            prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
                                                                                        );
                                                                                    }}
                                                                                    className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                                                                                />
                                                                                <span className="text-xs text-gray-700 truncate" title={val || '(Blank)'}>
                                                                                    {val || '(Blank)'}
                                                                                </span>
                                                                            </label>
                                                                        ))
                                                                    }
                                                                </div>
                                                                
                                                                <div className="p-2 border-t border-gray-200 flex justify-between items-center bg-gray-50 rounded-b-md">
                                                                    <button 
                                                                        onClick={() => setTempFilterValues([])}
                                                                        className="px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                                                                    >
                                                                        Clear
                                                                    </button>
                                                                    <div className="flex gap-2">
                                                                        <button 
                                                                            onClick={() => setOpenFilterCol(null)} 
                                                                            className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => {
                                                                                if (tempFilterValues.length === 0) {
                                                                                    setColumnFilters(prev => ({ ...prev, [col.key]: [] }));
                                                                                } else if (tempFilterValues.length === uniqueValues.length) {
                                                                                    const newFilters = { ...columnFilters };
                                                                                    delete newFilters[col.key];
                                                                                    setColumnFilters(newFilters);
                                                                                } else {
                                                                                    setColumnFilters(prev => ({
                                                                                        ...prev,
                                                                                        [col.key]: tempFilterValues
                                                                                    }));
                                                                                }
                                                                                setOpenFilterCol(null);
                                                                            }} 
                                                                            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors shadow-sm"
                                                                        >
                                                                            OK
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        {/* TABLE BODY */}
                        <tbody className="divide-y divide-gray-200">
                            {filteredData.length > 0 ? (
                                filteredData.map((item, index) => (
                                    <tr key={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-yellow-50 transition-colors`}>
                                        {columns.map(col => {
                                            const isNumeric = col.align === 'right';
                                            const value = item[col.key];
                                            const displayValue = col.key === 'date' ? fmtDate(value) : (isNumeric ? fmt(value) : value);
                                            
                                            // --- EDITABLE REMARKS COLUMN LOGIC ---
                                            if (col.key === 'remarks') {
                                                const isEditing = editingRemarkId === item.id;
                                                const currentRemark = pendingEdits[item.id] !== undefined ? pendingEdits[item.id] : item.remarks;
                                                
                                                return (
                                                    <td key={col.key} className={`px-3 py-2 text-gray-900 border border-gray-300 break-words ${col.minWidth}`}>
                                                        {isEditing ? (
                                                            <input
                                                                type="text"
                                                                value={currentRemark}
                                                                onChange={(e) => setPendingEdits(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        setEditingRemarkId(null); // Exit edit mode, data stays in pendingEdits
                                                                    }
                                                                }}
                                                                onBlur={() => setEditingRemarkId(null)} // Exit edit mode on click outside
                                                                autoFocus
                                                                className="w-full px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                                            />
                                                        ) : (
                                                            <span 
                                                                onDoubleClick={() => setEditingRemarkId(item.id)}
                                                                className={`cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 transition-colors block min-h-[1.5rem] ${
                                                                    pendingEdits[item.id] !== undefined ? 'text-blue-700 font-medium italic' : ''
                                                                }`}
                                                                title="Double-click to edit"
                                                            >
                                                                {currentRemark}
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            }
                                            
                                            // --- STANDARD COLUMNS ---
                                            return (
                                                <td key={col.key} className={`px-3 py-2 text-gray-900 border border-gray-300 ${isNumeric ? 'text-right whitespace-nowrap font-mono tabular-nums' : `break-words ${col.minWidth}`}`}>
                                                    {displayValue}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="20" className="px-6 py-12 text-center text-gray-500 italic bg-white">
                                        No records found matching your search or filter criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>

                        {/* TABLE FOOTER */}
                        <tfoot className="bg-gray-100 sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                            <tr className="border-t-2 border-gray-400">
                                <td colSpan="13" className="px-3 py-3 text-right text-sm font-bold text-gray-800 border border-gray-300 uppercase tracking-wider">
                                    Footer Total:
                                </td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-gray-800 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(totals.delivery)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-gray-800 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(totals.return)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-gray-800 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(totals.grey)}</td>
                                <td className="px-3 py-3 text-right text-sm font-bold text-gray-800 border border-gray-300 whitespace-nowrap font-mono tabular-nums bg-green-50">{fmt(totals.finish)}</td>
                                <td className="px-3 py-3 border border-gray-300 bg-gray-100"></td>
                                <td className="px-3 py-3 border border-gray-300 bg-gray-100"></td>
                                <td className="px-3 py-3 border border-gray-300 bg-gray-100"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            
            {/* Record Count */}
            <div className="mt-3 text-right text-xs text-gray-500 font-medium">
                Showing {filteredData.length} of {allData.length} records 
                {hasPendingEdits && (
                    <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                        Unsaved changes
                    </span>
                )}
            </div>
        </div>
    );
};

export default YarnDyedMovement;