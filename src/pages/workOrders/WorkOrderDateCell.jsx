import { Eye } from "lucide-react";
import { formatWorkOrderDate, getWorkOrderDate } from "./WorkOrderHelpers";
// import { formatWorkOrderDate, getWorkOrderDate } from "./workOrderHelpers";

/**
 * Content of the first column (WORK ORDER DATE).
 * Shows the date, an eye button (opens the PDF / print preview)
 * and a REVISED tag when the work order has been changed after the first save.
 */
const WorkOrderDateCell = ({ job, wo, onPreview, revisionCount = 0, className = "px-3 py-2" }) => (
    <div className={className}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span>{wo ? formatWorkOrderDate(getWorkOrderDate(wo)) : "-"}</span>
            {wo && onPreview && (
                <button
                    type="button"
                    title="Preview / Print work order"
                    onClick={(e) => {
                        e.stopPropagation();
                        onPreview({ job, wo });
                    }}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "#1d4ed8", padding: 2, display: "inline-flex" }}
                >
                    <Eye size={16} />
                </button>
            )}
        </div>
        {revisionCount > 0 && (
            <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, color: "#b91c1c", letterSpacing: 1 }}>
                REVISED{revisionCount > 1 ? ` (${revisionCount})` : ""}
            </div>
        )}
    </div>
);

export default WorkOrderDateCell;