import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useOutlet,
} from "react-router-dom";

import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Factory,
  Shirt,
  FileSpreadsheet,
  ChartNoAxesCombined,
  Scissors,
  Truck,
  Building2,
  Wallet,
  Users,
  UserRoundPlus,
  FileText,
  FilePlus,
  ClipboardCheck,
  RotateCcw,
  Layers3,
  Bell,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Menu,
  X,
  Pin,
  PinOff,
  ChevronDown,
  ChevronRight,
  Building,
  LogOut,
} from "lucide-react";

import UseUserRoles from "../hooks/all-users/UseUserRoles";
import { useAuth } from "../auth/AuthContext";
import Logo from "../assets/image.png";

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const RIBBON_PIN_KEY = "sm-erp-ribbon-pinned";
const ZOOM_STORAGE_KEY = "sm-erp-global-zoom";

const DEFAULT_ZOOM = 67;
const MIN_ZOOM = 40;
const MAX_ZOOM = 200;
const ZOOM_STEP = 5;

const HOME_PATH = "/dashboard/home";
const LOGOUT_PATH = "/dashboard/logout";

// Maximum number of open tabs (the oldest closable tab is closed
// automatically when this is exceeded, to protect memory).
const MAX_TABS = 15;

const PAGE_TITLES = {
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

  "/dashboard/style-requirement": "Styles",
  "/dashboard/factory-balance-comparison": "Compare Stock",
  "/dashboard/report-studio": "Report Studio",

  "/dashboard/productionsummary": "Production Summary",
  "/dashboard/daily-production/cutting": "Cutting Production",
  "/dashboard/daily-production/sewing": "Sewing Production",
  "/dashboard/daily-production/finishing": "Finishing Production",
  "/dashboard/daily-production/export": "Export Production",

  "/dashboard/asset-summary": "Asset Summary",
  "/dashboard/asset-movement": "Asset Movement",

  "/dashboard/contract-billing": "Contract Manu. Bill",
  "/dashboard/sewing-contract": "Partial Process Control",

  "/dashboard/new-user": "Add New User",
  "/dashboard/user-list": "User List",

  "/dashboard/high-loss-job": "Work Order Analysis",

  "/dashboard/debit-note": "Create Debit Note",
  "/dashboard/debit-note/list": "Debit Note Lists",
  "/dashboard/debit-note/requested": "Requested Debit Notes",

  "/dashboard/challan/aop": "AOP Movement",
  "/dashboard/challan/dyeing": "Dyeing Movement",
  "/dashboard/challan/knitting": "Knitting Movement",

  "/dashboard/challan/others/compacting": "Compacting",
  "/dashboard/challan/others/heat-set": "Heat Set",
  "/dashboard/challan/others/trumble": "Trumble",
  "/dashboard/challan/others/re-process": "Re-Process",

  "/dashboard/party-wise-view": "All Parties",
  "/dashboard/mis/glance": "At A Glance (Stock)",
  "/dashboard/mis/party-stock": "Party Stock",
};

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const readSavedZoom = () => {
  try {
    const saved = Number(localStorage.getItem(ZOOM_STORAGE_KEY));

    if (Number.isFinite(saved) && saved >= MIN_ZOOM && saved <= MAX_ZOOM) {
      return saved;
    }
  } catch {
    // Ignore localStorage errors.
  }

  return DEFAULT_ZOOM;
};

const readSavedPin = () => {
  try {
    return localStorage.getItem(RIBBON_PIN_KEY) === "true";
  } catch {
    return false;
  }
};

const savePin = (value) => {
  try {
    localStorage.setItem(RIBBON_PIN_KEY, String(value));
  } catch {
    // Ignore localStorage errors.
  }
};

const prettify = (text) =>
  text.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const looksLikeId = (segment) =>
  /^\d+$/.test(segment) ||
  /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment) ||
  /^[0-9a-f]{24}$/i.test(segment) ||
  /^c[a-z0-9]{20,}$/i.test(segment);

const getPageTitle = (pathname) => {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];

  if (!last) return "SM ERP";

  // e.g. /dashboard/debit-note/123  ->  "Create Debit Note #123"
  if (looksLikeId(last) && segments.length > 1) {
    const parentPath = "/" + segments.slice(0, -1).join("/");
    const parentTitle =
      PAGE_TITLES[parentPath] || prettify(segments[segments.length - 2]);

    return `${parentTitle} #${last.length > 8 ? last.slice(0, 8) : last}`;
  }

  return prettify(last);
};

// --------------------------------------------------
// CUSTOM THREAD ICON
// --------------------------------------------------

const ModernThreadIcon = ({ size = 20, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 2.5C8.8 2.5 6.5 4.2 6.5 6.7V17.3C6.5 19.8 8.8 21.5 12 21.5C15.2 21.5 17.5 19.8 17.5 17.3V6.7C17.5 4.2 15.2 2.5 12 2.5Z"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M7 7.2C9.8 9.1 14.2 9.1 17 7.2M7 10.5C9.8 12.4 14.2 12.4 17 10.5M7 13.8C9.8 15.7 14.2 15.7 17 13.8M7 17.1C9.8 19 14.2 19 17 17.1"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

// --------------------------------------------------
// RIBBON ITEM
// --------------------------------------------------

const RibbonItem = ({ item, active, onClick }) => {
  const Icon = item.icon || FileText;

  return (
    <button
      type="button"
      onClick={onClick}
      title={item.label}
      className={`
                group flex min-w-[82px] max-w-[110px]
                flex-col items-center justify-center gap-2
                rounded-lg px-3 py-3 text-center
                transition-all duration-150
                ${
                  active
                    ? "bg-slate-800/80 text-white shadow-md"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }
            `}
    >
      <Icon size={21} strokeWidth={1.8} />

      <span className="text-[11px] font-semibold leading-tight">
        {item.label}
      </span>
    </button>
  );
};

// --------------------------------------------------
// TAB PANE (keeps a page mounted while hidden)
// --------------------------------------------------

/*
 * memo() compares the `element` prop by reference.
 * Hidden tabs keep the SAME cached element, so React skips
 * re-rendering them while they are in the background.
 */

const TabPane = memo(function TabPane({ element, active }) {
  return (
    <div
      className="w-full min-w-0"
      style={{ display: active ? "block" : "none" }}
    >
      {element}
    </div>
  );
});

// --------------------------------------------------
// SIDEBAR / APP SHELL
// --------------------------------------------------

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const outlet = useOutlet();

  const { user, logout, isLoggedOut } = useAuth();
  const { sections = {} } = UseUserRoles() || {};

  // ----------------------------------------------
  // STATES
  // ----------------------------------------------

  const [zoomLevel, setZoomLevel] = useState(readSavedZoom);
  const [zoomInput, setZoomInput] = useState(String(readSavedZoom()));

  const [isRibbonPinned, setIsRibbonPinned] = useState(readSavedPin);
  const [isRibbonOpen, setIsRibbonOpen] = useState(readSavedPin);

  const [selectedGroup, setSelectedGroup] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Profile Dropdown State
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  // ----------------------------------------------
  // LOGOUT HANDLER
  // ----------------------------------------------

  useEffect(() => {
    if (location.pathname === LOGOUT_PATH) {
      logout();
    }
  }, [location.pathname, logout]);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogoutClick = () => {
    setIsProfileOpen(false);
    logout();
    navigate("/login", { replace: true });
  };


  const [tabs, setTabs] = useState([{ key: HOME_PATH, path: HOME_PATH }]);

  const pageCache = useRef({});

  const currentKey = location.pathname;
  const currentFullPath = location.pathname + location.search;

  // Always store the latest element for the active tab.
  if (outlet) {
    pageCache.current[currentKey] = outlet;
  }

  // Open a new tab when a new page is visited,
  // or update the stored path (query string) of an existing tab.
  useLayoutEffect(() => {
    setTabs((previous) => {
      const existing = previous.find((tab) => tab.key === currentKey);

      if (existing) {
        if (existing.path === currentFullPath) return previous;

        return previous.map((tab) =>
          tab.key === currentKey ? { ...tab, path: currentFullPath } : tab,
        );
      }

      let next = [...previous, { key: currentKey, path: currentFullPath }];

      // Too many tabs: drop the oldest closable one
      // (never the Dashboard tab, never the active tab).
      while (next.length > MAX_TABS) {
        const removeIndex = next.findIndex(
          (tab) => tab.key !== HOME_PATH && tab.key !== currentKey,
        );

        if (removeIndex === -1) break;

        next = next.filter((_, index) => index !== removeIndex);
      }

      return next;
    });
  }, [currentKey, currentFullPath]);

  // Remove cached pages of tabs that no longer exist
  // (this unmounts them and frees memory).
  useLayoutEffect(() => {
    Object.keys(pageCache.current).forEach((key) => {
      if (key !== currentKey && !tabs.some((tab) => tab.key === key)) {
        delete pageCache.current[key];
      }
    });
  }, [tabs, currentKey]);

  // The effect above adds the tab one render later, so for that
  // single render we show the current page as an extra pane.
  const renderedTabs = tabs.some((tab) => tab.key === currentKey)
    ? tabs
    : [...tabs, { key: currentKey, path: currentFullPath }];

  const handleTabClick = (tab) => {
    if (tab.key === currentKey) return;
    navigate(tab.path);
  };

  const handleTabClose = (event, tabKey) => {
    event.preventDefault();
    event.stopPropagation();

    if (tabKey === HOME_PATH) return;

    const index = tabs.findIndex((tab) => tab.key === tabKey);
    if (index === -1) return;

    const remaining = tabs.filter((tab) => tab.key !== tabKey);

    setTabs(remaining);

    // Closing the active tab: go to its left neighbour
    // (or the next one, or Dashboard).
    if (tabKey === currentKey) {
      const target = remaining[index - 1] ||
        remaining[index] || { path: HOME_PATH };

      navigate(target.path);
    }
  };

  const handleTabAuxClick = (event, tabKey) => {
    // Middle mouse button closes the tab (like a browser).
    if (event.button === 1) {
      handleTabClose(event, tabKey);
    }
  };

  // ----------------------------------------------
  // GLOBAL APP ZOOM
  // ----------------------------------------------

  /*
   * IMPORTANT:
   * Zoom is applied to the OUTERMOST APP CONTAINER.
   *
   * Therefore:
   * - Header
   * - Top navigation
   * - Tab bar
   * - Ribbon
   * - Page content (all tabs)
   *
   * All receive exactly the same zoom.
   *
   * Do NOT add zoom to Outlet separately.
   */

  useLayoutEffect(() => {
    setZoomInput(String(zoomLevel));

    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomLevel));
    } catch {
      // Ignore storage errors.
    }
  }, [zoomLevel]);

  const handleZoomIn = () => {
    setZoomLevel((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setZoomLevel((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
  };

  const handleZoomReset = () => {
    setZoomLevel(DEFAULT_ZOOM);
    setZoomInput(String(DEFAULT_ZOOM));
  };

  const commitZoomInput = () => {
    const parsed = Number(zoomInput);

    if (zoomInput.trim() === "" || !Number.isFinite(parsed)) {
      setZoomInput(String(zoomLevel));
      return;
    }

    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(parsed)));

    setZoomLevel(nextZoom);
    setZoomInput(String(nextZoom));
  };

  const handleZoomInputChange = (event) => {
    const value = event.target.value;

    if (/^\d{0,3}$/.test(value)) {
      setZoomInput(value);
    }
  };

  // ----------------------------------------------
  // RIBBON PIN PREFERENCE
  // ----------------------------------------------

  useEffect(() => {
    savePin(isRibbonPinned);
  }, [isRibbonPinned]);

  const handlePinToggle = () => {
    setIsRibbonPinned((previous) => {
      const next = !previous;

      if (next) {
        setIsRibbonOpen(true);
      }

      return next;
    });
  };

  // ----------------------------------------------
  // ROUTE HELPERS
  // ----------------------------------------------

  const isPathActive = (path) => {
    if (!path) return false;

    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  /*
   * If the page is already open in a tab, navigate to that
   * tab's last location (so its query string is kept too).
   */
  const goToPath = (path) => {
    const existingTab = tabs.find((tab) => tab.key === path);

    navigate(existingTab ? existingTab.path : path);
  };

  const handleSubmoduleNavigate = (path) => {
    goToPath(path);
    setMobileMenuOpen(false);

    if (!isRibbonPinned) {
      setIsRibbonOpen(false);
    }
  };

  const handleGroupClick = (group) => {
    if (group.path) {
      goToPath(group.path);
      setSelectedGroup(group.id);
      setMobileMenuOpen(false);

      if (!isRibbonPinned) {
        setIsRibbonOpen(false);
      }

      return;
    }

    setSelectedGroup(group.id);
    setIsRibbonOpen((previous) =>
      selectedGroup === group.id ? !previous : true,
    );
  };

  // ----------------------------------------------
  // MENU ITEMS
  // ----------------------------------------------

  const yarnItems = [
    {
      label: "Yarn Purchase",
      path: "/dashboard/yarn",
      icon: ShoppingCart,
    },
    {
      label: "Yarn Movement Spinning",
      path: "/dashboard/spinning-yarn-movement",
      icon: ArrowLeftRight,
    },
    {
      label: "Raw Yarn Movement",
      path: "/dashboard/yarn/movement",
      icon: ArrowLeftRight,
    },
    {
      label: "Raw Yarn Stock",
      path: "/dashboard/yarn/stock",
      icon: Boxes,
    },
    {
      label: "Yarn Dyed Movement",
      path: "/dashboard/yarndyed/movement",
      icon: ArrowLeftRight,
    },
    {
      label: "Yarn Dyed Stock",
      path: "/dashboard/yarndyed/stock",
      icon: Package,
    },
  ];

  const orderItems = [
    {
      label: "Knitting Orders",
      path: "/dashboard/knitting-order",
      permission: "knittingOrder",
      icon: ModernThreadIcon,
    },
    {
      label: "Dyeing Orders",
      path: "/dashboard/dyeing-order",
      permission: "dyeingOrder",
      icon: Factory,
    },
    {
      label: "Yarn Dyeing Orders",
      path: "/dashboard/yarn-dye-order",
      permission: "yarnDyeingOrder",
      icon: Package,
    },
    {
      label: "AOP Orders",
      path: "/dashboard/aop-order",
      permission: "aopOrder",
      icon: Layers3,
    },
  ].filter((item) => sections.workOrders?.[item.permission] === true);

  const productionItems = [
    {
      label: "Summary",
      path: "/dashboard/productionsummary",
      icon: ChartNoAxesCombined,
    },
    {
      label: "Cutting",
      path: "/dashboard/daily-production/cutting",
      icon: Scissors,
    },
    {
      label: "Sewing",
      path: "/dashboard/daily-production/sewing",
      icon: Shirt,
    },
    {
      label: "Finishing",
      path: "/dashboard/daily-production/finishing",
      icon: ClipboardCheck,
    },
    {
      label: "Export",
      path: "/dashboard/daily-production/export",
      icon: Truck,
    },
  ];

  const fixedAssetItems = [
    {
      label: "Asset Summary",
      path: "/dashboard/asset-summary",
      icon: Building2,
    },
    {
      label: "Asset Movement",
      path: "/dashboard/asset-movement",
      icon: ArrowLeftRight,
    },
  ];

  const contractItems = [
    {
      label: "Contract Manu. Bill",
      path: "/dashboard/contract-billing",
      icon: Wallet,
    },
    {
      label: "Partial Process Control",
      path: "/dashboard/sewing-contract",
      icon: Factory,
    },
  ];

  const userItems = [
    {
      label: "Add New User",
      path: "/dashboard/new-user",
      permission: "addNewUser",
      icon: UserRoundPlus,
    },
    {
      label: "User List",
      path: "/dashboard/user-list",
      permission: "setUserPermission",
      icon: Users,
    },
  ].filter((item) => sections.userManagement?.[item.permission] === true);

  const workOrderItems = [
    {
      label: "Work Order Analysis",
      path: "/dashboard/high-loss-job",
      permission: "workOrderAnalysis",
      icon: ChartNoAxesCombined,
    },
  ].filter((item) => sections.workOrders?.[item.permission] === true);

  const debitNoteItems = [
    {
      label: "Create Debit Note",
      path: "/dashboard/debit-note",
      icon: FilePlus,
    },
    {
      label: "Debit Note Lists",
      path: "/dashboard/debit-note/list",
      icon: FileSpreadsheet,
    },
    {
      label: "Requested Debit Notes",
      path: "/dashboard/debit-note/requested",
      icon: ClipboardList,
    },
  ];

  const movementItems = [
    {
      label: "AOP",
      path: "/dashboard/challan/aop",
      permission: "aopOrder",
      icon: Layers3,
    },
    {
      label: "Dyeing",
      path: "/dashboard/challan/dyeing",
      permission: "dyeingOrder",
      icon: Factory,
    },
    {
      label: "Knitting",
      path: "/dashboard/challan/knitting",
      permission: "knittingOrder",
      icon: ModernThreadIcon,
    },
    {
      label: "Quarterly Balance",
      path: "/dashboard/quarterly-balance",
      permission: "knittingOrder",
      icon: ClipboardCheck,
    },
  ].filter((item) => sections.movementBilling?.[item.permission] === true);

  const otherMovementItems = [
    {
      label: "Compacting",
      path: "/dashboard/challan/others/compacting",
      icon: Factory,
    },
    {
      label: "Heat Set",
      path: "/dashboard/challan/others/heat-set",
      icon: Factory,
    },
    {
      label: "Trumble",
      path: "/dashboard/challan/others/trumble",
      icon: RotateCcw,
    },
    {
      label: "Re-Process",
      path: "/dashboard/challan/others/re-process",
      icon: RotateCw,
    },
  ];

  const misItems = sections.mis
    ? [
        {
          label: "At A Glance (Stock)",
          path: "/dashboard/mis/glance",
          icon: ChartNoAxesCombined,
        },
        {
          label: "Party Stock",
          path: "/dashboard/mis/party-stock",
          icon: Building,
        },
      ]
    : [];

  // ----------------------------------------------
  // MENU GROUPS
  // ----------------------------------------------

  const menuGroups = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      path: HOME_PATH,
    },
    {
      id: "yarn",
      label: "Yarn",
      icon: Package,
      items: yarnItems,
    },
    {
      id: "orders",
      label: "Orders",
      icon: ClipboardList,
      items: orderItems,
    },
    {
      id: "styles",
      label: "Styles",
      icon: Shirt,
      path: "/dashboard/style-requirement",
      permission: sections.styleRequirements?.bookingView === true,
    },
    {
      id: "compare-stock",
      label: "Compare Stock",
      icon: ArrowLeftRight,
      path: "/dashboard/factory-balance-comparison",
      permission: sections.styleRequirements?.bookingView === true,
    },
    {
      id: "report-studio",
      label: "Report Studio",
      icon: FileSpreadsheet,
      path: "/dashboard/report-studio",
      permission: sections.styleRequirements?.bookingView === true,
    },
    {
      id: "production",
      label: "Production",
      icon: Factory,
      items: productionItems,
    },
    {
      id: "asset-info",
      label: "Asset Info",
      icon: Building2,
      items: fixedAssetItems,
    },
    {
      id: "contractual",
      label: "Contractual",
      icon: Wallet,
      items: contractItems,
    },
    {
      id: "users",
      label: "Users",
      icon: Users,
      items: userItems,
    },
    {
      id: "work-orders",
      label: "Work Orders",
      icon: ClipboardList,
      items: workOrderItems,
    },
    {
      id: "debit-note",
      label: "Debit Note",
      icon: FileText,
      items: debitNoteItems,
    },
    {
      id: "all-parties",
      label: "All Parties",
      icon: Building2,
      path: "/dashboard/party-wise-view",
    },
    {
      id: "movement",
      label: "Movement",
      icon: ArrowLeftRight,
      items: movementItems,
      groups: [
        {
          label: "Others",
          items: otherMovementItems,
        },
      ],
    },
    {
      id: "mis",
      label: "MIS",
      icon: ChartNoAxesCombined,
      items: misItems,
      permission: Boolean(sections.mis),
    },
  ].filter((group) => group.permission !== false);

  // ----------------------------------------------
  // CURRENT GROUP DETECTION
  // ----------------------------------------------

  useEffect(() => {
    const activeGroup = menuGroups.find((group) => {
      if (group.path && isPathActive(group.path)) {
        return true;
      }

      if (group.items?.some((item) => isPathActive(item.path))) {
        return true;
      }

      if (
        group.groups?.some((subGroup) =>
          subGroup.items?.some((item) => isPathActive(item.path)),
        )
      ) {
        return true;
      }

      return false;
    });

    if (activeGroup) {
      setSelectedGroup(activeGroup.id);
    }

    if (!isRibbonPinned) {
      setIsRibbonOpen(false);
    }
  }, [location.pathname]);

  const selectedMenuGroup = menuGroups.find(
    (group) => group.id === selectedGroup,
  );

  // ----------------------------------------------
  // PAGE TITLES
  // ----------------------------------------------

  const pageTitles = {
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

    "/dashboard/style-requirement": "Styles",
    "/dashboard/factory-balance-comparison": "Compare Stock",
    "/dashboard/report-studio": "Report Studio",

    "/dashboard/productionsummary": "Production Summary",
    "/dashboard/daily-production/cutting": "Cutting Production",
    "/dashboard/daily-production/sewing": "Sewing Production",
    "/dashboard/daily-production/finishing": "Finishing Production",
    "/dashboard/daily-production/export": "Export Production",

    "/dashboard/asset-summary": "Asset Summary",
    "/dashboard/asset-movement": "Asset Movement",

    "/dashboard/contract-billing": "Contract Manu. Bill",
    "/dashboard/sewing-contract": "Partial Process Control",

    "/dashboard/new-user": "Add New User",
    "/dashboard/user-list": "User List",

    "/dashboard/high-loss-job": "Work Order Analysis",

    "/dashboard/debit-note": "Create Debit Note",
    "/dashboard/debit-note/list": "Debit Note Lists",
    "/dashboard/debit-note/requested": "Requested Debit Notes",

    "/dashboard/challan/aop": "AOP Movement",
    "/dashboard/challan/dyeing": "Dyeing Movement",
    "/dashboard/challan/knitting": "Knitting Movement",
    "/dashboard/quarterly-balance": "Quarterly Balance",

    "/dashboard/challan/others/compacting": "Compacting",
    "/dashboard/challan/others/heat-set": "Heat Set",
    "/dashboard/challan/others/trumble": "Trumble",
    "/dashboard/challan/others/re-process": "Re-Process",

    "/dashboard/party-wise-view": "All Parties",
    "/dashboard/mis/glance": "At A Glance (Stock)",
  };

  const currentPageTitle =
    pageTitles[location.pathname] ||
    location.pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) ||
    "SM ERP";

  // ----------------------------------------------
  // USER DISPLAY
  // ----------------------------------------------

  const userName = user?.name || user?.fullName || user?.username || "User";

  const userInitial = userName.trim().charAt(0).toUpperCase();

  // ----------------------------------------------
  // RENDER
  // ----------------------------------------------

  return (
    /*
     * This is the single zoom container.
     * Everything inside it scales together.
     *
     * Do not apply zoom to documentElement.
     * Do not apply zoom to Outlet.
     */

    <div
      className="min-h-screen w-full bg-[#f5f6f8] text-slate-900"
      style={{
        zoom: `${zoomLevel}%`,
      }}
    >
      {/* ======================================
                TOP HEADER
            ====================================== */}

      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="flex min-h-[58px] items-center justify-between gap-3 px-4 md:px-6">
          {/* BRAND */}

          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((previous) => !previous)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>

            <Link to={HOME_PATH} className="flex items-center gap-2">
              <div className="flex h-9 w-[9rem] items-center justify-center rounded-xl text-white">
                <img className="h-[3rem] w-[8rem]" src={Logo} alt="" />
              </div>

              <div className="leading-tight">
                <div className="text-[14px] font-black tracking-[0.12em] text-slate-950">
                  SM SOURCING
                </div>

                <div className="text-[9px] font-semibold tracking-[0.2em] text-slate-500">
                  ENTERPRISE RESOURCE PLANNING
                </div>
              </div>
            </Link>
          </div>

          {/* HEADER ACTIONS */}

          <div className="flex items-center gap-2">
            {/* ZOOM CONTROLS */}

            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= MIN_ZOOM}
                title="Zoom out"
                className="rounded-md p-1.5 text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ZoomOut size={16} />
              </button>

              <input
                type="number"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step="1"
                value={zoomInput}
                onChange={handleZoomInputChange}
                onBlur={commitZoomInput}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
                title="Enter zoom percentage"
                aria-label="Application zoom percentage"
                className="w-[46px] border-0 bg-transparent p-0 text-center text-xs font-bold text-slate-800 outline-none focus:ring-0"
              />

              <span className="text-[11px] font-semibold text-slate-500">
                %
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= MAX_ZOOM}
                title="Zoom in"
                className="rounded-md p-1.5 text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ZoomIn size={16} />
              </button>

              <button
                type="button"
                onClick={handleZoomReset}
                title={`Reset zoom to ${DEFAULT_ZOOM}%`}
                className="rounded-md p-1.5 text-slate-600 transition hover:bg-white"
              >
                <RotateCw size={14} />
              </button>
            </div>

            {/* NOTIFICATIONS */}

            <button
              type="button"
              title="Notifications"
              className="relative rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
            >
              <Bell size={19} />

              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-500" />
            </button>

            {/* USER PROFILE DROPDOWN */}

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 border-l border-slate-200 pl-3 hover:bg-slate-50 rounded-lg pr-2 py-1 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/80 text-xs font-bold text-white">
                  {userInitial}
                </div>

                <div className="hidden max-w-[130px] md:block text-left">
                  <p className="truncate text-xs font-bold text-slate-800">
                    {userName}
                  </p>

                  <p className="text-[10px] text-slate-500">SM ERP User</p>
                </div>

                <ChevronDown
                  size={14}
                  className={`text-slate-400 transition-transform ${isProfileOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                  <div className="px-4 py-2 border-b border-slate-100 mb-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {userName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {user?.email || "user@smerp.com"}
                    </p>
                  </div>

                  <button
                    onClick={handleLogoutClick}
                    className="group flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <LogOut
                      size={16}
                      className="text-slate-400 group-hover:text-red-500"
                    />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==================================
                    TOP NAVIGATION
                ================================== */}

        <nav className="hidden overflow-x-auto border-t border-slate-100 bg-white px-4 lg:block">
          <div className="flex min-w-max items-center gap-1">
            {menuGroups.map((group) => {
              const Icon = group.icon;

              const active =
                selectedGroup === group.id ||
                (group.path && isPathActive(group.path));

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleGroupClick(group)}
                  className={`
                                        flex items-center gap-2
                                        border-b-2 px-3 py-3
                                        text-xs font-bold
                                        transition-all
                                        ${
                                          active
                                            ? "border-slate-950 bg-slate-50 text-slate-950"
                                            : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-950"
                                        }
                                    `}
                >
                  <Icon size={15} />

                  <span>{group.label}</span>

                  {(group.items?.length > 0 || group.groups?.length > 0) && (
                    <ChevronDown
                      size={13}
                      className={`transition-transform ${
                        active && isRibbonOpen ? "rotate-180" : ""
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ==================================
                    BROWSER-STYLE TAB BAR
                ================================== */}

        <div className="border-t border-slate-200 bg-slate-100 px-2 pt-1.5">
          <div
            className="flex items-end gap-0.5 overflow-x-auto"
            role="tablist"
            aria-label="Open pages"
          >
            {tabs.map((tab) => {
              const isActive = tab.key === currentKey;
              const isHome = tab.key === HOME_PATH;

              return (
                <div
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  title={getPageTitle(tab.key)}
                  onClick={() => handleTabClick(tab)}
                  onAuxClick={(event) => handleTabAuxClick(event, tab.key)}
                  onMouseDown={(event) => {
                    // Prevent the middle-click auto-scroll cursor.
                    if (event.button === 1) {
                      event.preventDefault();
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleTabClick(tab);
                    }
                  }}
                  className={`
                                        group relative flex shrink-0 cursor-pointer
                                        select-none items-center gap-2
                                        rounded-t-lg border border-b-0
                                        px-3 py-1.5 text-xs font-semibold
                                        transition-colors
                                        ${
                                          isActive
                                            ? "border-slate-200 bg-[#f5f6f8] text-slate-950"
                                            : "border-transparent text-slate-500 hover:bg-slate-200/70 hover:text-slate-900"
                                        }
                                    `}
                  style={{
                    minWidth: 110,
                    maxWidth: 200,
                  }}
                >
                  {isHome && <LayoutDashboard size={13} className="shrink-0" />}

                  <span className="truncate">{getPageTitle(tab.key)}</span>

                  {!isHome && (
                    <button
                      type="button"
                      title="Close tab"
                      aria-label={`Close ${getPageTitle(tab.key)}`}
                      onClick={(event) => handleTabClose(event, tab.key)}
                      className={`
                                                ml-auto shrink-0 rounded p-0.5
                                                text-slate-400 transition
                                                hover:bg-slate-300 hover:text-slate-900
                                                ${
                                                  isActive
                                                    ? "opacity-100"
                                                    : "opacity-0 group-hover:opacity-100"
                                                }
                                            `}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* ======================================
                MOBILE NAVIGATION
            ====================================== */}

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/30 lg:hidden">
          <div className="h-full w-[280px] overflow-y-auto bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <span className="text-sm font-black tracking-wider">
                SM SOURCING
              </span>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 hover:bg-slate-100"
              >
                <X size={19} />
              </button>
            </div>

            <div className="space-y-1 p-3">
              {menuGroups.map((group) => {
                const Icon = group.icon;

                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => handleGroupClick(group)}
                    className={`
                                            flex w-full items-center gap-3
                                            rounded-lg px-3 py-3 text-left
                                            text-sm font-semibold
                                            ${
                                              selectedGroup === group.id
                                                ? "bg-slate-800/80 text-white"
                                                : "text-slate-700 hover:bg-slate-100"
                                            }
                                        `}
                  >
                    <Icon size={18} />

                    <span>{group.label}</span>

                    {group.items?.length > 0 && (
                      <ChevronRight size={15} className="ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ======================================
                RIBBON PANEL
            ====================================== */}

      {isRibbonOpen && selectedMenuGroup && (
        <section className="relative z-30 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-[108px] items-stretch">
            {/* RIBBON CONTENT */}

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-4 py-3">
              {selectedMenuGroup.items?.map((item) => (
                <RibbonItem
                  key={item.path}
                  item={item}
                  active={isPathActive(item.path)}
                  onClick={() => handleSubmoduleNavigate(item.path)}
                />
              ))}

              {selectedMenuGroup.groups?.map((subGroup) => (
                <div
                  key={subGroup.label}
                  className="flex items-center gap-2 border-l border-slate-200 pl-3"
                >
                  <div className="flex flex-col">
                    <span className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {subGroup.label}
                    </span>

                    <div className="flex flex-wrap gap-2">
                      {subGroup.items?.map((item) => (
                        <RibbonItem
                          key={item.path}
                          item={item}
                          active={isPathActive(item.path)}
                          onClick={() => handleSubmoduleNavigate(item.path)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              {!selectedMenuGroup.items?.length &&
                !selectedMenuGroup.groups?.length && (
                  <span className="px-3 text-xs text-slate-400">
                    No available modules.
                  </span>
                )}
            </div>

            {/* PIN CONTROL */}

            <div className="flex items-start border-l border-slate-100 p-3">
              <button
                type="button"
                onClick={handlePinToggle}
                title={isRibbonPinned ? "Unpin ribbon" : "Pin ribbon"}
                className={`
                                    rounded-lg p-2 transition
                                    ${
                                      isRibbonPinned
                                        ? "bg-slate-800/80 text-white"
                                        : "text-slate-500 hover:bg-slate-100"
                                    }
                                `}
              >
                {isRibbonPinned ? <Pin size={17} /> : <PinOff size={17} />}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ======================================
                PAGE CONTENT (ALL OPEN TABS)
            ====================================== */}

      <main className="min-h-[calc(100vh-110px)] w-full px-3 py-4 md:px-5">
        <div className="w-full min-w-0">
          {renderedTabs.map((tab) => (
            <TabPane
              key={tab.key}
              active={tab.key === currentKey}
              element={pageCache.current[tab.key] ?? null}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
