import { LogEntry } from "./customTypes";


export function flattenMap(nested: LogEntry, prefix: string = ''): LogEntry {
    let flatMap: LogEntry = {};

    for (const key in nested) {
        if (Object.hasOwn(nested, key)) {
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

/** The text a value shows as in a cell. Filters compare against this too. */
export function formatCell(val: unknown): string {
    if (val === undefined || val === null) return "-";
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val);
}

const PRIORITY_KEYS = [
    "@timestamp", "timestamp", "time", "date", "datetime",
    "level", "log.level", "severity", "loglevel",
    "message", "msg", "log", "text",
    "service", "service.name", "app", "application",
    "host", "host.name", "hostname",
    "source", "logger", "caller",
    "error", "error.message", "err",
    "trace.id", "traceId", "request_id", "requestId", "correlation_id",
];

export function detectColumns(entries: LogEntry[], maxScan: number = 100): string[] {
    if (entries.length === 0) return ["level", "message"];

    const keyCounts = new Map<string, number>();
    const scanCount = Math.min(entries.length, maxScan);

    for (let i = 0; i < scanCount; i++) {
        for (const key of Object.keys(entries[i])) {
            keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
        }
    }

    const prioritized: string[] = [];
    for (const key of PRIORITY_KEYS) {
        if (keyCounts.has(key)) {
            prioritized.push(key);
        }
    }

    const remaining = Array.from(keyCounts.entries())
        .filter(([key]) => !PRIORITY_KEYS.includes(key))
        .sort((a, b) => b[1] - a[1])
        .map(([key]) => key);

    const result = [...prioritized, ...remaining];
    return result.length > 0 ? result.slice(0, 6) : ["level", "message"];
}

const TIMESTAMP_KEYS = ["@timestamp", "timestamp", "time", "date", "datetime", "created_at", "ts"];

/**
 * Epoch milliseconds for a timestamp value, or NaN. Accepts what Date.parse
 * does plus the common forms it rejects: a comma before the milliseconds
 * ("2024-09-10 11:04:38,623", Python logging) and epoch seconds or millis.
 */
export function parseTimestamp(value: unknown): number {
    if (typeof value === 'number') return value < 1e11 ? value * 1000 : value;
    if (typeof value !== 'string') return NaN;

    const text = value.trim();
    if (/^\d{10}(\.\d+)?$/.test(text)) return Number(text) * 1000;
    if (/^\d{13}$/.test(text)) return Number(text);

    const direct = Date.parse(text);
    if (!isNaN(direct)) return direct;

    const normalised = text.replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}),(\d{1,6})/, '$1T$2.$3');
    return normalised === text ? NaN : Date.parse(normalised);
}

export function detectTimestampKey(entries: LogEntry[], maxScan: number = 20): string | null {
    const scanCount = Math.min(entries.length, maxScan);
    if (scanCount === 0) return null;

    for (const key of TIMESTAMP_KEYS) {
        let matches = 0;
        for (let i = 0; i < scanCount; i++) {
            const val = entries[i][key];
            if (val !== undefined && !isNaN(parseTimestamp(val))) {
                matches++;
            }
        }
        if (matches > scanCount * 0.5) return key;
    }

    return null;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Gap between two timestamps, e.g. "+12ms", "+1.5s", "+3m 4s", "-2h 10m". */
export function formatDelta(ms: number): string {
    const sign = ms < 0 ? '-' : '+';
    const abs = Math.abs(ms);
    if (abs < SECOND) return `${sign}${Math.round(abs)}ms`;
    if (abs < MINUTE) return `${sign}${(abs / SECOND).toFixed(abs < 10 * SECOND ? 2 : 1)}s`;
    if (abs < HOUR) return `${sign}${Math.floor(abs / MINUTE)}m ${Math.round((abs % MINUTE) / SECOND)}s`;
    if (abs < DAY) return `${sign}${Math.floor(abs / HOUR)}h ${Math.round((abs % HOUR) / MINUTE)}m`;
    return `${sign}${(abs / DAY).toFixed(1)}d`;
}

export function copyToClipboard(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}
