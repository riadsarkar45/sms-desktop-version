import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Filter, X, GripVertical, Search, Download, CheckCircle, AlertCircle, Loader2, RefreshCcw } from 'lucide-react'
import useAxiosPrivate from '../../hooks/UseAxiosPrivate'
import { useAuth } from '../../auth/AuthContext'
import { Link } from 'react-router-dom'

/* ------------------------------------------------------------------ */
/*  Custom Toast Notification Component                                */
/* ------------------------------------------------------------------ */
const Toast = ({ notice, onClose }) => {
    // hook must run before any early return
    useEffect(() => {
        if (notice && notice.kind !== 'loading') {
            const timer = setTimeout(() => {
                onClose()
            }, 4000)
            return () => clearTimeout(timer)
        }
    }, [notice, onClose])

    if (!notice) return null

    const bgColors = {
        success: 'bg-green-50 border-green-500 text-green-800',
        error: 'bg-red-50 border-red-500 text-red-800',
        loading: 'bg-blue-50 border-blue-500 text-blue-800',
    }

    const icons = {
        success: <CheckCircle size={20} className="text-green-600 shrink-0" />,
        error: <AlertCircle size={20} className="text-red-600 shrink-0" />,
        loading: <Loader2 size={20} className="text-blue-600 shrink-0 animate-spin" />,
    }

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
            <div className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border-l-4 ${bgColors[notice.kind]} min-w-[300px] max-w-md transition-all duration-300`}>
                {icons[notice.kind]}
                <span className="text-sm font-medium flex-1">{notice.text}</span>
                {notice.kind !== 'loading' && (
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0 transition-colors">
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// yyyy-mm-dd  ->  dd-mm-yyyy
const formatDate = (iso) => {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return y && m && d ? `${d}-${m}-${y}` : iso
}

// Today as yyyy-mm-dd in the user's local time zone
const todayLocal = () => new Date().toLocaleDateString('en-CA')

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const cellValue = (row, key) => String(row[key] ?? '').trim()

// filters = { columnKey: Set(selected values) } — a column with no entry is not filtered
const rowMatches = (row, filters, skipKey) =>
    Object.keys(filters).every((key) => key === skipKey || filters[key].has(cellValue(row, key)))

const formatNumber = (n) => Number(n).toLocaleString('en-IN')

// BDT currency display, e.g. 45,000 -> ৳ 45,000
const formatCurrency = (n) => `৳ ${formatNumber(n)}`

// The ERP has its own zoom (67% / 100% ...). An element that lives inside the zoomed area is drawn bigger / smaller than its
// CSS size, so every "position: fixed" popup must convert screen pixels to its own CSS pixels with this factor. 1 = no zoom.
const getElScale = (el) => {
    if (!el) return 1
    const w = el.offsetWidth
    const rw = el.getBoundingClientRect().width
    if (!w || !rw) return 1
    const s = rw / w
    return s > 0.2 && s < 5 ? s : 1
}

const clampPosition = (x, y, width, height, scale = 1) => {
    const vw = window.innerWidth / scale
    const vh = window.innerHeight / scale
    return {
        x: Math.min(Math.max(8, x), Math.max(8, vw - width - 8)),
        y: Math.min(Math.max(8, y), Math.max(8, vh - height - 8)),
    }
}

const useMediaQuery = (query) => {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
    useEffect(() => {
        const mql = window.matchMedia(query)
        const handler = (e) => setMatches(e.matches)
        setMatches(mql.matches)
        mql.addEventListener('change', handler)
        return () => mql.removeEventListener('change', handler)
    }, [query])
    return matches
}

/* ------------------------------------------------------------------ */
/*  Column configuration                                               */
/* ------------------------------------------------------------------ */

const GROUPS = [
    { id: 'challan', label: 'Challan Details', head: 'bg-violet-100 text-violet-800', sub: 'bg-violet-50 text-violet-900' },
    { id: 'item', label: 'Item Details', head: 'bg-sky-100 text-sky-800', sub: 'bg-sky-50 text-sky-900' },
    { id: 'supplier', label: 'Asset & Supplier', head: 'bg-indigo-100 text-indigo-800', sub: 'bg-indigo-50 text-indigo-900' },
    { id: 'qty', label: 'Quantity', head: 'bg-emerald-100 text-emerald-800', sub: 'bg-emerald-50 text-emerald-900' },
    { id: 'price', label: 'Price Details', head: 'bg-rose-100 text-rose-800', sub: 'bg-rose-50 text-rose-900' },
    { id: 'movement', label: 'Movement', head: 'bg-amber-100 text-amber-800', sub: 'bg-amber-50 text-amber-900' },
    { id: 'notes', label: 'Notes', head: 'bg-slate-100 text-slate-700', sub: 'bg-slate-50 text-slate-800' },
]

const COLUMNS = [
    { key: 'date', label: 'Date', group: 'challan', width: 96, input: 'date', required: true, format: formatDate },
    { key: 'challanNo', label: 'Challan / Invoice Number', group: 'challan', width: 140, required: true, cell: 'font-mono' },
    { key: 'factoryName', label: 'FACTORY NAME', group: 'challan', width: 110, isBadge: true },
    { key: 'source', label: 'Source', group: 'challan', width: 110, isBadge: true },
    { key: 'assetType', label: 'Assets Type', group: 'item', width: 110 },
    { key: 'category', label: 'Assets Category', group: 'item', width: 120 },
    { key: 'description', label: 'Item Description', group: 'item', width: 180, required: true, cell: 'font-medium' },
    { key: 'assetCode', label: 'Asset Code', group: 'item', width: 104, required: true, cell: 'font-bold text-gray-900' },
    { key: 'assetId', label: 'Asset ID', group: 'supplier', width: 100, cell: 'font-mono' },
    { key: 'supplier', label: 'Name of Supplier', group: 'supplier', width: 170 },
    { key: 'model', label: 'Model/Brand #', group: 'supplier', width: 140 },
    { key: 'origin', label: 'Country of Origin', group: 'supplier', width: 130 },
    { key: 'sku', label: 'Sku/units', group: 'supplier', width: 90 },
    { key: 'openingQty', label: 'Opening Qty', group: 'qty', width: 100, type: 'number' },
    { key: 'additionsQty', label: 'Additions Qty', group: 'qty', width: 100, type: 'number' },
    { key: 'disposedQty', label: 'Disposed Qty', group: 'qty', width: 100, type: 'number' },
    { key: 'sentQty', label: 'Send to Another Unit Qty', group: 'qty', width: 130, type: 'number' },
    { key: 'receivedQty', label: 'Received From Another Unit Qty', group: 'qty', width: 145, type: 'number' },
    { key: 'totalCarrying', label: 'Total Carrying', group: 'qty', width: 120, type: 'number', derived: true, cell: 'font-bold text-emerald-700' },
    { key: 'priceValue', label: 'Price Value', group: 'price', width: 110, type: 'number', currency: true },
    { key: 'amount', label: 'Amount', group: 'price', width: 110, type: 'number', currency: true, cell: 'font-semibold text-gray-900' },
    { key: 'from', label: 'From', group: 'movement', width: 110 },
    { key: 'to', label: 'To', group: 'movement', width: 110 },
    { key: 'destination', label: 'Destination', group: 'movement', width: 160, cell: 'font-medium' },
    { key: 'remarks', label: 'Remarks', group: 'notes', width: 180 },
]

const NUMBER_COLUMNS = COLUMNS.filter((c) => c.type === 'number')
const EMPTY_FORM = COLUMNS.filter((c) => !c.derived).reduce((acc, col) => ({ ...acc, [col.key]: '' }), {})

const withDerived = (row) => ({
    ...row,
    totalCarrying:
        Number(row.openingQty || 0) + Number(row.additionsQty || 0) + Number(row.receivedQty || 0) - Number(row.disposedQty || 0) - Number(row.sentQty || 0),
})

// A row coming from the server: make sure it always has a date
const normalizeItem = (item) => ({
    ...item,
    date: item.date || (item.createdAt ? String(item.createdAt).split('T')[0] : todayLocal()),
})

// Date + challan wise order: newest date first, then challan number inside the same date
const compareDateChallan = (a, b) => {
    const da = String(a.date || '')
    const db = String(b.date || '')
    if (da !== db) return da < db ? 1 : -1
    return collator.compare(String(a.challanNo ?? ''), String(b.challanNo ?? ''))
}

const sameChallanGroup = (a, b) =>
    !!a && !!b && String(a.date || '') === String(b.date || '') && String(a.challanNo ?? '') === String(b.challanNo ?? '')

const computeTotals = (list) =>
    NUMBER_COLUMNS.reduce((acc, col) => {
        acc[col.key] = list.reduce((sum, row) => sum + Number(row[col.key] || 0), 0)
        return acc
    }, {})

const FROZEN_UNTIL = 'assetCode'
const FROZEN_COUNT = COLUMNS.findIndex((c) => c.key === FROZEN_UNTIL) + 1
const LEFT_OFFSETS = COLUMNS.map((_, i) => COLUMNS.slice(0, i).reduce((sum, c) => sum + c.width, 0))
const TOTAL_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0)
const FIRST_NUMBER_INDEX = COLUMNS.findIndex((c) => c.type === 'number')

const HEADER_CELL = 'border-r border-slate-400'
const BODY_CELL = 'border-b border-gray-200 border-r border-emerald-500'
const FOOTER_CELL = 'border-r border-slate-400'
const FROZEN_DIVIDER = 'border-r-2 border-r-slate-700'

/* ===== SCROLL LOADING + AUTO-FIT CONFIG (same system as the Knitting page) ===== */
// Rows are loaded page by page while the user scrolls down.
const PAGE_LIMIT = 100                // rows per request while scrolling
const MAX_LOADED_ROWS = 5000          // HARD LIMIT of rows kept in the browser (use filters to narrow the data)
const EXPORT_PAGE_LIMIT = 500         // export pulls the data in bigger chunks
const EXPORT_MAX_ROWS = 60000

// The table box always fills the rest of the screen: bigger screen = taller table, smaller screen = shorter table.
const MIN_TABLE_HEIGHT = 300          // only a safety minimum - the real height is calculated from the screen
const ROW_H = 44                      // fixed row height (needed for windowed rendering)
const HEADER_H = 64
const FOOTER_H = 40
const OVERSCAN = 8                    // extra rows rendered above / below the visible area
const FIT_DEBUG = false               // true = prints the measured numbers in the browser console (F12)

// The ERP has its own zoom (67% / 100% ...). With CSS zoom / scale the real screen pixels are NOT the same as the CSS
// pixels of the page, so the height must be corrected by this factor. 1 = no zoom.
const getZoomScale = (el) => {
    const rect = el.getBoundingClientRect()
    const w = el.offsetWidth
    if (!w || !rect.width) return 1
    const scale = rect.width / w
    return scale > 0.2 && scale < 5 ? scale : 1
}

// Accepts the axios response (or its body) and returns { items, nextCursor, hasMore }
// A plain array (server without paging) is fine too: everything arrives in one page.
const unwrapPage = (res) => {
    const body = res?.data !== undefined && !Array.isArray(res) ? res.data : res
    if (Array.isArray(body)) return { items: body, nextCursor: null, hasMore: false }
    if (Array.isArray(body?.data)) {
        return { items: body.data, nextCursor: body.nextCursor ?? null, hasMore: !!body.hasMore }
    }
    if (Array.isArray(body?.data?.data)) {
        return { items: body.data.data, nextCursor: body.data.nextCursor ?? null, hasMore: !!body.data.hasMore }
    }
    return { items: [], nextCursor: null, hasMore: false }
}

const buildListParams = (cursor, limit = PAGE_LIMIT) => {
    const params = { limit }
    if (cursor !== null && cursor !== undefined) params.cursor = cursor
    return params
}

// Text clamp inside a fixed-height row (2 lines, full text on hover)
const CLAMP_STYLE = {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    wordBreak: 'break-word',
    lineHeight: 1.2,
}
/* ===== END SCROLL LOADING + AUTO-FIT CONFIG ===== */

/* ===== XLSX EXPORT START ===== */

const XLSX_WIDTHS = {
    date: 12, challanNo: 20, factoryName: 16, source: 15, assetType: 16, category: 18, description: 32, assetCode: 14,
    assetId: 12, supplier: 26, model: 22, origin: 18, sku: 10,
    openingQty: 12, additionsQty: 12, disposedQty: 12, sentQty: 16, receivedQty: 18, totalCarrying: 14,
    priceValue: 14, amount: 16,
    from: 14, to: 14, destination: 24, remarks: 26,
}

const XLSX_COLUMNS = COLUMNS.map((col) => ({
    key: col.key,
    header: col.label,
    width: XLSX_WIDTHS[col.key] || 16,
    kind: col.input === 'date' ? 'date' : col.currency ? 'currency' : col.type === 'number' ? 'qty' : 'text',
}))

const XS = { TITLE: 1, HEADER: 2, HEADER_DIV: 3, TEXT: 4, TEXT_DIV: 5, DATE: 6, QTY: 7, TOTAL_QTY: 8, CURRENCY: 9, TOTAL_CURRENCY: 10 }

const xmlEscape = (value) =>
    String(value)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

const xlsxColLetter = (index) => {
    let n = index + 1
    let letters = ''
    while (n > 0) {
        const rest = (n - 1) % 26
        letters = String.fromCharCode(65 + rest) + letters
        n = Math.floor((n - 1) / 26)
    }
    return letters
}

const xlsxNum = (value) => String(Number.isFinite(Number(value)) ? Number(value) : 0)

const excelDateSerial = (iso) => {
    const [y, m, d] = String(iso || '').split('-').map(Number)
    if (!y || !m || !d) return null
    return Date.UTC(y, m - 1, d) / 86400000 + 25569
}

const cellText = (ref, style, text) =>
    `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`
const cellNumber = (ref, style, value) => `<c r="${ref}" s="${style}"><v>${xlsxNum(value)}</v></c>`
const cellFormula = (ref, style, formula, result) =>
    `<c r="${ref}" s="${style}"><f>${xmlEscape(formula)}</f><v>${xlsxNum(result)}</v></c>`
const cellBlank = (ref, style) => `<c r="${ref}" s="${style}"/>`

const buildStylesXml = () => {
    const thin = (rgb) => `style="thin"><color rgb="${rgb}"/>`
    const border = (left, right, top, bottom) =>
        `<border><left ${left}</left><right ${right}</right><top ${top}</top><bottom ${bottom}</bottom><diagonal/></border>`
    const slate = thin('FF94A3B8')
    const green = thin('FF10B981')
    const gray = thin('FFE5E7EB')
    const divider = 'style="medium"><color rgb="FF334155"/>'
    const align = '<alignment horizontal="center" vertical="center" wrapText="1"/>'
    const xf = (numFmtId, fontId, fillId, borderId) =>
        `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0;-#,##0;&quot;-&quot;"/><numFmt numFmtId="165" formatCode="dd\\-mm\\-yyyy"/><numFmt numFmtId="166" formatCode="&quot;৳&quot;\\ #,##0;-&quot;৳&quot;\\ #,##0;&quot;-&quot;"/></numFmts>
<fonts count="4">
<font><sz val="10"/><color rgb="FF374151"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FF374151"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF64748B"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="5">
<border><left/><right/><top/><bottom/><diagonal/></border>
${border(slate, slate, slate, slate)}
${border(slate, divider, slate, slate)}
${border(green, green, gray, gray)}
${border(green, divider, gray, gray)}
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
${xf(0, 3, 0, 0)}
${xf(0, 2, 2, 1)}
${xf(0, 2, 2, 2)}
${xf(0, 0, 0, 3)}
${xf(0, 0, 0, 4)}
${xf(165, 0, 0, 3)}
${xf(164, 0, 0, 3)}
${xf(164, 2, 2, 1)}
${xf(166, 0, 0, 3)}
${xf(166, 2, 2, 1)}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

const buildSheetXml = (rows, totals, generatedOn) => {
    const lastCol = XLSX_COLUMNS.length
    const lastColLetter = xlsxColLetter(lastCol - 1)
    const titleRow = 1
    const headerRow = 2
    const firstDataRow = 3
    const totalRow = firstDataRow + rows.length
    const lastDataRow = totalRow - 1
    const isDivider = (i) => i === FROZEN_COUNT - 1

    const xmlRows = []

    const titleCells = XLSX_COLUMNS.map((_, i) =>
        i === 0
            ? cellText('A1', XS.TITLE, generatedOn ? `Asset Movement  |  ${generatedOn}` : 'Asset Movement')
            : cellBlank(`${xlsxColLetter(i)}${titleRow}`, XS.TITLE)
    )
    xmlRows.push(`<row r="${titleRow}" ht="28" customHeight="1">${titleCells.join('')}</row>`)

    const headerCells = XLSX_COLUMNS.map((col, i) =>
        cellText(`${xlsxColLetter(i)}${headerRow}`, isDivider(i) ? XS.HEADER_DIV : XS.HEADER, col.header)
    )
    xmlRows.push(`<row r="${headerRow}" ht="40" customHeight="1">${headerCells.join('')}</row>`)

    rows.forEach((row, rowIndex) => {
        const r = firstDataRow + rowIndex
        const cells = XLSX_COLUMNS.map((col, i) => {
            const ref = `${xlsxColLetter(i)}${r}`
            if (col.kind === 'currency') return cellNumber(ref, XS.CURRENCY, row[col.key])
            if (col.kind === 'qty') return cellNumber(ref, XS.QTY, row[col.key])
            if (col.kind === 'date') {
                const serial = excelDateSerial(row[col.key])
                return serial === null ? cellText(ref, XS.TEXT, row[col.key] || '_') : cellNumber(ref, XS.DATE, serial)
            }
            return cellText(ref, isDivider(i) ? XS.TEXT_DIV : XS.TEXT, row[col.key] || '_')
        })
        xmlRows.push(`<row r="${r}" ht="24" customHeight="1">${cells.join('')}</row>`)
    })

    const totalCells = XLSX_COLUMNS.map((col, i) => {
        const ref = `${xlsxColLetter(i)}${totalRow}`
        if (i === 0) return cellText(ref, XS.HEADER, 'TOTAL')
        if (i < FROZEN_COUNT) return cellBlank(ref, isDivider(i) ? XS.HEADER_DIV : XS.HEADER)
        if (col.kind === 'qty' || col.kind === 'currency') {
            const l = xlsxColLetter(i)
            const style = col.kind === 'currency' ? XS.TOTAL_CURRENCY : XS.TOTAL_QTY
            return cellFormula(ref, style, `SUM(${l}${firstDataRow}:${l}${lastDataRow})`, totals[col.key])
        }
        return cellBlank(ref, XS.HEADER)
    })
    xmlRows.push(`<row r="${totalRow}" ht="26" customHeight="1">${totalCells.join('')}</row>`)

    const cols = XLSX_COLUMNS.map(
        (col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`
    ).join('')

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${lastColLetter}${totalRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane xSplit="${FROZEN_COUNT}" ySplit="${headerRow}" topLeftCell="${xlsxColLetter(FROZEN_COUNT)}${firstDataRow}" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${cols}</cols>
<sheetData>${xmlRows.join('')}</sheetData>
<autoFilter ref="A${headerRow}:${lastColLetter}${headerRow}"/>
<mergeCells count="2"><mergeCell ref="A${titleRow}:${lastColLetter}${titleRow}"/><mergeCell ref="A${totalRow}:${xlsxColLetter(FROZEN_COUNT - 1)}${totalRow}"/></mergeCells>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
        let c = n
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        table[n] = c >>> 0
    }
    return table
})()

const crc32 = (bytes) => {
    let c = 0xffffffff
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}

const buildZip = (files) => {
    const encoder = new TextEncoder()
    const now = new Date()
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

    const localParts = []
    const centralParts = []
    let offset = 0

    files.forEach(({ name, text }) => {
        const nameBytes = encoder.encode(name)
        const data = encoder.encode(text)
        const crc = crc32(data)

        const local = new Uint8Array(30 + nameBytes.length)
        const lv = new DataView(local.buffer)
        lv.setUint32(0, 0x04034b50, true)
        lv.setUint16(4, 20, true)
        lv.setUint16(6, 0x0800, true)
        lv.setUint16(8, 0, true)
        lv.setUint16(10, dosTime, true)
        lv.setUint16(12, dosDate, true)
        lv.setUint32(14, crc, true)
        lv.setUint32(18, data.length, true)
        lv.setUint32(22, data.length, true)
        lv.setUint16(26, nameBytes.length, true)
        lv.setUint16(28, 0, true)
        local.set(nameBytes, 30)

        const central = new Uint8Array(46 + nameBytes.length)
        const cv = new DataView(central.buffer)
        cv.setUint32(0, 0x02014b50, true)
        cv.setUint16(4, 20, true)
        cv.setUint16(6, 20, true)
        cv.setUint16(8, 0x0800, true)
        cv.setUint16(10, 0, true)
        cv.setUint16(12, dosTime, true)
        cv.setUint16(14, dosDate, true)
        cv.setUint32(16, crc, true)
        cv.setUint32(20, data.length, true)
        cv.setUint32(24, data.length, true)
        cv.setUint16(28, nameBytes.length, true)
        cv.setUint32(42, offset, true)
        central.set(nameBytes, 46)

        localParts.push(local, data)
        centralParts.push(central)
        offset += local.length + data.length
    })

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
    const end = new Uint8Array(22)
    const ev = new DataView(end.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(8, files.length, true)
    ev.setUint16(10, files.length, true)
    ev.setUint32(12, centralSize, true)
    ev.setUint32(16, offset, true)

    const parts = [...localParts, ...centralParts, end]
    const zip = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let position = 0
    parts.forEach((part) => {
        zip.set(part, position)
        position += part.length
    })
    return zip
}

const buildAssetMovementXlsx = (rows, totals, generatedOn = '') => {
    const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    const lastCol = xlsxColLetter(XLSX_COLUMNS.length - 1)
    return buildZip([
        {
            name: '[Content_Types].xml',
            text: `${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
        },
        {
            name: '_rels/.rels',
            text: `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        },
        {
            name: 'xl/workbook.xml',
            text: `${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Asset Movement" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Asset Movement'!$A$2:$${lastCol}$2</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            text: `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        },
        { name: 'xl/styles.xml', text: buildStylesXml() },
        { name: 'xl/worksheets/sheet1.xml', text: buildSheetXml(rows, totals, generatedOn) },
    ])
}

const downloadXlsx = (bytes, filename) => {
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}
/* ===== XLSX EXPORT END ===== */

/* ------------------------------------------------------------------ */
/*  Draggable modal                                                    */
/* ------------------------------------------------------------------ */

const DraggableModal = ({
    title,
    width = 720,
    initialPosition = null,
    dim = false,
    closeOnBackdrop = false,
    onClose,
    footer = null,
    children,
}) => {
    const modalRef = useRef(null)
    const dragRef = useRef(null)
    const [pos, setPos] = useState(null)
    const [isDragging, setIsDragging] = useState(false)

    useLayoutEffect(() => {
        const el = modalRef.current
        if (!el) return
        const s = getElScale(el)
        const w = el.offsetWidth
        const h = el.offsetHeight
        const x = initialPosition ? initialPosition.x / s : (window.innerWidth / s - w) / 2
        const y = initialPosition ? initialPosition.y / s : (window.innerHeight / s - h) / 2
        setPos(clampPosition(x, y, w, h, s))
    }, [])

    useEffect(() => {
        const handleResize = () => {
            const el = modalRef.current
            if (!el) return
            const s = getElScale(el)
            setPos((prev) => (prev ? clampPosition(prev.x, prev.y, el.offsetWidth, el.offsetHeight, s) : prev))
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const handlePointerDown = (e) => {
        if (!pos) return
        if (e.button !== undefined && e.button !== 0) return
        if (e.target.closest('button')) return
        const s = getElScale(modalRef.current)
        dragRef.current = { offsetX: e.clientX / s - pos.x, offsetY: e.clientY / s - pos.y }
        e.currentTarget.setPointerCapture(e.pointerId)
        setIsDragging(true)
    }

    const handlePointerMove = (e) => {
        const drag = dragRef.current
        const el = modalRef.current
        if (!drag || !el) return
        const s = getElScale(el)
        setPos(clampPosition(e.clientX / s - drag.offsetX, e.clientY / s - drag.offsetY, el.offsetWidth, el.offsetHeight, s))
    }

    const endDrag = (e) => {
        if (!dragRef.current) return
        dragRef.current = null
        setIsDragging(false)
        try {
            e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
            /* pointer already released */
        }
    }

    return createPortal(
        <div
            className={`fixed inset-0 z-[60] ${dim ? 'bg-black/40' : ''}`}
            onMouseDown={(e) => {
                if (closeOnBackdrop && e.target === e.currentTarget) onClose()
            }}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="fixed flex flex-col bg-white rounded-xl shadow-2xl border border-gray-300 max-h-[calc(100vh-16px)]"
                style={{
                    left: pos ? pos.x : 0,
                    top: pos ? pos.y : 0,
                    width,
                    maxWidth: 'calc(100vw - 16px)',
                    visibility: pos ? 'visible' : 'hidden',
                }}
            >
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-t-xl bg-slate-100 border-b border-gray-300 text-slate-800 select-none touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <GripVertical size={16} className="shrink-0 text-slate-500" />
                        <h3 className="text-sm font-bold uppercase tracking-wide truncate">{title}</h3>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline text-[11px] text-slate-500">Drag to move</span>
                        <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-md hover:bg-black/10 cursor-pointer transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">{children}</div>

                {footer && <div className="px-4 py-3 border-t border-gray-300 bg-gray-50 rounded-b-xl">{footer}</div>}
            </div>
        </div>,
        document.body
    )
}

/* ------------------------------------------------------------------ */
/*  Excel-style column filter popup                                    */
/*  - opens right under the column header (not draggable, no backdrop) */
/*  - flips above the header when there is no room below               */
/*  - follows the header on scroll / resize, closes on outside click   */
/*  - corrected for the ERP zoom (67% / 100% ...)                      */
/* ------------------------------------------------------------------ */

const FILTER_POPUP_WIDTH = 250

const ColumnFilterModal = ({ column, values, selected, anchorEl, onApply, onClose }) => {
    const [search, setSearch] = useState('')
    const [draft, setDraft] = useState(() => new Set(selected ?? values))
    const [pos, setPos] = useState(null)
    const selectAllRef = useRef(null)
    const popRef = useRef(null)

    const display = (value) => (value === '' ? '(Blanks)' : column.format ? column.format(value) : value)

    const visibleValues = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return values
        return values.filter((v) => (v === '' ? '(blanks)' : column.format ? column.format(v) : v).toLowerCase().includes(term))
    }, [values, search, column])

    const selectedVisibleCount = visibleValues.filter((v) => draft.has(v)).length
    const allVisibleSelected = visibleValues.length > 0 && selectedVisibleCount === visibleValues.length
    const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

    useEffect(() => {
        if (selectAllRef.current) selectAllRef.current.indeterminate = someVisibleSelected
    }, [someVisibleSelected])

    // place the popup under the header cell (screen pixels -> the popup's own CSS pixels, so the ERP zoom is handled)
    const place = useCallback(() => {
        const el = popRef.current
        if (!el || !anchorEl) return
        const s = getElScale(el)
        const w = el.offsetWidth
        const h = el.offsetHeight
        const vw = window.innerWidth / s
        const vh = window.innerHeight / s
        const r = anchorEl.getBoundingClientRect()
        const a = { left: r.left / s, right: r.right / s, top: r.top / s, bottom: r.bottom / s }

        // left edge of the header; if it would leave the screen, align the right edge instead
        let x = a.left
        if (x + w > vw - 8) x = a.right - w
        x = Math.min(Math.max(8, x), Math.max(8, vw - w - 8))

        let next
        const below = a.bottom + 2
        if (below + h <= vh - 8) {
            next = { x, y: below }
        } else if (a.top - 2 - h >= 8) {
            // not enough room below: open above the header (grows upward)
            next = { x, bottom: vh - (a.top - 2) }
        } else {
            next = { x, y: Math.max(8, vh - h - 8) }
        }
        setPos((prev) =>
            prev && prev.x === next.x && prev.y === next.y && prev.bottom === next.bottom ? prev : next
        )
    }, [anchorEl])

    useLayoutEffect(() => {
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
        }
    }, [place])

    // click outside / Escape closes the popup (the filter icon itself toggles it)
    useEffect(() => {
        const handleMouseDown = (e) => {
            if (popRef.current && popRef.current.contains(e.target)) return
            if (e.target.closest && e.target.closest('[data-filter-trigger]')) return
            onClose()
        }
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('mousedown', handleMouseDown)
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('mousedown', handleMouseDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [onClose])

    const toggleValue = (value) => {
        setDraft((prev) => {
            const next = new Set(prev)
            if (next.has(value)) next.delete(value)
            else next.add(value)
            return next
        })
    }

    const toggleAllVisible = () => {
        setDraft((prev) => {
            const next = new Set(prev)
            if (allVisibleSelected) visibleValues.forEach((v) => next.delete(v))
            else visibleValues.forEach((v) => next.add(v))
            return next
        })
    }

    return createPortal(
        <div
            ref={popRef}
            role="dialog"
            aria-label={`Filter: ${column.label}`}
            className="fixed z-[60] flex flex-col bg-white border border-gray-300 rounded-md shadow-2xl"
            style={{
                left: pos ? pos.x : 0,
                ...(pos && pos.bottom !== undefined ? { bottom: pos.bottom } : { top: pos ? pos.y : 0 }),
                width: FILTER_POPUP_WIDTH,
                maxWidth: 'calc(100vw - 16px)',
                visibility: pos ? 'visible' : 'hidden',
            }}
        >
            <div className="p-2 space-y-2">
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search"
                        autoFocus
                        className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-sm outline-none focus:border-primary-500"
                    />
                </div>

                <div className="border border-gray-300 rounded-sm max-h-56 overflow-y-auto bg-white">
                    {visibleValues.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-gray-500">No matches</p>
                    ) : (
                        <>
                            <label className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-gray-800 border-b border-gray-300 cursor-pointer hover:bg-gray-50">
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleAllVisible}
                                    className="w-3 h-3 cursor-pointer accent-primary-600"
                                />
                                {search.trim() ? '(Select All Search Results)' : '(Select All)'}
                            </label>
                            {visibleValues.map((value) => (
                                <label key={value === '' ? '__blank__' : value} className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-gray-700 cursor-pointer hover:bg-gray-50">
                                    <input
                                        type="checkbox"
                                        checked={draft.has(value)}
                                        onChange={() => toggleValue(value)}
                                        className="w-3 h-3 cursor-pointer accent-primary-600"
                                    />
                                    <span className="truncate">{display(value)}</span>
                                </label>
                            ))}
                        </>
                    )}
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-2 py-2 border-t border-gray-300 bg-gray-50 rounded-b-md">
                <button
                    type="button"
                    onClick={() => onApply(draft, values)}
                    disabled={draft.size === 0}
                    className="px-1.5 py-1.4 text-[12px] font-bold text-black bg-gray-200 hover:bg-primary-600 rounded-md cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Apply
                </button>
                <button type="button" onClick={onClose} className="px-1.5 py-1.4 text-[12px] font-bold text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-md cursor-pointer transition-colors">
                    Cancel
                </button>
            </div>
        </div>,
        document.body
    )
}

/* ------------------------------------------------------------------ */
/*  Add Challan modal                                                  */
/* ------------------------------------------------------------------ */

const AddChallanModal = ({ onSave, onClose, showNotice }) => {
    const [form, setForm] = useState(() => ({ ...EMPTY_FORM, date: todayLocal() }))
    const [editedFields, setEditedFields] = useState(new Set())
    const [errors, setErrors] = useState({})
    const axiosPrivate = useAxiosPrivate()

    const handleChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        setEditedFields((prev) => {
            const next = new Set(prev)
            next.add(key)
            return next
        })
        setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
    }

    const validate = () => {
        const next = {}
        COLUMNS.forEach((col) => {
            if (col.derived) return
            const value = String(form[col.key] ?? '').trim()
            if (col.required && !value) next[col.key] = `${col.label} is required`
            if (col.type === 'number' && value !== '') {
                const n = Number(value)
                if (!Number.isFinite(n) || n < 0) next[col.key] = 'Enter 0 or a positive number'
            }
        })
        return next
    }

    const handleSave = async () => {
        const validationErrors = validate()
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors)
            showNotice('error', 'Please fix the errors in the form.')
            return
        }

        const payload = {}
        editedFields.forEach((key) => {
            const col = COLUMNS.find((c) => c.key === key)
            let value = String(form[key] ?? '').trim()
            if (col && col.type === 'number') {
                value = value === '' ? 0 : Number(value)
            }
            payload[key] = value
        })

        showNotice('loading', 'Saving challan...')

        try {
            const res = await axiosPrivate.post('/api/new-asset-items', payload)

            if (res.data.status === 'success' || res.data.type === 'success') {
                showNotice('success', 'Challan added successfully.')
                setForm((prev) => ({ ...prev, ...EMPTY_FORM, date: todayLocal() }))
                setEditedFields(new Set())
                setErrors({})
                onClose()
                onSave(payload)
            } else {
                showNotice('error', res.data.message || 'Failed to add challan.')
            }
        } catch (err) {
            console.error(err)
            showNotice('error', err.response?.data?.message || 'An error occurred while saving.')
        }
    }

    const inputClass = (hasError) =>
        `w-full px-3 py-2 text-sm text-gray-900 bg-white border rounded-md outline-none focus:ring-2 focus:ring-sky-100 ${hasError ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-primary-500'
        }`

    const inputType = (col) => (col.input === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text')

    return (
        <DraggableModal
            title="Add Challan"
            width={800}
            dim
            onClose={onClose}
            footer={
                <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={handleSave} className="px-5 py-2 text-sm font-bold text-white bg-slate-800/80 hover:bg-primary-600 rounded-md cursor-pointer transition-colors">
                        SAVE
                    </button>
                    <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-bold text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-md cursor-pointer transition-colors">
                        CANCEL
                    </button>
                </div>
            }
        >
            <div className="p-4 space-y-4">
                {GROUPS.map((group) => {
                    const fields = COLUMNS.filter((c) => c.group === group.id && !c.derived)
                    if (fields.length === 0) return null
                    return (
                        <section key={group.id} className="border border-gray-300 rounded-lg overflow-hidden">
                            <h4 className={`${group.head} px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest border-b border-gray-300`}>
                                {group.label}
                            </h4>
                            <div className={`p-3 grid gap-3 grid-cols-1 ${fields.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''}`}>
                                {fields.map((col) => (
                                    <div key={col.key}>
                                        <label htmlFor={`challan-${col.key}`} className="block mb-1 text-xs font-semibold text-gray-700">
                                            {col.label}
                                            {col.required && <span className="text-red-500"> *</span>}
                                        </label>
                                        <input
                                            id={`challan-${col.key}`}
                                            type={inputType(col)}
                                            min={col.type === 'number' ? '0' : undefined}
                                            step={col.type === 'number' ? 'any' : undefined}
                                            value={form[col.key]}
                                            onChange={(e) => handleChange(col.key, e.target.value)}
                                            className={inputClass(Boolean(errors[col.key]))}
                                            autoComplete="off"
                                        />
                                        {errors[col.key] && (
                                            <p className="mt-1 text-xs text-red-600" role="alert">
                                                {errors[col.key]}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )
                })}
            </div>
        </DraggableModal>
    )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const AssetMovement = () => {
    const [rows, setRows] = useState([])
    const [filters, setFilters] = useState({})
    const [filterModal, setFilterModal] = useState(null)
    const [addOpen, setAddOpen] = useState(false)
    const [notice, setNotice] = useState(null)
    const [isExporting, setIsExporting] = useState(false)
    const [exportProgress, setExportProgress] = useState(0)
    const lastNoticeRef = useRef({ text: '', time: 0 })

    const { user } = useAuth()
    const axiosPrivate = useAxiosPrivate()
    // keep the latest axios instance in a ref so the loaders never re-run because of a new instance
    const axiosRef = useRef(axiosPrivate)
    axiosRef.current = axiosPrivate
    const stationRef = useRef(user?.workingStation)
    stationRef.current = user?.workingStation

    /* ===== PAGED LOADING STATE (same system as Knitting) ===== */
    const [initialLoading, setInitialLoading] = useState(true) // first page not received yet
    const [loadingMore, setLoadingMore] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const [loadError, setLoadError] = useState(null)           // a later page failed (Retry resumes)
    const [fetchError, setFetchError] = useState(null)         // the first page failed
    const [refreshKey, setRefreshKey] = useState(0)
    const genRef = useRef(0)                                   // bumped to cancel in-flight requests
    const abortRef = useRef(null)
    const cursorRef = useRef(null)
    const loadingRef = useRef(false)
    const hasMoreRef = useRef(false)
    const capRef = useRef(false)
    const loadErrorRef = useRef(null)
    const rowsRef = useRef([])
    rowsRef.current = rows
    /* ========================================================= */

    /* ===== WINDOWED RENDERING + AUTO-FIT STATE ===== */
    const scrollRef = useRef(null)   // the table box
    const topRef = useRef(null)      // toolbar, watched for size changes
    const rafRef = useRef(0)
    const [viewport, setViewport] = useState({ top: 0, height: 800 })
    const [fit, setFit] = useState({ height: 560, width: 1400 })
    /* =============================================== */

    const showNotice = useCallback((kind, text) => {
        const now = Date.now()
        if (lastNoticeRef.current.text === text && now - lastNoticeRef.current.time < 3000) {
            return
        }
        lastNoticeRef.current = { text, time: now }
        setNotice({ kind, text })
    }, [])

    const freezeEnabled = useMediaQuery('(min-width: 1280px)')
    const activeFilterCount = Object.keys(filters).length

    // Date + challan wise order (newest date first), derived values added
    const derivedRows = useMemo(() => rows.map(withDerived).sort(compareDateChallan), [rows])
    const visibleRows = useMemo(() => derivedRows.filter((row) => rowMatches(row, filters)), [derivedRows, filters])
    const totals = useMemo(() => computeTotals(visibleRows), [visibleRows])

    const capReached = hasMore && rows.length >= MAX_LOADED_ROWS
    hasMoreRef.current = hasMore
    capRef.current = capReached
    loadErrorRef.current = loadError

    /* ===== PAGED LOADING ===== */
    const cancelLoad = useCallback(() => {
        genRef.current += 1
        if (abortRef.current) abortRef.current.abort()
        loadingRef.current = false
        setLoadingMore(false)
    }, [])

    // Loads ONE page. replace=true starts a new list (first page).
    const fetchPage = useCallback(async (gen, cursor, replace) => {
        const station = stationRef.current
        if (!station) return
        if (loadingRef.current && !replace) return
        loadingRef.current = true
        setLoadingMore(true)
        const controller = new AbortController()
        abortRef.current = controller

        try {
            const res = await axiosRef.current.get(`/api/asset-items/${station}`, {
                params: buildListParams(cursor),
                signal: controller.signal,
            })
            if (gen !== genRef.current) return // cancelled / replaced by a newer load

            const page = unwrapPage(res)
            const items = page.items.map(normalizeItem)

            // rows that are really new (the same row can arrive twice at a page border)
            let freshCount = items.length
            if (!replace) {
                const seen = new Set()
                rowsRef.current.forEach((r) => { if (r?.id !== undefined && r?.id !== null) seen.add(r.id) })
                freshCount = items.filter((it) => it?.id === undefined || it?.id === null || !seen.has(it.id)).length
            }

            setRows((prev) => {
                if (replace) return items
                const seen = new Set()
                prev.forEach((r) => { if (r?.id !== undefined && r?.id !== null) seen.add(r.id) })
                const fresh = items.filter((it) => it?.id === undefined || it?.id === null || !seen.has(it.id))
                return prev.concat(fresh)
            })

            if (replace) {
                setInitialLoading(false)
                if (scrollRef.current) scrollRef.current.scrollTop = 0
                setViewport((v) => ({ ...v, top: 0 }))
            }

            cursorRef.current = page.nextCursor
            // nothing new arrived = the server sent the same rows again: stop
            // (more rows than the page size = the server ignored the paging: everything is already here)
            setHasMore(
                !!page.hasMore &&
                page.nextCursor !== null &&
                page.nextCursor !== undefined &&
                freshCount > 0 &&
                page.items.length <= PAGE_LIMIT
            )
        } catch (err) {
            if (gen !== genRef.current) return // aborted on purpose
            console.error('Failed to load asset movement:', err)
            const message = err?.response?.status === 403
                ? 'Permission denied'
                : (err?.response?.data?.message || err?.message || 'Could not load asset data.')
            setInitialLoading(false)
            setHasMore(false)
            if (replace) setFetchError(message)
            else setLoadError(message)
        } finally {
            if (gen === genRef.current) {
                loadingRef.current = false
                setLoadingMore(false)
            }
        }
    }, [])

    // Load the next page when the user scrolls near the end (and the memory cap is not reached)
    const maybeLoadMore = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        if (!hasMoreRef.current || loadingRef.current || capRef.current || loadErrorRef.current) return
        // start loading when less than ~20 rows are left below the visible area
        if (el.scrollHeight - el.scrollTop - el.clientHeight > ROW_H * 20) return
        fetchPage(genRef.current, cursorRef.current, false)
    }, [fetchPage])

    // (Re)start the list on first load, when the station is known, and on refresh
    useEffect(() => {
        if (!user?.workingStation) return
        cancelLoad()
        const gen = genRef.current
        cursorRef.current = null
        setHasMore(false)
        setFetchError(null)
        setLoadError(null)
        setInitialLoading(true)
        fetchPage(gen, null, true)
    }, [user?.workingStation, refreshKey, cancelLoad, fetchPage])

    // stop everything when the page is left
    useEffect(() => () => cancelLoad(), [cancelLoad])

    // content shorter than the box (or a page arrived / a filter changed / the screen got taller):
    // keep loading until it is filled / capped
    useEffect(() => {
        maybeLoadMore()
    }, [rows.length, visibleRows.length, hasMore, loadingMore, loadError, fit.height, maybeLoadMore])

    const retryLoad = () => {
        setLoadError(null)
        loadErrorRef.current = null
        fetchPage(genRef.current, cursorRef.current, false)
    }
    /* ========================= */

    /* ===== AUTO-FIT MEASURING (same logic as Knitting) ===== */
    // Space under the table box that must stay free: page padding + the status line
    const BOTTOM_RESERVE = 60

    const measureFit = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        const viewH = (window.visualViewport && window.visualViewport.height) || window.innerHeight
        const scale = getZoomScale(el)
        const rect = el.getBoundingClientRect()

        // table top measured from the very top of the content, no matter how far the page / the ERP panel is scrolled
        let scrolled = window.scrollY || 0
        let node = el.parentElement
        while (node && node !== document.body && node !== document.documentElement) {
            if (node.scrollTop) scrolled += node.scrollTop * scale
            node = node.parentElement
        }
        const visualTop = rect.top + scrolled

        const height = Math.max(MIN_TABLE_HEIGHT, Math.floor((viewH - visualTop) / scale - BOTTOM_RESERVE))
        const width = el.clientWidth
        if (FIT_DEBUG) console.log('[AssetMovement fit]', { viewH, scale, visualTop, reserve: BOTTOM_RESERVE, height, width })
        setFit((prev) => (prev.height === height && prev.width === width ? prev : { height, width }))
    }, [])

    useLayoutEffect(() => {
        measureFit()
        // the ERP shell / fonts / images can still move things after the first paint: measure again a bit later
        const t1 = setTimeout(measureFit, 100)
        const t2 = setTimeout(measureFit, 500)
        const t3 = setTimeout(measureFit, 1500)
        window.addEventListener('resize', measureFit)
        window.addEventListener('load', measureFit)
        if (window.visualViewport) window.visualViewport.addEventListener('resize', measureFit)
        // the ERP zoom control changes a style / class on <html> or <body> without resizing anything: catch that too
        let mo = null
        if (typeof MutationObserver !== 'undefined') {
            mo = new MutationObserver(() => measureFit())
            mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] })
            mo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] })
        }
        // safety net: cheap re-check (state only changes when the number really changes)
        const poll = setInterval(measureFit, 800)
        let ro = null
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(() => measureFit())
            if (topRef.current) ro.observe(topRef.current)
            if (scrollRef.current) ro.observe(scrollRef.current)
            ro.observe(document.documentElement)
            ro.observe(document.body)
        }
        return () => {
            clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
            clearInterval(poll)
            if (mo) mo.disconnect()
            window.removeEventListener('resize', measureFit)
            window.removeEventListener('load', measureFit)
            if (window.visualViewport) window.visualViewport.removeEventListener('resize', measureFit)
            if (ro) ro.disconnect()
        }
    }, [measureFit, initialLoading, fetchError, activeFilterCount])
    /* ======================================================= */

    /* ===== WINDOWED RENDERING: only the rows near the viewport are in the DOM ===== */
    const totalVisible = visibleRows.length

    const { winStart, winEnd } = useMemo(() => {
        const first = Math.floor(viewport.top / ROW_H) - OVERSCAN
        const last = Math.ceil((viewport.top + viewport.height) / ROW_H) + OVERSCAN
        const s = Math.max(0, Math.min(first, Math.max(0, totalVisible - 1)))
        const e = Math.min(totalVisible, Math.max(last, s + 1))
        return { winStart: s, winEnd: e }
    }, [viewport.top, viewport.height, totalVisible])

    const windowRows = useMemo(() => visibleRows.slice(winStart, winEnd), [visibleRows, winStart, winEnd])

    const handleTableScroll = useCallback((e) => {
        const el = e.currentTarget
        if (rafRef.current) return
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = 0
            const top = el.scrollTop
            const height = el.clientHeight
            setViewport((v) => (Math.abs(v.top - top) < ROW_H / 2 && v.height === height ? v : { top, height }))
            maybeLoadMore()
        })
    }, [maybeLoadMore])

    // keep the viewport height in sync (first render, data change, window resize, new auto-fit height)
    useLayoutEffect(() => {
        const sync = () => {
            const el = scrollRef.current
            if (!el) return
            setViewport((v) => (v.height === el.clientHeight && v.top === el.scrollTop ? v : { top: el.scrollTop, height: el.clientHeight }))
        }
        sync()
        window.addEventListener('resize', sync)
        return () => window.removeEventListener('resize', sync)
    }, [totalVisible > 0, initialLoading, fit.height])

    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

    // a filter changed: go back to the top of the table
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0
        setViewport((v) => (v.top === 0 ? v : { ...v, top: 0 }))
    }, [filters])
    /* ================================================================================ */

    const modalValues = useMemo(() => {
        if (!filterModal) return []
        const unique = new Set(
            derivedRows.filter((row) => rowMatches(row, filters, filterModal.key)).map((row) => cellValue(row, filterModal.key))
        )
        return [...unique].sort((a, b) => collator.compare(a, b))
    }, [filterModal, derivedRows, filters])

    // Excel style: the popup is attached to the header cell; clicking the same icon again closes it
    const openFilter = (key, e) => {
        if (filterModal && filterModal.key === key) {
            setFilterModal(null)
            return
        }
        setFilterModal({ key, anchorEl: e.currentTarget.closest('th') || e.currentTarget })
    }

    const closeFilter = useCallback(() => setFilterModal(null), [])

    const applyFilter = (key, draft, values) => {
        setFilters((prev) => {
            const next = { ...prev }
            if (values.every((v) => draft.has(v))) delete next[key]
            else next[key] = new Set(draft)
            return next
        })
        closeFilter()
    }

    const openAdd = () => {
        setNotice(null)
        setAddOpen(true)
    }

    // The new challan is saved on the server: reload the list from page 1 so it shows in its date / challan group
    const saveChallan = () => {
        setFilters({})
        setAddOpen(false)
        setRefreshKey((k) => k + 1)
    }

    // The table only holds the rows loaded so far, so when more rows exist on the server the export
    // pulls the full list first (in chunks), then applies the column filters in the browser.
    const handleExport = async () => {
        setIsExporting(true)
        setExportProgress(0)
        try {
            let source = rows
            if (hasMore && stationRef.current) {
                const all = []
                let cursor = null
                while (true) {
                    const res = await axiosRef.current.get(`/api/asset-items/${stationRef.current}`, {
                        params: buildListParams(cursor, EXPORT_PAGE_LIMIT),
                    })
                    const page = unwrapPage(res)
                    page.items.forEach((it) => all.push(normalizeItem(it)))
                    setExportProgress(all.length)
                    if (all.length > EXPORT_MAX_ROWS) {
                        showNotice('error', `Too many rows to export at once (more than ${EXPORT_MAX_ROWS}). Please narrow the data with filters.`)
                        return
                    }
                    if (!page.hasMore || page.nextCursor === null || page.nextCursor === undefined) break
                    cursor = page.nextCursor
                }
                source = all
            }

            const exportRows = source.map(withDerived).filter((row) => rowMatches(row, filters)).sort(compareDateChallan)
            if (exportRows.length === 0) {
                showNotice('error', 'No data to export.')
                return
            }
            const today = todayLocal()
            const bytes = buildAssetMovementXlsx(exportRows, computeTotals(exportRows), today)
            downloadXlsx(bytes, `Asset_Movement_${today}.xlsx`)
            showNotice('success', `Exported ${exportRows.length} row${exportRows.length > 1 ? 's' : ''} to Excel.`)
        } catch (error) {
            console.error(error)
            showNotice('error', 'Export failed. Please try again.')
        } finally {
            setIsExporting(false)
            setExportProgress(0)
        }
    }

    const filterColumn = filterModal ? COLUMNS.find((c) => c.key === filterModal.key) : null

    const isFrozen = (index) => freezeEnabled && index < FROZEN_COUNT
    const dividerClass = (index) => (freezeEnabled && index === FROZEN_COUNT - 1 ? FROZEN_DIVIDER : '')
    const leftStyle = (index) => (isFrozen(index) ? { left: LEFT_OFFSETS[index] } : {})

    const displayValue = (col, row) => (col.format ? col.format(row[col.key]) : row[col.key])

    const renderCell = (col, row) => {
        const rawValue = row[col.key]

        // Check for null, undefined, empty string, or the literal string "NULL" (case-insensitive)
        const isNullish =
            rawValue === null ||
            rawValue === undefined ||
            rawValue === '' ||
            String(rawValue).trim().toUpperCase() === 'NULL'

        if (col.type === 'number') {
            const numVal = Number(rawValue)
            if (isNullish || numVal === 0 || Number.isNaN(numVal)) {
                return <span className="text-gray-400">_</span>
            }
            return col.currency ? formatCurrency(numVal) : formatNumber(numVal)
        }

        if (isNullish) {
            return <span className="text-gray-400">_</span>
        }

        const text = displayValue(col, row)
        if (col.isBadge) {
            return (
                <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold">
                    {text}
                </span>
            )
        }
        return text
    }

    /* ----- early screens (all hooks are above) ----- */
    if (initialLoading && rows.length === 0 && !fetchError) {
        return (
            <>
                <Toast notice={notice} onClose={() => setNotice(null)} />
                <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
                    <Loader2 size={24} className="animate-spin mr-2.5" /> Loading data...
                </div>
            </>
        )
    }

    if (fetchError && rows.length === 0) {
        return (
            <>
                <Toast notice={notice} onClose={() => setNotice(null)} />
                <div className="m-5 flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg">
                    <span>{fetchError}</span>
                    <button
                        type="button"
                        onClick={() => setRefreshKey((k) => k + 1)}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer"
                    >
                        Retry
                    </button>
                </div>
            </>
        )
    }

    const topSpacerHeight = winStart * ROW_H
    const bottomSpacerHeight = Math.max(0, totalVisible - winEnd) * ROW_H

    return (
        <>
            <Toast notice={notice} onClose={() => setNotice(null)} />

            <div className="w-full">
                {/* Everything above the table: watched for size changes so the table box always re-fits the screen */}
                <div ref={topRef}>
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 mb-3 border border-green-200 rounded-xl bg-emerald-50/60">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={openAdd}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-slate-800/80 hover:bg-primary-600 shadow-sm cursor-pointer transition-colors"
                            >
                                <Plus size={14} />
                                Add Challan
                            </button>

                            <Link to="/dashboard/upload">
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-slate-800/80 hover:bg-primary-600 shadow-sm cursor-pointer transition-colors"
                                >
                                    <Plus size={14} />
                                    Upload
                                </button>
                            </Link>

                            <button
                                type="button"
                                onClick={handleExport}
                                disabled={isExporting || visibleRows.length === 0}
                                title="Download the table as an Excel file"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white border border-emerald-500 hover:bg-emerald-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                {isExporting ? (exportProgress > 0 ? `Exporting... ${exportProgress} rows` : 'Exporting...') : 'Export'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setRefreshKey((k) => k + 1)}
                                disabled={initialLoading}
                                title="Reload from the server"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <RefreshCcw size={14} className={initialLoading || loadingMore ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs">
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setFilters({})}
                                    className="px-3 py-1.5 font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200 rounded-full cursor-pointer transition-colors"
                                >
                                    Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                                </button>
                            )}
                            <span className="text-gray-500">
                                Showing {visibleRows.length} of {rows.length}{hasMore ? '+' : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* The box height is calculated from the screen: it fills everything under the toolbar */}
                <div
                    ref={scrollRef}
                    onScroll={handleTableScroll}
                    className="relative overflow-auto bg-white border border-green-200 rounded-xl shadow-sm"
                    style={{ height: fit.height, boxSizing: 'border-box' }}
                >
                    <table
                        className="border-separate"
                        style={{ minWidth: TOTAL_WIDTH, width: '100%', tableLayout: 'fixed', borderSpacing: 0 }}
                    >
                        <colgroup>
                            {COLUMNS.map((col, index) => (
                                <col
                                    key={col.key}
                                    style={{
                                        width: col.width,
                                        minWidth: index < FROZEN_COUNT ? col.width : undefined,
                                        maxWidth: index < FROZEN_COUNT ? col.width : undefined,
                                    }}
                                />
                            ))}
                        </colgroup>

                        <thead>
                            <tr>
                                {COLUMNS.map((col, index) => {
                                    const isFiltered = Boolean(filters[col.key])
                                    return (
                                        <th
                                            key={col.key}
                                            className={`bg-slate-500 text-white ${HEADER_CELL} ${dividerClass(index)} px-2 py-3 text-[11px] font-bold uppercase tracking-wide align-middle`}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                height: HEADER_H,
                                                zIndex: isFrozen(index) ? 30 : 20,
                                                ...leftStyle(index),
                                            }}
                                        >
                                            <div className="flex items-center justify-center gap-1.5">
                                                <span className="leading-tight text-center whitespace-normal break-words">
                                                    {col.label}
                                                </span>
                                                <button
                                                    type="button"
                                                    data-filter-trigger
                                                    onClick={(e) => openFilter(col.key, e)}
                                                    aria-label={`Filter ${col.label}`}
                                                    title={isFiltered ? `Filtered: ${col.label}` : `Filter ${col.label}`}
                                                    className={`shrink-0 p-1 rounded cursor-pointer transition-colors ${isFiltered ? 'bg-white text-slate-700' : 'text-white/80 hover:bg-white/25 hover:text-white'
                                                        }`}
                                                >
                                                    <Filter size={13} />
                                                </button>
                                            </div>
                                        </th>
                                    )
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {/* spacer = all the rows above the rendered window */}
                            {topSpacerHeight > 0 && (
                                <tr aria-hidden="true" style={{ height: topSpacerHeight }}>
                                    <td colSpan={COLUMNS.length} style={{ padding: 0, border: 'none' }} />
                                </tr>
                            )}

                            {windowRows.map((row, i) => {
                                const idx = winStart + i
                                // Date + challan wise grouping: a new group starts when the date or challan changes
                                const prevRow = idx > 0 ? visibleRows[idx - 1] : null
                                const isGroupStart = !sameChallanGroup(prevRow, row)

                                return (
                                    <tr key={row.id ?? `${row.challanNo}-${idx}`} className="group">
                                        {COLUMNS.map((col, index) => {
                                            // date + challan repeat on every row of the group: show them softly on continuation rows
                                            const isGroupKey = col.key === 'date' || col.key === 'challanNo'
                                            const faded = isGroupKey && !isGroupStart
                                            return (
                                                <td
                                                    key={col.key}
                                                    className={`bg-white group-hover:bg-slate-50 ${BODY_CELL} ${dividerClass(index)} px-3 py-1 text-xs text-gray-700 text-center align-middle transition-colors ${col.cell || ''}`}
                                                    style={{
                                                        height: ROW_H,
                                                        boxSizing: 'border-box',
                                                        overflow: 'hidden',
                                                        opacity: faded ? 0.4 : 1,
                                                        ...(isGroupStart && idx > 0 ? { borderTop: '2px solid #94a3b8' } : {}),
                                                        ...(isFrozen(index) ? { position: 'sticky', zIndex: 10, ...leftStyle(index) } : {}),
                                                    }}
                                                >
                                                    <div style={CLAMP_STYLE} title={col.type === 'number' ? undefined : String(displayValue(col, row) ?? '')}>
                                                        {renderCell(col, row)}
                                                    </div>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                )
                            })}

                            {/* spacer = all the rows below the rendered window */}
                            {bottomSpacerHeight > 0 && (
                                <tr aria-hidden="true" style={{ height: bottomSpacerHeight }}>
                                    <td colSpan={COLUMNS.length} style={{ padding: 0, border: 'none' }} />
                                </tr>
                            )}

                            {visibleRows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={COLUMNS.length}
                                        className="px-3 py-12 text-center text-sm text-gray-500 bg-white border-b border-gray-200"
                                    >
                                        <div style={{ position: 'sticky', left: 0, width: fit.width }}>
                                            {loadingMore ? 'Loading...' : 'No records match the current filters.'}
                                            {activeFilterCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setFilters({})}
                                                    className="ml-2 font-semibold text-primary-600 hover:underline cursor-pointer"
                                                >
                                                    Clear filters
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>

                        {visibleRows.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td
                                        colSpan={FROZEN_COUNT}
                                        className={`bg-slate-500 text-white ${FOOTER_CELL} ${freezeEnabled ? FROZEN_DIVIDER : ''} px-3 py-3 text-xs font-bold uppercase tracking-wide text-center`}
                                        style={{
                                            position: 'sticky',
                                            bottom: 0,
                                            height: FOOTER_H,
                                            zIndex: freezeEnabled ? 30 : 20,
                                            ...(freezeEnabled ? { left: 0 } : {}),
                                        }}
                                    >
                                        {hasMore ? 'Total (loaded)' : 'Total'}
                                    </td>
                                    <td
                                        colSpan={FIRST_NUMBER_INDEX - FROZEN_COUNT}
                                        className={`bg-slate-500 ${FOOTER_CELL}`}
                                        style={{ position: 'sticky', bottom: 0, zIndex: 20 }}
                                    />
                                    {NUMBER_COLUMNS.map((col) => (
                                        <td
                                            key={col.key}
                                            className={`bg-slate-500 text-white ${FOOTER_CELL} px-3 py-3 text-xs font-bold text-center`}
                                            style={{ position: 'sticky', bottom: 0, zIndex: 20 }}
                                        >
                                            {totals[col.key] === 0
                                                ? '_'
                                                : col.currency
                                                    ? formatCurrency(totals[col.key])
                                                    : formatNumber(totals[col.key])}
                                        </td>
                                    ))}
                                    <td
                                        colSpan={COLUMNS.length - FIRST_NUMBER_INDEX - NUMBER_COLUMNS.length}
                                        className={`bg-slate-500 ${FOOTER_CELL}`}
                                        style={{ position: 'sticky', bottom: 0, zIndex: 20 }}
                                    />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* Scroll loading status */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2 min-h-6 text-xs text-gray-500 text-center">
                    {loadingMore && (
                        <span className="inline-flex items-center gap-2 font-semibold text-emerald-700">
                            <Loader2 size={16} className="animate-spin" /> Loading more...
                        </span>
                    )}
                    {!loadingMore && loadError && (
                        <span className="inline-flex items-center gap-2.5 text-red-700">
                            {loadError}
                            <button
                                type="button"
                                onClick={retryLoad}
                                className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer"
                            >
                                Retry
                            </button>
                        </span>
                    )}
                    {!loadingMore && !loadError && capReached && (
                        <span className="font-semibold text-amber-700">
                            Showing the first {rows.length} rows. More data exists: use the column filters to narrow it down.
                        </span>
                    )}
                    {!loadingMore && !loadError && !capReached && hasMore && (
                        <span className="opacity-70">
                            {visibleRows.length === rows.length
                                ? `${rows.length} rows loaded. Scroll down to load more.`
                                : `${visibleRows.length} of ${rows.length} loaded rows match the filters. Scroll down to load more.`}
                        </span>
                    )}
                    {!loadingMore && !loadError && !hasMore && rows.length > 0 && (
                        <span className="opacity-70">
                            {visibleRows.length === rows.length
                                ? `All ${rows.length} rows loaded`
                                : `All ${rows.length} rows loaded, ${visibleRows.length} match the filters`}
                        </span>
                    )}
                </div>

                {filterModal && filterColumn && (
                    <ColumnFilterModal
                        key={filterModal.key}
                        column={filterColumn}
                        values={modalValues}
                        selected={filters[filterModal.key] || null}
                        anchorEl={filterModal.anchorEl}
                        onApply={(draft, values) => applyFilter(filterModal.key, draft, values)}
                        onClose={closeFilter}
                    />
                )}

                {addOpen && <AddChallanModal onSave={saveChallan} onClose={() => setAddOpen(false)} showNotice={showNotice} />}
            </div>
        </>
    )
}

export default AssetMovement