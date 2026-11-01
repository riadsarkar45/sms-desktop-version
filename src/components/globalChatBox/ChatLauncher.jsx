import { useContext, useEffect, useMemo } from "react";
import UseAllUsers from "../../hooks/all-users/AllUsers";
import { useSocket } from "../../hooks/socketProvider/SocketContext";
import GlobalChatBox from "./GlobalChatBox";
import { useAuth } from "../../auth/AuthContext";

// Handles the common shapes of the logged-in user object
const getUserId = (user) => user?.id ?? user?.userId ?? user?._id ?? user?.user?.id ?? null;

/**
 * Loads the employee list and renders the chat.
 * It is a separate component so the users request only happens
 * AFTER login (the login page never calls UseAllUsers).
 */
const ChatWithUsers = ({ currentUserId }) => {
    const { allUsers } = UseAllUsers();

    const chatUsers = useMemo(() => {
        const list = Array.isArray(allUsers) ? allUsers : [];
        return list
            .filter((u) => u && u.isActive !== false)
            .map((u) => ({
                id: u.id, // keep the original id, exactly like UserList sends it
                name: u.name,
                designation: u.designation,
                workingStation: u.workingStation,
                userRole: u.userRole,
            }));
    }, [allUsers]);

    return <GlobalChatBox currentUserId={currentUserId} users={chatUsers} />;
};

const ChatLauncher = () => {
    const socket = useSocket();
    const { user } = useAuth();
    const currentUserId = getUserId(user);

    // Warn only if a user is logged in but we cannot find the id inside it
    useEffect(() => {
        if (user && !currentUserId) {
            console.warn("Chat: the logged-in user has no id field. AuthContext user =", user);
        }
    }, [user, currentUserId]);

    // Tell the server who this socket belongs to (needed for send-message)
    useEffect(() => {
        if (!socket || !currentUserId) return;

        const register = () => socket.emit("register-user", { userId: currentUserId });

        if (socket.connected) register();
        socket.on("connect", register); // again after every reconnect

        return () => socket.off("connect", register);
    }, [socket, currentUserId]);

    if (!socket || !currentUserId) return null; // not logged in yet: no chat

    return <ChatWithUsers currentUserId={currentUserId} />;
};

export default ChatLauncher;