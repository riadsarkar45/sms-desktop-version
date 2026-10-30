import React from 'react';
import DashboardLayout from '../DashboardLayout';
import AllOrders from '../../pages/workOrders/AllOrders';

const DyeingOrders = () => {
    return (
        <DashboardLayout title={`Factory Report`}>
            <AllOrders 
                orderType={"dyeingOrder"}
            />
        </DashboardLayout>


    );
};

export default DyeingOrders;