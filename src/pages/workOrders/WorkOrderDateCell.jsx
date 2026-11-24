import { useState } from "react";
import { createPortal } from "react-dom";
import { Eye, PenIcon } from "lucide-react";
import { formatWorkOrderDate, getWorkOrderDate } from "./WorkOrderHelpers";
import WorkOrderEditModal from "../../components/modals/WorkOrderEditModal";

/**
 * Content of the first column (WORK ORDER DATE).
 * Shows the date, a Preview button (PDF / print preview), a Revise button
 * (opens the edit modal) and a REVISED tag when the work order has been
 * changed after the first save.
 */
const WorkOrderDateCell = ({
    job,
    wo,
    onPreview,
    onRevise,
    revisionCount = 0,
    className = "px-3 py-2",
    setWorkOrderModal,
    workOrderId
}) => {



    return (
        <div className={className}>
            <div className="grid grid-cols-1 gap-2 rounded-md text-white">
                {wo && onPreview && (
                    <button
                        type="button"
                        title="Preview / Print work order"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                        style={{ border: "none", cursor: "pointer", display: "inline-flex" }}
                        className="flex gap-2 items-center bg-slate-700 rounded-md justify-center py-1"
                    >
                        <span>Preview</span>
                        <Eye size={16} />
                    </button>
                )}

                {wo && (
                    <button
                        type="button"
                        onClick={() => setWorkOrderModal(true)}
                        title="Revise work order"
                        style={{ border: "none", cursor: "pointer", display: "inline-flex" }}
                        className="flex justify-center gap-2 items-center rounded-md bg-red-900 py-1"
                    >
                        <span>Revise</span>
                        <PenIcon size={16} />
                    </button>
                )}
            </div>

            {/* Revised tag */}
            {revisionCount > 0 && (
                <div
                    style={{
                        marginTop: 2,
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#b91c1c",
                        letterSpacing: 1,
                    }}
                >
                    REVISED{revisionCount > 1 ? ` (${revisionCount})` : ""}
                </div>
            )}

        </div>
    );
};

export default WorkOrderDateCell;