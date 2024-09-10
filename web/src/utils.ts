import { LogEntry } from "./customTypes";


export function flattenMap(nested: LogEntry, prefix: string = ''): LogEntry {
    let flatMap: LogEntry = {};

    for (const key in nested) {
        if (nested.hasOwnProperty(key)) {
            const value = nested[key];
            const newKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                Object.assign(flatMap, flattenMap(value, newKey));
            } else {
                flatMap[newKey] = value;
            }
        }
    }

    return flatMap;
}
