
    import { useEffect, useState } from "react";
import useAxiosPrivate from "../UseAxiosPrivate";

    const UseResponsibleUsers = () => {
        const axiosPrivate = useAxiosPrivate();

        const [allResponsibleUsers, setAllUsers] = useState([]);
        const [userResponsibility, setUserResponsibility] = useState("");
        const [responsibleSection, setResponsibleSection] = useState("");
        const [loading, setLoading] = useState(false);

        useEffect(() => {
            if (!userResponsibility || !responsibleSection) {
                setAllUsers([]);
                return;
            }

            const controller = new AbortController();

            const fetchAllUser = async () => {
                setLoading(true);

                try {
                    const url = `/api/all-responsible-users/${responsibleSection}/${userResponsibility}`;

                    const response = await axiosPrivate.get(url, {
                        signal: controller.signal,
                    });

                    // Supports either an array or { users: [...] } response.
                    const users = Array.isArray(response.data)
                        ? response.data
                        : Array.isArray(response.data?.users)
                            ? response.data.users
                            : [];

                    setAllUsers(users);
                    console.log(users, "77777777777");

                    console.log("Responsible users API response:", response.data);
                } catch (err) {
                    if (
                        err.name !== "CanceledError" &&
                        err.code !== "ERR_CANCELED"
                    ) {
                        console.error("Failed to fetch users:", err);
                        setAllUsers([]);
                    }
                } finally {
                    if (!controller.signal.aborted) {
                        setLoading(false);
                    }
                }
            };

            fetchAllUser();

            return () => controller.abort();
        }, [axiosPrivate, userResponsibility, responsibleSection]);

        return {
            allResponsibleUsers,
            setUserResponsibility,
            setResponsibleSection,
            loading,
        };
    };

    export default UseResponsibleUsers;
