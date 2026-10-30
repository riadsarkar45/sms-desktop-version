import React from 'react';
import DashboardLayout from '../DashboardLayout';
import AllOrders from '../../pages/workOrders/AllOrders';

const AopOrders = () => {
    return (
        <DashboardLayout title={`Factory Report`}>
            <AllOrders 
                orderType={"aopOrder"}
            />
        </DashboardLayout>


    );
};

export default AopOrders;