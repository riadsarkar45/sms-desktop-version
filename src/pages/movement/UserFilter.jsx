import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Excel-style column filter state for a flat array of rows, shared by the
 * Aop / Dyeing / Knitting movement tables (previously copy-pasted ~120 lines
 * per page, each drifting slightly from the others).
 *
 * Dropdown options for a column are computed against rows that already pass
 * every OTHER active column's filter (cross-filtering) — matches Knitting's
 * original (better) behavior, so a dropdown never offers a value that would
 * produce zero rows. Aop/Dyeing previously computed options independently;
 * this brings all three in line with the more correct version.
 *
 * `columns` — array of { key, noFilter? }. Columns with noFilter: true
 * (e.g. a checkbox column) are ignored entirely.
 */
export function useTableFilters(rows, columns) {
    const [filters, setFilters] = useState({});
    const [openFilterKey, setOpenFilterKey] = useState(null);
    const [draftSelected, setDraftSelected] = useState(new Set());
    const [filterSearch, setFilterSearch] = useState("");
    const dropdownRef = useRef(null);

    const filterableColumns = useMemo(
        () => columns.filter((c) => !c.noFilter),
        [columns]
    );

    // Close an open filter dropdown when clicking outside it.
    useEffect(() => {
        if (!openFilterKey) return;
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpenFilterKey(null);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [openFilterKey]);

    const filterOptions = useMemo(() => {
        const opts = {};
        filterableColumns.forEach((col) => {
            const set = new Set();
            rows.forEach((row) => {
                const passesOthers = filterableColumns.every((c) => {
                    if (c.key === col.key) return true;
                    const selected = filters[c.key];
                    if (!selected) return true;
                    return selected.has(String(row[c.key] ?? ""));
                });
                if (passesOthers) set.add(String(row[col.key] ?? ""));
            });
            opts[col.key] = Array.from(set).sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true })
            );
        });
        return opts;
    }, [rows, filters, filterableColumns]);

    const filteredRows = useMemo(() => {
        return rows.filter((row) =>
            filterableColumns.every((col) => {
                const selected = filters[col.key];
                if (!selected) return true;
                return selected.has(String(row[col.key] ?? ""));
            })
        );
    }, [rows, filters, filterableColumns]);

    const openFilter = (key) => {
        if (openFilterKey === key) {
            setOpenFilterKey(null);
            return;
        }
        const options = filterOptions[key] || [];
        const current = filters[key];
        const initial = current
            ? new Set([...current].filter((v) => options.includes(v)))
            : new Set(options);
        setDraftSelected(initial.size > 0 ? initial : new Set(options));
        setFilterSearch("");
        setOpenFilterKey(key);
    };

    const toggleDraftValue = (val) => {
        setDraftSelected((prev) => {
            const next = new Set(prev);
            if (next.has(val)) next.delete(val);
            else next.add(val);
            return next;
        });
    };

    const toggleSelectAllDraft = (options) => {
        setDraftSelected((prev) => (prev.size === options.length ? new Set() : new Set(options)));
    };

    const applyFilter = (key, options) => {
        setFilters((prev) => {
            const next = { ...prev };
            if (draftSelected.size === options.length || options.length === 0) {
                delete next[key];
            } else {
                next[key] = new Set(draftSelected);
            }
            return next;
        });
        setOpenFilterKey(null);
    };

    const clearFilter = (key) => {
        setFilters((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
        });
        setOpenFilterKey(null);
    };

    const clearAllFilters = () => setFilters({});

    return {
        filters,
        activeFilterCount: Object.keys(filters).length,
        openFilterKey,
        draftSelected,
        filterSearch,
        dropdownRef,
        filterOptions,
        filteredRows,
        setFilterSearch,
        openFilter,
        toggleDraftValue,
        toggleSelectAllDraft,
        applyFilter,
        clearFilter,
        clearAllFilters,
    };
}   