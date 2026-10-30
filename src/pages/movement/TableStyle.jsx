// Single source of truth for the movement-table look (Aop / Dyeing / Knitting).
// Previously each page redefined these inline and Knitting.jsx had drifted to
// a broken debug style (70px black borders, red header). Import from here so
// the three pages can never visually diverge again.

import { TextAlignCenter } from "lucide-react";

export const cellStyle = {
    border: "1px solid black",
    padding: "8px 10px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    verticalAlign: "middle",
    fontSize: "0.95rem",
    textAlign: "center",
};

// For cells merged across rows with rowSpan (e.g. Knitting's Work
// Order/Composition/Color columns, shared by every challan in a movement).
export const mergedCellStyle = {
    ...cellStyle,
    verticalAlign: "middle",
    textAlign: "center",
};

// Frozen/sticky header cell — stays pinned to the top of the scroll
// container while the body scrolls underneath it, Excel-style.
// Note: the parent <table> must keep borderCollapse: "separate" (not
// "collapse") — collapsed borders and position:sticky don't render
// reliably together across browsers. Each cell draws its own border.
export const thStickyStyle = {
    ...cellStyle,
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "#f3f4f6",
    fontWeight: 600,
    color: "#374151",
};

export const pageButtonStyle = (active) => ({
    border: "1px solid black",
    background: active ? "#1f2937" : "#fff",
    color: active ? "#fff" : "#374151",
    padding: "4px 10px",
    margin: "0 2px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: "0.85rem",
});

export const tableScrollWrapStyle = {
    width: "100%",
    maxHeight: "85vh",
    overflow: "auto",
    border: "1px solid #d1d5db",
    borderRadius: 8,
};

export const rowStyle = (selected) => ({
    background: selected ? "#eff6ff" : undefined,
});