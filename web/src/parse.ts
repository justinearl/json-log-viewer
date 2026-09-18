import { LINE, LogEntry, RAW } from './customTypes';
import { flattenMap } from './utils';

export interface ParsedChunk {
    entries: LogEntry[];
    /** Keys seen in JSON entries, in first-seen order. */
    keys: string[];
    /** Number of source lines consumed, including blank ones. */
    lines: number;
    rawCount: number;
}

/**
 * Parses a block of newline-delimited text starting at `startLine`.
 * JSON objects become flattened entries; anything else becomes a plain-text
 * entry with the line under `message`. Blank lines are skipped but still
 * counted so line numbers stay true to the file.
 */
export function parseChunk(raw: string, startLine: number = 1): ParsedChunk {
    const entries: LogEntry[] = [];
    const keySet = new Set<string>();
    let rawCount = 0;

    const lines = raw.split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let entry: LogEntry;
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
            entry = flattenMap(parsed);
            for (const key of Object.keys(entry)) keySet.add(key);
        } catch {
            entry = { message: line.replace(/\r$/, ''), [RAW]: true };
            rawCount++;
        }
        entry[LINE] = startLine + i;
        entries.push(entry);
    });

    return { entries, keys: Array.from(keySet), lines: lines.length, rawCount };
}
