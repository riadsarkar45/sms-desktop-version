import React from 'react'

const BORDER = 'border border-gray-600'
const ITEM_WIDTH = 230 // px per permission item (two checkbox columns)

const PermissionSection = ({
    section,
    sectionState,
    isDirty,
    onToggleSection,
    onItemChange,
}) => {
    const { enabled, items } = sectionState
    const columnCount = section.items.length * 2

    return (
        <div className="flex items-stretch gap-2">
            {/* Section on/off checkbox */}
            <div
                className={`w-24 shrink-0 ${BORDER} bg-white flex flex-col items-center justify-center gap-2 py-2`}
            >
                <span className="text-xs font-semibold text-gray-800">PERMISSION</span>
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => onToggleSection(section.key)}
                    className="w-4 h-4 cursor-pointer accent-primary-600"
                    aria-label={`Allow access to ${section.title}`}
                />
            </div>

            {/* Permission grid */}
            <table
                className={`shrink-0 border-collapse table-fixed bg-white transition-opacity ${enabled ? '' : 'opacity-50'}`}
                style={{ width: section.items.length * ITEM_WIDTH }}
            >
                <thead>
                    <tr>
                        <th
                            colSpan={columnCount}
                            className={`${BORDER} bg-sky-200 py-1 text-xs font-bold text-gray-900 text-center`}
                        >
                            {section.title}
                            {isDirty && (
                                <span className="ml-2 text-[10px] font-semibold text-amber-700">
                                    ● MODIFIED
                                </span>
                            )}
                        </th>
                    </tr>
                    <tr>
                        {section.items.map((item) => (
                            <th
                                key={item.key}
                                colSpan={2}
                                className={`${BORDER} px-1 py-1 text-[11px] font-medium leading-tight text-gray-800 text-center align-middle`}
                            >
                                {item.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {section.items.map((item) => (
                            <React.Fragment key={item.key}>
                                <td className={`${BORDER} py-0.5 text-[10px] font-medium text-gray-800 text-center`}>
                                    {item.positive}
                                </td>
                                <td className={`${BORDER} py-0.5 text-[10px] font-medium text-gray-800 text-center`}>
                                    NO
                                </td>
                            </React.Fragment>
                        ))}
                    </tr>
                    <tr>
                        {section.items.map((item) => (
                            <React.Fragment key={item.key}>
                                <td className={`${BORDER} py-1 text-center`}>
                                    <input
                                        type="checkbox"
                                        checked={items[item.key] === 'yes'}
                                        disabled={!enabled}
                                        onChange={() => onItemChange(section.key, item.key, 'yes')}
                                        className="w-4 h-4 cursor-pointer accent-green-600 disabled:cursor-not-allowed"
                                        aria-label={`${section.title} - ${item.label}: ${item.positive}`}
                                    />
                                </td>
                                <td className={`${BORDER} py-1 text-center`}>
                                    <input
                                        type="checkbox"
                                        checked={items[item.key] === 'no'}
                                        disabled={!enabled}
                                        onChange={() => onItemChange(section.key, item.key, 'no')}
                                        className="w-4 h-4 cursor-pointer accent-red-600 disabled:cursor-not-allowed"
                                        aria-label={`${section.title} - ${item.label}: NO`}
                                    />
                                </td>
                            </React.Fragment>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    )
}

export default PermissionSection