
/* eslint-disable react-refresh/only-export-components */

import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';

import useAxiosPublic from '../hooks/AxiosPublic';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const axiosPublic = useAxiosPublic();

    const [user, setUser] = useState(null);
    const [accessToken, setAccessToken] = useState(null);
    const [loading, setLoading] = useState(true);

    const hasAttemptedRefresh = useRef(false);

    useEffect(() => {
        if (hasAttemptedRefresh.current) return;

        hasAttemptedRefresh.current = true;

        const restoreSession = async () => {
            try {
                const { data } = await axiosPublic.post(
                    '/api/auth/refresh'
                );

                if (!data?.accessToken) {
                    throw new Error(
                        'Refresh response did not contain an access token.'
                    );
                }

                console.log(data.accessToken);
                setAccessToken(data.accessToken);

                const meResponse = await axiosPublic.get(
                    '/api/auth/me',
                    {
                        headers: {
                            Authorization: `Bearer ${data.accessToken}`,
                        },
                    }
                );

                setUser(meResponse.data);
                console.log(meResponse.data);
            } catch (error) {
                setAccessToken(null);
                setUser(null);

                console.error(
                    'Session restoration failed:',
                    error.response?.data || error.message
                );
            } finally {
                setLoading(false);
            }
        };

        restoreSession();
    }, [axiosPublic]);

    const login = async (phoneNo, password) => {
        try {
            const { data } = await axiosPublic.post(
                '/api/auth/login',
                {
                    phoneNo,
                    password,
                }
            );

            if (!data?.accessToken) {
                throw new Error(
                    'Login response did not contain an access token.'
                );
            }
            console.log(data.accessToken);
            setAccessToken(data.accessToken);
            setUser(data.user);

            return data;
        } catch (error) {
            console.error(
                'Login failed:',
                error.response?.data || error.message
            );

            throw error;
        }
    };

    const logout = async () => {
        try {
            await axiosPublic.post('/api/auth/logout');
        } catch (error) {
            console.error(
                'Logout request failed:',
                error.response?.data || error.message
            );
        } finally {
            setAccessToken(null);
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                accessToken,
                setAccessToken,
                loading,
                isAuthenticated: Boolean(accessToken),
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error(
            'useAuth must be used within an AuthProvider'
        );
    }

    return context;
};
