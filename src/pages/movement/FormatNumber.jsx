export function fmtNumber(n) {
    if (typeof n !== "number" || Number.isNaN(n)) return n ?? "-";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function fmtQtyOrDash(n) {
    return n > 0 ? fmtNumber(n) : "-";
}