import { applyFilters, Filter, FilterActionKind, filterReducer } from './filter';

describe('Filter.matches', () => {
    it('compares values as cell text', () => {
        expect(new Filter('code', '200', 'include').matches({ code: 200 })).toBe(true);
        expect(new Filter('level', 'error').matches({ level: 'info' })).toBe(false);
    });

    it('matches missing values against the dash placeholder', () => {
        expect(new Filter('missing', '-').matches({ other: 'data' })).toBe(true);
        expect(new Filter('missing', 'value').matches({ other: 'data' })).toBe(false);
    });

    it('round-trips through its plain form', () => {
        const filter = new Filter('level', 'error', 'include');
        expect(Filter.from(JSON.parse(JSON.stringify(filter)))).toEqual(filter);
    });
});

describe('applyFilters', () => {
    const error = { level: 'error', host: 'a' };
    const warn = { level: 'warn', host: 'b' };
    const info = { level: 'info', host: 'a' };

    it('passes everything with no filters', () => {
        expect(applyFilters(error, [])).toBe(true);
    });

    it('drops entries hit by an exclude', () => {
        const filters = [new Filter('level', 'error', 'exclude')];
        expect(applyFilters(error, filters)).toBe(false);
        expect(applyFilters(warn, filters)).toBe(true);
    });

    it('keeps only entries hit by an include', () => {
        const filters = [new Filter('level', 'error', 'include')];
        expect(applyFilters(error, filters)).toBe(true);
        expect(applyFilters(warn, filters)).toBe(false);
    });

    it('ORs includes on the same key', () => {
        const filters = [new Filter('level', 'error', 'include'), new Filter('level', 'warn', 'include')];
        expect(applyFilters(error, filters)).toBe(true);
        expect(applyFilters(warn, filters)).toBe(true);
        expect(applyFilters(info, filters)).toBe(false);
    });

    it('ANDs includes on different keys', () => {
        const filters = [new Filter('level', 'error', 'include'), new Filter('host', 'b', 'include')];
        expect(applyFilters(error, filters)).toBe(false);
        expect(applyFilters({ level: 'error', host: 'b' }, filters)).toBe(true);
    });

    it('applies excludes on top of includes', () => {
        const filters = [new Filter('host', 'a', 'include'), new Filter('level', 'error', 'exclude')];
        expect(applyFilters(error, filters)).toBe(false);
        expect(applyFilters(info, filters)).toBe(true);
    });
});

describe('filterReducer', () => {
    it('adds a filter', () => {
        const result = filterReducer([], { type: FilterActionKind.ADD, filter: new Filter('level', 'error', 'exclude') });
        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('level');
    });

    it('ignores an identical filter', () => {
        const existing = [new Filter('level', 'error', 'exclude')];
        const result = filterReducer(existing, { type: FilterActionKind.ADD, filter: new Filter('level', 'error', 'exclude') });
        expect(result).toBe(existing);
    });

    it('deletes a filter', () => {
        const filter = new Filter('level', 'error', 'exclude');
        expect(filterReducer([filter], { type: FilterActionKind.DELETE, filter })).toHaveLength(0);
    });

    it('replaces the opposite filter on the same key and value', () => {
        const result = filterReducer([new Filter('level', 'error', 'exclude')], {
            type: FilterActionKind.ADD,
            filter: new Filter('level', 'error', 'include'),
        });
        expect(result).toHaveLength(1);
        expect(result[0].option).toBe('include');
    });

    it('keeps unrelated filters when adding', () => {
        const result = filterReducer([new Filter('host', 'server1', 'include')], {
            type: FilterActionKind.ADD,
            filter: new Filter('level', 'error', 'exclude'),
        });
        expect(result).toHaveLength(2);
    });

    it('clears every filter', () => {
        const result = filterReducer([new Filter('a', '1'), new Filter('b', '2')], { type: FilterActionKind.CLEAR });
        expect(result).toEqual([]);
    });
});
