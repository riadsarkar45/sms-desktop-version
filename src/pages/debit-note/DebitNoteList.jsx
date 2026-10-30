import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  Plus,
  RefreshCcw,
  Download,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  FileText,
  Search,
  X,
} from 'lucide-react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';
import UseResponsibleUsers from '../../hooks/all-users/ResponsibleUsers';


const NEW_PATH = '/debit-note/create';
const PAGE_SIZE = 20;

const TABS = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const STATUS_STYLE = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

const pad = (value) => String(value).padStart(2, '0');

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
};

const normalizeStatus = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'PENDING_APPROVAL' || normalized === 'PENDING APPROVAL') {
    return 'PENDING';
  }
  return normalized;
};

const extractDebitNotes = (responseData) => {
  const candidates = [
    responseData?.debitNotes,
    responseData?.data?.debitNotes,
    responseData?.data?.data,
    responseData?.data,
    responseData?.results,
    responseData?.items,
    responseData,
  ];
  return candidates.find(Array.isArray) ?? [];
};

const Toast = ({ toast, onClose }) => {
  if (!toast) return null;

  const styles = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    info: 'bg-slate-800',
  };

  return (
    <div
      className={`fixed right-5 top-5 z-[100] flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-white shadow-xl ${styles[toast.type] || styles.info
        }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 size={18} />
      ) : toast.type === 'error' ? (
        <XCircle size={18} />
      ) : (
        <FileText size={18} />
      )}

      <span className="text-sm font-medium">{toast.message}</span>

      <button
        type="button"
        onClick={onClose}
        className="ml-2 rounded p-1 hover:bg-white/20"
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </div>
  );
};

const DebitNoteLists = () => {
  const axiosSecure = useAxiosPrivate();
  const navigate = useNavigate();
  const { allResponsibleUsers, setResponsibleSection, setUserResponsibility } = UseResponsibleUsers();

  // Safely extract array in case the hook returns { data: [...] }
  const usersArray = Array.isArray(allResponsibleUsers)
    ? allResponsibleUsers
    : (allResponsibleUsers?.data || []);

  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [allDebitNotes, setAllDebitNotes] = useState([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [requestingNoteId, setRequestingNoteId] = useState(null);

  // NEW: Track selected user per debit note ID
  const [selectedUserPerNote, setSelectedUserPerNote] = useState({});

  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    setUserResponsibility("responsibleForApprovalDebitNote");
    setResponsibleSection("debitNote")
  }, [setUserResponsibility, setResponsibleSection])

  useEffect(() => {
    const controller = new AbortController();

    const fetchDebitNotes = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await axiosSecure.get('/api/debit-notes', {
          params: {
            status: status === 'ALL' ? undefined : status,
            q: query || undefined,
            page,
            limit: PAGE_SIZE,
          },
          signal: controller.signal,
        });

        const responseData = response.data;
        const records = extractDebitNotes(responseData);

        setAllDebitNotes(records);

        const totalValue =
          responseData?.total ??
          responseData?.pagination?.total ??
          responseData?.data?.total;

        const totalPagesValue =
          responseData?.totalPages ??
          responseData?.pagination?.totalPages ??
          responseData?.data?.totalPages;

        setServerTotal(
          Number.isFinite(Number(totalValue))
            ? Number(totalValue)
            : records.length
        );

        setServerTotalPages(
          Number.isFinite(Number(totalPagesValue)) &&
            Number(totalPagesValue) > 0
            ? Number(totalPagesValue)
            : Math.max(1, Math.ceil(records.length / PAGE_SIZE))
        );
      } catch (err) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }

        setError(
          err.response?.data?.message ||
          err.message ||
          'Failed to load debit notes.'
        );

        setAllDebitNotes([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchDebitNotes();

    return () => controller.abort();
  }, [axiosSecure, status, query, page, reloadKey]);

  const changeTab = (nextStatus) => {
    setStatus(nextStatus);
    setPage(1);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    setQuery(search.trim());
    setPage(1);
  };

  const clearSearch = () => {
    setSearch('');
    setQuery('');
    setPage(1);
  };

  const refreshList = () => {
    setReloadKey((previous) => previous + 1);
  };

  const handleDebitNoteApproveRequest = async (debitNoteId, userId) => {
    if (!debitNoteId || !userId) return;

    setRequestingNoteId(debitNoteId);

    try {
      await axiosSecure.patch(
        `/api/request-for-debit-note-approval/debitNoteApproval/${debitNoteId}/${userId}`
      );

      setToast({
        type: 'success',
        message: 'Approval request sent successfully.',
      });

      // Clear the dropdown selection for this row after success
      setSelectedUserPerNote((prev) => {
        const newState = { ...prev };
        delete newState[debitNoteId];
        return newState;
      });

      refreshList();
    } catch (err) {
      setToast({
        type: 'error',
        message:
          err.response?.data?.message ||
          err.message ||
          'Failed to send approval request.',
      });

      // Revert dropdown on error so user can try again
      setSelectedUserPerNote((prev) => {
        const newState = { ...prev };
        delete newState[debitNoteId];
        return newState;
      });
    } finally {
      setRequestingNoteId(null);
    }
  };

  const handleDownload = useCallback(
    async (note) => {
      const label = note.noteNo || `DN-${note.id}`;

      if (note.status !== 'Approved') {
        setToast({
          type: 'error',
          message: `${label} must be approved before it can be downloaded.`,
        });
        return;
      }

      try {
        setToast({ type: 'info', message: `Preparing ${label}...` });

        const res = await axiosSecure.get(`/api/debit-note/${note.id}/download`, {
          responseType: 'blob',
        });

        const header = res.headers['content-disposition'] || '';
        const match = header.match(/filename="?([^"]+)"?/);
        const fileName = match
          ? match[1]
          : `${label.replace(/[^\w.-]+/g, '-')}.pdf`;

        const url = window.URL.createObjectURL(
          new Blob([res.data], { type: 'application/pdf' })
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setToast({ type: 'success', message: `${label} downloaded.` });
      } catch (err) {
        let message = `Could not download ${label}.`;
        try {
          const text = await err?.response?.data?.text?.();
          if (text) message = JSON.parse(text).message || message;
        } catch {
          /* keep the default message */
        }
        setToast({ type: 'error', message });
      }
    },
    [axiosSecure]
  );

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.toLowerCase();

    return allDebitNotes.filter((note) => {
      const noteStatus = normalizeStatus(note.status);
      const matchesStatus = status === 'ALL' || noteStatus === status;

      const searchableText = [note.noteNo, note.title, note.partyName, note.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !normalizedQuery || searchableText.includes(normalizedQuery);

      return matchesStatus && matchesSearch;
    });
  }, [allDebitNotes, status, query]);

  const serverAppearsPaginated =
    allDebitNotes.length <= PAGE_SIZE && serverTotal > allDebitNotes.length;

  const debitNotes = serverAppearsPaginated
    ? filteredNotes
    : filteredNotes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const total = serverAppearsPaginated ? serverTotal : filteredNotes.length;

  const totalPages = serverAppearsPaginated
    ? serverTotalPages
    : Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
              <FileText size={23} />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Debit Notes
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Manage debit notes and their approval requests.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refreshList}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => navigate(NEW_PATH)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus size={17} />
              Create Debit Note
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'Total Debit Notes',
              value: status === 'ALL' ? total : '—',
              icon: <FileText size={19} className="text-slate-400" />,
              border: 'border-slate-200',
            },
            {
              label: 'Pending',
              value:
                status === 'PENDING'
                  ? total
                  : status === 'ALL'
                    ? allDebitNotes.filter(
                      (note) => normalizeStatus(note.status) === 'PENDING'
                    ).length
                    : '—',
              icon: <LoaderCircle size={19} className="text-amber-500" />,
              border: 'border-amber-200',
            },
            {
              label: 'Approved',
              value:
                status === 'APPROVED'
                  ? total
                  : status === 'ALL'
                    ? allDebitNotes.filter(
                      (note) => normalizeStatus(note.status) === 'APPROVED'
                    ).length
                    : '—',
              icon: <CheckCircle2 size={19} className="text-emerald-500" />,
              border: 'border-emerald-200',
            },
            {
              label: 'Rejected',
              value:
                status === 'REJECTED'
                  ? total
                  : status === 'ALL'
                    ? allDebitNotes.filter(
                      (note) => normalizeStatus(note.status) === 'REJECTED'
                    ).length
                    : '—',
              icon: <XCircle size={19} className="text-rose-500" />,
              border: 'border-rose-200',
            },
          ].map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border ${item.border} bg-white p-5 shadow-sm`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {item.label}
                </p>
                {item.icon}
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-900">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <form
              onSubmit={submitSearch}
              className="flex w-full gap-2 lg:max-w-md"
            >
              <div className="relative flex-1">
                <Search
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search note number or title..."
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />

                {search && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Search
              </button>
            </form>

            <div className="flex flex-wrap gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => changeTab(tab.value)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${status === tab.value
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={refreshList}
                className="shrink-0 font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Note No.</th>
                  <th className="px-4 py-3 font-semibold">Title / Party</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Created By</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Reviewed By</th>
                  <th className="px-4 py-3 font-semibold">
                    Approval / Document
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                        <LoaderCircle size={18} className="animate-spin" />
                        Loading debit notes...
                      </div>
                    </td>
                  </tr>
                ) : debitNotes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                          <FileText size={23} />
                        </div>
                        <p className="mt-3 font-semibold text-slate-800">
                          No debit notes found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Try changing the status filter or search keywords.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  debitNotes.map((n) => {
                    const noteStatus = normalizeStatus(n.status);

                    return (
                      <tr
                        key={n.id}
                        className="transition hover:bg-slate-50/80"
                      >
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <span className="font-semibold text-slate-900">
                            {n.noteNo || `DN-${n.id}`}
                          </span>
                        </td>

                        <td className="max-w-[260px] px-4 py-3.5">
                          <p className="truncate font-medium text-slate-800">
                            {n.title || 'Untitled'}
                          </p>
                          {n.partyName && (
                            <p className="mt-1 truncate text-xs text-slate-500">
                              {n.partyName}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[noteStatus] ||
                              'bg-slate-100 text-slate-600'
                              }`}
                          >
                            {noteStatus || 'UNKNOWN'}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-slate-600">
                          {n.creator?.name ?? n.user?.name ?? '—'}
                        </td>

                        <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                          {formatDate(n.createdAt)}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600">
                          {n.reviewer?.name ?? n.approvedBy?.name ?? '—'}
                        </td>

                        <td className="px-4 py-3.5">
                          {noteStatus === 'APPROVED' ? (
                            <button
                              type="button"
                              onClick={() => handleDownload(n)}
                              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                            >
                              <Download size={15} />
                              Download
                            </button>
                          ) : (
                            <select
                              name={`responsibleUser-${n.id}`}
                              value={selectedUserPerNote[n.id] || ""}
                              disabled={requestingNoteId === n.id}
                              onChange={(event) => {
                                const userId = event.target.value;

                                if (!userId) return;

                                setSelectedUserPerNote((prev) => ({
                                  ...prev,
                                  [n.id]: userId,
                                }));

                                handleDebitNoteApproveRequest(n.id, userId);
                              }}
                              className="w-full min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="">Select responsible user</option>

                              {usersArray.map((item) => {
                                const user = item.user;

                                if (!user?.id) return null;

                                return (
                                  <option key={user.id} value={user.id}>
                                    {user.name || `User ${user.id}`}
                                  </option>
                                );
                              })}
                            </select>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/dashboard/debit-notes/${n.id}`)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                          >
                            <Eye size={15} />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && debitNotes.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-700">
                  {(page - 1) * PAGE_SIZE + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-700">
                  {Math.min(page * PAGE_SIZE, total)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-slate-700">{total}</span>{' '}
                debit notes
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((previous) => previous - 1)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <span className="min-w-20 text-center text-sm font-medium text-slate-600">
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((previous) => previous + 1)}
                  className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebitNoteLists;