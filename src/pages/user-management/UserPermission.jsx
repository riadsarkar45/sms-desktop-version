import React, { useEffect, useMemo, useState } from 'react'
// import PermissionSection from './PermissionSection'
// import UseAllUsers from '../allUsers/AllUsers'
import { useParams } from 'react-router-dom'
import PermissionSection from './PermissionSection'
import UseAllUsers from '../../hooks/all-users/AllUsers'
import useAxiosPrivate from '../../hooks/UseAxiosPrivate'

/* ------------------------------------------------------------------ */
/*  Static configuration                                               */
/* ------------------------------------------------------------------ */

const BORDER = 'border border-gray-600'

// Helpers: an "EDIT / NO" item and a "YES / NO" item
const edit = (key, label) => ({ key, label, positive: 'EDIT' })
const yes = (key, label) => ({ key, label, positive: 'YES' })

// PRODUCTION DATA REPORT and PRODUCTION share the same columns
const PRODUCTION_ITEMS = [
    edit('summary', 'SUMMARY'),
    edit('dailyCuttingUpdate', 'DAILY CUTTING UPDATE'),
    edit('dailySewingUpdate', 'DAILY SEWING UPDATE'),
    yes('dailyFinishingUpdate', 'DAILY FINISHING UPDATE'),
    yes('dailyExportUpdate', 'DAILY EXPORT UPDATE'),
    yes('infoEdit', 'INFO. EDIT'),
    yes('readOnly', 'READ ONLY'),
]

const PERMISSION_SECTIONS = [
    {
        key: 'userManagement',
        title: "User Management",
        items: [
            yes('addNewUser', "ADD NEW USER"),
            yes('setUserPermission', "SET USER PERMISSION"),
            yes('deleteExistingUser', "DELETE EXISTING USER"),
        ],
    },
    {
        key: 'dashboard',
        title: "Dashboard",
        items: [
            yes('hourlyChallanActivity', "Hourly Challan Activity"),
            yes('hourlyWorkOrderActivity', "Hourly Work Activity"),
            yes('hourlyBookingActivity', "Hourly Booking Activity"),
        ],
    },
    {
        key: 'debitNote',
        title: "Debit Note",
        items: [
            yes('responsibleForMakingDebitNote', "Responsible For Making Debit Note"),
            yes('responsibleForApprovalDebitNote', "Responsible For Approval Debit Note"),
        ],
    },
    {
        key: 'workOrders',
        title: "WORK ORDER'S",
        items: [
            edit('knittingOrder', "KNITTING WORKORDER'S"),
            edit('yarnDyeingOrder', "Y/D WORKORDER'S"),
            edit('dyeingOrder', "DYEING WORKORDER'S"),
            edit('aopOrder', "AOP WORKORDER'S"),
            edit('workOrderAnalysis', "WORK ORDER ANALYSIS"),
            edit('sendWorkOrderApprovalRequest', "SEND WORK ORDER APPROVAL REQUEST"),
            edit('seeRequestedWorkOrders', "SEE MY WORK ORDERS"),
            yes('workOrderDeliveries', "DELIVERIES"),
            yes('readOnly', 'READ ONLY'),
        ],
    },
    {
        key: 'mis',
        title: 'MIS INFORMATION',
        items: [
            yes('knittingOrder', "KNITTING WORKORDER'S"),
            yes('yarnDyeingOrder', "Y/D WORKORDER'S"),
            yes('dyeingOrder', "DYEING WORKORDER'S"),
            yes('aopOrder', "AOP WORKORDER'S"),
            yes('readOnly', 'READ ONLY'),
        ],
    },
    {
        key: 'workOrderApproval',
        title: 'WORKORDER REQ. & APPROVAL',
        items: [
            yes('workOrderReq', 'WORKORDER REQ. (ALL)'),
            yes('workOrderApp', 'WORKORDER APP. (ALL)'),
            yes('revisedWorkOrder', 'REVISED WORKORDER (ALL)'),
            yes('printWorkOrder', 'PRINT WORKORDER (ALL)'),
            yes('cancelWorkOrder', 'CANCEL WORKORDER (ALL)'),
            yes('readOnly', 'READ ONLY'),
        ],
    },
    {
        key: 'styleRequirements',
        title: 'STYLE REQUIREMENTS',
        items: [
            edit('addJob', 'ADD JOB'),
            yes('reconciliation', 'RECONCILIATION'),
            yes('reconciliationSubmission', 'RECONCILIATION SUBMISSION'),
            yes('bookingView', 'BOOKING VIEW'),
            yes('balanceSheet', 'BALANCE SHEET'),
            yes('infoEdit', 'INFO. EDIT'),
            yes('readOnly', 'READ ONLY'),
        ],
    },
    {
        key: 'yarn',
        title: 'YARN',
        items: [
            edit('yarnPurchase', 'YARN PURCHASE'),
            edit('yarnMovement', 'YARN MOVEMENT'),
            edit('rawYarnMovement', 'RAW YARN MOVEMENT'),
            edit('rawYarnStock', 'RAW YARN STOCK'),
            edit('ydMovement', 'Y/D MOVEMENT'),
            edit('ydStock', 'Y/D STOCK'),
            yes('readOnly', 'READ ONLY'),
        ],
    },
    {
        key: 'productionDataReport',
        title: 'PRODUCTION DATA REPORT',
        items: PRODUCTION_ITEMS,
    },
    {
        key: 'production',
        title: 'PRODUCTION',
        items: PRODUCTION_ITEMS,
    },
    {
        key: 'partyWiseView',
        title: 'PARTY WISE VIEW',
        items: [
            yes('knittingDataExport', 'KNITTING DATA EXPORT'),
            yes('dyeingDataExport', 'DYEING DATA EXPORT'),
            yes('aopDataExport', 'AOP DATA EXPORT'),
            yes('readOnly', 'READ ONLY'),
        ],
    },
    {
        key: 'movementBilling',
        title: 'MOVEMENT & BILLING',
        items: [
            yes('aopOrder', 'VIEW AOP INFO'),
            yes('knittingOrder', 'VIEW KNITTING INFO'),
            yes('dyeingOrder', 'VIEW DYEING INFO'),
            edit('qtyEdit', 'QTY EDIT (ALL)'),
            yes('billingMake', 'BILLING MAKE (ALL)'),
            yes('billApproved', 'BILL APPROVED'),
            yes('challanInfoExport', 'CHALLAN INFO EXPORT (ALL)'),
            yes('priceChange', 'PRICE CHANGE'),
            yes('billInfoSee', 'BILL INFO SEE'),
        ],
    },
]

const buildInitialPermissions = () =>
    PERMISSION_SECTIONS.reduce((acc, section) => {
        acc[section.key] = {
            enabled: false,
            items: section.items.reduce((itemAcc, item) => {
                itemAcc[item.key] = null
                return itemAcc
            }, {}),
        }
        return acc
    }, {})

const buildPermissionsFromServer = (permissionSections) => {
    const permittedMap = (permissionSections || []).reduce((acc, section) => {
        const keys = (section.isPermitted || []).map((p) => p.isPermitted)
        acc[section.permittedSection] = new Set(keys)
        return acc
    }, {})

    return PERMISSION_SECTIONS.reduce((acc, section) => {
        const permittedKeys = permittedMap[section.key]
        const enabled = Boolean(permittedKeys)

        acc[section.key] = {
            enabled,
            items: section.items.reduce((itemAcc, item) => {
                itemAcc[item.key] = enabled
                    ? (permittedKeys.has(item.key) ? 'yes' : 'no')
                    : null
                return itemAcc
            }, {}),
        }
        return acc
    }, {})
}

// UI state of ONE section -> what the backend stores (booleans only).
// A permission is granted only when the section is on and EDIT / YES is ticked.
const buildSectionPayload = (section, sectionState) => ({
    enabled: sectionState.enabled,
    items: section.items.reduce((acc, item) => {
        acc[item.key] = sectionState.enabled && sectionState.items[item.key] === 'yes'
        return acc
    }, {}),
})

const isSamePayload = (a, b) =>
    a.enabled === b.enabled &&
    Object.keys(a.items).every((key) => a.items[key] === b.items[key])




const UserPermission = () => {
    const [permissions, setPermissions] = useState(buildInitialPermissions)
    // Last state known to be on the server; changes are detected against this
    const [savedPermissions, setSavedPermissions] = useState(buildInitialPermissions)
    const [error, setError] = useState('')
    const [successMsg, setSuccessMsg] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    const { allUsers, setOptionalUserId } = UseAllUsers()
    const { userId } = useParams()
    const axiosPrivate = useAxiosPrivate();

    const updateUserPermissions = async (payload) => {
        const response = await axiosPrivate.post(`/api/users/${payload.userId}/permissions`, payload)
        if (!response.ok) {
            throw new Error(`Failed to update permissions (${response.status})`)
        }

        return response.json().catch(() => null)
    }

    useEffect(() => {
        setOptionalUserId(userId)
    }, [setOptionalUserId, userId])

    // Load the selected user's existing permissions as the baseline
    useEffect(() => {
        if (!userId || !allUsers?.length) return

        const targetUser = allUsers.find((user) => String(user.id) === String(userId))
        if (!targetUser) return

        const initial = buildPermissionsFromServer(targetUser.permissionSections)
        setPermissions(initial)
        setSavedPermissions(initial)
    }, [allUsers, userId])

    // Keys of the sections whose values differ from what is saved
    const dirtySectionKeys = useMemo(
        () =>
            PERMISSION_SECTIONS.filter(
                (section) =>
                    !isSamePayload(
                        buildSectionPayload(section, permissions[section.key]),
                        buildSectionPayload(section, savedPermissions[section.key])
                    )
            ).map((section) => section.key),
        [permissions, savedPermissions]
    )

    const handleToggleSection = (sectionKey) => {
        setSuccessMsg('')
        setPermissions((prev) => ({
            ...prev,
            [sectionKey]: { ...prev[sectionKey], enabled: !prev[sectionKey].enabled },
        }))
    }

    // Clicking a ticked box again clears it
    const handleItemChange = (sectionKey, itemKey, choice) => {
        setSuccessMsg('')
        setPermissions((prev) => {
            const section = prev[sectionKey]
            const current = section.items[itemKey]
            return {
                ...prev,
                [sectionKey]: {
                    ...section,
                    items: { ...section.items, [itemKey]: current === choice ? null : choice },
                },
            }
        })
    }

    // Cancel discards unsaved edits and goes back to the last saved state
    const handleCancel = () => {
        setPermissions(savedPermissions)
        setError('')
        setSuccessMsg('')
    }

    const handleSave = async () => {
        setError('')
        setSuccessMsg('')

        if (!userId) {
            setError('No user selected.')
            return
        }
        if (dirtySectionKeys.length === 0) {
            setError('No changes to save.')
            return
        }

        // Only the changed sections go into the payload
        const changedPermissions = PERMISSION_SECTIONS.filter((section) =>
            dirtySectionKeys.includes(section.key)
        ).reduce((acc, section) => {
            acc[section.key] = buildSectionPayload(section, permissions[section.key])
            return acc
        }, {})

        const payload = {
            userId,
            permissions: changedPermissions,
        }

        try {
            setIsSaving(true)
            await updateUserPermissions(payload)

            // What we just sent is now the saved state
            setSavedPermissions(permissions)
            setSuccessMsg(`Saved ${dirtySectionKeys.length} section(s) successfully.`)
        } catch (err) {
            setError(err.message || 'Something went wrong while saving.')
        } finally {
            setIsSaving(false)
        }
    }

    const labelCell = `${BORDER} bg-white px-2 py-1 text-xs font-bold text-gray-900 whitespace-nowrap`
    const hasChanges = dirtySectionKeys.length > 0

    return (
        <div className="space-y-5">
            {allUsers?.map((user) => (
                <div
                    key={user.id}
                    className="flex flex-col lg:flex-row items-start gap-2"
                >
                    <div className={`${BORDER} bg-white w-full lg:w-40 shrink-0`}>
                        <div className="block border-b border-gray-600 py-1 text-xs font-bold text-center text-gray-900">
                            TYPE OF USER
                        </div>

                        <div className="py-2 px-2 text-xs font-semibold text-center text-gray-900">
                            {[1, 2].includes(user.id)
                                ? 'AUDITOR'
                                : user.userRole?.toUpperCase() || ''}
                        </div>
                    </div>

                    <div className="w-full flex-1 overflow-x-auto">
                        <table className="w-full min-w-[640px] border-collapse bg-white">
                            <thead>
                                <tr>
                                    <th
                                        colSpan={6}
                                        className={`${BORDER} py-1 text-xs font-bold text-gray-900 text-center`}
                                    >
                                        USER INFORMATION FIELD
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                <tr>
                                    <td className={labelCell}>NAME :</td>
                                    <td className={`${BORDER} p-1 text-xs`}>{user.name || '-'}</td>

                                    <td className={labelCell}>DESIGNATION :</td>
                                    <td className={`${BORDER} p-1 text-xs`}>{user.designation || '-'}</td>

                                    <td className={labelCell}>WORKING STATION :</td>
                                    <td className={`${BORDER} p-1 text-xs`}>{user.workingStation || '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}

            {/* Permission sections */}
            <div className="overflow-x-auto pb-2">
                <div className="min-w-max space-y-5">
                    {PERMISSION_SECTIONS.map((section) => (
                        <PermissionSection
                            key={section.key}
                            section={section}
                            sectionState={permissions[section.key]}
                            isDirty={dirtySectionKeys.includes(section.key)}
                            onToggleSection={handleToggleSection}
                            onItemChange={handleItemChange}
                            allUsers={allUsers}
                        />
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    className="bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'SAVING...' : 'SAVE'}
                </button>
                <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isSaving || !hasChanges}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-bold px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    CANCEL
                </button>

                {hasChanges && (
                    <span className="text-xs font-medium text-amber-700">
                        {dirtySectionKeys.length} section(s) modified
                    </span>
                )}
                {error && (
                    <span className="text-sm font-medium text-red-600" role="alert">
                        {error}
                    </span>
                )}
                {successMsg && (
                    <span className="text-sm font-medium text-green-700" role="status">
                        {successMsg}
                    </span>
                )}
            </div>
        </div>
    )
}

export default UserPermission