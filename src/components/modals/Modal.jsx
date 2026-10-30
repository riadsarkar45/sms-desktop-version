import { X, Save, Loader2 } from 'lucide-react';
import Deliveries from './Deliveries';

const Modal = ({ setIsEditing, deliveryIssue, challanIssue, orderType, changedField, duplicateChallan, deliveriesLoading, isLoading, workOrderId, deliveries, handleSubmit, orderId, handleEditOnChange }) => {
    const deliveryTypes = [];
    console.log(deliveries, "deliveries from modal deliveries");
    
    // ✅ Extract jobNo from the first available composition in the deliveries data
    const firstWO = deliveries?.[0];
    const firstComp = firstWO?.compositions?.[0];
    const jobNo = firstComp?.styleRequirementRow?.styleRequirement?.jobNo || firstComp?.jobNo || workOrderId;

    if (orderType === "knittingOrder") {
        deliveryTypes.push("Yarn Delivery", "Yarn Return", "Grey Received");
    }

    if (orderType === "dyeingOrder") {
        deliveryTypes.push("Grey Received", "Grey Delivery", "Grey Return Received", "Grey Received From Dyeing", "Finish Fabric Received", "Sent For Compacting", "Received From Compacting");
    }

    if (orderType === "aopOrder") {
        deliveryTypes.push("Sent for AOP", "Received from AOP", "Aop Grey Received", "Aop Finish Received");
    }

    if (orderType === "yarnDyeingOrder") {
        deliveryTypes.push("Yarn Delivery For Yarn Dye", "Yarn Return From Yarn Dye", "Yarn Received From Yarn Dye", "Finish Recived", "Finish Return");
    }
    
    return (
        <>
            <div className="fixed inset-0 bg-slate-500/30 z-50" onClick={() => setIsEditing(false)} />

            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
                <div
                    className="pointer-events-auto w-full max-w-7xl flex flex-col rounded-xl overflow-hidden bg-white border border-gray-200 shadow-xl"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                        <div className="flex items-center gap-3">
                            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-900" style={{ fontFamily: 'Syne, sans-serif' }}>
                                Deliveries
                            </h2>
                            {/* ✅ REPLACED WO with Job No */}
                            <span className="text-xs font-medium text-indigo-500 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full">
                                #Job {jobNo}
                            </span>
                        </div>
                        <button
                            onClick={() => setIsEditing(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="overflow-y-auto flex-1 flex flex-col">

                        {
                            deliveriesLoading ? <div className="flex justify-center items-center py-20">
                                <span className='animate-spin'><Loader2 size={30} /></span>
                            </div> : <Deliveries
                                isLoading={isLoading}
                                handleSubmit={handleSubmit}
                                handleEditOnChange={handleEditOnChange}
                                deliveries={deliveries}
                                duplicateChallan={duplicateChallan}
                                orderType={orderType}
                                changedField={changedField}
                                challanIssue={challanIssue}
                                deliveryIssue={deliveryIssue}
                            />
                        }
                    </div>
                </div>
            </div>
        </>
    );
};

export default Modal;