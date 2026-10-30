
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/react.svg';
import { useAuth } from '../auth/AuthContext';

const Login = () => {
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [rememberMe, setRememberMe] = useState(true);

    const navigate = useNavigate();
    const { login } = useAuth();

    // Normalize Bangladesh mobile numbers
    const normalizePhone = (value) => {
        let digits = value.replace(/\D/g, '');

        // Remove Bangladesh country code
        if (digits.startsWith('880')) {
            digits = digits.slice(3);
        }

        // Remove leading zero if present
        if (digits.startsWith('0')) {
            digits = digits.slice(1);
        }

        return digits;
    };

    const handlePhoneChange = (e) => {
        const value = e.target.value;

        // Allow only digits, spaces, + and hyphens
        const cleaned = value.replace(/[^\d+\-\s]/g, '');

        setPhone(cleaned);
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (loading) return;

        const digits = normalizePhone(phone);

        // Bangladesh mobile number validation
        if (!/^1[3-9]\d{8}$/.test(digits)) {
            setError('Please enter a valid Bangladesh mobile number.');
            return;
        }

        if (!password.trim()) {
            setError('Please enter your account password.');
            return;
        }

        setLoading(true);

        try {
            await login(`0${digits}`, password);

            navigate('/dashboard/home', {
                replace: true,
            });

        } catch (err) {
            console.error('Login error:', err);

            setError(
                err.response?.data?.message ||
                err.message ||
                'Invalid credentials. Please verify your phone and password.'
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-100 p-6 select-none relative overflow-hidden">

            {/* Background ambient glow */}
            <div className="absolute -top-36 -left-36 w-96 h-96 bg-orange-200/50 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-36 -right-36 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl pointer-events-none" />

            {/* Main Container */}
            <div className="w-full max-w-4xl min-h-[580px] bg-white rounded-2xl border-4 border-white shadow-[0_20px_50px_rgba(15,23,42,0.08)] grid grid-cols-1 md:grid-cols-[1.05fr_1.35fr] overflow-hidden relative z-10">

                {/* Left Side */}
                <div className="bg-gradient-to-br from-slate-50 via-slate-50/80 to-amber-50/30 p-10 flex flex-col justify-between border-r border-slate-200/80">

                    <div>
                        {/* Logo */}
                        <div className="flex items-center gap-3.5 mb-10">
                            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center p-2">
                                <img
                                    src={logo}
                                    alt="SM Sourcing Logo"
                                    className="w-full h-full object-contain"
                                />
                            </div>

                            <div>
                                <h2 className="text-slate-800 text-base font-bold tracking-tight">
                                    SM SOURCING
                                </h2>

                                <span className="text-[11px] font-semibold text-orange-600 tracking-wider uppercase block">
                                    Audit & Compliance Suite
                                </span>
                            </div>
                        </div>

                        {/* Branding */}
                        <div className="space-y-3">
                            <h3 className="text-slate-900 text-2xl font-bold tracking-tight leading-snug">
                                Secure Supply Chain Verification
                            </h3>

                            <p className="text-slate-600 text-sm leading-relaxed">
                                Access live audit records, quality assurance logs,
                                and real-time vendor inspection reporting.
                            </p>
                        </div>
                    </div>

                    {/* System Status */}
                    <div className="border-t border-slate-200/90 pt-5 mt-8 space-y-2.5">

                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="relative flex h-2.5 w-2.5">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                </span>

                                <span className="text-xs font-medium text-slate-700">
                                    Network Gateway
                                </span>
                            </div>

                            <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200/80 px-2 py-0.5 rounded shadow-sm">
                                v2.4.12
                            </span>
                        </div>

                        <p className="text-[11px] text-slate-600 leading-normal">
                            Authorized internal personnel only. All audit actions are timestamped.
                        </p>
                    </div>
                </div>

                {/* Right Side */}
                <div className="p-10 md:p-12 flex flex-col justify-center bg-white">

                    {/* Heading */}
                    <div className="mb-7">
                        <h1 className="text-slate-900 text-2xl md:text-3xl font-extrabold tracking-tight">
                            Welcome back
                        </h1>

                        <p className="text-slate-500 text-sm mt-1.5">
                            Enter your registered mobile credentials to unlock your workspace.
                        </p>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div
                            role="alert"
                            aria-live="polite"
                            className="mb-5 flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium animate-in fade-in duration-200"
                        >
                            <svg
                                className="w-4 h-4 mt-0.5 shrink-0 text-red-600"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>

                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">

                        {/* Mobile Number */}
                        <div>
                            <label
                                htmlFor="phone"
                                className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2"
                            >
                                Mobile Number
                            </label>

                            <div className="flex rounded-lg border border-slate-300 focus-within:border-orange-500 focus-within:ring-3 focus-within:ring-orange-100 transition-all bg-slate-50/50 overflow-hidden shadow-sm">

                                <div className="flex items-center gap-2 px-3.5 bg-slate-100 border-r border-slate-300 text-slate-700 text-sm font-semibold select-none">
                                    <span className="w-4 h-3 rounded-sm overflow-hidden flex items-center justify-center relative bg-[#006a4e]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#f42a41]" />
                                    </span>

                                    <span>+880</span>
                                </div>

                                <input
                                    id="phone"
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="tel-national"
                                    placeholder="1712-345678"
                                    value={phone}
                                    onChange={handlePhoneChange}
                                    className="w-full px-3.5 py-2.5 text-sm text-slate-900 bg-transparent placeholder-slate-400 focus:outline-none"
                                    autoFocus
                                    disabled={loading}
                                    maxLength={16}
                                    required
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label
                                    htmlFor="password"
                                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                                >
                                    Password
                                </label>

                                <button
                                    type="button"
                                    onClick={() =>
                                        alert('Please contact IT Desk or your System Administrator to reset access.')
                                    }
                                    className="text-xs text-orange-600 hover:text-orange-700 font-medium hover:underline transition-colors"
                                >
                                    Forgot?
                                </button>
                            </div>

                            <div className="relative rounded-lg border border-slate-300 focus-within:border-orange-500 focus-within:ring-3 focus-within:ring-orange-100 transition-all bg-slate-50/50 shadow-sm">

                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => {
                                        setPassword(e.target.value);
                                        setError('');
                                    }}
                                    autoComplete="current-password"
                                    className="w-full px-3.5 py-2.5 pr-11 text-sm text-slate-900 bg-transparent placeholder-slate-400 focus:outline-none"
                                    disabled={loading}
                                    required
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword(prev => !prev)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                                >
                                    {showPassword ? (
                                        <svg
                                            className="w-4 h-4"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                            <line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg
                                            className="w-4 h-4"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Remember Me */}
                        <div className="flex items-center gap-2.5 pt-1">
                            <input
                                id="remember"
                                type="checkbox"
                                checked={rememberMe}
                                onChange={(e) => setRememberMe(e.target.checked)}
                                className="w-4 h-4 text-orange-600 bg-slate-50 border-slate-300 rounded focus:ring-orange-500 focus:ring-offset-0 cursor-pointer accent-orange-600"
                            />

                            <label
                                htmlFor="remember"
                                className="text-xs text-slate-600 font-medium cursor-pointer"
                            >
                                Keep me signed in on this station
                            </label>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 py-3 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {loading && (
                                <svg
                                    className="animate-spin h-4 w-4 text-white"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                >
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                            )}

                            <span>
                                {loading
                                    ? 'Authenticating Session…'
                                    : 'Sign in to Terminal'}
                            </span>
                        </button>
                    </form>

                    {/* Help */}
                    <div className="mt-7 text-center">
                        <span className="text-xs text-slate-600">
                            Need assistance?{' '}

                            <button
                                type="button"
                                onClick={() =>
                                    alert('Support Helpline: it-support@smsourcing.com')
                                }
                                className="text-orange-600 hover:text-orange-700 font-medium hover:underline inline"
                            >
                                Contact System Administrator
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
