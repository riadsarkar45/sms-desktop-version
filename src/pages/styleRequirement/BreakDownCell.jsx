
const BreakDownCell = ({CELL_BG, BORDER_COLOR, UNFROZEN_WIDTH, compBreakdown, formatNumber, key}) => {
    return (
        <td
            className="p-0 align-top"
            style={{
                backgroundColor: CELL_BG,
                borderRight: `1px solid ${BORDER_COLOR}`,
                borderBottom: `1px solid ${BORDER_COLOR}`,
                textAlign: 'center',
                width: `${UNFROZEN_WIDTH}px`,
                minWidth: `${UNFROZEN_WIDTH}px`,
                maxWidth: `${UNFROZEN_WIDTH}px`,
            }}
        >
            <div className="divide-y divide-[#14b8a6]">
                {compBreakdown.map((cb, j) => {
                    if (cb?.status) return <div key={j} className={`px-3 py-2 subrow-cell text-black italic`}>_</div>;
                    const value = cb?.[key];
                    return <div key={j} className={`px-3 py-2 subrow-cell`}>{formatNumber(value)}</div>;
                })}

            </div>
        </td>
    );
};

export default BreakDownCell;   