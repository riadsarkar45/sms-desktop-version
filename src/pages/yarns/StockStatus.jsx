import React, { useMemo, useState, useRef, useEffect } from 'react'
import { Filter, Search, X, PackageSearch, Layers, Scale, ArrowDownCircle, ArrowUpCircle, Package, ArrowRightCircle, RotateCcw, Save, XCircle, Pencil, AlertCircle, Loader2 } from 'lucide-react'
import useAxiosPrivate from '../../hooks/UseAxiosPrivate'

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

// Static class map (Tailwind cannot detect dynamically built class names)
const CARD_COLORS = {
  blue: 'bg-blue-100 text-blue-600',
  red: 'bg-red-100 text-red-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  purple: 'bg-purple-100 text-purple-600',
  orange: 'bg-orange-100 text-orange-600',
  teal: 'bg-teal-100 text-teal-600',
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '0.00')

const calcPhysicalBalance = ({ received, returnSpinning, deliveryKnitting, returnFromKnitting }) =>
  num(received) - num(returnSpinning) - num(deliveryKnitting) + num(returnFromKnitting)

const calcAssignBalance = ({ assignQty, deliveryKnitting, returnFromKnitting }) =>
  num(assignQty) - (num(deliveryKnitting) - num(returnFromKnitting))

// Recalculate balances for a table row coming from the API
const normalizeRow = (row) => ({
  ...row,
  assignBalance: calcAssignBalance(row),
  physicalBalance: calcPhysicalBalance(row),
})

const monthLabel = (ym) => {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

const monthOf = (row) => (row.date ? row.date.slice(0, 7) : '')

const rowKey = (row) => `${row.lot}__${row.yarnCount}__${row.date}`

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

const StockStatus = () => {
  const [monthFilter, setMonthFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [openFilter, setOpenFilter] = useState(null)
  const filterButtonRefs = useRef({})

  const [remarks, setRemarks] = useState({})
  const [editingKey, setEditingKey] = useState(null)
  const [draftValue, setDraftValue] = useState('')
  const inputRef = useRef(null)

  // Table rows from API
  const [data, setData] = useState([])
  const [tableLoading, setTableLoading] = useState(true)
  const [tableError, setTableError] = useState('')

  // Summary cards data from API
  const [stockSummary, setStockSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')

  const axiosSecure = useAxiosPrivate()

  useEffect(() => {
    let cancelled = false

    const fetchSummary = async () => {
      try {
        setSummaryLoading(true)
        setSummaryError('')
        const res = await axiosSecure.get('/api/yarn-stock')
        if (cancelled) return
        if (res?.data?.success) {
          setStockSummary(res.data.data)
        } else {
          setSummaryError('Failed to load stock summary.')
        }
      } catch (err) {
        if (!cancelled) {
          setSummaryError(err?.response?.data?.message || 'Failed to load stock summary.')
        }
      } finally {
        if (!cancelled) setSummaryLoading(false)
      }
    }

    const fetchTable = async () => {
      try {
        setTableLoading(true)
        setTableError('')
        const res = await axiosSecure.get('/api/yarn-stock/table')
        if (cancelled) return
        if (res?.data?.success) {
          const rows = Array.isArray(res.data.data) ? res.data.data : []
          // Recalculate balances on the frontend so they always follow the formulas above
          setData(rows.map(normalizeRow))
        } else {
          setTableError('Failed to load stock table.')
        }
      } catch (err) {
        if (!cancelled) {
          setTableError(err?.response?.data?.message || 'Failed to load stock table.')
        }
      } finally {
        if (!cancelled) setTableLoading(false)
      }
    }

    fetchSummary()
    fetchTable()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingKey])

  const months = useMemo(() => {
    const set = new Set(data.map(monthOf).filter(Boolean))
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
      if (monthFilter !== 'all' && monthOf(row) !== monthFilter) return false
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

  // Summary-level figures (cards), calculated with the same formulas as the rows
  const summaryValues = useMemo(() => {
    const received = num(stockSummary?.spinningMovement?.received)
    const returnSpinning = num(stockSummary?.spinningMovement?.returned)
    const assignQty = num(stockSummary?.assignedStock?.totalQty)
    const deliveryKnitting = num(stockSummary?.yarnMovement?.delivered)
    const returnFromKnitting = num(stockSummary?.yarnMovement?.returned)

    return {
      received,
      returnSpinning,
      assignQty,
      deliveryKnitting,
      returnFromKnitting,
      assignBalance: calcAssignBalance({ assignQty, deliveryKnitting, returnFromKnitting }),
      physicalBalance: calcPhysicalBalance({ received, returnSpinning, deliveryKnitting, returnFromKnitting }),
    }
  }, [stockSummary])

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

  // Cards
  const summaryCards = [
    {
      key: 'received',
      label: 'Yarn Received (Spinning)',
      icon: ArrowDownCircle,
      color: 'blue',
      value: summaryValues.received,
    },
    {
      key: 'returnSpinning',
      label: 'Return (Spinning)',
      icon: ArrowUpCircle,
      color: 'red',
      value: summaryValues.returnSpinning,
    },
    {
      key: 'assignQty',
      label: 'Assign Qty',
      icon: Package,
      color: 'emerald',
      value: summaryValues.assignQty,
      sub:
        stockSummary?.assignedStock?.totalCount !== undefined
          ? `${stockSummary.assignedStock.totalCount} assignment(s)`
          : null,
    },
    {
      key: 'assignBalance',
      label: 'Assign Balance',
      icon: Layers,
      color: 'amber',
      value: summaryValues.assignBalance,
    },
    {
      key: 'deliveryKnitting',
      label: 'Delivery (Knitting)',
      icon: ArrowRightCircle,
      color: 'purple',
      value: summaryValues.deliveryKnitting,
    },
    {
      key: 'returnFromKnitting',
      label: 'Return (Knitting)',
      icon: RotateCcw,
      color: 'orange',
      value: summaryValues.returnFromKnitting,
    },
    {
      key: 'physicalBalance',
      label: 'Physical Balance',
      icon: Scale,
      color: 'teal',
      value: summaryValues.physicalBalance,
    },
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

      {summaryError && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {summaryError}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        {summaryCards.map((card) => {
          const Icon = card.icon
          return (
            <div key={card.key} className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 transition hover:shadow-md">
              <div className={`p-2 rounded-lg w-fit ${CARD_COLORS[card.color]}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{card.label}</p>
                {summaryLoading ? (
                  <div className="h-6 w-20 mt-1 bg-slate-200 rounded animate-pulse" />
                ) : (
                  <p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(card.value)}</p>
                )}
                {card.sub && !summaryLoading && (
                  <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
                )}
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

      {tableError && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {tableError}
        </div>
      )}

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
            {tableLoading ? (
              <tr>
                <td colSpan={totalColumns} className="text-center text-slate-400 py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 size={28} className="animate-spin text-slate-300" />
                    <p className="text-sm font-medium">Loading stock data...</p>
                  </div>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={totalColumns} className="text-center text-slate-400 py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Search size={32} className="text-slate-300" />
                    <p className="text-sm font-medium">
                      {data.length === 0 ? 'No stock records found.' : 'No records match the selected filters.'}
                    </p>
                    {hasFilters && (
                      <button onClick={handleClearAll} className="text-xs text-amber-600 hover:underline font-semibold">Clear all filters</button>
                    )}
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

          {!tableLoading && filteredData.length > 0 && (
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

      {!tableLoading && (
        <p className="mt-3 text-[11px] text-slate-400 text-right">
          Showing {filteredData.length} of {data.length} total records{monthFilter !== 'all' ? ` for ${monthLabel(monthFilter)}` : ''}.
        </p>
      )}
    </div>
  )
}

export default StockStatus