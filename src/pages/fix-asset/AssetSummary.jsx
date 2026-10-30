import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    Boxes,
    PackageCheck,
    Wallet,
    CalendarClock,
    PackagePlus,
    Search,
    Filter,
    X,
    GripVertical,
    Download,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Sample data — replace with your API data                           */
/*  source: 'Own' | 'Rental'                                           */
/*  Carrying Qty and Total Value are calculated below.                 */
/* ------------------------------------------------------------------ */

const SAMPLE_ASSETS = [
    { id: 1, source: 'Own', assetType: 'Machinery', category: 'Sewing Machine', description: 'Single Needle Lockstitch Machine', code: 'AST-MC-001', openingQty: 120, additionsQty: 10, disposedQty: 2, sentQty: 5, receivedQty: 3, pricePerPcs: 650000, remarks: 'Line 1 - 4' },
    { id: 2, source: 'Own', assetType: 'Machinery', category: 'Sewing Machine', description: 'Overlock 4 Thread Machine', code: 'AST-MC-002', openingQty: 60, additionsQty: 6, disposedQty: 1, sentQty: 0, receivedQty: 2, pricePerPcs: 72000, remarks: '' },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Carrying = Opening + Additions - Disposed - Sent + Received
const getCarryingQty = (a) =>
    a.openingQty + a.additionsQty - a.disposedQty - a.sentQty + a.receivedQty

const sumBy = (list, fn) => list.reduce((total, item) => total + fn(item), 0)

const formatNumber = (n) => Number(n).toLocaleString('en-IN')
const formatCurrency = (n) => `৳ ${Number(n).toLocaleString('en-IN')}`

// Price typed in the editable cell: '' / not a number / negative = invalid (null)
const parsePrice = (text) => {
    const trimmed = String(text).trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) && n >= 0 ? n : null
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const cellValue = (row, key) => String(row[key] ?? '').trim()

// filters = { columnKey: Set(selected values) } — a column with no entry is not filtered
const rowMatches = (row, filters, skipKey) =>
    Object.keys(filters).every((key) => key === skipKey || filters[key].has(cellValue(row, key)))

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

/* ===== XLSX EXPORT START ===== */
/* ------------------------------------------------------------------ */
/*  Excel export — writes a real .xlsx file (no extra package needed)  */
/*  Slate header / Total row, green vertical borders, light horizontal */
/*  borders, frozen columns, Excel formulas, filter arrows.            */
/* ------------------------------------------------------------------ */

const XLSX_COLUMNS = [
    { key: 'sl', header: 'Sl', width: 6, kind: 'sl' },
    { key: 'factory name', header: 'FACTORY NAME', width: 16, kind: 'factory name' },
    { key: 'source', header: 'Source', width: 11, kind: 'text' },
    { key: 'assetType', header: 'Assets Type', width: 16, kind: 'text' },
    { key: 'category', header: 'Assets Category', width: 18, kind: 'text' },
    { key: 'description', header: 'Item Description', width: 32, kind: 'text' },
    { key: 'code', header: 'Asset Code', width: 14, kind: 'code' },
    { key: 'openingQty', header: 'Opening QTY', width: 12, kind: 'qty' },
    { key: 'additionsQty', header: 'Additions Qty in present year', width: 17, kind: 'qty' },
    { key: 'disposedQty', header: 'Disposed Qty', width: 12, kind: 'qty' },
    { key: 'sentQty', header: 'Send to Another Unit Qty', width: 16, kind: 'qty' },
    { key: 'receivedQty', header: 'Received From Another Unit Qty', width: 18, kind: 'qty' },
    { key: 'carryingQty', header: 'Carrying Qty', width: 12, kind: 'carrying' },
    { key: 'totalValue', header: 'Total Value', width: 18, kind: 'total' },
    { key: 'remarks', header: 'Remarks', width: 26, kind: 'text' },
]
const XLSX_FROZEN_COLUMNS = 6 // Sl ... Asset Code stay frozen, like the table
const XLSX_SUM_KEYS = ['openingQty', 'additionsQty', 'disposedQty', 'sentQty', 'receivedQty', 'carryingQty', 'totalValue']

// cell style ids (see buildStylesXml)
const XS = { TITLE: 1, HEADER: 2, HEADER_DIV: 3, TEXT: 4, CODE_DIV: 5, QTY: 6, CARRYING: 7, MONEY: 8, TOTAL_VALUE: 9, TOTAL_QTY: 10, TOTAL_MONEY: 11 }

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
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0;-#,##0;&quot;-&quot;"/><numFmt numFmtId="165" formatCode="&quot;৳ &quot;#,##0"/></numFmts>
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
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
${xf(0, 3, 0, 0)}
${xf(0, 2, 2, 1)}
${xf(0, 2, 2, 2)}
${xf(0, 0, 0, 3)}
${xf(0, 1, 0, 4)}
${xf(164, 0, 0, 3)}
${xf(164, 1, 0, 3)}
${xf(165, 0, 0, 3)}
${xf(165, 1, 0, 3)}
${xf(164, 2, 2, 1)}
${xf(165, 2, 2, 1)}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

const buildSheetXml = (rows, totals, generatedOn) => {
    const lastCol = XLSX_COLUMNS.length
    const titleRow = 1
    const headerRow = 2
    const firstDataRow = 3
    const totalRow = firstDataRow + rows.length
    const lastDataRow = totalRow - 1
    const letter = (key) => xlsxColLetter(XLSX_COLUMNS.findIndex((c) => c.key === key))
    const isDivider = (i) => i === XLSX_FROZEN_COLUMNS - 1

    const xmlRows = []

    // title (merged across all columns)
    const titleCells = XLSX_COLUMNS.map((_, i) =>
        i === 0
            ? cellText('A1', XS.TITLE, generatedOn ? `Asset Summary  |  ${generatedOn}` : 'Asset Summary')
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
            switch (col.kind) {
                case 'sl':
                    return cellNumber(ref, XS.TEXT, rowIndex + 1)
                case 'code':
                    return cellText(ref, XS.CODE_DIV, row[col.key] || '-')
                case 'qty':
                    return cellNumber(ref, XS.QTY, row[col.key])
                case 'carrying':
                    // Opening + Additions - Disposed - Sent + Received
                    return cellFormula(
                        ref,
                        XS.CARRYING,
                        `${letter('openingQty')}${r}+${letter('additionsQty')}${r}-${letter('disposedQty')}${r}-${letter('sentQty')}${r}+${letter('receivedQty')}${r}`,
                        row.carryingQty
                    )
                case 'money':
                    return cellNumber(ref, XS.MONEY, row[col.key])
                case 'total':
                    // Carrying Qty x Price Per Pcs (price is no longer a column, so this is a plain value)
                    return cellNumber(ref, XS.TOTAL_VALUE, row.totalValue)
                default:
                    return cellText(ref, XS.TEXT, row[col.key] || '-')
            }
        })
        xmlRows.push(`<row r="${r}" ht="24" customHeight="1">${cells.join('')}</row>`)
    })

    // TOTAL row (label merged over the frozen columns, like the table footer)
    const totalCells = XLSX_COLUMNS.map((col, i) => {
        const ref = `${xlsxColLetter(i)}${totalRow}`
        if (i === 0) return cellText(ref, XS.HEADER, 'TOTAL')
        if (i < XLSX_FROZEN_COLUMNS) return cellBlank(ref, isDivider(i) ? XS.HEADER_DIV : XS.HEADER)
        if (XLSX_SUM_KEYS.includes(col.key)) {
            const l = letter(col.key)
            return cellFormula(
                ref,
                col.kind === 'total' ? XS.TOTAL_MONEY : XS.TOTAL_QTY,
                `SUM(${l}${firstDataRow}:${l}${lastDataRow})`,
                totals[col.key]
            )
        }
        return cellText(ref, XS.HEADER, '-')
    })
    xmlRows.push(`<row r="${totalRow}" ht="26" customHeight="1">${totalCells.join('')}</row>`)

    const cols = XLSX_COLUMNS.map(
        (col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1"/>`
    ).join('')

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${xlsxColLetter(lastCol - 1)}${totalRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane xSplit="${XLSX_FROZEN_COLUMNS}" ySplit="${headerRow}" topLeftCell="${xlsxColLetter(XLSX_FROZEN_COLUMNS)}${firstDataRow}" activePane="bottomRight" state="frozen"/><selection pane="topRight"/><selection pane="bottomLeft"/><selection pane="bottomRight"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${cols}</cols>
<sheetData>${xmlRows.join('')}</sheetData>
<autoFilter ref="A${headerRow}:${xlsxColLetter(lastCol - 1)}${headerRow}"/>
<mergeCells count="2"><mergeCell ref="A${titleRow}:${xlsxColLetter(lastCol - 1)}${titleRow}"/><mergeCell ref="A${totalRow}:${xlsxColLetter(XLSX_FROZEN_COLUMNS - 1)}${totalRow}"/></mergeCells>
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

// rows = the rows shown in the table (with carryingQty / totalValue), totals = the table's Total row
const buildAssetSummaryXlsx = (rows, totals, generatedOn = '') => {
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
            text: `${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Asset Summary" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Asset Summary'!$A$2:$${lastCol}$2</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
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
/*  Column configuration                                               */
/* ------------------------------------------------------------------ */

const SOURCE_FILTERS = ['All', 'Own', 'Rental']

// width = px (fixed layout + frozen-column offsets)
const COLUMNS = [
    { key: 'sl', label: 'Sl', width: 56, filterable: true },
    { key: 'factory name', label: 'FACTORY NAME', width: 120, filterable: true },    
    { key: 'source', label: 'Source', width: 100, kind: 'badge' },
    { key: 'assetType', label: 'Assets Type', width: 120 },
    { key: 'category', label: 'Assets Category', width: 130 },
    { key: 'description', label: 'Item Description', width: 200 },
    { key: 'code', label: 'Asset Code', width: 112, cell: 'font-bold text-gray-900' },
    { key: 'openingQty', label: 'Opening QTY', width: 100, kind: 'qty' },
    { key: 'additionsQty', label: 'Additions Qty in present year', width: 125, kind: 'qty' },
    { key: 'disposedQty', label: 'Disposed Qty', width: 100, kind: 'qty' },
    { key: 'sentQty', label: 'Send to Another Unit Qty', width: 120, kind: 'qty' },
    { key: 'receivedQty', label: 'Received From Another Unit Qty', width: 135, kind: 'qty' },
    { key: 'carryingQty', label: 'Carrying Qty', width: 105, kind: 'carrying' },
    { key: 'totalValue', label: 'Total Value', width: 145, kind: 'total', format: (v) => formatCurrency(v) },
    { key: 'remarks', label: 'Remarks', width: 180, kind: 'remarks', cell: 'cursor-cell text-left' },
]

// Columns that get a total in the footer
const FOOTER_SUM_KEYS = ['openingQty', 'additionsQty', 'disposedQty', 'sentQty', 'receivedQty', 'carryingQty']

// Columns from the first one through this column stay frozen while scrolling sideways
const FROZEN_UNTIL = 'code'
const FROZEN_COUNT = COLUMNS.findIndex((c) => c.key === FROZEN_UNTIL) + 1
const LEFT_OFFSETS = COLUMNS.map((_, i) => COLUMNS.slice(0, i).reduce((sum, c) => sum + c.width, 0))
const TOTAL_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0)

// Table look: slate header / footer, green vertical lines, light horizontal lines
const HEADER_CELL = 'border-r border-slate-400'
const BODY_CELL = 'border-b border-gray-200 border-r border-emerald-500'
const FOOTER_CELL = 'border-r border-slate-400'
const FROZEN_DIVIDER = 'border-r-2 border-r-slate-700'

/* ------------------------------------------------------------------ */
/*  Draggable modal (drag by the title bar)                            */
/*  Rendered in a portal so the page zoom in the layout never shifts   */
/*  its position.                                                      */
/* ------------------------------------------------------------------ */

const DraggableModal = ({
    title,
    width = 280,
    initialPosition = null,
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
            className="fixed inset-0 z-[60]"
            onMouseDown={(e) => {
                if (closeOnBackdrop && e.target === e.currentTarget) onClose()
            }}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="fixed flex flex-col bg-white rounded-xl shadow-2xl border border-green-200 max-h-[calc(100vh-16px)]"
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
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-t-xl bg-emerald-50 border-b border-green-200 text-emerald-900 select-none touch-none ${
                        isDragging ? 'cursor-grabbing' : 'cursor-grab'
                    }`}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <GripVertical size={16} className="shrink-0 text-emerald-600" />
                        <h3 className="text-sm font-bold uppercase tracking-wide truncate">{title}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="shrink-0 p-1 rounded-md hover:bg-emerald-100 cursor-pointer transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">{children}</div>

                {footer && <div className="px-4 py-3 border-t border-green-200 bg-emerald-50/50 rounded-b-xl">{footer}</div>}
            </div>
        </div>,
        document.body
    )
}

/* ------------------------------------------------------------------ */
/*  Excel-style column filter modal                                    */
/* ------------------------------------------------------------------ */

const ColumnFilterModal = ({ column, values, selected, position, onApply, onClose }) => {
    const [search, setSearch] = useState('')
    // No active filter = everything ticked
    const [draft, setDraft] = useState(() => new Set(selected ?? values))
    const selectAllRef = useRef(null)

    // What the user sees for a value (money columns are shown with the ৳ sign)
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
                        className="w-full pl-8 pr-2 py-1.5 text-sm border border-green-200 rounded-md outline-none focus:border-primary-500"
                    />
                </div>

                <div className="border border-green-200 rounded-md max-h-56 overflow-y-auto bg-white">
                    {visibleValues.length === 0 ? (
                        <p className="px-3 py-4 text-center text-sm text-gray-500">No matches</p>
                    ) : (
                        <>
                            <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-gray-800 border-b border-green-200 cursor-pointer hover:bg-emerald-50">
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
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 cursor-pointer hover:bg-emerald-50"
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
/*  Summary card                                                       */
/* ------------------------------------------------------------------ */

const SummaryCard = ({ label, value, sub, icon: Icon, gradient }) => (
    <div className="relative overflow-hidden bg-white rounded-xl border border-green-200 shadow-sm p-4 flex items-center gap-4">
        <div
            className={`w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br ${gradient} text-white flex items-center justify-center shadow`}
        >
            <Icon size={22} />
        </div>
        <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className="text-2xl font-bold text-gray-900 leading-tight truncate">{value}</p>
            <p className="text-xs text-gray-500 truncate">{sub}</p>
        </div>
    </div>
)

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const AssetSummary = () => {
    const [assets, setAssets] = useState(SAMPLE_ASSETS)
    // Saved price / remarks of every asset (edits are kept separately until Save)
    const baseAssets = useMemo(
        () => assets.map((a) => ({ ...a, savedPrice: a.pricePerPcs, savedRemarks: a.remarks ?? '' })),
        [assets]
    )

    const [sourceFilter, setSourceFilter] = useState('All')
    const [search, setSearch] = useState('')
    const [filters, setFilters] = useState({}) // { columnKey: Set }
    const [filterModal, setFilterModal] = useState(null) // { key, position }
    const [selectedIds, setSelectedIds] = useState(() => new Set())
    const [remarkEdits, setRemarkEdits] = useState({}) // { asset id: typed remarks text } — unsaved Remarks edits
    const [editingRemarkId, setEditingRemarkId] = useState(null) // the remarks cell open for typing (double-click)
    const [notice, setNotice] = useState(null) // { kind: 'success' | 'error', text }
    const selectAllRef = useRef(null)

    // Freezing needs room to scroll, so it is switched on for wide screens only
    const freezeEnabled = useMediaQuery('(min-width: 1280px)')

    const editCount = Object.keys(remarkEdits).length
    const hasEdits = editCount > 0

    // Add the calculated Carrying Qty and Total Value to every row.
    const rows = useMemo(
        () =>
            baseAssets.map((asset) => {
                const pricePerPcs = asset.savedPrice
                const carryingQty = getCarryingQty(asset)
                const remarks = remarkEdits[asset.id] !== undefined ? remarkEdits[asset.id] : asset.savedRemarks
                return { ...asset, pricePerPcs, remarks, carryingQty, totalValue: carryingQty * pricePerPcs }
            }),
        [baseAssets, remarkEdits]
    )

    const sourceCounts = useMemo(
        () => ({
            All: rows.length,
            Own: rows.filter((r) => r.source === 'Own').length,
            Rental: rows.filter((r) => r.source === 'Rental').length,
        }),
        [rows]
    )

    // Rows after the Source tabs and the search box
    const baseRows = useMemo(() => {
        const term = search.trim().toLowerCase()
        return rows.filter((r) => {
            if (sourceFilter !== 'All' && r.source !== sourceFilter) return false
            if (!term) return true
            return [r.assetType, r.category, r.description, r.code, r.remarks]
                .join(' ')
                .toLowerCase()
                .includes(term)
        })
    }, [rows, sourceFilter, search])

    // ...then the Excel-style column filters (a row being edited never disappears while typing)
    const filteredRows = useMemo(
        () => baseRows.filter((r) => remarkEdits[r.id] !== undefined || rowMatches(r, filters)),
        [baseRows, filters, remarkEdits]
    )

    // Footer totals follow the rows currently shown
    const totals = useMemo(() => {
        const result = FOOTER_SUM_KEYS.reduce((acc, key) => {
            acc[key] = sumBy(filteredRows, (r) => r[key])
            return acc
        }, {})
        result.totalValue = sumBy(filteredRows, (r) => r.totalValue)
        return result
    }, [filteredRows])

    // Quick summary = the table's Total row (always the rows currently shown)
    const summary = useMemo(() => {
        const own = filteredRows.filter((r) => r.source === 'Own')
        const rental = filteredRows.filter((r) => r.source === 'Rental')
        return {
            totalQty: totals.carryingQty,
            totalItems: filteredRows.length,
            ownQty: sumBy(own, (r) => r.carryingQty),
            ownItems: own.length,
            ownValue: sumBy(own, (r) => r.totalValue),
            rentalQty: sumBy(rental, (r) => r.carryingQty),
            rentalItems: rental.length,
            additionsQty: totals.additionsQty,
        }
    }, [filteredRows, totals])

    // Values listed in the filter modal (rows already narrowed by the other filters)
    const modalValues = useMemo(() => {
        if (!filterModal) return []
        const unique = new Set(
            baseRows.filter((r) => rowMatches(r, filters, filterModal.key)).map((r) => cellValue(r, filterModal.key))
        )
        return [...unique].sort((a, b) => collator.compare(a, b))
    }, [filterModal, baseRows, filters])

    const activeFilterCount = Object.keys(filters).length
    const filterColumn = filterModal ? COLUMNS.find((c) => c.key === filterModal.key) : null

    /* ---- row selection (checkbox column) ---- */
    const selectedVisibleCount = filteredRows.filter((r) => selectedIds.has(r.id)).length
    const allSelected = filteredRows.length > 0 && selectedVisibleCount === filteredRows.length
    const someSelected = selectedVisibleCount > 0 && !allSelected

    useEffect(() => {
        if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
    }, [someSelected])

    const toggleAllRows = () => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (allSelected) filteredRows.forEach((r) => next.delete(r.id))
            else filteredRows.forEach((r) => next.add(r.id))
            return next
        })
    }

    const toggleRow = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    /* ---- editable Remarks (double-click a remarks cell to edit it) ---- */
    const handleRemarkChange = (id, value) => {
        setNotice(null)
        const original = baseAssets.find((a) => a.id === id)?.savedRemarks ?? ''
        setRemarkEdits((prev) => {
            const next = { ...prev }
            // Typing the original remarks back = nothing left to save
            if (value === original) delete next[id]
            else next[id] = value
            return next
        })
    }

    const discardEdits = () => {
        setRemarkEdits({})
        setEditingRemarkId(null)
        setNotice(null)
    }

    const saveEdits = () => {
        const remarkUpdates = { ...remarkEdits }
        // TODO: send `remarkUpdates` (asset id -> value) to your API here
        setAssets((prev) =>
            prev.map((asset) => {
                if (remarkUpdates[asset.id] !== undefined) return { ...asset, remarks: remarkUpdates[asset.id] }
                return asset
            })
        )
        setRemarkEdits({})
        setEditingRemarkId(null)
        setNotice({ kind: 'success', text: `Saved ${editCount} change${editCount > 1 ? 's' : ''}.` })
    }

    // Esc discards the unsaved edits (the filter modal keeps its own Esc = close)
    useEffect(() => {
        if ((!hasEdits && editingRemarkId === null) || filterModal) return
        const handleKeyDown = (e) => {
            if (e.key !== 'Escape') return
            setRemarkEdits({})
            setEditingRemarkId(null)
            setNotice(null)
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [hasEdits, editingRemarkId, filterModal])

    /* ---- Excel export (rows and totals exactly as shown in the table) ---- */
    const handleExport = () => {
        try {
            const today = new Date().toLocaleDateString('en-CA') // yyyy-mm-dd
            const bytes = buildAssetSummaryXlsx(filteredRows, totals, today)
            downloadXlsx(bytes, `Asset_Summary_${today}.xlsx`)
            setNotice({ kind: 'success', text: `Exported ${filteredRows.length} row${filteredRows.length > 1 ? 's' : ''} to Excel.` })
        } catch (error) {
            console.error(error)
            setNotice({ kind: 'error', text: 'Export failed. Please try again.' })
        }
    }

    /* ---- column filter modal ---- */
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

    const summaryCards = [
        {
            label: 'Total Asset',
            value: formatNumber(summary.totalQty),
            sub: `${summary.totalItems} item lines`,
            icon: Boxes,
            gradient: 'from-blue-500 to-blue-600',
        },
        {
            label: 'Own Asset',
            value: formatNumber(summary.ownQty),
            sub: `${summary.ownItems} item lines`,
            icon: PackageCheck,
            gradient: 'from-emerald-500 to-emerald-600',
        },
        {
            label: 'Own Asset Value',
            value: formatCurrency(summary.ownValue),
            sub: 'Carrying qty x price per pcs',
            icon: Wallet,
            gradient: 'from-violet-500 to-violet-600',
        },
        {
            label: 'Rental Asset',
            value: formatNumber(summary.rentalQty),
            sub: `${summary.rentalItems} item lines`,
            icon: CalendarClock,
            gradient: 'from-amber-500 to-amber-600',
        },
        {
            label: 'Addition Asset Qty',
            value: formatNumber(summary.additionsQty),
            sub: 'Added in present year',
            icon: PackagePlus,
            gradient: 'from-rose-500 to-rose-600',
        },
    ]

    /* ---- frozen-column helpers ---- */
    const isFrozen = (index) => freezeEnabled && index < FROZEN_COUNT
    const dividerClass = (index) => (freezeEnabled && index === FROZEN_COUNT - 1 ? FROZEN_DIVIDER : '')
    const leftStyle = (index) => (isFrozen(index) ? { left: LEFT_OFFSETS[index] } : {})

    const renderCell = (col, row, rowIndex) => {
        switch (col.kind) {
            case 'select':
                return (
                    <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select ${row.description}`}
                        className="w-4 h-4 cursor-pointer accent-emerald-600"
                    />
                )
            case 'badge':
                return (
                    <span className="inline-block px-3 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold">
                        {row.source}
                    </span>
                )
            case 'qty':
                return Number(row[col.key]) === 0 ? <span className="text-gray-400">-</span> : formatNumber(row[col.key])
            case 'carrying':
                return <span className="font-bold text-gray-900">{formatNumber(row.carryingQty)}</span>
            case 'remarks': {
                if (editingRemarkId === row.id) {
                    return (
                        <input
                            type="text"
                            autoFocus
                            value={row.remarks || ''}
                            onChange={(e) => handleRemarkChange(row.id, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => setEditingRemarkId(null)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                            }}
                            aria-label={`Remarks for ${row.description}`}
                            className="w-full px-2 py-1 text-xs text-left rounded-md border border-emerald-500 bg-white text-gray-900 outline-none ring-2 ring-emerald-100"
                        />
                    )
                }
                const edited = remarkEdits[row.id] !== undefined
                return (
                    <div
                        title="Double-click to edit"
                        className={`select-none rounded-md px-2 py-1 text-left ${
                            edited ? 'bg-amber-50 text-gray-900 ring-1 ring-amber-400 font-semibold' : 'text-gray-700'
                        }`}
                    >
                        {row.remarks || <span className="text-gray-400">-</span>}
                    </div>
                )
            }
            case 'total':
                return <span className="font-bold text-gray-900">{formatCurrency(row.totalValue)}</span>
            default:
                if (col.key === 'sl') return rowIndex + 1
                return row[col.key] || <span className="text-gray-400">-</span>
        }
    }

    return (
        <div className="space-y-5">
            {/* Quick total summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                {summaryCards.map((card) => (
                    <SummaryCard key={card.label} {...card} />
                ))}
            </div>

            {/* Table card */}
            <div className="bg-white rounded-xl border border-green-200 shadow-sm overflow-hidden">
                {/* Toolbar */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-3 border-b border-green-200 bg-emerald-50/60">
                    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter by source">
                        {SOURCE_FILTERS.map((filter) => {
                            const active = sourceFilter === filter
                            return (
                                <button
                                    key={filter}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => setSourceFilter(filter)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                                        active
                                            ? 'bg-primary-500 text-white shadow-sm'
                                            : 'bg-white text-gray-600 border border-green-200 hover:bg-emerald-50'
                                    }`}
                                >
                                    {filter}
                                    <span className={`ml-1.5 ${active ? 'text-primary-100' : 'text-gray-400'}`}>
                                        {sourceCounts[filter]}
                                    </span>
                                </button>
                            )
                        })}

                        {/* Export tab */}
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={filteredRows.length === 0}
                            title="Download the table as an Excel file"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-700 bg-white border border-emerald-500 hover:bg-emerald-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={14} />
                            Export
                        </button>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        {notice && (
                            <span
                                className={`text-xs font-semibold ${notice.kind === 'error' ? 'text-red-600' : 'text-green-700'}`}
                                role="status"
                            >
                                {notice.text}
                            </span>
                        )}
                        {selectedIds.size > 0 && (
                            <span className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 rounded-full">
                                {selectedIds.size} selected
                            </span>
                        )}
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setFilters({})}
                                className="px-3 py-1.5 text-xs font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200 rounded-full cursor-pointer transition-colors"
                            >
                                Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                            </button>
                        )}
                        {hasEdits && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={saveEdits}
                                    title="Save the edits"
                                    className="px-3 py-1.5 text-xs font-bold text-white bg-primary-500 hover:bg-primary-600 rounded-md cursor-pointer transition-colors"
                                >
                                    Save ({editCount})
                                </button>
                                <button
                                    type="button"
                                    onClick={discardEdits}
                                    title="Discard the edits (Esc)"
                                    className="px-3 py-1.5 text-xs font-bold text-gray-800 bg-gray-200 hover:bg-gray-300 rounded-md cursor-pointer transition-colors"
                                >
                                    Discard
                                </button>
                            </div>
                        )}
                        <div className="relative w-full sm:w-72">
                            <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search item, code, type, category..."
                                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-green-200 rounded-lg outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                            />
                        </div>
                    </div>
                </div>

                {/* Table — zoom-out fix: minWidth + width:100% so it fills the screen; frozen cols keep fixed min/max so sticky offsets stay correct */}
                <div className="max-h-[60vh] overflow-auto bg-white">
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
                                            {col.kind === 'select' ? (
                                                <input
                                                    ref={selectAllRef}
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={toggleAllRows}
                                                    aria-label="Select all rows"
                                                    className="w-4 h-4 cursor-pointer accent-emerald-600"
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <span className="leading-tight text-center whitespace-normal break-words">
                                                        {col.label}
                                                    </span>
                                                    {col.filterable !== false && (
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
                                                    )}
                                                </div>
                                            )}
                                        </th>
                                    )
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {filteredRows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={COLUMNS.length}
                                        className="px-3 py-12 text-center text-sm text-gray-500 bg-white border-b border-gray-200"
                                    >
                                        No assets found
                                    </td>
                                </tr>
                            ) : (
                                filteredRows.map((row, rowIndex) => {
                                    const rowBg = selectedIds.has(row.id) ? 'bg-emerald-50' : 'bg-white'
                                    return (
                                        <tr key={row.id} className="group">
                                            {COLUMNS.map((col, index) => (
                                                <td
                                                    key={col.key}
                                                    className={`${rowBg} group-hover:bg-slate-50 ${BODY_CELL} ${dividerClass(index)} px-3 py-2 text-xs text-gray-700 text-center align-middle whitespace-normal break-words transition-colors ${col.cell || ''}`}
                                                    onDoubleClick={
                                                        col.kind === 'remarks' ? () => setEditingRemarkId(row.id) : undefined
                                                    }
                                                    style={{
                                                        height: 42,
                                                        ...(isFrozen(index)
                                                            ? { position: 'sticky', zIndex: 10, ...leftStyle(index) }
                                                            : {}),
                                                    }}
                                                >
                                                    {renderCell(col, row, rowIndex)}
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>

                        {filteredRows.length > 0 && (
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
                                    {FOOTER_SUM_KEYS.map((key) => (
                                        <td
                                            key={key}
                                            className={`bg-slate-500 text-white ${FOOTER_CELL} px-3 py-3 text-xs font-bold text-center`}
                                            style={{ position: 'sticky', bottom: 0, zIndex: 20 }}
                                        >
                                            {totals[key] === 0 ? '-' : formatNumber(totals[key])}
                                        </td>
                                    ))}
                                    <td
                                        className={`bg-slate-500 text-white ${FOOTER_CELL} px-3 py-3 text-xs font-bold text-center`}
                                        style={{ position: 'sticky', bottom: 0, zIndex: 20 }}
                                    >
                                        {totals.totalValue === 0 ? '-' : formatCurrency(totals.totalValue)}
                                    </td>
                                    {/* Remarks has no total */}
                                    <td
                                        className={`bg-slate-500 text-white ${FOOTER_CELL} px-3 py-3 text-xs font-bold text-center`}
                                        style={{ position: 'sticky', bottom: 0, zIndex: 20 }}
                                    >
                                        -
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
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
        </div>
    )
}

export default AssetSummary