import axios from 'axios';

const axiosPublic = axios.create({
    baseURL: "https://erp-eyf7.onrender.com",
    //  baseURL: "https://erp-8-xs1c.onrender.com",
    //  baseURL: "https://erp-7-44h5.onrender.com",
    // baseURL: "http://localhost:3000",
    withCredentials: true,
    
});

const useAxiosPublic = () => {
    return axiosPublic;
};

export default useAxiosPublic;