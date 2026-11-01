  import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
  import {
    Loader, X, Plus, Trash2, Calendar, Hash, Layers,
    TrendingUp, AlertCircle, Search, CheckCircle2, Filter,
    ChevronRight, ChevronDown as ChevronDownIcon,
    Check, Factory, Shirt, Scissors, Tag, Info
  } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import useAxiosPrivate from "../../hooks/UseAxiosPrivate";

  // ============================================================
  // TOAST NOTIFICATION COMPONENT
  // ============================================================
  const Toast = ({ toast, onClose }) => {
    if (!toast) return null;
    const styles = {
      success: 'bg-emerald-600',
      error: 'bg-rose-600',
      info: 'bg-slate-800',
    };
    return (
      <div className={`fixed right-5 top-5 z-[100] flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-white shadow-xl ${styles[toast.type] || styles.info}`}>
        {toast.type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
        <span className="text-sm font-medium">{toast.message}</span>
        <button type="button" onClick={onClose} className="ml-2 rounded p-1 hover:bg-white/20" aria-label="Close notification">
          <X size={16} />
        </button>
      </div>
    );
  };

  // --- Constants & Helpers ---
  const PROCESS_TYPES = [
    "Body Hem", "Neck Joint", "Shoulder to Shoulder",
    "Sleeve Hem", "Sleeve Join", "Cuff Join", "Side Seam"
  ];

  const COMPLETE_GMTS_LABEL = "Complete GMTS";

  const getCompositionLabel = (c) => {
    if (!c) return "—";
    if (typeof c === "string") return c;
    return c.name || c.title || c.label || c.composition || "—";
  };

  const getProcessName = (p) =>
    typeof p === "string" ? p : (p?.name || p?.processType || p?.label || p?.id || "");

  const getUnitLabel = (u) => {
    if (!u) return "";
    if (typeof u === "string") return u;
    return u.name || u.title || u.label || "";
  };

  const mapSummaryRow = (r) => ({
    id: r.id,
    date: r.date ? String(r.date).split("T")[0] : "",
    jobNo: r.jobs?.jobNo || "",
    styleNo: r.styleReqRows?.styleRequirement?.styleNo || r.jobs?.styleNo || "",
    manufacturingUnit: getUnitLabel(r.manufacturingUnit),
    lineNo: r.lineNo || "",
    compositionId: r.styleReqRows?.id ?? r.styleReqRowsId ?? null,
    compositionLabel: r.styleReqRows?.composition ? getCompositionLabel(r.styleReqRows.composition) : "—",
    orderQty: Number(r.styleReqRows?.orderQty) || 0,
    processType: r.processType || "",
    todayInput: Number(r.input) || 0,
    todayOutput: Number(r.output) || 0,
  });

  // ============================================================
  // DATE FILTER DROPDOWN (Excel-style Year > Month tree)
  // ============================================================
  function DateFilterDropdown({ allDates, selectedDates, onApply, onClose, anchorRef }) {
    const dropdownRef = useRef(null);
    const [search, setSearch] = useState("");

    const dateTree = useMemo(() => {
      const tree = {};
      const sorted = [...allDates].sort();
      sorted.forEach(d => {
        if (!d) return;
        const [year, month] = d.split("-");
        const monthNames = ["", "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"];
        const monthLabel = `${monthNames[parseInt(month)]} ${year}`;
        if (!tree[year]) tree[year] = {};
        if (!tree[year][monthLabel]) tree[year][monthLabel] = [];
        tree[year][monthLabel].push(d);
      });
      return tree;
    }, [allDates]);

    const allFlat = allDates.filter(Boolean);
    const [localSelected, setLocalSelected] = useState(
      selectedDates && selectedDates.length > 0 ? [...selectedDates] : [...allFlat]
    );
    const [expandedYears, setExpandedYears] = useState({});
    const [expandedMonths, setExpandedMonths] = useState({});

    useEffect(() => {
      const handler = (e) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
          onClose();
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [onClose, anchorRef]);

    const toggleDate = (d) => {
      setLocalSelected(prev => prev.includes(d) ? prev.filter(v => v !== d) : [...prev, d]);
    };

    const toggleYear = (year) => {
      setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
    };

    const toggleMonth = (key) => {
      setExpandedMonths(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const getDatesInYear = (year) => {
      const months = dateTree[year] || {};
      return Object.values(months).flat();
    };

    const getDatesInMonth = (year, monthLabel) => {
      return dateTree[year]?.[monthLabel] || [];
    };

    const toggleAllInYear = (year) => {
      const datesInYear = getDatesInYear(year);
      const allSelected = datesInYear.every(d => localSelected.includes(d));
      if (allSelected) {
        setLocalSelected(prev => prev.filter(d => !datesInYear.includes(d)));
      } else {
        setLocalSelected(prev => [...new Set([...prev, ...datesInYear])]);
      }
    };

    const toggleAllInMonth = (year, monthLabel) => {
      const datesInMonth = getDatesInMonth(year, monthLabel);
      const allSelected = datesInMonth.every(d => localSelected.includes(d));
      if (allSelected) {
        setLocalSelected(prev => prev.filter(d => !datesInMonth.includes(d)));
      } else {
        setLocalSelected(prev => [...new Set([...prev, ...datesInMonth])]);
      }
    };

    const selectAll = () => setLocalSelected([...allFlat]);
    const clearAll = () => setLocalSelected([]);

    const isAllSelected = allFlat.length > 0 && localSelected.length === allFlat.length;
    const isSomeSelected = localSelected.length > 0 && localSelected.length < allFlat.length;

    const handleApply = () => {
      onApply(localSelected);
      onClose();
    };

    const years = Object.keys(dateTree).sort().reverse();
    const matchesSearch = (str) => str.toLowerCase().includes(search.toLowerCase());

    return (
      <div
        ref={dropdownRef}
        className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-2xl w-64 overflow-hidden"
        style={{ minWidth: "240px" }}
      >
        <div className="p-2 border-b border-slate-200">
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            autoFocus
          />
        </div>
        <div className="border-b border-slate-100">
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 cursor-pointer">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={el => { if (el) el.indeterminate = isSomeSelected; }}
              onChange={() => isAllSelected ? clearAll() : selectAll()}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 font-medium">(Select All)</span>
          </label>
        </div>
        <div className="max-h-52 overflow-y-auto">
          {years.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-400 text-center">No dates available</p>
          ) : (
            years.filter(y => matchesSearch(y) || Object.keys(dateTree[y]).some(m => matchesSearch(m))).map(year => {
              const months = dateTree[year];
              const monthKeys = Object.keys(months).sort();
              const datesInYear = getDatesInYear(year);
              const yearAllSelected = datesInYear.every(d => localSelected.includes(d));
              const yearSomeSelected = datesInYear.some(d => localSelected.includes(d)) && !yearAllSelected;
              const isYearExpanded = expandedYears[year] !== false;

              return (
                <div key={year}>
                  <div className="flex items-center border-b border-slate-50 hover:bg-blue-50/50">
                    <button onClick={() => toggleYear(year)} className="p-1.5 text-slate-400 hover:text-slate-700 flex-shrink-0">
                      {isYearExpanded ? <ChevronDownIcon size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <label className="flex items-center gap-2 flex-1 py-1.5 pr-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={yearAllSelected}
                        ref={el => { if (el) el.indeterminate = yearSomeSelected; }}
                        onChange={() => toggleAllInYear(year)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-semibold text-slate-800">{year}</span>
                    </label>
                  </div>
                  {isYearExpanded && monthKeys.filter(m => matchesSearch(m)).map(monthLabel => {
                    const datesInMonth = months[monthLabel];
                    const monthAllSelected = datesInMonth.every(d => localSelected.includes(d));
                    const monthSomeSelected = datesInMonth.some(d => localSelected.includes(d)) && !monthAllSelected;
                    const monthKey = `${year}-${monthLabel}`;
                    const isMonthExpanded = expandedMonths[monthKey] === true;

                    return (
                      <div key={monthKey}>
                        <div className="flex items-center pl-6 border-b border-slate-50 hover:bg-blue-50/50">
                          <button onClick={() => toggleMonth(monthKey)} className="p-1.5 text-slate-400 hover:text-slate-700 flex-shrink-0">
                            {isMonthExpanded ? <ChevronDownIcon size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <label className="flex items-center gap-2 flex-1 py-1.5 pr-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={monthAllSelected}
                              ref={el => { if (el) el.indeterminate = monthSomeSelected; }}
                              onChange={() => toggleAllInMonth(year, monthLabel)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-600">{monthLabel}</span>
                          </label>
                        </div>
                        {isMonthExpanded && datesInMonth.filter(d => matchesSearch(d)).map(d => (
                          <label key={d} className="flex items-center gap-2.5 pl-12 pr-3 py-1.5 hover:bg-blue-50 cursor-pointer border-b border-slate-50">
                            <input
                              type="checkbox"
                              checked={localSelected.includes(d)}
                              onChange={() => toggleDate(d)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-600">{d}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
        <div className="p-2.5 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
          <button onClick={handleApply} className="px-4 py-1.5 text-sm font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">APPLY</button>
        </div>
      </div>
    );
  }

  // ============================================================
  // GENERIC FILTER DROPDOWN
  // ============================================================
  function GenericFilterDropdown({ allValues, selectedValues, onApply, onClose, anchorRef }) {
    const dropdownRef = useRef(null);
    const [search, setSearch] = useState("");
    const [localSelected, setLocalSelected] = useState(
      selectedValues && selectedValues.length > 0 ? [...selectedValues] : [...allValues]
    );

    useEffect(() => {
      const handler = (e) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
          onClose();
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [onClose, anchorRef]);

    const filteredValues = allValues.filter(v => String(v).toLowerCase().includes(search.toLowerCase()));
    const toggleValue = (val) => {
      setLocalSelected(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
    };
    const selectAll = () => setLocalSelected([...allValues]);
    const clearAll = () => setLocalSelected([]);

    const isAllSelected = allValues.length > 0 && localSelected.length === allValues.length;
    const isSomeSelected = localSelected.length > 0 && localSelected.length < allValues.length;

    const handleApply = () => {
      onApply(localSelected);
      onClose();
    };

    return (
      <div
        ref={dropdownRef}
        className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-2xl w-56 overflow-hidden"
        style={{ minWidth: "200px" }}
      >
        <div className="p-2 border-b border-slate-200">
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            autoFocus
          />
        </div>
        <div className="border-b border-slate-100">
          <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 cursor-pointer">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={el => { if (el) el.indeterminate = isSomeSelected; }}
              onChange={() => isAllSelected ? clearAll() : selectAll()}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 font-medium">(Select All)</span>
          </label>
        </div>
        <div className="max-h-52 overflow-y-auto">
          {filteredValues.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-400 text-center">No matches found</p>
          ) : (
            filteredValues.map((val) => (
              <label key={String(val)} className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-50">
                <input
                  type="checkbox"
                  checked={localSelected.includes(val)}
                  onChange={() => toggleValue(val)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700 truncate">{String(val) || <span className="text-slate-400 italic">(empty)</span>}</span>
              </label>
            ))
          )}
        </div>
        <div className="p-2.5 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors">Cancel</button>
          <button onClick={handleApply} className="px-4 py-1.5 text-sm font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors">APPLY</button>
        </div>
      </div>
    );
  }

  // ============================================================
  // FILTER HEADER CELL
  // ============================================================
  function FilterTh({ label, columnKey, align = "left", filters, allValues, onApplyFilter, onOpenFilter, openFilterKey }) {
    const isActive = filters[columnKey] && filters[columnKey].length > 0 && filters[columnKey].length < allValues.length;
    const isOpen = openFilterKey === columnKey;
    const thRef = useRef(null);
    const hasValues = allValues && allValues.length > 0;

    const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
    const justifyClass = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
    const handleClose = () => onOpenFilter(null);
    const handleApply = (vals) => onApplyFilter(columnKey, vals);

    return (
      <th ref={thRef} className={`py-3 px-4 border border-[#00a884] text-[13px] font-bold uppercase tracking-wider whitespace-nowrap ${alignClass} select-none relative`}>
        <div className={`flex items-center gap-1.5 ${justifyClass}`}>
          <span>{label}</span>
          {hasValues && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onOpenFilter(isOpen ? null : columnKey); }}
              title={`Filter by ${label}`}
              className={`p-0.5 rounded transition-all duration-150 hover:bg-white/20 ${isActive ? "text-yellow-300 bg-white/25" : isOpen ? "text-white bg-white/20" : "text-white/50 hover:text-white"}`}
            >
              <Filter size={13} strokeWidth={2.5} />
            </button>
          )}
        </div>
        {isOpen && columnKey === "date" && (
          <DateFilterDropdown allDates={allValues} selectedDates={filters[columnKey] || allValues} onApply={handleApply} onClose={handleClose} anchorRef={thRef} />
        )}
        {isOpen && columnKey !== "date" && hasValues && (
          <GenericFilterDropdown allValues={allValues} selectedValues={filters[columnKey] || allValues} onApply={handleApply} onClose={handleClose} anchorRef={thRef} />
        )}
      </th>
    );
  }

  // ============================================================
  // MODAL HELPERS
  // ============================================================
  const inputCls = (hasError, extra = "") =>
    `w-full px-3.5 py-2.5 text-sm text-slate-800 border rounded-xl outline-none transition-colors focus:ring-2 placeholder:text-slate-400 ${hasError
      ? "border-rose-300 bg-rose-50/50 focus:ring-rose-400"
      : "border-slate-200 bg-slate-50 hover:bg-white focus:bg-white focus:ring-indigo-500"
    } ${extra}`;

  function Field({ label, required, error, hint, children, className = "" }) {
    return (
      <div className={className}>
        <label className="flex items-center gap-1 text-xs font-semibold text-slate-700 mb-1.5">
          {label}
          {required && <span className="text-rose-500" aria-hidden="true">*</span>}
        </label>
        {children}
        {error ? (
          <p className="mt-1 text-[11px] font-medium text-rose-600 flex items-center gap-1">
            <AlertCircle size={11} /> {error}
          </p>
        ) : hint ? (
          <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  }

  function ModeCard({ checked, onChange, icon: Icon, title, description, accent }) {
    const accents = {
      indigo: {
        on: "border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500",
        box: "bg-indigo-600 border-indigo-600",
        icon: "bg-indigo-100 text-indigo-600",
      },
      emerald: {
        on: "border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500",
        box: "bg-emerald-600 border-emerald-600",
        icon: "bg-emerald-100 text-emerald-600",
      },
    }[accent];

    return (
      <label
        className={`relative flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:ring-indigo-400 ${checked ? accents.on : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
          }`}
      >
        <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
        <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-md border flex items-center justify-center transition-colors ${checked ? accents.box : "bg-white border-slate-300"}`}>
          {checked && <Check size={13} className="text-white" strokeWidth={3} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2">
            <span className={`p-1 rounded-md ${checked ? accents.icon : "bg-slate-100 text-slate-500"}`}>
              <Icon size={14} />
            </span>
            <span className="text-sm font-bold text-slate-800">{title}</span>
          </span>
          <span className="block text-[11px] text-slate-500 mt-1 leading-snug">{description}</span>
        </span>
      </label>
    );
  }

  // ============================================================
  // ADD OPERATION MODAL
  // ============================================================
  function OperationModal({ isOpen, onClose, onSave, isLoading, initialData, compositions, unitSuggestions }) {
    const axiosPrivate = useAxiosPrivate();
    const rowCounter = useRef(0);
    const makeRow = () => {
      rowCounter.current += 1;
      return { key: `row-${rowCounter.current}`, processType: "", input: "", output: "" };
    };

    const [common, setCommon] = useState({
      date: new Date().toISOString().split("T")[0],
      lineNo: "",
      manufacturingUnit: "",
      compositionId: "",
    });
    const [useComplete, setUseComplete] = useState(false);
    const [useProcesses, setUseProcesses] = useState(false);
    const [complete, setComplete] = useState({ pricePerPcs: "", production: "" });
    const [processRows, setProcessRows] = useState([]);
    const [processOptions, setProcessOptions] = useState(PROCESS_TYPES);
    const [errors, setErrors] = useState({});
    const {user} = useAuth();

    // Reset the form each time the modal opens
    useEffect(() => {
      if (!isOpen) return;
      setCommon({
        date: initialData?.date || new Date().toISOString().split("T")[0],
        lineNo: initialData?.lineNo || "",
        manufacturingUnit: user?.workingStation,
        compositionId: initialData?.compositionId || (compositions.length === 1 ? compositions[0].id : ""),
      });
      setUseComplete(false);
      setUseProcesses(false);
      setComplete({ pricePerPcs: "", production: "" });
      setProcessRows([makeRow()]);
      setErrors({});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Keep the composition valid if the job selection changes while open
    useEffect(() => {
      if (isOpen && compositions.length === 1) {
        setCommon(prev => ({ ...prev, compositionId: compositions[0].id }));
      }
    }, [isOpen, compositions]);

    const fetchProcesses = useCallback(async () => {
      try {
        const res = await axiosPrivate.get("/api/get-all-processes");
        if (Array.isArray(res.data) && res.data.length > 0) {
          const names = res.data.map(getProcessName).filter(Boolean);
          if (names.length > 0) setProcessOptions([...new Set(names)]);
        }
      } catch (e) {
        console.log("Falling back to default process types", e);
      }
    }, [axiosPrivate]);

    useEffect(() => { fetchProcesses(); }, [fetchProcesses]);

    // Close on Escape
    useEffect(() => {
      if (!isOpen) return undefined;
      const onKey = (e) => { if (e.key === "Escape" && !isLoading) onClose(); };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [isOpen, isLoading, onClose]);

    const totals = useMemo(() => {
      let input = 0;
      let output = 0;
      let entries = 0;
      if (useComplete) {
        entries += 1;
        output += Number(complete.production) || 0;
      }
      if (useProcesses) {
        processRows.forEach(r => {
          entries += 1;
          input += Number(r.input) || 0;
          output += Number(r.output) || 0;
        });
      }
      return { input, output, entries };
    }, [useComplete, useProcesses, complete, processRows]);

    if (!isOpen) return null;

    const clearError = (key) => setErrors(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

    const handleCommonChange = (e) => {
      const { name, value } = e.target;
      setCommon(prev => ({ ...prev, [name]: value }));
      clearError(name);
    };

    const handleCompleteChange = (e) => {
      const { name, value } = e.target;
      setComplete(prev => ({ ...prev, [name]: value }));
      clearError(`complete_${name}`);
    };

    const toggleProcesses = () => {
      setUseProcesses(prev => {
        const next = !prev;
        if (next && processRows.length === 0) setProcessRows([makeRow()]);
        return next;
      });
      clearError("mode");
    };

    const toggleComplete = () => {
      setUseComplete(prev => !prev);
      clearError("mode");
    };

    const updateRow = (key, field, value) => {
      setProcessRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)));
      clearError(`${key}_${field}`);
    };

    const addRow = () => setProcessRows(prev => [...prev, makeRow()]);

    const removeRow = (key) => setProcessRows(prev => (prev.length > 1 ? prev.filter(r => r.key !== key) : prev));

    const validate = () => {
      const e = {};
      if (!common.date) e.date = "Select a date.";
      if (!common.lineNo.trim()) e.lineNo = "Enter the line number.";
      if (!common.manufacturingUnit.trim()) e.manufacturingUnit = "Enter the manufacturing unit.";
      if (compositions.length > 0 && !common.compositionId) e.compositionId = "Select a composition.";

      if (!useComplete && !useProcesses) e.mode = "Choose Complete GMTS, Processes, or both.";

      if (useComplete) {
        if (complete.pricePerPcs === "" || Number(complete.pricePerPcs) < 0) e.complete_pricePerPcs = "Enter the price per piece.";
        if (complete.production === "" || Number(complete.production) <= 0) e.complete_production = "Enter the production qty.";
      }

      if (useProcesses) {
        processRows.forEach(r => {
          if (!r.processType) e[`${r.key}_processType`] = "Select a process.";
          if (r.input === "" || Number(r.input) < 0) e[`${r.key}_input`] = "Required.";
          if (r.output === "" || Number(r.output) < 0) e[`${r.key}_output`] = "Required.";
        });
      }

      setErrors(e);
      return Object.keys(e).length === 0;
    };

    const handleSubmit = (ev) => {
      ev.preventDefault();
      if (!validate()) return;
      onSave({
        date: common.date,
        lineNo: common.lineNo.trim(),
        manufacturingUnit: common.manufacturingUnit.trim(),
        compositionId: common.compositionId,
        complete: useComplete
          ? { pricePerPcs: Number(complete.pricePerPcs) || 0, production: Number(complete.production) || 0 }
          : null,
        processes: useProcesses
          ? processRows.map(r => ({
            processType: r.processType,
            input: Number(r.input) || 0,
            output: Number(r.output) || 0,
          }))
          : [],
      });
    };

    const hasErrors = Object.keys(errors).length > 0;

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-modal-title"
      >
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-100 animate-in fade-in zoom-in duration-200"
        >
          {/* Header */}
          <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-indigo-50/60">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-md shadow-indigo-200"><Plus size={18} /></div>
              <div>
                <h3 id="operation-modal-title" className="text-base font-bold text-slate-900 leading-tight">Add Operation Entry</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Fields marked <span className="text-rose-500 font-bold">*</span> are required.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={isLoading} aria-label="Close"
              className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {hasErrors && (
              <div className="flex items-start gap-2 px-3.5 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                Some required details are missing. Check the highlighted fields.
              </div>
            )}

            {/* Section 1: Entry details */}
            <section className="space-y-4">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Layers size={15} className="text-indigo-500" /> Entry details
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Date" required error={errors.date}>
                  <div className="relative">
                    <input type="date" name="date" value={common.date} onChange={handleCommonChange}
                      className={inputCls(errors.date, "pl-10")} />
                    <Calendar size={16} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                  </div>
                </Field>

                <Field label="Line number" required error={errors.lineNo}>
                  <div className="relative">
                    <input type="text" name="lineNo" placeholder="e.g. Line 04" value={common.lineNo} onChange={handleCommonChange}
                      className={inputCls(errors.lineNo, "pl-10")} />
                    <Hash size={16} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                  </div>
                </Field>

                <Field label="Manufacturing unit" required error={errors.manufacturingUnit} className={compositions.length > 0 ? "" : "sm:col-span-2"}>
                  <div className="relative">
                    <input type="text" name="manufacturingUnit" list="manufacturing-unit-options" placeholder="e.g. Unit 2 / Factory name"
                      value={common.manufacturingUnit} onChange={handleCommonChange} autoComplete="off"
                      className={inputCls(errors.manufacturingUnit, "pl-10")} />
                    <Factory size={16} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                    <datalist id="manufacturing-unit-options">
                      {(unitSuggestions || []).map(u => <option key={u} value={u} />)}
                    </datalist>
                  </div>
                </Field>

                {compositions.length > 0 && (
                  <Field label="Composition" required error={errors.compositionId}>
                    <select name="compositionId" value={common.compositionId} onChange={handleCommonChange}
                      className={inputCls(errors.compositionId, "bg-white appearance-none")}>
                      {compositions.length === 1
                        ? <option value={compositions[0].id}>{compositions[0].label} — Qty: {compositions[0].orderQty.toLocaleString()}</option>
                        : <>
                          <option value="">Select a composition...</option>
                          {compositions.map(c => <option key={c.id} value={c.id}>{c.label} — Qty: {c.orderQty.toLocaleString()}</option>)}
                        </>
                      }
                    </select>
                  </Field>
                )}
              </div>
            </section>

            <hr className="border-slate-100" />

            {/* Section 2: Entry type */}
            <section className="space-y-3">
              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp size={15} className="text-indigo-500" /> What are you recording?
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 ml-[23px]">You can pick one or both.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ModeCard
                  checked={useComplete}
                  onChange={toggleComplete}
                  icon={Shirt}
                  accent="indigo"
                  title="Complete GMTS"
                  description="Fully stitched garments with a price per piece."
                />
                <ModeCard
                  checked={useProcesses}
                  onChange={toggleProcesses}
                  icon={Scissors}
                  accent="emerald"
                  title="Processes"
                  description="Individual sewing operations with input and production."
                />
              </div>
              {errors.mode && (
                <p className="text-[11px] font-medium text-rose-600 flex items-center gap-1">
                  <AlertCircle size={11} /> {errors.mode}
                </p>
              )}
              {!useComplete && !useProcesses && !errors.mode && (
                <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                  <Info size={14} className="text-slate-400 shrink-0" />
                  Select an option above to open its entry fields.
                </div>
              )}
            </section>

            {/* Complete GMTS panel */}
            {useComplete && (
              <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-4 animate-in fade-in duration-200">
                <h4 className="text-sm font-bold text-indigo-800 flex items-center gap-2">
                  <Shirt size={15} /> Complete GMTS
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Price per pcs" required error={errors.complete_pricePerPcs}>
                    <div className="relative">
                      <input type="number" name="pricePerPcs" min="0" step="any" placeholder="0.00"
                        value={complete.pricePerPcs} onChange={handleCompleteChange}
                        className={inputCls(errors.complete_pricePerPcs, "pl-10 bg-white tabular-nums")} />
                      <Tag size={16} className="absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                    </div>
                  </Field>
                  <Field label="Production qty (Pcs)" required error={errors.complete_production}>
                    <input type="number" name="production" min="0" placeholder="0"
                      value={complete.production} onChange={handleCompleteChange}
                      className={inputCls(errors.complete_production, "bg-white tabular-nums")} />
                  </Field>
                </div>
                {Number(complete.pricePerPcs) > 0 && Number(complete.production) > 0 && (
                  <p className="text-xs text-indigo-700 font-medium">
                    Value for this entry: {(Number(complete.pricePerPcs) * Number(complete.production)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </p>
                )}
              </section>
            )}

            {/* Processes panel */}
            {useProcesses && (
              <section className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <Scissors size={15} /> Processes
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">{processRows.length}</span>
                  </h4>
                </div>

                <div className="hidden sm:grid grid-cols-12 gap-3 px-1 text-[11px] font-semibold text-slate-500">
                  <span className="col-span-6">Process name</span>
                  <span className="col-span-3">Input qty</span>
                  <span className="col-span-2">Production qty</span>
                  <span className="col-span-1" />
                </div>

                <div className="space-y-2.5">
                  {processRows.map((row, idx) => {
                    const over = Number(row.output) > Number(row.input) && row.input !== "";
                    return (
                      <div key={row.key} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                        <div className="grid grid-cols-12 gap-3 items-start">
                          <div className="col-span-12 sm:col-span-6">
                            <label className="sm:hidden block text-[11px] font-semibold text-slate-500 mb-1">Process name</label>
                            <select value={row.processType} onChange={(e) => updateRow(row.key, "processType", e.target.value)}
                              aria-label={`Process name, row ${idx + 1}`}
                              className={inputCls(errors[`${row.key}_processType`], "bg-white appearance-none")}>
                              <option value="">Select process...</option>
                              {processOptions.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            {errors[`${row.key}_processType`] && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors[`${row.key}_processType`]}</p>}
                          </div>
                          <div className="col-span-6 sm:col-span-3">
                            <label className="sm:hidden block text-[11px] font-semibold text-slate-500 mb-1">Input qty</label>
                            <input type="number" min="0" placeholder="0" value={row.input}
                              aria-label={`Input qty, row ${idx + 1}`}
                              onChange={(e) => updateRow(row.key, "input", e.target.value)}
                              className={inputCls(errors[`${row.key}_input`], "tabular-nums")} />
                            {errors[`${row.key}_input`] && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors[`${row.key}_input`]}</p>}
                          </div>
                          <div className="col-span-5 sm:col-span-2">
                            <label className="sm:hidden block text-[11px] font-semibold text-slate-500 mb-1">Production qty</label>
                            <input type="number" min="0" placeholder="0" value={row.output}
                              aria-label={`Production qty, row ${idx + 1}`}
                              onChange={(e) => updateRow(row.key, "output", e.target.value)}
                              className={inputCls(errors[`${row.key}_output`], "tabular-nums")} />
                            {errors[`${row.key}_output`] && <p className="mt-1 text-[11px] font-medium text-rose-600">{errors[`${row.key}_output`]}</p>}
                          </div>
                          <div className="col-span-1 flex justify-end pt-1 sm:pt-0">
                            <button type="button" onClick={() => removeRow(row.key)} disabled={processRows.length === 1}
                              title={processRows.length === 1 ? "At least one row is needed" : "Remove row"}
                              aria-label={`Remove row ${idx + 1}`}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 disabled:cursor-not-allowed transition-colors">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        {over && (
                          <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 flex items-center gap-1">
                            <AlertCircle size={11} /> Production is higher than input on this row.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button type="button" onClick={addRow}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-emerald-700 bg-white border border-dashed border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 rounded-xl transition-colors">
                  <Plus size={14} /> Add row
                </button>
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
              <span><span className="font-bold text-slate-700 tabular-nums">{totals.entries}</span> {totals.entries === 1 ? "entry" : "entries"}</span>
              {useProcesses && <span>Input <span className="font-bold text-slate-700 tabular-nums">{totals.input.toLocaleString()}</span></span>}
              <span>Production <span className="font-bold text-emerald-700 tabular-nums">{totals.output.toLocaleString()}</span></span>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={isLoading}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={isLoading}
                className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-70">
                {isLoading ? <Loader size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                Save entry
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ============================================================
  // MAIN DASHBOARD COMPONENT
  // ============================================================
  export default function SewingContract() {
    const axiosPrivate = useAxiosPrivate();

    const [headerData, setHeaderData] = useState({ date: new Date().toISOString().split("T")[0], jobNo: "", styleNo: "", lineNo: "" });
    const [jobSearch, setJobSearch] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [compositionId, setCompositionId] = useState(null);
    const skipNextSearch = useRef(false);

    const [rows, setRows] = useState([]);
    const [isLoadingRows, setIsLoadingRows] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [filters, setFilters] = useState({});
    const [openFilterKey, setOpenFilterKey] = useState(null);
    const {user} = useAuth();
    // Toast state
    const [toast, setToast] = useState(null);

    useEffect(() => {
      if (!toast) return undefined;
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }, [toast]);

    const handleApplyFilter = (columnKey, selectedValues) => {
      setFilters(prev => ({ ...prev, [columnKey]: selectedValues }));
    };

    const fetchSummary = useCallback(async () => {
      setIsLoadingRows(true);
      if(!user) return;
      try {
        const { data } = await axiosPrivate.get(`/api/get-contractual-job-summary/${user?.workingStation}`);
        const list = Array.isArray(data) ? data : data ? [data] : [];
        setRows(list.map(mapSummaryRow));
      } catch (error) {
          setToast({ type: 'error', message: "Failed to load production summary." });
      } finally {
        setIsLoadingRows(false);
      }
    }, [axiosPrivate, user]);

    console.log(rows, "rows");

    useEffect(() => {
      fetchSummary();
    }, [fetchSummary]);

    const compositions = useMemo(() => {
      if (!selectedJob?.rows) return [];
      return selectedJob.rows
        .map((r) => ({ id: r.id, label: getCompositionLabel(r.composition), orderQty: Number(r.orderQty) || 0 }))
        .filter((c) => c.orderQty > 0);
    }, [selectedJob]);

    const activeComposition = compositions.find((c) => String(c.id) === String(compositionId)) || null;

    const handleSelectJob = (job, chosenCompositionId = null) => {
      const firstValid = (job.rows || []).find((r) => Number(r.orderQty) > 0);
      setSelectedJob(job);
      setCompositionId(chosenCompositionId !== null ? chosenCompositionId : firstValid ? firstValid.id : null);
      setHeaderData(prev => ({ ...prev, jobNo: job.jobNo || "", styleNo: job.styleNo || "" }));
      skipNextSearch.current = true;
      setJobSearch(job.jobNo || "");
      setSearchResults([]);
    };

    const handleClearJob = () => {
      setSelectedJob(null); setCompositionId(null);
      setHeaderData(prev => ({ ...prev, jobNo: "", styleNo: "" }));
      setJobSearch(""); setSearchResults([]);
    };

    useEffect(() => {
      if (skipNextSearch.current) { skipNextSearch.current = false; return; }
      const term = jobSearch.trim();
      if (!term) { setSearchResults([]); setIsSearching(false); return; }
      let cancelled = false;
      const timer = setTimeout(async () => {
        setIsSearching(true);
        try {
          const { data } = await axiosPrivate.get("/api/get-contractual-job", { params: { jobNo: term } });
          if (cancelled) return;
          setSearchResults(Array.isArray(data) ? data : data ? [data] : []);
        } catch (e) {
          console.log(e);
          if (!cancelled) setSearchResults([]);
        }
        finally { if (!cancelled) setIsSearching(false); }
      }, 800);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [jobSearch, axiosPrivate]);

    // Save: builds one payload per entry (1 for Complete GMTS + 1 per process row)
    const handleSaveOperation = async (form) => {
      if (!headerData.jobNo) {
        setToast({ type: 'error', message: "Please search and select a Job No from the top bar first." });
        return;
      }
      const compId = form.compositionId || activeComposition?.id;
      if (!compId) {
        setToast({ type: 'error', message: "Please select a valid composition." });
        return;
      }

      const base = {
        jobNo: headerData.jobNo,
        compositionId: compId,
        date: form.date,
        lineNo: form.lineNo,
        manufacturingUnit: form.manufacturingUnit,
      };

      const payloads = [];
      if (form.complete) {
        payloads.push({
          ...base,
          entryType: "COMPLETE_GMTS",
          processType: COMPLETE_GMTS_LABEL,
          pricePerPcs: form.complete.pricePerPcs,
          input: form.complete.production,
          output: form.complete.production,
        });
      }
      form.processes.forEach((p) => {
        payloads.push({
          ...base,
          entryType: "PROCESS",
          processType: p.processType,
          input: p.input,
          output: p.output,
        });
      });

      if (payloads.length === 0) {
        setToast({ type: 'error', message: "Add at least one entry before saving." });
        return;
      }

      setIsSaving(true);
      try {
        const results = await Promise.allSettled(
          payloads.map((p) => axiosPrivate.post("/api/add-contractual-job", p))
        );
        const failed = results.filter((r) => r.status === "rejected");
        const savedCount = payloads.length - failed.length;
        await fetchSummary();

        if (failed.length === 0) {
          setToast({
            type: 'success',
            message: payloads.length === 1 ? "Operation entry saved successfully." : `${payloads.length} operation entries saved successfully.`,
          });
          setIsModalOpen(false);
        } else if (savedCount > 0) {
          // Some rows were saved: close to avoid duplicate saves on retry
          console.error("Partial save failure:", failed.map(f => f.reason));
          setToast({ type: 'error', message: `${savedCount} of ${payloads.length} entries saved. ${failed.length} failed - check the table and add the missing ones.` });
          setIsModalOpen(false);
        } else {
          const reason = failed[0]?.reason;
          console.error("Save failed:", reason);
          setToast({ type: 'error', message: reason?.response?.data?.message || "Could not save entry." });
        }
      } catch (error) {
        console.error("Save failed:", error);
        setToast({ type: 'error', message: error?.response?.data?.message || "Could not save entry." });
      } finally {
        setIsSaving(false);
      }
    };

    const handleDeleteRow = async (id) => {
      if (!window.confirm("Are you sure you want to delete this record?")) return;
      console.log(id);
      // Optimistic update
      setRows(prev => prev.filter(row => row.id !== id));

      try {
        // NOTE: Replace '/api/delete-contractual-job' with your actual delete endpoint
        await axiosPrivate.delete(`/api/delete-contractual-job/${id}`);
        setToast({ type: 'success', message: 'Record deleted successfully.' });
        await fetchSummary(); // Refresh to ensure sync with backend
      } catch (error) {
        console.error("Delete failed:", error);
        setToast({ type: 'error', message: error?.response?.data?.message || "Could not delete record." });
        await fetchSummary(); // Revert optimistic update by fetching latest
      }
    };

    const scopedRows = useMemo(() => {
      if (!headerData.jobNo) return rows;
      return rows.filter(r => {
        if (r.jobNo !== headerData.jobNo) return false;
        if (activeComposition && r.compositionId !== null) return String(r.compositionId) === String(activeComposition.id);
        return true;
      });
    }, [rows, headerData.jobNo, activeComposition]);

    const uniqueValues = useMemo(() => ({
      date: [...new Set(scopedRows.map(r => r.date).filter(Boolean))].sort(),
      jobNo: [...new Set(scopedRows.map(r => r.jobNo).filter(Boolean))].sort(),
      styleNo: [...new Set(scopedRows.map(r => r.styleNo).filter(Boolean))].sort(),
      manufacturingUnit: [...new Set(scopedRows.map(r => r.manufacturingUnit).filter(Boolean))].sort(),
      lineNo: [...new Set(scopedRows.map(r => r.lineNo).filter(Boolean))].sort(),
      processType: [...new Set(scopedRows.map(r => r.processType).filter(Boolean))].sort(),
      status: ["Target Met", "In Progress"],
    }), [scopedRows]);

    // Suggestions for the modal's manufacturing unit field (from all loaded records)
    const unitSuggestions = useMemo(
      () => [...new Set(rows.map(r => r.manufacturingUnit).filter(Boolean))].sort(),
      [rows]
    );

    const filteredRows = useMemo(() => {
      return scopedRows.filter(row => {
        const ratio = row.todayInput > 0 ? (row.todayOutput / row.todayInput) * 100 : 0;
        const status = ratio >= 95 ? "Target Met" : "In Progress";
        if (filters.date && filters.date.length && !filters.date.includes(row.date)) return false;
        if (filters.jobNo && filters.jobNo.length && !filters.jobNo.includes(row.jobNo)) return false;
        if (filters.styleNo && filters.styleNo.length && !filters.styleNo.includes(row.styleNo)) return false;
        if (filters.manufacturingUnit && filters.manufacturingUnit.length && !filters.manufacturingUnit.includes(row.manufacturingUnit)) return false;
        if (filters.lineNo && filters.lineNo.length && !filters.lineNo.includes(row.lineNo)) return false;
        if (filters.processType && filters.processType.length && !filters.processType.includes(row.processType)) return false;
        if (filters.status && filters.status.length && !filters.status.includes(status)) return false;
        return true;
      });
    }, [scopedRows, filters]);

    const orderQty = useMemo(() => {
      if (activeComposition) return activeComposition.orderQty;
      const seen = new Map();
      scopedRows.forEach(r => { const k = `${r.jobNo}|${r.compositionId ?? ''}|${r.orderQty}`; if (!seen.has(k)) seen.set(k, r.orderQty); });
      return Array.from(seen.values()).reduce((a, b) => a + b, 0);
    }, [activeComposition, scopedRows]);

    const totalInput = filteredRows.reduce((acc, r) => acc + Number(r.todayInput || 0), 0);
    const totalOutput = filteredRows.reduce((acc, r) => acc + Number(r.todayOutput || 0), 0);
    const totalWip = Math.max(0, totalInput - totalOutput);
    const efficiencyRate = totalInput > 0 ? ((totalOutput / totalInput) * 100).toFixed(1) : 0;
    const remainingToOrder = Math.max(0, orderQty - totalOutput);

    const simpleActiveCount = Object.entries(filters).filter(([key, vals]) => {
      if (!vals || vals.length === 0) return false;
      const allVals = uniqueValues[key] || [];
      return vals.length < allVals.length;
    }).length;

    return (
      <div className="h-screen flex flex-col bg-slate-50 text-slate-800 font-sans overflow-hidden">
        <Toast toast={toast} onClose={() => setToast(null)} />

        {/* Top Navigation */}
        <header className="shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-3 shadow-sm z-20">
          <div className="max-w-[1920px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-indigo-200 shadow-md">
                <Layers size={18} />
              </div>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">Sewing Floor Control</h1>
                <p className="text-[10px] text-slate-500">Real-time production tracking</p>
              </div>
            </div>
            <div className="relative w-full md:w-80">
              <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:bg-white transition-all">
                <Search size={14} className="text-slate-400 mr-2" />
                <input type="text" placeholder="Search Contract Job No..." value={jobSearch} onChange={(e) => setJobSearch(e.target.value)}
                  className="bg-transparent border-none outline-none text-xs w-full text-slate-700 placeholder:text-slate-400" />
                {isSearching && <Loader size={14} className="text-indigo-500 animate-spin ml-2" />}
                {selectedJob && (
                  <button onClick={handleClearJob} className="ml-2 p-0.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-rose-500 transition-colors">
                    <X size={12} />
                  </button>
                )}
              </div>
              {searchResults.length > 0 && (
                <ul className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto z-40 text-xs">
                  {searchResults.flatMap((job, i) => {
                    const validRows = (job.rows || []).filter(r => Number(r.orderQty) > 0);
                    if (validRows.length === 0) {
                      return (
                        <li key={`${job.jobNo}-${i}`}>
                          <button onClick={() => handleSelectJob(job)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                            <span className="font-semibold text-slate-900 block">{job.jobNo}</span>
                            <span className="text-[10px] text-slate-500">Style: {job.styleNo || "—"}</span>
                          </button>
                        </li>
                      );
                    }
                    return validRows.map((r) => (
                      <li key={`${job.jobNo}-${i}-${r.id}`}>
                        <button onClick={() => handleSelectJob(job, r.id)} className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                          <span className="font-semibold text-slate-900 block">{job.jobNo}</span>
                          <span className="text-[10px] text-indigo-600 font-medium block mt-0.5">{getCompositionLabel(r.composition)} • {Number(r.orderQty).toLocaleString()} pcs</span>
                        </button>
                      </li>
                    ));
                  })}
                </ul>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-[1920px] mx-auto space-y-4 h-full flex flex-col">

            {/* KPI Cards */}
            <section className="shrink-0 grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { label: "Order Qty", val: orderQty.toLocaleString(), sub: activeComposition ? activeComposition.label : "All Jobs", color: "slate", icon: Hash },
                { label: "Total Input", val: totalInput.toLocaleString(), sub: "Pieces issued", color: "slate", icon: Layers },
                { label: "Total Output", val: totalOutput.toLocaleString(), sub: `${remainingToOrder.toLocaleString()} remaining`, color: "emerald", icon: TrendingUp },
                { label: "Balance WIP", val: totalWip.toLocaleString(), sub: "In-progress on floor", color: "amber", icon: AlertCircle },
                { label: "Efficiency", val: `${efficiencyRate}%`, sub: "Pass Rate", color: "indigo", icon: TrendingUp, isProgress: true }
              ].map((stat, idx) => (
                <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-1">
                    <p className={`text-[10px] font-bold uppercase tracking-wider text-${stat.color}-500`}>{stat.label}</p>
                    <stat.icon size={14} className={`text-${stat.color}-400`} />
                  </div>
                  <p className="text-xl font-extrabold text-slate-900 tracking-tight">{stat.val}</p>
                  {stat.isProgress
                    ? <div className="w-full bg-slate-100 rounded-full h-1 mt-2"><div className={`bg-${stat.color}-500 h-1 rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, parseFloat(stat.val))}%` }} /></div>
                    : <p className="text-[10px] text-slate-400 mt-0.5 truncate">{stat.sub}</p>
                  }
                </div>
              ))}
            </section>

            {/* TABLE CONTAINER */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-0 border border-[#00a884]">

              {/* Toolbar */}
              <div className="shrink-0 p-4 border-b border-[#00a884] flex items-center justify-between bg-slate-50/50">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Recorded Operations</h2>
                  <p className="text-[10px] text-slate-500 mt-0.5">Live breakdown by sewing stage.</p>
                </div>
                <div className="flex items-center gap-2">
                  {simpleActiveCount > 0 && (
                    <button
                      onClick={() => { setFilters({}); setOpenFilterKey(null); }}
                      className="text-[10px] font-bold text-yellow-700 bg-yellow-100 border border-yellow-300 px-2.5 py-1 rounded-full flex items-center gap-1 hover:bg-yellow-200 transition-colors"
                      title="Clear all filters"
                    >
                      <Filter size={10} />
                      {simpleActiveCount} Filter{simpleActiveCount > 1 ? "s" : ""} Active — Clear All
                    </button>
                  )}
                  <span className="text-[10px] font-medium text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-full shadow-sm">
                    {filteredRows.length} / {scopedRows.length} Records
                  </span>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    disabled={!headerData.jobNo}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-[11px] font-bold py-2 px-4 rounded-lg transition-all shadow-md shadow-indigo-200 active:scale-95"
                  >
                    <Plus size={14} /> Add Operation Row
                  </button>
                </div>
              </div>

              {/* SCROLLABLE TABLE */}
              <div className="flex-1 overflow-auto min-h-0 bg-white">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-[#526D82] text-white">
                    <tr>
                      <FilterTh label="Date" columnKey="date" filters={filters} allValues={uniqueValues.date} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Job No" columnKey="jobNo" filters={filters} allValues={uniqueValues.jobNo} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Style No" columnKey="styleNo" filters={filters} allValues={uniqueValues.styleNo} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Manufacturing Unit" columnKey="manufacturingUnit" filters={filters} allValues={uniqueValues.manufacturingUnit} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Line No" columnKey="lineNo" filters={filters} allValues={uniqueValues.lineNo} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Process Op" columnKey="processType" filters={filters} allValues={uniqueValues.processType} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Input" columnKey="todayInput" align="right" filters={filters} allValues={[]} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Output" columnKey="todayOutput" align="right" filters={filters} allValues={[]} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Balance" columnKey="balance" align="right" filters={filters} allValues={[]} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <FilterTh label="Status" columnKey="status" align="center" filters={filters} allValues={uniqueValues.status} onApplyFilter={handleApplyFilter} onOpenFilter={setOpenFilterKey} openFilterKey={openFilterKey} />
                      <th className="py-3 px-4 border border-[#00a884] text-[13px] font-bold uppercase tracking-wider whitespace-nowrap text-center select-none">Action</th>
                    </tr>
                  </thead>

                  <tbody className="bg-white">
                    {isLoadingRows && rows.length === 0 ? (
                      <tr><td colSpan="11" className="py-20 text-center text-slate-400 border-x border-b border-[#00a884]"><Loader size={20} className="animate-spin mx-auto" /></td></tr>
                    ) : filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan="11" className="py-20 text-center border-x border-b border-[#00a884]">
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-2">
                              <Layers size={20} className="text-slate-300" />
                            </div>
                            <p className="text-xs font-semibold text-slate-600">
                              {scopedRows.length === 0 ? "No operations recorded yet" : "No rows match current filters"}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {scopedRows.length === 0 ? 'Click "Add Operation Row" to start.' : "Clear filters to see all records."}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row, idx) => {
                        console.log(row, "row inside map");
                        const balance = row.todayInput - row.todayOutput;
                        const ratio = row.todayInput > 0 ? (row.todayOutput / row.todayInput) * 100 : 0;
                        return (
                          <tr key={row.id} className={`hover:bg-[#00a884]/5 transition-colors group ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                            <td className="py-3 px-4 border border-[#00a884] font-bold text-slate-900 text-[14px] whitespace-nowrap">{row.date}</td>
                            <td className="py-3 px-4 border border-[#00a884] font-bold text-emerald-700 text-[14px] whitespace-nowrap">{row.jobNo}</td>
                            <td className="py-3 px-4 border border-[#00a884] font-bold text-slate-900 text-[14px] whitespace-nowrap">{row.styleNo || "—"}</td>
                            <td className="py-3 px-4 border border-[#00a884] font-semibold text-slate-700 text-[14px] whitespace-nowrap">{row.manufacturingUnit || "—"}</td>
                            <td className="py-3 px-4 border border-[#00a884] font-medium text-slate-600 text-[14px] whitespace-nowrap">{row.lineNo || "—"}</td>
                            <td className="py-3 px-4 border border-[#00a884]">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-bold bg-slate-100 text-slate-700 border border-slate-200">{row.processType}</span>
                            </td>
                            <td className="py-3 px-4 border border-[#00a884] text-right font-medium text-slate-700 tabular-nums text-[14px]">{Number(row.todayInput).toLocaleString()}</td>
                            <td className="py-3 px-4 border border-[#00a884] text-right font-bold text-emerald-600 tabular-nums text-[14px]">{Number(row.todayOutput).toLocaleString()}</td>
                            <td className="py-3 px-4 border border-[#00a884] text-right font-bold text-amber-600 tabular-nums text-[14px]">{balance > 0 ? `+${balance.toLocaleString()}` : "0"}</td>
                            <td className="py-3 px-4 border border-[#00a884] text-center">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${ratio >= 95 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                {ratio >= 95 ? "Target Met" : "In Progress"}
                              </span>
                            </td>
                            <td className="py-3 px-4 border border-[#00a884] text-center">
                              <button onClick={() => handleDeleteRow(row.id)}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                title="Delete Record">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {filteredRows.length > 0 && (
                    <tfoot className="sticky bottom-0 z-10 bg-[#526D82] text-white font-bold text-[14px]">
                      <tr>
                        <td colSpan="6" className="py-3 px-4 border border-[#00a884] uppercase tracking-wider text-[13px]">TOTAL PRODUCTION RUN</td>
                        <td className="py-3 px-4 border border-[#00a884] text-right tabular-nums">{totalInput.toLocaleString()}</td>
                        <td className="py-3 px-4 border border-[#00a884] text-right text-emerald-300 tabular-nums">{totalOutput.toLocaleString()}</td>
                        <td className="py-3 px-4 border border-[#00a884] text-right text-amber-300 tabular-nums">+{totalWip.toLocaleString()}</td>
                        <td colSpan="2" className="py-3 px-4 border border-[#00a884] text-center text-teal-300">{efficiencyRate}% Avg Efficiency</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        </main>

        <OperationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveOperation}
          isLoading={isSaving}
          initialData={{ date: headerData.date, lineNo: "", compositionId }}
          compositions={compositions}
          unitSuggestions={unitSuggestions}
        />
      </div>
    );
  }