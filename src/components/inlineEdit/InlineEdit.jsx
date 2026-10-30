import React, { useState } from 'react';
import useAxiosPrivate from '../../hooks/UseAxiosPrivate';
// import useAxiosPublic from '../../hooks/Axios';

const InlineEdit = () => {
    const [isEdit, setIsEdit] = useState({ isEditing: false, currentValue: "", rowId: "", updatedFieldName: "", compId: "" })
    const [changedField, setChangedField] = useState({ currentValue: "", name: "" })
    const [isUpdated, setIsUpdated] = useState("")
    const [isInlineEditingLoading, setIsLoading] = useState(false)
    const [showToast, setShowToast] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState('success');
    // const axiosPublic = useAxiosPublic();
    const axiosSecure = useAxiosPrivate();
    const handleInlineEdit = (rowId, currentValue, updateTable, updatedFieldName, compId) => {
        console.log(compId, "clicked");
        setIsEdit({ rowId: rowId, currentValue: currentValue, updatedFieldName: updatedFieldName, compId: compId })
        setChangedField({ currentValue: currentValue, })

    }

    const handleOnChange = (e) => {
        const { name, value } = e.target;
        console.log(name, value, "2 values");
        setChangedField({ currentValue: value, name: name });
        setIsEdit(prev => ({ ...prev, currentValue: value, isEditing: true }));
    };
    console.log(changedField);
    const handleRefresh = async () => {

        // const res = await axiosPublic.patch(`/update-work-order/${isEdit.rowId}`)
        // console.log(res.data);
    };
    const showNotification = (message, type = 'success') => {
        setToastMessage(message);
        setToastType(type);
        setShowToast(true);
    };

    const handleEditedSubmit = async () => {
        try {
            setIsLoading(true)
            if (!isEdit.updatedFieldName || !isEdit.rowId) {
                console.warn("Edit state was reset before submit - aborting", isEdit)
            }
            const dataToUpdate = {
                [isEdit.updatedFieldName]: changedField.currentValue,
                rowId: isEdit.rowId,
                updatedFieldName: isEdit.updatedFieldName,
                compId: isEdit.compId
            };
            console.log(dataToUpdate, "CLICKED");
            const res = await axiosSecure.patch(`/api/update-work-order/${isEdit.rowId}`, dataToUpdate);
            console.log(res.data.type, "server response");
            if (res.data.type === 'success') {
                setIsUpdated("success")
                showNotification("Work Order Updated", "success");
                console.log("success");
                setIsLoading(false)
                setIsEdit({ isEditing: false })
            }
        } catch (err) {
            console.error(err);
            showNotification('Work Order Updated. Please try again.', 'error');
        }
    };



    return { handleInlineEdit, handleOnChange, isInlineEditingLoading, showToast, toastType, setShowToast, toastMessage, isUpdated, handleRefresh, handleEditedSubmit, changedField, isEdit };
};

export default InlineEdit;