import { useEffect } from 'react';
import useAxiosPublic from './AxiosPublic';
import { useAuth } from '../auth/AuthContext';
import useAxiosSecureBase from './AxiosPrivate';

// Shared by every component that uses this hook (NOT per component).
let refreshPromise = null;
let latestAccessToken = null;

const useAxiosPrivate = () => {
    const { accessToken, setAccessToken } = useAuth();
    const axiosPublic = useAxiosPublic();
    const axiosPrivateInstance = useAxiosSecureBase();

    // keep the module-level token current so interceptors never read a stale one
    useEffect(() => {
        latestAccessToken = accessToken;
    }, [accessToken]);

    useEffect(() => {
        const requestIntercept = axiosPrivateInstance.interceptors.request.use(
            (config) => {
                if (!config.headers['Authorization'] && latestAccessToken) {
                    config.headers['Authorization'] = `Bearer ${latestAccessToken}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        const responseIntercept = axiosPrivateInstance.interceptors.response.use(
            (response) => response,
            async (error) => {
                const prevRequest = error?.config;

                if (error?.response?.status === 401 && prevRequest && !prevRequest._retry) {
                    prevRequest._retry = true;

                    try {
                        // Only ONE refresh runs at a time across the whole app.
                        if (!refreshPromise) {
                            refreshPromise = axiosPublic
                                .post('/api/auth/refresh')
                                .then(({ data }) => {
                                    latestAccessToken = data.accessToken;
                                    setAccessToken(data.accessToken);
                                    return data.accessToken;
                                })
                                .finally(() => {
                                    refreshPromise = null;
                                });
                        }

                        const newAccessToken = await refreshPromise;
                        prevRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                        return axiosPrivateInstance(prevRequest);
                    } catch (refreshError) {
                        latestAccessToken = null;
                        setAccessToken(null);
                        return Promise.reject(refreshError);
                    }
                }

                return Promise.reject(error);
            }
        );

        return () => {
            axiosPrivateInstance.interceptors.request.eject(requestIntercept);
            axiosPrivateInstance.interceptors.response.eject(responseIntercept);
        };
    }, [axiosPublic, axiosPrivateInstance, setAccessToken]);

    return axiosPrivateInstance;
};

export default useAxiosPrivate;