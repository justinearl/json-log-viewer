import { matchesSearch, matchesWhere, parseQuery, parseSearch } from './query';

describe('parseSearch', () => {
    it('reads a bare term', () => {
        expect(parseSearch('Timeout')).toEqual({ field: null, term: 'timeout' });
    });

    it('reads field:value', () => {
        expect(parseSearch('service.name:checkout-api')).toEqual({ field: 'service.name', term: 'checkout-api' });
    });

    it('treats a trailing colon as a bare term', () => {
        expect(parseSearch('level:')).toEqual({ field: null, term: 'level:' });
    });
});

describe('parseQuery', () => {
    it('returns the search stage when there are no pipes', () => {
        const parsed = parseQuery('timeout');
        expect(parsed.search).toEqual({ field: null, term: 'timeout' });
        expect(parsed.where).toEqual([]);
        expect(parsed.sortField).toBeNull();
        expect(parsed.errors).toEqual([]);
    });

    it('reads an in-list', () => {
        const parsed = parseQuery('| where log.level in ["ERROR", "FATAL"]');
        expect(parsed.where).toEqual([{ field: 'log.level', op: 'in', values: ['ERROR', 'FATAL'] }]);
    });

    it('reads a not-in list', () => {
        const parsed = parseQuery('| where log.level not in [DEBUG, TRACE]');
        expect(parsed.where).toEqual([{ field: 'log.level', op: 'nin', values: ['DEBUG', 'TRACE'] }]);
    });

    it('reads equality and inequality', () => {
        const parsed = parseQuery('| where service.name = checkout-api | where host.name != pod-1a55');
        expect(parsed.where).toEqual([
            { field: 'service.name', op: 'eq', values: ['checkout-api'] },
            { field: 'host.name', op: 'neq', values: ['pod-1a55'] },
        ]);
    });

    it('reads sort direction, defaulting to ascending', () => {
        expect(parseQuery('| sort @timestamp desc')).toMatchObject({ sortField: '@timestamp', sortAscending: false });
        expect(parseQuery('| sort event.duration_ms')).toMatchObject({ sortField: 'event.duration_ms', sortAscending: true });
    });

    it('combines every stage', () => {
        const parsed = parseQuery('message:timeout | where log.level in [ERROR] | sort event.duration_ms desc');
        expect(parsed.search).toEqual({ field: 'message', term: 'timeout' });
        expect(parsed.where).toHaveLength(1);
        expect(parsed.sortField).toBe('event.duration_ms');
        expect(parsed.sortAscending).toBe(false);
        expect(parsed.errors).toEqual([]);
    });

    it('reports unknown stages without throwing', () => {
        const parsed = parseQuery('| stats count by service.name');
        expect(parsed.errors).toHaveLength(1);
        expect(parsed.errors[0]).toContain('stats');
    });

    it('reports an unreadable filter body', () => {
        expect(parseQuery('| where nonsense').errors).toHaveLength(1);
    });

    it('ignores empty stages', () => {
        expect(parseQuery('timeout |  | sort level').errors).toEqual([]);
    });
});

describe('matchesSearch', () => {
    const entry = { 'log.level': 'ERROR', message: 'Payment gateway timeout' };

    it('matches anything when the term is empty', () => {
        expect(matchesSearch(entry, { field: null, term: '' })).toBe(true);
    });

    it('matches across all values', () => {
        expect(matchesSearch(entry, { field: null, term: 'gateway' })).toBe(true);
        expect(matchesSearch(entry, { field: null, term: 'absent' })).toBe(false);
    });

    it('matches a named field only', () => {
        expect(matchesSearch(entry, { field: 'log.level', term: 'err' })).toBe(true);
        expect(matchesSearch(entry, { field: 'message', term: 'err' })).toBe(false);
    });

    it('does not match a missing field', () => {
        expect(matchesSearch(entry, { field: 'nope', term: 'x' })).toBe(false);
    });
});

describe('matchesWhere', () => {
    const entry = { 'log.level': 'ERROR', 'http.status_code': 504 };

    it('passes with no clauses', () => {
        expect(matchesWhere(entry, [])).toBe(true);
    });

    it('applies in and not-in', () => {
        expect(matchesWhere(entry, [{ field: 'log.level', op: 'in', values: ['ERROR', 'FATAL'] }])).toBe(true);
        expect(matchesWhere(entry, [{ field: 'log.level', op: 'nin', values: ['ERROR'] }])).toBe(false);
    });

    it('compares numbers as text', () => {
        expect(matchesWhere(entry, [{ field: 'http.status_code', op: 'eq', values: ['504'] }])).toBe(true);
    });

    it('treats a missing field as empty', () => {
        expect(matchesWhere(entry, [{ field: 'absent', op: 'eq', values: [''] }])).toBe(true);
        expect(matchesWhere(entry, [{ field: 'absent', op: 'neq', values: ['x'] }])).toBe(true);
    });

    it('requires every clause', () => {
        expect(matchesWhere(entry, [
            { field: 'log.level', op: 'eq', values: ['ERROR'] },
            { field: 'http.status_code', op: 'eq', values: ['200'] },
        ])).toBe(false);
    });
});
