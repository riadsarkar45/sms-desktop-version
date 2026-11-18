import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader, X } from "lucide-react";

// ===== EXCEL-STYLE COLUMN FILTER DROPDOWN =====
// - Search box: type to narrow the list. Press ENTER and the table is filtered to ONLY the values that match
//   the search (the previous filter / ticks of this column are replaced, like the Excel search + Enter).
//   Search something else + ENTER again and the new result replaces it again.
// - ENTER with an empty search box = same as the Apply button (applies the ticked values).
// - Press ESC: this column's filter is removed (all the data is restored) and the dropdown closes.
//   (set ESC_RESTORES_DATA to false if ESC should only close the dropdown)
// - No filter applied = every value is ticked. Un-tick what you do not want and press Apply.
// - Clicking outside the dropdown just closes it.
const ESC_RESTORES_DATA = true;


// Max number of values drawn in the list at once (type in the search box to narrow it)
const MAX_FILTER_OPTIONS_SHOWN = 300;

const HEADER_BG = "#f3ddc7";
const BORDER_COLOR = "#14b8a6";

const FilterDropDown = ({
    colLabel, allValues, activeValues, isLoading,
    onApply, onClear, onClose, anchorRef,
    dropdownRef,            // ref of the dropdown element (Summary measures it to keep it under the column)
    style,                  // { top, left } in screen pixels
    width = 180,
    maxHeight = 320,
}) => {
    const [search, setSearch] = useState("");
    const [draftSelected, setDraftSelected] = useState(null); // ticked values before Apply (null = nothing changed yet)
    const innerRef = useRef(null);
    const rootRef = dropdownRef || innerRef;

    // always the latest props, so the document listeners below are added only once
    const latest = useRef({});
    latest.current = { onApply, onClear, onClose, anchorRef };

    // outside click closes the dropdown, ESC restores the data
    useEffect(() => {
        const handleDown = (e) => {
            const root = rootRef.current;
            const anchor = latest.current.anchorRef && latest.current.anchorRef.current;
            if (root && root.contains(e.target)) return;
            if (anchor && anchor.contains(e.target)) return; // the filter button toggles itself
            latest.current.onClose();
        };
        const handleKey = (e) => {
            if (e.key !== 'Escape') return;
            if (ESC_RESTORES_DATA) latest.current.onClear();
            latest.current.onClose();
        };
        document.addEventListener('mousedown', handleDown);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleDown);
            document.removeEventListener('keydown', handleKey);
        };
    }, [rootRef]);

    const values = Array.isArray(allValues) ? allValues : [];
    const selected = draftSelected || (activeValues ? new Set(activeValues) : new Set(values));

    const query = search.trim().toLowerCase();
    const sorted = [...values].sort((a, b) =>
        String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    );
    // the search always looks in ALL the values of the column, never only in the previous selection
    const matching = query ? sorted.filter((v) => String(v ?? '').toLowerCase().includes(query)) : sorted;
    const shown = matching.slice(0, MAX_FILTER_OPTIONS_SHOWN);
    const hiddenCount = matching.length - shown.length;
    const allMatchingSelected = matching.length > 0 && matching.every((v) => selected.has(v));

    const toggleValue = (v) => {
        const next = new Set(selected);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        setDraftSelected(next);
    };
    const toggleAllMatching = () => {
        const next = new Set(selected);
        if (allMatchingSelected) matching.forEach((v) => next.delete(v));
        else matching.forEach((v) => next.add(v));
        setDraftSelected(next);
    };

    const applyAndClose = (set) => {
        onApply(set);
        onClose();
    };

    // ENTER in the search box
    const handleSearchKeyDown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (isLoading) return;
        if (query) {
            // filter to ONLY the values that match this search (previous filter is replaced)
            if (matching.length === 0) return;
            applyAndClose(new Set(matching));
        } else {
            applyAndClose(selected);
        }
    };

    return createPortal(
        <div
            ref={rootRef}
            style={{
                position: 'fixed', top: style?.top ?? 0, left: style?.left ?? 0, width,
                zIndex: 99999, background: '#ffffff', border: `1px solid ${BORDER_COLOR}`, borderRadius: '8px',
                boxShadow: '0 20px 25px -3px rgb(0 0 0 / 0.18), 0 8px 10px -3px rgb(0 0 0 / 0.12)',
                display: 'flex', flexDirection: 'column', maxHeight, overflow: 'hidden',
                textAlign: 'left', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
                fontSize: '0.5rem', color: '#0f172a',
            }}
        >
            <div style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0', background: HEADER_BG, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Filter: {colLabel}
                </span>
                <button onClick={onClose} title="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, borderRadius: '50%', color: '#0f172a', flexShrink: 0 }}>
                    <X size={12} />
                </button>
            </div>

            <div style={{ padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search + press Enter..."
                    autoFocus
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.75rem', outline: 'none', boxSizing: 'border-box' }}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px', minHeight: 0 }}>
                {isLoading ? (
                    <div style={{ padding: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '0.75rem', color: '#6b7280' }}>
                        <Loader size={14} className="animate-spin" /> Loading values...
                    </div>
                ) : matching.length === 0 ? (
                    <div style={{ padding: '10px 0', fontSize: '0.75rem', textAlign: 'center', opacity: 0.6 }}>No values found</div>
                ) : (
                    <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', fontWeight: 600, padding: '4px 0', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', marginBottom: 2 }}>
                            <input type="checkbox" checked={allMatchingSelected} onChange={toggleAllMatching} style={{ accentColor: '#0d9488', width: 14, height: 14, flexShrink: 0 }} />
                            {query ? 'Select All Search Results' : 'Select All'} ({matching.length})
                        </label>
                        {shown.map((val, i) => {
                            const text = val === '' || val === null || val === undefined ? '(blank)' : String(val);
                            return (
                                <label key={`${String(val)}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.75rem', padding: '3px 0', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={selected.has(val)} onChange={() => toggleValue(val)} style={{ accentColor: '#0d9488', width: 14, height: 14, flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={text}>{text}</span>
                                </label>
                            );
                        })}
                        {hiddenCount > 0 && (
                            <div style={{ padding: '6px 0 2px', fontSize: '0.68rem', opacity: 0.6 }}>{hiddenCount} more values not shown. Type to narrow the list.</div>
                        )}
                    </>
                )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '6px 10px', borderTop: '1px solid #e2e8f0', background: HEADER_BG }}>
                <button
                    onClick={() => { onClear(); onClose(); }}
                    style={{ flex: 1, background: '#ffffff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500, padding: '5px 0' }}
                >
                    Clear
                </button>
                <button
                    onClick={() => applyAndClose(selected)}
                    disabled={isLoading}
                    style={{ flex: 1, background: '#0d9488', color: '#ffffff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: '5px 0', opacity: isLoading ? 0.5 : 1 }}
                >
                    Apply
                </button>
            </div>
        </div>,
        document.body
    );
};

export default FilterDropDown;