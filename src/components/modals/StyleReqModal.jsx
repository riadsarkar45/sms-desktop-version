import { X, Save, Plus } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { RefreshCcw } from "lucide-react";
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';
import { usePostData } from '../../hooks/post';
import Input from '../InputText/Input';

const formatJobNo = (value) => {
    if (!value) return '';

    const cleaned = value.toUpperCase().replace(/[\s\-/]+/g, '');

    return cleaned
        .replace(/^(SMP|ATL|SM|MANGO|MAN)(\d{2})(\d{4})/, '$1$2-$3')
        .replace(/(\d)([A-Z])/, '$1-$2');
};

const defaultRow = () => ({
    id: Date.now() + Math.random(),
    color: '',
    composition: '',
    finishDia: '',
    orderQty: '',
    finishRequiredQty: '',
    processLoss: '',
});

// Order of fields in each row, left -> right, matching the visible columns.
const FIELDS = ['color', 'composition', 'finishDia', 'orderQty', 'finishRequiredQty', 'processLoss'];

const evaluateQtyExpression = (expr) => {
    if (expr === undefined || expr === null) return null;
    const sanitized = String(expr).trim();
    if (sanitized === '') return null;
    if (!/^[0-9+\-*/().\s]+$/.test(sanitized)) return null;

    try {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${sanitized});`)();
        return typeof result === 'number' && Number.isFinite(result) ? result : null;
    } catch {
        return null;
    }
};

const StyleReqModal = ({ setShowModal, setRawData }) => {
    const [rows, setRows] = useState([defaultRow()]);
    const [orderInfo, setOrderInfo] = useState(
        {
            salesContact: '',
            buyerName: '',
            jobNo: '',
            poNo: '',
            styleNo: '',
            hodTypeDate: '',
        }
    )
    const [successMessage, setSuccessMessage] = useState('');

    const axiosPrivate = useAxiosPrivate();
    const { postData, loading, error } = usePostData();

    // Auto-hide the success message after 5 seconds
    useEffect(() => {
        if (!successMessage) return;
        const timer = setTimeout(() => setSuccessMessage(''), 5000);
        return () => clearTimeout(timer);
    }, [successMessage]);

    // Grid of input DOM refs, keyed by "rowIndex-fieldIndex", so arrow keys
    // and Ctrl+D can jump/copy between cells like a spreadsheet. Rebuilt
    // every render via the ref callback on each <input>, so it always
    // matches the current rows/fields layout even after add/remove row.
    const cellRefs = useRef({});
    const cellKey = (rowIndex, fieldIndex) => `${rowIndex}-${fieldIndex}`;

    const focusCell = (rowIndex, fieldIndex) => {
        const el = cellRefs.current[cellKey(rowIndex, fieldIndex)];
        if (el) {
            el.focus();
            // put cursor at the end so repeated ArrowDown/ArrowUp keeps working
            const len = el.value ? el.value.length : 0;
            el.setSelectionRange(len, len);
        }
    };

    const addRow = () => setRows((prev) => [...prev, defaultRow()]);

    const removeRow = (id) =>
        setRows((prev) => prev.filter((r) => r.id !== id));

    const updateRow = (id, field, value) =>
        setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
        );

    // Keyboard handler for a single cell input.
    const handleCellKeyDown = (e, rowIndex, fieldIndex, row) => {
        const field = FIELDS[fieldIndex];
        const input = e.target;

        // Ctrl+D / Cmd+D — copy the cell above into this cell
        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            if (rowIndex > 0) {
                const aboveRow = rows[rowIndex - 1];
                updateRow(row.id, field, aboveRow[field]);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown': {
                e.preventDefault();
                focusCell(rowIndex + 1, fieldIndex);
                break;
            }
            case 'ArrowUp': {
                e.preventDefault();
                focusCell(rowIndex - 1, fieldIndex);
                break;
            }
            case 'ArrowLeft': {
                if (input.selectionStart === 0 && input.selectionEnd === 0) {
                    e.preventDefault();
                    focusCell(rowIndex, fieldIndex - 1);
                }
                break;
            }
            case 'ArrowRight': {
                const len = input.value.length;
                if (input.selectionStart === len && input.selectionEnd === len) {
                    e.preventDefault();
                    focusCell(rowIndex, fieldIndex + 1);
                }
                break;
            }
            default:
                break;
        }
    };

    // Grand totals across all rows for the numeric columns.
    const totalOrderQty = rows.reduce(
        (sum, row) => sum + (Number(row.orderQty) || 0),
        0
    );
    const totalFinishRequiredQty = rows.reduce(
        (sum, row) => sum + (Number(row.finishRequiredQty) || 0),
        0
    );

    const totalYarnRequiredQty = rows.reduce(
        (sum, row) => {
            const finishReq = evaluateQtyExpression(row.finishRequiredQty) || 0;
            const processLoss = Number(row.processLoss) || 0;
            return sum + (finishReq * (1 + processLoss / 100));
        },
        0
    );

    const createNewRequirement = async () => {
        setSuccessMessage('');

        const payload = {
            orderInfo,
            rows: rows.map(row => {
                const finishReq = evaluateQtyExpression(row.finishRequiredQty) || 0;
                const processLoss = Number(row.processLoss) || 0;
                const yarnRequiredQty = finishReq * (1 + processLoss / 100);

                return {
                    color: row.color,
                    composition: row.composition,
                    finishDia: row.finishDia,
                    orderQty: row.orderQty,
                    finishRequiredQty: finishReq,
                    processLoss: row.processLoss,
                    yarnRequiredQty: yarnRequiredQty,
                };
            })
        };

        try {
            const res = await postData("/api/new-style-requirements", payload);
            if (res?.type === "success") {
                setSuccessMessage(res?.message || 'Requirement created successfully.');
                axiosPrivate.get("/api/styles").then((res) => { setRawData(res.data.data) });
            }
        } catch (e) {
            console.log(e.response?.data?.message);
            console.log(e.response?.data?.type);
        }
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="bg-white rounded-md border border-gray-200 w-full max-w-6xl max-h-[90vh] overflow-hidden pointer-events-auto animate-slide-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-200">
                        <h2 className="text-xl font-semibold uppercase text-gray-800">New Requirement</h2>
                        <button
                            onClick={() => setShowModal(false)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {
                        error && (
                            <div className='bg-yellow-500 p-3 rounded-md mt-3 bg-opacity-25 border-yellow-500 text-yellow-700'>{error.message}</div>
                        )
                    }

                    {
                        successMessage && (
                            <div className='bg-green-500 p-3 rounded-md mt-3 bg-opacity-25 border-green-500 text-green-700'>{successMessage}</div>
                        )
                    }

                    {/* Content */}
                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">

                        {/* Fixed fields - original 3-col grid */}
                        <div className='grid grid-cols-3 gap-3'>
                            <Input
                                label="Sales Contact"
                                isShowOutLabel={true}
                                type='text'
                                name="salesContact"
                                onChange={(e) => setOrderInfo({ ...orderInfo, salesContact: e.target.value.toUpperCase() })}
                                placeholder='Sales Contact'
                                value={orderInfo.salesContact}
                                required
                            />
                            <Input
                                label="Buyer Name"
                                type='text'
                                name="buyerName"
                                onChange={(e) => setOrderInfo({ ...orderInfo, buyerName: e.target.value.toUpperCase() })}
                                value={orderInfo.buyerName}
                                isShowOutLabel={true}
                                placeholder='Buyer Name'
                                required
                            />
                            <Input
                                label="Job No"
                                isShowOutLabel={true}
                                type='text'
                                name="jobNo"
                                onChange={(e) => setOrderInfo({ ...orderInfo, jobNo: formatJobNo(e.target.value) })}
                                value={orderInfo.jobNo}
                                placeholder='Job No'
                                required
                            />
                            <Input
                                label="PO No"
                                isShowOutLabel={true}
                                type='text'
                                name="poNo"
                                onChange={(e) => setOrderInfo({ ...orderInfo, poNo: e.target.value.toUpperCase() })}
                                value={orderInfo.poNo}
                                placeholder='Po No'
                                required
                            />
                            <Input
                                label="Style No"
                                isShowOutLabel={true}
                                type='text'
                                name="styleNo"
                                onChange={(e) => setOrderInfo({ ...orderInfo, styleNo: e.target.value.toUpperCase() })}
                                value={orderInfo.styleNo}
                                placeholder='Style No'
                                required
                            />
                            <Input
                                label="HOD"
                                isShowOutLabel={true}
                                type='date'
                                name="hodTypeDate"
                                onChange={(e) => setOrderInfo({ ...orderInfo, hodTypeDate: e.target.value })}
                                value={orderInfo.hodTypeDate}
                                placeholder='HOD'
                                required
                            />
                        </div>

                        {/* Repeatable rows section */}
                        <div className="mt-6">

                            {/* Section header with Add Row button */}
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                                    Color / Composition Details
                                </span>
                                <button
                                    type="button"
                                    onClick={addRow}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-50 text-primary-600 border border-primary-200 rounded-md hover:bg-primary-100 transition-colors"
                                >
                                    <Plus size={15} />
                                    Add Row
                                </button>
                            </div>

                            {/* Column headers */}
                            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_32px] gap-2 mb-1 px-1">
                                {['Color', 'Composition', 'Finish Dia', 'Order Qty', 'Finished Req. Qty', 'Process Loss', 'Yarn Require Qty', ''].map((h, i) => (
                                    <span key={i} className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                        {h}
                                    </span>
                                ))}
                            </div>

                            {/* Dynamic rows */}
                            <div className="flex flex-col gap-2">
                                {rows.map((row, rowIndex) => {
                                    const finishReq = evaluateQtyExpression(row.finishRequiredQty) || 0;
                                    const processLoss = Number(row.processLoss) || 0;
                                    const yarnRequiredQty = (finishReq * (1 + processLoss / 100)).toFixed(2);

                                    return (
                                        <div
                                            key={row.id}
                                            className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_32px] gap-2 items-center"
                                        >
                                            {FIELDS.map((field, fieldIndex) => {
                                                const isNumeric = ['orderQty', 'finishRequiredQty', 'processLoss'].includes(field);
                                                const placeholder =
                                                    field === 'processLoss' ? 'Process Loss' :
                                                    field === 'finishRequiredQty' ? 'e.g. 10+10+10' :
                                                    field === 'finishDia' ? 'Finish Dia' :
                                                    field === 'orderQty' ? 'Order Qty' :
                                                    field === 'composition' ? 'Composition' : 'Color';

                                                return (
                                                    <input
                                                        key={field}
                                                        ref={(el) => {
                                                            if (el) cellRefs.current[cellKey(rowIndex, fieldIndex)] = el;
                                                            else delete cellRefs.current[cellKey(rowIndex, fieldIndex)];
                                                        }}
                                                        type="text"
                                                        placeholder={placeholder}
                                                        value={row[field]}
                                                        onChange={(e) => updateRow(row.id, field, isNumeric ? e.target.value : e.target.value.toUpperCase())}
                                                        onKeyDown={(e) => handleCellKeyDown(e, rowIndex, fieldIndex, row)}
                                                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                                                    />
                                                );
                                            })}

                                            {/* Read-only computed output for Yarn Require Qty */}
                                            <div
                                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-gray-50 text-gray-700 font-medium"
                                                title="Automatically calculated from Finished Req. Qty, Process Loss, and Additional"
                                            >
                                                {yarnRequiredQty}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => removeRow(row.id)}
                                                disabled={rows.length === 1}
                                                className="flex items-center justify-center w-8 h-8 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Grand total row */}
                            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr_32px] gap-2 mt-2 px-1 pt-2 border-t border-gray-200">
                                <span className="col-span-3 text-xs font-semibold text-gray-500 uppercase tracking-wide self-center">
                                    Grand Total
                                </span>
                                <span className="text-sm font-semibold text-gray-800 px-3">
                                    {totalOrderQty.toLocaleString()}
                                </span>
                                <span className="text-sm font-semibold text-gray-800 px-3">
                                    {totalFinishRequiredQty.toLocaleString()}
                                </span>
                                <span className="text-sm font-semibold text-gray-800 px-3">
                                    —
                                </span>
                                <span className="text-sm font-semibold text-gray-800 px-3">
                                    {totalYarnRequiredQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span />
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col sm:flex-row gap-3 mt-10 border-gray-200">
                            {
                                loading ? (
                                    <button
                                        className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-800/50 text-white font-medium rounded-md hover:bg-primary-600 transition-all duration-200 border border-primary-600"
                                    >
                                        <Save size={18} />
                                        <RefreshCcw size={18} className="animate-spin" />
                                    </button>
                                ) : <button
                                    onClick={() => createNewRequirement()}
                                    type="submit"
                                    className="flex items-center justify-center gap-2 px-6 py-2.5 bg-slate-800/50 text-white font-medium rounded-md hover:bg-primary-600 transition-all duration-200 border border-primary-600"
                                >
                                    <Save size={18} />
                                    Insert
                                </button>
                            }
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white text-gray-700 font-medium rounded-md hover:bg-gray-50 transition-all duration-200 border border-gray-200"
                            >
                                <X size={18} />
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
        </>
    );
};

export default StyleReqModal;