export function buildDeliveryTypeMatcher(aliasMap, { context } = {}) {
    const lookup = {};
    Object.entries(aliasMap).forEach(([rawKey, field]) => {
        lookup[rawKey.toLowerCase()] = field;
    });

    const warned = new Set();

    return function matchDeliveryType(rawType) {
        if (!rawType) return null;
        const field = lookup[String(rawType).toLowerCase()];
        if (!field && !warned.has(rawType)) {
            warned.add(rawType);
            // eslint-disable-next-line no-console
            console.warn(
                `[${context || "deliveryType"}] Unrecognized deliveryType "${rawType}" — its quantity is included in the row total but not in any specific column. Add it to the alias map if it's real.`
            );
        }
        return field || null;
    };
}