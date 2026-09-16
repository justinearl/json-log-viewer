import { buildHistogram, chooseInterval, describeInterval, NICE_INTERVALS } from './histogram';

const entries = [
    { '@timestamp': '2026-09-16T14:00:00.000Z', level: 'INFO' },
    { '@timestamp': '2026-09-16T14:00:30.000Z', level: 'WARN' },
    { '@timestamp': '2026-09-16T14:01:00.000Z', level: 'ERROR' },
    { '@timestamp': '2026-09-16T14:01:30.000Z', level: 'FATAL' },
];

describe('chooseInterval', () => {
    it('always returns a nice interval', () => {
        for (const span of [0, 900, 15_000, 900_000, 86_400_000, 900_000_000]) {
            expect(NICE_INTERVALS).toContain(chooseInterval(span, 18));
        }
    });

    it('picks a width that keeps the span near the target bucket count', () => {
        // 15 minutes over 18 buckets wants ~50s, so the next nice width up is 1 minute.
        expect(chooseInterval(15 * 60_000, 18)).toBe(60_000);
    });

    it('never returns a width smaller than the ideal', () => {
        const span = 7 * 60_000;
        expect(chooseInterval(span, 18)).toBeGreaterThanOrEqual(span / 18);
    });

    it('clamps to the largest width for enormous spans', () => {
        expect(chooseInterval(10 * 365 * 86_400_000, 18)).toBe(NICE_INTERVALS[NICE_INTERVALS.length - 1]);
    });
});

describe('buildHistogram', () => {
    it('returns null without a timestamp key', () => {
        expect(buildHistogram(entries, null, 'level')).toBeNull();
    });

    it('returns null with no entries', () => {
        expect(buildHistogram([], '@timestamp', 'level')).toBeNull();
    });

    it('returns null when no value parses as a date', () => {
        expect(buildHistogram([{ '@timestamp': 'not-a-date' }], '@timestamp', 'level')).toBeNull();
    });

    it('uses a nice interval and aligns buckets to it', () => {
        const hist = buildHistogram(entries, '@timestamp', 'level')!;
        expect(NICE_INTERVALS).toContain(hist.interval);
        expect(hist.start % hist.interval).toBe(0);
    });

    it('covers the first and last entry', () => {
        const hist = buildHistogram(entries, '@timestamp', 'level')!;
        expect(hist.start).toBeLessThanOrEqual(Date.parse('2026-09-16T14:00:00.000Z'));
        expect(hist.end).toBeGreaterThan(Date.parse('2026-09-16T14:01:30.000Z'));
    });

    it('counts every entry exactly once', () => {
        const hist = buildHistogram(entries, '@timestamp', 'level')!;
        expect(hist.buckets.reduce((sum, b) => sum + b.total, 0)).toBe(4);
    });

    it('bands fatal with error and warning with warn', () => {
        const hist = buildHistogram(entries, '@timestamp', 'level', 1)!;
        const banded = hist.buckets.reduce(
            (acc, b) => ({ error: acc.error + b.error, warn: acc.warn + b.warn, other: acc.other + b.other }),
            { error: 0, warn: 0, other: 0 }
        );
        expect(banded).toEqual({ error: 2, warn: 1, other: 1 });
    });

    it('keeps band counts consistent with totals', () => {
        const hist = buildHistogram(entries, '@timestamp', 'level')!;
        for (const bucket of hist.buckets) {
            expect(bucket.error + bucket.warn + bucket.other).toBe(bucket.total);
        }
    });

    it('treats everything as other with no level key', () => {
        const hist = buildHistogram(entries, '@timestamp', null)!;
        expect(hist.buckets.reduce((sum, b) => sum + b.other, 0)).toBe(4);
    });

    it('handles every entry sharing one timestamp', () => {
        const same = [{ '@timestamp': '2026-09-16T14:00:00.000Z', level: 'INFO' }];
        const hist = buildHistogram(same, '@timestamp', 'level')!;
        expect(hist.buckets).toHaveLength(1);
        expect(hist.buckets[0].total).toBe(1);
    });

    it('skips unparseable entries without dropping the rest', () => {
        const mixed = [...entries, { '@timestamp': 'nope', level: 'ERROR' }];
        const hist = buildHistogram(mixed, '@timestamp', 'level')!;
        expect(hist.buckets.reduce((sum, b) => sum + b.total, 0)).toBe(4);
    });
});

describe('describeInterval', () => {
    it('scales the unit to the width', () => {
        expect(describeInterval(500)).toBe('500-millisecond');
        expect(describeInterval(30_000)).toBe('30-second');
        expect(describeInterval(300_000)).toBe('5-minute');
        expect(describeInterval(10_800_000)).toBe('3-hour');
        expect(describeInterval(604_800_000)).toBe('7-day');
    });
});
