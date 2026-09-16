import { flattenMap } from './utils';

describe('flattenMap', () => {
    it('returns flat objects unchanged', () => {
        const input = { level: 'info', message: 'hello' };
        expect(flattenMap(input)).toEqual({ level: 'info', message: 'hello' });
    });

    it('flattens nested objects with dot notation', () => {
        const input = { host: { name: 'server1', ip: '10.0.0.1' } };
        expect(flattenMap(input)).toEqual({ 'host.name': 'server1', 'host.ip': '10.0.0.1' });
    });

    it('flattens deeply nested objects', () => {
        const input = { a: { b: { c: 'deep' } } };
        expect(flattenMap(input)).toEqual({ 'a.b.c': 'deep' });
    });

    it('preserves arrays as values', () => {
        const input = { tags: ['web', 'prod'] };
        expect(flattenMap(input)).toEqual({ tags: ['web', 'prod'] });
    });

    it('preserves null values', () => {
        const input = { field: null };
        expect(flattenMap(input)).toEqual({ field: null });
    });

    it('handles empty objects', () => {
        expect(flattenMap({})).toEqual({});
    });

    it('handles numeric and boolean values', () => {
        const input = { count: 42, active: true };
        expect(flattenMap(input)).toEqual({ count: 42, active: true });
    });

    it('handles objects with hasOwnProperty key', () => {
        const input = { hasOwnProperty: 'value', normal: 'ok' };
        expect(flattenMap(input)).toEqual({ hasOwnProperty: 'value', normal: 'ok' });
    });
});
