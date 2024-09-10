import { LogEntry } from "./customTypes"

type FilterOption = 'exclude' | 'include'

export class Filter {
    option: FilterOption
    key: string
    value: string

    constructor(key: string, value: string, option: FilterOption = 'exclude') {
        this.key = key
        this.value = value
        this.option = option
    }

    isValid(content: LogEntry) {
        if (this.option === "exclude") {
            return content[this.key] !== this.value
        }

        if (this.option === "include") {
            return content[this.key] === this.value
        }
    }
}

export enum FilterActionKind {
    ADD = "ADD",
    DELETE = "DELETE"
}

export interface FilterAction {
    filter: Filter
    type: FilterActionKind
}

export function filterReducer(currentFilters: Filter[], action: FilterAction) {
    switch (action.type) {
        case FilterActionKind.ADD: {
            const filter = action.filter
            return [...currentFilters.filter(f => !(f.key === filter.key && f.value === filter.value && f.option !== filter.option)), filter]
        }
        case FilterActionKind.DELETE: {
            return currentFilters.filter(f => f !== action.filter)
        }
        default:
            return currentFilters
    }
}
