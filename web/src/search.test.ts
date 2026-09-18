import { matchesSearch, parseSearch } from './search';

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

