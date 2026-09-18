import { detectTimestampKey, flattenMap, formatCell, formatDelta, parseTimestamp } from './utils';

describe('parseTimestamp', () => {
    it('parses ISO strings', () => {
        expect(parseTimestamp('2024-09-10T11:04:38.623Z')).toBe(Date.parse('2024-09-10T11:04:38.623Z'));
    });

    it('parses the comma-millisecond form used by Python logging', () => {
        const a = parseTimestamp('2024-09-10 11:04:38,623');
        const b = parseTimestamp('2024-09-10 11:04:39,174');
        expect(isNaN(a)).toBe(false);
        expect(b - a).toBe(551);
    });

    it('parses epoch seconds and milliseconds', () => {
        expect(parseTimestamp(1725966278)).toBe(1725966278000);
        expect(parseTimestamp(1725966278623)).toBe(1725966278623);
        expect(parseTimestamp('1725966278.5')).toBe(1725966278500);
        expect(parseTimestamp('1725966278623')).toBe(1725966278623);
    });

    it('returns NaN for anything else', () => {
        expect(parseTimestamp('not a date')).toBeNaN();
        expect(parseTimestamp(null)).toBeNaN();
        expect(parseTimestamp({})).toBeNaN();
    });
});

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

describe('formatCell', () => {
    it('shows a dash for missing values', () => {
        expect(formatCell(undefined)).toBe('-');
        expect(formatCell(null)).toBe('-');
    });

    it('passes scalars through', () => {
        expect(formatCell('x')).toBe('x');
        expect(formatCell(3)).toBe('3');
        expect(formatCell(false)).toBe('false');
    });

    it('serialises arrays and objects', () => {
        expect(formatCell([1, 2])).toBe('[1,2]');
        expect(formatCell({ a: 1 })).toBe('{"a":1}');
    });
});

describe('detectTimestampKey', () => {
    it('finds a common timestamp field', () => {
        const entries = [{ '@timestamp': '2024-09-10T11:04:38.623Z' }, { '@timestamp': '2024-09-10T11:04:39.174Z' }];
        expect(detectTimestampKey(entries)).toBe('@timestamp');
    });

    it('accepts comma-millisecond timestamps', () => {
        const entries = [{ '@timestamp': '2024-09-10 11:04:38,623' }, { '@timestamp': '2024-09-10 11:04:39,174' }];
        expect(detectTimestampKey(entries)).toBe('@timestamp');
    });

    it('ignores fields that do not parse as dates', () => {
        expect(detectTimestampKey([{ time: 'not a date' }, { time: 'nope' }])).toBeNull();
    });

    it('returns null for no entries', () => {
        expect(detectTimestampKey([])).toBeNull();
    });
});

describe('formatDelta', () => {
    it('formats sub-second gaps in milliseconds', () => {
        expect(formatDelta(12)).toBe('+12ms');
        expect(formatDelta(999)).toBe('+999ms');
    });

    it('formats seconds with decimals', () => {
        expect(formatDelta(1500)).toBe('+1.50s');
        expect(formatDelta(12_300)).toBe('+12.3s');
    });

    it('formats minutes and hours', () => {
        expect(formatDelta(3 * 60_000 + 4_000)).toBe('+3m 4s');
        expect(formatDelta(2 * 3_600_000 + 10 * 60_000)).toBe('+2h 10m');
    });

    it('formats days', () => {
        expect(formatDelta(1.5 * 86_400_000)).toBe('+1.5d');
    });

    it('keeps the sign for negative gaps', () => {
        expect(formatDelta(-250)).toBe('-250ms');
    });
});
