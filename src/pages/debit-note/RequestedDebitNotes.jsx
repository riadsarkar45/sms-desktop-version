import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertCircle,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Eye,
    FileText,
    Inbox,
    LoaderCircle,
    MessageSquare,
    RefreshCw,
    Search,
    ShieldCheck,
    UserRound,
    X,
    XCircle,
} from "lucide-react";

import { Link } from "react-router-dom";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

const PAGE_SIZE = 8;

// Must match your existing backend route.
const REQUESTS_ENDPOINT = "/api/requested-debit-notes";

// IMPORTANT:
// These two action endpoints are proposed frontend contracts.
// Implement/match them with your actual backend routes before using
// the Approve and Reject actions in production.
const APPROVE_ENDPOINT = (requestId) =>
    `/api/debit-note-approval/${requestId}/approve`;

const REJECT_ENDPOINT = (requestId) =>
    `/api/debit-note-approval/${requestId}/reject`;

const formatDateTime = (value) => {
    if (!value) return "Not available";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Not available";

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
};

const getInitials = (name = "") =>
    name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("") || "U";

const getNoteNumber = (note) =>
    note?.noteNo || `DN-${String(note?.id ?? "").padStart(4, "0")}`;

const getErrorMessage = (error, fallback) =>
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback;

const STATUS_STYLES = {
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    REJECTED: "bg-rose-50 text-rose-700 border-rose-200",
    DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
};

const ApprovalRequestReceived = () => {
    const axiosSecure = useAxiosPrivate();

    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [searchText, setSearchText] = useState("");
    const [activeFilter, setActiveFilter] = useState("ALL");
    const [page, setPage] = useState(1);

    const [selectedRequest, setSelectedRequest] = useState(null);
    const [decision, setDecision] = useState(null);
    const [remark, setRemark] = useState("");

    const [processingId, setProcessingId] = useState(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const fetchRequests = useCallback(
        async (showRefresh = false, signal) => {
            if (showRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setError("");

            try {
                const response = await axiosSecure.get(
                    REQUESTS_ENDPOINT,
                    { signal }
                );

                // The backend controller previously defined returns an array.
                const result = Array.isArray(response.data)
                    ? response.data
                    : Array.isArray(response.data?.data)
                        ? response.data.data
                        : [];

                setRequests(result);
            } catch (err) {
                if (
                    err?.code === "ERR_CANCELED" ||
                    err?.name === "CanceledError"
                ) {
                    return;
                }

                console.error(
                    "Failed to load Debit Note approval requests:",
                    err
                );

                setError(
                    getErrorMessage(
                        err,
                        "Unable to load approval requests."
                    )
                );
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [axiosSecure]
    );

    useEffect(() => {
        const controller = new AbortController();

        fetchRequests(false, controller.signal);

        return () => controller.abort();
    }, [fetchRequests]);

    const pendingRequests = useMemo(
        () =>
            requests.filter(
                (request) =>
                    request?.debitNote?.status === "PENDING"
            ),
        [requests]
    );

    const filteredRequests = useMemo(() => {
        const query = searchText.trim().toLowerCase();

        return pendingRequests.filter((request) => {
            const note = request.debitNote;
            const requester = request.byUser;

            const matchesFilter =
                activeFilter === "ALL" ||
                note?.status === activeFilter;

            const searchableText = [
                note?.noteNo,
                note?.title,
                note?.content,
                requester?.name,
                requester?.designation,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return (
                matchesFilter &&
                (!query || searchableText.includes(query))
            );
        });
    }, [pendingRequests, searchText, activeFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(filteredRequests.length / PAGE_SIZE)
    );

    const visibleRequests = useMemo(() => {
        const start = (page - 1) * PAGE_SIZE;

        return filteredRequests.slice(start, start + PAGE_SIZE);
    }, [filteredRequests, page]);

    useEffect(() => {
        setPage(1);
    }, [searchText, activeFilter]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const closeDetail = () => {
        if (processingId !== null) return;

        setSelectedRequest(null);
        setDecision(null);
        setRemark("");
    };

    const openDecision = (request, action) => {
        setSelectedRequest(request);
        setDecision(action);
        setRemark("");
        setError("");
        setSuccess("");
    };

    const submitDecision = async () => {
        const requestId = Number(selectedRequest?.id);
        const debitNoteId = Number(selectedRequest?.debitNote?.id);

        if (!Number.isInteger(requestId) || requestId <= 0) {
            setError("Invalid approval request ID.");
            return;
        }

        if (!Number.isInteger(debitNoteId) || debitNoteId <= 0) {
            setError("Invalid Debit Note ID.");
            return;
        }

        if (!["APPROVE", "REJECT"].includes(decision)) {
            setError("Please select a valid decision.");
            return;
        }

        if (decision === "REJECT" && !remark.trim()) {
            setError("Please provide a reason before rejecting.");
            return;
        }

        setProcessingId(requestId);
        setError("");
        setSuccess("");

        try {
            const endpoint =
                decision === "APPROVE"
                    ? APPROVE_ENDPOINT(requestId)
                    : REJECT_ENDPOINT(requestId);

            // The backend must validate that this authenticated user
            // is the intended approver for this request.
            await axiosSecure.patch(endpoint, {
                remark: remark.trim(),
                debitNoteId,
            });

            setSuccess(
                decision === "APPROVE"
                    ? "Debit Note approved successfully."
                    : "Debit Note rejected successfully."
            );

            setSelectedRequest(null);
            setDecision(null);
            setRemark("");

            await fetchRequests(true);
        } catch (err) {
            console.error("Debit Note decision failed:", err);

            setError(
                getErrorMessage(
                    err,
                    "Unable to submit your decision."
                )
            );
        } finally {
            setProcessingId(null);
        }
    };


    const handleDebitNoteApproval = async (debitNoteId) => {

        if (!debitNoteId) return;

        axiosSecure.put(`/api/approve-debit-note/${debitNoteId}`)
            .then((res) => {
                console.log(res.status);
            }).catch((e) => {
                console.log(e.message);
            })

    }

    const renderStatus = (status) => (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status] || STATUS_STYLES.DRAFT
                }`}
        >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status || "UNKNOWN"}
        </span>
    );

    return (
        <div className="min-h-screen bg-slate-50 p-4 text-slate-800 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-[1500px] space-y-6">
                {/* Header */}
                <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#183653] text-white shadow-sm">
                            <Inbox size={23} />
                        </div>

                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                                    Approval Inbox
                                </h1>

                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                    {pendingRequests.length} pending
                                </span>
                            </div>

                            <p className="mt-1 text-sm text-slate-500">
                                Review incoming Debit Note requests and
                                record your decision.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => fetchRequests(true)}
                        disabled={refreshing || loading}
                        className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 md:self-auto"
                    >
                        <RefreshCw
                            size={16}
                            className={
                                refreshing ? "animate-spin" : ""
                            }
                        />
                        Refresh inbox
                    </button>
                </header>

                {/* Notifications */}
                {error && (
                    <div
                        role="alert"
                        className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
                    >
                        <AlertCircle
                            size={19}
                            className="mt-0.5 shrink-0"
                        />

                        <div className="flex-1">{error}</div>

                        <button
                            type="button"
                            onClick={() => setError("")}
                            aria-label="Dismiss error"
                        >
                            <X size={17} />
                        </button>
                    </div>
                )}

                {success && (
                    <div
                        role="status"
                        className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                    >
                        <CheckCircle2
                            size={19}
                            className="shrink-0"
                        />

                        <div className="flex-1">{success}</div>

                        <button
                            type="button"
                            onClick={() => setSuccess("")}
                            aria-label="Dismiss success message"
                        >
                            <X size={17} />
                        </button>
                    </div>
                )}

                {/* Summary cards */}
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <SummaryCard
                        icon={<Inbox size={20} />}
                        label="Awaiting my review"
                        value={pendingRequests.length}
                        description="Requests requiring a decision"
                        iconClass="bg-amber-50 text-amber-700"
                    />

                    <SummaryCard
                        icon={<FileText size={20} />}
                        label="Currently displayed"
                        value={filteredRequests.length}
                        description="Matches the current search and filter"
                        iconClass="bg-blue-50 text-blue-700"
                    />

                    <SummaryCard
                        icon={<ShieldCheck size={20} />}
                        label="Approval queue"
                        value={pendingRequests.length}
                        description="Debit Notes assigned to this inbox"
                        iconClass="bg-emerald-50 text-emerald-700"
                    />
                </section>

                {/* Inbox panel */}
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 p-4 sm:p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">
                                    Incoming requests
                                </h2>

                                <p className="mt-1 text-sm text-slate-500">
                                    Open a request to review the document
                                    and respond.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <div className="relative min-w-0 sm:w-72">
                                    <Search
                                        size={17}
                                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                    />

                                    <input
                                        type="search"
                                        value={searchText}
                                        onChange={(event) =>
                                            setSearchText(event.target.value)
                                        }
                                        placeholder="Search note, title, requester..."
                                        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#183653] focus:ring-2 focus:ring-blue-100"
                                    />
                                </div>

                                <select
                                    value={activeFilter}
                                    onChange={(event) =>
                                        setActiveFilter(event.target.value)
                                    }
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#183653]"
                                    aria-label="Filter requests by status"
                                >
                                    <option value="ALL">All statuses</option>
                                    <option value="PENDING">Pending</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Loading */}
                    {loading ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8">
                            <LoaderCircle
                                size={30}
                                className="animate-spin text-[#183653]"
                            />

                            <p className="text-sm text-slate-500">
                                Loading approval requests...
                            </p>
                        </div>
                    ) : visibleRequests.length === 0 ? (
                        <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                <Inbox size={30} />
                            </div>

                            <h3 className="text-base font-bold text-slate-800">
                                {searchText
                                    ? "No matching requests"
                                    : "Your inbox is clear"}
                            </h3>

                            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                                {searchText
                                    ? "Try a different note number, title or requester name."
                                    : "There are no pending Debit Note approval requests assigned to you right now."}
                            </p>

                            {searchText && (
                                <button
                                    type="button"
                                    onClick={() => setSearchText("")}
                                    className="mt-4 text-sm font-semibold text-[#183653] hover:underline"
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Desktop table */}
                            <div className="hidden overflow-x-auto lg:block">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-5 py-4 font-semibold">
                                                Debit Note
                                            </th>
                                            <th className="px-5 py-4 font-semibold">
                                                Requested by
                                            </th>
                                            <th className="px-5 py-4 font-semibold">
                                                Submitted
                                            </th>
                                            <th className="px-5 py-4 font-semibold">
                                                Status
                                            </th>
                                            <th className="px-5 py-4 text-right font-semibold">
                                                Action
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-slate-100">
                                        {visibleRequests.map((request) => {
                                            const note = request.debitNote;
                                            console.log(note, "note line 541");
                                            const requester = request.byUser;

                                            return (
                                                <tr
                                                    key={request.id}
                                                    className="transition hover:bg-slate-50/80"
                                                >
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-start gap-3">
                                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#183653]">
                                                                <FileText
                                                                    size={19}
                                                                />
                                                            </div>

                                                            <div className="min-w-0">
                                                                <p className="font-bold text-slate-900">
                                                                    {getNoteNumber(
                                                                        note
                                                                    )}
                                                                </p>

                                                                <p className="mt-1 max-w-xs truncate text-slate-600">
                                                                    {note?.title ||
                                                                        "Untitled Debit Note"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-2.5">
                                                            <Avatar
                                                                name={
                                                                    requester?.name
                                                                }
                                                            />

                                                            <div>
                                                                <p className="font-medium text-slate-800">
                                                                    {requester?.name ||
                                                                        "Unknown user"}
                                                                </p>

                                                                <p className="mt-0.5 text-xs text-slate-500">
                                                                    {requester?.designation ||
                                                                        "Requester"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-2 text-slate-600">
                                                            <Clock3
                                                                size={15}
                                                                className="text-slate-400"
                                                            />

                                                            <span>
                                                                {formatDateTime(
                                                                    request.requestAt
                                                                )}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td className="px-5 py-4">
                                                        {renderStatus(
                                                            note?.status
                                                        )}
                                                    </td>

                                                    <td className="px-5 py-4 text-right">
                                                        <div className="flex items-center gap-2">
                                                            <Link to={`/dashboard/debit-notes/${note.id}`}>
                                                                <button
                                                                    type="button"

                                                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-1 py-1 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                                                                >
                                                                    <Eye size={15} />
                                                                    Review
                                                                </button>
                                                            </Link>
                                                            <span>|</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDebitNoteApproval(note.id)}
                                                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-1 py-1 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                                                            >
                                                                <Check size={15} />
                                                                Approve
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile/tablet cards */}
                            <div className="grid gap-3 p-3 sm:p-4 lg:hidden">
                                {visibleRequests.map((request) => {
                                    const note = request.debitNote;
                                    const requester = request.byUser;

                                    return (
                                        <article
                                            key={request.id}
                                            className="rounded-xl border border-slate-200 p-4 transition hover:border-slate-300"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#183653]">
                                                    <FileText size={21} />
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <h3 className="font-bold text-slate-900">
                                                            {getNoteNumber(
                                                                note
                                                            )}
                                                        </h3>

                                                        {renderStatus(
                                                            note?.status
                                                        )}
                                                    </div>

                                                    <p className="mt-1 break-words text-sm text-slate-600">
                                                        {note?.title ||
                                                            "Untitled Debit Note"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                                                <div>
                                                    <p className="text-xs font-medium text-slate-400">
                                                        REQUESTED BY
                                                    </p>

                                                    <div className="mt-1.5 flex items-center gap-2">
                                                        <Avatar
                                                            name={
                                                                requester?.name
                                                            }
                                                        />

                                                        <div>
                                                            <p className="text-sm font-medium text-slate-800">
                                                                {requester?.name ||
                                                                    "Unknown user"}
                                                            </p>

                                                            <p className="text-xs text-slate-500">
                                                                {requester?.designation ||
                                                                    "Requester"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <p className="text-xs font-medium text-slate-400">
                                                        SUBMITTED
                                                    </p>

                                                    <p className="mt-2 text-sm text-slate-700">
                                                        {formatDateTime(
                                                            request.requestAt
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedRequest(request)
                                                }
                                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#183653] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#244b70]"
                                            >
                                                <Eye size={16} />
                                                Review request
                                            </button>
                                        </article>
                                    );
                                })}
                            </div>

                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                                <p className="text-sm text-slate-500">
                                    Showing{" "}
                                    <span className="font-semibold text-slate-800">
                                        {(page - 1) * PAGE_SIZE + 1}
                                    </span>
                                    {" - "}
                                    <span className="font-semibold text-slate-800">
                                        {Math.min(
                                            page * PAGE_SIZE,
                                            filteredRequests.length
                                        )}
                                    </span>
                                    {" of "}
                                    <span className="font-semibold text-slate-800">
                                        {filteredRequests.length}
                                    </span>
                                    {" requests"}
                                </p>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={page <= 1}
                                        onClick={() =>
                                            setPage((current) =>
                                                Math.max(1, current - 1)
                                            )
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <ChevronLeft size={16} />
                                        Previous
                                    </button>

                                    <span className="min-w-20 text-center text-sm text-slate-500">
                                        Page {page} of {totalPages}
                                    </span>

                                    <button
                                        type="button"
                                        disabled={page >= totalPages}
                                        onClick={() =>
                                            setPage((current) =>
                                                Math.min(
                                                    totalPages,
                                                    current + 1
                                                )
                                            )
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Next
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>

            {/* Request details modal */}
            {selectedRequest && !decision && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            closeDetail();
                        }
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="request-detail-title"
                        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#183653]">
                                    <FileText size={22} />
                                </div>

                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                        Approval request
                                    </p>

                                    <h2
                                        id="request-detail-title"
                                        className="mt-1 text-xl font-bold text-slate-900"
                                    >
                                        {getNoteNumber(
                                            selectedRequest.debitNote
                                        )}
                                    </h2>

                                    <p className="mt-1 text-sm text-slate-500">
                                        Review the document before making
                                        your decision.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={closeDetail}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                aria-label="Close details"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <DetailField
                                    label="Debit Note title"
                                    value={
                                        selectedRequest.debitNote?.title ||
                                        "Untitled Debit Note"
                                    }
                                />

                                <DetailField
                                    label="Current status"
                                    value={renderStatus(
                                        selectedRequest.debitNote?.status
                                    )}
                                />

                                <DetailField
                                    label="Submitted by"
                                    value={
                                        <div className="flex items-center gap-2">
                                            <Avatar
                                                name={
                                                    selectedRequest.byUser?.name
                                                }
                                            />

                                            <div>
                                                <p className="font-semibold text-slate-800">
                                                    {selectedRequest.byUser
                                                        ?.name ||
                                                        "Unknown user"}
                                                </p>

                                                <p className="text-xs text-slate-500">
                                                    {selectedRequest.byUser
                                                        ?.designation ||
                                                        "Requester"}
                                                </p>
                                            </div>
                                        </div>
                                    }
                                />

                                <DetailField
                                    label="Submission date"
                                    value={formatDateTime(
                                        selectedRequest.requestAt
                                    )}
                                />

                                <DetailField
                                    label="Note created"
                                    value={formatDateTime(
                                        selectedRequest.debitNote?.createdAt
                                    )}
                                />

                                <DetailField
                                    label="Last updated"
                                    value={formatDateTime(
                                        selectedRequest.debitNote?.updatedAt
                                    )}
                                />
                            </div>

                            <div className="overflow-hidden rounded-xl border border-slate-200">
                                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                                    <FileText
                                        size={17}
                                        className="text-[#183653]"
                                    />

                                    <h3 className="font-bold text-slate-800">
                                        Debit Note document
                                    </h3>
                                </div>

                                <div className="max-h-[35vh] overflow-y-auto p-4 sm:p-5">
                                    {selectedRequest.debitNote?.content ? (
                                        <pre className="whitespace-pre-wrap wrap-break-word font-sans text-sm leading-7 text-slate-700">
                                            {selectedRequest.debitNote.content}
                                        </pre>
                                    ) : (
                                        <p className="text-sm italic text-slate-400">
                                            No document content available.
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                                <div className="flex items-start gap-3">
                                    <ShieldCheck
                                        size={20}
                                        className="mt-0.5 shrink-0 text-[#183653]"
                                    />

                                    <div>
                                        <p className="font-semibold text-slate-800">
                                            Before you decide
                                        </p>

                                        <p className="mt-1 text-sm leading-6 text-slate-600">
                                            Verify the Debit Note details
                                            and supporting information.
                                            Your decision should be recorded
                                            against this specific request.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                            <button
                                type="button"
                                onClick={() =>
                                    openDecision(
                                        selectedRequest,
                                        "REJECT"
                                    )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                            >
                                <XCircle size={17} />
                                Reject
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    openDecision(
                                        selectedRequest,
                                        "APPROVE"
                                    )
                                }
                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#183653] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#244b70]"
                            >
                                <CheckCircle2 size={17} />
                                Approve Debit Note
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {/* Approve / Reject confirmation modal */}
            {selectedRequest && decision && (
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="decision-title"
                        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        <div className="p-5 sm:p-6">
                            <div
                                className={`flex h-12 w-12 items-center justify-center rounded-xl ${decision === "APPROVE"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-rose-50 text-rose-700"
                                    }`}
                            >
                                {decision === "APPROVE" ? (
                                    <CheckCircle2 size={24} />
                                ) : (
                                    <XCircle size={24} />
                                )}
                            </div>

                            <h2
                                id="decision-title"
                                className="mt-4 text-xl font-bold text-slate-900"
                            >
                                {decision === "APPROVE"
                                    ? "Confirm approval"
                                    : "Reject Debit Note"}
                            </h2>

                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                {decision === "APPROVE"
                                    ? `You are about to approve ${getNoteNumber(selectedRequest.debitNote)}. Confirm that you have reviewed the document.`
                                    : `You are about to reject ${getNoteNumber(selectedRequest.debitNote)}. A rejection reason is required.`}
                            </p>

                            <label
                                htmlFor="decision-remark"
                                className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-700"
                            >
                                <MessageSquare size={16} />
                                Review remark{" "}
                                {decision === "REJECT" ? (
                                    <span className="text-rose-600">
                                        (required)
                                    </span>
                                ) : (
                                    <span className="font-normal text-slate-400">
                                        (optional)
                                    </span>
                                )}
                            </label>

                            <textarea
                                id="decision-remark"
                                value={remark}
                                onChange={(event) =>
                                    setRemark(event.target.value)
                                }
                                rows={4}
                                maxLength={2000}
                                placeholder={
                                    decision === "APPROVE"
                                        ? "Add an approval remark if needed..."
                                        : "Explain why this Debit Note is being rejected..."
                                }
                                className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none placeholder:text-slate-400 focus:border-[#183653] focus:ring-2 focus:ring-blue-100"
                            />

                            <p className="mt-1 text-right text-xs text-slate-400">
                                {remark.length}/2000
                            </p>

                            {error && (
                                <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                    <AlertCircle
                                        size={17}
                                        className="mt-0.5 shrink-0"
                                    />

                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                disabled={processingId !== null}
                                onClick={() => {
                                    setDecision(null);
                                    setRemark("");
                                    setError("");
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                                Back to review
                            </button>

                            <button
                                type="button"
                                disabled={
                                    processingId !== null ||
                                    (decision === "REJECT" &&
                                        !remark.trim())
                                }
                                onClick={submitDecision}
                                className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${decision === "APPROVE"
                                    ? "bg-emerald-700 hover:bg-emerald-800"
                                    : "bg-rose-700 hover:bg-rose-800"
                                    }`}
                            >
                                {processingId !== null ? (
                                    <>
                                        <LoaderCircle
                                            size={17}
                                            className="animate-spin"
                                        />
                                        Processing...
                                    </>
                                ) : decision === "APPROVE" ? (
                                    <>
                                        <Check size={17} />
                                        Confirm approval
                                    </>
                                ) : (
                                    <>
                                        <XCircle size={17} />
                                        Confirm rejection
                                    </>
                                )}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

const SummaryCard = ({
    icon,
    label,
    value,
    description,
    iconClass,
}) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="text-sm font-medium text-slate-500">
                    {label}
                </p>

                <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                    {value}
                </p>
            </div>

            <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconClass}`}
            >
                {icon}
            </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">{description}</p>
    </div>
);

const Avatar = ({ name }) => (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8eef5] text-xs font-bold text-[#183653]">
        {getInitials(name)}
    </div>
);

const DetailField = ({ label, value }) => (
    <div className="min-w-0 rounded-xl border border-slate-200 p-3.5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label}
        </p>

        <div className="wrap-break-words text-sm text-slate-800">
            {value ?? "Not available"}
        </div>
    </div>
);

export default ApprovalRequestReceived;