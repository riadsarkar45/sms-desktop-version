import React, { useMemo } from "react";
import { pageButtonStyle } from "./TableStyle";

export default function Pagination({ page, totalPages, onPageChange }) {
    const pageNumbers = useMemo(() => {
        const nums = [];
        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
                nums.push(p);
            } else if (nums[nums.length - 1] !== "...") {
                nums.push("...");
            }
        }
        return nums;
    }, [totalPages, page]);

    if (totalPages <= 1) return null;

    return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <button style={pageButtonStyle(false)} onClick={() => onPageChange(page - 1)} disabled={page === 1}>
                Prev
            </button>
            {pageNumbers.map((p, i) =>
                p === "..." ? (
                    <span key={`ellipsis-${i}`} style={{ margin: "0 4px" }}>...</span>
                ) : (
                    <button key={p} style={pageButtonStyle(p === page)} onClick={() => onPageChange(p)}>
                        {p}
                    </button>
                )
            )}
            <button style={pageButtonStyle(false)} onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>
                Next
            </button>
        </div>
    );
}