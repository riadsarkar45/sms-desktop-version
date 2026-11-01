import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "../../hooks/socketProvider/SocketContext";

const EMPTY_USERS = []; // stable default so effects do not re-run on every render

const formatTime = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/* Responsive: how many chat windows fit on the current screen */
const getMaxWindows = () => {
    if (typeof window === "undefined") return 3;
    const w = window.innerWidth;
    if (w < 640) return 1; // phone: one window, full width
    if (w < 1024) return 2; // tablet
    return 3; // desktop
};

const useMaxWindows = () => {
    const [max, setMax] = useState(getMaxWindows);
    useEffect(() => {
        const onResize = () => setMax(getMaxWindows());
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return max;
};

/* ---------------- Small UI pieces ---------------- */

const Avatar = ({ name, online, size = "h-6 w-6" }) => (
    <div className="relative shrink-0">
        <div className={`${size} flex items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white`}>
            {(name || "?").charAt(0).toUpperCase()}
        </div>
        {online && (
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-green-500" />
        )}
    </div>
);

const ChatWindow = ({ peerId, user, online, minimized, unread, messages, me, onToggle, onClose, onSend }) => {
    const [text, setText] = useState("");
    const [error, setError] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    const name = user?.name ?? `User ${peerId}`;
    const statusLine = [online ? "Active now" : "Offline", user?.designation].filter(Boolean).join(" · ");

    useEffect(() => {
        if (!minimized) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages.length, minimized]);

    useEffect(() => {
        if (!minimized) inputRef.current?.focus();
    }, [minimized]);

    const lastMine = [...messages].reverse().find((m) => String(m.from) === me);

    const submit = async () => {
        const value = text.trim();
        if (!value || sending) return;

        setSending(true);
        setError("");
        const res = await onSend(peerId, value);
        setSending(false);

        if (res?.success) {
            setText("");
            inputRef.current?.focus();
        } else {
            setError(res?.error || "Failed to send");
        }
    };

    return (
        <div className="pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-lg border border-gray-300 bg-white shadow-xl sm:w-64">
            {/* Header */}
            <div
                onClick={onToggle}
                className="flex cursor-pointer items-center gap-1.5 bg-blue-600 px-2 py-1.5 text-white"
                title={[user?.designation, user?.workingStation].filter(Boolean).join(" · ")}
            >
                <Avatar name={name} online={online} size="h-6 w-6" />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{name}</div>
                    <div className="truncate text-[10px] leading-none text-blue-100">{statusLine}</div>
                </div>

                {minimized && unread > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold">{unread}</span>
                )}

                <button
                    onClick={(e) => { e.stopPropagation(); onToggle(); }}
                    className="rounded px-1.5 text-base leading-none hover:bg-blue-500"
                    title={minimized ? "Open" : "Minimize"}
                >
                    –
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="rounded px-1.5 text-base leading-none hover:bg-blue-500"
                    title="Close"
                >
                    ×
                </button>
            </div>

            {!minimized && (
                <>
                    {/* Messages */}
                    <div className="flex h-[50vh] max-h-[26rem] flex-col gap-1 overflow-y-auto bg-white p-2 sm:h-60">
                        {messages.length === 0 && (
                            <div className="m-auto text-center text-[11px] text-gray-400">
                                No messages yet. Say hello to {name}.
                            </div>
                        )}

                        {messages.map((m) => {
                            const mine = String(m.from) === me;
                            return (
                                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                    <div
                                        title={formatTime(m.createdAt)}
                                        className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-2.5 py-1 text-xs ${
                                            mine ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-900"
                                        }`}
                                    >
                                        {m.text}
                                    </div>
                                </div>
                            );
                        })}

                        {lastMine && (
                            <div className="text-right text-[10px] text-gray-500">
                                {lastMine.delivered ? "Delivered" : "Sent · not delivered yet"}
                            </div>
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input */}
                    <div className="border-t border-gray-200 p-1.5">
                        {error && <div className="mb-1 text-[11px] text-red-500">{error}</div>}
                        <div className="flex items-center gap-1.5">
                            <input
                                ref={inputRef}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        submit();
                                    }
                                }}
                                maxLength={2000}
                                placeholder="Aa"
                                className="min-w-0 flex-1 rounded-full bg-gray-100 px-3 py-1.5 text-base outline-none focus:ring-2 focus:ring-blue-300 sm:text-xs"
                            />
                            <button
                                onClick={submit}
                                disabled={sending || !text.trim()}
                                className="rounded-full bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                            >
                                Send
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

/* ---------------- Main component ---------------- */

/**
 * Props:
 *  - currentUserId: the logged-in user's id
 *  - users: [{ id, name, designation, workingStation, userRole }]  (id exactly as in your users API)
 */
const GlobalChatBox = ({ currentUserId, users = EMPTY_USERS }) => {
    const socket = useSocket();
    const me = String(currentUserId ?? "");
    const maxWindows = useMaxWindows();

    const [windows, setWindows] = useState([]);                  // [{ userId, minimized }]
    const [messages, setMessages] = useState({});                // { [peerId]: Message[] }
    const [unread, setUnread] = useState({});                    // { [peerId]: number }
    const [onlineUserIds, setOnlineUserIds] = useState(new Set()); // Set of string ids
    const [contactsOpen, setContactsOpen] = useState(false);
    const [search, setSearch] = useState("");

    // Refs so socket handlers always see current values
    const windowsRef = useRef([]);
    const messagesRef = useRef({});
    const usersRef = useRef(users);
    const maxWindowsRef = useRef(maxWindows);
    useEffect(() => { windowsRef.current = windows; }, [windows]);
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { usersRef.current = users; }, [users]);
    useEffect(() => { maxWindowsRef.current = maxWindows; }, [maxWindows]);

    // When the screen shrinks, keep only the newest windows that fit
    useEffect(() => {
        setWindows((prev) => (prev.length > maxWindows ? prev.slice(prev.length - maxWindows) : prev));
    }, [maxWindows]);

    const userById = useMemo(() => new Map(users.map((u) => [String(u.id), u])), [users]);

    // Changes only when the set of users changes (avoids refetch loops)
    const userIdsKey = useMemo(() => users.map((u) => u.id).join(","), [users]);

    /* ----- online / offline status ----- */

    useEffect(() => {
        if (!socket) return;

        const handleOnlineUsersUpdated = (data) => {
            if (data?.onlineUsers && Array.isArray(data.onlineUsers)) {
                setOnlineUserIds(new Set(data.onlineUsers.map((id) => String(id))));
            }
        };

        const fetchInitialOnlineUsers = () => {
            const currentUsers = usersRef.current;

            if (currentUsers.length > 0) {
                const allIds = currentUsers.map((u) => u.id);
                socket.emit("get-online-offline-users", { allUserIds: allIds }, (response) => {
                    if (response?.onlineUsers) {
                        setOnlineUserIds(new Set(response.onlineUsers.map((id) => String(id))));
                    }
                });
            } else {
                socket.emit("get-online-users", (response) => {
                    if (response?.onlineUsers) {
                        setOnlineUserIds(new Set(response.onlineUsers.map((id) => String(id))));
                    }
                });
            }
        };

        socket.on("online-users-updated", handleOnlineUsersUpdated);
        socket.on("connect", fetchInitialOnlineUsers);
        fetchInitialOnlineUsers();

        return () => {
            socket.off("online-users-updated", handleOnlineUsersUpdated);
            socket.off("connect", fetchInitialOnlineUsers);
        };
    }, [socket, userIdsKey]);

    /* ----- message store ----- */

    const addMessages = useCallback((peerId, incoming) => {
        setMessages((prev) => {
            const map = new Map((prev[peerId] || []).map((m) => [m.id, m]));
            incoming.forEach((m) => {
                const old = map.get(m.id);
                map.set(m.id, { ...old, ...m, delivered: Boolean(old?.delivered || m.delivered) });
            });
            const merged = [...map.values()].sort((a, b) => a.createdAt - b.createdAt);
            return { ...prev, [peerId]: merged };
        });
    }, []);

    const loadHistory = useCallback(
        (peerId) => {
            if (!socket) return;
            socket.emit("get-chat-history", { withUserId: peerId }, (res) => {
                if (res?.success) addMessages(peerId, res.messages);
            });
        },
        [socket, addMessages]
    );

    /* ----- windows ----- */

    const openChat = useCallback(
        (peerId) => {
            const id = String(peerId);
            const alreadyOpen = windowsRef.current.some((w) => w.userId === id);
            const max = maxWindowsRef.current;

            setWindows((prev) => {
                if (prev.some((w) => w.userId === id)) {
                    return prev.map((w) => (w.userId === id ? { ...w, minimized: false } : w));
                }
                const next = [...prev, { userId: id, minimized: false }];
                return next.length > max ? next.slice(next.length - max) : next;
            });
            setUnread((prev) => ({ ...prev, [id]: 0 }));

            if (!alreadyOpen) loadHistory(id);
        },
        [loadHistory]
    );

    const toggleMinimize = (id) => {
        setWindows((prev) => prev.map((w) => (w.userId === id ? { ...w, minimized: !w.minimized } : w)));
        setUnread((prev) => ({ ...prev, [id]: 0 }));
    };

    const closeChat = (id) => setWindows((prev) => prev.filter((w) => w.userId !== id));

    /* ----- sending ----- */

    const sendMessage = useCallback(
        (peerId, text) =>
            new Promise((resolve) => {
                if (!socket) return resolve({ success: false, error: "Not connected" });

                socket.timeout(8000).emit("send-message", { toUserId: peerId, text }, (err, res) => {
                    if (err) return resolve({ success: false, error: "No response from server" });
                    if (res?.success && res.message) {
                        addMessages(peerId, [{ ...res.message, delivered: Boolean(res.delivered) }]);
                    }
                    resolve(res);
                });
            }),
        [socket, addMessages]
    );

    /* ----- chat socket listeners ----- */

    useEffect(() => {
        if (!socket || !me) return;

        const onReceive = (msg, ack) => {
            if (typeof ack === "function") ack(true); // REQUIRED: the server marks it delivered only after this

            const incoming = String(msg.to) === me;
            const peerId = incoming ? String(msg.from) : String(msg.to);
            const isNew = !(messagesRef.current[peerId] || []).some((m) => m.id === msg.id);

            addMessages(peerId, [msg]);

            if (!incoming || !isNew) return;

            const win = windowsRef.current.find((w) => w.userId === peerId);
            if (!win) {
                openChat(peerId); // pop up the chat, like Facebook
            } else if (win.minimized) {
                setUnread((prev) => ({ ...prev, [peerId]: (prev[peerId] || 0) + 1 }));
            }
        };

        const onDelivered = ({ id }) => {
            setMessages((prev) => {
                const next = {};
                for (const key of Object.keys(prev)) {
                    next[key] = prev[key].map((m) => (m.id === id ? { ...m, delivered: true } : m));
                }
                return next;
            });
        };

        const onConnect = () => {
            windowsRef.current.forEach((w) => loadHistory(w.userId)); // catch up after a reconnect
        };

        socket.on("receive-message", onReceive);
        socket.on("message-delivered", onDelivered);
        socket.on("connect", onConnect);

        return () => {
            socket.off("receive-message", onReceive);
            socket.off("message-delivered", onDelivered);
            socket.off("connect", onConnect);
        };
    }, [socket, me, addMessages, openChat, loadHistory]);

    /* ----- contacts list ----- */

    const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

    const contacts = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users
            .filter((u) => String(u.id) !== me)
            .filter((u) => {
                if (!q) return true;
                return [u.name, u.designation, u.workingStation]
                    .filter(Boolean)
                    .some((v) => String(v).toLowerCase().includes(q));
            })
            .map((u) => ({ ...u, online: onlineUserIds.has(String(u.id)) }))
            .sort((a, b) => Number(b.online) - Number(a.online) || String(a.name).localeCompare(String(b.name)));
    }, [users, me, search, onlineUserIds]);

    const onlineCount = contacts.filter((u) => u.online).length;

    if (!socket || !me) return null;

    // On phones the chat window is full width, so hide the launcher while one is open
    const launcherClass = windows.length > 0 ? "hidden sm:block" : "block";

    return (
        <>
            {/* Chat windows: full width on phones, side by side from the launcher leftwards on larger screens */}
            <div className="pointer-events-none fixed bottom-0 right-0 z-50 flex w-full items-end justify-end gap-2 sm:right-14 sm:w-auto">
                {windows.map((w) => (
                    <ChatWindow
                        key={w.userId}
                        peerId={w.userId}
                        user={userById.get(w.userId)}
                        online={onlineUserIds.has(w.userId)}
                        minimized={w.minimized}
                        unread={unread[w.userId] || 0}
                        messages={messages[w.userId] || []}
                        me={me}
                        onToggle={() => toggleMinimize(w.userId)}
                        onClose={() => closeChat(w.userId)}
                        onSend={sendMessage}
                    />
                ))}
            </div>

            {/* Launcher button + contacts list */}
            <div className={`fixed bottom-3 right-3 z-50 ${launcherClass}`}>
                {contactsOpen && (
                    <div className="fixed bottom-16 right-3 w-[calc(100vw-1.5rem)] max-w-xs overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl sm:absolute sm:bottom-12 sm:right-0 sm:w-64">
                        <div className="border-b border-gray-200 p-2">
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-800">Chats</span>
                                <span className="text-[11px] text-gray-500">{onlineCount} online</span>
                            </div>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, designation, station"
                                className="w-full rounded-full bg-gray-100 px-3 py-1.5 text-base outline-none sm:text-xs"
                            />
                        </div>

                        <div className="max-h-[50vh] overflow-y-auto sm:max-h-72">
                            {contacts.length === 0 && (
                                <div className="p-3 text-center text-[11px] text-gray-400">No people found</div>
                            )}
                            {contacts.map((u) => {
                                const count = unread[String(u.id)] || 0;
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => {
                                            openChat(u.id);
                                            setContactsOpen(false);
                                        }}
                                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-100"
                                    >
                                        <Avatar name={u.name} online={u.online} size="h-7 w-7" />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-xs font-medium text-gray-800">{u.name}</div>
                                            <div className="truncate text-[11px] text-gray-500">
                                                {[u.designation, u.workingStation].filter(Boolean).join(" · ")}
                                            </div>
                                        </div>
                                        {count > 0 && (
                                            <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                                {count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <button
                    onClick={() => setContactsOpen((v) => !v)}
                    className="relative flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
                    title="Chat"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path d="M12 2C6.48 2 2 6.04 2 11c0 2.7 1.33 5.1 3.43 6.74V22l3.14-1.72c.45.08.92.12 1.43.12 5.52 0 10-4.04 10-9S17.52 2 12 2z" />
                    </svg>
                    {totalUnread > 0 && (
                        <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold">
                            {totalUnread}
                        </span>
                    )}
                </button>
            </div>
        </>
    );
};

export default GlobalChatBox;