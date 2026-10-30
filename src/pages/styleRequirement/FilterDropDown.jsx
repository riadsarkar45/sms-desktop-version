import { RefreshCcw, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const FilterDropDown = ({ colLabel, allValues, activeValues, isLoading, onApply, onClear, onClose, anchorRef }) => {

    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(() =>
        activeValues !== null ? new Set(activeValues) : new Set(allValues)
    );
    const dropRef = useRef(null);

    useEffect(() => {
        const handler = (e) => {
            if (dropRef.current && !dropRef.current.contains(e.target) &&
                anchorRef.current && !anchorRef.current.contains(e.target)) {
                onClose();
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [onClose, anchorRef]);

    const filtered = allValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));
    const allChecked = filtered.length > 0 && filtered.every(v => selected.has(v));

    const toggleAll = () => {
        const next = new Set(selected);
        if (allChecked) {
            filtered.forEach(v => next.delete(v));
        } else {
            filtered.forEach(v => next.add(v));
        }
        setSelected(next);
    };

    const toggle = (val) => {
        const next = new Set(selected);
        next.has(val) ? next.delete(val) : next.add(val);
        setSelected(next);
    };

    return (
        <div
            ref={dropRef}
            style={{
                position: "fixed",
                zIndex: 9999,
                background: "#fff",
                border: "1px solid #0d9488",
                borderRadius: 6,
                boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                minWidth: 220,
                maxWidth: 280,
            }}
            className="filter-dropdown"
        >
            <div className="flex items-center justify-between px-3 py-2 subrow-cell border-b border-[#0d9488] bg-gray-50">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide truncate">{colLabel}</span>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-2 flex-shrink-0">
                    <X size={13} />
                </button>
            </div>

            <div className="px-2 py-2 border-b border-gray-100">
                <div className="flex items-center gap-1.5 bg-gray-100 rounded px-2 py-1">
                    <Search size={12} className="text-gray-400 flex-shrink-0" />
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="bg-transparent text-xs outline-none w-full text-gray-700 placeholder-gray-400"
                    />
                    {search && (
                        <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600">
                            <X size={11} />
                        </button>
                    )}
                </div>
            </div>

            <div className="px-3 py-1.5 border-b border-gray-100">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleAll}
                        disabled={isLoading}
                        className="rounded text-teal-600"
                    />
                    <span className="text-xs font-medium text-gray-600">Select All</span>
                    <span className="ml-auto text-xs text-gray-400">{selected.size}/{allValues.length}</span>
                </label>
            </div>

            <div style={{ maxHeight: 200, overflowY: "auto" }} className="py-1">
                {isLoading ? (
                    <div className="px-3 py-6 flex items-center justify-center gap-2 text-xs text-gray-400">
                        <RefreshCcw size={12} className="animate-spin" /> Loading options...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-gray-400 text-center">No matches</div>
                ) : (
                    filtered.map(val => (
                        <label key={val} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-teal-50 select-none">
                            <input
                                type="checkbox"
                                checked={selected.has(val)}
                                onChange={() => toggle(val)}
                                className="rounded text-teal-600"
                            />
                            <span className="text-xs text-gray-700 truncate" title={val}>{val || "(Blank)"}</span>
                        </label>
                    ))
                )}
            </div>

            <div className="flex gap-2 px-3 py-2 subrow-cell border-t border-gray-100 bg-gray-50">
                <button
                    onClick={() => { onApply(selected); onClose(); }}
                    disabled={isLoading}
                    className="flex-1 text-xs bg-teal-600 text-white rounded px-3 py-1.5 font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                    Apply
                </button>
                <button
                    onClick={() => { onClear(); onClose(); }}
                    className="flex-1 text-xs bg-white border border-gray-300 text-gray-600 rounded px-3 py-1.5 font-medium hover:bg-gray-50 transition-colors"
                >
                    Clear
                </button>
            </div>
        </div>
    );


};

export default FilterDropDown;