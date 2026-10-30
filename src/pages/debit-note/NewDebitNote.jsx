import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import {
    Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight,
    List, Table as TableIcon, CalendarDays, Printer, FileText, Trash2,
    Rows3, Columns3, Undo2, Redo2, Save, Send, Check, X as XIcon, ArrowLeft,
} from 'lucide-react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

// ───────────────────────── config ─────────────────────────
// true = Print / PDF is enabled only after the note is approved
const PRINT_ONLY_WHEN_APPROVED = true;

// permissions for a note that has not been saved yet
const NEW_PERMISSIONS = { canEdit: true, canSubmit: true, canReview: false, canDelete: false };

const STATUS_STYLE = {
    DRAFT: 'bg-gray-100 text-gray-700 border-gray-300',
    PENDING: 'bg-amber-100 text-amber-800 border-amber-300',
    APPROVED: 'bg-green-100 text-green-800 border-green-300',
    REJECTED: 'bg-red-100 text-red-700 border-red-300',
};

// ───────────────────────── helpers ─────────────────────────
const pad = (n) => String(n).padStart(2, '0');

// local date -> dd/mm/yyyy (uses local parts, so no UTC day shift)
const formatToday = () => {
    const d = new Date();
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// ISO string from the API -> dd/mm/yyyy (local)
const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// "YYYY-MM-DD" (from <input type="date">) -> dd/mm/yyyy
const formatPicked = (value) => {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
};

// a function (not a constant) so the date is always today's date
const buildTemplate = () => `
<h2 style="text-align:center">DEBIT NOTE</h2>
<p><strong>Debit Note No:</strong> </p>
<p><strong>Date:</strong> ${formatToday()}</p>
<p><strong>To:</strong> </p>
<p><strong>Ref (Job / PO / Invoice):</strong> </p>
<p></p>
<table>
  <tbody>
    <tr>
      <th>SL</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th>
    </tr>
    <tr><td>1</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>2</td><td></td><td></td><td></td><td></td></tr>
    <tr><td>3</td><td></td><td></td><td></td><td></td></tr>
    <tr><td></td><td><strong>Total</strong></td><td></td><td></td><td></td></tr>
  </tbody>
</table>
<p></p>
<p><strong>Reason / Remarks:</strong> </p>
<p></p>
<p></p>
<p>Prepared by: ____________________ &nbsp;&nbsp;&nbsp;&nbsp; Authorized by: ____________________</p>
`;

// Tailwind classes applied to the editable area (ProseMirror) itself.
// Tailwind's preflight strips default styles from p/h2/ul/table, so they are restored here.
const EDITOR_CLASS = [
    'outline-none min-h-[260mm] print:min-h-0',
    // text blocks
    '[&_p]:mb-1.5',
    '[&_h2]:text-[22px] [&_h2]:font-bold [&_h2]:mb-3',
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-1.5',
    // table
    '[&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:my-2 [&_table]:overflow-hidden',
    '[&_td]:relative [&_td]:border [&_td]:border-gray-800 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:min-w-[40px] [&_td]:box-border',
    '[&_th]:relative [&_th]:border [&_th]:border-gray-800 [&_th]:px-2 [&_th]:py-1.5 [&_th]:align-top [&_th]:min-w-[40px] [&_th]:box-border',
    '[&_th]:bg-gray-100 [&_th]:font-bold [&_th]:text-left',
    // selected cells + column resize handle (added by TipTap)
    '[&_.selectedCell]:bg-green-100 print:[&_.selectedCell]:bg-transparent',
    '[&_.column-resize-handle]:absolute [&_.column-resize-handle]:-right-0.5 [&_.column-resize-handle]:top-0 [&_.column-resize-handle]:-bottom-0.5 [&_.column-resize-handle]:w-1 [&_.column-resize-handle]:bg-green-500 [&_.column-resize-handle]:pointer-events-none',
    '[&.resize-cursor]:cursor-col-resize',
].join(' ');

// ───────────────────────── small UI pieces ─────────────────────────
// When the note is locked (pending / approved / not yours) every toolbar button is disabled.
const LockContext = createContext(false);

const Btn = ({ onClick, active, disabled, title, children, ignoreLock = false, tone = 'default' }) => {
    const locked = useContext(LockContext);
    const isDisabled = disabled || (locked && !ignoreLock);

    const toneClass = active
        ? 'bg-green-500 border-green-500 text-white'
        : tone === 'primary'
            ? 'bg-green-600 border-green-600 text-white hover:bg-green-700'
            : tone === 'danger'
                ? 'border-red-300 text-red-600 hover:bg-red-50'
                : 'border-gray-200 text-gray-600 hover:bg-gray-100';

    return (
        <button
            type="button"
            title={title}
            disabled={isDisabled}
            // onMouseDown + preventDefault keeps the text selection/cursor in the editor
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={`p-2 rounded-md border text-sm flex items-center gap-1 transition-colors ${toneClass}
                ${isDisabled ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
        >
            {children}
        </button>
    );
};

const Divider = () => <span className="w-px h-6 bg-gray-300 mx-1" />;

// ───────────────────────── component ─────────────────────────
const DebitNote = () => {
    const { id } = useParams(); // undefined on /debit-notes/new
    const navigate = useNavigate();
    const axiosSecure = useAxiosPrivate();

    const [rows, setRows] = useState(4);
    const [cols, setCols] = useState(5);
    const [pickedDate, setPickedDate] = useState('');

    const [title, setTitle] = useState('');
    const [note, setNote] = useState(null); // the saved note from the API (null = new, unsaved)
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [rejectOpen, setRejectOpen] = useState(false);
    const [remark, setRemark] = useState('');

    const noteIdRef = useRef(null); // id of the note currently open in the editor

    const editor = useEditor({
        extensions: [
            StarterKit, // v3: already includes Underline
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
        ],
        content: '',
        editorProps: {
            attributes: { class: EDITOR_CLASS },
        },
        // v3 doesn't re-render on every change by default; the toolbar needs it
        shouldRerenderOnTransaction: true,
    });

    const perms = note?.permissions ?? NEW_PERMISSIONS;
    const status = note?.status ?? 'DRAFT';
    const locked = !perms.canEdit;

    // load the note (or start a new one from the template)
    useEffect(() => {
        if (!editor) return;

        if (!id) {
            noteIdRef.current = null;
            setNote(null);
            setTitle('');
            setError('');
            setMessage('');
            editor.commands.setContent(buildTemplate());
            return;
        }

        // we just created / saved this note ourselves, no need to reload it
        if (String(noteIdRef.current) === String(id)) return;

        const controller = new AbortController();
        (async () => {
            setLoading(true);
            setError('');
            try {
                const res = await axiosSecure.get(`/api/debit-notes/${id}`, {
                    signal: controller.signal,
                });
                noteIdRef.current = res.data.id;
                setNote(res.data);
                setTitle(res.data.title);
                editor.commands.setContent(res.data.content);
            } catch (err) {
                if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
                setError(err?.response?.data?.message || 'Failed to load debit note');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();

        return () => controller.abort();
    }, [editor, id, axiosSecure]);

    // lock the editor itself when the note can't be edited
    useEffect(() => {
        if (editor) editor.setEditable(!locked);
    }, [editor, locked]);

    if (!editor) return null;

    // ───────── editor actions ─────────
    const inTable = editor.isActive('table');

    const insertText = (text) => editor.chain().focus().insertContent(text).run();

    const insertTable = () => {
        const r = Math.min(Math.max(Number(rows) || 1, 1), 30);
        const c = Math.min(Math.max(Number(cols) || 1, 1), 10);
        editor.chain().focus().insertTable({ rows: r, cols: c, withHeaderRow: true }).run();
    };

    const insertPickedDate = () => {
        if (!pickedDate) return;
        insertText(formatPicked(pickedDate));
        setPickedDate('');
    };

    const loadTemplate = () => {
        if (window.confirm('Replace everything with the blank debit note template?')) {
            editor.commands.setContent(buildTemplate());
        }
    };

    const clearAll = () => {
        if (window.confirm('Clear the whole document?')) {
            editor.commands.clearContent();
        }
    };

    // ───────── server actions ─────────
    // shows the busy state and any error from the API
    const run = async (fn, successMessage) => {
        setBusy(true);
        setError('');
        setMessage('');
        try {
            await fn();
            if (successMessage) setMessage(successMessage);
        } catch (err) {
            setError(err?.response?.data?.message || err?.message || 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };

    // keeps the editor content as is (no setContent), so the cursor doesn't jump after saving
    const applyNote = (data) => {
        const wasNew = !noteIdRef.current;
        noteIdRef.current = data.id;
        setNote(data);
        setTitle(data.title);
        if (wasNew) navigate(`/debit-notes/${data.id}`, { replace: true });
    };

    // create or update; returns the saved note
    const persist = async () => {
        const cleanTitle = title.trim();
        if (!cleanTitle) throw new Error('Please enter a title (party name) before saving');

        const payload = { title: cleanTitle, content: editor.getHTML() };
        const res = noteIdRef.current
            ? await axiosSecure.put(`/api/debit-notes/${noteIdRef.current}`, payload)
            : await axiosSecure.post('/api/debit-notes', payload);
        return res.data;
    };

    const handleSave = () =>
        run(async () => {
            applyNote(await persist());
        }, 'Saved');

    // const handleSubmit = () => {
    //     if (!window.confirm('Submit this debit note for approval? It will be locked while it is pending.')) return;
    //     run(async () => {
    //         const saved = await persist(); // always save the latest text first
    //         applyNote(saved);
    //         const res = await axiosSecure.post(`/api/debit-notes/${saved.id}/submit`);
    //         applyNote(res.data);
    //     }, 'Submitted for approval');
    // };

    const handleApprove = () => {
        if (!window.confirm('Approve this debit note? It will be locked permanently.')) return;
        run(async () => {
            const res = await axiosSecure.post(`/api/debit-notes/${noteIdRef.current}/approve`);
            applyNote(res.data);
        }, 'Approved');
    };

    const handleReject = () =>
        run(async () => {
            const res = await axiosSecure.post(`/api/debit-notes/${noteIdRef.current}/reject`, {
                remark: remark.trim(),
            });
            applyNote(res.data);
            setRejectOpen(false);
            setRemark('');
        }, 'Rejected and sent back to the creator');

    const handleDelete = () => {
        if (!window.confirm('Delete this debit note? This cannot be undone.')) return;
        run(async () => {
            await axiosSecure.delete(`/api/debit-notes/${noteIdRef.current}`);
            navigate('/debit-notes');
        });
    };

    const lockedReason = !locked
        ? ''
        : status === 'PENDING'
            ? 'Waiting for approval. Editing is locked.'
            : status === 'APPROVED'
                ? 'Approved. This debit note is locked.'
                : 'You can view this debit note but not edit it.';

    const printDisabled = PRINT_ONLY_WHEN_APPROVED && status !== 'APPROVED';

    return (
        <div className="bg-gray-100 min-h-screen p-4 print:bg-white print:p-0 print:min-h-0">
            {/*
              Tailwind has no utility for @page or for hiding the rest of the app while printing,
              so this is the only raw CSS: A4 paper size + show only the debit note page.
            */}
            <style>{`
                @page { size: A4; margin: 12mm; }
                @media print {
                    body * { visibility: hidden; }
                    #debit-note-page, #debit-note-page * { visibility: visible; }
                    #debit-note-page { position: absolute; left: 0; top: 0; width: 100%; }
                }
            `}</style>

            {/* ───────── approval bar ───────── */}
            <div className=" mx-auto mb-3 bg-white border rounded-lg p-3 print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate('/debit-notes')}
                        className="p-2 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
                        title="Back to list"
                    >
                        <ArrowLeft size={16} />
                    </button>

                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={locked}
                        maxLength={150}
                        placeholder="Title / Party name (shown in the list)"
                        className="flex-1 min-w-[220px] border rounded-md px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
                    />

                    {note && (
                        <span className="text-sm text-gray-500 tabular-nums">
                            {note.noteNo ?? `#${note.id}`}
                        </span>
                    )}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLE[status]}`}>
                        {status}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                    {perms.canEdit && (
                        <Btn ignoreLock title="Save as draft" onClick={handleSave} disabled={busy}>
                            <Save size={16} /> Save
                        </Btn>
                    )}
                    
                    {perms.canReview && (
                        <>
                            <Btn ignoreLock tone="primary" title="Approve" onClick={handleApprove} disabled={busy}>
                                <Check size={16} /> Approve
                            </Btn>
                            <Btn ignoreLock tone="danger" title="Reject with a reason" onClick={() => setRejectOpen((v) => !v)} disabled={busy}>
                                <XIcon size={16} /> Reject
                            </Btn>
                        </>
                    )}
                    {perms.canDelete && note && (
                        <Btn ignoreLock tone="danger" title="Delete" onClick={handleDelete} disabled={busy}>
                            <Trash2 size={16} /> Delete
                        </Btn>
                    )}
                    {busy && <span className="text-sm text-gray-400">Working…</span>}
                    {loading && <span className="text-sm text-gray-400">Loading…</span>}
                </div>

                {rejectOpen && perms.canReview && (
                    <div className="mt-3 flex flex-col gap-2">
                        <textarea
                            value={remark}
                            onChange={(e) => setRemark(e.target.value)}
                            rows={3}
                            maxLength={500}
                            placeholder="Reason for rejection (the creator will see this)"
                            className="border rounded-md px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                            <Btn
                                ignoreLock
                                tone="danger"
                                title="Confirm rejection"
                                onClick={handleReject}
                                disabled={busy || remark.trim().length < 3}
                            >
                                Confirm reject
                            </Btn>
                            <Btn ignoreLock title="Cancel" onClick={() => { setRejectOpen(false); setRemark(''); }}>
                                Cancel
                            </Btn>
                        </div>
                    </div>
                )}

                {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
                {message && !error && <p className="text-sm text-green-600 mt-3">{message}</p>}
                {lockedReason && <p className="text-sm text-gray-500 mt-3">{lockedReason}</p>}

                {status === 'REJECTED' && note?.reviewRemark && (
                    <div className="mt-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md p-3">
                        <strong>Rejected{note.reviewer ? ` by ${note.reviewer.name}` : ''}:</strong>{' '}
                        {note.reviewRemark}
                    </div>
                )}
            </div>

            <LockContext.Provider value={locked}>
                {/* ───────── toolbar ───────── */}
                <div className=" mx-auto mb-3 bg-white border rounded-lg p-2 flex flex-wrap items-center gap-1 sticky top-0 z-10 print:hidden">
                    <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
                        <Undo2 size={16} />
                    </Btn>
                    <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
                        <Redo2 size={16} />
                    </Btn>

                    <Divider />

                    <Btn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
                        <Bold size={16} />
                    </Btn>
                    <Btn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
                        <Italic size={16} />
                    </Btn>
                    <Btn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
                        <UnderlineIcon size={16} />
                    </Btn>
                    <Btn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
                        <List size={16} />
                    </Btn>

                    <Divider />

                    <Btn title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
                        <AlignLeft size={16} />
                    </Btn>
                    <Btn title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
                        <AlignCenter size={16} />
                    </Btn>
                    <Btn title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
                        <AlignRight size={16} />
                    </Btn>

                    <Divider />

                    {/* date at cursor */}
                    <Btn title="Insert today's date at the cursor" onClick={() => insertText(formatToday())}>
                        <CalendarDays size={16} /> Today
                    </Btn>
                    <input
                        type="date"
                        value={pickedDate}
                        onChange={(e) => setPickedDate(e.target.value)}
                        disabled={locked}
                        className="border rounded-md px-2 py-1.5 text-sm text-gray-600 disabled:opacity-40"
                        title="Pick any date"
                    />
                    <Btn title="Insert the picked date at the cursor" onClick={insertPickedDate} disabled={!pickedDate}>
                        Insert date
                    </Btn>
                </div>

                {/* second row: table tools */}
                <div className=" mx-auto mb-3 bg-white border rounded-lg p-2 flex flex-wrap items-center gap-1 print:hidden">
                    <span className="text-xs uppercase tracking-wider text-gray-400 font-medium px-1">Table</span>
                    <input
                        type="number" min={1} max={30} value={rows}
                        onChange={(e) => setRows(e.target.value)}
                        disabled={locked}
                        className="border rounded-md w-14 px-2 py-1.5 text-sm disabled:opacity-40" title="Rows"
                    />
                    <span className="text-gray-400 text-sm">×</span>
                    <input
                        type="number" min={1} max={10} value={cols}
                        onChange={(e) => setCols(e.target.value)}
                        disabled={locked}
                        className="border rounded-md w-14 px-2 py-1.5 text-sm disabled:opacity-40" title="Columns"
                    />
                    <Btn title="Insert table at the cursor" onClick={insertTable}>
                        <TableIcon size={16} /> Insert table
                    </Btn>

                    <Divider />

                    <Btn title="Add row below" disabled={!inTable} onClick={() => editor.chain().focus().addRowAfter().run()}>
                        <Rows3 size={16} /> + Row
                    </Btn>
                    <Btn title="Add column to the right" disabled={!inTable} onClick={() => editor.chain().focus().addColumnAfter().run()}>
                        <Columns3 size={16} /> + Column
                    </Btn>
                    <Btn title="Delete current row" disabled={!inTable} onClick={() => editor.chain().focus().deleteRow().run()}>
                        <Rows3 size={16} /> − Row
                    </Btn>
                    <Btn title="Delete current column" disabled={!inTable} onClick={() => editor.chain().focus().deleteColumn().run()}>
                        <Columns3 size={16} /> − Column
                    </Btn>
                    <Btn title="Merge selected cells" disabled={!inTable} onClick={() => editor.chain().focus().mergeCells().run()}>
                        Merge
                    </Btn>
                    <Btn title="Split merged cell" disabled={!inTable} onClick={() => editor.chain().focus().splitCell().run()}>
                        Split
                    </Btn>
                    <Btn title="Delete whole table" disabled={!inTable} onClick={() => editor.chain().focus().deleteTable().run()}>
                        <Trash2 size={16} /> Table
                    </Btn>

                    <div className="ml-auto flex items-center gap-1">
                        <Btn title="Load blank debit note template" onClick={loadTemplate}>
                            <FileText size={16} /> Template
                        </Btn>
                        <Btn title="Clear document" onClick={clearAll}>
                            <Trash2 size={16} /> Clear
                        </Btn>
                        <Btn
                            ignoreLock
                            title={printDisabled ? 'Available after approval' : 'Print / Save as PDF'}
                            disabled={printDisabled}
                            onClick={() => window.print()}
                        >
                            <Printer size={16} /> Print / PDF
                        </Btn>
                    </div>
                </div>
            </LockContext.Provider>

            {/* ───────── A4 page ───────── */}
            <div
                id="debit-note-page"
                className=" mx-auto bg-white shadow-md p-[15mm] text-[14px] text-black print:shadow-none print:p-0 print:max-w-none [print-color-adjust:exact]"
            >
                <EditorContent editor={editor} />

                {status === 'APPROVED' && note?.reviewer && (
                    <div className="mt-6 pt-2 border-t border-gray-400 text-xs text-gray-700">
                        Approved by <strong>{note.reviewer.name}</strong> on {formatDate(note.reviewedAt)}
                        {note.noteNo ? ` · ${note.noteNo}` : ''}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DebitNote;