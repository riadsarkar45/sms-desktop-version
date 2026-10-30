import { createBrowserRouter, Navigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import Root from "../root/Root";
import Login from "../pages/Login";
import Home from "../pages/dashboard/Home";
import KnittingOrders from "../components/workOrders/KnittingOrders";
import DyeingOrders from "../components/workOrders/DyeingOrders";
import AopOrders from "../components/workOrders/AopOrders";
import YarnDyeingOrders from "../components/workOrders/YarnDyeingOrders";
import Summary from "../pages/styleRequirement/Summary";
import FactoryComparison from "../pages/comparision/FactoryStockComparision";
import ReportStudio from "../pages/report-studio/ReportStudio";
import ProductionSummary from "../pages/production/ProductionSummary";
import DailyCutting from "../pages/production/DailyCutting";
import DailySewing from "../pages/production/DailySewing";
import DailyFinishing from "../pages/production/DailyFinishing";
import DailyExport from "../pages/production/DailyExport";
import AssetSummary from "../pages/fix-asset/AssetSummary";
import AssetMovement from "../pages/fix-asset/AssetMovement";
import SewingContract from "../pages/contractual-works/SewingContract";
import ContractBilling from "../pages/contractual-works/ContractBilling";
import AddNewUser from "../pages/user-management/AddNewUser";
import UserPermission from "../pages/user-management/UserPermission";
import UserList from "../pages/user-management/UserList";
import ApprovalRequestReceived from "../pages/debit-note/RequestedDebitNotes";
import EditDebitNote from "../pages/debit-note/EditDebitNote";
import ViewDebitNote from "../pages/debit-note/ViewDebitNote";
import DebitNoteLists from "../pages/debit-note/DebitNoteList";
import DebitNote from "../pages/debit-note/NewDebitNote";
import PartyWiseView from "../pages/partyWiseView/PartyWiseView";

const routers = createBrowserRouter([
    {
        path: "/",
        element: <Root />,
        children: [
            {
                index: true,
                element: <Navigate to="/login" replace />,
            },
            {
                path: "login",
                element: <Login />,
            },
            {
                path: "dashboard",
                element: <Sidebar />,
                children: [
                    {
                        path: "home",
                        element: <Home />
                    },
                    {
                        path: "knitting-order",
                        element: <KnittingOrders />
                    },
                    {
                        path: "dyeing-order",
                        element: <DyeingOrders />
                    },
                    {
                        path: "aop-order",
                        element: <AopOrders />
                    },
                    {
                        path: "yarn-dye-order",
                        element: <YarnDyeingOrders />
                    },
                    {
                        path: "style-requirement",
                        element: <Summary />
                    },
                    {
                        path: "factory-balance-comparison",
                        element: <FactoryComparison />
                    },
                    {
                        path: "report-studio",
                        element: <ReportStudio />
                    },

                    {
                        path: "productionsummary",
                        element: <ProductionSummary />
                    },
                    
                    {
                        path: "daily-production/cutting",
                        element: <DailyCutting />
                    },
                    {
                        path: "daily-production/sewing",
                        element: <DailySewing />
                    },
                    {
                        path: "daily-production/finishing",
                        element: <DailyFinishing />
                    },
                    {
                        path: "daily-production/export",
                        element: <DailyExport />
                    },
                    {
                        path: "asset-summary",
                        element: <AssetSummary />
                    },
                    {
                        path: "asset-movement",
                        element: <AssetMovement />
                    },
                    {
                        path: "sewing-contract",
                        element: <SewingContract />
                    },
                    {
                        path: "contract-billing",
                        element: <ContractBilling />
                    },
                    {
                        // ADJUST allowed roles if AUDITOR (or another role) should also manage users
                        path: "new-user",
                        element: <AddNewUser />
                         
                    },
                    {
                        path: "user-permission/:userId/:userName",
                        element: <UserPermission />
                    },
                    {
                        path: "user-list",
                        element: <UserList />
                    },
                    {
                        path: "debit-note",
                        element: <DebitNote />
                    },
                    {
                        path: "debit-note/list",
                        element: <DebitNoteLists />
                    },
                    {
                        path: "debit-notes/:id",
                        element: <ViewDebitNote />
                    },
                    {
                        path: "edit-debit-notes/:id",
                        element: <EditDebitNote />
                    },
                    {
                        path: "debit-note/requested",
                        element: <ApprovalRequestReceived />
                    },

                    
                    {
                        // ADJUST allowed roles if AUDITOR (or another role) should also manage users
                        path: "party-wise-view",
                        element: <PartyWiseView />
                        
                    },
                ]
            },
        ],
    },
]);

export default routers;