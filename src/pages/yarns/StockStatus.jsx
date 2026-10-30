import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Filter, Search, X, PackageSearch, Layers, Scale, ArrowDownCircle, ArrowUpCircle, Package, ArrowRightCircle, RotateCcw, Check, Save, XCircle, Pencil } from 'lucide-react'

const SAMPLE_DATA = [
  { date: '2025-01-06', supplierName: 'Golden Spin Mills Ltd.', yarnCount: '30/1 Ne', composition: '100% Cotton', lot: 'LOT-A12', received: 1250.5, returnSpinning: 40, assignQty: 1000, assignBalance: 210.5, deliveryKnitting: 980.25, returnFromKnitting: 12.75, physicalBalance: 262.5 },
  { date: '2025-01-14', supplierName: 'Everbright Yarn Co.', yarnCount: '20/1 Ne', composition: '100% Cotton', lot: 'LOT-A13', received: 2100, returnSpinning: 0, assignQty: 1900, assignBalance: 200, deliveryKnitting: 1875.4, returnFromKnitting: 25.6, physicalBalance: 249.6 },
  { date: '2025-02-03', supplierName: 'Silk Route Textiles', yarnCount: '40/1 Ne', composition: 'CVC 60/40', lot: 'LOT-B04', received: 875.3, returnSpinning: 15.2, assignQty: 700, assignBalance: 160.1, deliveryKnitting: 700, returnFromKnitting: 0, physicalBalance: 190.5 },
  { date: '2025-02-19', supplierName: 'Golden Spin Mills Ltd.', yarnCount: '30/1 Ne', composition: '100% Cotton', lot: 'LOT-B05', received: 1600, returnSpinning: 22.4, assignQty: 1420, assignBalance: 157.6, deliveryKnitting: 1400.8, returnFromKnitting: 8.1, physicalBalance: 205.3 },
  { date: '2025-03-05', supplierName: 'Everbright Yarn Co.', yarnCount: '24/1 Ne', composition: '95% Cotton 5% Elastane', lot: 'LOT-C01', received: 990.75, returnSpinning: 5, assignQty: 875, assignBalance: 110.75, deliveryKnitting: 860, returnFromKnitting: 14.3, physicalBalance: 130.05 },
  { date: '2025-03-21', supplierName: 'Silk Route Textiles', yarnCount: '40/1 Ne', composition: 'CVC 60/40', lot: 'LOT-C02', received: 1330.2, returnSpinning: 0, assignQty: 1330.2, assignBalance: 0, deliveryKnitting: 1330.2, returnFromKnitting: 0, physicalBalance: 0 },
]

const NUMERIC_KEYS = [
  'received', 'returnSpinning', 'assignQty', 'assignBalance',
  'deliveryKnitting', 'returnFromKnitting', 'physicalBalance',
]

const COLUMNS = [
  { key: 'supplierName', label: 'Supplier Name', width: 170 },
  { key: 'yarnCount', label: 'Yarn Count', width: 100 },
  { key: 'composition', label: 'Yarn Composition', width: 150 },
  { key: 'lot', label: 'Lot', width: 90 },
  { key: 'received', label: 'Yarn Received Qty', width: 120, numeric: true },
  // { key: 'returnSpinning', label: 'Yarn return qty (spinning)', width: 120, numeric: true },
  { key: 'assignQty', label: 'Assign Qty', width: 100, numeric: true },
  { key: 'assignBalance', label: 'Assign Balance', width: 110, numeric: true },
  { key: 'deliveryKnitting', label: 'Yarn Delivery Qty (knitting)', width: 120, numeric: true },
  { key: 'returnFromKnitting', label: 'Return Received Qty (from knitting)', width: 130, numeric: true },
  { key: 'physicalBalance', label: 'Physical Balance', width: 120, numeric: true },
]

const REMARKS_WIDTH = 170

const fmt = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0.00')

const monthLabel = (ym) => {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const rowKey = (row) => `${row.lot}__${row.date}`

// Excel-style column filter dropdown
const ColumnFilterDropdown = ({ column, uniqueValues, selectedValues, onApply, onClose, buttonRef }) => {
  const dropdownRef = useRef(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [tempSelected, setTempSelected] = useState(new Set(selectedValues))
  const [position, setPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (buttonRef?.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft
      
      setPosition({
        top: rect.bottom + scrollTop + 4,
        left: rect.left + scrollLeft
      })
    }
  }, [buttonRef])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const filteredValues = useMemo(() => {
    if (!searchTerm.trim()) return uniqueValues
    const q = searchTerm.trim().toLowerCase()
    return uniqueValues.filter((v) => String(v).toLowerCase().includes(q))
  }, [uniqueValues, searchTerm])

  const allFilteredSelected = filteredValues.length > 0 && filteredValues.every((v) => tempSelected.has(v))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setTempSelected(new Set())
    } else {
      setTempSelected(new Set(filteredValues))
    }
  }

  const toggleValue = (val) => {
    const next = new Set(tempSelected)
    if (next.has(val)) next.delete(val)
    else next.add(val)
    setTempSelected(next)
  }

  const handleApply = () => {
    onApply(Array.from(tempSelected))
    onClose()
  }

  const formatDisplay = (val) => {
    if (NUMERIC_KEYS.includes(column.key)) return fmt(val)
    return String(val)
  }

  return (
    <div
      ref={dropdownRef}
      className="fixed z-[100] bg-white border border-slate-300 rounded shadow-xl w-[280px]"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-slate-200">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search items..."
            className="w-full text-sm border border-slate-300 rounded px-7 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleSelectAll}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-semibold text-slate-900">(Select All)</span>
        </label>
      </div>

      <div className="max-h-[300px] overflow-y-auto p-2">
        {filteredValues.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-4">No values found</div>
        ) : (
          filteredValues.map((val) => {
            const isSelected = tempSelected.has(val)
            return (
              <label
                key={String(val)}
                className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 cursor-pointer rounded"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleValue(val)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 truncate" title={String(val)}>
                  {formatDisplay(val)}
                </span>
              </label>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-slate-200 bg-slate-50 rounded-b">
        <button
          onClick={onClose}
          className="text-sm font-medium text-slate-700 hover:bg-slate-200 px-4 py-1.5 rounded border border-slate-300 bg-white transition"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded transition"
        >
          OK
        </button>
      </div>
    </div>
  )
}

const StockStatus = ({ data = SAMPLE_DATA }) => {
  const [monthFilter, setMonthFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [openFilter, setOpenFilter] = useState(null)
  const filterButtonRefs = useRef({})

  const [remarks, setRemarks] = useState({})
  const [editingKey, setEditingKey] = useState(null)
  const [draftValue, setDraftValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingKey])

  const months = useMemo(() => {
    const set = new Set(data.map((r) => r.date.slice(0, 7)))
    return Array.from(set).sort()
  }, [data])

  const uniqueValuesByColumn = useMemo(() => {
    const result = {}
    COLUMNS.forEach((c) => {
      const set = new Set()
      data.forEach((row) => {
        const v = row[c.key]
        if (v !== undefined && v !== null && v !== '') set.add(v)
      })
      const arr = Array.from(set)
      if (c.numeric) {
        arr.sort((a, b) => Number(a) - Number(b))
      } else {
        arr.sort((a, b) => String(a).localeCompare(String(b)))
      }
      result[c.key] = arr
    })
    return result
  }, [data])

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (monthFilter !== 'all' && row.date.slice(0, 7) !== monthFilter) return false
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase()
        const hay = [row.supplierName, row.yarnCount, row.composition, row.lot].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      for (const [key, selectedSet] of Object.entries(columnFilters)) {
        if (!selectedSet || selectedSet.size === 0) continue
        const cellValue = row[key]
        if (!selectedSet.has(cellValue)) return false
      }
      return true
    })
  }, [data, monthFilter, searchText, columnFilters])

  const totals = useMemo(() => {
    const t = {}
    NUMERIC_KEYS.forEach((k) => {
      t[k] = filteredData.reduce((sum, row) => sum + (Number(row[k]) || 0), 0)
    })
    return t
  }, [filteredData])

  const grandTotals = useMemo(() => {
    const t = {}
    NUMERIC_KEYS.forEach((k) => {
      t[k] = data.reduce((sum, row) => sum + (Number(row[k]) || 0), 0)
    })
    return t
  }, [data])

  const hasFilters =
    monthFilter !== 'all' ||
    searchText.trim() !== '' ||
    Object.values(columnFilters).some((s) => s && s.size > 0)

  const handleClearAll = () => {
    setMonthFilter('all')
    setSearchText('')
    setColumnFilters({})
    setOpenFilter(null)
  }

  const handleColumnFilterApply = (key, selectedArray) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      if (!selectedArray || selectedArray.length === 0) {
        delete next[key]
      } else {
        next[key] = new Set(selectedArray)
      }
      return next
    })
  }

  const clearColumnFilter = (key) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const toggleFilter = (key) => {
    setOpenFilter(openFilter === key ? null : key)
  }

  const isColumnFiltered = (key) => {
    const s = columnFilters[key]
    return s && s.size > 0
  }

  const getFilterButtonRef = (key) => {
    if (!filterButtonRefs.current[key]) {
      filterButtonRefs.current[key] = React.createRef()
    }
    return filterButtonRefs.current[key]
  }

  const startEditing = (row) => {
    const key = rowKey(row)
    setEditingKey(key)
    setDraftValue(remarks[key] || '')
  }

  const saveRemark = () => {
    if (!editingKey) return
    setRemarks((prev) => ({ ...prev, [editingKey]: draftValue }))
    setEditingKey(null)
    setDraftValue('')
  }

  const discardRemark = () => {
    setEditingKey(null)
    setDraftValue('')
  }

  const handleDraftKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveRemark()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      discardRemark()
    }
  }

  const summaryCards = [
    { key: 'received', label: 'Yarn Received (Spinning)', icon: ArrowDownCircle, color: 'blue' },
    { key: 'returnSpinning', label: 'Return (Spinning)', icon: ArrowUpCircle, color: 'red' },
    { key: 'assignQty', label: 'Assign Qty', icon: Package, color: 'emerald' },
    { key: 'assignBalance', label: 'Assign Balance', icon: Layers, color: 'amber' },
    { key: 'deliveryKnitting', label: 'Delivery (Knitting)', icon: ArrowRightCircle, color: 'purple' },
    { key: 'returnFromKnitting', label: 'Return (Knitting)', icon: RotateCcw, color: 'orange' },
    { key: 'physicalBalance', label: 'Physical Balance', icon: Scale, color: 'teal' },
  ]

  const totalColumns = COLUMNS.length + 1

  return (
    <div style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }} className="w-full p-4 md:p-6">
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <PackageSearch className="text-amber-600" size={24} />
            YARN STOCK STATUS
          </h1>
          <p className="text-sm text-slate-500 mt-1">Supplier-wise received, assigned &amp; physical balance overview</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.key} className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 transition hover:shadow-md">
              <div className={`p-2 bg-${card.color}-100 text-${card.color}-600 rounded-lg w-fit`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{card.label}</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(grandTotals[card.key])}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mb-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-slate-700 shrink-0 pl-2">
            <Filter size={16} className="text-slate-500" />
            <span className="text-sm font-bold uppercase tracking-wide">Filters</span>
          </div>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent min-w-[160px] transition"
          >
            <option value="all">All Months</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search supplier, yarn count, composition, lot..."
              className="w-full text-sm border border-slate-300 rounded-lg pl-9 pr-9 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-full transition"
                aria-label="Clear search text"
                title="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {hasFilters && (
            <button
              onClick={handleClearAll}
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg border border-red-200 transition shrink-0"
              title="Reset all filters and search"
            >
              <X size={15} />
              Clear All Filters
            </button>
          )}
        </div>

        {editingKey && (
          <div className="mt-3 flex justify-end">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 text-amber-800 mr-2">
                <Pencil size={14} />
                <span className="text-xs font-semibold">Editing remarks</span>
              </div>
              <div className="h-4 w-px bg-amber-300"></div>
              <button
                onClick={discardRemark}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-white px-2.5 py-1.5 rounded border border-slate-300 transition"
              >
                <XCircle size={13} />
                Discard
              </button>
              <button
                onClick={saveRemark}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded transition shadow-sm"
              >
                <Save size={13} />
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table className="w-full border-collapse text-[12px]" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.key} style={{ width: c.width }} />
            ))}
            <col style={{ width: REMARKS_WIDTH }} />
          </colgroup>

          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const filtered = isColumnFiltered(c.key)
                const isOpen = openFilter === c.key
                const buttonRef = getFilterButtonRef(c.key)
                
                return (
                  <th
                    key={c.key}
                    className="sticky top-0 z-10 bg-white text-slate-900 font-bold px-2 py-2.5 border border-slate-300 whitespace-normal break-words align-middle text-center"
                    style={{ lineHeight: 1.3 }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-[11px] truncate" title={c.label}>{c.label}</span>
                      <div className="relative shrink-0">
                        <button
                          ref={buttonRef}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFilter(c.key)
                          }}
                          className={`p-1 rounded transition relative ${
                            filtered
                              ? 'text-white bg-blue-600 hover:bg-blue-700'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                          title={filtered ? `Filter active - Click to change` : `Filter by ${c.label}`}
                        >
                          <Filter size={12} />
                          {filtered && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>
                          )}
                        </button>
                        {isOpen && (
                          <ColumnFilterDropdown
                            column={c}
                            uniqueValues={uniqueValuesByColumn[c.key] || []}
                            selectedValues={columnFilters[c.key] || new Set()}
                            onApply={(arr) => handleColumnFilterApply(c.key, arr)}
                            onClose={() => setOpenFilter(null)}
                            buttonRef={buttonRef}
                          />
                        )}
                      </div>
                    </div>
                    {filtered && (
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <div className="text-[9px] font-normal text-white bg-blue-600 rounded px-1.5 py-0.5 truncate max-w-[100px]" title={`${columnFilters[c.key].size} selected`}>
                          {columnFilters[c.key].size} selected
                        </div>
                        <button
                          onClick={() => clearColumnFilter(c.key)}
                          className="text-[9px] text-red-600 hover:text-red-800 hover:bg-red-50 p-0.5 rounded transition"
                          title="Clear this filter"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                  </th>
                )
              })}
              <th className="sticky top-0 z-10 bg-white text-slate-900 font-bold px-2 py-2.5 border border-slate-300 whitespace-normal break-words align-middle text-center">
                <span className="text-[11px]">Remarks</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={totalColumns} className="text-center text-slate-400 py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Search size={32} className="text-slate-300" />
                    <p className="text-sm font-medium">No records match the selected filters.</p>
                    <button onClick={handleClearAll} className="text-xs text-amber-600 hover:underline font-semibold">Clear all filters</button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((row) => {
                const key = rowKey(row)
                const isEditing = editingKey === key
                return (
                  <tr key={key} className="group hover:bg-amber-50/50 transition-colors">
                    {COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`px-3 py-2.5 border border-slate-200 align-middle whitespace-normal break-words text-center ${c.numeric ? 'font-mono text-slate-700' : 'text-slate-600 group-hover:text-slate-900'}`}
                      >
                        {c.numeric ? fmt(row[c.key]) : (row[c.key] || '—')}
                      </td>
                    ))}
                    <td
                      className={`px-2 py-2 border border-slate-200 align-middle text-center cursor-text ${isEditing ? 'bg-amber-50' : ''}`}
                      onDoubleClick={() => startEditing(row)}
                      title="Double-click to edit"
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          onKeyDown={handleDraftKeyDown}
                          className="w-full text-xs text-center border border-amber-300 rounded-md px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="Type remark..."
                        />
                      ) : (
                        <span className={`text-xs ${remarks[key] ? 'text-slate-700' : 'text-slate-300 italic'}`}>
                          {remarks[key] || 'Double-click to add'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {filteredData.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 text-slate-800 font-bold">
                {COLUMNS.map((c, i) => (
                  <td
                    key={c.key}
                    className="px-3 py-3 border border-slate-300 whitespace-normal break-words text-center"
                  >
                    {i === 0 ? 'GRAND TOTAL' : c.numeric ? fmt(totals[c.key]) : ''}
                  </td>
                ))}
                <td className="px-3 py-3 border border-slate-300 text-center"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-3 text-[11px] text-slate-400 text-right">
        Showing {filteredData.length} of {data.length} total records{monthFilter !== 'all' ? ` for ${monthLabel(monthFilter)}` : ''}.
      </p>
    </div>
  )
}

export default StockStatus