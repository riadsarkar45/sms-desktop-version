import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const icons = {
        success: <CheckCircle size={20} className="text-green-500" />,
        error: <XCircle size={20} className="text-red-500" />,
        warning: <AlertCircle size={20} className="text-yellow-500" />,
        info: <AlertCircle size={20} className="text-blue-500" />
    };

    const bgColors = {
        success: 'bg-green-50 border-green-200',
        error: 'bg-red-50 border-red-200',
        warning: 'bg-yellow-50 border-yellow-200',
        info: 'bg-blue-50 border-blue-200'
    };

    const textColors = {
        success: 'text-green-800',
        error: 'text-red-800',
        warning: 'text-yellow-800',
        info: 'text-blue-800'
    };

    return (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
            <div className={`${bgColors[type]} border rounded-md shadow-lg p-4 flex items-center gap-3 min-w-[320px] max-w-md`}>
                <div className="shrink-0">
                    {icons[type]}
                </div>
                <p className={`${textColors[type]} flex-1 font-medium text-sm`}>
                    {message}
                </p>
                <button
                    onClick={onClose}
                    className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
};

export default Toast;
