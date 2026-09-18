import { LINE, RAW } from './customTypes';
import { parseChunk } from './parse';

describe('parseChunk', () => {
    it('parses one JSON object per line and numbers them', () => {
        const chunk = parseChunk('{"a":1}\n{"a":2}\n');
        expect(chunk.entries).toHaveLength(2);
        expect(chunk.entries[0].a).toBe(1);
        expect(chunk.entries[0][LINE]).toBe(1);
        expect(chunk.entries[1][LINE]).toBe(2);
        expect(chunk.lines).toBe(2);
        expect(chunk.rawCount).toBe(0);
    });

    it('keeps plain-text lines as raw entries', () => {
        const chunk = parseChunk('{"level":"ERROR"}\n    at Foo.bar (foo.js:1)\n');
        expect(chunk.entries).toHaveLength(2);
        expect(chunk.entries[1][RAW]).toBe(true);
        expect(chunk.entries[1].message).toBe('    at Foo.bar (foo.js:1)');
        expect(chunk.entries[1][LINE]).toBe(2);
        expect(chunk.rawCount).toBe(1);
        expect(chunk.keys).toEqual(['level']);
    });

    it('treats JSON scalars and arrays as plain text', () => {
        const chunk = parseChunk('123\n[1,2]\n"str"\n');
        expect(chunk.entries.every(e => e[RAW])).toBe(true);
    });

    it('counts blank lines without emitting them', () => {
        const chunk = parseChunk('{"a":1}\n\n\n{"a":2}\n');
        expect(chunk.entries.map(e => e[LINE])).toEqual([1, 4]);
        expect(chunk.lines).toBe(4);
    });

    it('continues numbering from startLine', () => {
        const chunk = parseChunk('{"a":3}\n', 10);
        expect(chunk.entries[0][LINE]).toBe(10);
    });

    it('handles a final line without a newline', () => {
        const chunk = parseChunk('{"a":1}\n{"a":2}');
        expect(chunk.entries).toHaveLength(2);
        expect(chunk.lines).toBe(2);
    });

    it('strips a carriage return from raw lines', () => {
        const chunk = parseChunk('plain\r\n');
        expect(chunk.entries[0].message).toBe('plain');
    });

    it('flattens nested objects and collects keys', () => {
        const chunk = parseChunk('{"host":{"name":"a"}}\n{"b":1}\n');
        expect(chunk.keys).toEqual(['host.name', 'b']);
    });

    it('returns nothing for empty input', () => {
        expect(parseChunk('')).toEqual({ entries: [], keys: [], lines: 0, rawCount: 0 });
    });

    it('does not expose line or raw markers as fields', () => {
        const chunk = parseChunk('{"a":1}\nplain\n');
        expect(Object.keys(chunk.entries[0])).toEqual(['a']);
        expect(Object.keys(chunk.entries[1])).toEqual(['message']);
        expect(JSON.parse(JSON.stringify(chunk.entries[0]))).toEqual({ a: 1 });
    });
});
