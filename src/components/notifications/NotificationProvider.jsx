import React, { useState, useEffect, useRef } from 'react';
import notiSound from '../../assets/notification_o14egLP.mp3';
import { useSocket } from '../../hooks/socketProvider/SocketContext';

export default function GlobalNotifications() {
    const socket = useSocket();
    const [notifications, setNotifications] = useState([]);
    // Block alerts get their own modal state (not the toast stack) so a
    // flood of ip-block-alert events collapses into one card that just
    // updates its count, instead of piling up 2000 toasts on screen.
    const [blockAlert, setBlockAlert] = useState(null); // { title, message, type, ip, route, count }
    const audioRef = useRef(null);
    const timeoutsRef = useRef(new Set());
    const isAudioUnlockedRef = useRef(false);
    const hasPlayedForCurrentBlockRef = useRef(false);
    const SOUND_URL = notiSound;

    // 1. Initialize Audio & Catch Path Errors
    useEffect(() => {
        audioRef.current = new Audio(SOUND_URL);
        audioRef.current.volume = 0.5;

        audioRef.current.load();
        audioRef.current.addEventListener('error', () => {
            console.error("❌ Audio file failed to load. Ensure 'faaah.mp3' is in your 'public' folder or update the import path.");
        });

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
            }
        };
    }, []);

    // 2. Automatically unlock browser audio restrictions on first user interaction
    useEffect(() => {
        const unlockAudio = () => {
            if (isAudioUnlockedRef.current) return;
            if (audioRef.current) {
                audioRef.current.play()
                    .then(() => {
                        audioRef.current.pause();
                        audioRef.current.currentTime = 0;
                        isAudioUnlockedRef.current = true;
                        console.log("🔊 Audio unlocked! Notifications will now play sound.");
                    })
                    .catch(() => { });
            }
        };

        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);

        return () => {
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
    }, []);

    // 3. Handle Socket Notifications
    useEffect(() => {
        if (!socket) return;

        const handleNotification = (data) => {
            console.log(data, "received data from backend");
            const id = Date.now() + Math.random();
            setNotifications((prev) => [...prev, { id, ...data }]);

            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch((err) => {
                    console.warn("Audio blocked. Click anywhere on the page to enable sound.", err);
                });
            }

            const timeoutId = setTimeout(() => {
                setNotifications((prev) => prev.filter((n) => n.id !== id));
                timeoutsRef.current.delete(timeoutId);
            }, 4000);

            timeoutsRef.current.add(timeoutId);
        };

        // ip-block-alert is handled separately: it updates a single modal
        // in place instead of stacking a new toast per event, so a bot
        // flooding requests doesn't spam the UI with hundreds of cards.
        const handleBlockAlert = (data) => {
            console.log(data, "ip-block-alert received");

            setBlockAlert((prev) => {
                // Same IP as the one already showing -> just bump the count,
                // don't restart the modal or replay the sound.
                if (prev && prev.ip === data.ip) {
                    return { ...prev, ...data, count: (prev.count || 1) + 1 };
                }
                // New IP (or first alert) -> fresh modal, allow sound once.
                hasPlayedForCurrentBlockRef.current = false;
                return { ...data, count: 1 };
            });

            if (audioRef.current && !hasPlayedForCurrentBlockRef.current) {
                hasPlayedForCurrentBlockRef.current = true;
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch((err) => {
                    console.warn("Audio blocked. Click anywhere on the page to enable sound.", err);
                });
            }
        };

        socket.on('work-order-approval-request', handleNotification);
        socket.on('ip-block-alert', handleBlockAlert);

        return () => {
            socket.off('work-order-approval-request', handleNotification);
            socket.off('ip-block-alert', handleBlockAlert);
            timeoutsRef.current.forEach(clearTimeout);
            timeoutsRef.current.clear();
        };
    }, [socket]);

    const remove = (id) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    const dismissBlockAlert = () => {
        setBlockAlert(null);
        hasPlayedForCurrentBlockRef.current = false; // next block (even same IP later) can play sound again
    };

    return (
        <>
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80">
                {notifications.map((n) => (
                    <div
                        key={n.id}
                        className={`p-3 rounded-lg shadow-lg text-sm text-white transition-all ${n.type === 'error' ? 'bg-red-500' :
                                n.type === 'success' ? 'bg-green-500' :
                                    n.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                            }`}
                    >
                        <div className="flex justify-between items-start gap-2">
                            <div>
                                {n.title && <p className="font-semibold">{n.title}</p>}
                                <p>{n.message}</p>
                            </div>
                            <button onClick={() => remove(n.id)} className="opacity-80 hover:opacity-100">
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {blockAlert && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4">
                    <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl overflow-hidden">
                        <div className="bg-red-500 px-5 py-4">
                            <p className="text-white font-semibold text-base">
                                {blockAlert.title || 'IP Block Alert'}
                            </p>
                        </div>
                        <div className="px-5 py-4 space-y-2">
                            <p className="text-gray-700 text-sm">{blockAlert.message}</p>
                            {blockAlert.count > 1 && (
                                <p className="text-xs text-gray-500">
                                    {blockAlert.count} block events received from this IP.
                                </p>
                            )}
                        </div>
                        <div className="px-5 pb-4 flex justify-end">
                            <button
                                onClick={dismissBlockAlert}
                                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}