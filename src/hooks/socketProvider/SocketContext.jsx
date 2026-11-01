
import { createContext, useContext, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../../auth/AuthContext';

const SOCKET_URL =
    import.meta.env.VITE_BACKEND_URL ||
    'https://erp-eyf7.onrender.com';


const socket = io(SOCKET_URL, {
    withCredentials: true,
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
});

const SocketContext = createContext(socket);

export function SocketProvider({ children }) {
    const { user } = useAuth();

    const userId = user?.id || user?._id || user?.userId;
    const normalizedUserId = userId ? String(userId) : null;

    useEffect(() => {
        console.log('[Socket] Provider effect:', {
            userId: normalizedUserId,
            connected: socket.connected,
        });

        if (!normalizedUserId) {
            socket.disconnect();
            return;
        }

        socket.auth = {
            userId: normalizedUserId,
        };

        const onConnect = () => {

            socket.emit('register-user', {
                userId: normalizedUserId,
            });
        };

        const onDisconnect = (reason) => {
            console.warn('[Socket] DISCONNECTED:', reason);
        };

        const onConnectError = (error) => {
            console.error('[Socket] CONNECTION ERROR:', error.message);
        };

       

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);

        if (!socket.connected) {
            socket.connect();
        }

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
        };
    }, [normalizedUserId]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    return useContext(SocketContext);
}
