import axios from 'axios';

const axiosPrivate = axios.create({
    // baseURL: "https://erp-eyf7.onrender.com",
    //  baseURL: "https://erp-8-xs1c.onrender.com",
    //  baseURL: "https://erp-7-44h5.onrender.com",
    baseURL: "http://localhost:3000",
    withCredentials: true,
});

const useAxiosSecureBase = () => {
    return axiosPrivate;
};

export default useAxiosSecureBase;