/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect } from 'react';
import { io } from 'socket.io-client';
import { AuthContext } from '../../auth/AuthContext';
// https://erp-eyf7.onrender.com
// http://localhost:3000
const socket = io(import.meta.env.VITE_BACKEND_URL || 'https://erp-eyf7.onrender.com', {
    withCredentials: true,
    autoConnect: false, // Wait for user data before connecting
});

const SocketContext = createContext(socket);

export const SocketProvider = ({ children }) => {
    const { user } = useContext(AuthContext);
    const userId = user?.id || user?._id || user?.userId;

    useEffect(() => {
        const handleConnect = () => {
            console.log('[Socket] Connected:', socket.id);
            // Fallback: force backend to register this socket to the user room
            if (userId) socket.emit('register-user', { userId: String(userId) });
        };
        
        const handleDisconnect = () => console.log('[Socket] Disconnected');

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);

        if (userId) {
            socket.auth = { ...socket.auth, userId: String(userId) };
            if (!socket.connected) socket.connect();
        } else {
            if (socket.connected) socket.disconnect();
        }

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
        };
    }, [userId]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => useContext(SocketContext);