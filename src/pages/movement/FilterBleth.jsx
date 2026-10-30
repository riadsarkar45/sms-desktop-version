import React from "react";
import { thStickyStyle } from "./TableStyle";

/**
 * One sticky <th> with an Excel-style filter dropdown. Pairs with
 * useTableFilters — pass through whatever it returns for the given column.
 */
export default function FilterableTh({
    column,
    options,
    isActive,
    isOpen,
    draftSelected,
    filterSearch,
    onOpenFilter,
    onSearchChange,
    onToggleValue,
    onToggleSelectAll,
    onApply,
    onClear,
    dropdownRef,
}) {
    return (
        <th style={{ ...thStickyStyle   , width: column.width, overflow: "visible" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {column.header}
                </span>
                <button
                    onClick={() => onOpenFilter(column.key)}
                    title="Filter"
                    style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        color: isActive ? "#2563eb" : "#6b7280",
                        fontSize: "0.8rem",
                        padding: 2,
                    }}
                >
                    ▾
                </button>
            </div>

            {isOpen && (
                <div
                    ref={dropdownRef}
                    style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        zIndex: 20,
                        background: "#fff",
                        border: "1px solid #d1d5db",
                        borderRadius: 6,
                        width: 200,
                        maxHeight: 280,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        textAlign: "left",
                        fontWeight: "normal",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div style={{ padding: 8, borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
                        <input
                            type="text"
                            value={filterSearch}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Search..."
                            autoFocus
                            style={{
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "4px 6px",
                                border: "1px solid #d1d5db",
                                borderRadius: 4,
                                fontSize: "0.85rem",
                            }}
                        />
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 8px" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: "bold", marginBottom: 6, cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={draftSelected.size === options.length && options.length > 0}
                                onChange={() => onToggleSelectAll(options)}
                            />
                            Select All
                        </label>
                        {options
                            .filter((val) => val.toLowerCase().includes(filterSearch.toLowerCase()))
                            .map((val) => (
                                <label key={val} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", padding: "2px 0", cursor: "pointer" }}>
                                    <input
                                        type="checkbox"
                                        checked={draftSelected.has(val)}
                                        onChange={() => onToggleValue(val)}
                                    />
                                    {val === "" ? "(blank)" : val}
                                </label>
                            ))}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", padding: 8, borderTop: "1px solid #e5e7eb", flexShrink: 0 }}>
                        <button
                            onClick={() => onClear(column.key)}
                            style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", fontSize: "0.75rem" }}
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => onApply(column.key, options)}
                            style={{ border: "none", background: "#1f2937", color: "#fff", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: "0.75rem" }}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </th>
    );
}