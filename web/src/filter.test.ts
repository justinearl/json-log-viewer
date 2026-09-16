import { Filter, FilterActionKind, filterReducer } from './filter';

describe('Filter.isValid', () => {
    it('excludes matching entries', () => {
        const filter = new Filter('level', 'error', 'exclude');
        expect(filter.isValid({ level: 'error' })).toBe(false);
        expect(filter.isValid({ level: 'info' })).toBe(true);
    });

    it('includes only matching entries', () => {
        const filter = new Filter('level', 'info', 'include');
        expect(filter.isValid({ level: 'info' })).toBe(true);
        expect(filter.isValid({ level: 'error' })).toBe(false);
    });

    it('handles missing keys by converting undefined to string', () => {
        const filter = new Filter('missing', 'value', 'exclude');
        expect(filter.isValid({ other: 'data' })).toBe(true);
    });

    it('compares values as strings', () => {
        const filter = new Filter('code', '200', 'include');
        expect(filter.isValid({ code: 200 })).toBe(true);
    });
});

describe('filterReducer', () => {
    it('adds a filter', () => {
        const result = filterReducer([], {
            filter: new Filter('level', 'error', 'exclude'),
            type: FilterActionKind.ADD
        });
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('level');
    });

    it('deletes a filter', () => {
        const filter = new Filter('level', 'error', 'exclude');
        const result = filterReducer([filter], {
            filter: filter,
            type: FilterActionKind.DELETE
        });
        expect(result).toHaveLength(0);
    });

    it('replaces opposite filter on same key/value', () => {
        const excludeFilter = new Filter('level', 'error', 'exclude');
        const includeFilter = new Filter('level', 'error', 'include');
        const result = filterReducer([excludeFilter], {
            filter: includeFilter,
            type: FilterActionKind.ADD
        });
        expect(result).toHaveLength(1);
        expect(result[0].option).toBe('include');
    });

    it('keeps unrelated filters when adding', () => {
        const existing = new Filter('host', 'server1', 'include');
        const adding = new Filter('level', 'error', 'exclude');
        const result = filterReducer([existing], {
            filter: adding,
            type: FilterActionKind.ADD
        });
        expect(result).toHaveLength(2);
    });
});
