// DailySewing.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Filter, Download, RefreshCw, X, Search, Save } from 'lucide-react'
import { useFetchData } from '../../hooks/fetch'
import useAxiosPrivate from '../../hooks/UseAxiosPrivate'

// ---------- SAVE ENDPOINT (change here if your route changes) ----------
const DEPARTMENT = 'sewing-production-qty'
const saveUrl = (row) => `/api/enter-production/${row.colorId}`

// ---------- HOUR + LEFT COLUMN DEFINITIONS ----------
const HOUR_SLOTS = ['8-9', '9-10', '10-11', '11-12', '12-1', 'LUNCH BREAK', '2-3', '3-4', '4-5', '5-6', '6-7', '7-8', '8-9', '9-10']
const HOUR_COLUMNS = HOUR_SLOTS.map((slot, i) => ({
    key: `h${i}`,
    label: slot,
    isLunch: slot === 'LUNCH BREAK',
}))

const LEFT_COLUMNS = [
    { key: 'date', label: 'DATE' },
    { key: 'lineNumber', label: 'LINE NUMBER' },
    { key: 'jobNumber', label: 'JOB NUMBER' },
    { key: 'styleNumber', label: 'STYLE NUMBER' },
    { key: 'color', label: 'COLOR' },
    { key: 'orderQty', label: 'ORDER QTY' },
    { key: 'targetHour', label: 'TARGET HOUR' },
    { key: 'dailyTarget', label: 'DAILY TARGET' },
    { key: 'dailyInput', label: 'DAILY INPUT' },
    { key: 'dailyOutput', label: 'DAILY OUTPUT' },
    { key: 'achv', label: 'ACHV (%)' },
]
const REMARKS_COLUMN = { key: 'remarks', label: 'REMARKS' }
const ALL_COLUMNS = [...LEFT_COLUMNS, ...HOUR_COLUMNS, REMARKS_COLUMN]

// numeric columns that get totaled in the sticky footer
const TOTAL_KEYS = ['dailyTarget', 'dailyInput', 'dailyOutput', ...HOUR_COLUMNS.map((h) => h.key)]

// editable cells, in the left-to-right order they appear in the table (lunch is skipped)
const EDIT_ORDER = ['dailyInput', 'dailyOutput', ...HOUR_COLUMNS.filter((h) => !h.isLunch).map((h) => h.key)]

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

const todayDate = () => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
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

// ---------- DATA TRANSFORM ----------
// One row = one color (styleRowId) on ONE day, so hourly numbers of different days never mix.
const buildRows = (rawData) => {
    const grouped = {}

    rawData.forEach((item) => {
        const hasObj = item.styleRowId && typeof item.styleRowId === 'object'
        const styleRowObj = hasObj ? item.styleRowId : {}
        const colorId = styleRowObj.id ?? (!hasObj ? item.styleRowId : null) ?? 'unknown'

        const parsed = item.productionDate ? new Date(item.productionDate) : null
        const dateStr = parsed && !isNaN(parsed) ? parsed.toISOString().split('T')[0] : 'N/A'

        const rowKey = `${colorId}|${dateStr}`
        const orderQty = Number(styleRowObj.orderQty ?? item.orderQty ?? 0) || 0

        if (!grouped[rowKey]) {
            grouped[rowKey] = {
                id: rowKey,          // unique per color + day (used for editing state and React keys)
                colorId,             // the real styleRowId (sent to the backend)
                date: dateStr,
                jobNumber: item.jobNumber || 'N/A',
                styleNumber: styleRowObj.styleRequirement?.styleNo || 'N/A',
                color: styleRowObj.color || 'N/A',
                orderQty,
                lineNumber: '',
                targetHour: 0,
                dailyTarget: 0,
                dailyInput: 0,
                dailyOutput: 0,
                achv: '0%',
                remarksSet: new Set(),
            }
            HOUR_COLUMNS.forEach((h) => {
                grouped[rowKey][h.key] = 0
            })
        }

        const g = grouped[rowKey]
        if (!g.orderQty && orderQty) g.orderQty = orderQty

        const qty = Number(item.productionQty) || 0
        const pType = item.productionType

        if (pType === 'lineNumber') {
            g.lineNumber = String(qty)
        } else if (pType === 'targetHour') {
            g.targetHour += qty
        } else if (pType === 'productionTarget' || pType === 'dailyTarget') {
            g.dailyTarget += qty
        } else if (pType === 'sewingInputQty' || pType === 'dailyInput') {
            g.dailyInput += qty
        } else if (pType === 'sewingOutputQty' || pType === 'dailyOutput') {
            g.dailyOutput += qty
        } else if (HOUR_COLUMNS.some((h) => h.key === pType)) {
            g[pType] = (g[pType] || 0) + qty
        }

        if (item.remarks?.trim()) {
            g.remarksSet.add(item.remarks.trim())
        }
    })

    return Object.values(grouped)
        .map((item) => {
            const achv =
                item.dailyTarget > 0
                    ? ((item.dailyOutput / item.dailyTarget) * 100).toFixed(1) + '%'
                    : '0%'
            return {
                ...item,
                achv,
                remarks: Array.from(item.remarksSet).join(', ') || 'N/A',
            }
        })
        .sort(
            (a, b) =>
                b.date.localeCompare(a.date) ||
                a.jobNumber.localeCompare(b.jobNumber) ||
                a.color.localeCompare(b.color)
        )
}

// ---------- CSV EXPORT HELPER ----------
const exportToCSV = (data, cols, filename = 'daily-sewing.csv') => {
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
const DailySewing = () => {
    const [data, setData] = useState([])
    const [loading, setLoading] = useState(true)
    const [filters, setFilters] = useState({})
    const [activeFilter, setActiveFilter] = useState(null)

    const [dateMode, setDateMode] = useState('all')
    const [customDate, setCustomDate] = useState('')
    const [customMonth, setCustomMonth] = useState('')

    // Inline editing state
    const [editingCell, setEditingCell] = useState(null) // { rowId, field }
    const [pendingEdits, setPendingEdits] = useState({}) // { rowId: { dailyInput: '12', h0: '30', ... } }
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const { fetchData } = useFetchData()
    const axiosPrivate = useAxiosPrivate()

    // silent = refresh after saving without replacing the table with the loading spinner
    const fetchSewingData = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true)
            const res = await fetchData('/api/department-production-data/sewing-production-qty')
            const rawData = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []
            setData(buildRows(rawData))
        } catch (e) {
            console.error('Failed to fetch sewing data:', e)
        } finally {
            setLoading(false)
        }
    }, [fetchData])

    useEffect(() => {
        fetchSewingData()
    }, [fetchSewingData])

    // ---------- INLINE EDITING HANDLERS ----------
    const handleCellClick = (row, field) => {
        setEditingCell({ rowId: row.id, field })
    }

    const handleInputChange = (rowId, field, value) => {
        setPendingEdits((prev) => ({
            ...prev,
            [rowId]: { ...(prev[rowId] || {}), [field]: value },
        }))
    }

    const clearPendingCell = (rowId, field) => {
        setPendingEdits((prev) => {
            const rowEdits = { ...(prev[rowId] || {}) }
            delete rowEdits[field]
            const next = { ...prev }
            if (Object.keys(rowEdits).length === 0) delete next[rowId]
            else next[rowId] = rowEdits
            return next
        })
    }

    // only close if this cell is still the one being edited (avoids clobbering a jump to the next cell)
    const handleInputBlur = (rowId, field) => {
        setEditingCell((cur) => (cur && cur.rowId === rowId && cur.field === field ? null : cur))
    }

    // Enter / Tab -> next editable cell in the row, Shift+Enter / Shift+Tab -> previous, Esc -> discard this cell
    const handleKeyDown = (e, row, field) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            const idx = EDIT_ORDER.indexOf(field)
            const next = EDIT_ORDER[idx + (e.shiftKey ? -1 : 1)]
            setEditingCell(next ? { rowId: row.id, field: next } : null)
        } else if (e.key === 'Escape') {
            clearPendingCell(row.id, field)
            setEditingCell(null)
        }
    }

    const submitPendingEdits = async () => {
        if (saving) return
        setSaveError('')

        const jobs = []
        const skippedRowIds = []

        Object.entries(pendingEdits).forEach(([rowId, fields]) => {
            const row = data.find((r) => String(r.id) === String(rowId))
            if (!row || row.date === 'N/A') {
                skippedRowIds.push(rowId)
                return
            }

            const detail = { colorId: row.colorId }

            EDIT_ORDER.forEach((key) => {
                if (fields[key] === undefined || fields[key] === '') return
                const newVal = Number(fields[key])
                if (isNaN(newVal)) return

                // Backend inserts a new row and the table sums rows, so send only the change
                const delta = newVal - (Number(row[key]) || 0)
                if (delta !== 0) detail[key] = delta
            })

            // only colorId present -> nothing actually changed
            if (Object.keys(detail).length === 1) {
                skippedRowIds.push(rowId)
                return
            }

            jobs.push({
                rowId,
                url: saveUrl(row),
                payload: {
                    date: row.date, // 'YYYY-MM-DD' of THIS row, not today
                    jobNo: row.jobNumber,
                    productionType: DEPARTMENT,
                    details: [detail],
                },
            })
        })

        console.log('Payloads to be sent to server:', JSON.stringify(jobs.map((j) => j.payload), null, 2))

        setSaving(true)
        const results = await Promise.allSettled(jobs.map((j) => axiosPrivate.post(j.url, j.payload)))
        setSaving(false)

        // Drop only what was saved (or had no change). Failed rows stay pending so nothing is lost
        // and a retry can't double-save the rows that already went through.
        let failed = 0
        setPendingEdits((prev) => {
            const next = { ...prev }
            skippedRowIds.forEach((id) => delete next[id])
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') delete next[jobs[i].rowId]
            })
            return next
        })
        results.forEach((r) => {
            if (r.status === 'rejected') {
                failed += 1
                console.error('Error saving edits:', r.reason)
            }
        })

        if (failed > 0) {
            setSaveError(`${failed} row(s) failed to save. They are still highlighted; press Submit again to retry.`)
        }
        setEditingCell(null)
        fetchSewingData(true)
    }

    const renderEditableCell = (row, colKey) => {
        const isEditing = editingCell?.rowId === row.id && editingCell?.field === colKey
        const pendingVal = pendingEdits[row.id]?.[colKey]
        const displayVal = pendingVal !== undefined ? pendingVal : row[colKey]
        const isLunch = HOUR_COLUMNS.find((h) => h.key === colKey)?.isLunch === true

        if (isLunch) {
            return (
                <div className="flex min-h-[28px] items-center justify-center bg-gray-100 text-gray-500" title="Lunch break">
                    -
                </div>
            )
        }

        if (isEditing) {
            return (
                <input
                    autoFocus
                    type="number"
                    min="0"
                    value={displayVal}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => handleInputChange(row.id, colKey, e.target.value)}
                    onBlur={() => handleInputBlur(row.id, colKey)}
                    onKeyDown={(e) => handleKeyDown(e, row, colKey)}
                    className="h-full w-full min-w-[56px] border-2 border-blue-500 bg-yellow-50 px-2 py-1 text-center text-[13px] font-semibold outline-none"
                />
            )
        }

        const hasPending = pendingVal !== undefined && pendingVal !== ''

        return (
            <div
                onClick={() => handleCellClick(row, colKey)}
                className={`flex min-h-[28px] cursor-pointer items-center justify-center px-2 ${
                    hasPending ? 'bg-green-100 font-bold text-green-800 hover:bg-blue-50' : 'hover:bg-blue-50'
                }`}
                title="Click to edit"
            >
                {formatNumber(displayVal)}
                {hasPending && <span className="ml-1 text-[10px] text-green-600">●</span>}
            </div>
        )
    }

    // ---------- SUMMARY / FILTERS ----------
    const referenceDate = useMemo(() => todayDate(), [])

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
            const qty = Number(row.dailyOutput) || 0
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

    const footerTotals = useMemo(() => {
        const totals = {}
        TOTAL_KEYS.forEach((key) => {
            totals[key] = filteredData.reduce((sum, row) => sum + (Number(row[key]) || 0), 0)
        })
        return totals
    }, [filteredData])

    // group by job + day so the date / job / style cells span only that day's color rows
    const groupedData = useMemo(() => {
        const groups = {}
        filteredData.forEach((row) => {
            const key = `${row.jobNumber}|${row.date}`
            if (!groups[key]) groups[key] = []
            groups[key].push(row)
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

    const pendingEditsCount = Object.keys(pendingEdits).length

    if (loading) {
        return (
            <div className="flex h-64 w-full items-center justify-center">
                <RefreshCw className="animate-spin text-blue-600" size={32} />
                <span className="ml-2 font-medium text-slate-600">Loading sewing data...</span>
            </div>
        )
    }

    return (
        <div className="w-full space-y-3">
            <div className="flex flex-wrap gap-3">
                <SummaryCard label="Daily Output" value={summary.dailyTotal} accent="border-emerald-500" />
                <SummaryCard label="This Week Output" value={summary.weekTotal} accent="border-sky-500" />
                <SummaryCard label="This Month Output" value={summary.monthTotal} accent="border-violet-500" />
                <SummaryCard label="Total Output" value={summary.grandTotal} accent="border-amber-500" />
            </div>

            {saveError && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {saveError}
                </div>
            )}

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

                    <div className="flex items-center gap-2">
                        {pendingEditsCount > 0 && (
                            <button
                                onClick={submitPendingEdits}
                                disabled={saving}
                                className="flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Save size={13} />
                                {saving ? 'Saving...' : `Submit Changes (${pendingEditsCount})`}
                            </button>
                        )}
                        <button
                            onClick={() => exportToCSV(filteredData, ALL_COLUMNS, 'daily-sewing.csv')}
                            className="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                        >
                            <Download size={13} /> Export
                        </button>
                    </div>
                </div>

                <div className="max-h-[560px] overflow-auto" onScroll={() => activeFilter && setActiveFilter(null)}>
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="sticky top-0 z-20">
                            <tr className="bg-slate-700 text-white">
                                {LEFT_COLUMNS.map((col) => (
                                    <th key={col.key} rowSpan={2} className="whitespace-nowrap border border-slate-600 px-3 py-2 text-center align-middle font-semibold">
                                        {col.label}
                                        <FilterTrigger
                                            label={col.label}
                                            isActive={filters[col.key] && filters[col.key].size > 0}
                                            onOpen={(rect) => setActiveFilter({ key: col.key, rect })}
                                        />
                                    </th>
                                ))}
                                <th colSpan={HOUR_COLUMNS.length} className="border border-slate-600 px-3 py-2 text-center font-semibold">
                                    HOUR & PRODUCTION
                                </th>
                                <th rowSpan={2} className="whitespace-nowrap border border-slate-600 px-3 py-2 text-center align-middle font-semibold">
                                    {REMARKS_COLUMN.label}
                                    <FilterTrigger
                                        label={REMARKS_COLUMN.label}
                                        isActive={filters[REMARKS_COLUMN.key] && filters[REMARKS_COLUMN.key].size > 0}
                                        onOpen={(rect) => setActiveFilter({ key: REMARKS_COLUMN.key, rect })}
                                    />
                                </th>
                            </tr>
                            <tr className="bg-slate-600 text-white">
                                {HOUR_COLUMNS.map((col) => (
                                    <th key={col.key} className="whitespace-nowrap border border-slate-500 px-2 py-2 text-center font-medium">
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
                                    <td colSpan={26} className="border border-gray-200 px-3 py-6 text-center text-gray-400">
                                        No matching records
                                    </td>
                                </tr>
                            ) : (
                                Object.entries(groupedData).map(([groupKey, rows], groupIdx) =>
                                    rows.map((row, rowIdx) => (
                                        <tr key={`${groupKey}-${row.id}`} className={groupIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            {/* Day + job level: span across that day's color rows */}
                                            {rowIdx === 0 && (
                                                <td rowSpan={rows.length} className="border border-gray-200 px-2 py-2 text-center align-middle font-medium">
                                                    {row.date}
                                                </td>
                                            )}

                                            {/* Line Number: every row */}
                                            <td className="border border-gray-200 px-2 py-2 text-center font-medium">
                                                {row.lineNumber}
                                            </td>

                                            {rowIdx === 0 && (
                                                <>
                                                    <td rowSpan={rows.length} className="border border-gray-200 px-2 py-2 text-center align-middle font-medium">
                                                        {row.jobNumber}
                                                    </td>
                                                    <td rowSpan={rows.length} className="border border-gray-200 px-2 py-2 text-center align-middle font-medium">
                                                        {row.styleNumber}
                                                    </td>
                                                </>
                                            )}

                                            {/* Per-color columns */}
                                            <td className="border border-gray-200 px-2 py-2 text-center">
                                                <span className="inline-block rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                                                    {row.color}
                                                </span>
                                            </td>
                                            <td className="border border-gray-200 px-2 py-2 text-center font-semibold">{formatNumber(row.orderQty)}</td>
                                            <td className="border border-gray-200 px-2 py-2 text-center font-semibold">{row.targetHour}</td>
                                            <td className="border border-gray-200 px-2 py-2 text-center font-semibold">{formatNumber(row.dailyTarget)}</td>

                                            {/* EDITABLE: DAILY INPUT */}
                                            <td className="border border-gray-200 p-0 text-center font-semibold">
                                                {renderEditableCell(row, 'dailyInput')}
                                            </td>

                                            {/* EDITABLE: DAILY OUTPUT */}
                                            <td className="border border-gray-200 p-0 text-center font-semibold">
                                                {renderEditableCell(row, 'dailyOutput')}
                                            </td>

                                            <td className="border border-gray-200 px-2 py-2 text-center font-semibold">{row.achv}</td>

                                            {/* EDITABLE: hourly columns (lunch is locked) */}
                                            {HOUR_COLUMNS.map((col) => (
                                                <td key={col.key} className="border border-gray-200 p-0 text-center">
                                                    {renderEditableCell(row, col.key)}
                                                </td>
                                            ))}

                                            {/* Remarks: per color row so no remark is hidden */}
                                            <td className="border border-gray-200 px-2 py-2 text-center align-middle">
                                                {row.remarks || 'N/A'}
                                            </td>
                                        </tr>
                                    ))
                                )
                            )}
                        </tbody>
                        <tfoot className="sticky bottom-0 z-20">
                            <tr className="bg-slate-700 font-semibold text-white">
                                <td colSpan={7} className="border border-slate-600 px-3 py-2 text-center">
                                    TOTAL
                                </td>
                                <td className="border border-slate-600 px-3 py-2 text-center">{formatNumber(footerTotals.dailyTarget)}</td>
                                <td className="border border-slate-600 px-3 py-2 text-center">{formatNumber(footerTotals.dailyInput)}</td>
                                <td className="border border-slate-600 px-3 py-2 text-center">{formatNumber(footerTotals.dailyOutput)}</td>
                                <td className="border border-slate-600 px-3 py-2 text-center"></td>
                                {HOUR_COLUMNS.map((col) => (
                                    <td key={col.key} className="border border-slate-600 px-2 py-2 text-center">
                                        {col.isLunch ? '-' : formatNumber(footerTotals[col.key] || 0)}
                                    </td>
                                ))}
                                <td className="border border-slate-600 px-3 py-2 text-center" />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {activeFilter && (
                <FilterModal
                    label={ALL_COLUMNS.find((c) => c.key === activeFilter.key)?.label}
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

export default DailySewing