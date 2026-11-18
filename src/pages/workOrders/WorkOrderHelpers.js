// Shared helpers for the work order date / preview / revision features.

export const formatWorkOrderDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-GB"); // dd/mm/yyyy
};

// Work order date: backend field first, then createdAt as fallback
export const getWorkOrderDate = (wo) =>
    wo?.workOrderDate || wo?.woDate || wo?.date || wo?.createdAt || null;

export const ORDER_TITLES = {
    knittingOrder: "Knitting Work Order",
    dyeingOrder: "Dyeing Work Order",
    yarnDyeingOrder: "Yarn Dyeing Work Order",
    aopOrder: "AOP Work Order",
};