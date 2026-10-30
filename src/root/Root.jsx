import { Outlet } from 'react-router-dom';

const Root = () => {
    return (
        <div className='bg-white text-gray-600'>
            <Outlet />
        </div>
    );
};

export default Root;