import { useEffect, useState } from "react";
import useAxiosPrivate from "../UseAxiosPrivate";

const UseAllUsers = () => {
    const axiosPrivate = useAxiosPrivate();

    const [allUsers, setAllUsers] = useState([]);
    const [optionalUserId, setOptionalUserId] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        const fetchAllUser = async () => {
            try {
                const url = optionalUserId
                    ? `/api/all-users/${optionalUserId}`
                    : `/api/all-users`;

                const response = await axiosPrivate.get(url, {
                    signal: controller.signal,
                });

                setAllUsers(response.data);

            } catch (err) {
                if (
                    err.name !== "CanceledError" &&
                    err.code !== "ERR_CANCELED"
                ) {
                    console.error("Failed to fetch users:", err);
                }
            }
        };

        fetchAllUser();

        return () => {
            controller.abort();
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [optionalUserId]);

    return {
        allUsers,
        setOptionalUserId,
    };
};

export default UseAllUsers;