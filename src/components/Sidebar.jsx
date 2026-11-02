import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
    LayoutDashboard,
    Package,
    FileText,
    Factory,
    ArrowLeftRight,
    ClipboardList,
    Users,
    UserRoundPlus,
    FilePlus,
    SlidersHorizontal,
    ChevronDown,
    Bell,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    Menu,
    X,
    Boxes,
    ChartNoAxesCombined,
    Wallet,
    Settings,
    Building2,
    Truck,
    ClipboardCheck,
    FileSpreadsheet,
    Layers3,
    ScanLine,
    Landmark,
} from "lucide-react";

import UseUserRoles from "../hooks/all-users/UseUserRoles";
import { useAuth } from "../auth/AuthContext";

// --------------------------------------------------
// Custom yarn icon
// --------------------------------------------------

const ModernThreadIcon = ({ size = 19, className = "" }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12 2.5C8.7 2.5 6 5.1 6 8.3C6 10.4 7.1 12.1 8.5 13.3L5.5 20.5H18.5L15.5 13.3C16.9 12.1 18 10.4 18 8.3C18 5.1 15.3 2.5 12 2.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M8 7.5C10 9 14 9 16 7.5M7.5 10.5C10 12 14 12 16.5 10.5M9 13.2C10.8 14 13.2 14 15 13.2"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
        />
        <path
            d="M12 2.5V1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
        />
    </svg>
);

// --------------------------------------------------
// Reusable menu link
// --------------------------------------------------

const MegaMenuLink = ({ item, onNavigate, isActive }) => {
    const Icon = item.icon;

    return (
        <Link
            to={item.path}
            onClick={onNavigate}
            className={`
                group flex items-center gap-3 rounded-lg px-3 py-2.5
                transition-all duration-150
                ${isActive
                    ? "bg-[#eaf0f7] text-[#173c63]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#173c63]"
                }
            `}
        >
            {Icon && (
                <span
                    className={`
                        flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                        ${isActive
                            ? "bg-white text-[#173c63]"
                            : "bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-[#173c63]"
                        }
                    `}
                >
                    <Icon size={16} />
                </span>
            )}

            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">
                    {item.label}
                </span>

                {item.description && (
                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                        {item.description}
                    </span>
                )}
            </span>
        </Link>
    );
};

// --------------------------------------------------
// Main Layout
// --------------------------------------------------

const Sidebar = () => {
    const location = useLocation();

    const { user } = useAuth();
    const { sections = {} } = UseUserRoles() || {};

    const [openMenu, setOpenMenu] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(100);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const currentPath = location.pathname;

    // Close menus whenever the route changes.
    useEffect(() => {
        setOpenMenu(null);
        setMobileMenuOpen(false);
    }, [location.pathname]);

    // --------------------------------------------------
    // Zoom
    // --------------------------------------------------

    const handleZoomIn = () => {
        setZoomLevel((previous) => Math.min(previous + 10, 200));
    };

    const handleZoomOut = () => {
        setZoomLevel((previous) => Math.max(previous - 10, 40));
    };

    const handleZoomReset = () => {
        setZoomLevel(100);
    };

    const scale = zoomLevel / 100;

    // --------------------------------------------------
    // Active route
    // --------------------------------------------------

    const isPathActive = (path) => {
        if (!path) return false;

        return (
            currentPath === path ||
            (path !== "/dashboard" && currentPath.startsWith(`${path}/`))
        );
    };

    const isGroupActive = (items = []) =>
        items.some((item) => isPathActive(item.path));

    // --------------------------------------------------
    // Page title
    // --------------------------------------------------

    const pageTitles = {
        "/dashboard": "Dashboard",
        "/dashboard/home": "Dashboard",
        "/dashboard/yarn": "Yarn Purchase",
        "/dashboard/spinning-yarn-movement": "Yarn Movement Spinning",
        "/dashboard/yarn/movement": "Raw Yarn Movement",
        "/dashboard/yarn/stock": "Raw Yarn Stock",
        "/dashboard/yarndyed/movement": "Yarn Dyed Movement",
        "/dashboard/yarndyed/stock": "Yarn Dyed Stock",

        "/dashboard/knitting-order": "Knitting Orders",
        "/dashboard/dyeing-order": "Dyeing Orders",
        "/dashboard/yarn-dye-order": "Yarn Dyeing Orders",
        "/dashboard/aop-order": "AOP Orders",

        "/dashboard/challan/aop": "AOP Challan",
        "/dashboard/challan/dyeing": "Dyeing Challan",
        "/dashboard/challan/knitting": "Knitting Challan",
        "/dashboard/challan/others/compacting": "Compacting Challan",
        "/dashboard/challan/others/re-process": "Re-Process Challan",

        "/dashboard/style-requirement": "Style Requirements",
        "/dashboard/factory-balance-comparison": "Compare Factory Stock",
        "/dashboard/report-studio": "Report Studio",
        "/dashboard/style/reconciliation": "Style Reconciliation",
        "/dashboard/balance-sheet": "Balance Sheet",

        "/dashboard/productionsummary": "Production Summary",
        "/dashboard/daily-production/cutting": "Cutting Production",
        "/dashboard/daily-production/sewing": "Sewing Production",
        "/dashboard/daily-production/finishing": "Finishing Production",
        "/dashboard/daily-production/export": "Export Shipment",

        "/dashboard/asset-summary": "Asset Summary",
        "/dashboard/asset-movement": "Asset Movement",
        "/dashboard/contract-billing": "Contract Manufacturing Bill",
        "/dashboard/sewing-contract": "Partial Process Control",

        "/dashboard/new-user": "Add New User",
        "/dashboard/user-list": "User Directory & Roles",
        "/dashboard/party-wise-view": "Party Wise View",

        "/dashboard/debit-note": "Create Debit Note",
        "/dashboard/debit-note/list": "Debit Note Lists",
        "/dashboard/debit-note/requested": "Requested Debit Notes",

        "/dashboard/mis/glance": "At A Glance",
        "/dashboard/upload": "Upload Data",
    };

    const pageTitle =
        pageTitles[currentPath] ||
        (currentPath.includes("/dashboard/debit-notes/")
            ? "Debit Note Details"
            : currentPath.includes("/dashboard/edit-debit-notes/")
                ? "Edit Debit Note"
                : currentPath.includes("/dashboard/new-order/")
                    ? "New Work Order"
                    : "SM ERP");

    // --------------------------------------------------
    // Menu definitions
    // --------------------------------------------------

    const yarnItems = [
        {
            path: "/dashboard/yarn",
            label: "Yarn Purchase",
            description: "Yarn purchase records",
            icon: Package,
        },
        {
            path: "/dashboard/spinning-yarn-movement",
            label: "Yarn Movement Spinning",
            description: "Spinning yarn movement",
            icon: ArrowLeftRight,
        },
        {
            path: "/dashboard/yarn/movement",
            label: "Raw Yarn Movement",
            description: "Raw yarn movement records",
            icon: ArrowLeftRight,
        },
        {
            path: "/dashboard/yarn/stock",
            label: "Raw Yarn Stock",
            description: "Current raw yarn stock",
            icon: Boxes,
        },
        {
            path: "/dashboard/yarndyed/movement",
            label: "Yarn Dyed Movement",
            description: "Dyed yarn movement",
            icon: ArrowLeftRight,
        },
        {
            path: "/dashboard/yarndyed/stock",
            label: "Yarn Dyed Stock",
            description: "Current dyed yarn stock",
            icon: Boxes,
        },
    ];

    const workOrderItems = [
        {
            path: "/dashboard/knitting-order",
            label: "Knitting Orders",
            icon: ClipboardList,
            permission: "knittingOrder",
        },
        {
            path: "/dashboard/dyeing-order",
            label: "Dyeing Orders",
            icon: ClipboardList,
            permission: "dyeingOrder",
        },
        {
            path: "/dashboard/yarn-dye-order",
            label: "Yarn Dyeing Orders",
            icon: ClipboardList,
            permission: "yarnDyeingOrder",
        },
        {
            path: "/dashboard/aop-order",
            label: "AOP Orders",
            icon: ClipboardList,
            permission: "aopOrder",
        },
    ].filter((item) => sections.workOrders?.[item.permission] === true);

    const movementItems = [
        {
            path: "/dashboard/challan/knitting",
            label: "Knitting Challan",
            icon: FileText,
            permission: "knittingOrder",
        },
        {
            path: "/dashboard/challan/dyeing",
            label: "Dyeing Challan",
            icon: FileText,
            permission: "dyeingOrder",
        },
        {
            path: "/dashboard/challan/aop",
            label: "AOP Challan",
            icon: FileText,
            permission: "aopOrder",
        },
        {
            path: "/dashboard/challan/others/compacting",
            label: "Compacting Challan",
            icon: FileText,
        },
        {
            path: "/dashboard/challan/others/re-process",
            label: "Re-Process Challan",
            icon: FileText,
        },
    ].filter((item) => {
        if (!item.permission) return true;

        return sections.movementBilling?.[item.permission] === true;
    });

    const productionItems = [
        {
            path: "/dashboard/productionsummary",
            label: "Summary Overview",
            icon: ChartNoAxesCombined,
        },
        {
            path: "/dashboard/daily-production/cutting",
            label: "Cutting Production",
            icon: Factory,
        },
        {
            path: "/dashboard/daily-production/sewing",
            label: "Sewing Production",
            icon: Factory,
        },
        {
            path: "/dashboard/daily-production/finishing",
            label: "Finishing Production",
            icon: Factory,
        },
        {
            path: "/dashboard/daily-production/export",
            label: "Export Shipment",
            icon: Truck,
        },
    ];

    const planningItems = [
        ...(sections.styleRequirements?.bookingView === true
            ? [
                {
                    path: "/dashboard/style-requirement",
                    label: "Style Requirements",
                    icon: FileSpreadsheet,
                },
                {
                    path: "/dashboard/factory-balance-comparison",
                    label: "Compare Factory Stock",
                    icon: ArrowLeftRight,
                },
                {
                    path: "/dashboard/report-studio",
                    label: "Report Studio",
                    icon: ChartNoAxesCombined,
                },
            ]
            : []),
        {
            path: "/dashboard/style/reconciliation",
            label: "Style Reconciliation",
            icon: ClipboardCheck,
        },
        {
            path: "/dashboard/balance-sheet",
            label: "Balance Sheet",
            icon: FileSpreadsheet,
        },
    ];

    const financeItems = [
        {
            path: "/dashboard/debit-note",
            label: "Create Debit Note",
            icon: FilePlus,
        },
        {
            path: "/dashboard/debit-note/list",
            label: "Debit Note Lists",
            icon: FileText,
        },
        {
            path: "/dashboard/debit-note/requested",
            label: "Requested Debit Notes",
            icon: ClipboardCheck,
        },
        {
            path: "/dashboard/contract-billing",
            label: "Contract Manufacturing Bill",
            icon: Wallet,
        },
        {
            path: "/dashboard/sewing-contract",
            label: "Partial Process Control",
            icon: Factory,
        },
    ];

    const assetItems = [
        {
            path: "/dashboard/asset-summary",
            label: "Asset Summary",
            icon: Building2,
        },
        {
            path: "/dashboard/asset-movement",
            label: "Asset Movement",
            icon: ArrowLeftRight,
        },
    ];

    const userItems = [
        {
            path: "/dashboard/new-user",
            label: "Add New User",
            icon: UserRoundPlus,
            permission: "addNewUser",
        },
        {
            path: "/dashboard/user-list",
            label: "User Directory & Roles",
            icon: Users,
            permission: "setUserPermission",
        },
    ].filter(
        (item) =>
            sections.userManagement?.[item.permission] === true
    );

    const workManagementItems = [
        {
            path: "/dashboard/party-wise-view",
            label: "Party Wise View",
            icon: Users,
        },
        ...(sections.mis
            ? [
                {
                    path: "/dashboard/mis/glance",
                    label: "At A Glance",
                    icon: ChartNoAxesCombined,
                },
            ]
            : []),
        {
            path: "/dashboard/upload",
            label: "Upload Data",
            icon: FilePlus,
        },
    ];

    // --------------------------------------------------
    // Mega menu configuration
    // --------------------------------------------------

    const menuGroups = useMemo(
        () =>
            [
                {
                    key: "yarn",
                    label: "Yarn & Inventory",
                    icon: Package,
                    columns: [
                        {
                            title: "Yarn Management",
                            description: "Purchase and stock",
                            items: yarnItems,
                        },
                    ],
                },
                {
                    key: "manufacturing",
                    label: "Manufacturing",
                    icon: Factory,
                    columns: [
                        {
                            title: "Work Orders",
                            description: "Production order management",
                            items: workOrderItems,
                        },
                        {
                            title: "Challan & Movement",
                            description: "Factory movement records",
                            items: movementItems,
                        },
                        {
                            title: "Daily Production",
                            description: "Production and shipment",
                            items: productionItems,
                        },
                    ],
                },
                {
                    key: "planning",
                    label: "Planning & Reports",
                    icon: ClipboardList,
                    columns: [
                        {
                            title: "Planning",
                            description: "Style and factory planning",
                            items: planningItems,
                        },
                    ],
                },
                {
                    key: "finance",
                    label: "Finance & Assets",
                    icon: Wallet,
                    columns: [
                        {
                            title: "Finance & Billing",
                            description: "Debit notes and contract billing",
                            items: financeItems,
                        },
                        {
                            title: "Asset Management",
                            description: "Asset records and movement",
                            items: assetItems,
                        },
                    ],
                },
                {
                    key: "administration",
                    label: "Administration",
                    icon: Settings,
                    columns: [
                        {
                            title: "User Management",
                            description: "Users and permissions",
                            items: userItems,
                        },
                        {
                            title: "Management",
                            description: "Business overview and utilities",
                            items: workManagementItems,
                        },
                    ],
                },
            ].filter((group) =>
                group.columns.some((column) => column.items.length > 0)
            ),
        [
            sections,
            workOrderItems.length,
            movementItems.length,
            userItems.length,
            planningItems.length,
        ]
    );

    const toggleMenu = (key) => {
        setOpenMenu((previous) => (previous === key ? null : key));
    };

    // --------------------------------------------------
    // Render
    // --------------------------------------------------

    return (
        <div className="min-h-screen bg-[#f4f6f9] text-slate-800">

            {/* ================= TOP HEADER ================= */}

            <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">

                {/* Main header row */}

                <div className="flex h-[62px] items-center justify-between gap-4 px-5">

                    {/* Brand */}

                    <Link
                        to="/dashboard/home"
                        className="flex shrink-0 items-center gap-3"
                    >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#173c63] text-white shadow-sm">
                            <ModernThreadIcon size={23} />
                        </div>

                        <div className="leading-tight">
                            <h1 className="text-[17px] font-black tracking-tight text-[#173c63]">
                                SM SOURCING
                            </h1>
                            <p className="mt-0.5 text-[9px] font-bold tracking-[2.5px] text-slate-400">
                                ENTERPRISE ERP
                            </p>
                        </div>
                    </Link>

                    {/* Desktop controls */}

                    <div className="hidden items-center gap-3 lg:flex">

                        {/* Zoom controls */}

                        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                            <button
                                onClick={handleZoomOut}
                                title="Zoom out"
                                className="rounded-md p-1.5 text-slate-500 transition hover:bg-white hover:text-[#173c63]"
                            >
                                <ZoomOut size={15} />
                            </button>

                            <span className="min-w-[43px] text-center text-[11px] font-bold tabular-nums text-slate-600">
                                {zoomLevel}%
                            </span>

                            <button
                                onClick={handleZoomIn}
                                title="Zoom in"
                                className="rounded-md p-1.5 text-slate-500 transition hover:bg-white hover:text-[#173c63]"
                            >
                                <ZoomIn size={15} />
                            </button>

                            <button
                                onClick={handleZoomReset}
                                title="Reset zoom"
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-white hover:text-[#173c63]"
                            >
                                <RotateCcw size={13} />
                            </button>
                        </div>

                        {/* Notifications */}

                        <button
                            title="Notifications"
                            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-[#173c63]"
                        >
                            <Bell size={18} />
                            <span className="absolute right-[8px] top-[7px] h-2 w-2 rounded-full border-2 border-white bg-red-500" />
                        </button>

                        {/* User */}

                        <div className="flex items-center gap-2.5 border-l border-slate-200 pl-4">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf0f7] text-sm font-bold text-[#173c63]">
                                {user?.name?.charAt(0)?.toUpperCase() || "U"}
                            </div>

                            <div className="max-w-[150px]">
                                <p className="truncate text-[12px] font-bold text-slate-700">
                                    {user?.name || "User"}
                                </p>
                                <p className="text-[10px] text-slate-400">
                                    ERP Account
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Mobile menu button */}

                    <button
                        onClick={() => setMobileMenuOpen((previous) => !previous)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
                    >
                        {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
                    </button>
                </div>

                {/* ================= HORIZONTAL NAVIGATION ================= */}

                <div className="hidden border-t border-slate-100 bg-white lg:block">
                    <div className="flex h-[47px] items-center gap-1 px-5">

                        {/* Dashboard direct link */}

                        <Link
                            to="/dashboard/home"
                            onClick={() => setOpenMenu(null)}
                            className={`
                                flex h-full shrink-0 items-center gap-2 border-b-2 px-3 text-[12px] font-bold transition
                                ${isPathActive("/dashboard/home") || currentPath === "/dashboard"
                                    ? "border-[#173c63] text-[#173c63]"
                                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-[#173c63]"
                                }
                            `}
                        >
                            <LayoutDashboard size={15} />
                            Dashboard
                        </Link>

                        {/* Dropdown categories */}

                        {menuGroups.map((group) => {
                            const Icon = group.icon;
                            const isOpen = openMenu === group.key;

                            const allItems = group.columns.flatMap(
                                (column) => column.items
                            );

                            const groupActive = isGroupActive(allItems);

                            return (
                                <div
                                    key={group.key}
                                    className="relative h-full"
                                    onMouseEnter={() => setOpenMenu(group.key)}
                                    onMouseLeave={() => setOpenMenu(null)}
                                >
                                    <button
                                        onClick={() => toggleMenu(group.key)}
                                        aria-expanded={isOpen}
                                        className={`
                                            flex h-full items-center gap-2 border-b-2 px-3 text-[12px] font-bold transition
                                            ${isOpen || groupActive
                                                ? "border-[#173c63] text-[#173c63]"
                                                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-[#173c63]"
                                            }
                                        `}
                                    >
                                        <Icon size={15} />
                                        {group.label}
                                        <ChevronDown
                                            size={13}
                                            className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>

                                    {/* Mega dropdown */}

                                    {isOpen && (
                                        <div className="absolute left-0 top-full z-[60] w-max min-w-[300px] max-w-[calc(100vw-40px)] rounded-b-xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">

                                            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                                                <div>
                                                    <p className="text-[13px] font-extrabold text-[#173c63]">
                                                        {group.label}
                                                    </p>
                                                    <p className="mt-1 text-[10px] text-slate-400">
                                                        Select a module to continue
                                                    </p>
                                                </div>

                                                <button
                                                    onClick={() => setOpenMenu(null)}
                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>

                                            <div
                                                className="grid gap-6"
                                                style={{
                                                    gridTemplateColumns: `repeat(${group.columns.length}, minmax(210px, 1fr))`,
                                                }}
                                            >
                                                {group.columns.map((column) => (
                                                    <div key={column.title}>
                                                        <div className="mb-2 px-3">
                                                            <h3 className="text-[10px] font-extrabold uppercase tracking-[1.2px] text-slate-400">
                                                                {column.title}
                                                            </h3>
                                                            <p className="mt-1 text-[10px] text-slate-400">
                                                                {column.description}
                                                            </p>
                                                        </div>

                                                        <div className="space-y-1">
                                                            {column.items.map((item) => (
                                                                <MegaMenuLink
                                                                    key={item.path}
                                                                    item={item}
                                                                    isActive={isPathActive(item.path)}
                                                                    onNavigate={() => setOpenMenu(null)}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ================= MOBILE NAVIGATION ================= */}

                {mobileMenuOpen && (
                    <div className="max-h-[75vh] overflow-y-auto border-t border-slate-200 bg-white p-4 lg:hidden">

                        <Link
                            to="/dashboard/home"
                            onClick={() => setMobileMenuOpen(false)}
                            className="mb-3 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-3 text-sm font-bold text-[#173c63]"
                        >
                            <LayoutDashboard size={17} />
                            Dashboard
                        </Link>

                        {menuGroups.map((group) => {
                            const Icon = group.icon;
                            const isOpen = openMenu === group.key;

                            return (
                                <div
                                    key={group.key}
                                    className="border-b border-slate-100"
                                >
                                    <button
                                        onClick={() => toggleMenu(group.key)}
                                        className="flex w-full items-center justify-between py-3 text-left text-[13px] font-bold text-slate-700"
                                    >
                                        <span className="flex items-center gap-3">
                                            <Icon size={17} className="text-[#173c63]" />
                                            {group.label}
                                        </span>

                                        <ChevronDown
                                            size={15}
                                            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                                        />
                                    </button>

                                    {isOpen && (
                                        <div className="space-y-4 pb-4 pl-2">
                                            {group.columns.map((column) => (
                                                <div key={column.title}>
                                                    <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                                        {column.title}
                                                    </p>

                                                    {column.items.map((item) => (
                                                        <MegaMenuLink
                                                            key={item.path}
                                                            item={item}
                                                            isActive={isPathActive(item.path)}
                                                            onNavigate={() => {
                                                                setOpenMenu(null);
                                                                setMobileMenuOpen(false);
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf0f7] font-bold text-[#173c63]">
                                    {user?.name?.charAt(0)?.toUpperCase() || "U"}
                                </div>
                                <span className="text-xs font-bold text-slate-700">
                                    {user?.name || "User"}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button onClick={handleZoomOut} className="rounded-md border border-slate-200 bg-white p-2">
                                    <ZoomOut size={14} />
                                </button>
                                <span className="text-xs font-bold tabular-nums">
                                    {zoomLevel}%
                                </span>
                                <button onClick={handleZoomIn} className="rounded-md border border-slate-200 bg-white p-2">
                                    <ZoomIn size={14} />
                                </button>
                                <button onClick={handleZoomReset} className="rounded-md border border-slate-200 bg-white p-2">
                                    <RotateCcw size={13} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </header>

           

            {/* ================= PAGE CONTENT ================= */}

            <main className="min-h-[calc(100vh-168px)] p-4 md:p-5">
                <div
                    style={{ zoom: scale }}
                    className="min-h-full"
                >
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default Sidebar;