import React from 'react';
import DashboardLayout from '../DashboardLayout';
import AllOrders from '../../pages/workOrders/AllOrders';

const YarnDyeingOrders = () => {
    return (
        <DashboardLayout title={`Factory Report`}>
            <AllOrders 
                orderType={"yarnDyeingOrder"}
            />
        </DashboardLayout>


    );
};

export default YarnDyeingOrders;