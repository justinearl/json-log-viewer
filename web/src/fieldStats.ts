import { LogEntry } from "./customTypes";

export type FieldType = 'time' | 'number' | 'string';

export interface TopValue {
    value: string;
    count: number;
    percent: number;
}

export interface FieldStat {
    key: string;
    type: FieldType;
    /** Distinct values seen in the sample, capped at DISTINCT_CAP. */
    distinct: number;
    /** True when the sample hit the cap, so the UI can render "100+". */
    capped: boolean;
    topValues: TopValue[];
}

export const DISTINCT_CAP = 100;
const TOP_VALUE_COUNT = 4;

function formatValue(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export function computeFieldStats(
    entries: LogEntry[],
    keys: string[],
    timestampKey: string | null,
    maxScan: number = 500
): FieldStat[] {
    const scanCount = Math.min(entries.length, maxScan);

    return keys.map(key => {
        const counts = new Map<string, number>();
        let present = 0;
        let numeric = 0;

        for (let i = 0; i < scanCount; i++) {
            const raw = entries[i][key];
            if (raw === undefined) continue;
            present++;

            const text = formatValue(raw);
            if (text !== '' && !isNaN(Number(text))) numeric++;

            if (counts.size < DISTINCT_CAP || counts.has(text)) {
                counts.set(text, (counts.get(text) ?? 0) + 1);
            }
        }

        const topValues = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, TOP_VALUE_COUNT)
            .map(([value, count]) => ({
                value,
                count,
                percent: present > 0 ? (count / present) * 100 : 0,
            }));

        let type: FieldType = 'string';
        if (key === timestampKey) type = 'time';
        else if (present > 0 && numeric === present) type = 'number';

        return { key, type, distinct: counts.size, capped: counts.size >= DISTINCT_CAP, topValues };
    });
}
