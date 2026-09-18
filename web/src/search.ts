import { LogEntry } from "./customTypes";

export interface SearchQuery {
    field: string | null;
    term: string;
}

/** Reads the search box: free text, or `field:value` to match one field only. */
export function parseSearch(query: string): SearchQuery {
    const idx = query.indexOf(':');
    if (idx > 0 && idx < query.length - 1) {
        return { field: query.slice(0, idx).trim(), term: query.slice(idx + 1).trim().toLowerCase() };
    }
    return { field: null, term: query.trim().toLowerCase() };
}

export function matchesSearch(entry: LogEntry, query: SearchQuery): boolean {
    if (!query.term) return true;
    if (query.field) {
        const value = entry[query.field];
        return value !== undefined && String(value).toLowerCase().includes(query.term);
    }
    return Object.values(entry).some(value => String(value).toLowerCase().includes(query.term));
}
