import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Filter, X, GripVertical, Search, Download } from 'lucide-react'

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

const clampPosition = (x, y, width, height) => ({
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
})

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

// Group colours (used by the Add Challan modal sections)
const GROUPS = [
    { id: 'challan', label: 'Challan Details', head: 'bg-violet-100 text-violet-800', sub: 'bg-violet-50 text-violet-900' },
    { id: 'item', label: 'Item Details', head: 'bg-sky-100 text-sky-800', sub: 'bg-sky-50 text-sky-900' },
    { id: 'supplier', label: 'Asset & Supplier', head: 'bg-indigo-100 text-indigo-800', sub: 'bg-indigo-50 text-indigo-900' },
    { id: 'qty', label: 'Quantity', head: 'bg-emerald-100 text-emerald-800', sub: 'bg-emerald-50 text-emerald-900' },
    { id: 'price', label: 'Price Details', head: 'bg-rose-100 text-rose-800', sub: 'bg-rose-50 text-rose-900' },
    { id: 'movement', label: 'Movement', head: 'bg-amber-100 text-amber-800', sub: 'bg-amber-50 text-amber-900' },
    { id: 'notes', label: 'Notes', head: 'bg-slate-100 text-slate-700', sub: 'bg-slate-50 text-slate-800' },
]

// width = px (used for fixed layout and the frozen-column offsets)
const COLUMNS = [
    { key: 'date', label: 'Date', group: 'challan', width: 96, input: 'date', required: true, format: formatDate },
    { key: 'challanNo', label: 'Challan / Invoice Number', group: 'challan', width: 140, required: true, cell: 'font-mono' },
    { key: 'factory name', label: 'FACTORY NAME', group: 'challan', width: 110, isBadge: true },
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

// Total Carrying = Opening + Additions - Disposed + Sent to Another Unit + Received From Another Unit
const withDerived = (row) => ({
    ...row,
    totalCarrying:
        Number(row.openingQty || 0) + Number(row.additionsQty || 0) + Number(row.receivedQty || 0) - Number(row.disposedQty || 0) - Number(row.sentQty || 0), 
        
})

// Columns from the first one through this column stay frozen while scrolling sideways
const FROZEN_UNTIL = 'assetCode'
const FROZEN_COUNT = COLUMNS.findIndex((c) => c.key === FROZEN_UNTIL) + 1
const LEFT_OFFSETS = COLUMNS.map((_, i) => COLUMNS.slice(0, i).reduce((sum, c) => sum + c.width, 0))
const TOTAL_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0)
const FIRST_NUMBER_INDEX = COLUMNS.findIndex((c) => c.type === 'number')

// Table look: slate header / footer, green vertical lines, light horizontal lines
const HEADER_CELL = 'border-r border-slate-400'
const BODY_CELL = 'border-b border-gray-200 border-r border-emerald-500'
const FOOTER_CELL = 'border-r border-slate-400'
const FROZEN_DIVIDER = 'border-r-2 border-r-slate-700'

/* ------------------------------------------------------------------ */
/*  Sample data — replace with your API data                           */
/* ------------------------------------------------------------------ */

const SAMPLE_MOVEMENTS = [
    { id: 1, date: '2026-09-01', challanNo: 'CH-2026-0101', source: 'Own', assetType: 'Machinery', category: 'Sewing Machine', description: 'Single Needle Lockstitch Machine', assetCode: 'AST-MC-001', assetId: 'ID-1001', supplier: 'Jack Sewing Machine Co.', model: 'Jack A4', origin: 'China', sku: 'Pcs', openingQty: 120, additionsQty: 10, disposedQty: 2, sentQty: 5, receivedQty: 3, priceValue: 450, amount: 54000, from: 'Unit-1', to: 'Unit-2', destination: 'Sewing Floor - Line 3', remarks: '' },
    { id: 2, date: '2026-09-03', challanNo: 'CH-2026-0102', source: 'Unit Transfer', assetType: 'Machinery', category: 'Sewing Machine', description: 'Overlock 4 Thread Machine', assetCode: 'AST-MC-002', assetId: 'ID-1002', supplier: 'Juki Bangladesh Ltd.', model: 'Juki MO-6816', origin: 'Japan', sku: 'Pcs', openingQty: 60, additionsQty: 6, disposedQty: 1, sentQty: 0, receivedQty: 2, priceValue: 620, amount: 41540, from: 'Unit-2', to: 'Unit-1', destination: 'Sewing Floor - Line 1', remarks: 'Received in good condition' },
    { id: 3, date: '2026-09-05', challanNo: 'INV-8841', source: 'Rental', assetType: 'Machinery', category: 'Cutting Machine', description: 'Straight Knife Cutting Machine', assetCode: 'AST-MC-014', assetId: 'ID-1014', supplier: 'Eastman Machine Co.', model: 'Eastman Blue Streak', origin: 'USA', sku: 'Pcs', openingQty: 8, additionsQty: 2, disposedQty: 0, sentQty: 0, receivedQty: 0, priceValue: 1800, amount: 18000, from: 'Store', to: 'Unit-1', destination: 'Cutting Section', remarks: 'Rental' },
    { id: 4, date: '2026-09-08', challanNo: 'INV-8852', source: 'Purchase', assetType: 'Electrical', category: 'Generator', description: 'Diesel Generator 500 KVA', assetCode: 'AST-EL-003', assetId: 'ID-2003', supplier: 'Perkins Power Ltd.', model: 'Perkins 500P', origin: 'United Kingdom', sku: 'Set', openingQty: 2, additionsQty: 1, disposedQty: 0, sentQty: 0, receivedQty: 0, priceValue: 950000, amount: 950000, from: 'Supplier', to: 'Unit-1', destination: 'Generator Room', remarks: 'Backup power' },
    { id: 5, date: '2026-09-10', challanNo: 'CH-2026-0110', source: 'Own', assetType: 'IT Equipment', category: 'Computer', description: 'Desktop Computer Set', assetCode: 'AST-IT-021', assetId: 'ID-3021', supplier: 'Star Tech & Engineering', model: 'Dell OptiPlex 3080', origin: 'China', sku: 'Set', openingQty: 45, additionsQty: 5, disposedQty: 3, sentQty: 2, receivedQty: 0, priceValue: 38000, amount: 190000, from: 'Unit-1', to: 'Head Office', destination: 'Merchandising Dept.', remarks: '' },
    { id: 6, date: '2026-09-12', challanNo: 'INV-8869', source: 'Rental', assetType: 'IT Equipment', category: 'Printer', description: 'Laser Printer (Network)', assetCode: 'AST-IT-030', assetId: 'ID-3030', supplier: 'Ryans Computers', model: 'HP LaserJet M404', origin: 'Vietnam', sku: 'Pcs', openingQty: 6, additionsQty: 0, disposedQty: 1, sentQty: 0, receivedQty: 1, priceValue: 21000, amount: 21000, from: 'Head Office', to: 'Unit-1', destination: 'Admin Office', remarks: 'Rental' },
    { id: 7, date: '2026-09-15', challanNo: 'CH-2026-0115', source: 'Own', assetType: 'Furniture', category: 'Office Furniture', description: 'Executive Office Table', assetCode: 'AST-FR-008', assetId: 'ID-4008', supplier: 'Otobi Limited', model: 'Otobi EX-120', origin: 'Bangladesh', sku: 'Pcs', openingQty: 30, additionsQty: 4, disposedQty: 0, sentQty: 1, receivedQty: 0, priceValue: 15500, amount: 62000, from: 'Unit-1', to: 'Unit-3', destination: 'Manager Room', remarks: '' },
    { id: 8, date: '2026-09-18', challanNo: 'CH-2026-0118', source: 'Unit Transfer', assetType: 'Vehicle', category: 'Delivery Van', description: 'Covered Van 1 Ton', assetCode: 'AST-VH-002', assetId: 'ID-5002', supplier: 'Runner Automobiles', model: 'Tata Ace', origin: 'India', sku: 'Pcs', openingQty: 3, additionsQty: 0, disposedQty: 0, sentQty: 0, receivedQty: 1, priceValue: 1250000, amount: 1250000, from: 'Unit-2', to: 'Unit-1', destination: 'Transport Pool', remarks: 'Received from Unit-2' },
]

/* ===== XLSX EXPORT START ===== */
/* ------------------------------------------------------------------ */
/*  Excel export — writes a real .xlsx file (no extra package needed)  */
/*  Slate header / Total row, green vertical borders, light horizontal */
/*  borders, frozen columns (through Asset Code), filter arrows.       */
/* ------------------------------------------------------------------ */

// Excel column widths (characters), by column key
const XLSX_WIDTHS = {
    date: 12, challanNo: 20, FACsource: 15, assetType: 16, category: 18, description: 32, assetCode: 14,
    assetId: 12, supplier: 26, model: 22, origin: 18, sku: 10,
    openingQty: 12, additionsQty: 12, disposedQty: 12, sentQty: 16, receivedQty: 18, totalCarrying: 14,
    priceValue: 14, amount: 16,
    from: 14, to: 14, destination: 24, remarks: 26,
}

// Same columns, same order as the table
const XLSX_COLUMNS = COLUMNS.map((col) => ({
    key: col.key,
    header: col.label,
    width: XLSX_WIDTHS[col.key] || 16,
    kind: col.input === 'date' ? 'date' : col.currency ? 'currency' : col.type === 'number' ? 'qty' : 'text',
}))

// cell style ids (see buildStylesXml)
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

// yyyy-mm-dd -> Excel date number (null when the text is not a date)
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

    // title (merged across all columns)
    const titleCells = XLSX_COLUMNS.map((_, i) =>
        i === 0
            ? cellText('A1', XS.TITLE, generatedOn ? `Asset Movement  |  ${generatedOn}` : 'Asset Movement')
            : cellBlank(`${xlsxColLetter(i)}${titleRow}`, XS.TITLE)
    )
    xmlRows.push(`<row r="${titleRow}" ht="28" customHeight="1">${titleCells.join('')}</row>`)

    // header
    const headerCells = XLSX_COLUMNS.map((col, i) =>
        cellText(`${xlsxColLetter(i)}${headerRow}`, isDivider(i) ? XS.HEADER_DIV : XS.HEADER, col.header)
    )
    xmlRows.push(`<row r="${headerRow}" ht="40" customHeight="1">${headerCells.join('')}</row>`)

    // data rows
    rows.forEach((row, rowIndex) => {
        const r = firstDataRow + rowIndex
        const cells = XLSX_COLUMNS.map((col, i) => {
            const ref = `${xlsxColLetter(i)}${r}`
            if (col.kind === 'currency') return cellNumber(ref, XS.CURRENCY, row[col.key])
            if (col.kind === 'qty') return cellNumber(ref, XS.QTY, row[col.key])
            if (col.kind === 'date') {
                const serial = excelDateSerial(row[col.key])
                return serial === null ? cellText(ref, XS.TEXT, row[col.key] || '-') : cellNumber(ref, XS.DATE, serial)
            }
            return cellText(ref, isDivider(i) ? XS.TEXT_DIV : XS.TEXT, row[col.key] || '-')
        })
        xmlRows.push(`<row r="${r}" ht="24" customHeight="1">${cells.join('')}</row>`)
    })

    // TOTAL row (label merged over the frozen columns, like the table footer)
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

// ---- minimal ZIP writer (stored, no compression) — an .xlsx is a zip of XML files ----
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
        lv.setUint16(6, 0x0800, true) // UTF-8 file names
        lv.setUint16(8, 0, true) // stored
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

// rows = the rows shown in the table, totals = the table's Total row
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
/*  Draggable modal (drag by the title bar)                            */
/*  Rendered in a portal so the page zoom in the layout never shifts   */
/*  its position.                                                      */
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

    // Place the modal (centered, or at the given position) before the first paint
    useLayoutEffect(() => {
        const el = modalRef.current
        if (!el) return
        const w = el.offsetWidth
        const h = el.offsetHeight
        const x = initialPosition ? initialPosition.x : (window.innerWidth - w) / 2
        const y = initialPosition ? initialPosition.y : (window.innerHeight - h) / 2
        setPos(clampPosition(x, y, w, h))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Keep it inside the window when the window is resized
    useEffect(() => {
        const handleResize = () => {
            const el = modalRef.current
            if (!el) return
            setPos((prev) => (prev ? clampPosition(prev.x, prev.y, el.offsetWidth, el.offsetHeight) : prev))
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    // Esc closes the modal
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
        if (e.target.closest('button')) return // the close button must not start a drag
        dragRef.current = { offsetX: e.clientX - pos.x, offsetY: e.clientY - pos.y }
        e.currentTarget.setPointerCapture(e.pointerId)
        setIsDragging(true)
    }

    const handlePointerMove = (e) => {
        const drag = dragRef.current
        const el = modalRef.current
        if (!drag || !el) return
        setPos(clampPosition(e.clientX - drag.offsetX, e.clientY - drag.offsetY, el.offsetWidth, el.offsetHeight))
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
                {/* Title bar = drag handle */}
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-t-xl bg-slate-100 border-b border-gray-300 text-slate-800 select-none touch-none ${
                        isDragging ? 'cursor-grabbing' : 'cursor-grab'
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <GripVertical size={16} className="shrink-0 text-slate-500" />
                        <h3 className="text-sm font-bold uppercase tracking-wide truncate">{title}</h3>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="hidden sm:inline text-[11px] text-slate-500">Drag to move</span>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="p-1 rounded-md hover:bg-black/10 cursor-pointer transition-colors"
                        >
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
/*  Excel-style column filter modal                                    */
/* ------------------------------------------------------------------ */

const ColumnFilterModal = ({
    column,
    values,
    selected,
    position,
    onApply,
    onClose,
}) => {
    const [search, setSearch] = useState('')
    // No active filter = everything ticked
    const [draft, setDraft] = useState(() => new Set(selected ?? values))
    const selectAllRef = useRef(null)

    // What the user sees for a value (dates are shown as dd-mm-yyyy)
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

    const toggleValue = (value) => {
        setDraft((prev) => {
            const next = new Set(prev)
            if (next.has(value)) next.delete(value)
            else next.add(value)
            return next
        })
    }

    // With a search typed, "Select All" only touches the matching values (like Excel)
    const toggleAllVisible = () => {
        setDraft((prev) => {
            const next = new Set(prev)
            if (allVisibleSelected) visibleValues.forEach((v) => next.delete(v))
            else visibleValues.forEach((v) => next.add(v))
            return next
        })
    }

    return (
        <DraggableModal
            title={`Filter: ${column.label}`}
            width={280}
            initialPosition={position}
            closeOnBackdrop
            onClose={onClose}
            footer={
                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => onApply(draft, values)}
                        disabled={draft.size === 0}
                        className="px-4 py-1.5 text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        OK
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 text-sm font-bold text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-md cursor-pointer transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            }
        >
            <div className="p-3 space-y-2">
                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search"
                        autoFocus
                        className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 rounded-md outline-none focus:border-primary-500"
                    />
                </div>

                <div className="border border-gray-300 rounded-md max-h-56 overflow-y-auto bg-white">
                    {visibleValues.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-gray-500">No matches</p>
                    ) : (
                        <>
                            <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-gray-800 border-b border-gray-300 cursor-pointer hover:bg-gray-50">
                                <input
                                    ref={selectAllRef}
                                    type="checkbox"
                                    checked={allVisibleSelected}
                                    onChange={toggleAllVisible}
                                    className="w-4 h-4 cursor-pointer accent-primary-600"
                                />
                                {search.trim() ? '(Select All Search Results)' : '(Select All)'}
                            </label>
                            {visibleValues.map((value) => (
                                <label
                                    key={value === '' ? '__blank__' : value}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 cursor-pointer hover:bg-gray-50"
                                >
                                    <input
                                        type="checkbox"
                                        checked={draft.has(value)}
                                        onChange={() => toggleValue(value)}
                                        className="w-4 h-4 cursor-pointer accent-primary-600"
                                    />
                                    <span className="truncate">{display(value)}</span>
                                </label>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </DraggableModal>
    )
}

/* ------------------------------------------------------------------ */
/*  Add Challan modal (column-wise entry fields)                       */
/* ------------------------------------------------------------------ */

const AddChallanModal = ({ onSave, onClose }) => {
    const [form, setForm] = useState(() => ({ ...EMPTY_FORM, date: todayLocal() }))
    const [errors, setErrors] = useState({})

    const handleChange = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
    }

    const validate = () => {
        const next = {}
        COLUMNS.forEach((col) => {
            if (col.derived) return
            const value = form[col.key].trim()
            if (col.required && !value) next[col.key] = `${col.label} is required`
            if (col.type === 'number' && value !== '') {
                const n = Number(value)
                if (!Number.isFinite(n) || n < 0) next[col.key] = 'Enter 0 or a positive number'
            }
        })
        return next
    }

    const handleSave = () => {
        const validationErrors = validate()
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors)
            return
        }
        const row = COLUMNS.filter((col) => !col.derived).reduce((acc, col) => {
            const value = form[col.key].trim()
            acc[col.key] = col.type === 'number' ? Number(value || 0) : value
            return acc
        }, {})
        onSave(row)
    }

    const inputClass = (hasError) =>
        `w-full px-3 py-2 text-sm text-gray-900 bg-white border rounded-md outline-none focus:ring-2 focus:ring-sky-100 ${
            hasError ? 'border-red-400 focus:border-red-500' : 'border-gray-300 focus:border-primary-500'
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
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-5 py-2 text-sm font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer transition-colors"
                    >
                        SAVE
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2 text-sm font-bold text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-md cursor-pointer transition-colors"
                    >
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
                            <h4
                                className={`${group.head} px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest border-b border-gray-300`}
                            >
                                {group.label}
                            </h4>
                            <div
                                className={`p-3 grid gap-3 grid-cols-1 ${
                                    fields.length > 1 ? 'sm:grid-cols-2 lg:grid-cols-3' : ''
                                }`}
                            >
                                {fields.map((col) => (
                                    <div key={col.key}>
                                        <label
                                            htmlFor={`challan-${col.key}`}
                                            className="block mb-1 text-xs font-semibold text-gray-700"
                                        >
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
    const [rows, setRows] = useState(SAMPLE_MOVEMENTS)
    const [filters, setFilters] = useState({}) // { columnKey: Set }
    const [filterModal, setFilterModal] = useState(null) // { key, position }
    const [addOpen, setAddOpen] = useState(false)
    const [notice, setNotice] = useState(null) // { kind: 'success' | 'error', text }
    const nextId = useRef(SAMPLE_MOVEMENTS.length + 1)

    // Freezing needs room to scroll, so it is switched on for wide screens only
    const freezeEnabled = useMediaQuery('(min-width: 1280px)')

    const activeFilterCount = Object.keys(filters).length

    // Every row gets its Total Carrying value attached before filtering, totalling, or export
    const derivedRows = useMemo(() => rows.map(withDerived), [rows])

    const visibleRows = useMemo(() => derivedRows.filter((row) => rowMatches(row, filters)), [derivedRows, filters])

    const totals = useMemo(
        () =>
            NUMBER_COLUMNS.reduce((acc, col) => {
                acc[col.key] = visibleRows.reduce((sum, row) => sum + Number(row[col.key] || 0), 0)
                return acc
            }, {}),
        [visibleRows]
    )

    // Values listed in the filter modal (rows already narrowed by the other columns' filters)
    const modalValues = useMemo(() => {
        if (!filterModal) return []
        const unique = new Set(
            derivedRows.filter((row) => rowMatches(row, filters, filterModal.key)).map((row) => cellValue(row, filterModal.key))
        )
        return [...unique].sort((a, b) => collator.compare(a, b))
    }, [filterModal, derivedRows, filters])

    const openFilter = (key, e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setFilterModal({ key, position: { x: rect.left, y: rect.bottom + 6 } })
    }

    const closeFilter = () => setFilterModal(null)

    const applyFilter = (key, draft, values) => {
        setFilters((prev) => {
            const next = { ...prev }
            // Everything ticked = no filter on this column
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

    const saveChallan = (row) => {
        setRows((prev) => [{ id: nextId.current++, ...row }, ...prev])
        setFilters({}) // make sure the new row is visible
        setAddOpen(false)
        setNotice({ kind: 'success', text: 'Challan added successfully.' })
    }

    /* ---- Excel export (rows and totals exactly as shown in the table) ---- */
    const handleExport = () => {
        try {
            const today = todayLocal()
            const bytes = buildAssetMovementXlsx(visibleRows, totals, today)
            downloadXlsx(bytes, `Asset_Movement_${today}.xlsx`)
            setNotice({ kind: 'success', text: `Exported ${visibleRows.length} row${visibleRows.length > 1 ? 's' : ''} to Excel.` })
        } catch (error) {
            console.error(error)
            setNotice({ kind: 'error', text: 'Export failed. Please try again.' })
        }
    }

    const filterColumn = filterModal ? COLUMNS.find((c) => c.key === filterModal.key) : null

    /* ---- frozen-column helpers ---- */
    const isFrozen = (index) => freezeEnabled && index < FROZEN_COUNT
    const dividerClass = (index) => (freezeEnabled && index === FROZEN_COUNT - 1 ? FROZEN_DIVIDER : '')
    const leftStyle = (index) => (isFrozen(index) ? { left: LEFT_OFFSETS[index] } : {})

    const displayValue = (col, row) => (col.format ? col.format(row[col.key]) : row[col.key])

    const renderCell = (col, row) => {
        if (col.type === 'number') {
            const value = Number(row[col.key] || 0)
            if (value === 0) return <span className="text-gray-400">-</span>
            return col.currency ? formatCurrency(value) : formatNumber(value)
        }
        const text = displayValue(col, row)
        if (col.isBadge) {
            return text ? (
                <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold">
                    {text}
                </span>
            ) : (
                <span className="text-gray-400">-</span>
            )
        }
        return text || <span className="text-gray-400">-</span>
    }

    return (
        <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-green-200 bg-emerald-50/60">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={openAdd}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-primary-500 hover:bg-primary-600 shadow-sm cursor-pointer transition-colors"
                    >
                        <Plus size={14} />
                        Add Challan
                    </button>

                    {/* Export tab */}
                    <button
                        type="button"
                        onClick={handleExport}
                        disabled={visibleRows.length === 0}
                        title="Download the table as an Excel file"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white border border-emerald-500 hover:bg-emerald-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={14} />
                        Export
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                    {notice && (
                        <span
                            className={`font-semibold ${notice.kind === 'error' ? 'text-red-600' : 'text-green-700'}`}
                            role="status"
                        >
                            {notice.text}
                        </span>
                    )}
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
                        Showing {visibleRows.length} of {rows.length}
                    </span>
                </div>
            </div>

            {/* Table */}
            <div className="max-h-[65vh] overflow-auto bg-white">
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
                                            height: 64,
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
                                                onClick={(e) => openFilter(col.key, e)}
                                                aria-label={`Filter ${col.label}`}
                                                title={isFiltered ? `Filtered: ${col.label}` : `Filter ${col.label}`}
                                                className={`shrink-0 p-1 rounded cursor-pointer transition-colors ${
                                                    isFiltered
                                                        ? 'bg-white text-slate-700'
                                                        : 'text-white/80 hover:bg-white/25 hover:text-white'
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
                        {visibleRows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={COLUMNS.length}
                                    className="px-3 py-12 text-center text-sm text-gray-500 bg-white border-b border-gray-200"
                                >
                                    No records match the current filters.
                                    {activeFilterCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setFilters({})}
                                            className="ml-2 font-semibold text-primary-600 hover:underline cursor-pointer"
                                        >
                                            Clear filters
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ) : (
                            visibleRows.map((row) => (
                                <tr key={row.id} className="group">
                                    {COLUMNS.map((col, index) => (
                                        <td
                                            key={col.key}
                                            className={`bg-white group-hover:bg-slate-50 ${BODY_CELL} ${dividerClass(index)} px-3 py-2 text-xs text-gray-700 text-center align-middle whitespace-normal break-words transition-colors ${col.cell || ''}`}
                                            style={{
                                                height: 42,
                                                ...(isFrozen(index)
                                                    ? { position: 'sticky', zIndex: 10, ...leftStyle(index) }
                                                    : {}),
                                            }}
                                        >
                                            {renderCell(col, row)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>

                    {visibleRows.length > 0 && (
                        <tfoot>
                            <tr>
                                <td
                                    colSpan={FROZEN_COUNT}
                                    className={`bg-slate-500 text-white ${FOOTER_CELL} ${
                                        freezeEnabled ? FROZEN_DIVIDER : ''
                                    } px-3 py-3 text-xs font-bold uppercase tracking-wide text-center`}
                                    style={{
                                        position: 'sticky',
                                        bottom: 0,
                                        zIndex: freezeEnabled ? 30 : 20,
                                        ...(freezeEnabled ? { left: 0 } : {}),
                                    }}
                                >
                                    Total
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
                                            ? '-'
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

            {/* Excel-style filter modal */}
            {filterModal && filterColumn && (
                <ColumnFilterModal
                    key={filterModal.key}
                    column={filterColumn}
                    values={modalValues}
                    selected={filters[filterModal.key] || null}
                    position={filterModal.position}
                    onApply={(draft, values) => applyFilter(filterModal.key, draft, values)}
                    onClose={closeFilter}
                />
            )}

            {/* Add Challan modal */}
            {addOpen && <AddChallanModal onSave={saveChallan} onClose={() => setAddOpen(false)} />}
        </div>
    )
}

export default AssetMovement