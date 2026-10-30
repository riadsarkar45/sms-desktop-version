// DailyCutting.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Filter, Download, RefreshCw, X, Search } from 'lucide-react'
import { useFetchData } from '../../hooks/fetch'

// ---------- COLUMN DEFINITIONS ----------
const columns = [
    { key: 'date', label: 'DATE' },
    { key: 'jobNumber', label: 'JOB NUMBER' },
    { key: 'styleNumber', label: 'STYLE NUMBER' },
    { key: 'color', label: 'COLOR' },
    { key: 'dailyCutting', label: 'DAILY CUTTING' },
    { key: 'remarks', label: 'REMARKS' },
]

// ---------- DATE HELPERS ----------
const toDateOnly = (d) => {
    if (!d) return new Date(NaN)
    const parts = String(d).split('T')[0].split('-')
    if (parts.length === 3) {
        return new Date(parts[0], parts[1] - 1, parts[2])
    }
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
}

const isSameDay = (a, b) => {
    const d1 = toDateOnly(a)
    const d2 = toDateOnly(b)
    return !isNaN(d1) && !isNaN(d2) && d1.getTime() === d2.getTime()
}

const startOfWeek = (d) => {
    const x = toDateOnly(d)
    if (isNaN(x)) return x
    const day = x.getDay()
    const diff = day === 0 ? 6 : day - 1
    x.setDate(x.getDate() - diff)
    return x
}

const startOfMonth = (d) => {
    const x = toDateOnly(d)
    if (isNaN(x)) return x
    x.setDate(1)
    return x
}

const monthLabel = (dateStr) => {
    const d = new Date(dateStr)
    if (isNaN(d)) return null
    return d.toLocaleString('default', { month: 'long', year: 'numeric' })
}

const formatNumber = (n) => Number(n || 0).toLocaleString('en-US')

// ---------- CSV EXPORT HELPER ----------
const exportToCSV = (data, cols, filename = 'daily-cutting.csv') => {
    const header = cols.map((c) => c.label).join(',')
    const rows = data.map((row) =>
        cols.map((c) => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

// ---------- SUMMARY CARD ----------
const SummaryCard = ({ label, value, accent = 'border-emerald-500' }) => (
    <div className={`flex-1 min-w-[200px] rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm border-l-4 ${accent}`}>
        <div className="text-[11px] font-semibold tracking-wide text-amber-600 uppercase">{label}</div>
        <div className="mt-1 text-xl font-bold text-slate-800">{formatNumber(value)}</div>
    </div>
)

// ---------- FILTER TRIGGER ----------
const FilterTrigger = ({ label, isActive, onOpen }) => (
    <button
        onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            onOpen(rect)
        }}
        className={`ml-1 rounded p-0.5 align-middle ${isActive ? 'text-amber-400' : 'text-slate-300'} hover:text-white`}
        title={`Filter ${label}`}
    >
        <Filter size={12} fill={isActive ? 'currentColor' : 'none'} />
    </button>
)

// ---------- FILTER MODAL ----------
const PANEL_WIDTH = 240

const FilterModal = ({ label, options, initialSelected, anchorRect, onApply, onClear, onClose }) => {
    const [search, setSearch] = useState('')
    const [pending, setPending] = useState(new Set(initialSelected))

    useEffect(() => {
        setPending(new Set(initialSelected))
        setSearch('')
    }, [label])

    const filteredOptions = options.filter((opt) =>
        opt.toLowerCase().includes(search.toLowerCase())
    )

    const toggleOption = (opt) => {
        setPending((prev) => {
            const next = new Set(prev)
            next.has(opt) ? next.delete(opt) : next.add(opt)
            return next
        })
    }

    const top = anchorRect.bottom + 4
    const maxLeft = window.innerWidth - PANEL_WIDTH - 8
    const left = Math.min(Math.max(anchorRect.left - PANEL_WIDTH + 20, 8), maxLeft)

    return createPortal(
        <>
            <div className="fixed inset-0 z-[99]" onMouseDown={onClose} />
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{ position: 'fixed', top, left, width: PANEL_WIDTH }}
                className="z-[100] overflow-hidden rounded-md border border-gray-200 bg-white text-slate-800 shadow-xl"
            >
                <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
                    <span className="text-sm font-semibold">Filter: {label}</span>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-2.5">
                    <div className="relative">
                        <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            autoFocus
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search..."
                            className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                    </div>
                </div>

                <div className="max-h-52 overflow-y-auto px-2.5 pb-1">
                    {filteredOptions.length === 0 ? (
                        <div className="py-3 text-center text-xs text-gray-400">No values</div>
                    ) : (
                        filteredOptions.map((opt) => (
                            <label key={opt} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                                <input
                                    type="checkbox"
                                    checked={pending.has(opt)}
                                    onChange={() => toggleOption(opt)}
                                    className="h-3.5 w-3.5"
                                />
                                <span className="truncate">{opt || '(blank)'}</span>
                            </label>
                        ))
                    )}
                </div>

                <div className="flex gap-2 border-t border-gray-200 px-2.5 py-2">
                    <button
                        onClick={() => onApply(pending)}
                        className="flex-1 rounded bg-blue-600 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        Apply
                    </button>
                    <button
                        onClick={onClear}
                        className="flex-1 rounded border border-gray-300 py-1.5 text-sm font-medium text-slate-700 hover:bg-gray-50"
                    >
                        Clear
                    </button>
                </div>
            </div>
        </>,
        document.body
    )
}

// ---------- MAIN COMPONENT ----------
const DailyCutting = () => {
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({})
    const [activeFilter, setActiveFilter] = useState(null)

    const [dateMode, setDateMode] = useState('all')
    const [customDate, setCustomDate] = useState('')
    const [customMonth, setCustomMonth] = useState('')
    
    const { fetchData } = useFetchData()

    const fetchProductionData = useCallback(async () => {
        try {
            setLoading(true)
            const res = await fetchData("/api/department-production-data/cutting")
            const rawData = res?.data || res || []
            
            // Group by styleRowId.id to merge identical color entries and sum their quantities
            const grouped = {}
            rawData.forEach((item) => {
                const colorId = item.styleRowId?.id ?? item.id ?? `temp-${Math.random().toString(36).substr(2, 9)}`
                const dateStr = item.productionDate 
                    ? new Date(item.productionDate).toISOString().split('T')[0] 
                    : 'N/A'
                
                if (!grouped[colorId]) {
                    grouped[colorId] = {
                        id: colorId,
                        date: dateStr,
                        jobNumber: item.jobNumber || 'N/A',
                        styleNumber: item.styleRowId?.styleRequirement?.styleNo || 'N/A',
                        color: item.styleRowId?.color || 'N/A',
                        dailyCutting: 0,
                        remarksSet: new Set(),
                        latestDateObj: new Date(dateStr)
                    }
                }
                
                // Sum the quantities for the same color ID
                grouped[colorId].dailyCutting += Number(item.productionQty) || 0
                
                // Combine remarks
                if (item.remarks?.trim()) {
                    grouped[colorId].remarksSet.add(item.remarks.trim())
                }
                
                // Keep the most recent date if there are multiple entries
                const currentDateObj = new Date(dateStr)
                if (currentDateObj > grouped[colorId].latestDateObj) {
                    grouped[colorId].latestDateObj = currentDateObj
                    grouped[colorId].date = dateStr
                }
            })
            
            const transformed = Object.values(grouped).map(item => ({
                ...item,
                remarks: Array.from(item.remarksSet).join(', ') || 'N/A'
            }))
            
            setData(transformed)
        } catch (e) {
            console.error("Failed to fetch production data:", e)
        } finally {
            setLoading(false)
        }
    }, [fetchData])

    useEffect(() => {
        fetchProductionData()
    }, [fetchProductionData])

    const referenceDate = useMemo(() => {
        const dates = data.map((r) => toDateOnly(r.date)).filter((d) => !isNaN(d.getTime()))
        if (dates.length === 0) return toDateOnly(new Date())
        return new Date(Math.max(...dates.map((d) => d.getTime())))
    }, [data])

    const yesterday = useMemo(() => {
        const y = new Date(referenceDate)
        y.setDate(y.getDate() - 1)
        return y
    }, [referenceDate])

    const weekStart = useMemo(() => startOfWeek(referenceDate), [referenceDate])
    const monthStart = useMemo(() => startOfMonth(referenceDate), [referenceDate])

    const summary = useMemo(() => {
        let dailyTotal = 0
        let weekTotal = 0
        let monthTotal = 0
        let grandTotal = 0

        data.forEach((row) => {
            const qty = Number(row.dailyCutting) || 0
            const d = toDateOnly(row.date)
            grandTotal += qty
            if (isSameDay(d, referenceDate)) dailyTotal += qty
            if (d >= weekStart && d <= referenceDate) weekTotal += qty
            if (d >= monthStart && d <= referenceDate) monthTotal += qty
        })

        return { dailyTotal, weekTotal, monthTotal, grandTotal }
    }, [data, referenceDate, weekStart, monthStart])

    const availableMonths = useMemo(() => {
        const set = new Set()
        data.forEach((row) => {
            const label = row.date ? monthLabel(row.date) : null
            if (label) set.add(label)
        })
        return Array.from(set).sort()
    }, [data])

    const getUniqueValues = (key) => {
        const set = new Set(data.map((row) => String(row[key] ?? '')))
        return Array.from(set).sort()
    }

    const applyFilter = (key, valuesSet) => {
        setFilters((prev) => {
            const next = { ...prev }
            if (valuesSet.size === 0) delete next[key]
            else next[key] = valuesSet
            return next
        })
        setActiveFilter(null)
    }

    const clearFilter = (key) => {
        setFilters((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
        })
        setActiveFilter(null)
    }

    const filteredData = useMemo(() => {
        return data.filter((row) => {
            const d = toDateOnly(row.date)

            if (dateMode === 'today' && !isSameDay(d, referenceDate)) return false
            if (dateMode === 'yesterday' && !isSameDay(d, yesterday)) return false
            if (dateMode === 'date' && customDate && !isSameDay(d, toDateOnly(customDate))) return false
            if (dateMode === 'month' && customMonth && monthLabel(row.date) !== customMonth) return false

            for (const key of Object.keys(filters)) {
                const set = filters[key]
                if (set && set.size > 0 && !set.has(String(row[key] ?? ''))) return false
            }
            return true
        })
    }, [data, filters, dateMode, customDate, customMonth, referenceDate, yesterday])

    const filteredTotal = useMemo(
        () => filteredData.reduce((sum, row) => sum + (Number(row.dailyCutting) || 0), 0),
        [filteredData]
    )

    // Group data by jobNumber for rowSpan display
    const groupedData = useMemo(() => {
        const groups = {}
        filteredData.forEach(row => {
            if (!groups[row.jobNumber]) {
                groups[row.jobNumber] = []
            }
            groups[row.jobNumber].push(row)
        })
        return groups
    }, [filteredData])

    const dateModes = [
        { key: 'all', label: 'All' },
        { key: 'today', label: 'Today' },
        { key: 'yesterday', label: 'Yesterday' },
        { key: 'date', label: 'Date' },
        { key: 'month', label: 'Month' },
    ]

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 w-full">
                <RefreshCw className="animate-spin text-blue-600" size={32} />
                <span className="ml-2 text-slate-600 font-medium">Loading production data...</span>
            </div>
        )
    }

    return (
        <div className="w-full space-y-3">
            <div className="flex flex-wrap gap-3">
                <SummaryCard label="Daily Cutting" value={summary.dailyTotal} accent="border-emerald-500" />
                <SummaryCard label="This Week Cutting" value={summary.weekTotal} accent="border-sky-500" />
                <SummaryCard label="This Month Cutting" value={summary.monthTotal} accent="border-violet-500" />
                <SummaryCard label="Total Cutting" value={summary.grandTotal} accent="border-amber-500" />
            </div>

            <div className="w-full rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {dateModes.map((m) => (
                            <button
                                key={m.key}
                                onClick={() => setDateMode(m.key)}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                    dateMode === m.key
                                        ? 'border-slate-800 bg-slate-800 text-white'
                                        : 'border-gray-300 bg-white text-slate-600 hover:bg-gray-50'
                                }`}
                            >
                                {m.label}
                            </button>
                        ))}

                        {dateMode === 'date' && (
                            <input
                                type="date"
                                value={customDate}
                                onChange={(e) => setCustomDate(e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                        )}

                        {dateMode === 'month' && (
                            <select
                                value={customMonth}
                                onChange={(e) => setCustomMonth(e.target.value)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            >
                                <option value="">Select month</option>
                                {availableMonths.map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        )}

                        <button
                            onClick={() => { setDateMode('all'); setCustomDate(''); setCustomMonth('') }}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                            title="Reset date filter"
                        >
                            <RefreshCw size={12} /> Reset
                        </button>
                    </div>

                    <button
                        onClick={() => exportToCSV(filteredData, columns, 'daily-cutting.csv')}
                        className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                        <Download size={13} /> Export
                    </button>
                </div>

                <div className="max-h-[520px] overflow-auto" onScroll={() => activeFilter && setActiveFilter(null)}>
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="sticky top-0 z-20">
                            <tr className="bg-slate-700 text-white">
                                {columns.map((col) => (
                                    <th
                                        key={col.key}
                                        className="border border-slate-600 px-3 py-2 text-center font-semibold whitespace-nowrap"
                                    >
                                        {col.label}
                                        <FilterTrigger
                                            label={col.label}
                                            isActive={filters[col.key] && filters[col.key].size > 0}
                                            onOpen={(rect) => setActiveFilter({ key: col.key, rect })}
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {Object.keys(groupedData).length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length} className="border border-gray-200 px-3 py-6 text-center text-gray-400">
                                        No matching records
                                    </td>
                                </tr>
                            ) : (
                                Object.entries(groupedData).map(([jobNumber, rows], groupIdx) => (
                                    rows.map((row, rowIdx) => (
                                        <tr key={`${jobNumber}-${row.id}`} className={groupIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            {rowIdx === 0 && (
                                                <>
                                                    <td 
                                                        rowSpan={rows.length}
                                                        className="border border-gray-200 px-3 py-2 text-center align-middle font-medium"
                                                    >
                                                        {row.date}
                                                    </td>
                                                    <td 
                                                        rowSpan={rows.length}
                                                        className="border border-gray-200 px-3 py-2 text-center align-middle font-medium"
                                                    >
                                                        {row.jobNumber}
                                                    </td>
                                                    <td 
                                                        rowSpan={rows.length}
                                                        className="border border-gray-200 px-3 py-2 text-center align-middle font-medium"
                                                    >
                                                        {row.styleNumber}
                                                    </td>
                                                </>
                                            )}
                                            <td className="border border-gray-200 px-3 py-2 text-center">
                                                <span className="inline-block px-2 py-1 text-xs font-semibold bg-blue-50 border border-blue-200 rounded text-blue-700">
                                                    {row.color}
                                                </span>
                                            </td>
                                            <td className="border border-gray-200 px-3 py-2 text-center font-semibold">
                                                {formatNumber(row.dailyCutting)}
                                            </td>
                                            {rowIdx === 0 && (
                                                <td 
                                                    rowSpan={rows.length}
                                                    className="border border-gray-200 px-3 py-2 text-center align-middle"
                                                >
                                                    {row.remarks || 'N/A'}
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                ))
                            )}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-20">
                            <tr className="bg-slate-700 font-semibold text-white">
                                <td
                                    colSpan={4}
                                    className="border border-slate-600 px-3 py-2 text-center"
                                >
                                    TOTAL
                                </td>
                                <td className="border border-slate-600 px-3 py-2 text-center">
                                    {formatNumber(filteredTotal)}
                                </td>
                                <td
                                    className="border border-slate-600 px-3 py-2 text-center"
                                />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {activeFilter && (
                <FilterModal
                    label={columns.find((c) => c.key === activeFilter.key)?.label}
                    options={getUniqueValues(activeFilter.key)}
                    initialSelected={filters[activeFilter.key] ?? new Set()}
                    anchorRect={activeFilter.rect}
                    onApply={(pendingSet) => applyFilter(activeFilter.key, pendingSet)}
                    onClear={() => clearFilter(activeFilter.key)}
                    onClose={() => setActiveFilter(null)}
                />
            )}
        </div>
    )
}

export default DailyCutting