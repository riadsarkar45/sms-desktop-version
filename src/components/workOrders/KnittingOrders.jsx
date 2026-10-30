import React from 'react';
import DashboardLayout from '../DashboardLayout';
import AllOrders from '../../pages/workOrders/AllOrders';

const KnittingOrders = () => {
    return (
        <DashboardLayout title={`Factory Report`}>
            <AllOrders 
                orderType={"knittingOrder"}
            />
        </DashboardLayout>


    );
};

export default KnittingOrders;