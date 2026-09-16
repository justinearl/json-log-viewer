import { LogEntry } from "./customTypes";

export type WhereOp = 'eq' | 'neq' | 'in' | 'nin';

export interface WhereClause {
    field: string;
    op: WhereOp;
    values: string[];
}

export interface SearchQuery {
    field: string | null;
    term: string;
}

export interface ParsedQuery {
    /** The leading stage: free text, or `field:value` for a single-field match. */
    search: SearchQuery;
    where: WhereClause[];
    sortField: string | null;
    sortAscending: boolean;
    errors: string[];
}

const FIELD = String.raw`[\w@.\-]+`;
const RE_NOT_IN = new RegExp(String.raw`^(${FIELD})\s+not\s+in\s*\[(.*)\]$`, 'i');
const RE_IN = new RegExp(String.raw`^(${FIELD})\s+in\s*\[(.*)\]$`, 'i');
const RE_NEQ = new RegExp(String.raw`^(${FIELD})\s*!=\s*(.+)$`);
const RE_EQ = new RegExp(String.raw`^(${FIELD})\s*=\s*(.+)$`);
const RE_SORT = new RegExp(String.raw`^(${FIELD})(?:\s+(asc|desc))?$`, 'i');

function unquote(raw: string): string {
    const value = raw.trim();
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}

function parseList(body: string): string[] {
    return body
        .split(',')
        .map(unquote)
        .filter(value => value.length > 0);
}

export function parseSearch(query: string): SearchQuery {
    const idx = query.indexOf(':');
    if (idx > 0 && idx < query.length - 1) {
        return { field: query.slice(0, idx).trim(), term: query.slice(idx + 1).trim().toLowerCase() };
    }
    return { field: null, term: query.trim().toLowerCase() };
}

function parseWhere(body: string): WhereClause | string {
    let match = RE_NOT_IN.exec(body);
    if (match) return { field: match[1], op: 'nin', values: parseList(match[2]) };

    match = RE_IN.exec(body);
    if (match) return { field: match[1], op: 'in', values: parseList(match[2]) };

    match = RE_NEQ.exec(body);
    if (match) return { field: match[1], op: 'neq', values: [unquote(match[2])] };

    match = RE_EQ.exec(body);
    if (match) return { field: match[1], op: 'eq', values: [unquote(match[2])] };

    return `Cannot read filter: "${body}"`;
}

/**
 * Parses the pipeline query bar: a search stage, then any number of
 * `| where <field> <op> <value>` and `| sort <field> [asc|desc]` stages.
 */
export function parseQuery(raw: string): ParsedQuery {
    const stages = raw.split('|');
    const result: ParsedQuery = {
        search: parseSearch(stages[0] ?? ''),
        where: [],
        sortField: null,
        sortAscending: true,
        errors: [],
    };

    for (const stage of stages.slice(1)) {
        const trimmed = stage.trim();
        if (!trimmed) continue;

        const spaceIdx = trimmed.search(/\s/);
        const verb = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
        const body = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();

        if (verb === 'where') {
            const clause = parseWhere(body);
            if (typeof clause === 'string') result.errors.push(clause);
            else result.where.push(clause);
        } else if (verb === 'sort') {
            const match = RE_SORT.exec(body);
            if (match) {
                result.sortField = match[1];
                result.sortAscending = (match[2] ?? 'asc').toLowerCase() !== 'desc';
            } else {
                result.errors.push(`Cannot read sort: "${body}"`);
            }
        } else {
            result.errors.push(`Unknown stage "${verb}" — expected where or sort`);
        }
    }

    return result;
}

export function matchesSearch(entry: LogEntry, query: SearchQuery): boolean {
    if (!query.term) return true;
    if (query.field) {
        const value = entry[query.field];
        return value !== undefined && String(value).toLowerCase().includes(query.term);
    }
    return Object.values(entry).some(value => String(value).toLowerCase().includes(query.term));
}

export function matchesWhere(entry: LogEntry, clauses: WhereClause[]): boolean {
    return clauses.every(clause => {
        const value = entry[clause.field];
        const text = value === undefined || value === null ? '' : String(value);
        const hit = clause.values.some(candidate => candidate === text);
        return clause.op === 'neq' || clause.op === 'nin' ? !hit : hit;
    });
}
