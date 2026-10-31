import { Link, Outlet, useLocation } from "react-router-dom";
import { useState, useMemo } from "react";
import {
    LayoutDashboard,
    Package,
    FileText,
    PlusCircle,
    PanelLeftClose,
    PanelLeftOpen,
    X,
    Bell,
    ChevronDown,
    UserRoundPlus,
    ZoomIn,
    ZoomOut,
    Users,
    ClipboardList,
    ArrowLeftRight,
    Factory,
    FilePlus,
    SlidersHorizontal,
    RotateCcw
} from "lucide-react";
import UseUserRoles from "../hooks/all-users/UseUserRoles";
import { useAuth } from "../auth/AuthContext";

/**
 * Modern Thread/Yarn Cone Icon
 */
function ModernThreadIcon({ size = 18, className = "" }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M8 3h8l2 15a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3L8 3z" />
            <path d="M7.5 7h9" opacity="0.6" />
            <path d="M7 11h10" opacity="0.6" />
            <path d="M6.5 15h11" opacity="0.6" />
            <ellipse cx="12" cy="3" rx="4" ry="1.5" />
            <ellipse cx="12" cy="21" rx="6" ry="1.5" />
        </svg>
    );
}

const Sidebar = () => {
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(100);

    const { user } = useAuth();
    const { sections = {} } = UseUserRoles() || {};

    const isActive = (path) => location.pathname === path;

    // Zoom handlers
    const updateZoom = (val) => {
        const clamped = Math.min(200, Math.max(40, Number(val) || 100));
        setZoomLevel(clamped);
    };

    const handleZoomStep = (delta) => {
        updateZoom(zoomLevel + delta);
    };

    // Sub-items definitions
    const yarnSubItems = [
        { path: "/dashboard/yarn", label: "Yarn Purchase", icon: Package },
        { path: "/dashboard/spinning-yarn-movement", label: "Yarn Movement Spinning", icon: Package },
        { path: "/dashboard/yarn/movement", label: "Raw Yarn Movement", icon: Package },
        { path: "/dashboard/yarn/stock", label: "Raw Yarn Stock", icon: Package },
        { path: "/dashboard/yarndyed/movement", label: "Yarn Dyed Movement", icon: Package },
        { path: "/dashboard/yarndyed/stock", label: "Yarn Dyed Stock", icon: Package },
    ];

    const orderSubItems = [
        { path: "/dashboard/knitting-order", label: "Knitting Orders", icon: Package, permission: "knittingOrder" },
        { path: "/dashboard/dyeing-order", label: "Dyeing Orders", icon: Package, permission: "dyeingOrder" },
        { path: "/dashboard/yarn-dye-order", label: "Yarn Dyeing Orders", icon: Package, permission: "yarnDyeingOrder" },
        { path: "/dashboard/aop-order", label: "AOP Orders", icon: Package, permission: "aopOrder" },
    ];

    const movementSubItems = [
        { path: "/dashboard/challan/aop", label: "AOP Challan", icon: Package, permission: "aopOrder" },
        { path: "/dashboard/challan/dyeing", label: "Dyeing Challan", icon: Package, permission: "dyeingOrder" },
        { path: "/dashboard/challan/knitting", label: "Knitting Challan", icon: Package, permission: "knittingOrder" },
    ];

    const othersSubItems = [
        { path: "/dashboard/challan/others/compacting", label: "Compacting", icon: Package },
        { path: "/dashboard/challan/others/heat-set", label: "Heat Set", icon: Package },
        { path: "/dashboard/challan/others/trumble", label: "Trumble", icon: Package },
        { path: "/dashboard/challan/others/re-process", label: "Re-Process", icon: Package },
    ];

    const misSubItems = [
        { path: "/dashboard/mis/glance", label: "At A Glance (Stock)", icon: FileText },
    ];

    const dailyProductionSubItems = [
        { path: "/dashboard/productionsummary", label: "Summary Overview", icon: PlusCircle },
        { path: "/dashboard/daily-production/cutting", label: "Cutting Production", icon: Package },
        { path: "/dashboard/daily-production/sewing", label: "Sewing Production", icon: Package },
        { path: "/dashboard/daily-production/finishing", label: "Finishing Production", icon: Package },
        { path: "/dashboard/daily-production/export", label: "Export Shipment", icon: Package },
    ];

    const assetSubItems = [
        { path: "/dashboard/asset-summary", label: "Asset Summary", icon: ClipboardList },
        { path: "/dashboard/asset-movement", label: "Asset Movement", icon: ArrowLeftRight },
    ];

    const contractSubItems = [
        { path: "/dashboard/contract-billing", label: "Contract Manu. Bill", icon: Factory },
        { path: "/dashboard/sewing-contract", label: "Partial Process Control", icon: Factory },
    ];

    const userSubItems = [
        { path: "/dashboard/new-user", label: "Add New User", icon: UserRoundPlus, permission: "addNewUser" },
        { path: "/dashboard/user-list", label: "User Directory & Roles", icon: Users, permission: "setUserPermission" },
    ];

    const workOrderSubItems = [
        { path: "/dashboard/pending-work-orders", label: "My Work Orders", icon: FileText, permission: "seeMyWorkOrders" },
        { path: "/dashboard/requested-work-orders", label: "Requested Orders", icon: ClipboardList, permission: "seeRequestedWorkOrders" },
        { path: "/dashboard/high-loss-job", label: "Work Order Analysis", icon: FileText, permission: "workOrderAnalysis" }
    ];

    const debitNoteSubItems = [
        { path: "/dashboard/debit-note", label: "Create Debit Note", icon: FilePlus },
        { path: "/dashboard/debit-note/list", label: "Debit Note Lists", icon: FileText },
        { path: "/dashboard/debit-note/requested", label: "Requested Debit Notes", icon: ClipboardList },
    ];

    const topNavItems = [
        sections?.styleRequirements?.bookingView && { path: "/dashboard/style-requirement", label: "Style Requirements", icon: PlusCircle },
        sections?.styleRequirements?.bookingView && { path: "/dashboard/factory-balance-comparison", label: "Compare Factory Stock", icon: PlusCircle },
        sections?.styleRequirements?.bookingView && { path: "/dashboard/report-studio", label: "Report Studio", icon: PlusCircle },
    ].filter(Boolean);

    const bottomNavItems = [
        { path: "/dashboard/party-wise-view", label: "Party Wise View", icon: UserRoundPlus },
    ];

    // Dropdown state tracking
    const [openMenus, setOpenMenus] = useState(() => ({
        yarn: yarnSubItems.some(i => i.path === location.pathname),
        orders: orderSubItems.some(i => i.path === location.pathname),
        movement: movementSubItems.some(i => i.path === location.pathname) || othersSubItems.some(i => i.path === location.pathname),
        others: othersSubItems.some(i => i.path === location.pathname),
        mis: misSubItems.some(i => i.path === location.pathname),
        dailyProduction: dailyProductionSubItems.some(i => i.path === location.pathname),
        user: userSubItems.some(i => i.path === location.pathname),
        asset: assetSubItems.some(i => i.path === location.pathname),
        contract: contractSubItems.some(i => i.path === location.pathname),
        workOrders: workOrderSubItems.some(i => i.path === location.pathname),
        debitNote: debitNoteSubItems.some(i => i.path === location.pathname),
    }));

    const toggleMenu = (key) => {
        if (isCollapsed) setIsCollapsed(false);
        setOpenMenus(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Filtered lists based on user role sections
    const visibleOrderItems = useMemo(() => {
        if (!sections?.workOrders) return [];
        return orderSubItems.filter(item => !item.permission || sections.workOrders?.[item.permission] === true);
    }, [sections]);

    const visibleMovementItems = useMemo(() => {
        if (!sections?.movementBilling) return [];
        return movementSubItems.filter(item => !item.permission || sections.movementBilling?.[item.permission] === true);
    }, [sections]);

    const visibleUserItems = useMemo(() => {
        if (!sections?.userManagement) return [];
        return userSubItems.filter(item => !item.permission || sections.userManagement?.[item.permission] === true);
    }, [sections]);

    const visibleWorkOrderItems = useMemo(() => {
        return workOrderSubItems.filter(item => !item.permission || sections?.workOrders?.[item.permission] === true);
    }, [sections]);

    // Active state checkers
    const isYarnActive = yarnSubItems.some(i => isActive(i.path));
    const isOrdersActive = orderSubItems.some(i => isActive(i.path));
    const isMovementActive = movementSubItems.some(i => isActive(i.path)) || othersSubItems.some(i => isActive(i.path));
    const isOthersActive = othersSubItems.some(i => isActive(i.path));
    const isMisActive = misSubItems.some(i => isActive(i.path));
    const isDailyActive = dailyProductionSubItems.some(i => isActive(i.path));
    const isAssetActive = assetSubItems.some(i => isActive(i.path));
    const isContractActive = contractSubItems.some(i => isActive(i.path));
    const isUserActive = userSubItems.some(i => isActive(i.path));
    const isWorkOrdersActive = workOrderSubItems.some(i => isActive(i.path));
    const isDebitActive = debitNoteSubItems.some(i => isActive(i.path));

    // Dynamic Page Titles
    const getPageInfo = () => {
        const path = location.pathname;

        if (path.includes('/factory-wise-report/')) {
            const factoryName = path.split('/factory-wise-report/')[1];
            return { title: `Factory Report: ${factoryName}`, subtitle: "Detailed production and stock audit" };
        }

        if (path.includes('style-requirement')) return { title: 'Style & Requirements', subtitle: 'Fabric specifications and booking requirements' };
        if (path.includes('audits')) return { title: 'System Audits', subtitle: 'Compliance and inventory audit records' };
        if (path.includes('cutting') && !path.includes('daily-production')) return { title: 'Fabric Cutting Log', subtitle: 'Daily cutting room efficiency' };
        if (path.includes('new-user')) return { title: 'Create User Account', subtitle: 'Provision new staff credentials & roles' };
        if (path.includes('user-list')) return { title: 'User Management', subtitle: 'Configure user permissions and access levels' };
        if (path.includes('asset-summary')) return { title: 'Asset Summary', subtitle: 'Fixed assets register and valuations' };
        if (path.includes('asset-movement')) return { title: 'Asset Movement', subtitle: 'Transfer and relocation history' };
        if (path.includes('external-manufacturing')) return { title: 'Contract Manufacturing', subtitle: 'Outsourced stitching and process lines' };
        if (path.includes('contract-billing')) return { title: 'Contract Manufacturing Billing', subtitle: 'Manage external vendor invoices' };
        if (path.includes('sewing-contract')) return { title: 'Partial Process Control', subtitle: 'Subcontracted operations' };
        if (path.includes('party-wise-view')) return { title: 'Party-Wise View', subtitle: 'Supplier and buyer breakdown' };
        if (path.includes('management-view')) return { title: 'Executive Overview', subtitle: 'High-level business analytics' };
        if (path.includes('pending-work-orders')) return { title: 'My Work Orders', subtitle: 'Track your assigned operations' };
        if (path.includes('requested-work-orders')) return { title: 'Requested Orders', subtitle: 'Orders awaiting manager review' };
        if (path.includes('high-loss-job')) return { title: 'Work Order Analysis', subtitle: 'Material variance and loss analysis' };
        if (path.includes('debit-note/create') || path === '/dashboard/debit-note') return { title: 'Create Debit Note', subtitle: 'Issue financial debit claims' };
        if (path.includes('debit-note/list')) return { title: 'Debit Notes Register', subtitle: 'Comprehensive audit list' };
        if (path.includes('debit-note/requested')) return { title: 'Requested Debit Notes', subtitle: 'Pending authorization notes' };

        const routeMap = {
            '/dashboard/home': { title: 'Operational Dashboard', subtitle: 'Live overview of factory lines, orders & materials' },
            '/dashboard/yarn': { title: 'Yarn Procurement', subtitle: 'Inbound PO statuses and schedules' },
            '/dashboard/yarn/movement': { title: 'Raw Yarn Movement', subtitle: 'Floor-to-spinning transfer ledger' },
            '/dashboard/yarn/stock': { title: 'Raw Yarn Stock', subtitle: 'Real-time warehouse lot inventory' },
            '/dashboard/spinning-yarn-movement': { title: 'Spinning Yarn Movement', subtitle: 'Spinning stage batch transfers' },
            '/dashboard/yarndyed/movement': { title: 'Dyed Yarn Movement', subtitle: 'Yarn dye-house transfer manifests' },
            '/dashboard/yarndyed/stock': { title: 'Dyed Yarn Stock', subtitle: 'Finished dyed yarn cones inventory' },
            '/dashboard/knitting-order': { title: 'Knitting Work Orders', subtitle: 'Machine allocation and fabric output' },
            '/dashboard/dyeing-order': { title: 'Fabric Dyeing Orders', subtitle: 'Batch dye lot queues and recipe status' },
            '/dashboard/yarn-dye-order': { title: 'Yarn Dyeing Orders', subtitle: 'Hank and cone dye programs' },
            '/dashboard/aop-order': { title: 'AOP Print Orders', subtitle: 'All-over printing production jobs' },
            '/dashboard/productionsummary': { title: 'Production Summary', subtitle: 'Consolidated end-to-end throughput' },
            '/dashboard/daily-production/cutting': { title: 'Daily Cutting Report', subtitle: 'Fabric lays and cut piece counts' },
            '/dashboard/daily-production/sewing': { title: 'Daily Sewing Output', subtitle: 'Line-wise garment assembly metrics' },
            '/dashboard/daily-production/finishing': { title: 'Daily Finishing & Packing', subtitle: 'Quality check, pressing and packing' },
            '/dashboard/daily-production/export': { title: 'Export & Shipment', subtitle: 'Container staging and customs dispatch' },
            '/dashboard/mis/glance': { title: 'MIS Dashboard (Stock)', subtitle: 'Consolidated management intelligence' },
            '/dashboard/factory-balance-comparison': { title: 'Factory Stock Comparison', subtitle: 'Cross-facility inventory balancing' },
            '/dashboard/report-studio': { title: 'Report Studio', subtitle: 'Custom business intelligence reports' },
        };

        return routeMap[path] || { title: 'Textile ERP System', subtitle: 'Factory Operations & Audit Portal' };
    };

    const pageInfo = getPageInfo();
    const scale = zoomLevel / 100;

    // Helper: Navigation item renderer
    const renderNavItem = (item) => {
        const Icon = item.icon || Package;
        const active = isActive(item.path);

        return (
            <li key={item.path}>
                <Link
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 no-underline ${
                        active
                            ? "bg-blue-600 text-white shadow-sm shadow-blue-500/25 font-semibold"
                            : "text-white hover:text-white hover:bg-slate-800/80"
                    } ${isCollapsed ? "justify-center px-2" : ""}`}
                    title={isCollapsed ? item.label : undefined}
                >
                    <Icon size={18} className={`shrink-0 transition-transform duration-200 ${active ? "text-white" : "text-white group-hover:text-white"}`} />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                    {active && !isCollapsed && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/90" />
                    )}
                </Link>
            </li>
        );
    };

    // Helper: Dropdown group renderer
    const renderDropdown = ({
        id,
        label,
        icon: Icon,
        isOpen,
        isActiveParent,
        items,
        extraContent = null
    }) => {
        if (!items || items.length === 0) return null;

        return (
            <li key={id} className="relative">
                <button
                    onClick={() => toggleMenu(id)}
                    className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                        isActiveParent
                            ? "bg-slate-800/90 text-white font-semibold border-l-2 border-blue-500"
                            : "text-white hover:text-white hover:bg-slate-800/60"
                    } ${isCollapsed ? "justify-center px-2" : "justify-between"}`}
                    title={isCollapsed ? label : undefined}
                >
                    <div className="flex items-center gap-3 min-w-0">
                        <Icon size={18} className={`shrink-0 transition-colors ${isActiveParent ? "text-white" : "text-white group-hover:text-white"}`} />
                        {!isCollapsed && <span className="truncate">{label}</span>}
                    </div>

                    {!isCollapsed && (
                        <div className="flex items-center gap-1.5 ml-auto">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-white font-normal">
                                {items.length}
                            </span>
                            <ChevronDown
                                size={14}
                                className={`text-white transition-transform duration-200 ${isOpen ? "rotate-180 text-white" : ""}`}
                            />
                        </div>
                    )}
                </button>

                {isOpen && !isCollapsed && (
                    <div className="mt-1 ml-3.5 pl-3 border-l border-slate-800/80 space-y-0.5 py-1 animate-in fade-in duration-150">
                        {items.map(subItem => {
                            const subActive = isActive(subItem.path);

                            return (
                                <Link
                                    key={subItem.path}
                                    to={subItem.path}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={`group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-normal transition-all duration-150 no-underline ${
                                        subActive
                                            ? "bg-blue-600/15 text-white font-medium"
                                            : "text-white hover:text-white hover:bg-slate-800/40"
                                    }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full transition-colors ${subActive ? "bg-blue-400 scale-125" : "bg-slate-600 group-hover:bg-slate-400"}`} />
                                    <span className="truncate">{subItem.label}</span>
                                </Link>
                            );
                        })}
                        {extraContent}
                    </div>
                )}
            </li>
        );
    };

    // Section Category Header
    const renderSectionHeader = (title) => {
        if (isCollapsed) return <div className="my-2 border-t border-slate-800/60" />;
        return (
            <li className="pt-4 pb-1 px-3">
                <span className="text-[10px] font-semibold tracking-wider text-white uppercase">
                    {title}
                </span>
            </li>
        );
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans text-slate-800 antialiased">
            {/* Mobile Backdrop */}
            {isMobileMenuOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 transition-opacity duration-300"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                    fixed lg:static inset-y-0 left-0 z-50
                    ${isCollapsed ? "lg:w-20" : "lg:w-55"} w-60
                    shrink-0 bg-slate-700 border-r border-slate-800
                    flex flex-col text-white
                    transform transition-all duration-300 ease-in-out shadow-2xl lg:shadow-none
                    ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
            >
                {/* Brand Header */}
                <div className="h-16 px-4 border-b border-slate-700/80 bg-slate-700/40 border-b bg-slate-800/40 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 p-0.5 shadow-lg shadow-blue-500/20 shrink-0 flex items-center justify-center">
                            <div className="w-full h-full bg-slate-700 rounded-[10px] flex items-center justify-center">
                                <span className="font-black text-transparent bg-clip-text bg-gradient-to-br from-blue-400 to-cyan-300 text-sm tracking-tight">
                                    ERP
                                </span>
                            </div>
                        </div>
                        {!isCollapsed && (
                            <div className="flex-1 min-w-0 leading-tight">
                                <div className="flex items-center gap-1.5">
                                    <h1 className="text-sm font-bold text-white tracking-tight truncate">SM Sourcing</h1>
                                </div>
                                <p className="text-white text-[11px] truncate">Operations Portal</p>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden p-1.5 text-white hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                        aria-label="Close sidebar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Navigation Items */}
                <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                    <ul className="space-y-1">
                        {/* CORE */}
                        {renderSectionHeader("Main")}
                        {renderNavItem({ path: "/dashboard/home", label: "Dashboard Overview", icon: LayoutDashboard })}

                        {/* YARN & MATERIALS */}
                        {renderSectionHeader("Yarn & Inventory")}
                        {renderDropdown({
                            id: "yarn",
                            label: "Yarn Management",
                            icon: ModernThreadIcon,
                            isOpen: openMenus.yarn,
                            isActiveParent: isYarnActive,
                            items: yarnSubItems,
                        })}

                        {/* PRODUCTION & ORDERS */}
                        {renderSectionHeader("Manufacturing")}
                        {sections?.workOrders && renderDropdown({
                            id: "orders",
                            label: "Production Orders",
                            icon: Package,
                            isOpen: openMenus.orders,
                            isActiveParent: isOrdersActive,
                            items: visibleOrderItems,
                        })}

                        {renderDropdown({
                            id: "dailyProduction",
                            label: "Daily Production",
                            icon: Factory,
                            isOpen: openMenus.dailyProduction,
                            isActiveParent: isDailyActive,
                            items: dailyProductionSubItems,
                        })}

                        {sections?.movementBilling && renderDropdown({
                            id: "movement",
                            label: "Challan Movement",
                            icon: ArrowLeftRight,
                            isOpen: openMenus.movement,
                            isActiveParent: isMovementActive,
                            items: visibleMovementItems,
                            extraContent: (
                                <div className="mt-1 pt-1 border-t border-slate-800/60">
                                    <button
                                        onClick={() => setOpenMenus(p => ({ ...p, others: !p.others }))}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                                            isOthersActive ? "text-white font-medium" : "text-white hover:text-white"
                                        }`}
                                    >
                                        <span>Other Finishing Lines</span>
                                        <ChevronDown size={12} className={`transition-transform ${openMenus.others ? "rotate-180" : ""}`} />
                                    </button>
                                    {openMenus.others && (
                                        <div className="pl-3 mt-1 space-y-0.5 border-l border-slate-800">
                                            {othersSubItems.map(item => (
                                                <Link
                                                    key={item.path}
                                                    to={item.path}
                                                    onClick={() => setIsMobileMenuOpen(false)}
                                                    className={`block px-2 py-1 rounded text-[11px] no-underline ${
                                                        isActive(item.path) ? "text-white font-medium" : "text-white hover:text-white"
                                                    }`}
                                                >
                                                    {item.label}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {/* OPERATIONS & WORK ORDERS */}
                        {renderSectionHeader("Operations & Planning")}
                        {topNavItems.map(item => renderNavItem(item))}

                        {renderDropdown({
                            id: "workOrders",
                            label: "Work Orders Hub",
                            icon: FileText,
                            isOpen: openMenus.workOrders,
                            isActiveParent: isWorkOrdersActive,
                            items: visibleWorkOrderItems,
                        })}

                        {renderDropdown({
                            id: "contract",
                            label: "Contract Manufacturing",
                            icon: Factory,
                            isOpen: openMenus.contract,
                            isActiveParent: isContractActive,
                            items: contractSubItems,
                        })}

                        {/* FINANCE & ASSETS */}
                        {renderSectionHeader("Finance & Assets")}
                        {renderDropdown({
                            id: "debitNote",
                            label: "Debit Notes",
                            icon: FilePlus,
                            isOpen: openMenus.debitNote,
                            isActiveParent: isDebitActive,
                            items: debitNoteSubItems,
                        })}

                        {renderDropdown({
                            id: "asset",
                            label: "Fixed Assets",
                            icon: ClipboardList,
                            isOpen: openMenus.asset,
                            isActiveParent: isAssetActive,
                            items: assetSubItems,
                        })}

                        {/* ADMINISTRATION */}
                        {renderSectionHeader("Administration")}
                        {sections?.mis && renderDropdown({
                            id: "mis",
                            label: "MIS Reports",
                            icon: SlidersHorizontal,
                            isOpen: openMenus.mis,
                            isActiveParent: isMisActive,
                            items: misSubItems,
                        })}

                        {sections?.userManagement && renderDropdown({
                            id: "user",
                            label: "User Access Control",
                            icon: Users,
                            isOpen: openMenus.user,
                            isActiveParent: isUserActive,
                            items: visibleUserItems,
                        })}

                        {bottomNavItems.map(item => renderNavItem(item))}
                    </ul>
                </nav>

                {/* Sidebar Footer */}
                <div className="p-3 border-t border-slate-800/80 bg-slate-950/30">
                    {!isCollapsed ? (
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 border border-slate-800">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                                {user?.name?.[0] || "A"}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{user?.name || "System Admin"}</p>
                                
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center" title={user?.name || "Admin"}>
                                {user?.name?.[0] || "A"}
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden w-full bg-slate-100">
                {/* Modern Top Header */}
                <header className="h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200/90 px-4 lg:px-8 flex items-center justify-between shrink-0 z-20 shadow-xs">
                    {/* Left: Toggle & Page Title */}
                    <div className="flex items-center gap-3.5 min-w-0">
                        <button
                            onClick={() => {
                                if (window.innerWidth < 1024) setIsMobileMenuOpen(p => !p);
                                else setIsCollapsed(p => !p);
                            }}
                            className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 hover:bg-slate-200/80 text-slate-700 flex items-center justify-center transition-all duration-150 shrink-0"
                            aria-label="Toggle sidebar"
                            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        >
                            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                        </button>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h2 className="text-base lg:text-lg font-bold text-slate-900 tracking-tight truncate">
                                    {pageInfo.title}
                                </h2>
                            </div>
                            <p className="hidden sm:block text-xs text-slate-500 truncate font-normal">
                                {pageInfo.subtitle}
                            </p>
                        </div>
                    </div>

                    {/* Right Controls */}
                    <div className="flex items-center gap-2.5">
                        {/* Quick Viewport Zoom Controls */}
                        <div className="flex items-center bg-slate-100/90 border border-slate-200 rounded-lg p-1 text-slate-700 shadow-2xs">
                            <button
                                onClick={() => handleZoomStep(-10)}
                                disabled={zoomLevel <= 40}
                                className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                                title="Zoom Out (Ctrl -)"
                            >
                                <ZoomOut size={15} />
                            </button>

                            <div className="px-2 flex items-center gap-1">
                                <select
                                    value={zoomLevel}
                                    onChange={(e) => updateZoom(e.target.value)}
                                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                                >
                                    <option value="40">40%</option>
                                    <option value="50">50%</option>
                                    <option value="60">60%</option>
                                    <option value="70">70%</option>
                                    <option value="80">80%</option>
                                    <option value="90">90%</option>
                                    <option value="100">100%</option>
                                    <option value="110">110%</option>
                                    <option value="125">125%</option>
                                    <option value="150">150%</option>
                                    <option value="175">175%</option>
                                    <option value="200">200%</option>
                                </select>
                            </div>

                            <button
                                onClick={() => handleZoomStep(10)}
                                disabled={zoomLevel >= 200}
                                className="p-1 hover:bg-white rounded text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                                title="Zoom In (Ctrl +)"
                            >
                                <ZoomIn size={15} />
                            </button>

                            {zoomLevel !== 100 && (
                                <button
                                    onClick={() => updateZoom(100)}
                                    className="p-1 ml-0.5 hover:bg-white text-blue-600 rounded transition-colors"
                                    title="Reset Zoom to 100%"
                                >
                                    <RotateCcw size={13} />
                                </button>
                            )}
                        </div>

                        {/* Notifications */}
                        <button
                            className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label="View notifications"
                        >
                            <Bell size={18} />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
                        </button>

                        {/* User Profile Pill */}
                        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                                {user?.name?.[0] || "A"}
                            </div>
                            <div className="hidden md:block leading-tight text-left">
                                <span className="block text-xs font-semibold text-slate-800 leading-none">
                                    {user?.name || "System Admin"}
                                </span>
                                <span className="text-[10px] text-slate-400 font-normal">Superuser</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/*
                  Outlet viewport with zoom.
                  FIX: CSS `zoom` replaces `transform: scale()`. A transform turns this wrapper
                  into the containing block for every `position: fixed` descendant, which
                  misplaced fixed/sticky form footers (like the work order Cancel / Submit bar).
                  `zoom` scales the layout without creating that containing block, so the
                  width / minHeight compensation is no longer needed.
                */}
                <div className="flex-1 overflow-auto bg-slate-100/70">
                    <div
                        className="p-4 lg:p-6 w-full min-h-full"
                        style={{ zoom: scale }}
                    >
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Sidebar;