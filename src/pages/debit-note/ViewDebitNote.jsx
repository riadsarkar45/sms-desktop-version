import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import {
    Table,
    TableRow,
    TableHeader,
    TableCell,
} from '@tiptap/extension-table';
import {
    ArrowLeft,
    Pencil,
    Printer,
    CheckCircle2,
    XCircle,
    X,
    LoaderCircle,
    Check,
} from 'lucide-react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';


// ───────────────────────── CONFIG ─────────────────────────

const LIST_PATH = '/debit-notes';

const editPath = (id) => `/dashboard/edit-debit-notes/${id}`;

const PRINT_ONLY_WHEN_APPROVED = true;

const STATUS_STYLE = {
    DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
    PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
    APPROVED: 'bg-green-100 text-green-800 border-green-300',
    REJECTED: 'bg-red-100 text-red-700 border-red-300',
};

const VIEW_CLASS = [
    'outline-none',
    '[&_p]:mb-1.5 [&_p]:min-h-[1em]',
    '[&_h2]:text-[22px] [&_h2]:font-bold [&_h2]:mb-3',
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-1.5',
    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-1.5',
    '[&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:my-2 [&_table]:overflow-hidden',
    '[&_td]:relative [&_td]:border [&_td]:border-gray-800 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:min-w-[40px] [&_td]:box-border',
    '[&_th]:relative [&_th]:border [&_th]:border-gray-800 [&_th]:px-2 [&_th]:py-1.5 [&_th]:align-top [&_th]:min-w-[40px] [&_th]:box-border',
    '[&_th]:bg-gray-100 [&_th]:font-bold [&_th]:text-left',
].join(' ');

// ───────────────────────── HELPERS ─────────────────────────

const pad = (n) => String(n).padStart(2, '0');

const formatDate = (iso) => {
    if (!iso) return '-';

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) return '-';

    return `${pad(date.getDate())}/${pad(
        date.getMonth() + 1
    )}/${date.getFullYear()}`;
};

const formatDateTime = (iso) => {
    if (!iso) return '-';

    const date = new Date(iso);

    if (Number.isNaN(date.getTime())) return '-';

    return `${formatDate(iso)} ${pad(date.getHours())}:${pad(
        date.getMinutes()
    )}`;
};

// ───────────────────────── INFO ─────────────────────────

const Info = ({ label, value }) => (
    <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">
            {label}
        </p>

        <p className="text-sm text-gray-800 break-words">
            {value || '-'}
        </p>
    </div>
);

// ───────────────────────── TOAST ─────────────────────────

const Toast = ({ toast, onClose }) => {
    if (!toast) return null;

    const isSuccess = toast.type === 'success';

    return (
        <div
            role={isSuccess ? 'status' : 'alert'}
            aria-live={isSuccess ? 'polite' : 'assertive'}
            className={`fixed top-5 right-5 z-[100] w-[calc(100%-2.5rem)] sm:w-[380px]
                rounded-xl border shadow-xl p-4 flex items-start gap-3
                animate-in slide-in-from-top-2 duration-200
                ${
                    isSuccess
                        ? 'bg-white border-green-200'
                        : 'bg-white border-red-200'
                }`}
        >
            <div
                className={`shrink-0 rounded-full p-2 ${
                    isSuccess
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                }`}
            >
                {isSuccess ? (
                    <CheckCircle2 size={21} />
                ) : (
                    <XCircle size={21} />
                )}
            </div>

            <div className="flex-1 min-w-0 pt-0.5">
                <p
                    className={`font-semibold text-sm ${
                        isSuccess ? 'text-green-800' : 'text-red-800'
                    }`}
                >
                    {isSuccess ? 'Success' : 'Something went wrong'}
                </p>

                <p className="text-sm text-gray-600 mt-1 break-words">
                    {toast.message}
                </p>
            </div>

            <button
                type="button"
                onClick={onClose}
                className="shrink-0 text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100"
                aria-label="Close notification"
            >
                <X size={17} />
            </button>
        </div>
    );
};

// ───────────────────────── COMPONENT ─────────────────────────

const ViewDebitNote = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const axiosSecure = useAxiosPrivate();

    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [approving, setApproving] = useState(false);
    const [toast, setToast] = useState(null);

    // Read-only editor
    const editor = useEditor({
        extensions: [
            StarterKit,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Table.configure({
                resizable: false,
            }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: '',
        editable: false,
        editorProps: {
            attributes: {
                class: VIEW_CLASS,
            },
        },
    });

    // ───────────────────── LOAD NOTE ─────────────────────

    useEffect(() => {
        const controller = new AbortController();

        const loadNote = async () => {
            setLoading(true);
            setError('');
            setNote(null);

            try {
                const response = await axiosSecure.get(
                    `/api/debit-notes/${id}`,
                    {
                        signal: controller.signal,
                    }
                );

                // Supports either { data: note } or a direct note response.
                const result = response.data?.data ?? response.data;

                setNote(result);
            } catch (err) {
                if (
                    err?.code === 'ERR_CANCELED' ||
                    err?.name === 'CanceledError'
                ) {
                    return;
                }

                console.error('Failed to load debit note:', err);

                setError(
                    err?.response?.data?.message ||
                        'Failed to load Debit Note. Please try again.'
                );
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        loadNote();

        return () => controller.abort();
    }, [axiosSecure, id]);

    // ───────────────────── RENDER SAVED CONTENT ─────────────────────

    useEffect(() => {
        if (editor && note) {
            editor.commands.setContent(note.content || '');
        }
    }, [editor, note]);

    // ───────────────────── APPROVE DEBIT NOTE ─────────────────────

    const handleDebitNoteApproval = async () => {
        if (!note?.id || approving) return;

        if (note.status !== 'PENDING') {
            setToast({
                type: 'error',
                message: 'Only pending Debit Notes can be approved.',
            });

            return;
        }

        setApproving(true);
        setToast(null);

        try {
            const response = await axiosSecure.put(
                `/api/approve-debit-note/${note.id}`
            );

            const responseData = response.data?.data ?? response.data;

            // Update the current note immediately when the API returns it.
            if (
                responseData &&
                typeof responseData === 'object' &&
                responseData.id
            ) {
                setNote((previous) => ({
                    ...previous,
                    ...responseData,
                }));
            } else {
                // The endpoint may return only a success message.
                // Reload the note to obtain the updated status and approver.
                const refreshResponse = await axiosSecure.get(
                    `/api/debit-notes/${note.id}`
                );

                setNote(
                    refreshResponse.data?.data ?? refreshResponse.data
                );
            }

            setToast({
                type: 'success',
                message:
                    response.data?.message ||
                    'Debit Note approved successfully.',
            });
        } catch (err) {
            console.error('Failed to approve debit note:', err);

            setToast({
                type: 'error',
                message:
                    err?.response?.data?.message ||
                    'Failed to approve Debit Note. Please try again.',
            });
        } finally {
            setApproving(false);
        }
    };

    // ───────────────────── RENDER GUARDS ─────────────────────

    if (!editor) return null;

    const status = note?.status;

    const printDisabled =
        PRINT_ONLY_WHEN_APPROVED && status !== 'APPROVED';

    // ───────────────────── UI ─────────────────────

    return (
        <div className="bg-gray-100 min-h-screen p-4 print:bg-white print:p-0 print:min-h-0">
            <Toast
                toast={toast}
                onClose={() => setToast(null)}
            />

            <style>{`
                @page {
                    size: A4;
                    margin: 12mm;
                }

                @media print {
                    body * {
                        visibility: hidden;
                    }

                    #debit-note-view,
                    #debit-note-view * {
                        visibility: visible;
                    }

                    #debit-note-view {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                    }
                }
            `}</style>

            {/* ───────────────── HEADER ───────────────── */}

            <div className="mx-auto mb-3 bg-white border border-gray-200 rounded-xl p-4 print:hidden">
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(LIST_PATH)}
                        className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                        title="Back to list"
                        aria-label="Back to list"
                    >
                        <ArrowLeft size={17} />
                    </button>

                    <div className="mr-auto min-w-0">
                        <h1 className="text-base font-semibold text-gray-900 truncate">
                            {note ? note.title : 'Debit Note'}
                        </h1>

                        {note && (
                            <p className="text-xs text-gray-500 tabular-nums mt-1">
                                {note.noteNo ?? `#${note.id}`}
                            </p>
                        )}
                    </div>

                    {status && (
                        <span
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
                                STATUS_STYLE[status] ??
                                STATUS_STYLE.DRAFT
                            }`}
                        >
                            {status}
                        </span>
                    )}

                    {/* Approve button */}
                    {status === 'PENDING' && (
                        <button
                            type="button"
                            onClick={handleDebitNoteApproval}
                            disabled={approving || loading}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                            {approving ? (
                                <>
                                    <LoaderCircle
                                        size={16}
                                        className="animate-spin"
                                    />
                                    Approving...
                                </>
                            ) : (
                                <>
                                    <Check size={16} />
                                    Approve
                                </>
                            )}
                        </button>
                    )}

                    {/* Edit */}
                    {note?.permissions?.canEdit && (
                        <button
                            type="button"
                            onClick={() => navigate(editPath(note.id))}
                            className="inline-flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <Pencil size={16} />
                            Edit
                        </button>
                    )}

                    {/* Print */}
                    <button
                        type="button"
                        disabled={!note || printDisabled}
                        onClick={() => window.print()}
                        title={
                            printDisabled
                                ? 'Available after approval'
                                : 'Print / Save as PDF'
                        }
                        className={`inline-flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-colors ${
                            !note || printDisabled
                                ? 'border-gray-200 text-gray-400 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        <Printer size={16} />
                        Print / PDF
                    </button>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500 mt-4">
                        <LoaderCircle
                            size={15}
                            className="animate-spin"
                        />
                        Loading Debit Note...
                    </div>
                )}

                {/* Load error */}
                {!loading && error && (
                    <div className="flex items-start gap-2 mt-4 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                        <XCircle
                            size={17}
                            className="shrink-0 mt-0.5"
                        />

                        <div className="flex-1">{error}</div>

                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="font-semibold underline underline-offset-2"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Metadata */}
                {note && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4 pt-4 border-t border-gray-100">
                        <Info
                            label="Created by"
                            value={
                                note.creator?.name ??
                                note.user?.name ??
                                '-'
                            }
                        />

                        <Info
                            label="Created"
                            value={formatDateTime(note.createdAt)}
                        />

                        <Info
                            label="Submitted"
                            value={formatDateTime(note.submittedAt)}
                        />

                        <Info
                            label="Last updated"
                            value={formatDateTime(note.updatedAt)}
                        />

                        {status === 'APPROVED' && (
                            <>
                                <Info
                                    label="Approved by"
                                    value={
                                        note.approver?.name ??
                                        note.approvedByUser?.name ??
                                        '-'
                                    }
                                />

                                <Info
                                    label="Approved at"
                                    value={formatDateTime(
                                        note.approvedAt
                                    )}
                                />
                            </>
                        )}
                    </div>
                )}

                {/* Rejection remark */}
                {status === 'REJECTED' && note?.reviewRemark && (
                    <div className="mt-4 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">
                        <strong>Rejected:</strong>{' '}
                        {note.reviewRemark}
                    </div>
                )}

                {/* Pending information */}
                {status === 'PENDING' && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        Waiting for approval.
                    </div>
                )}

                {/* Approved information */}
                {status === 'APPROVED' && (
                    <div className="flex items-center gap-2 text-sm text-green-700 mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
                        <CheckCircle2
                            size={17}
                            className="shrink-0"
                        />
                        This Debit Note has been approved.
                    </div>
                )}
            </div>

            {/* ───────────────── A4 DOCUMENT ───────────────── */}

            {!loading && !error && note && (
                <div
                    id="debit-note-view"
                    className="mx-auto bg-white shadow-md p-[15mm] text-[14px] text-black print:shadow-none print:p-0 print:max-w-none [print-color-adjust:exact]"
                >
                    <EditorContent editor={editor} />

                    {status === 'APPROVED' && (
                        <div className="mt-6 pt-3 border-t border-gray-400 text-xs text-gray-700">
                            <div className="flex flex-wrap justify-between gap-3">
                                <span>
                                    Approved
                                    {note.noteNo
                                        ? ` · ${note.noteNo}`
                                        : ''}
                                </span>

                                <span>
                                    {note.approver?.name
                                        ? `Approved by: ${note.approver.name}`
                                        : ''}
                                </span>
                            </div>

                            {note.approvedAt && (
                                <p className="mt-1">
                                    Approval date:{' '}
                                    {formatDateTime(note.approvedAt)}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ViewDebitNote;
