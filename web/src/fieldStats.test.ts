import { computeFieldStats, DISTINCT_CAP } from './fieldStats';

const entries = [
    { 'log.level': 'ERROR', 'service.name': 'checkout-api', 'http.status_code': 504, '@timestamp': '2026-09-16T14:22:07.113Z' },
    { 'log.level': 'ERROR', 'service.name': 'checkout-api', 'http.status_code': 504, '@timestamp': '2026-09-16T14:22:06.000Z' },
    { 'log.level': 'INFO', 'service.name': 'auth-service', 'http.status_code': 200, '@timestamp': '2026-09-16T14:22:05.000Z' },
    { 'log.level': 'WARN', 'service.name': 'auth-service', '@timestamp': '2026-09-16T14:22:04.000Z' },
];

describe('computeFieldStats', () => {
    it('counts distinct values', () => {
        const [level] = computeFieldStats(entries, ['log.level'], null);
        expect(level.distinct).toBe(3);
        expect(level.capped).toBe(false);
    });

    it('ranks top values with percentages of entries that have the field', () => {
        const [service] = computeFieldStats(entries, ['service.name'], null);
        expect(service.topValues[0]).toEqual({ value: 'checkout-api', count: 2, percent: 50 });
        expect(service.topValues).toHaveLength(2);
    });

    it('bases percentages on present values, not total entries', () => {
        const [status] = computeFieldStats(entries, ['http.status_code'], null);
        // 3 of 4 entries carry the field; 504 appears twice.
        expect(status.topValues[0]).toEqual({ value: '504', count: 2, percent: (2 / 3) * 100 });
    });

    it('detects numeric fields', () => {
        const [status] = computeFieldStats(entries, ['http.status_code'], null);
        expect(status.type).toBe('number');
    });

    it('marks the timestamp key as time', () => {
        const [stamp] = computeFieldStats(entries, ['@timestamp'], '@timestamp');
        expect(stamp.type).toBe('time');
    });

    it('does not call a mixed field numeric', () => {
        const [level] = computeFieldStats(entries, ['log.level'], null);
        expect(level.type).toBe('string');
    });

    it('caps distinct counting on high-cardinality fields', () => {
        const many = Array.from({ length: 400 }, (_, i) => ({ 'trace.id': `trace-${i}` }));
        const [trace] = computeFieldStats(many, ['trace.id'], null);
        expect(trace.distinct).toBe(DISTINCT_CAP);
        expect(trace.capped).toBe(true);
    });

    it('handles a field that is absent everywhere', () => {
        const [missing] = computeFieldStats(entries, ['nope'], null);
        expect(missing.distinct).toBe(0);
        expect(missing.topValues).toEqual([]);
        expect(missing.type).toBe('string');
    });

    it('respects the scan limit', () => {
        const many = Array.from({ length: 900 }, () => ({ level: 'INFO' }));
        const [level] = computeFieldStats(many, ['level'], null, 50);
        expect(level.topValues[0].count).toBe(50);
    });
});
