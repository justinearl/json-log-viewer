import { LogEntry } from "./customTypes";
import { formatCell } from "./utils";

export type FilterOption = 'exclude' | 'include';

/** The plain-object form of a filter, as saved in the layout. */
export interface FilterSpec {
    key: string;
    value: string;
    option: FilterOption;
}

export class Filter implements FilterSpec {
    constructor(
        public readonly key: string,
        public readonly value: string,
        public readonly option: FilterOption = 'exclude',
    ) { }

    static from(spec: FilterSpec): Filter {
        return new Filter(spec.key, spec.value, spec.option);
    }

    /** True when the entry's cell text for this key equals the filter value. */
    matches(entry: LogEntry): boolean {
        return formatCell(entry[this.key]) === this.value;
    }

    toJSON(): FilterSpec {
        return { key: this.key, value: this.value, option: this.option };
    }
}

/**
 * Include filters on the same key are OR'd together (level = ERROR or WARN),
 * different keys and every exclude are AND'd.
 */
export function applyFilters(entry: LogEntry, filters: readonly Filter[]): boolean {
    let includes: Map<string, boolean> | null = null;

    for (const filter of filters) {
        if (filter.option === 'exclude') {
            if (filter.matches(entry)) return false;
            continue;
        }
        includes ??= new Map();
        includes.set(filter.key, (includes.get(filter.key) ?? false) || filter.matches(entry));
    }

    if (includes) {
        for (const hit of includes.values()) {
            if (!hit) return false;
        }
    }
    return true;
}

export enum FilterActionKind {
    ADD = "ADD",
    DELETE = "DELETE",
    CLEAR = "CLEAR",
}

export type FilterAction =
    | { type: FilterActionKind.ADD; filter: Filter }
    | { type: FilterActionKind.DELETE; filter: Filter }
    | { type: FilterActionKind.CLEAR };

export function filterReducer(currentFilters: Filter[], action: FilterAction): Filter[] {
    switch (action.type) {
        case FilterActionKind.ADD: {
            const filter = action.filter;
            const sameTarget = (f: Filter) => f.key === filter.key && f.value === filter.value;
            if (currentFilters.some(f => sameTarget(f) && f.option === filter.option)) return currentFilters;
            return [...currentFilters.filter(f => !sameTarget(f)), filter];
        }
        case FilterActionKind.DELETE: {
            return currentFilters.filter(f => f !== action.filter);
        }
        case FilterActionKind.CLEAR: {
            return currentFilters.length === 0 ? currentFilters : [];
        }
        default:
            return currentFilters;
    }
}
