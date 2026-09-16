import { LogEntry } from "./customTypes";

export interface Bucket {
    start: number;
    error: number;
    warn: number;
    other: number;
    total: number;
}

export interface Histogram {
    buckets: Bucket[];
    start: number;
    end: number;
    /** Bucket width in milliseconds — always one of NICE_INTERVALS. */
    interval: number;
}

const ERROR_LEVELS = new Set(['ERROR', 'ERR', 'FATAL', 'CRITICAL', 'EMERGENCY']);
const WARN_LEVELS = new Set(['WARN', 'WARNING']);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Bucket widths a reader recognises, rather than span/n to five decimals. */
export const NICE_INTERVALS = [
    1, 5, 10, 50, 100, 250, 500,
    SECOND, 5 * SECOND, 10 * SECOND, 15 * SECOND, 30 * SECOND,
    MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
    HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
    DAY, 7 * DAY, 30 * DAY,
];

/** Smallest nice interval that keeps the span within `targetBuckets`. */
export function chooseInterval(span: number, targetBuckets: number): number {
    const ideal = span / Math.max(1, targetBuckets);
    return NICE_INTERVALS.find(candidate => candidate >= ideal) ?? NICE_INTERVALS[NICE_INTERVALS.length - 1];
}

function levelBand(value: unknown): 'error' | 'warn' | 'other' {
    const text = String(value ?? '').toUpperCase().trim();
    if (ERROR_LEVELS.has(text)) return 'error';
    if (WARN_LEVELS.has(text)) return 'warn';
    return 'other';
}

/** Describes the bucket width in the way the chart caption reads it. */
export function describeInterval(interval: number): string {
    if (interval < SECOND) return `${interval}-millisecond`;
    if (interval < MINUTE) return `${Math.round(interval / SECOND)}-second`;
    if (interval < HOUR) return `${Math.round(interval / MINUTE)}-minute`;
    if (interval < DAY) return `${Math.round(interval / HOUR)}-hour`;
    return `${Math.round(interval / DAY)}-day`;
}

export function buildHistogram(
    entries: LogEntry[],
    timestampKey: string | null,
    levelKey: string | null,
    targetBuckets: number = 18
): Histogram | null {
    if (!timestampKey || entries.length === 0 || targetBuckets < 1) return null;

    const stamps: number[] = [];
    for (const entry of entries) {
        const time = Date.parse(String(entry[timestampKey]));
        if (!isNaN(time)) stamps.push(time);
    }
    if (stamps.length === 0) return null;

    const first = Math.min(...stamps);
    const last = Math.max(...stamps);
    const interval = chooseInterval(last - first, targetBuckets);

    // Align to the interval so bucket edges land on whole seconds/minutes.
    const start = Math.floor(first / interval) * interval;
    const count = Math.floor((last - start) / interval) + 1;

    const buckets: Bucket[] = Array.from({ length: count }, (_, i) => ({
        start: start + i * interval,
        error: 0,
        warn: 0,
        other: 0,
        total: 0,
    }));

    for (const time of stamps) {
        const index = Math.min(Math.max(Math.floor((time - start) / interval), 0), count - 1);
        buckets[index].total++;
    }

    // Second pass keeps band counting aligned with the entries, not the stamps array.
    for (const entry of entries) {
        const time = Date.parse(String(entry[timestampKey]));
        if (isNaN(time)) continue;
        const index = Math.min(Math.max(Math.floor((time - start) / interval), 0), count - 1);
        buckets[index][levelBand(levelKey ? entry[levelKey] : undefined)]++;
    }

    return { buckets, start, end: start + count * interval, interval };
}
