import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import {
    Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight,
    List, Table as TableIcon, CalendarDays, Trash2, Rows3, Columns3,
    Undo2, Redo2, Save, Send, ArrowLeft, Eye,
} from 'lucide-react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';

// ───────────────────────── config ─────────────────────────
const LIST_PATH = '/debit-notes';
const viewPath = (id) => `/debit-notes/${id}/view`;

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

// "YYYY-MM-DD" (from <input type="date">) -> dd/mm/yyyy
const formatPicked = (value) => {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
};

// Tailwind classes applied to the editable area (ProseMirror) itself.
// Tailwind's preflight strips default styles from p/h2/ul/table, so they are restored here.
const EDITOR_CLASS = [
    'outline-none min-h-[260mm]',
    // text blocks
    '[&_p]:mb-1.5 [&_p]:min-h-[1em]',
    '[&_h2]:text-[22px] [&_h2]:font-bold [&_h2]:mb-3',
    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-1.5',
    // table
    '[&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:my-2 [&_table]:overflow-hidden',
    '[&_td]:relative [&_td]:border [&_td]:border-gray-800 [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_td]:min-w-[40px] [&_td]:box-border',
    '[&_th]:relative [&_th]:border [&_th]:border-gray-800 [&_th]:px-2 [&_th]:py-1.5 [&_th]:align-top [&_th]:min-w-[40px] [&_th]:box-border',
    '[&_th]:bg-gray-100 [&_th]:font-bold [&_th]:text-left',
    // selected cells + column resize handle (added by TipTap)
    '[&_.selectedCell]:bg-green-100',
    '[&_.column-resize-handle]:absolute [&_.column-resize-handle]:-right-0.5 [&_.column-resize-handle]:top-0 [&_.column-resize-handle]:-bottom-0.5 [&_.column-resize-handle]:w-1 [&_.column-resize-handle]:bg-green-500 [&_.column-resize-handle]:pointer-events-none',
    '[&.resize-cursor]:cursor-col-resize',
].join(' ');

// ───────────────────────── small UI pieces ─────────────────────────
// When the note can't be edited, every toolbar button is disabled.
const LockContext = createContext(false);

const Btn = ({ onClick, active, disabled, title, children, ignoreLock = false, tone = 'default' }) => {
    const locked = useContext(LockContext);
    const isDisabled = disabled || (locked && !ignoreLock);

    const toneClass = active
        ? 'bg-green-500 border-green-500 text-white'
        : tone === 'primary'
            ? 'bg-green-600 border-green-600 text-white hover:bg-green-700'
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
const EditDebitNote = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const axiosSecure = useAxiosPrivate();

    const [rows, setRows] = useState(4);
    const [cols, setCols] = useState(5);
    const [pickedDate, setPickedDate] = useState('');

    const [title, setTitle] = useState('');
    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false); // unsaved changes
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

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
        editable: false, // switched on below once the server says this user may edit
        editorProps: {
            attributes: { class: EDITOR_CLASS },
        },
        onUpdate: () => setDirty(true),
        // v3 doesn't re-render on every change by default; the toolbar needs it
        shouldRerenderOnTransaction: true,
    });

    const status = note?.status;
    const canEdit = Boolean(note?.permissions?.canEdit);
    const canSubmit = Boolean(note?.permissions?.canSubmit);
    const locked = !canEdit; // also true while the note is still loading

    // load the note
    useEffect(() => {
        if (!editor) return;

        const controller = new AbortController();
        (async () => {
            setLoading(true);
            setError('');
            setMessage('');
            setNote(null);
            try {
                const res = await axiosSecure.get(`/api/debit-notes/${id}`, {
                    signal: controller.signal,
                });
                setNote(res.data);
                setTitle(res.data.title);
                editor.commands.setContent(res.data.content);
                setDirty(false); // loading the content is not a user change
            } catch (err) {
                if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
                console.error('Failed to load debit note', err);
                setError(err?.response?.data?.message || 'Failed to load debit note');
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        })();

        return () => controller.abort();
    }, [editor, id, axiosSecure]);

    // only editable when the server allows it (creator + Draft/Rejected)
    useEffect(() => {
        if (editor) editor.setEditable(canEdit);
    }, [editor, canEdit]);

    // warn before closing the tab with unsaved changes
    useEffect(() => {
        if (!dirty) return;
        const handler = (e) => {
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

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

    // ───────── server actions ─────────
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

    // saves the title + document; returns the saved note
    const persist = async () => {
        const cleanTitle = title.trim();
        if (!cleanTitle) throw new Error('Please enter a title (party name) before saving');

        const res = await axiosSecure.put(`/api/debit-notes/${id}`, {
            title: cleanTitle,
            content: editor.getHTML(),
        });
        setNote(res.data);
        setTitle(res.data.title);
        setDirty(false);
        return res.data;
    };

    const handleSave = () =>
        run(async () => {
            await persist();
        }, 'Changes saved');

    const handleSubmit = () => {
        if (!window.confirm('Submit this debit note for approval? It will be locked while it is pending.')) return;
        run(async () => {
            await persist(); // always save the latest text first
            await axiosSecure.post(`/api/debit-notes/${id}/submit`);
            navigate(viewPath(id), { replace: true }); // it is locked now, so show the read-only page
        });
    };

    const leave = (path) => {
        if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
        navigate(path);
    };

    const lockedReason = !note
        ? ''
        : status === 'PENDING'
            ? 'Waiting for approval. Editing is locked.'
            : status === 'APPROVED'
                ? 'Approved. This debit note is locked.'
                : 'Only the creator can edit this debit note.';

    return (
        <div className="bg-gray-100 min-h-screen p-4">
            {/* ───────── header ───────── */}
            <div className=" mx-auto mb-3 bg-white border rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => leave(LIST_PATH)}
                        className="p-2 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100"
                        title="Back to list"
                    >
                        <ArrowLeft size={16} />
                    </button>

                    <input
                        type="text"
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value);
                            setDirty(true);
                        }}
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
                    {status && (
                        <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                                STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT
                            }`}
                        >
                            {status}
                        </span>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                    {canEdit && (
                        <Btn ignoreLock title="Save changes" onClick={handleSave} disabled={busy || !dirty}>
                            <Save size={16} /> Save
                        </Btn>
                    )}
                    {canSubmit && (
                        <Btn ignoreLock tone="primary" title="Save and send for approval" onClick={handleSubmit} disabled={busy}>
                            <Send size={16} /> Submit for approval
                        </Btn>
                    )}
                    <Btn ignoreLock title="Open the read-only page" onClick={() => leave(viewPath(id))} disabled={busy}>
                        <Eye size={16} /> View
                    </Btn>

                    {busy && <span className="text-sm text-gray-400">Working…</span>}
                    {loading && <span className="text-sm text-gray-400">Loading…</span>}
                    {dirty && !busy && <span className="text-sm text-amber-600">Unsaved changes</span>}
                </div>

                {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
                {message && !error && <p className="text-sm text-green-600 mt-3">{message}</p>}
                {lockedReason && <p className="text-sm text-gray-500 mt-3">{lockedReason}</p>}

                {status === 'REJECTED' && note?.reviewRemark && (
                    <div className="mt-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md p-3">
                        <strong>Rejected:</strong> {note.reviewRemark}
                        <span className="block text-red-500 mt-1">
                            Make the changes, then submit it for approval again.
                        </span>
                    </div>
                )}
            </div>

            <LockContext.Provider value={locked}>
                {/* ───────── toolbar ───────── */}
                <div className=" mx-auto mb-3 bg-white border rounded-lg p-2 flex flex-wrap items-center gap-1 sticky top-0 z-10">
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
                <div className=" mx-auto mb-3 bg-white border rounded-lg p-2 flex flex-wrap items-center gap-1">
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
                </div>
            </LockContext.Provider>

            {/* ───────── A4 page ───────── */}
            <div className=" mx-auto bg-white shadow-md p-[15mm] text-[14px] text-black">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
};

export default EditDebitNote;