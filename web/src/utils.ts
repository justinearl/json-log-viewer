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

export function detectTimestampKey(entries: LogEntry[], maxScan: number = 20): string | null {
    const candidates = ["@timestamp", "timestamp", "time", "date", "datetime", "created_at", "ts"];
    const scanCount = Math.min(entries.length, maxScan);

    for (const key of candidates) {
        let matches = 0;
        for (let i = 0; i < scanCount; i++) {
            const val = entries[i][key];
            if (val !== undefined && !isNaN(Date.parse(String(val)))) {
                matches++;
            }
        }
        if (matches > scanCount * 0.5) return key;
    }

    return null;
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
