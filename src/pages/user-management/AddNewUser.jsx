import React, { useState } from 'react';
import Input from '../../components/InputText/Input';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';
// import Input from '../../../../components/Input';
// import useAxiosPrivate from '../../../../hooks/UseAxiosPrivate';
// import useAxiosPrivate from '../../../../hooks/useAxiosPrivate';
const roleOptions = ['SUPER ADMIN',
    'ADMIN',
    'MERCHANDISING',
    'FABRIC PLANNING',
    'FABRIC MANAGER',
    "QC'S",
    "AUDITOR'S",
    'MANAGEMENT',];
const workingStations = ["SM SOURCING", "APPAREL TODAY LTD", "MANGO TEX LTD", "ADVANCED COMPOSITE LTD", "HEAD OFFICE"];

const initialForm = {
    name: "",
    phoneNo: "",
    password: "",
    workStation: "",
    userRole: "",
};

const AddNewUser = () => {
    const [form, setForm] = useState(initialForm);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const axiosPrivate = useAxiosPrivate();
    const handleChange = (field) => (e) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleSubmit = async () => {
        setError("");
        setSuccess("");

        if (!form.name || !form.phoneNo || !form.password || !form.userRole) {
            setError("Name, phone number, password, and user role are required.");
            return;
        }

        setSubmitting(true);
        try {
            // ADJUST: if you already have a configured axios instance (baseURL/interceptors
            // set up elsewhere in the project), import and use that instead of raw axios here.
            const res = await axiosPrivate.post(`/api/auth/register`, {
                userName: form.phoneNo, // ADJUST: decide what userName should be if it differs from phoneNo
                name: form.name,
                phoneNo: form.phoneNo,
                password: form.password,
                userRole: form.userRole,
                workStation: form.workStation, // NOTE: not yet a column on `user` — add to schema to persist this
            });
            console.log(res.data);
            setSuccess("User created successfully.");
            setForm(initialForm);
        } catch (err) {
            setError(err.response?.data?.message || "Something went wrong. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div>
            <div className='bg-gray-100 p-2'>
                <Input
                    isShowOutLabel={true}
                    type='text'
                    label="Name"
                    className='mb-2'
                    value={form.name}
                    onChange={handleChange("name")}
                />
                <Input
                    isShowOutLabel={true}

                    type='text'
                    label="Phone Number"
                    className='mb-2'
                    value={form.phoneNo}
                    onChange={handleChange("phoneNo")}
                />
                <Input
                    isShowOutLabel={true}

                    type='password'
                    label="Password"
                    className='mb-2'
                    value={form.password}
                    onChange={handleChange("password")}
                />
                <Input
                    isShowOutLabel={true}

                    options={workingStations}
                    type='select'
                    label="Work Station"
                    className='mb-2'
                    value={form.workStation}
                    onChange={handleChange("workStation")}
                />
                <Input
                    isShowOutLabel={true}

                    options={roleOptions}
                    type='select'
                    label="User Role"
                    className='mb-2'
                    value={form.userRole}
                    onChange={handleChange("userRole")}
                />

                {error && <p className='text-red-600 text-sm mb-2'>{error}</p>}
                {success && <p className='text-green-600 text-sm mb-2'>{success}</p>}

                <button
                    type='button'
                    onClick={handleSubmit}
                    disabled={submitting}
                    className='bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50'
                >
                    {submitting ? "Creating..." : "Add User"}
                </button>
            </div>
        </div>
    );
};

export default AddNewUser;