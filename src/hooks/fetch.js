import { useState, useCallback } from "react";
// import useAxiosPrivate from "./UseAxiosPrivate";

import useAxiosPrivate from './UseAxiosPrivate';

export const useFetchData = () => {
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const axiosPrivate = useAxiosPrivate();

    // ✅ Just add 'config' to the parameter list. 
    // If you don't pass it, it becomes 'undefined', which Axios handles perfectly.
    const fetchData = useCallback(async (apiRoute, config) => {
        if (!apiRoute) return;
        setError(null);
        setLoading(true);

        try {
            // If config is undefined, Axios just ignores it.
            const res = await axiosPrivate.get(apiRoute, config);
            return res.data;
        } catch (err) {
            if (err.response) {
                setError({
                    status: err.response.status,
                    message: err.response.data?.message || 'An error occurred.',
                });
            } else {
                setError({ status: null, message: err.message });
            }
        } finally {
            setLoading(false);
        }
    }, [axiosPrivate]);

    return { fetchData, error, loading };
};