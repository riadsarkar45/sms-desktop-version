import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCcw, X } from 'lucide-react';
import useAxiosPrivate from '../hooks/UseAxiosPrivate';
import Input from './InputText/Input';

const SUMMARY_CONFIG = {
    knittingOrder: [
        { key: 'knittingOrder', field: 'workOrderQty', label: 'Total Work Order Qty' },
        { key: 'YarnDelivery', field: 'deliveryQty', label: 'Total Yarn Delivery Qty' },
        { key: 'YarnReturn', field: 'deliveryQty', label: 'Total Yarn Return Qty' },
        { key: 'GreyFabricReceived', field: 'deliveryQty', label: 'Total Grey Fabric Received Qty' },
    ],
    dyeingOrder: [
        { key: 'dyeingOrder', field: 'workOrderQty', label: 'Total Work Order Qty' },
        { key: 'GreyDelivery', field: 'deliveryQty', label: 'Total Grey Delivery Qty' },
        { key: 'GreyReceived', field: 'deliveryQty', label: 'Total Grey Received Qty' },
        { key: 'FinishReceived', field: 'deliveryQty', label: 'Total Finish Received Qty' },
        { key: 'GreyReturn', field: 'deliveryQty', label: 'Total Grey Return Qty' },
        { key: 'SentForReprocess', field: 'deliveryQty', label: 'Total Sent For Reprocess Qty' },
        { key: 'ReceivedFromReprocess', field: 'deliveryQty', label: 'Total Received From Reprocess Qty' },
    ],
    aopOrder: [
        { key: 'aopOrder', field: 'workOrderQty', label: 'Total Work Order Qty' },
        { key: 'SentForAop', field: 'deliveryQty', label: 'Total Sent For AOP Qty' },
        { key: 'ReceivedFromAop', field: 'deliveryQty', label: 'Total Received From AOP Qty' },
        { key: 'AOPFinishFabricRcvd', field: 'deliveryQty', label: 'Total AOP Finish Fabric Received Qty' },
        { key: 'ReturnFromAop', field: 'deliveryQty', label: 'Total Return From AOP Qty' },
    ],
};

// static strings so Tailwind can detect them
const GRID_COLS = {
    knittingOrder: 'lg:grid-cols-4',
    dyeingOrder: 'lg:grid-cols-7',
    aopOrder: 'lg:grid-cols-5',
};

const orderTypes = Object.keys(SUMMARY_CONFIG);

// ── date helpers (use LOCAL date parts; toISOString() would shift to UTC) ──
const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMonthStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const getPresets = () => {
    const now = new Date();

    // last 7 days = today + the 6 days before it
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

    // day 1 of this month minus one month handles the January -> December wrap
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    return {
        last7: { fromDate: toDateStr(start), toDate: toDateStr(now), month: '' },
        thisMonth: { fromDate: '', toDate: '', month: toMonthStr(now) },
        prevMonth: { fromDate: '', toDate: '', month: toMonthStr(prevMonth) },
    };
};

const PRESET_BUTTONS = [
    { id: 'last7', label: 'Last 7 days' },
    { id: 'thisMonth', label: 'This month' },
    { id: 'prevMonth', label: 'Last month' },
];

const TotalSummary = ({ height, bgColor, color }) => {
    const [orderType, setOrderType] = useState(orderTypes[0]);
    const [month, setMonth] = useState('');       // "YYYY-MM"
    const [fromDate, setFromDate] = useState(''); // "YYYY-MM-DD"
    const [toDate, setToDate] = useState('');     // "YYYY-MM-DD"
    const [detailData, setDetailData] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const axiosSecure = useAxiosPrivate();

    const fields = SUMMARY_CONFIG[orderType] ?? [];
    const hasFilter = Boolean(month || fromDate || toDate);
    const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);

    // which quick button (if any) matches the current filter values
    const presets = getPresets();
    const activePreset =
        PRESET_BUTTONS.find(({ id }) => {
            const p = presets[id];
            return p.month === month && p.fromDate === fromDate && p.toDate === toDate;
        })?.id ?? null;

    const fetchDetail = useCallback(async (signal) => {
        if (invalidRange) {
            setError('"From Date" cannot be after "To Date"');
            setDetailData({});
            return;
        }

        setLoading(true);
        setError('');
        try {
            // month takes priority; otherwise use the date range
            const params = {};
            if (month) {
                params.month = month;
            } else {
                if (fromDate) params.fromDate = fromDate;
                if (toDate) params.toDate = toDate;
            }

            const res = await axiosSecure.get(`/api/delivery/type/total/${orderType}`, {
                params,
                signal,
            });
            setDetailData(res.data ?? {});
        } catch (err) {
            if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
            console.error('Failed to fetch summary', err);
            setError(err?.response?.data?.message || 'Failed to load summary');
            setDetailData({});
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [axiosSecure, orderType, month, fromDate, toDate, invalidRange]);

    // refetch whenever any filter changes; cancel the previous in-flight request
    useEffect(() => {
        const controller = new AbortController();
        fetchDetail(controller.signal);
        return () => controller.abort();
    }, [fetchDetail]);

    const handleOrderType = (e) => setOrderType(e.target.value);

    const handleMonth = (e) => {
        setMonth(e.target.value);
        setFromDate('');
        setToDate('');
    };

    const handleFromDate = (e) => {
        setFromDate(e.target.value);
        setMonth('');
    };

    const handleToDate = (e) => {
        setToDate(e.target.value);
        setMonth('');
    };

    const applyPreset = (id) => {
        const p = getPresets()[id];
        setMonth(p.month);
        setFromDate(p.fromDate);
        setToDate(p.toDate);
    };

    const clearFilters = () => {
        setMonth('');
        setFromDate('');
        setToDate('');
    };

    return (
        <div className='bg-white p-2'>
            <div className='flex flex-wrap items-end gap-2 mb-2'>
                <Input
                    name="orderType"
                    type="select"
                    label="Order Type"
                    required
                    placeholder="Order Type"
                    options={orderTypes}
                    value={orderType}
                    onChange={handleOrderType}
                />

                <Input
                    name="month"
                    label="Month"
                    isShowOutLabel={true}
                    type='month'
                    value={month}
                    onChange={handleMonth}
                />
                <Input
                    name="fromDate"
                    label="From Date"
                    isShowOutLabel={true}
                    type='date'
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={handleFromDate}
                />
                <Input
                    name="toDate"
                    label="To Date"
                    isShowOutLabel={true}
                    type='date'
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={handleToDate}
                />

                <button
                    type='button'
                    onClick={() => fetchDetail()}
                    title='Refresh'
                    className='border p-2 hover:bg-gray-100 rounded-lg text-gray-400'
                >
                    <RefreshCcw className={loading ? 'animate-spin' : ''} />
                </button>

                {hasFilter && (
                    <button
                        type='button'
                        onClick={clearFilters}
                        title='Clear filters'
                        className='border p-2 hover:bg-gray-100 rounded-lg text-gray-400'
                    >
                        <X />
                    </button>
                )}
            </div>

            {/* quick filters */}
            <div className='flex flex-wrap items-center gap-2 mb-3'>
                <span className='text-xs uppercase tracking-wider text-gray-400 font-medium'>
                    Quick:
                </span>
                {PRESET_BUTTONS.map(({ id, label }) => {
                    const isActive = activePreset === id;
                    return (
                        <button
                            key={id}
                            type='button'
                            onClick={() => applyPreset(id)}
                            className={`px-3 py-1.5 text-sm rounded-full border transition-colors duration-150 ${
                                isActive
                                    ? 'bg-green-500 border-green-500 text-white'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>

            {error && <p className='text-sm text-red-500 mb-2'>{error}</p>}

            <div className={`grid grid-cols-1 sm:grid-cols-2 ${GRID_COLS[orderType]} gap-4`}>
                {fields.map((f) => {
                    const value = Number(detailData[f.key]?.[f.field] ?? 0);
                    return (
                        <div
                            key={f.key}
                            className={`${bgColor} ${height} border-l-4 border-l-green-500 rounded-md shadow-sm hover:shadow-md transition-shadow duration-200 p-5 ${loading ? 'opacity-60' : ''}`}
                        >
                            <p className={`text-[11px] uppercase tracking-wider ${color} font-medium mb-2`}>{f.label}</p>
                            <p className={`text-xl font-semibold ${color} tabular-nums`}>
                                {value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TotalSummary;