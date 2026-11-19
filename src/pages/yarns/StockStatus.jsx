
import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react'

import {
  Filter,
  Search,
  X,
  PackageSearch,
  Layers,
  Scale,
  ArrowDownCircle,
  ArrowUpCircle,
  Package,
  ArrowRightCircle,
  RotateCcw,
  Save,
  XCircle,
  Pencil,
  AlertCircle,
  Loader2,
  FileText,
  Hash,
} from 'lucide-react'

import useAxiosPrivate from '../../hooks/UseAxiosPrivate'

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const NUMERIC_KEYS = [
  'received',
  'returnSpinning',
  'assignQty',
  'assignBalance',
  'deliveryKnitting',
  'returnFromKnitting',
  'physicalBalance',
]

const COLUMNS = [
  { key: 'supplierName', label: 'Supplier Name', width: 170 },

  { key: 'piNo', label: 'PI No', width: 145 },

  { key: 'lcNo', label: 'LC No', width: 145 },

  { key: 'yarnCount', label: 'Yarn Count', width: 100 },

  { key: 'composition', label: 'Yarn Composition', width: 160 },

  { key: 'lot', label: 'Lot', width: 110 },

  {
    key: 'received',
    label: 'Yarn Received Qty',
    width: 125,
    numeric: true,
  },

  {
    key: 'returnSpinning',
    label: 'Return to Spinning',
    width: 125,
    numeric: true,
  },

  {
    key: 'assignQty',
    label: 'Assign Qty',
    width: 110,
    numeric: true,
  },

  {
    key: 'assignBalance',
    label: 'Assign Balance',
    width: 120,
    numeric: true,
  },

  {
    key: 'deliveryKnitting',
    label: 'Yarn Delivery Qty (Knitting)',
    width: 140,
    numeric: true,
  },

  {
    key: 'returnFromKnitting',
    label: 'Return Received Qty (Knitting)',
    width: 145,
    numeric: true,
  },

  {
    key: 'physicalBalance',
    label: 'Calculated Physical Balance',
    width: 145,
    numeric: true,
  },
]

const REMARKS_WIDTH = 170

const CARD_COLORS = {
  blue: 'bg-blue-100 text-blue-600',
  red: 'bg-red-100 text-red-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  purple: 'bg-purple-100 text-purple-600',
  orange: 'bg-orange-100 text-orange-600',
  teal: 'bg-teal-100 text-teal-600',
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const num = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const fmt = (value) => num(value).toFixed(2)

const normalizeText = (value) =>
  String(value ?? '').trim().toLowerCase()

const calcPhysicalBalance = ({
  received,
  returnSpinning,
  deliveryKnitting,
  returnFromKnitting,
}) =>
  num(received) -
  num(returnSpinning) -
  num(deliveryKnitting) +
  num(returnFromKnitting)

const calcAssignBalance = ({
  assignQty,
  deliveryKnitting,
  returnFromKnitting,
}) =>
  num(assignQty) -
  num(deliveryKnitting) +
  num(returnFromKnitting)

// Normalize API rows without trusting the API's
// calculated balance values.
const normalizeRow = (row) => ({
  ...row,

  piNo: row.piNo ?? '',
  lcNo: row.lcNo ?? '',

  supplierName: row.supplierName ?? '',
  yarnCount: row.yarnCount ?? '',
  composition: row.composition ?? '',
  lot: row.lot ?? '',

  received: num(row.received),
  returnSpinning: num(row.returnSpinning),
  assignQty: num(row.assignQty),
  deliveryKnitting: num(row.deliveryKnitting),
  returnFromKnitting: num(row.returnFromKnitting),

  assignBalance: calcAssignBalance(row),

  physicalBalance: calcPhysicalBalance(row),
})

const monthLabel = (ym) => {
  if (!ym) return ''

  const [year, month] = ym.split('-')

  return new Date(
    Number(year),
    Number(month) - 1,
    1,
  ).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

const monthOf = (row) =>
  row.date ? String(row.date).slice(0, 7) : ''

// PI + LC + Lot + Count.
// Date is deliberately excluded because a row represents
// one PI/Lot/Count combination, not one movement date.
const rowKey = (row) =>
  JSON.stringify([
    row.piNo,
    row.lcNo,
    row.lot,
    row.yarnCount,
  ])

// --------------------------------------------------
// COLUMN FILTER DROPDOWN
// --------------------------------------------------

const ColumnFilterDropdown = ({
  column,
  uniqueValues,
  selectedValues,
  onApply,
  onClose,
  buttonRef,
}) => {
  const dropdownRef = useRef(null)

  const [searchTerm, setSearchTerm] = useState('')

  const [tempSelected, setTempSelected] = useState(
    () => new Set(selectedValues),
  )

  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  })

  useEffect(() => {
    const updatePosition = () => {
      if (!buttonRef?.current) return

      const rect = buttonRef.current.getBoundingClientRect()

      const width = 280
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - width - 8),
      )

      setPosition({
        top: rect.bottom + 4,
        left,
      })
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [buttonRef])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        !buttonRef?.current?.contains(event.target)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose, buttonRef])

  const filteredValues = useMemo(() => {
    if (!searchTerm.trim()) return uniqueValues

    const query = normalizeText(searchTerm)

    return uniqueValues.filter((value) =>
      normalizeText(value).includes(query),
    )
  }, [uniqueValues, searchTerm])

  const allFilteredSelected =
    filteredValues.length > 0 &&
    filteredValues.every((value) => tempSelected.has(value))

  const toggleSelectAll = () => {
    setTempSelected((previous) => {
      const next = new Set(previous)

      if (allFilteredSelected) {
        filteredValues.forEach((value) => next.delete(value))
      } else {
        filteredValues.forEach((value) => next.add(value))
      }

      return next
    })
  }

  const toggleValue = (value) => {
    setTempSelected((previous) => {
      const next = new Set(previous)

      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }

      return next
    })
  }

  const handleApply = () => {
    onApply(Array.from(tempSelected))
    onClose()
  }

  const formatDisplay = (value) =>
    column.numeric ? fmt(value) : String(value)

  return (
    <div
      ref={dropdownRef}
      className="fixed z-[100] bg-white border border-slate-300 rounded-lg shadow-xl w-[280px]"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="p-2 border-b border-slate-200">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
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
            className="w-4 h-4 rounded border-slate-300 text-blue-600"
          />

          <span className="text-sm font-semibold text-slate-900">
            (Select All)
          </span>
        </label>
      </div>

      <div className="max-h-[300px] overflow-y-auto p-2">
        {filteredValues.length === 0 ? (
          <div className="text-center text-sm text-slate-400 py-4">
            No values found
          </div>
        ) : (
          filteredValues.map((value) => (
            <label
              key={String(value)}
              className="flex items-center gap-2 py-1.5 px-2 hover:bg-slate-50 cursor-pointer rounded"
            >
              <input
                type="checkbox"
                checked={tempSelected.has(value)}
                onChange={() => toggleValue(value)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />

              <span
                className="text-sm text-slate-700 truncate"
                title={String(value)}
              >
                {formatDisplay(value)}
              </span>
            </label>
          ))
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2.5 border-t border-slate-200 bg-slate-50">
        <button
          onClick={onClose}
          className="text-sm font-medium text-slate-700 hover:bg-slate-200 px-4 py-1.5 rounded border border-slate-300 bg-white"
        >
          Cancel
        </button>

        <button
          onClick={handleApply}
          className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded"
        >
          OK
        </button>
      </div>
    </div>
  )
}

// --------------------------------------------------
// MAIN COMPONENT
// --------------------------------------------------

const StockStatus = () => {
  // Filters
  const [monthFilter, setMonthFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [columnFilters, setColumnFilters] = useState({})
  const [openFilter, setOpenFilter] = useState(null)

  const filterButtonRefs = useRef({})

  // Remarks
  const [remarks, setRemarks] = useState({})
  const [editingKey, setEditingKey] = useState(null)
  const [draftValue, setDraftValue] = useState('')

  const inputRef = useRef(null)

  // Table data
  const [data, setData] = useState([])
  const [tableLoading, setTableLoading] = useState(true)
  const [tableError, setTableError] = useState('')

  // Summary data
  const [stockSummary, setStockSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [summaryError, setSummaryError] = useState('')

  const axiosSecure = useAxiosPrivate()

  // --------------------------------------------------
  // FETCH DATA
  // --------------------------------------------------

  useEffect(() => {
    let cancelled = false

    const fetchSummary = async () => {
      try {
        setSummaryLoading(true)
        setSummaryError('')

        const response = await axiosSecure.get('/api/yarn-stock')

        if (cancelled) return

        if (response?.data?.success) {
          setStockSummary(response.data.data)
        } else {
          setSummaryError('Failed to load stock summary.')
        }
      } catch (error) {
        if (!cancelled) {
          setSummaryError(
            error?.response?.data?.message ||
            'Failed to load stock summary.',
          )
        }
      } finally {
        if (!cancelled) {
          setSummaryLoading(false)
        }
      }
    }

    const fetchTable = async () => {
      try {
        setTableLoading(true)
        setTableError('')

        const response = await axiosSecure.get(
          '/api/yarn-stock/table',
        )

        if (cancelled) return

        if (response?.data?.success) {
          const rows = Array.isArray(response.data.data)
            ? response.data.data
            : []

          setData(rows.map(normalizeRow))
        } else {
          setTableError('Failed to load stock table.')
        }
      } catch (error) {
        if (!cancelled) {
          setTableError(
            error?.response?.data?.message ||
            'Failed to load stock table.',
          )
        }
      } finally {
        if (!cancelled) {
          setTableLoading(false)
        }
      }
    }

    fetchSummary()
    fetchTable()

    return () => {
      cancelled = true
    }
  }, [axiosSecure])

  // --------------------------------------------------
  // REMARKS INPUT FOCUS
  // --------------------------------------------------

  useEffect(() => {
    if (editingKey && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingKey])

  // --------------------------------------------------
  // MONTHS
  // --------------------------------------------------

  const months = useMemo(() => {
    const monthSet = new Set(
      data.map(monthOf).filter(Boolean),
    )

    return Array.from(monthSet).sort()
  }, [data])

  // --------------------------------------------------
  // UNIQUE COLUMN VALUES
  // --------------------------------------------------

  const uniqueValuesByColumn = useMemo(() => {
    const result = {}

    COLUMNS.forEach((column) => {
      const values = new Set()

      data.forEach((row) => {
        const value = row[column.key]

        if (value !== undefined && value !== null && value !== '') {
          values.add(value)
        }
      })

      const sorted = Array.from(values)

      if (column.numeric) {
        sorted.sort((a, b) => Number(a) - Number(b))
      } else {
        sorted.sort((a, b) =>
          String(a).localeCompare(String(b)),
        )
      }

      result[column.key] = sorted
    })

    return result
  }, [data])

  // --------------------------------------------------
  // FILTERED DATA
  // --------------------------------------------------

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      // Month filter
      if (
        monthFilter !== 'all' &&
        monthOf(row) !== monthFilter
      ) {
        return false
      }

      // Global search
      if (searchText.trim()) {
        const query = normalizeText(searchText)

        const searchableValues = [
          row.supplierName,
          row.piNo,
          row.lcNo,
          row.yarnCount,
          row.composition,
          row.lot,
        ]

        const matches = searchableValues.some((value) =>
          normalizeText(value).includes(query),
        )

        if (!matches) return false
      }

      // Column filters
      for (const [key, selectedSet] of Object.entries(columnFilters)) {
        if (!selectedSet || selectedSet.size === 0) continue

        if (!selectedSet.has(row[key])) {
          return false
        }
      }

      return true
    })
  }, [
    data,
    monthFilter,
    searchText,
    columnFilters,
  ])

  // --------------------------------------------------
  // TOTALS
  // --------------------------------------------------

  const totals = useMemo(() => {
    const result = {}

    NUMERIC_KEYS.forEach((key) => {
      result[key] = filteredData.reduce(
        (sum, row) => sum + num(row[key]),
        0,
      )

      result[key] = Number(result[key].toFixed(2))
    })

    return result
  }, [filteredData])

  // --------------------------------------------------
  // SUMMARY CARDS
  // --------------------------------------------------

  const summaryValues = useMemo(() => {
    const received = num(
      stockSummary?.spinningMovement?.received,
    )

    const returnSpinning = num(
      stockSummary?.spinningMovement?.returned,
    )

    const assignQty = num(
      stockSummary?.assignedStock?.totalQty,
    )

    const deliveryKnitting = num(
      stockSummary?.yarnMovement?.delivered,
    )

    const returnFromKnitting = num(
      stockSummary?.yarnMovement?.returned,
    )

    return {
      received,
      returnSpinning,
      assignQty,
      deliveryKnitting,
      returnFromKnitting,

      assignBalance: calcAssignBalance({
        assignQty,
        deliveryKnitting,
        returnFromKnitting,
      }),

      physicalBalance: calcPhysicalBalance({
        received,
        returnSpinning,
        deliveryKnitting,
        returnFromKnitting,
      }),
    }
  }, [stockSummary])

  // --------------------------------------------------
  // FILTER ACTIONS
  // --------------------------------------------------

  const hasFilters =
    monthFilter !== 'all' ||
    searchText.trim() !== '' ||
    Object.values(columnFilters).some(
      (selected) => selected && selected.size > 0,
    )

  const handleClearAll = () => {
    setMonthFilter('all')
    setSearchText('')
    setColumnFilters({})
    setOpenFilter(null)
  }

  const handleColumnFilterApply = useCallback(
    (key, selectedArray) => {
      setColumnFilters((previous) => {
        const next = { ...previous }

        if (!selectedArray || selectedArray.length === 0) {
          delete next[key]
        } else {
          next[key] = new Set(selectedArray)
        }

        return next
      })
    },
    [],
  )

  const clearColumnFilter = (key) => {
    setColumnFilters((previous) => {
      const next = { ...previous }
      delete next[key]
      return next
    })
  }

  const toggleFilter = (key) => {
    setOpenFilter((previous) =>
      previous === key ? null : key,
    )
  }

  const isColumnFiltered = (key) => {
    const selected = columnFilters[key]

    return selected && selected.size > 0
  }

  const getFilterButtonRef = (key) => {
    if (!filterButtonRefs.current[key]) {
      filterButtonRefs.current[key] = React.createRef()
    }

    return filterButtonRefs.current[key]
  }

  // --------------------------------------------------
  // REMARKS
  // --------------------------------------------------

  const startEditing = (row) => {
    const key = rowKey(row)

    setEditingKey(key)
    setDraftValue(remarks[key] || '')
  }

  const saveRemark = () => {
    if (!editingKey) return

    setRemarks((previous) => ({
      ...previous,
      [editingKey]: draftValue,
    }))

    setEditingKey(null)
    setDraftValue('')
  }

  const discardRemark = () => {
    setEditingKey(null)
    setDraftValue('')
  }

  const handleDraftKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      saveRemark()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      discardRemark()
    }
  }

  // --------------------------------------------------
  // SUMMARY CARDS
  // --------------------------------------------------

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
      label: 'Calculated Physical Balance',
      icon: Scale,
      color: 'teal',
      value: summaryValues.physicalBalance,
    },
  ]

  const totalColumns = COLUMNS.length + 1

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <div
      style={{
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      }}
      className="w-full p-4 md:p-6"
    >
      {/* HEADER */}

      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <PackageSearch
              className="text-amber-600"
              size={24}
            />

            YARN STOCK STATUS
          </h1>

          <p className="text-sm text-slate-500 mt-1">
            PI-wise and LC-wise yarn movement, assignment and balance overview
          </p>
        </div>
      </div>

      {/* SUMMARY ERROR */}

      {summaryError && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {summaryError}
        </div>
      )}

      {/* SUMMARY CARDS */}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <div
              key={card.key}
              className="bg-slate-50 p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 transition hover:shadow-md"
            >
              <div
                className={`p-2 rounded-lg w-fit ${CARD_COLORS[card.color]}`}
              >
                <Icon size={18} />
              </div>

              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">
                  {card.label}
                </p>

                {summaryLoading ? (
                  <div className="h-6 w-20 mt-1 bg-slate-200 rounded animate-pulse" />
                ) : (
                  <p className="text-lg font-bold text-slate-800 mt-0.5">
                    {fmt(card.value)}
                  </p>
                )}

                {card.sub && !summaryLoading && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {card.sub}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* FILTERS */}

      <div className="mb-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-slate-700 shrink-0 pl-2">
            <Filter size={16} className="text-slate-500" />

            <span className="text-sm font-bold uppercase tracking-wide">
              Filters
            </span>
          </div>

          {/* MONTH FILTER */}

          <select
            value={monthFilter}
            onChange={(event) => setMonthFilter(event.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-[160px]"
          >
            <option value="all">All Months</option>

            {months.map((month) => (
              <option key={month} value={month}>
                {monthLabel(month)}
              </option>
            ))}
          </select>

          {/* GLOBAL SEARCH */}

          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search supplier, PI, LC, yarn count, composition, lot..."
              className="w-full text-sm border border-slate-300 rounded-lg pl-9 pr-9 py-2 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />

            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1 rounded-full"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* CLEAR FILTERS */}

          {hasFilters && (
            <button
              onClick={handleClearAll}
              className="flex items-center justify-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg border border-red-200 shrink-0"
            >
              <X size={15} />
              Clear All Filters
            </button>
          )}
        </div>

        {/* REMARKS EDITING TOOLBAR */}

        {editingKey && (
          <div className="mt-3 flex justify-end">
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 shadow-sm">
              <div className="flex items-center gap-1.5 text-amber-800 mr-2">
                <Pencil size={14} />

                <span className="text-xs font-semibold">
                  Editing remarks
                </span>
              </div>

              <div className="h-4 w-px bg-amber-300" />

              <button
                onClick={discardRemark}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:bg-white px-2.5 py-1.5 rounded border border-slate-300"
              >
                <XCircle size={13} />
                Discard
              </button>

              <button
                onClick={saveRemark}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded shadow-sm"
              >
                <Save size={13} />
                Save
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TABLE ERROR */}

      {tableError && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} />
          {tableError}
        </div>
      )}

      {/* TABLE */}

      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
        <table
          className="w-full border-collapse text-[12px]"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            {COLUMNS.map((column) => (
              <col
                key={column.key}
                style={{ width: column.width }}
              />
            ))}

            <col style={{ width: REMARKS_WIDTH }} />
          </colgroup>

          {/* TABLE HEADER */}

          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const filtered = isColumnFiltered(column.key)
                const isOpen = openFilter === column.key

                const buttonRef = getFilterButtonRef(column.key)

                return (
                  <th
                    key={column.key}
                    className="sticky top-0 z-10 bg-white text-slate-900 font-bold px-2 py-2.5 border border-slate-300 whitespace-normal break-words align-middle text-center"
                    style={{ lineHeight: 1.3 }}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className="text-[11px] truncate"
                        title={column.label}
                      >
                        {column.label}
                      </span>

                      <div className="relative shrink-0">
                        <button
                          ref={buttonRef}
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleFilter(column.key)
                          }}
                          className={`p-1 rounded transition relative ${
                            filtered
                              ? 'text-white bg-blue-600 hover:bg-blue-700'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                          }`}
                          title={
                            filtered
                              ? 'Filter active'
                              : `Filter by ${column.label}`
                          }
                        >
                          <Filter size={12} />

                          {filtered && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
                          )}
                        </button>

                        {isOpen && (
                          <ColumnFilterDropdown
                            column={column}
                            uniqueValues={
                              uniqueValuesByColumn[column.key] || []
                            }
                            selectedValues={
                              columnFilters[column.key] || new Set()
                            }
                            onApply={(values) =>
                              handleColumnFilterApply(
                                column.key,
                                values,
                              )
                            }
                            onClose={() => setOpenFilter(null)}
                            buttonRef={buttonRef}
                          />
                        )}
                      </div>
                    </div>

                    {filtered && (
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <div
                          className="text-[9px] font-normal text-white bg-blue-600 rounded px-1.5 py-0.5 truncate max-w-[100px]"
                          title={`${columnFilters[column.key].size} selected`}
                        >
                          {columnFilters[column.key].size} selected
                        </div>

                        <button
                          onClick={() =>
                            clearColumnFilter(column.key)
                          }
                          className="text-[9px] text-red-600 hover:text-red-800 p-0.5 rounded"
                          title="Clear this filter"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                  </th>
                )
              })}

              <th className="sticky top-0 z-10 bg-white text-slate-900 font-bold px-2 py-2.5 border border-slate-300 text-center">
                <span className="text-[11px]">Remarks</span>
              </th>
            </tr>
          </thead>

          {/* TABLE BODY */}

          <tbody>
            {tableLoading ? (
              <tr>
                <td
                  colSpan={totalColumns}
                  className="text-center text-slate-400 py-10"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Loader2
                      size={28}
                      className="animate-spin text-slate-300"
                    />

                    <p className="text-sm font-medium">
                      Loading stock data...
                    </p>
                  </div>
                </td>
              </tr>
            ) : filteredData.length === 0 ? (
              <tr>
                <td
                  colSpan={totalColumns}
                  className="text-center text-slate-400 py-10"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Search
                      size={32}
                      className="text-slate-300"
                    />

                    <p className="text-sm font-medium">
                      {data.length === 0
                        ? 'No stock records found.'
                        : 'No records match the selected filters.'}
                    </p>

                    {hasFilters && (
                      <button
                        onClick={handleClearAll}
                        className="text-xs text-amber-600 hover:underline font-semibold"
                      >
                        Clear all filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((row) => {
                const key = rowKey(row)
                const isEditing = editingKey === key

                return (
                  <tr
                    key={key}
                    className="group hover:bg-amber-50/50 transition-colors"
                  >
                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className={`px-3 py-2.5 border border-slate-200 align-middle whitespace-normal break-words text-center ${
                          column.numeric
                            ? 'font-mono text-slate-700'
                            : 'text-slate-600 group-hover:text-slate-900'
                        }`}
                      >
                        {column.numeric
                          ? fmt(row[column.key])
                          : row[column.key] || '—'}
                      </td>
                    ))}

                    {/* REMARKS */}

                    <td
                      className={`px-2 py-2 border border-slate-200 align-middle text-center cursor-text ${
                        isEditing ? 'bg-amber-50' : ''
                      }`}
                      onDoubleClick={() => startEditing(row)}
                      title="Double-click to edit"
                    >
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={draftValue}
                          onChange={(event) =>
                            setDraftValue(event.target.value)
                          }
                          onKeyDown={handleDraftKeyDown}
                          className="w-full text-xs text-center border border-amber-300 rounded-md px-2 py-1 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                          placeholder="Type remark..."
                        />
                      ) : (
                        <span
                          className={`text-xs ${
                            remarks[key]
                              ? 'text-slate-700'
                              : 'text-slate-300 italic'
                          }`}
                        >
                          {remarks[key] || 'Double-click to add'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>

          {/* GRAND TOTAL */}

          {!tableLoading && filteredData.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 text-slate-800 font-bold">
                {COLUMNS.map((column, index) => (
                  <td
                    key={column.key}
                    className="px-3 py-3 border border-slate-300 whitespace-normal break-words text-center"
                  >
                    {index === 0
                      ? 'GRAND TOTAL'
                      : column.numeric
                        ? fmt(totals[column.key])
                        : ''}
                  </td>
                ))}

                <td className="px-3 py-3 border border-slate-300 text-center" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* FOOTER */}

      {!tableLoading && (
        <p className="mt-3 text-[11px] text-slate-400 text-right">
          Showing {filteredData.length} of {data.length} total records
          {monthFilter !== 'all'
            ? ` for ${monthLabel(monthFilter)}`
            : ''}
        </p>
      )}
    </div>
  )
}

export default StockStatus
