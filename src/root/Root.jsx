import { Outlet } from 'react-router-dom';
import GlobalNotifications from '../components/notifications/NotificationProvider';

const Root = () => {
    return (
        <div className='bg-white text-gray-600'>
            <GlobalNotifications />
            <Outlet />
        </div>
    );
};

export default Root;