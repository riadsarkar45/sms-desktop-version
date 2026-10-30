import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useAxiosPrivate from '../../hooks/UseAxiosPrivate'
import { useSocket } from '../../hooks/socketProvider/SocketContext'
import UseAllUsers from '../../hooks/all-users/AllUsers'

const formatDate = (iso) => {
    if (!iso) return ''

    // Handles both "2026-09-24" and ISO datetime
    const datePart = iso.split('T')[0]
    const [y, m, d] = datePart.split('-')

    return `${d}-${m}-${y}`
}

const UserList = () => {
    const { allUsers } = UseAllUsers()
    const [users, setUsers] = useState([])
    const [onlineUserIds, setOnlineUserIds] = useState(new Set())
    
    const axiosPrivate = useAxiosPrivate()
    const socket = useSocket()

    // Sync API users into local state
    useEffect(() => {
        if (Array.isArray(allUsers)) {
            setUsers(allUsers)
        }
    }, [allUsers])

    // Track Socket.IO real-time online/offline statuses
    useEffect(() => {
        if (!socket) return

        // 1. Listen for real-time online status updates broadcasted from backend
        const handleOnlineUsersUpdated = (data) => {
            if (data?.onlineUsers && Array.isArray(data.onlineUsers)) {
                // Store IDs as strings to handle numeric/string ID mismatches
                setOnlineUserIds(new Set(data.onlineUsers.map((id) => String(id))))
            }
        }

        socket.on('online-users-updated', handleOnlineUsersUpdated)

        // 2. Initial fetch when component mounts or socket connects
        const fetchInitialOnlineUsers = () => {
            if (users.length > 0) {
                const allIds = users.map((u) => u.id)
                socket.emit('get-online-offline-users', { allUserIds: allIds }, (response) => {
                    if (response?.onlineUsers) {
                        setOnlineUserIds(new Set(response.onlineUsers.map((id) => String(id))))
                    }
                })
            } else {
                socket.emit('get-online-users', (response) => {
                    if (response?.onlineUsers) {
                        setOnlineUserIds(new Set(response.onlineUsers.map((id) => String(id))))
                    }
                })
            }
        }

        fetchInitialOnlineUsers()

        return () => {
            socket.off('online-users-updated', handleOnlineUsersUpdated)
        }
    }, [socket, users])

    const handleStatusChange = async (id, value) => {
        if (!id || typeof value !== 'boolean') return

        try {
            const update = await axiosPrivate.patch(`/api/update-user-activity/${id}/${value}`)
            console.log(update.data)
            setUsers((prev) =>
                prev.map((user) =>
                    user.id === id ? { ...user, isActive: value } : user
                )
            )
        } catch (err) {
            console.error(err)
        }
    }

    const thBase =
        'border border-gray-400 px-4 py-2 text-xs font-bold text-white bg-primary-500 text-center whitespace-nowrap'

    const tdBase =
        'border border-gray-300 px-4 py-2 text-sm text-gray-800'

    return (
        <div className="bg-white rounded-md shadow-sm border border-gray-200">
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th rowSpan={2} className={`${thBase} w-20`}>
                                SL. NO.
                            </th>

                            <th rowSpan={2} className={thBase}>
                                USER NAME
                            </th>

                            <th rowSpan={2} className={thBase}>
                                DESIGNATION
                            </th>

                            <th rowSpan={2} className={thBase}>
                                TYPE OF USER
                            </th>

                            <th rowSpan={2} className={thBase}>
                                DATE OF JOIN
                            </th>

                            {/* Added Online/Offline Connection Status Column */}
                            <th rowSpan={2} className={`${thBase} w-28`}>
                                STATUS
                            </th>

                            <th rowSpan={2} className={`${thBase} w-28`}>
                                ACTION
                            </th>

                            <th colSpan={2} className={thBase}>
                                USER ACTIVITY
                            </th>
                        </tr>

                        <tr>
                            <th className={`${thBase} w-28`}>
                                ACTIVE
                            </th>

                            <th className={`${thBase} w-28`}>
                                IN-ACTIVE
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {users.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={9}
                                    className={`${tdBase} text-center text-gray-500 py-6`}
                                >
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map((user, index) => {
                                const isOnline = onlineUserIds.has(String(user.id))

                                return (
                                    <tr
                                        key={user.id}
                                        className="hover:bg-gray-50 transition-colors"
                                    >
                                        <td className={`${tdBase} text-center`}>
                                            {index + 1}
                                        </td>

                                        <td className={tdBase}>
                                            {user.name ? user.name.toUpperCase() : ''}
                                        </td>

                                        <td className={tdBase}>
                                            {user.designation ? user.designation.toUpperCase() : ''}
                                        </td>

                                        <td className={`${tdBase} text-center`}>
                                            {[1, 2].includes(user.id)
                                                ? 'AUDITOR'
                                                : user.userRole ? user.userRole.toUpperCase() : ''}
                                        </td>

                                        <td className={`${tdBase} text-center`}>
                                            {formatDate(user.dateOfJoin)}
                                        </td>

                                        {/* Online / Offline Indicator Badge */}
                                        <td className={`${tdBase} text-center`}>
                                            {isOnline ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                    Online
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-300">
                                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                                    Offline
                                                </span>
                                            )}
                                        </td>

                                        {/* Permission */}
                                        <td className={`${tdBase} text-center`}>
                                            <Link to={`/dashboard/user-permission/${user.id}/${user.name}`}>
                                                <span className="bg-yellow-200 text-yellow-900 rounded-lg p-1 border border-yellow-600">
                                                    Set Role
                                                </span>
                                            </Link>
                                        </td>

                                        {/* Active */}
                                        <td className={`${tdBase} text-center`}>
                                            <input
                                                type="checkbox"
                                                checked={user.isActive === true}
                                                onChange={() =>
                                                    handleStatusChange(user.id, true)
                                                }
                                                className="w-4 h-4 cursor-pointer accent-green-600"
                                                aria-label={`Mark ${user.name} as active`}
                                            />
                                        </td>

                                        {/* Inactive */}
                                        <td className={`${tdBase} text-center`}>
                                            <input
                                                type="checkbox"
                                                checked={user.isActive === false}
                                                onChange={() =>
                                                    handleStatusChange(user.id, false)
                                                }
                                                className="w-4 h-4 cursor-pointer accent-red-600"
                                                aria-label={`Mark ${user.name} as inactive`}
                                            />
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default UserList